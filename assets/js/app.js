/* app.js — coach-facing application UI for the Hastings Golf Data Tracker. */

(function () {
  "use strict";

  let state = Store.load();
  let activeTab = "dashboard";
  let selectedPlayerId = null;
  let selectedEventId = null;

  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function persist() {
    if (!Store.save(state)) {
      toast("Storage full — export a backup and remove old photos.", 4000);
    }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmt(n, dec) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return Number(n).toFixed(dec == null ? 1 : dec);
  }

  function toParStr(tp) {
    if (tp === null || tp === undefined || isNaN(tp)) return "—";
    if (tp === 0) return "E";
    return tp > 0 ? "+" + tp : String(tp);
  }

  function toParClass(tp) {
    if (tp === 0) return "even";
    return tp < 0 ? "under" : "over";
  }

  // Collapsible panel showing exactly what OCR detected, for diagnosing misreads.
  function ocrDebug(parsed) {
    if (!parsed) return "";
    const rows = (parsed.debugRows && parsed.debugRows.length)
      ? parsed.debugRows.join("\n")
      : (parsed.raw || "(nothing detected)");
    return '<details style="margin-top:6px"><summary style="cursor:pointer;font-size:.8rem;color:var(--muted)">🔍 What OCR read (tap to expand)</summary>' +
      '<pre style="white-space:pre-wrap;font-size:.7rem;line-height:1.5;max-height:200px;overflow:auto;background:var(--surface-2);padding:8px;border-radius:6px;margin-top:6px">' +
      esc(rows) + '</pre></details>';
  }

  // ---- Toast --------------------------------------------------------------
  let toastTimer = null;
  function toast(msg, ms) {
    let t = $("#toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, ms || 2400);
  }

  // ---- Modal --------------------------------------------------------------
  function openModal(title, contentNode, opts) {
    opts = opts || {};
    closeModal();
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.id = "modal-backdrop";
    const modal = document.createElement("div");
    modal.className = "modal";
    if (opts.wide) modal.style.maxWidth = "860px";
    const head = document.createElement("div");
    head.className = "modal-head";
    head.innerHTML = '<h2>' + esc(title) + '</h2>';
    const close = document.createElement("button");
    close.className = "close";
    close.innerHTML = "&times;";
    close.setAttribute("aria-label", "Close");
    close.onclick = closeModal;
    head.appendChild(close);
    modal.appendChild(head);
    modal.appendChild(contentNode);
    backdrop.appendChild(modal);
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) closeModal();
    });
    document.body.appendChild(backdrop);
  }
  function closeModal() {
    const b = $("#modal-backdrop");
    if (b) b.remove();
  }

  // ---- Player name lookup -------------------------------------------------
  function playerName(id) {
    const p = state.players.find(function (x) { return x.id === id; });
    return p ? p.name : "Unknown";
  }

  // =========================================================================
  // RENDER: shell
  // =========================================================================
  function render() {
    const app = $("#app");
    app.innerHTML = "";
    if (selectedPlayerId && activeTab === "roster") {
      app.appendChild(renderPlayerDetail(selectedPlayerId));
      return;
    }
    if (selectedEventId && activeTab === "events") {
      app.appendChild(renderEventDetail(selectedEventId));
      return;
    }
    switch (activeTab) {
      case "dashboard": app.appendChild(renderDashboard()); break;
      case "events": app.appendChild(renderEvents()); break;
      case "roster": app.appendChild(renderRoster()); break;
      case "rounds": app.appendChild(renderRounds()); break;
      case "data": app.appendChild(renderData()); break;
    }
    $$(".tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.tab === activeTab);
    });
  }

  // =========================================================================
  // DASHBOARD
  // =========================================================================
  function renderDashboard() {
    const wrap = document.createElement("div");
    const ts = Stats.teamStats(state);

    if (!state.players.length) {
      wrap.innerHTML =
        '<div class="banner info">Welcome to the ' + esc(state.team.name) +
        ' tracker. Start by adding players to your roster, then log rounds — ' +
        'you can even snap a photo of a scorecard to fill it in.</div>';
      const cta = document.createElement("div");
      cta.className = "btn-row";
      cta.innerHTML =
        '<button class="btn-primary" data-go="roster">+ Add players</button>' +
        '<button data-go="rounds">Log a round</button>';
      cta.querySelectorAll("[data-go]").forEach(function (b) {
        b.onclick = function () { activeTab = b.dataset.go; render(); };
      });
      wrap.appendChild(cta);
      return wrap;
    }

    const stats = document.createElement("div");
    stats.className = "grid cols-4";
    stats.innerHTML =
      statCard(ts.activePlayers + "/" + ts.players, "Active players") +
      statCard(ts.totalRounds, "Rounds logged") +
      statCard(fmt(ts.teamScoringAvg), "Team scoring avg") +
      statCard(bestTeamRound(), "Low round (to par)");
    wrap.appendChild(stats);

    const cols = document.createElement("div");
    cols.className = "grid cols-2";
    cols.style.marginTop = "16px";

    // Leaderboard
    const lb = document.createElement("div");
    lb.className = "card";
    lb.innerHTML = '<div class="section-head"><h2>🏆 Leaderboard</h2><span class="muted">by 18-hole scoring avg</span></div>';
    if (ts.leaderboard.length) {
      const tbl = document.createElement("div");
      tbl.className = "table-wrap";
      let rows = ts.leaderboard.map(function (row, i) {
        const s = row.stats;
        return '<tr data-player="' + row.player.id + '" style="cursor:pointer">' +
          '<td class="rank ' + (i === 0 ? "top" : "") + '">' + (i + 1) + '</td>' +
          '<td>' + esc(row.player.name) + ' <span class="pill ' + (row.player.squad === "JV" ? "jv" : "") + '">' + esc(row.player.squad) + '</span></td>' +
          '<td class="num">' + fmt(s.scoringAvg18) + '</td>' +
          '<td class="num to-par ' + toParClass(Math.round(s.avgToPar18)) + '">' + (s.avgToPar18 != null ? toParStr(Math.round(s.avgToPar18)) : "—") + '</td>' +
          '<td class="num">' + s.rounds + '</td></tr>';
      }).join("");
      tbl.innerHTML = '<table><thead><tr><th>#</th><th>Player</th><th class="num">Avg</th><th class="num">To Par</th><th class="num">Rds</th></tr></thead><tbody>' + rows + '</tbody></table>';
      tbl.querySelectorAll("tr[data-player]").forEach(function (tr) {
        tr.onclick = function () { openPlayer(tr.dataset.player); };
      });
      lb.appendChild(tbl);
    } else {
      lb.innerHTML += '<p class="empty">No complete rounds yet.</p>';
    }
    cols.appendChild(lb);

    // Recent rounds
    const recent = document.createElement("div");
    recent.className = "card";
    recent.innerHTML = '<div class="section-head"><h2>⛳ Recent rounds</h2></div>';
    const rr = Stats.recentRounds(state, 8);
    if (rr.length) {
      const tw = document.createElement("div");
      tw.className = "table-wrap";
      tw.innerHTML = '<table><thead><tr><th>Date</th><th>Player</th><th>Course</th><th class="num">Score</th><th class="num">+/-</th></tr></thead><tbody>' +
        rr.map(function (r) {
          const tp = Stats.toPar(r);
          return '<tr><td>' + esc(r.date) + '</td><td>' + esc(playerName(r.playerId)) + '</td>' +
            '<td>' + esc(r.course || "—") + (r.holes === 9 ? ' <span class="muted">(9)</span>' : '') + '</td>' +
            '<td class="num">' + Stats.roundTotal(r) + '</td>' +
            '<td class="num to-par ' + toParClass(tp) + '">' + toParStr(tp) + '</td></tr>';
        }).join("") + '</tbody></table>';
      recent.appendChild(tw);
    } else {
      recent.innerHTML += '<p class="empty">No rounds logged yet.</p>';
    }
    cols.appendChild(recent);
    wrap.appendChild(cols);

    // Team trend chart
    const trend = document.createElement("div");
    trend.className = "card";
    trend.style.marginTop = "16px";
    trend.innerHTML = '<div class="section-head"><h2>📈 Team scoring trend</h2><span class="muted">avg 18-hole score by round date</span></div><div class="chart-box" id="team-trend"></div>';
    wrap.appendChild(trend);
    setTimeout(function () { drawTeamTrend($("#team-trend", wrap) || $("#team-trend")); }, 0);

    return wrap;
  }

  function bestTeamRound() {
    const complete = state.rounds.filter(Stats.isComplete);
    if (!complete.length) return "—";
    let best = Infinity;
    complete.forEach(function (r) { best = Math.min(best, Stats.toPar(r)); });
    return toParStr(best);
  }

  function drawTeamTrend(box) {
    if (!box) return;
    // Group complete rounds by date, average the 18-hole totals.
    const byDate = {};
    state.rounds.filter(Stats.isComplete).forEach(function (r) {
      (byDate[r.date] = byDate[r.date] || []).push(Stats.total18(r));
    });
    const points = Object.keys(byDate).sort().map(function (d) {
      const arr = byDate[d];
      return { label: d.slice(5), value: Math.round(arr.reduce(function (a, b) { return a + b; }, 0) / arr.length) };
    });
    Charts.lineChart(box, points, { ariaLabel: "Team scoring trend over time" });
  }

  function statCard(num, label) {
    return '<div class="card stat"><div class="num">' + esc(num) + '</div><div class="label">' + esc(label) + '</div></div>';
  }

  // =========================================================================
  // ROSTER
  // =========================================================================
  function renderRoster() {
    const wrap = document.createElement("div");
    const head = document.createElement("div");
    head.className = "section-head";
    head.innerHTML = '<h2>Roster</h2>';
    const btn = document.createElement("button");
    btn.className = "btn-primary";
    btn.textContent = "+ Add player";
    btn.onclick = function () { playerForm(); };
    head.appendChild(btn);
    wrap.appendChild(head);

    if (!state.players.length) {
      const c = document.createElement("div");
      c.className = "card";
      c.innerHTML = '<p class="empty">No players yet. Add your first team member to get started.</p>';
      wrap.appendChild(c);
      return wrap;
    }

    const grid = document.createElement("div");
    grid.className = "grid cols-2";
    state.players.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (p) {
      const s = Stats.playerStats(state, p.id);
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML =
        '<div class="section-head"><h3>' + esc(p.name) + ' <span class="pill ' + (p.squad === "JV" ? "jv" : "") + '">' + esc(p.squad) + '</span></h3>' +
        '<span class="muted">' + esc(p.classYear || "") + '</span></div>' +
        '<div class="grid cols-4" style="gap:8px">' +
        miniStat(fmt(s.scoringAvg18), "Avg (18)") +
        miniStat(s.rounds, "Rounds") +
        miniStat(s.best != null ? toParStr(s.best) : "—", "Best") +
        miniStat(s.avgToPar18 != null ? toParStr(Math.round(s.avgToPar18)) : "—", "Avg +/-") +
        '</div>';
      const row = document.createElement("div");
      row.className = "btn-row";
      row.style.marginTop = "12px";
      const view = document.createElement("button");
      view.className = "btn-sm btn-primary";
      view.textContent = "View";
      view.onclick = function () { openPlayer(p.id); };
      const edit = document.createElement("button");
      edit.className = "btn-sm";
      edit.textContent = "Edit";
      edit.onclick = function () { playerForm(p); };
      row.appendChild(view);
      row.appendChild(edit);
      card.appendChild(row);
      grid.appendChild(card);
    });
    wrap.appendChild(grid);
    return wrap;
  }

  function miniStat(num, label) {
    return '<div class="stat" style="padding:8px"><div class="num" style="font-size:1.3rem">' + esc(num) + '</div><div class="label" style="font-size:.68rem">' + esc(label) + '</div></div>';
  }

  function playerForm(player) {
    const editing = !!player;
    const p = player || { name: "", classYear: "", squad: "Varsity", notes: "" };
    const form = document.createElement("div");
    form.innerHTML =
      '<div class="field"><label>Name</label><input id="pf-name" value="' + esc(p.name) + '" placeholder="Player name"></div>' +
      '<div class="form-row">' +
      '<div class="field"><label>Class / Grad year</label><input id="pf-class" value="' + esc(p.classYear) + '" placeholder="e.g. 2026"></div>' +
      '<div class="field"><label>Squad</label><select id="pf-squad"><option' + (p.squad === "Varsity" ? " selected" : "") + '>Varsity</option><option' + (p.squad === "JV" ? " selected" : "") + '>JV</option></select></div>' +
      '</div>' +
      '<div class="field"><label>Notes</label><textarea id="pf-notes" rows="2" placeholder="Optional">' + esc(p.notes) + '</textarea></div>' +
      '<div class="btn-row" style="justify-content:space-between">' +
      (editing ? '<button class="btn-danger" id="pf-del">Delete player</button>' : '<span></span>') +
      '<div class="btn-row"><button id="pf-cancel">Cancel</button><button class="btn-primary" id="pf-save">Save</button></div></div>';

    openModal(editing ? "Edit player" : "Add player", form);
    $("#pf-cancel").onclick = closeModal;
    $("#pf-save").onclick = function () {
      const data = {
        name: $("#pf-name").value.trim() || "Unnamed",
        classYear: $("#pf-class").value.trim(),
        squad: $("#pf-squad").value,
        notes: $("#pf-notes").value.trim(),
      };
      if (editing) Store.updatePlayer(state, p.id, data);
      else Store.addPlayer(state, data);
      persist(); closeModal(); render();
      toast(editing ? "Player updated" : "Player added");
    };
    if (editing) {
      $("#pf-del").onclick = function () {
        if (confirm("Delete " + p.name + " and all their rounds? This cannot be undone.")) {
          Store.deletePlayer(state, p.id);
          persist(); closeModal();
          selectedPlayerId = null; activeTab = "roster"; render();
          toast("Player deleted");
        }
      };
    }
  }

  function openPlayer(id) {
    selectedPlayerId = id;
    activeTab = "roster";
    render();
  }

  // =========================================================================
  // PLAYER DETAIL
  // =========================================================================
  function renderPlayerDetail(id) {
    const p = state.players.find(function (x) { return x.id === id; });
    const wrap = document.createElement("div");
    if (!p) { selectedPlayerId = null; return renderRoster(); }
    const s = Stats.playerStats(state, id);

    const back = document.createElement("button");
    back.className = "btn-sm";
    back.textContent = "← Back to roster";
    back.onclick = function () { selectedPlayerId = null; render(); };
    wrap.appendChild(back);

    const head = document.createElement("div");
    head.className = "section-head";
    head.style.marginTop = "14px";
    head.innerHTML = '<h1 style="margin:0">' + esc(p.name) + ' <span class="pill ' + (p.squad === "JV" ? "jv" : "") + '">' + esc(p.squad) + '</span></h1>';
    const addBtn = document.createElement("button");
    addBtn.className = "btn-primary btn-sm";
    addBtn.textContent = "+ Log round";
    addBtn.onclick = function () { roundForm(null, id); };
    head.appendChild(addBtn);
    wrap.appendChild(head);

    const stats = document.createElement("div");
    stats.className = "grid cols-4";
    stats.style.marginTop = "8px";
    stats.innerHTML =
      statCard(fmt(s.scoringAvg18), "Scoring avg (18)") +
      statCard(s.avgToPar18 != null ? toParStr(Math.round(s.avgToPar18)) : "—", "Avg to par") +
      statCard(s.best != null ? toParStr(s.best) : "—", "Best (to par)") +
      statCard(s.handicapIndex != null ? fmt(s.handicapIndex) : "—", "Handicap index") +
      statCard(s.rounds, "Rounds played");
    wrap.appendChild(stats);

    if (s.fairwayPct != null || s.girPct != null || s.puttsAvg != null) {
      const adv = document.createElement("div");
      adv.className = "grid cols-4";
      adv.style.marginTop = "12px";
      adv.innerHTML =
        statCard(s.fairwayPct != null ? fmt(s.fairwayPct, 0) + "%" : "—", "Fairways hit") +
        statCard(s.girPct != null ? fmt(s.girPct, 0) + "%" : "—", "Greens in reg") +
        statCard(s.puttsAvg != null ? fmt(s.puttsAvg) : "—", "Putts / round") +
        statCard(s.recentTrend != null ? (s.recentTrend <= 0 ? "▼ " : "▲ ") + fmt(Math.abs(s.recentTrend)) : "—", "Recent trend");
      wrap.appendChild(adv);
    }

    // Trend chart
    const chartCard = document.createElement("div");
    chartCard.className = "card";
    chartCard.style.marginTop = "16px";
    chartCard.innerHTML = '<div class="section-head"><h2>Scoring trend</h2><span class="muted">18-hole total</span></div><div class="chart-box" id="pd-chart"></div>';
    wrap.appendChild(chartCard);

    // Rounds table
    const roundsCard = document.createElement("div");
    roundsCard.className = "card";
    roundsCard.style.marginTop = "16px";
    roundsCard.innerHTML = '<div class="section-head"><h2>Rounds</h2></div>';
    const playerRounds = state.rounds.filter(function (r) { return r.playerId === id; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    if (playerRounds.length) {
      const tw = document.createElement("div");
      tw.className = "table-wrap";
      tw.innerHTML = '<table><thead><tr><th>Date</th><th>Course</th><th class="num">Score</th><th class="num">+/-</th><th>📷</th><th></th></tr></thead><tbody>' +
        playerRounds.map(function (r) {
          const complete = Stats.isComplete(r);
          const tp = complete ? Stats.toPar(r) : null;
          return '<tr><td>' + esc(r.date) + '</td><td>' + esc(r.course || "—") + (r.holes === 9 ? ' <span class="muted">(9)</span>' : '') + '</td>' +
            '<td class="num">' + (complete ? Stats.roundTotal(r) : '<span class="muted">partial</span>') + '</td>' +
            '<td class="num to-par ' + (complete ? toParClass(tp) : "") + '">' + (complete ? toParStr(tp) : "—") + '</td>' +
            '<td>' + (r.photo ? "📷" : "") + '</td>' +
            '<td class="num"><button class="btn-sm" data-edit="' + r.id + '">Edit</button></td></tr>';
        }).join("") + '</tbody></table>';
      tw.querySelectorAll("[data-edit]").forEach(function (b) {
        b.onclick = function () { roundForm(b.dataset.edit); };
      });
      roundsCard.appendChild(tw);
    } else {
      roundsCard.innerHTML += '<p class="empty">No rounds yet.</p>';
    }
    wrap.appendChild(roundsCard);

    setTimeout(function () {
      const box = document.getElementById("pd-chart");
      if (box) {
        const pts = s.roundList ? s.roundList.map(function (r) {
          return { label: r.date.slice(5), value: Stats.total18(r) };
        }) : [];
        Charts.lineChart(box, pts, { ariaLabel: "Scoring trend for " + p.name });
      }
    }, 0);

    return wrap;
  }

  // =========================================================================
  // ROUNDS LIST
  // =========================================================================
  function renderRounds() {
    const wrap = document.createElement("div");
    const head = document.createElement("div");
    head.className = "section-head";
    head.innerHTML = '<h2>All rounds</h2>';
    const btn = document.createElement("button");
    btn.className = "btn-primary";
    btn.textContent = "+ Log round";
    btn.onclick = function () {
      if (!state.players.length) { toast("Add a player first"); activeTab = "roster"; render(); return; }
      roundForm();
    };
    head.appendChild(btn);
    wrap.appendChild(head);

    const rounds = state.rounds.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    if (!rounds.length) {
      const c = document.createElement("div");
      c.className = "card";
      c.innerHTML = '<p class="empty">No rounds logged. Log one manually or upload a scorecard photo.</p>';
      wrap.appendChild(c);
      return wrap;
    }
    const card = document.createElement("div");
    card.className = "card";
    const tw = document.createElement("div");
    tw.className = "table-wrap";
    tw.innerHTML = '<table><thead><tr><th>Date</th><th>Player</th><th>Course</th><th>Holes</th><th class="num">Score</th><th class="num">+/-</th><th>📷</th><th></th></tr></thead><tbody>' +
      rounds.map(function (r) {
        const complete = Stats.isComplete(r);
        const tp = complete ? Stats.toPar(r) : null;
        return '<tr><td>' + esc(r.date) + '</td><td>' + esc(playerName(r.playerId)) + '</td>' +
          '<td>' + esc(r.course || "—") + '</td><td>' + r.holes + '</td>' +
          '<td class="num">' + (complete ? Stats.roundTotal(r) : '<span class="muted">partial</span>') + '</td>' +
          '<td class="num to-par ' + (complete ? toParClass(tp) : "") + '">' + (complete ? toParStr(tp) : "—") + '</td>' +
          '<td>' + (r.photo ? "📷" : "") + '</td>' +
          '<td class="num"><button class="btn-sm" data-edit="' + r.id + '">Edit</button></td></tr>';
      }).join("") + '</tbody></table>';
    tw.querySelectorAll("[data-edit]").forEach(function (b) {
      b.onclick = function () { roundForm(b.dataset.edit); };
    });
    card.appendChild(tw);
    wrap.appendChild(card);
    return wrap;
  }

  // =========================================================================
  // ROUND FORM (with photo / OCR)
  // =========================================================================
  function roundForm(roundId, presetPlayerId, presetEventId) {
    const editing = !!roundId;
    const r = editing
      ? JSON.parse(JSON.stringify(state.rounds.find(function (x) { return x.id === roundId; })))
      : {
          playerId: presetPlayerId || (state.players[0] && state.players[0].id),
          eventId: presetEventId || null,
          date: new Date().toISOString().slice(0, 10),
          course: "", tee: "", holes: 18,
          pars: Store.standardPars(18), scores: new Array(18).fill(null),
          fairways: new Array(18).fill(null), putts: new Array(18).fill(null),
          girs: new Array(18).fill(null), yards: new Array(18).fill(null),
          si: new Array(18).fill(null), pace: new Array(18).fill(""),
          courseRating: null, slopeRating: null,
          frontRating: null, frontSlope: null, backRating: null, backSlope: null,
          roundNo: null, startHole: null, scorer: "", attest: "", attestedAt: "",
          stats: null, photo: null, notes: "",
        };

    const form = document.createElement("div");
    const playerOpts = state.players.map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === r.playerId ? " selected" : "") + '>' + esc(p.name) + '</option>';
    }).join("");

    form.innerHTML =
      '<div class="banner info" style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap">' +
      '<span>📷 Have a scorecard photo? Upload it and we\'ll read the numbers for you.</span>' +
      '<button class="btn-sm" id="rf-photo-btn">Upload scorecard</button></div>' +
      '<input type="file" id="rf-file" accept="image/*" capture="environment" style="display:none">' +
      '<div id="rf-photo-area"></div>' +
      '<div class="form-row">' +
      '<div class="field"><label>Player</label><select id="rf-player">' + playerOpts + '</select></div>' +
      '<div class="field"><label>Date</label><input type="date" id="rf-date" value="' + esc(r.date) + '"></div>' +
      '</div>' +
      '<div class="form-row">' +
      '<div class="field"><label>Course</label><input id="rf-course" value="' + esc(r.course) + '" placeholder="Course name"></div>' +
      '<div class="field"><label>Tees</label><input id="rf-tee" value="' + esc(r.tee) + '" placeholder="e.g. Blue"></div>' +
      '<div class="field"><label>Holes</label><select id="rf-holes"><option value="18"' + (r.holes === 18 ? " selected" : "") + '>18</option><option value="9"' + (r.holes === 9 ? " selected" : "") + '>9</option></select></div>' +
      '</div>' +
      '<div class="form-row">' +
      '<div class="field"><label>Course rating <span class="help">18-hole, for handicap</span></label><input type="number" step="0.1" id="rf-rating" value="' + (r.courseRating != null ? r.courseRating : "") + '" placeholder="e.g. 70.1"></div>' +
      '<div class="field"><label>Slope rating</label><input type="number" id="rf-slope" value="' + (r.slopeRating != null ? r.slopeRating : "") + '" placeholder="e.g. 124"></div>' +
      '</div>' +
      '<details' + (r.frontRating != null || r.scorer || r.roundNo != null ? " open" : "") + '><summary style="cursor:pointer;font-weight:600;color:var(--muted)">Card details (tee splits, round #, scorer)</summary>' +
      '<div class="form-row" style="margin-top:12px">' +
      '<div class="field"><label>Front rating / slope</label><div style="display:flex;gap:6px"><input type="number" step="0.1" id="rf-frating" value="' + (r.frontRating != null ? r.frontRating : "") + '" placeholder="34.6"><input type="number" id="rf-fslope" value="' + (r.frontSlope != null ? r.frontSlope : "") + '" placeholder="121"></div></div>' +
      '<div class="field"><label>Back rating / slope</label><div style="display:flex;gap:6px"><input type="number" step="0.1" id="rf-brating" value="' + (r.backRating != null ? r.backRating : "") + '" placeholder="35.5"><input type="number" id="rf-bslope" value="' + (r.backSlope != null ? r.backSlope : "") + '" placeholder="127"></div></div>' +
      '</div>' +
      '<div class="form-row">' +
      '<div class="field"><label>Round #</label><input type="number" id="rf-roundno" min="1" value="' + (r.roundNo != null ? r.roundNo : "") + '" placeholder="1"></div>' +
      '<div class="field"><label>Starting hole</label><input type="number" id="rf-starthole" min="1" max="18" value="' + (r.startHole != null ? r.startHole : "") + '" placeholder="1"></div>' +
      '<div class="field"><label>Scorer</label><input id="rf-scorer" value="' + esc(r.scorer || "") + '" placeholder="e.g. Gavyn Luke"></div>' +
      '<div class="field"><label>Attested by</label><input id="rf-attest" value="' + esc(r.attest || "") + '" placeholder="e.g. Daniel Jensen"></div>' +
      '</div></details>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:10px">' +
      '<label style="margin:0">Scorecard <span class="help">Par + strokes per hole; totals update live.</span></label>' +
      '<label style="display:flex;align-items:center;gap:6px;margin:0;cursor:pointer"><input type="checkbox" id="rf-detailed" style="width:auto"> Full card (yardage, SI, fwy, putts, GIR, pace)</label>' +
      '</div>' +
      '<div id="rf-scorecard" class="scorecard"></div>' +
      '<hr class="divider">' +
      '<div class="field" style="margin-top:4px"><label>Notes</label><textarea id="rf-notes" rows="2">' + esc(r.notes) + '</textarea></div>' +
      '<div class="btn-row" style="justify-content:space-between">' +
      (editing ? '<button class="btn-danger" id="rf-del">Delete round</button>' : '<span></span>') +
      '<div class="btn-row"><button id="rf-cancel">Cancel</button><button class="btn-primary" id="rf-save">Save round</button></div></div>';

    openModal(editing ? "Edit round" : "Log round", form, { wide: true });

    // Local working copies of every per-hole array.
    let pars = r.pars.slice();
    let scores = r.scores.slice();
    let fairways = (r.fairways || []).slice();
    let putts = (r.putts || []).slice();
    let girs = (r.girs || []).slice();
    let yards = (r.yards || []).slice();
    let si = (r.si || []).slice();
    let pace = (r.pace || []).slice();
    let photo = r.photo;
    let detailed = !!r.fullCard || [r.fairways, r.putts, r.girs, r.yards, r.si].some(function (a) {
      return (a || []).some(function (v) { return v !== null; });
    }) || (r.pace || []).some(function (v) { return v; });

    function fit(arr, holes, fill) {
      if (arr.length !== holes) { const a = new Array(holes).fill(fill); for (var i = 0; i < Math.min(arr.length, holes); i++) a[i] = arr[i]; return a; }
      return arr;
    }

    function flagSelect(cls, i, val, disabled) {
      return '<select class="' + cls + '" data-i="' + i + '"' + (disabled ? " disabled" : "") + '>' +
        '<option value=""' + (val == null ? " selected" : "") + '>·</option>' +
        '<option value="Y"' + (val === true ? " selected" : "") + '>Y</option>' +
        '<option value="N"' + (val === false ? " selected" : "") + '>N</option></select>';
    }

    function buildScorecard() {
      const holes = Number($("#rf-holes").value);
      pars = fit(pars, holes, null); if (pars.every(function (p) { return p == null; })) pars = Store.standardPars(holes);
      scores = fit(scores, holes, null);
      fairways = fit(fairways, holes, null);
      putts = fit(putts, holes, null);
      girs = fit(girs, holes, null);
      yards = fit(yards, holes, null);
      si = fit(si, holes, null);
      pace = fit(pace, holes, "");
      const box = $("#rf-scorecard");
      const half = holes === 18 ? 9 : holes;

      function seg(start, end) {
        function totCell(attr) { return '<td class="hole-total" ' + attr + '="' + start + '"></td>'; }
        let h = "<tr><th>Hole</th>";
        for (var i = start; i < end; i++) h += "<th>" + (i + 1) + "</th>";
        h += '<th class="hole-total">' + (holes === 18 ? (start === 0 ? "Out" : "In") : "Tot") + "</th></tr>";
        if (detailed) {
          h += '<tr><th>Yds</th>';
          for (var y = start; y < end; y++) h += '<td><input class="yds-in" data-i="' + y + '" type="number" min="0" value="' + (yards[y] == null ? "" : yards[y]) + '"></td>';
          h += totCell("data-ydstot") + "</tr>";
          h += '<tr><th>SI</th>';
          for (var x = start; x < end; x++) h += '<td><input class="si-in" data-i="' + x + '" type="number" min="1" max="18" value="' + (si[x] == null ? "" : si[x]) + '"></td>';
          h += '<td class="hole-total"></td></tr>';
        }
        h += "<tr><th>Par</th>";
        for (var j = start; j < end; j++) h += '<td><input class="par-in" data-i="' + j + '" type="number" min="3" max="6" value="' + (pars[j] || "") + '"></td>';
        h += totCell("data-partot") + "</tr>";
        h += "<tr><th>Score</th>";
        for (var k = start; k < end; k++) h += '<td><input class="sc-in" data-i="' + k + '" type="number" min="1" max="15" value="' + (scores[k] == null ? "" : scores[k]) + '"></td>';
        h += totCell("data-sctot") + "</tr>";
        if (detailed) {
          h += '<tr><th>Fwy</th>';
          for (var f = start; f < end; f++) h += '<td>' + flagSelect("fwy-in", f, fairways[f], pars[f] === 3) + '</td>';
          h += totCell("data-fwytot") + "</tr>";
          h += '<tr><th>Putt</th>';
          for (var p = start; p < end; p++) h += '<td><input class="put-in" data-i="' + p + '" type="number" min="0" max="9" value="' + (putts[p] == null ? "" : putts[p]) + '"></td>';
          h += totCell("data-puttot") + "</tr>";
          h += '<tr><th>GIR</th>';
          for (var g = start; g < end; g++) h += '<td>' + flagSelect("gir-in", g, girs[g], false) + '</td>';
          h += totCell("data-girtot") + "</tr>";
          h += '<tr><th>Pace</th>';
          for (var c = start; c < end; c++) h += '<td><input class="pac-in" data-i="' + c + '" type="text" value="' + esc(pace[c] || "") + '" style="width:46px"></td>';
          h += '<td class="hole-total"></td></tr>';
          h += '<tr><th>Tot</th>';
          for (var t = start; t < end; t++) h += '<td class="to-par" data-tot="' + t + '"></td>';
          h += totCell("data-tottot") + "</tr>";
        }
        return "<table>" + h + "</table>";
      }

      let html = seg(0, half);
      if (holes === 18) html += '<div style="height:8px"></div>' + seg(9, 18);
      html += '<p style="margin-top:8px;font-weight:700">Total: <span id="rf-total">—</span> &nbsp; Par: <span id="rf-par">—</span> &nbsp; <span id="rf-topar" class="to-par"></span>' +
        (detailed ? ' &nbsp;<span class="muted" style="font-weight:600;font-size:.85rem" id="rf-detail-sum"></span>' : '') + '</p>';
      box.innerHTML = html;

      box.querySelectorAll(".par-in").forEach(function (inp) {
        inp.oninput = function () { pars[Number(inp.dataset.i)] = inp.value === "" ? null : Number(inp.value); recalc(); };
      });
      box.querySelectorAll(".sc-in").forEach(function (inp) {
        inp.oninput = function () { scores[Number(inp.dataset.i)] = inp.value === "" ? null : Number(inp.value); recalc(); };
      });
      box.querySelectorAll(".fwy-in").forEach(function (sel) {
        sel.onchange = function () { fairways[Number(sel.dataset.i)] = sel.value === "" ? null : sel.value === "Y"; recalc(); };
      });
      box.querySelectorAll(".put-in").forEach(function (inp) {
        inp.oninput = function () { putts[Number(inp.dataset.i)] = inp.value === "" ? null : Number(inp.value); recalc(); };
      });
      box.querySelectorAll(".gir-in").forEach(function (sel) {
        sel.onchange = function () { girs[Number(sel.dataset.i)] = sel.value === "" ? null : sel.value === "Y"; recalc(); };
      });
      box.querySelectorAll(".yds-in").forEach(function (inp) {
        inp.oninput = function () { yards[Number(inp.dataset.i)] = inp.value === "" ? null : Number(inp.value); recalc(); };
      });
      box.querySelectorAll(".si-in").forEach(function (inp) {
        inp.oninput = function () { si[Number(inp.dataset.i)] = inp.value === "" ? null : Number(inp.value); };
      });
      box.querySelectorAll(".pac-in").forEach(function (inp) {
        inp.oninput = function () { pace[Number(inp.dataset.i)] = inp.value; };
      });
      recalc();
    }

    function recalc() {
      const holes = Number($("#rf-holes").value);
      const half = holes === 18 ? 9 : holes;
      const box = $("#rf-scorecard");
      function sumRange(arr, a, b) { let s = 0; for (var i = a; i < b; i++) s += Number(arr[i]) || 0; return s; }

      box.querySelectorAll("[data-partot]").forEach(function (td) {
        const start = Number(td.dataset.partot);
        td.textContent = sumRange(pars, start, start + half) || "";
      });
      box.querySelectorAll("[data-sctot]").forEach(function (td) {
        const start = Number(td.dataset.sctot);
        td.textContent = sumRange(scores, start, start + half) || "";
      });

      if (detailed) {
        // Par-3 holes can't record a fairway — reflect that in the UI.
        box.querySelectorAll(".fwy-in").forEach(function (sel) {
          const i = Number(sel.dataset.i);
          const par3 = pars[i] === 3;
          sel.disabled = par3;
          if (par3) { sel.value = ""; fairways[i] = null; }
        });
        box.querySelectorAll("[data-fwytot]").forEach(function (td) {
          const s = Number(td.dataset.fwytot); let hit = 0, poss = 0;
          for (var i = s; i < s + half; i++) { if (fairways[i] === true) { hit++; poss++; } else if (fairways[i] === false) poss++; }
          td.textContent = poss ? hit + "/" + poss : "";
        });
        box.querySelectorAll("[data-puttot]").forEach(function (td) {
          const s = Number(td.dataset.puttot);
          td.textContent = sumRange(putts, s, s + half) || "";
        });
        box.querySelectorAll("[data-girtot]").forEach(function (td) {
          const s = Number(td.dataset.girtot); let hit = 0;
          for (var i = s; i < s + half; i++) if (girs[i] === true) hit++;
          td.textContent = hit || "";
        });
        box.querySelectorAll("[data-ydstot]").forEach(function (td) {
          const s = Number(td.dataset.ydstot);
          td.textContent = sumRange(yards, s, s + half) || "";
        });
        // Running to-par (the card's TOT row).
        let running = 0;
        box.querySelectorAll("[data-tot]").forEach(function (td) {
          const i = Number(td.dataset.tot);
          if (typeof scores[i] === "number" && typeof pars[i] === "number") {
            running += scores[i] - pars[i];
            td.textContent = toParStr(running);
            td.className = "to-par " + toParClass(running);
          } else { td.textContent = ""; td.className = "to-par"; }
        });
        box.querySelectorAll("[data-tottot]").forEach(function (td) {
          const start = Number(td.dataset.tottot);
          const sc = sumRange(scores, start, start + half), pr = sumRange(pars, start, start + half);
          td.textContent = (sc && pr) ? toParStr(sc - pr) : "";
        });
      }

      const totScore = sumRange(scores, 0, holes);
      const totPar = sumRange(pars, 0, holes);
      $("#rf-total").textContent = totScore || "—";
      $("#rf-par").textContent = totPar || "—";
      const tp = totScore - totPar;
      const el = $("#rf-topar");
      if (totScore && totPar) { el.textContent = toParStr(tp); el.className = "to-par " + toParClass(tp); }
      else { el.textContent = ""; }

      const ds = $("#rf-detail-sum");
      if (detailed && ds) {
        let fwHit = 0, fwPoss = 0, girHit = 0, girPoss = 0;
        for (var i = 0; i < holes; i++) {
          if (fairways[i] === true) { fwHit++; fwPoss++; } else if (fairways[i] === false) fwPoss++;
          if (girs[i] === true) { girHit++; girPoss++; } else if (girs[i] === false) girPoss++;
        }
        const pT = sumRange(putts, 0, holes);
        const parts = [];
        if (fwPoss) parts.push("Fwy " + Math.round((fwHit / fwPoss) * 100) + "%");
        if (pT) parts.push("Putts " + pT);
        if (girPoss) parts.push("GIR " + Math.round((girHit / girPoss) * 100) + "%");
        ds.textContent = parts.length ? "· " + parts.join(" · ") : "";
      }
    }

    function renderPhotoArea(dataURL, statusHTML) {
      const area = $("#rf-photo-area");
      area.innerHTML =
        (dataURL ? '<img src="' + dataURL + '" class="photo-preview" alt="Scorecard">' : "") +
        (statusHTML || "");
    }

    $("#rf-photo-btn").onclick = function () { $("#rf-file").click(); };
    $("#rf-file").onchange = function (e) {
      const file = e.target.files[0];
      if (!file) return;
      renderPhotoArea(null, '<div class="ocr-status">Processing image…</div>');
      OCR.fileToScaledDataURL(file).then(function (dataURL) {
        photo = dataURL;
        renderPhotoArea(dataURL, '<div class="ocr-status">Reading scorecard… <div class="progress"><span id="ocr-bar"></span></div></div>');
        const holes = Number($("#rf-holes").value);
        return OCR.recognize(dataURL, holes, function (pct) {
          const bar = $("#ocr-bar");
          if (bar) bar.style.width = pct + "%";
        });
      }).then(function (parsed) {
        function applyNums(target, src) { if (src) src.forEach(function (v, i) { if (i < target.length && v != null) target[i] = v; }); }
        function applyFlags(target, src) { if (src) src.forEach(function (v, i) { if (i < target.length && v !== null) target[i] = v; }); }
        const scoreCount = (parsed.scores || []).filter(function (v) { return v != null; }).length;
        applyNums(scores, parsed.scores);
        if (parsed.detailedFound) {
          applyNums(pars, parsed.pars);
          applyNums(putts, parsed.putts);
          applyNums(si, parsed.si);
          applyNums(yards, parsed.yards);
          applyFlags(fairways, parsed.fairways);
          applyFlags(girs, parsed.girs);
          if (parsed.pace) parsed.pace.forEach(function (v, i) { if (i < pace.length && v) pace[i] = v; });
          detailed = true; detailChk.checked = true;
        }
        if (scoreCount) {
          buildScorecard();
          const cats = [];
          [["pars", "par"], ["fairways", "fairways"], ["putts", "putts"], ["girs", "GIR"], ["yards", "yardage"], ["si", "SI"]].forEach(function (p) {
            if (parsed[p[0]] && parsed[p[0]].some(function (v) { return v !== null; })) cats.push(p[1]);
          });
          if (parsed.pace && parsed.pace.some(function (v) { return v; })) cats.push("pace");
          renderPhotoArea(photo,
            '<div class="ocr-status">Read <b>' + scoreCount + '</b> scores' + (cats.length ? ' + ' + cats.join(", ") : '') +
            ' <span class="confidence ' + parsed.confidence + '">(' + parsed.confidence + ' confidence)</span>. Review and correct below.</div>' + ocrDebug(parsed));
          toast("Scorecard read — review the numbers");
        } else {
          renderPhotoArea(photo, '<div class="ocr-status">Couldn\'t read the scorecard automatically — photo saved, enter values manually.</div>' + ocrDebug(parsed));
        }
      }).catch(function (err) {
        console.error(err);
        renderPhotoArea(photo, '<div class="ocr-status" style="color:var(--warn)">' + esc(err.message) + '. Photo ' + (photo ? "saved" : "not saved") + ' — enter scores manually.</div>');
      });
    };

    $("#rf-holes").onchange = buildScorecard;
    const detailChk = $("#rf-detailed");
    detailChk.checked = detailed;
    detailChk.onchange = function () { detailed = detailChk.checked; buildScorecard(); };
    buildScorecard();
    if (photo) renderPhotoArea(photo, "");

    $("#rf-cancel").onclick = closeModal;
    $("#rf-save").onclick = function () {
      const data = {
        playerId: $("#rf-player").value,
        date: $("#rf-date").value,
        course: $("#rf-course").value.trim(),
        tee: $("#rf-tee").value.trim(),
        holes: Number($("#rf-holes").value),
        pars: pars, scores: scores,
        fairways: detailed ? fairways : new Array(scores.length).fill(null),
        putts: detailed ? putts : new Array(scores.length).fill(null),
        girs: detailed ? girs : new Array(scores.length).fill(null),
        yards: detailed ? yards : new Array(scores.length).fill(null),
        si: detailed ? si : new Array(scores.length).fill(null),
        pace: detailed ? pace : new Array(scores.length).fill(""),
        courseRating: $("#rf-rating").value,
        slopeRating: $("#rf-slope").value,
        frontRating: $("#rf-frating").value,
        frontSlope: $("#rf-fslope").value,
        backRating: $("#rf-brating").value,
        backSlope: $("#rf-bslope").value,
        roundNo: $("#rf-roundno").value,
        startHole: $("#rf-starthole").value,
        scorer: $("#rf-scorer").value,
        attest: $("#rf-attest").value,
        fullCard: detailed,
        eventId: editing ? r.eventId : (presetEventId || null),
        stats: null,
        photo: photo,
        notes: $("#rf-notes").value.trim(),
      };
      if (editing) Store.updateRound(state, roundId, data);
      else Store.addRound(state, data);
      persist(); closeModal(); render();
      toast(editing ? "Round updated" : "Round logged");
    };
    if (editing) {
      $("#rf-del").onclick = function () {
        if (confirm("Delete this round?")) {
          Store.deleteRound(state, roundId);
          persist(); closeModal(); render();
          toast("Round deleted");
        }
      };
    }
  }

  // =========================================================================
  // EVENTS
  // =========================================================================
  function openEvent(id) { selectedEventId = id; activeTab = "events"; render(); }

  function renderEvents() {
    const wrap = document.createElement("div");
    const head = document.createElement("div");
    head.className = "section-head";
    head.innerHTML = '<h2>Events</h2>';
    const btns = document.createElement("div");
    btns.className = "btn-row";
    const imp = document.createElement("button");
    imp.className = "btn-primary";
    imp.textContent = "📷 Import from screenshots";
    imp.onclick = function () {
      if (!state.players.length) { toast("Add players to your roster first"); activeTab = "roster"; render(); return; }
      batchImport();
    };
    const nw = document.createElement("button");
    nw.textContent = "+ New event";
    nw.onclick = function () { eventForm(); };
    btns.appendChild(imp); btns.appendChild(nw);
    head.appendChild(btns);
    wrap.appendChild(head);

    if (!state.events.length) {
      const c = document.createElement("div");
      c.className = "card";
      c.innerHTML = '<p class="empty">No events yet. Use <b>Import from screenshots</b> to drop an event\'s screenshots (event info, leaderboard, and each player\'s front + back nine) and build the whole event at once.</p>';
      wrap.appendChild(c);
      return wrap;
    }

    const grid = document.createElement("div");
    grid.className = "grid cols-2";
    state.events.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (ev) {
      const standings = Stats.eventStandings(state, ev.id);
      const low = standings.length ? standings[0] : null;
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML =
        '<div class="section-head"><h3>' + esc(ev.name) + '</h3><span class="muted">' + esc(ev.date) + '</span></div>' +
        '<p class="muted" style="margin:0 0 10px">' + esc([ev.course, ev.location].filter(Boolean).join(" · ") || "—") +
        (ev.startTime ? ' · ' + esc(ev.startTime) : '') + '</p>' +
        '<div class="grid cols-4" style="gap:8px">' +
        miniStat(standings.length, "Players") +
        miniStat(low ? low.total : "—", "Low score") +
        miniStat(low ? esc(low.player.name.split(" ")[0]) : "—", "Leader") +
        '</div>';
      const row = document.createElement("div");
      row.className = "btn-row";
      row.style.marginTop = "12px";
      const open = document.createElement("button");
      open.className = "btn-sm btn-primary";
      open.textContent = "Open";
      open.onclick = function () { openEvent(ev.id); };
      const xl = document.createElement("button");
      xl.className = "btn-sm";
      xl.textContent = "⬇ Workbook";
      xl.onclick = function () { exportWorkbook(ev); };
      row.appendChild(open); row.appendChild(xl);
      card.appendChild(row);
      grid.appendChild(card);
    });
    wrap.appendChild(grid);
    return wrap;
  }

  function exportWorkbook(ev) {
    toast("Building workbook…");
    Workbook.exportEvent(state, ev).then(function (res) {
      toast(res.format === "xlsx" ? "Workbook (.xlsx) downloaded" : "Workbook (.csv) downloaded");
    }).catch(function (err) {
      toast("Export failed: " + err.message, 4000);
    });
  }

  function renderEventDetail(id) {
    const ev = state.events.find(function (x) { return x.id === id; });
    const wrap = document.createElement("div");
    if (!ev) { selectedEventId = null; return renderEvents(); }

    const back = document.createElement("button");
    back.className = "btn-sm";
    back.textContent = "← Back to events";
    back.onclick = function () { selectedEventId = null; render(); };
    wrap.appendChild(back);

    const head = document.createElement("div");
    head.className = "section-head";
    head.style.marginTop = "14px";
    head.innerHTML = '<h1 style="margin:0">' + esc(ev.name) + '</h1>';
    const btns = document.createElement("div");
    btns.className = "btn-row";
    btns.innerHTML =
      '<button class="btn-sm btn-primary" id="ed-xl">⬇ Workbook</button>' +
      '<button class="btn-sm" id="ed-import">📷 Add screenshots</button>' +
      '<button class="btn-sm" id="ed-edit">Edit</button>';
    head.appendChild(btns);
    wrap.appendChild(head);

    const meta = document.createElement("p");
    meta.className = "muted";
    meta.style.marginTop = "4px";
    meta.textContent = [ev.date, ev.startTime, ev.course, ev.location].filter(Boolean).join(" · ") || "No details";
    wrap.appendChild(meta);
    if (ev.notes) { const n = document.createElement("p"); n.className = "muted"; n.textContent = ev.notes; wrap.appendChild(n); }

    const standings = Stats.eventStandings(state, id);
    const lb = document.createElement("div");
    lb.className = "card";
    lb.style.marginTop = "12px";
    lb.innerHTML = '<div class="section-head"><h2>Standings</h2></div>';
    if (standings.length) {
      const tw = document.createElement("div");
      tw.className = "table-wrap";
      tw.innerHTML = '<table><thead><tr><th>#</th><th>Player</th><th class="num">Total</th><th class="num">+/-</th><th></th></tr></thead><tbody>' +
        standings.map(function (row, i) {
          return '<tr><td class="rank ' + (i === 0 ? "top" : "") + '">' + (i + 1) + '</td>' +
            '<td>' + esc(row.player.name) + '</td>' +
            '<td class="num">' + row.total + '</td>' +
            '<td class="num to-par ' + toParClass(row.toPar) + '">' + toParStr(row.toPar) + '</td>' +
            '<td class="num"><button class="btn-sm" data-edit="' + row.round.id + '">Edit round</button></td></tr>';
        }).join("") + '</tbody></table>';
      tw.querySelectorAll("[data-edit]").forEach(function (b) {
        b.onclick = function () { roundForm(b.dataset.edit); };
      });
      lb.appendChild(tw);
    } else {
      lb.innerHTML += '<p class="empty">No rounds in this event yet. Use “Add screenshots” or add rounds manually.</p>';
    }
    const addBtn = document.createElement("button");
    addBtn.className = "btn-sm";
    addBtn.style.marginTop = "10px";
    addBtn.textContent = "+ Add round manually";
    addBtn.onclick = function () { roundForm(null, null, id); };
    lb.appendChild(addBtn);
    wrap.appendChild(lb);

    // Hole-by-hole card
    if (standings.length) {
      const hbh = document.createElement("div");
      hbh.className = "card";
      hbh.style.marginTop = "16px";
      hbh.innerHTML = '<div class="section-head"><h2>Hole-by-hole</h2></div>';
      const tw = document.createElement("div");
      tw.className = "table-wrap scorecard";
      let header = '<tr><th>Player</th>';
      for (var h = 1; h <= 18; h++) header += '<th>' + h + '</th>';
      header += '<th class="hole-total">Tot</th></tr>';
      const parRef = (state.rounds.find(function (r) { return r.eventId === id && r.holes === 18; }) || {}).pars || Store.standardPars(18);
      let body = '<tr><th>Par</th>';
      parRef.forEach(function (p) { body += '<td>' + p + '</td>'; });
      body += '<td class="hole-total">' + parRef.reduce(function (a, b) { return a + b; }, 0) + '</td></tr>';
      standings.forEach(function (row) {
        const r = row.round;
        body += '<tr><th style="text-align:left;white-space:nowrap">' + esc(row.player.name) + '</th>';
        for (var i = 0; i < 18; i++) {
          const v = r.scores[i];
          const par = r.pars[i];
          const cls = (typeof v === "number" && typeof par === "number") ? (v < par ? "under" : v > par ? "over" : "") : "";
          body += '<td class="to-par ' + cls + '">' + (v == null ? "" : v) + '</td>';
        }
        body += '<td class="hole-total">' + row.total + '</td></tr>';
      });
      tw.innerHTML = '<table style="min-width:720px">' + header + body + '</table>';
      hbh.appendChild(tw);
      wrap.appendChild(hbh);
    }

    setTimeout(function () {
      $("#ed-xl").onclick = function () { exportWorkbook(ev); };
      $("#ed-import").onclick = function () { batchImport(id); };
      $("#ed-edit").onclick = function () { eventForm(ev); };
    }, 0);
    return wrap;
  }

  function eventForm(event) {
    const editing = !!event;
    const e = event || { name: "", date: new Date().toISOString().slice(0, 10), startTime: "", course: "", location: "", notes: "" };
    const form = document.createElement("div");
    form.innerHTML =
      '<div class="form-row"><div class="field"><label>Event name</label><input id="ef-name" value="' + esc(e.name) + '" placeholder="e.g. Conference Match #3"></div>' +
      '<div class="field"><label>Date</label><input type="date" id="ef-date" value="' + esc(e.date) + '"></div></div>' +
      '<div class="form-row"><div class="field"><label>Start time</label><input id="ef-time" value="' + esc(e.startTime) + '" placeholder="e.g. 10:00 AM"></div>' +
      '<div class="field"><label>Course</label><input id="ef-course" value="' + esc(e.course) + '" placeholder="Course name"></div>' +
      '<div class="field"><label>Location</label><input id="ef-loc" value="' + esc(e.location) + '" placeholder="City, ST"></div></div>' +
      '<div class="field"><label>Notes</label><textarea id="ef-notes" rows="2">' + esc(e.notes) + '</textarea></div>' +
      '<div class="btn-row" style="justify-content:space-between">' +
      (editing ? '<button class="btn-danger" id="ef-del">Delete event</button>' : '<span></span>') +
      '<div class="btn-row"><button id="ef-cancel">Cancel</button><button class="btn-primary" id="ef-save">Save</button></div></div>';
    openModal(editing ? "Edit event" : "New event", form);
    $("#ef-cancel").onclick = closeModal;
    $("#ef-save").onclick = function () {
      const data = {
        name: $("#ef-name").value.trim() || "Event",
        date: $("#ef-date").value,
        startTime: $("#ef-time").value.trim(),
        course: $("#ef-course").value.trim(),
        location: $("#ef-loc").value.trim(),
        notes: $("#ef-notes").value.trim(),
      };
      let ev;
      if (editing) ev = Store.updateEvent(state, e.id, data);
      else ev = Store.addEvent(state, data);
      persist(); closeModal();
      if (!editing) openEvent(ev.id); else render();
      toast(editing ? "Event updated" : "Event created");
    };
    if (editing) {
      $("#ef-del").onclick = function () {
        const alsoRounds = confirm("Delete event “" + e.name + "”.\n\nOK = also delete its rounds.\nCancel = keep rounds (just unlink them).");
        Store.deleteEvent(state, e.id, alsoRounds);
        persist(); closeModal(); selectedEventId = null; render();
        toast("Event deleted");
      };
    }
  }

  // =========================================================================
  // BATCH IMPORT (guided, multi-screenshot, browser OCR)
  // =========================================================================
  function batchImport(existingEventId) {
    const ev = existingEventId ? state.events.find(function (x) { return x.id === existingEventId; }) : null;
    const today = new Date().toISOString().slice(0, 10);
    const images = []; // {id, dataURL, type, playerId, nine, scores, status}

    const form = document.createElement("div");
    form.innerHTML =
      '<p class="help">Drop all the screenshots for one event. Tag each: <b>Scorecard</b> reads the hole scores (choose the player and whether it\'s the front or back nine — we stitch them into one round). Leaderboard / Event info are kept for reference. Review the totals, then create the event.</p>' +
      (ev ? '<div class="banner info">Adding rounds to <b>' + esc(ev.name) + '</b></div>' :
        '<div class="form-row"><div class="field"><label>Event name</label><input id="bi-name" placeholder="e.g. Conference Match #3"></div>' +
        '<div class="field"><label>Date</label><input type="date" id="bi-date" value="' + today + '"></div></div>' +
        '<div class="form-row"><div class="field"><label>Start time</label><input id="bi-time" placeholder="e.g. 10:00 AM"></div>' +
        '<div class="field"><label>Course</label><input id="bi-course" placeholder="Course name"></div>' +
        '<div class="field"><label>Location</label><input id="bi-loc" placeholder="City, ST"></div></div>') +
      '<div class="dropzone" id="bi-drop">📷 Click to add screenshots…</div>' +
      '<input type="file" id="bi-files" accept="image/*" multiple style="display:none">' +
      '<label style="display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer">' +
      '<input type="checkbox" id="bi-fullcard" checked style="width:auto"> ' +
      '<span>Import as <b>full round</b> — turn on the putts / fairways / GIR / yardage / SI / pace rows so you can fill them in when reviewing.</span></label>' +
      '<div id="bi-list" style="margin-top:12px"></div>' +
      '<div class="btn-row" style="justify-content:space-between;margin-top:14px"><button id="bi-cancel">Cancel</button>' +
      '<button class="btn-primary" id="bi-create">Create ' + (ev ? "rounds" : "event & rounds") + '</button></div>';
    openModal(ev ? "Add screenshots" : "Import event from screenshots", form, { wide: true });

    const playerOptions = function (sel) {
      return state.players.map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === sel ? " selected" : "") + '>' + esc(p.name) + '</option>';
      }).join("");
    };

    function runOCR(img) {
      if (img.type !== "scorecard") { img.scores = null; img.status = ""; renderList(); return; }
      const holes = img.nine === "full" ? 18 : 9;
      img.status = "reading";
      renderList();
      OCR.recognize(img.dataURL, holes, function () {}).then(function (parsed) {
        img.parsed = parsed;
        img.scores = parsed.scores;
        img.confidence = parsed.confidence;
        img.status = "done";
        renderList();
      }).catch(function (err) {
        img.status = "error";
        img.error = err.message;
        renderList();
      });
    }

    function renderList() {
      const list = $("#bi-list");
      if (!images.length) { list.innerHTML = ""; return; }
      list.innerHTML = images.map(function (img, idx) {
        let detail = "";
        if (img.type === "scorecard") {
          detail =
            '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px">' +
            '<select data-role="player" data-i="' + idx + '"><option value="">— player —</option>' + playerOptions(img.playerId) + '</select>' +
            '<select data-role="nine" data-i="' + idx + '">' +
            '<option value="front"' + (img.nine === "front" ? " selected" : "") + '>Front 9</option>' +
            '<option value="back"' + (img.nine === "back" ? " selected" : "") + '>Back 9</option>' +
            '<option value="full"' + (img.nine === "full" ? " selected" : "") + '>Full 18</option></select>' +
            '<span class="ocr-status">' +
            (img.status === "reading" ? "reading…" :
              img.status === "done" ? 'read <b>' + img.scores.filter(function (s) { return s != null; }).length + '</b> scores <span class="confidence ' + img.confidence + '">(' + img.confidence + ')</span>' :
              img.status === "error" ? '<span style="color:var(--warn)">OCR failed</span>' : "") +
            '</span>' +
            (img.status === "done" || img.status === "error" ? '<button class="btn-sm" data-role="reread" data-i="' + idx + '">re-read</button>' : '') +
            '</div>' +
            (img.status === "done" && img.parsed ? ocrDebug(img.parsed) : "");
        }
        return '<div class="card" style="padding:10px;margin-bottom:8px;display:flex;gap:10px;align-items:flex-start">' +
          '<img src="' + img.dataURL + '" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">' +
          '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;gap:8px;align-items:center;justify-content:space-between">' +
          '<select data-role="type" data-i="' + idx + '">' +
          ['scorecard', 'leaderboard', 'eventinfo', 'ignore'].map(function (t) {
            const labels = { scorecard: "Scorecard", leaderboard: "Leaderboard", eventinfo: "Event info", ignore: "Ignore" };
            return '<option value="' + t + '"' + (img.type === t ? " selected" : "") + '>' + labels[t] + '</option>';
          }).join("") + '</select>' +
          '<button class="btn-sm btn-danger" data-role="remove" data-i="' + idx + '">✕</button></div>' +
          detail + '</div></div>';
      }).join("");

      list.querySelectorAll('[data-role="type"]').forEach(function (sel) {
        sel.onchange = function () {
          const img = images[Number(sel.dataset.i)];
          img.type = sel.value;
          if (img.type === "scorecard" && !img.scores) runOCR(img); else renderList();
        };
      });
      list.querySelectorAll('[data-role="player"]').forEach(function (sel) {
        sel.onchange = function () { images[Number(sel.dataset.i)].playerId = sel.value; };
      });
      list.querySelectorAll('[data-role="nine"]').forEach(function (sel) {
        sel.onchange = function () { const img = images[Number(sel.dataset.i)]; img.nine = sel.value; runOCR(img); };
      });
      list.querySelectorAll('[data-role="reread"]').forEach(function (b) {
        b.onclick = function () { runOCR(images[Number(b.dataset.i)]); };
      });
      list.querySelectorAll('[data-role="remove"]').forEach(function (b) {
        b.onclick = function () { images.splice(Number(b.dataset.i), 1); renderList(); };
      });
    }

    $("#bi-drop").onclick = function () { $("#bi-files").click(); };
    $("#bi-files").onchange = function (e) {
      const files = Array.prototype.slice.call(e.target.files);
      e.target.value = "";
      files.forEach(function (file) {
        OCR.fileToScaledDataURL(file).then(function (dataURL) {
          const img = { id: Store.uid(), dataURL: dataURL, type: "scorecard", playerId: "", nine: "front", scores: null, status: "" };
          images.push(img);
          renderList();
          runOCR(img);
        });
      });
    };

    $("#bi-cancel").onclick = closeModal;
    $("#bi-create").onclick = function () {
      // Assemble one round per player from their tagged scorecard images.
      const cards = images.filter(function (i) { return i.type === "scorecard" && i.playerId && i.scores; });
      if (!cards.length) { toast("Tag at least one scorecard with a player"); return; }

      let targetEvent = ev;
      if (!targetEvent) {
        targetEvent = Store.addEvent(state, {
          name: $("#bi-name").value.trim() || "Untitled event",
          date: $("#bi-date").value,
          startTime: $("#bi-time").value.trim(),
          course: $("#bi-course").value.trim(),
          location: $("#bi-loc").value.trim(),
        });
      }

      const byPlayer = {};
      cards.forEach(function (c) {
        const slot = byPlayer[c.playerId] || (byPlayer[c.playerId] = {});
        slot[c.nine] = c;
      });

      const fullCard = $("#bi-fullcard").checked;
      // Merge a category array across a player's front/back/full scorecard images.
      function cat(slot, key) {
        function of(img) { return (img && img.parsed && img.parsed[key]) ? img.parsed[key] : []; }
        if (slot.full) return of(slot.full).slice(0, 18);
        const f = of(slot.front).slice(0, 9), bk = of(slot.back).slice(0, 9);
        if (slot.front && slot.back) return f.concat(bk);
        return slot.front ? f : bk;
      }
      let created = 0;
      Object.keys(byPlayer).forEach(function (pid) {
        const slot = byPlayer[pid];
        const holes = slot.full || (slot.front && slot.back) ? 18 : 9;
        Store.addRound(state, {
          playerId: pid,
          eventId: targetEvent.id,
          date: targetEvent.date,
          course: targetEvent.course,
          holes: holes,
          scores: cat(slot, "scores"),
          pars: cat(slot, "pars"),
          fairways: cat(slot, "fairways"),
          putts: cat(slot, "putts"),
          girs: cat(slot, "girs"),
          si: cat(slot, "si"),
          yards: cat(slot, "yards"),
          pace: cat(slot, "pace"),
          photo: (slot.full || slot.front || slot.back).dataURL,
          fullCard: fullCard,
        });
        created++;
      });

      persist(); closeModal();
      openEvent(targetEvent.id);
      toast("Imported " + created + " round" + (created === 1 ? "" : "s") + " — review and fix any OCR misreads");
    };
  }

  // =========================================================================
  // DATA / BACKUP
  // =========================================================================
  function renderData() {
    const wrap = document.createElement("div");
    wrap.innerHTML = '<div class="section-head"><h2>Backup &amp; publish</h2></div>';

    const size = new Blob([JSON.stringify(state)]).size;
    const info = document.createElement("div");
    info.className = "card";
    info.innerHTML =
      '<h3>Current data</h3>' +
      '<p class="muted">' + state.players.length + ' players · ' + state.events.length + ' events · ' + state.rounds.length + ' rounds · ' +
      (size / 1024).toFixed(0) + ' KB in this browser · last saved ' + esc((state.updatedAt || "").slice(0, 16).replace("T", " ")) + '</p>' +
      '<div class="field" style="max-width:420px"><label>Team name</label><input id="dt-team" value="' + esc(state.team.name) + '"></div>' +
      '<div class="form-row" style="max-width:640px"><div class="field"><label>Season</label><input id="dt-season" value="' + esc(state.team.season || "") + '" placeholder="e.g. Spring 2026"></div>' +
      '<div class="field"><label>Coach</label><input id="dt-coach" value="' + esc(state.team.coach || "") + '" placeholder="Coach name"></div></div>' +
      '<button class="btn-sm" id="dt-save-team">Save team info</button>';
    wrap.appendChild(info);

    const backup = document.createElement("div");
    backup.className = "card";
    backup.style.marginTop = "16px";
    backup.innerHTML =
      '<h3>💾 Full backup</h3>' +
      '<p class="muted">Downloads everything, including scorecard photos. Use this to move data between devices or keep a safe copy.</p>' +
      '<div class="btn-row"><button class="btn-primary" id="dt-export-full">Export full backup (.json)</button>' +
      '<button id="dt-import">Import / restore…</button>' +
      '<input type="file" id="dt-import-file" accept="application/json,.json" style="display:none"></div>';
    wrap.appendChild(backup);

    const publish = document.createElement("div");
    publish.className = "card";
    publish.style.marginTop = "16px";
    publish.innerHTML =
      '<h3>🌐 Publish to your public GitHub page</h3>' +
      '<p class="muted">This exports a lightweight <code>data.json</code> (stats &amp; scores, no photos) to commit into your repo. ' +
      'Once committed, the read-only public dashboard at <code>public.html</code> shows current team stats to anyone with the link.</p>' +
      '<ol class="help" style="line-height:1.8">' +
      '<li>Click <b>Export data.json for publishing</b>.</li>' +
      '<li>Commit the file to your repo at <code>data/data.json</code> (replace the existing one).</li>' +
      '<li>Enable GitHub Pages (Settings → Pages → deploy from <code>main</code>).</li>' +
      '<li>Share <code>&lt;your-pages-url&gt;/public.html</code>.</li></ol>' +
      '<div class="btn-row"><button class="btn-primary" id="dt-export-pub">Export data.json for publishing</button>' +
      '<a class="btn" href="public.html" target="_blank" rel="noopener">Preview public view →</a></div>';
    wrap.appendChild(publish);

    const danger = document.createElement("div");
    danger.className = "card";
    danger.style.marginTop = "16px";
    danger.innerHTML = '<h3>Reset</h3><p class="muted">Clear all data in this browser. Export a backup first!</p><button class="btn-danger" id="dt-reset">Clear all data</button>';
    wrap.appendChild(danger);

    setTimeout(function () {
      $("#dt-save-team").onclick = function () {
        state.team.name = $("#dt-team").value.trim() || "Hastings Golf";
        state.team.season = $("#dt-season").value.trim();
        state.team.coach = $("#dt-coach").value.trim();
        persist();
        updateBrand();
        toast("Team info saved");
      };
      $("#dt-export-full").onclick = function () {
        downloadFile("hastings-golf-backup-" + today() + ".json", Store.exportFull(state));
        toast("Full backup downloaded");
      };
      $("#dt-export-pub").onclick = function () {
        downloadFile("data.json", Store.exportPublish(state));
        toast("data.json downloaded — commit it to data/data.json");
      };
      $("#dt-import").onclick = function () { $("#dt-import-file").click(); };
      $("#dt-import-file").onchange = function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function () {
          try {
            const incoming = Store.importState(reader.result);
            const choice = prompt("Type 'replace' to overwrite all current data, or 'merge' to add missing players/rounds.", "merge");
            if (choice === "replace") { state = incoming; }
            else if (choice === "merge") { state = Store.mergeState(state, incoming); }
            else { toast("Import cancelled"); return; }
            persist(); updateBrand(); render();
            toast("Data imported");
          } catch (err) {
            toast("Import failed: " + err.message, 4000);
          }
        };
        reader.readAsText(file);
      };
      $("#dt-reset").onclick = function () {
        if (confirm("Delete ALL data in this browser? Make sure you exported a backup.")) {
          state = Store.defaultState();
          persist(); selectedPlayerId = null; activeTab = "dashboard"; updateBrand(); render();
          toast("All data cleared");
        }
      };
    }, 0);

    return wrap;
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  function downloadFile(name, content) {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  // =========================================================================
  // SHELL: tabs, theme, brand
  // =========================================================================
  function updateBrand() {
    const el = document.getElementById("brand-name");
    if (el) el.textContent = state.team.name || "Hastings Golf";
  }

  function initTheme() {
    const saved = localStorage.getItem("hgt-theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.onclick = function () {
      const cur = document.documentElement.getAttribute("data-theme");
      const isDark = cur === "dark" || (!cur && window.matchMedia("(prefers-color-scheme: dark)").matches);
      const next = isDark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("hgt-theme", next);
      render();
    };
  }

  function init() {
    $$(".tab").forEach(function (t) {
      t.onclick = function () {
        activeTab = t.dataset.tab;
        selectedPlayerId = null;
        selectedEventId = null;
        render();
      };
    });
    initTheme();
    updateBrand();
    render();
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
