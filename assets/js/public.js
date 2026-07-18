/* public.js — read-only public dashboard. Loads data/data.json (committed by the
 * coach) and renders team stats. No editing, no localStorage writes. */

(function () {
  "use strict";

  const $ = function (s) { return document.querySelector(s); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n, d) { return n == null || isNaN(n) ? "—" : Number(n).toFixed(d == null ? 1 : d); }
  function toParStr(tp) { return tp == null || isNaN(tp) ? "—" : tp === 0 ? "E" : tp > 0 ? "+" + tp : String(tp); }
  function toParClass(tp) { return tp === 0 ? "even" : tp < 0 ? "under" : "over"; }
  function statCard(num, label) {
    return '<div class="card stat"><div class="num">' + esc(num) + '</div><div class="label">' + esc(label) + '</div></div>';
  }

  function render(state) {
    document.getElementById("brand-name").textContent = state.team.name || "Hastings Golf";
    const sub = [];
    if (state.team.season) sub.push(state.team.season);
    if (state.team.coach) sub.push("Coach " + state.team.coach);
    if (state.updatedAt) sub.push("updated " + state.updatedAt.slice(0, 10));
    const subEl = document.getElementById("sub");
    if (subEl) subEl.textContent = sub.join(" · ");

    const app = $("#app");
    const ts = Stats.teamStats(state);

    if (!ts.totalRounds) {
      app.innerHTML = '<div class="card"><p class="empty">No rounds published yet. Check back soon.</p></div>';
      return;
    }

    const wrap = document.createElement("div");
    const stats = document.createElement("div");
    stats.className = "grid cols-4";
    stats.innerHTML =
      statCard(ts.activePlayers, "Players") +
      statCard(ts.totalRounds, "Rounds") +
      statCard(fmt(ts.teamScoringAvg), "Team avg (18)") +
      statCard(lowRound(state), "Low round");
    wrap.appendChild(stats);

    // Leaderboard
    const lb = document.createElement("div");
    lb.className = "card";
    lb.style.marginTop = "16px";
    lb.innerHTML = '<div class="section-head"><h2>🏆 Leaderboard</h2><span class="muted">by 18-hole scoring avg</span></div>';
    const tw = document.createElement("div");
    tw.className = "table-wrap";
    tw.innerHTML = '<table><thead><tr><th>#</th><th>Player</th><th></th><th class="num">Avg</th><th class="num">To Par</th><th class="num">Best</th><th class="num">Rds</th></tr></thead><tbody>' +
      ts.leaderboard.map(function (row, i) {
        const s = row.stats;
        return '<tr><td class="rank ' + (i === 0 ? "top" : "") + '">' + (i + 1) + '</td>' +
          '<td>' + esc(row.player.name) + '</td>' +
          '<td><span class="pill ' + (row.player.squad === "JV" ? "jv" : "") + '">' + esc(row.player.squad) + '</span></td>' +
          '<td class="num">' + fmt(s.scoringAvg18) + '</td>' +
          '<td class="num to-par ' + toParClass(Math.round(s.avgToPar18)) + '">' + (s.avgToPar18 != null ? toParStr(Math.round(s.avgToPar18)) : "—") + '</td>' +
          '<td class="num to-par ' + toParClass(s.best) + '">' + (s.best != null ? toParStr(s.best) : "—") + '</td>' +
          '<td class="num">' + s.rounds + '</td></tr>';
      }).join("") + '</tbody></table>';
    lb.appendChild(tw);
    wrap.appendChild(lb);

    // Team trend
    const trend = document.createElement("div");
    trend.className = "card";
    trend.style.marginTop = "16px";
    trend.innerHTML = '<div class="section-head"><h2>📈 Team scoring trend</h2></div><div class="chart-box" id="pub-trend"></div>';
    wrap.appendChild(trend);

    // Recent rounds
    const recent = document.createElement("div");
    recent.className = "card";
    recent.style.marginTop = "16px";
    recent.innerHTML = '<div class="section-head"><h2>⛳ Recent rounds</h2></div>';
    const rr = Stats.recentRounds(state, 12);
    const rw = document.createElement("div");
    rw.className = "table-wrap";
    rw.innerHTML = '<table><thead><tr><th>Date</th><th>Player</th><th>Course</th><th class="num">Score</th><th class="num">+/-</th></tr></thead><tbody>' +
      rr.map(function (r) {
        const p = state.players.find(function (x) { return x.id === r.playerId; });
        const tp = Stats.toPar(r);
        return '<tr><td>' + esc(r.date) + '</td><td>' + esc(p ? p.name : "—") + '</td>' +
          '<td>' + esc(r.course || "—") + (r.holes === 9 ? ' <span class="muted">(9)</span>' : '') + '</td>' +
          '<td class="num">' + Stats.roundTotal(r) + '</td>' +
          '<td class="num to-par ' + toParClass(tp) + '">' + toParStr(tp) + '</td></tr>';
      }).join("") + '</tbody></table>';
    recent.appendChild(rw);
    wrap.appendChild(recent);

    app.innerHTML = "";
    app.appendChild(wrap);

    const box = document.getElementById("pub-trend");
    const byDate = {};
    state.rounds.filter(Stats.isComplete).forEach(function (r) {
      (byDate[r.date] = byDate[r.date] || []).push(Stats.total18(r));
    });
    const points = Object.keys(byDate).sort().map(function (d) {
      const arr = byDate[d];
      return { label: d.slice(5), value: Math.round(arr.reduce(function (a, b) { return a + b; }, 0) / arr.length) };
    });
    Charts.lineChart(box, points, { ariaLabel: "Team scoring trend" });
  }

  function lowRound(state) {
    const c = state.rounds.filter(Stats.isComplete);
    if (!c.length) return "—";
    let best = Infinity;
    c.forEach(function (r) { best = Math.min(best, Stats.toPar(r)); });
    return toParStr(best);
  }

  function boot() {
    fetch("data/data.json", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        render(Store.migrate(data));
      })
      .catch(function (err) {
        $("#app").innerHTML =
          '<div class="banner warn">Could not load published data (' + esc(err.message) + ').<br>' +
          'The coach needs to export <code>data.json</code> from the tracker and commit it to <code>data/data.json</code>.</div>';
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
