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

  function hasFlags(arr) {
    return Array.isArray(arr) && arr.some(function (v) { return v === true || v === false; });
  }
  function hasNums(arr) {
    return Array.isArray(arr) && arr.some(function (v) { return typeof v === "number"; });
  }

  // USGA-style score differential for an 18-hole round with course rating & slope.
  function differential(round) {
    if (round.holes !== 18 || !isComplete(round)) return null;
    if (!round.courseRating || !round.slopeRating) return null;
    return ((roundTotal(round) - round.courseRating) * 113) / round.slopeRating;
  }

  // Simplified handicap index: average of the lowest ~40% of differentials × 0.96.
  function handicapIndex(rounds) {
    const diffs = rounds
      .map(differential)
      .filter(function (d) { return d !== null; })
      .sort(function (a, b) { return a - b; });
    if (!diffs.length) return null;
    const k = Math.max(1, Math.round(diffs.length * 0.4));
    const best = diffs.slice(0, k);
    return (sum(best) / best.length) * 0.96;
  }

  function playerStats(state, playerId) {
    const rounds = roundsFor(state, playerId);
    if (!rounds.length) {
      return {
        rounds: 0,
        handicapIndex: null,
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

    // Advanced stats: prefer per-hole detail (like a real scorecard), else fall
    // back to any round-level totals from a simpler/imported entry.
    let fairwaysHit = 0, fairwaysPoss = 0, girHit = 0, girPoss = 0, putts = [];
    rounds.forEach(function (r) {
      if (hasFlags(r.fairways)) {
        r.fairways.forEach(function (v) {
          if (v === true) { fairwaysHit++; fairwaysPoss++; }
          else if (v === false) { fairwaysPoss++; }
        });
      } else if (r.stats) {
        fairwaysHit += Number(r.stats.fairways) || 0;
        fairwaysPoss += Number(r.stats.fairwaysPossible) || 0;
      }
      if (hasFlags(r.girs)) {
        r.girs.forEach(function (v) {
          if (v !== null) { girPoss++; if (v === true) girHit++; }
        });
      } else if (r.stats) {
        girHit += Number(r.stats.gir) || 0;
        girPoss += r.holes;
      }
      if (hasNums(r.putts)) {
        putts.push(sum(r.putts.map(function (p) { return Number(p) || 0; })));
      } else if (r.stats && r.stats.putts) {
        putts.push(Number(r.stats.putts));
      }
    });

    return {
      handicapIndex: handicapIndex(rounds),
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
    differential: differential,
    handicapIndex: handicapIndex,
    playerStats: playerStats,
    leaderboard: leaderboard,
    teamStats: teamStats,
    recentRounds: recentRounds,
  };
})(typeof window !== "undefined" ? window : this);
