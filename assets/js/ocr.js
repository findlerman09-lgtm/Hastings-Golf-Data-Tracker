/* ocr.js — read a scorecard photo in the browser.
 *
 * Two jobs:
 *   1. Downscale the uploaded photo to a data URL small enough for localStorage.
 *   2. Run Tesseract.js (loaded from CDN, on demand) to pull numbers off the card
 *      and guess a sequence of 9 or 18 hole scores to pre-fill the form.
 *
 * OCR of hand-marked scorecards is imperfect by nature, so results are always
 * presented as an editable suggestion — never trusted blindly. */

(function (global) {
  "use strict";

  const TESSERACT_CDN =
    "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js";
  let tesseractPromise = null;

  function loadTesseract() {
    if (global.Tesseract) return Promise.resolve(global.Tesseract);
    if (tesseractPromise) return tesseractPromise;
    tesseractPromise = new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = TESSERACT_CDN;
      s.onload = function () {
        if (global.Tesseract) resolve(global.Tesseract);
        else reject(new Error("Tesseract failed to initialize"));
      };
      s.onerror = function () {
        reject(new Error("Could not load OCR library (offline or CDN blocked)"));
      };
      document.head.appendChild(s);
    });
    return tesseractPromise;
  }

  // Read a File into a downscaled JPEG data URL (max dimension ~1400px).
  function fileToScaledDataURL(file, maxDim) {
    maxDim = maxDim || 1400;
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const img = new Image();
        img.onload = function () {
          let { width, height } = img;
          const scale = Math.min(1, maxDim / Math.max(width, height));
          width = Math.round(width * scale);
          height = Math.round(height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.72));
        };
        img.onerror = function () { reject(new Error("Invalid image file")); };
        img.src = reader.result;
      };
      reader.onerror = function () { reject(new Error("Could not read file")); };
      reader.readAsDataURL(file);
    });
  }

  // Extract candidate hole scores from raw OCR text.
  // Strategy: collect all integers 1–15 (plausible hole scores) preserving order,
  // then try to find a run of exactly 18 or 9. Fall back to first N numbers.
  function parseScores(rawText, expectedHoles) {
    const tokens = (rawText.match(/\d{1,2}/g) || [])
      .map(Number)
      .filter(function (n) { return n >= 1 && n <= 15; });

    const result = { holes: expectedHoles, scores: [], confidence: "low", raw: rawText.trim(), tokens: tokens };
    if (!tokens.length) return result;

    if (tokens.length >= expectedHoles) {
      // Prefer a slice whose sum is a realistic total for the hole count.
      const target = expectedHoles === 9 ? 45 : 90; // ~par-ish center
      let bestSlice = tokens.slice(0, expectedHoles);
      let bestScore = Infinity;
      for (var i = 0; i + expectedHoles <= tokens.length; i++) {
        var slice = tokens.slice(i, i + expectedHoles);
        var s = slice.reduce(function (a, b) { return a + b; }, 0);
        var dist = Math.abs(s - target);
        if (dist < bestScore) { bestScore = dist; bestSlice = slice; }
      }
      result.scores = bestSlice;
      result.confidence = bestScore <= (expectedHoles === 9 ? 12 : 24) ? "medium" : "low";
    } else {
      result.scores = tokens.slice(0, expectedHoles);
    }
    return result;
  }

  // Full pipeline: run OCR on a data URL and return parsed scores.
  function recognize(dataURL, expectedHoles, onProgress) {
    return loadTesseract().then(function (Tesseract) {
      return Tesseract.recognize(dataURL, "eng", {
        logger: function (m) {
          if (onProgress && m.status === "recognizing text") {
            onProgress(Math.round(m.progress * 100));
          }
        },
        tessedit_char_whitelist: "0123456789 ",
      }).then(function (out) {
        return parseScores(out.data.text, expectedHoles);
      });
    });
  }

  global.OCR = {
    fileToScaledDataURL: fileToScaledDataURL,
    parseScores: parseScores,
    recognize: recognize,
  };
})(typeof window !== "undefined" ? window : this);
