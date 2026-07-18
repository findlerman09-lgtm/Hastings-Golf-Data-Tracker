/* stats.js — derived golf statistics from stored rounds.
 * All functions are pure: they take state/rounds and return computed numbers. */

(function (global) {
  "use strict";

  function sum(arr) {
    return arr.reduce(function (a, b) {
      return a + (Number(b) || 0);
    }, 0);
  }

  function isComplete(round) {
    return (
      Array.isArray(round.scores) &&
      round.scores.length === round.holes &&
      round.scores.every(function (s) { return typeof s === "number" && s > 0; })
    );
  }

  function roundTotal(round) {
    return sum(round.scores.filter(function (s) { return typeof s === "number"; }));
  }

  function coursePar(round) {
    return sum(round.pars);
  }

  function toPar(round) {
    return roundTotal(round) - coursePar(round);
  }

  // Normalize a 9-hole round to an 18-hole equivalent for fair comparison.
  function total18(round) {
    const t = roundTotal(round);
    return round.holes === 9 ? t * 2 : t;
  }

  function toPar18(round) {
    return round.holes === 9 ? toPar(round) * 2 : toPar(round);
  }

  function roundsFor(state, playerId) {
    return state.rounds
      .filter(function (r) { return r.playerId === playerId && isComplete(r); })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  function avg(nums) {
    if (!nums.length) return null;
    return sum(nums) / nums.length;
  }

  function playerStats(state, playerId) {
    const rounds = roundsFor(state, playerId);
    if (!rounds.length) {
      return {
        rounds: 0,
        scoringAvg18: null,
        avgToPar18: null,
        best: null,
        bestRound: null,
        worst: null,
        recentTrend: null,
        totals18: [],
        fairwayPct: null,
        girPct: null,
        puttsAvg: null,
      };
    }
    const totals18 = rounds.map(total18);
    const topars = rounds.map(toPar18);

    // Best/worst by to-par (per 18)
    let bestIdx = 0;
    let worstIdx = 0;
    topars.forEach(function (tp, i) {
      if (tp < topars[bestIdx]) bestIdx = i;
      if (tp > topars[worstIdx]) worstIdx = i;
    });

    // Trend: avg of last 3 vs. previous 3 (18-hole totals). Negative = improving.
    let recentTrend = null;
    if (rounds.length >= 4) {
      const last3 = totals18.slice(-3);
      const prev = totals18.slice(0, -3).slice(-3);
      if (prev.length) recentTrend = avg(last3) - avg(prev);
    }

    // Advanced stats aggregated across rounds that recorded them.
    let fairwaysHit = 0, fairwaysPoss = 0, girHit = 0, girPoss = 0, putts = [], hadAdv = 0;
    rounds.forEach(function (r) {
      if (r.stats) {
        hadAdv++;
        fairwaysHit += Number(r.stats.fairways) || 0;
        fairwaysPoss += Number(r.stats.fairwaysPossible) || 0;
        girHit += Number(r.stats.gir) || 0;
        girPoss += r.holes;
        if (r.stats.putts) putts.push(Number(r.stats.putts));
      }
    });

    return {
      rounds: rounds.length,
      scoringAvg18: avg(totals18),
      avgToPar18: avg(topars),
      best: topars[bestIdx],
      bestRound: rounds[bestIdx],
      worst: topars[worstIdx],
      worstRound: rounds[worstIdx],
      recentTrend: recentTrend,
      totals18: totals18,
      toPars18: topars,
      roundList: rounds,
      fairwayPct: fairwaysPoss ? (fairwaysHit / fairwaysPoss) * 100 : null,
      girPct: girPoss ? (girHit / girPoss) * 100 : null,
      puttsAvg: putts.length ? avg(putts) : null,
    };
  }

  function leaderboard(state, minRounds) {
    minRounds = minRounds || 1;
    return state.players
      .map(function (p) {
        const s = playerStats(state, p.id);
        return { player: p, stats: s };
      })
      .filter(function (row) { return row.stats.rounds >= minRounds; })
      .sort(function (a, b) {
        return (a.stats.scoringAvg18 || 999) - (b.stats.scoringAvg18 || 999);
      });
  }

  function teamStats(state) {
    const board = leaderboard(state, 1);
    const avgs = board.map(function (r) { return r.stats.scoringAvg18; }).filter(Boolean);
    const totalRounds = state.rounds.filter(isComplete).length;
    return {
      players: state.players.length,
      activePlayers: board.length,
      totalRounds: totalRounds,
      teamScoringAvg: avgs.length ? avg(avgs) : null,
      leaderboard: board,
    };
  }

  function recentRounds(state, limit) {
    return state.rounds
      .filter(isComplete)
      .slice()
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; })
      .slice(0, limit || 10);
  }

  global.Stats = {
    isComplete: isComplete,
    roundTotal: roundTotal,
    coursePar: coursePar,
    toPar: toPar,
    total18: total18,
    toPar18: toPar18,
    roundsFor: roundsFor,
    playerStats: playerStats,
    leaderboard: leaderboard,
    teamStats: teamStats,
    recentRounds: recentRounds,
  };
})(typeof window !== "undefined" ? window : this);
