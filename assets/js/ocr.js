/* ocr.js — read a scorecard photo in the browser.
 *
 *   1. Downscale the uploaded photo to a data URL small enough for localStorage.
 *   2. Run Tesseract.js (from CDN, on demand) to read the card, then reconstruct
 *      the table by word position and classify each row (yardage, stroke index,
 *      par, score, fairways, putts, GIR, pace) so the whole card is captured.
 *
 * OCR of scorecards is imperfect, so results are always an editable suggestion
 * the coach reviews — never trusted blindly. */

(function (global) {
  "use strict";

  const TESSERACT_CDN =
    "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js";
  // Chars we expect in scorecard cells: digits, Y/N/E flags, dash, colon, percent.
  const WHITELIST = "0123456789YNE:-%. ";
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

  // Pixel transform for OCR: erase red annotations (scorecard apps circle
  // scores and draw a red side bar in red, which corrupt those digits once
  // grayscaled), then grayscale + contrast-stretch the rest. Mutates in place.
  function transformPixels(d) {
    const contrast = 1.7, intercept = 128 * (1 - contrast);
    for (var i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], bb = d[i + 2];
      let g;
      if (r > 110 && r - gg > 40 && r - bb > 40) {
        g = 255; // reddish pixel — wipe it to white so the black digit survives
      } else {
        g = 0.299 * r + 0.587 * gg + 0.114 * bb;
        g = g * contrast + intercept;
        g = g < 0 ? 0 : g > 255 ? 255 : g;
      }
      d[i] = d[i + 1] = d[i + 2] = g;
    }
  }

  // Erase red annotations, grayscale, contrast-stretch (and mildly upscale) to
  // help Tesseract read a dense app screenshot. Returns a PNG data URL for OCR
  // only — the stored photo stays the original color version.
  function preprocessForOCR(dataURL, maxDim) {
    maxDim = maxDim || 2000;
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () {
        try {
          let { width, height } = img;
          const scale = Math.min(2.2, maxDim / Math.max(width, height)); // allow upscaling small shots
          width = Math.round(width * scale);
          height = Math.round(height * scale);
          const c = document.createElement("canvas");
          c.width = width; c.height = height;
          const ctx = c.getContext("2d");
          ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, width, height);
          const id = ctx.getImageData(0, 0, width, height);
          transformPixels(id.data);
          ctx.putImageData(id, 0, 0);
          resolve(c.toDataURL("image/png"));
        } catch (err) { resolve(dataURL); } // fall back to the raw image
      };
      img.onerror = function () { resolve(dataURL); };
      img.src = dataURL;
    });
  }

  function fileToScaledDataURL(file, maxDim) {
    maxDim = maxDim || 1600;
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
          resolve(canvas.toDataURL("image/jpeg", 0.75));
        };
        img.onerror = function () { reject(new Error("Invalid image file")); };
        img.src = reader.result;
      };
      reader.onerror = function () { reject(new Error("Could not read file")); };
      reader.readAsDataURL(file);
    });
  }

  // ---- Numeric helpers ------------------------------------------------------

  function toNum(t) {
    if (t == null) return null;
    const m = String(t).replace(/[^0-9-]/g, "");
    if (m === "" || m === "-") return null;
    const n = Number(m);
    return isNaN(n) ? null : n;
  }
  function median(arr) {
    if (!arr.length) return 0;
    const s = arr.slice().sort(function (a, b) { return a - b; });
    return s[Math.floor(s.length / 2)];
  }
  function isConsecutive(vals) {
    if (vals.length < 3) return false;
    for (var i = 1; i < vals.length; i++) if (vals[i] - vals[i - 1] !== 1) return false;
    return true;
  }
  function toBoolRow(tokens, holes) {
    const out = new Array(holes).fill(null);
    for (var i = 0; i < holes; i++) {
      const t = (tokens[i] || "").toUpperCase();
      if (t === "Y") out[i] = true;
      else if (t === "N") out[i] = false;
      else out[i] = null; // "-" (par 3) or blank
    }
    return out;
  }
  function padNums(nums, holes) {
    const out = new Array(holes).fill(null);
    for (var i = 0; i < holes; i++) out[i] = nums[i] == null ? null : nums[i];
    return out;
  }

  // ---- Table reconstruction -------------------------------------------------

  // Flatten a Tesseract result into word objects with position + text.
  function collectWords(data) {
    if (data.words && data.words.length) return data.words;
    const out = [];
    (data.blocks || []).forEach(function (b) {
      (b.paragraphs || []).forEach(function (p) {
        (p.lines || []).forEach(function (l) {
          (l.words || []).forEach(function (w) { out.push(w); });
        });
      });
    });
    return out;
  }

  // Group words into visual rows by vertical position; return each row as an
  // x-sorted array of token strings.
  function clusterRows(words) {
    const ws = words
      .filter(function (w) { return w.text && w.text.trim() && w.bbox; })
      .map(function (w) {
        return {
          text: w.text.trim(),
          x: (w.bbox.x0 + w.bbox.x1) / 2,
          y: (w.bbox.y0 + w.bbox.y1) / 2,
          h: Math.max(1, w.bbox.y1 - w.bbox.y0),
        };
      });
    if (!ws.length) return [];
    ws.sort(function (a, b) { return a.y - b.y; });
    const medH = median(ws.map(function (w) { return w.h; })) || 20;
    const rows = [];
    let cur = [ws[0]];
    let curY = ws[0].y;
    for (var i = 1; i < ws.length; i++) {
      if (Math.abs(ws[i].y - curY) <= medH * 0.7) {
        cur.push(ws[i]);
        curY = (curY * (cur.length - 1) + ws[i].y) / cur.length;
      } else {
        rows.push(cur); cur = [ws[i]]; curY = ws[i].y;
      }
    }
    rows.push(cur);
    return rows.map(function (r) {
      return r.sort(function (a, b) { return a.x - b.x; }).map(function (w) { return { text: w.text, x: w.x }; });
    });
  }

  function medianGap(xs) {
    const g = [];
    for (var i = 1; i < xs.length; i++) g.push(xs[i] - xs[i - 1]);
    return median(g) || 60;
  }

  // Establish the x-centre of each hole column, preferring the hole-number row.
  function holeColumns(rows, holes) {
    let centers = null;
    for (var i = 0; i < rows.length; i++) {
      const numeric = rows[i].filter(function (c) { return toNum(c.text) !== null; });
      const vals = numeric.map(function (c) { return toNum(c.text); });
      if (vals.length >= Math.min(holes, 8) && isConsecutive(vals)) {
        centers = numeric.slice(0, holes).map(function (c) { return c.x; });
        break;
      }
    }
    if (!centers) {
      let best = rows[0] || [];
      rows.forEach(function (r) { if (r.length > best.length) best = r; });
      centers = best.slice(0, holes).map(function (c) { return c.x; });
    }
    return centers;
  }

  // Snap a row's tokens onto the hole columns, dropping the left label and the
  // right-hand total column that fall outside the column band.
  function binRow(row, centers, spacing) {
    const out = new Array(centers.length).fill(null);
    centers.forEach(function (cx, i) {
      let bestTok = null, bestD = spacing * 0.6;
      row.forEach(function (c) {
        const d = Math.abs(c.x - cx);
        if (d < bestD) { bestD = d; bestTok = c.text; }
      });
      out[i] = bestTok;
    });
    return out;
  }

  // Classify ordered rows into the scorecard's categories. Rows are top-to-bottom.
  function classifyRows(rows, holes) {
    const res = { scores: null, pars: null, fairways: null, putts: null, girs: null, si: null, yards: null, pace: null };
    const centers = holeColumns(rows, holes);
    const spacing = centers.length > 1 ? medianGap(centers) : 60;
    const cols = centers.length;
    const info = rows.map(function (r) {
      const tokens = binRow(r, centers, spacing); // aligned to hole columns
      const nums = tokens.map(toNum);
      const numVals = nums.filter(function (n) { return n !== null; });
      return {
        tokens: tokens,
        nums: nums,
        numVals: numVals,
        ynCount: tokens.filter(function (t) { return t && /^[YN]$/i.test(t); }).length,
        colon: tokens.some(function (t) { return t && t.indexOf(":") >= 0; }),
        hasE: tokens.some(function (t) { return t && /^E$/i.test(t); }),
        neg: tokens.filter(function (t) { return t && /^-\d/.test(t); }).length,
      };
    });
    const used = new Array(rows.length).fill(false);
    function take(pred, assign) {
      for (var i = 0; i < info.length; i++) {
        if (!used[i] && pred(info[i])) { used[i] = true; if (assign) assign(info[i]); return i; }
      }
      return -1;
    }

    // Yardage: several values, typically 3-digit.
    take(function (x) { return x.numVals.length >= 4 && median(x.numVals) >= 100; },
      function (x) { res.yards = padNums(x.nums, holes); });
    // Pace: contains time-like tokens with colons.
    take(function (x) { return x.colon; },
      function (x) { res.pace = x.tokens.slice(0, holes); });
    // Running to-par (TOT): has "E" or several negatives — derived, so ignored.
    take(function (x) { return x.hasE || x.neg >= 3; }, null);
    // Fairways then GIR: the two Y/N rows, in top-to-bottom order.
    const ynRows = [];
    info.forEach(function (x, i) { if (!used[i] && x.ynCount >= 2) ynRows.push(i); });
    if (ynRows[0] !== undefined) { used[ynRows[0]] = true; res.fairways = toBoolRow(info[ynRows[0]].tokens, holes); }
    if (ynRows[1] !== undefined) { used[ynRows[1]] = true; res.girs = toBoolRow(info[ynRows[1]].tokens, holes); }
    // Stroke index: distinct-ish ints in 1..18 with a value > 9, not the hole row.
    take(function (x) {
      return x.numVals.length >= 5 && x.numVals.every(function (n) { return n >= 1 && n <= 18; }) &&
        x.numVals.some(function (n) { return n > 9; }) && !isConsecutive(x.numVals);
    }, function (x) { res.si = padNums(x.nums, holes); });

    // Remaining pure-number rows, top-to-bottom, are Hole / Par / Score / Putt.
    const numRows = [];
    info.forEach(function (x, i) {
      if (!used[i] && !x.colon && x.ynCount === 0 && x.numVals.length >= Math.min(5, holes)) numRows.push(i);
    });
    const seq = [];
    numRows.forEach(function (i) {
      if (isConsecutive(info[i].numVals)) used[i] = true; // hole-number row
      else seq.push(i);
    });
    if (seq[0] !== undefined) { res.pars = padNums(info[seq[0]].nums, holes); used[seq[0]] = true; }
    if (seq[1] !== undefined) { res.scores = padNums(info[seq[1]].nums, holes); used[seq[1]] = true; }
    if (seq[2] !== undefined) { res.putts = padNums(info[seq[2]].nums, holes); used[seq[2]] = true; }
    return res;
  }

  // Legacy scores-only fallback from raw text (used when no word positions).
  function parseScores(rawText, expectedHoles) {
    const tokens = (rawText.match(/\d{1,2}/g) || [])
      .map(Number)
      .filter(function (n) { return n >= 1 && n <= 15; });
    const result = { holes: expectedHoles, scores: [], confidence: "low", raw: (rawText || "").trim() };
    if (!tokens.length) return result;
    if (tokens.length >= expectedHoles) {
      const target = expectedHoles === 9 ? 45 : 90;
      let best = tokens.slice(0, expectedHoles), bestD = Infinity;
      for (var i = 0; i + expectedHoles <= tokens.length; i++) {
        var slice = tokens.slice(i, i + expectedHoles);
        var d = Math.abs(slice.reduce(function (a, b) { return a + b; }, 0) - target);
        if (d < bestD) { bestD = d; best = slice; }
      }
      result.scores = best;
      result.confidence = bestD <= (expectedHoles === 9 ? 12 : 24) ? "medium" : "low";
    } else {
      result.scores = tokens.slice(0, expectedHoles);
    }
    return result;
  }

  // Full parse: prefer positional table reconstruction; fall back to scores-only.
  function parseCard(data, expectedHoles) {
    const rows = clusterRows(collectWords(data));
    const base = { holes: expectedHoles, scores: null, pars: null, fairways: null, putts: null, girs: null, si: null, yards: null, pace: null, raw: (data.text || "").trim() };
    if (rows.length) {
      const c = classifyRows(rows, expectedHoles);
      Object.assign(base, c);
    }
    // Debug: the reconstructed rows, so the coach can see what OCR actually read.
    base.debugRows = rows.map(function (r) {
      return r.map(function (cell) { return cell.text; }).join("  ");
    });
    if (!base.scores || !base.scores.some(function (v) { return v != null; })) {
      // Positional parse didn't find a score row — fall back to the text heuristic.
      const fb = parseScores(data.text || "", expectedHoles);
      base.scores = padNums(fb.scores, expectedHoles);
    }
    const detailFields = ["pars", "fairways", "putts", "girs", "si", "yards"];
    const detailedFound = detailFields.some(function (k) {
      return base[k] && base[k].some(function (v) { return v !== null; });
    }) || (base.pace && base.pace.some(function (v) { return v; }));
    base.detailedFound = detailedFound;
    const scoreCount = (base.scores || []).filter(function (v) { return v != null; }).length;
    base.confidence = scoreCount >= expectedHoles ? (detailedFound ? "high" : "medium") : scoreCount ? "low" : "low";
    return base;
  }

  // Run OCR on a data URL and return the parsed card.
  // PSM 6 = "assume a single uniform block of text", which keeps the table's row
  // structure better than the default auto mode on a dense scorecard grid.
  function recognize(dataURL, expectedHoles, onProgress) {
    return loadTesseract().then(function (Tesseract) {
      return preprocessForOCR(dataURL).then(function (prepURL) {
        const logger = function (m) {
          if (onProgress && m.status === "recognizing text") onProgress(Math.round(m.progress * 100));
        };
        const params = {
          tessedit_char_whitelist: WHITELIST,
          tessedit_pageseg_mode: "6",
          preserve_interword_spaces: "1",
        };
        // Worker API so we reliably get word/block bounding boxes.
        if (Tesseract.createWorker) {
          return Promise.resolve(Tesseract.createWorker("eng", 1, { logger: logger })).then(function (worker) {
            return worker.setParameters(params).then(function () {
              return worker.recognize(prepURL, {}, { text: true, blocks: true });
            }).then(function (out) {
              return worker.terminate().then(function () { return parseCard(out.data, expectedHoles); });
            }).catch(function (err) {
              return worker.terminate().then(function () { throw err; });
            });
          });
        }
        // Older API fallback.
        return Tesseract.recognize(prepURL, "eng", Object.assign({ logger: logger }, params))
          .then(function (out) { return parseCard(out.data, expectedHoles); });
      });
    });
  }

  global.OCR = {
    fileToScaledDataURL: fileToScaledDataURL,
    preprocessForOCR: preprocessForOCR,
    transformPixels: transformPixels,
    parseScores: parseScores,
    parseCard: parseCard,
    clusterRows: clusterRows,
    classifyRows: classifyRows,
    recognize: recognize,
  };
})(typeof window !== "undefined" ? window : this);
