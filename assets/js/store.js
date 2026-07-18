/* store.js — data model, persistence, import/export for the Hastings Golf Data Tracker.
 * Pure client-side. State lives in localStorage so the app works on free GitHub Pages
 * with no backend. Export produces a data.json the coach can commit for the public view. */

(function (global) {
  "use strict";

  const STORAGE_KEY = "hastings-golf-tracker";
  const SCHEMA_VERSION = 2;

  const STANDARD_PARS_18 = [4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5];
  const STANDARD_PARS_9 = STANDARD_PARS_18.slice(0, 9);

  function uid() {
    return (
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
    );
  }

  function defaultState() {
    return {
      version: SCHEMA_VERSION,
      team: { name: "Hastings Golf", season: "", coach: "" },
      players: [],
      rounds: [],
      updatedAt: new Date().toISOString(),
    };
  }

  function standardPars(holes) {
    return holes === 9 ? STANDARD_PARS_9.slice() : STANDARD_PARS_18.slice();
  }

  // --- Persistence -----------------------------------------------------------

  function load() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return migrate(parsed);
    } catch (err) {
      console.warn("Failed to load state, starting fresh:", err);
      return defaultState();
    }
  }

  function save(state) {
    state.updatedAt = new Date().toISOString();
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.error("Save failed (storage full?):", err);
      return false;
    }
  }

  function migrate(state) {
    if (!state || typeof state !== "object") return defaultState();
    if (!Array.isArray(state.players)) state.players = [];
    if (!Array.isArray(state.rounds)) state.rounds = [];
    if (!state.team) state.team = { name: "Hastings Golf", season: "", coach: "" };
    state.rounds.forEach(function (r) {
      if (typeof r.holes !== "number") r.holes = r.scores ? r.scores.length : 18;
      if (!Array.isArray(r.pars)) r.pars = standardPars(r.holes || 18);
      if (!Array.isArray(r.fairways)) r.fairways = new Array(r.holes).fill(null);
      if (!Array.isArray(r.putts)) r.putts = new Array(r.holes).fill(null);
      if (!Array.isArray(r.girs)) r.girs = new Array(r.holes).fill(null);
      if (!Array.isArray(r.yards)) r.yards = new Array(r.holes).fill(null);
      if (r.courseRating === undefined) r.courseRating = null;
      if (r.slopeRating === undefined) r.slopeRating = null;
      if (!r.stats) r.stats = null;
    });
    state.version = SCHEMA_VERSION;
    return state;
  }

  // --- Mutations -------------------------------------------------------------

  function addPlayer(state, data) {
    const player = {
      id: uid(),
      name: (data.name || "New Player").trim(),
      classYear: data.classYear || "",
      squad: data.squad || "Varsity",
      notes: data.notes || "",
      createdAt: new Date().toISOString(),
    };
    state.players.push(player);
    return player;
  }

  function updatePlayer(state, id, data) {
    const p = state.players.find(function (x) { return x.id === id; });
    if (!p) return null;
    Object.assign(p, data);
    return p;
  }

  function deletePlayer(state, id) {
    state.players = state.players.filter(function (p) { return p.id !== id; });
    state.rounds = state.rounds.filter(function (r) { return r.playerId !== id; });
  }

  function addRound(state, data) {
    const holes = data.holes === 9 ? 9 : 18;
    const round = {
      id: uid(),
      playerId: data.playerId,
      date: data.date || new Date().toISOString().slice(0, 10),
      course: (data.course || "").trim(),
      tee: data.tee || "",
      holes: holes,
      pars: normalizeArray(data.pars, holes, standardPars(holes)),
      scores: normalizeArray(data.scores, holes, null),
      // Per-hole detail (matches a real scorecard). null = not tracked / N/A.
      fairways: normalizeBoolArray(data.fairways, holes),
      putts: normalizeArray(data.putts, holes, null),
      girs: normalizeBoolArray(data.girs, holes),
      yards: data.yards ? normalizeArray(data.yards, holes, null) : new Array(holes).fill(null),
      courseRating: numOrNull(data.courseRating),
      slopeRating: numOrNull(data.slopeRating),
      stats: data.stats || null,
      photo: data.photo || null,
      notes: data.notes || "",
      createdAt: new Date().toISOString(),
    };
    state.rounds.push(round);
    return round;
  }

  function updateRound(state, id, data) {
    const r = state.rounds.find(function (x) { return x.id === id; });
    if (!r) return null;
    if (data.holes && data.holes !== r.holes) {
      r.holes = data.holes === 9 ? 9 : 18;
      r.pars = normalizeArray(r.pars, r.holes, standardPars(r.holes));
      r.scores = normalizeArray(r.scores, r.holes, null);
      r.fairways = normalizeBoolArray(r.fairways, r.holes);
      r.putts = normalizeArray(r.putts, r.holes, null);
      r.girs = normalizeBoolArray(r.girs, r.holes);
      r.yards = normalizeArray(r.yards, r.holes, null);
    }
    ["date", "course", "tee", "notes", "photo", "stats"].forEach(function (k) {
      if (k in data) r[k] = data[k];
    });
    if ("courseRating" in data) r.courseRating = numOrNull(data.courseRating);
    if ("slopeRating" in data) r.slopeRating = numOrNull(data.slopeRating);
    if (data.pars) r.pars = normalizeArray(data.pars, r.holes, r.pars);
    if (data.scores) r.scores = normalizeArray(data.scores, r.holes, r.scores);
    if (data.fairways) r.fairways = normalizeBoolArray(data.fairways, r.holes);
    if (data.putts) r.putts = normalizeArray(data.putts, r.holes, null);
    if (data.girs) r.girs = normalizeBoolArray(data.girs, r.holes);
    if (data.yards) r.yards = normalizeArray(data.yards, r.holes, null);
    return r;
  }

  function numOrNull(v) {
    return v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v);
  }

  // Normalize an array of fairway/GIR flags to true / false / null (untracked or N/A).
  function normalizeBoolArray(arr, len) {
    const out = new Array(len).fill(null);
    if (Array.isArray(arr)) {
      for (var i = 0; i < len; i++) {
        var v = arr[i];
        if (v === true || v === "Y" || v === "y" || v === 1) out[i] = true;
        else if (v === false || v === "N" || v === "n" || v === 0) out[i] = false;
        else out[i] = null;
      }
    }
    return out;
  }

  function deleteRound(state, id) {
    state.rounds = state.rounds.filter(function (r) { return r.id !== id; });
  }

  function normalizeArray(arr, len, fallback) {
    const out = new Array(len).fill(null);
    if (Array.isArray(arr)) {
      for (var i = 0; i < len; i++) {
        var v = arr[i];
        out[i] = v === null || v === undefined || v === "" ? (fallback ? fallback[i] : null) : Number(v);
      }
    } else if (fallback) {
      return fallback.slice(0, len);
    }
    return out;
  }

  // --- Import / Export -------------------------------------------------------

  // Full export: everything, including scorecard photos (can be large).
  function exportFull(state) {
    return JSON.stringify(state, null, 2);
  }

  // Publish export: strips photos so the committed data.json stays small and the
  // public page loads fast. Stats and scores are preserved.
  function exportPublish(state) {
    const clone = JSON.parse(JSON.stringify(state));
    clone.rounds.forEach(function (r) { r.photo = null; });
    clone.exportedForPublicView = true;
    return JSON.stringify(clone, null, 2);
  }

  function importState(json) {
    const parsed = typeof json === "string" ? JSON.parse(json) : json;
    return migrate(parsed);
  }

  function mergeState(current, incoming) {
    const merged = migrate(JSON.parse(JSON.stringify(current)));
    const inc = migrate(incoming);
    const playerIds = new Set(merged.players.map(function (p) { return p.id; }));
    inc.players.forEach(function (p) {
      if (!playerIds.has(p.id)) merged.players.push(p);
    });
    const roundIds = new Set(merged.rounds.map(function (r) { return r.id; }));
    inc.rounds.forEach(function (r) {
      if (!roundIds.has(r.id)) merged.rounds.push(r);
    });
    return merged;
  }

  global.Store = {
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    uid: uid,
    defaultState: defaultState,
    standardPars: standardPars,
    load: load,
    save: save,
    migrate: migrate,
    addPlayer: addPlayer,
    updatePlayer: updatePlayer,
    deletePlayer: deletePlayer,
    addRound: addRound,
    updateRound: updateRound,
    deleteRound: deleteRound,
    exportFull: exportFull,
    exportPublish: exportPublish,
    importState: importState,
    mergeState: mergeState,
  };
})(typeof window !== "undefined" ? window : this);
