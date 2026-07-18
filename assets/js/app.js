/* app.js — coach-facing application UI for the Hastings Golf Data Tracker. */

(function () {
  "use strict";

  let state = Store.load();
  let activeTab = "dashboard";
  let selectedPlayerId = null;

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
    switch (activeTab) {
      case "dashboard": app.appendChild(renderDashboard()); break;
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
  function roundForm(roundId, presetPlayerId) {
    const editing = !!roundId;
    const r = editing
      ? JSON.parse(JSON.stringify(state.rounds.find(function (x) { return x.id === roundId; })))
      : {
          playerId: presetPlayerId || (state.players[0] && state.players[0].id),
          date: new Date().toISOString().slice(0, 10),
          course: "", tee: "", holes: 18,
          pars: Store.standardPars(18), scores: new Array(18).fill(null),
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
      '<label>Scorecard <span class="help">Enter par + strokes for each hole. Totals update live.</span></label>' +
      '<div id="rf-scorecard" class="scorecard"></div>' +
      '<hr class="divider">' +
      '<details><summary style="cursor:pointer;font-weight:600;color:var(--muted)">Advanced stats (optional)</summary>' +
      '<div class="form-row" style="margin-top:12px">' +
      '<div class="field"><label>Fairways hit</label><input type="number" id="rf-fw" min="0" value="' + (r.stats && r.stats.fairways != null ? r.stats.fairways : "") + '"></div>' +
      '<div class="field"><label>Fairways possible</label><input type="number" id="rf-fwp" min="0" value="' + (r.stats && r.stats.fairwaysPossible != null ? r.stats.fairwaysPossible : "") + '"></div>' +
      '<div class="field"><label>Greens in reg</label><input type="number" id="rf-gir" min="0" value="' + (r.stats && r.stats.gir != null ? r.stats.gir : "") + '"></div>' +
      '<div class="field"><label>Total putts</label><input type="number" id="rf-putts" min="0" value="' + (r.stats && r.stats.putts != null ? r.stats.putts : "") + '"></div>' +
      '</div></details>' +
      '<div class="field" style="margin-top:12px"><label>Notes</label><textarea id="rf-notes" rows="2">' + esc(r.notes) + '</textarea></div>' +
      '<div class="btn-row" style="justify-content:space-between">' +
      (editing ? '<button class="btn-danger" id="rf-del">Delete round</button>' : '<span></span>') +
      '<div class="btn-row"><button id="rf-cancel">Cancel</button><button class="btn-primary" id="rf-save">Save round</button></div></div>';

    openModal(editing ? "Edit round" : "Log round", form, { wide: true });

    // Local working copy of pars/scores.
    let pars = r.pars.slice();
    let scores = r.scores.slice();
    let photo = r.photo;

    function buildScorecard() {
      const holes = Number($("#rf-holes").value);
      if (pars.length !== holes) { pars = Store.standardPars(holes); }
      if (scores.length !== holes) { scores = new Array(holes).fill(null); }
      const box = $("#rf-scorecard");
      const nums = [];
      for (var i = 1; i <= holes; i++) nums.push(i);
      const half = holes === 18 ? 9 : holes;

      function seg(start, end) {
        let h = "<tr><th>Hole</th>";
        for (var i = start; i < end; i++) h += "<th>" + (i + 1) + "</th>";
        h += '<th class="hole-total">' + (holes === 18 ? (start === 0 ? "Out" : "In") : "Tot") + "</th></tr>";
        h += "<tr><th>Par</th>";
        for (var j = start; j < end; j++) h += '<td><input class="par-in" data-i="' + j + '" type="number" min="3" max="6" value="' + (pars[j] || "") + '"></td>';
        h += '<td class="hole-total" data-partot="' + start + '"></td></tr>';
        h += "<tr><th>Score</th>";
        for (var k = start; k < end; k++) h += '<td><input class="sc-in" data-i="' + k + '" type="number" min="1" max="15" value="' + (scores[k] == null ? "" : scores[k]) + '"></td>';
        h += '<td class="hole-total" data-sctot="' + start + '"></td></tr>';
        return "<table>" + h + "</table>";
      }

      let html = seg(0, half);
      if (holes === 18) html += '<div style="height:8px"></div>' + seg(9, 18);
      html += '<p style="margin-top:8px;font-weight:700">Total: <span id="rf-total">—</span> &nbsp; Par: <span id="rf-par">—</span> &nbsp; <span id="rf-topar" class="to-par"></span></p>';
      box.innerHTML = html;

      box.querySelectorAll(".par-in").forEach(function (inp) {
        inp.oninput = function () { pars[Number(inp.dataset.i)] = inp.value === "" ? 0 : Number(inp.value); recalc(); };
      });
      box.querySelectorAll(".sc-in").forEach(function (inp) {
        inp.oninput = function () { scores[Number(inp.dataset.i)] = inp.value === "" ? null : Number(inp.value); recalc(); };
      });
      recalc();
    }

    function recalc() {
      const holes = Number($("#rf-holes").value);
      const half = holes === 18 ? 9 : holes;
      function sumRange(arr, a, b) {
        let s = 0; for (var i = a; i < b; i++) s += Number(arr[i]) || 0; return s;
      }
      const box = $("#rf-scorecard");
      box.querySelectorAll("[data-partot]").forEach(function (td) {
        const start = Number(td.dataset.partot);
        td.textContent = sumRange(pars, start, start + half);
      });
      box.querySelectorAll("[data-sctot]").forEach(function (td) {
        const start = Number(td.dataset.sctot);
        const v = sumRange(scores, start, start + half);
        td.textContent = v || "";
      });
      const totScore = sumRange(scores, 0, holes);
      const totPar = sumRange(pars, 0, holes);
      $("#rf-total").textContent = totScore || "—";
      $("#rf-par").textContent = totPar || "—";
      const tp = totScore - totPar;
      const el = $("#rf-topar");
      if (totScore && totPar) {
        el.textContent = toParStr(tp);
        el.className = "to-par " + toParClass(tp);
      } else { el.textContent = ""; }
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
        if (parsed && parsed.scores.length) {
          parsed.scores.forEach(function (v, i) { if (i < scores.length) scores[i] = v; });
          buildScorecard();
          renderPhotoArea(photo,
            '<div class="ocr-status">Detected <b>' + parsed.scores.length + '</b> scores ' +
            '<span class="confidence ' + parsed.confidence + '">(' + parsed.confidence + ' confidence)</span>. ' +
            'Please review and correct below.</div>');
          toast("Scorecard read — review the numbers");
        } else {
          renderPhotoArea(photo, '<div class="ocr-status">Couldn\'t read scores automatically — photo saved, enter scores manually.</div>');
        }
      }).catch(function (err) {
        console.error(err);
        renderPhotoArea(photo, '<div class="ocr-status" style="color:var(--warn)">' + esc(err.message) + '. Photo ' + (photo ? "saved" : "not saved") + ' — enter scores manually.</div>');
      });
    };

    $("#rf-holes").onchange = buildScorecard;
    buildScorecard();
    if (photo) renderPhotoArea(photo, "");

    $("#rf-cancel").onclick = closeModal;
    $("#rf-save").onclick = function () {
      const fw = $("#rf-fw").value, fwp = $("#rf-fwp").value, gir = $("#rf-gir").value, putts = $("#rf-putts").value;
      let advStats = null;
      if (fw !== "" || fwp !== "" || gir !== "" || putts !== "") {
        advStats = {
          fairways: fw === "" ? null : Number(fw),
          fairwaysPossible: fwp === "" ? null : Number(fwp),
          gir: gir === "" ? null : Number(gir),
          putts: putts === "" ? null : Number(putts),
        };
      }
      const data = {
        playerId: $("#rf-player").value,
        date: $("#rf-date").value,
        course: $("#rf-course").value.trim(),
        tee: $("#rf-tee").value.trim(),
        holes: Number($("#rf-holes").value),
        pars: pars, scores: scores,
        stats: advStats, photo: photo,
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
      '<p class="muted">' + state.players.length + ' players · ' + state.rounds.length + ' rounds · ' +
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
