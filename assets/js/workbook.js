/* workbook.js — export a single event as a spreadsheet workbook.
 *
 * Primary path: a real multi-sheet .xlsx via SheetJS, loaded on demand from a
 * CDN (only when the coach actually exports). If that can't load (offline / CDN
 * blocked), it falls back to a .csv bundle so the export never hard-fails. */

(function (global) {
  "use strict";

  const XLSX_CDN = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
  let xlsxPromise = null;

  function loadXLSX() {
    if (global.XLSX) return Promise.resolve(global.XLSX);
    if (xlsxPromise) return xlsxPromise;
    xlsxPromise = new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = XLSX_CDN;
      s.onload = function () { global.XLSX ? resolve(global.XLSX) : reject(new Error("XLSX init failed")); };
      s.onerror = function () { reject(new Error("Could not load spreadsheet library")); };
      document.head.appendChild(s);
    });
    return xlsxPromise;
  }

  function safeName(s) {
    return String(s || "event").replace(/[^a-z0-9\-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "event";
  }
  function toParStr(tp) {
    return tp == null || isNaN(tp) ? "" : tp === 0 ? "E" : tp > 0 ? "+" + tp : String(tp);
  }
  function pct(hit, poss) { return poss ? Math.round((hit / poss) * 100) + "%" : ""; }

  // Build the array-of-arrays for each sheet from an event + its rounds.
  function buildSheets(state, event) {
    const standings = Stats.eventStandings(state, event.id);
    const rounds = state.rounds.filter(function (r) { return r.eventId === event.id; });

    // Event sheet
    const eventAOA = [
      ["Event", event.name],
      ["Date", event.date],
      ["Start time", event.startTime || ""],
      ["Course", event.course || ""],
      ["Location", event.location || ""],
      ["Notes", event.notes || ""],
      ["Players", standings.length],
    ];

    // Leaderboard sheet
    const lbAOA = [["Rank", "Player", "Squad", "Total", "To Par", "Fairways", "Putts", "GIR"]];
    standings.forEach(function (row, i) {
      const r = row.round;
      let fwHit = 0, fwPoss = 0, girHit = 0, girPoss = 0, putts = 0, hasP = false;
      (r.fairways || []).forEach(function (v) { if (v === true) { fwHit++; fwPoss++; } else if (v === false) fwPoss++; });
      (r.girs || []).forEach(function (v) { if (v !== null) { girPoss++; if (v) girHit++; } });
      (r.putts || []).forEach(function (v) { if (v != null) { putts += Number(v) || 0; hasP = true; } });
      lbAOA.push([
        i + 1, row.player.name, row.player.squad || "", row.total, toParStr(row.toPar),
        fwPoss ? pct(fwHit, fwPoss) : "", hasP ? putts : "", girPoss ? pct(girHit, girPoss) : "",
      ]);
    });

    // Hole-by-hole sheet
    const header = ["Hole"];
    for (var h = 1; h <= 18; h++) header.push(h);
    header.push("Out", "In", "Tot", "+/-");
    const hbh = [header];
    // Course reference rows (yardage, stroke index) + par. Pull each from whatever
    // round in the event actually recorded it (may be a 9-hole card).
    const parRef = (rounds.find(function (r) { return r.holes === 18; }) || {}).pars || Store.standardPars(18);
    const ydsRef = rounds.find(function (r) { return r.yards && r.yards.some(function (v) { return v != null; }); });
    const siRef = rounds.find(function (r) { return r.si && r.si.some(function (v) { return v != null; }); });
    if (ydsRef) hbh.push(refRow("Yards", ydsRef.yards, true));
    if (siRef) hbh.push(refRow("SI", siRef.si, false));
    hbh.push(rowWithTotals("Par", parRef, parRef));

    standings.forEach(function (row) {
      const r = row.round;
      const scores = r.holes === 18 ? r.scores : r.scores.concat(new Array(18 - r.holes).fill(""));
      const pars = r.holes === 18 ? r.pars : parRef;
      hbh.push(rowWithTotals(row.player.name, scores, pars));
    });

    return { Event: eventAOA, Leaderboard: lbAOA, "Hole-by-Hole": hbh };
  }

  // A reference row (yardage / stroke index): 18 values + optional Out/In/Tot sum.
  function refRow(label, arr, withSum) {
    const row = [label];
    let out = 0, inn = 0;
    for (var i = 0; i < 18; i++) {
      const v = arr[i];
      row.push(v == null ? "" : v);
      if (withSum && typeof v === "number") { if (i < 9) out += v; else inn += v; }
    }
    if (withSum) row.push(out || "", inn || "", (out + inn) || "", "");
    else row.push("", "", "", "");
    return row;
  }

  function rowWithTotals(label, arr, pars) {
    const row = [label];
    let out = 0, inn = 0;
    for (var i = 0; i < 18; i++) {
      const v = arr[i];
      row.push(v === null || v === undefined ? "" : v);
      if (typeof v === "number") { if (i < 9) out += v; else inn += v; }
    }
    const tot = out + inn;
    const parTot = pars.reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
    row.push(out || "", inn || "", tot || "", tot && parTot ? toParStr(tot - parTot) : "");
    return row;
  }

  function exportEvent(state, event) {
    const sheets = buildSheets(state, event);
    const base = "hastings-" + safeName(event.name) + "-" + (event.date || "");
    return loadXLSX().then(function (XLSX) {
      const wb = XLSX.utils.book_new();
      Object.keys(sheets).forEach(function (name) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets[name]), name);
      });
      XLSX.writeFile(wb, base + ".xlsx");
      return { format: "xlsx" };
    }).catch(function () {
      // CSV fallback: concatenate the sheets into one readable file.
      let csv = "";
      Object.keys(sheets).forEach(function (name) {
        csv += "# " + name + "\n";
        sheets[name].forEach(function (r) {
          csv += r.map(function (c) {
            const s = String(c == null ? "" : c);
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
          }).join(",") + "\n";
        });
        csv += "\n";
      });
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = base + ".csv";
      document.body.appendChild(a); a.click();
      setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 100);
      return { format: "csv" };
    });
  }

  global.Workbook = { exportEvent: exportEvent, buildSheets: buildSheets };
})(typeof window !== "undefined" ? window : this);
