// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// The projection engine: each draw type's next round and every round after it through the horizon, under the
// rules in force since November 3, 2026, corrected after each round IRCC publishes.
//
// Pure: it reads only the context (derived datasets) and the scenario it is given, so it runs the same in the
// browser and in tests. A scenario is the raw parameters { cat, size, next, hw, jo, cw }; percentages are 0–100
// and any of them may be unset.
import * as M from './eem.js';

const DAY = 864e5;
const ms = (d) => Date.parse(d + 'T00:00:00Z');
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const HORIZON = '2027-02-28';
// high-wage shares tried when refitting to the rounds under the new rules: 0 to 90%
const GRID = Array.from({ length: 46 }, (_, i) => i / 50);

export const isSet = (v) => !(v == null || v === '' || Number.isNaN(Number(v)));
/** A scenario percentage (0–100) as a share, or the default when it is not set. */
export const shareOf = (v, d) => (isSet(v) ? Math.max(0, Math.min(100, Number(v))) / 100 : d);

/** What every projection starts from, or null until the datasets are in. */
export function context(types, snaps, comp) {
  if (!types || !snaps || !snaps.length || !comp) return null;
  const pool = comp.find((r) => r.key === 'pool');
  if (!pool) return null;
  const latest = snaps[snaps.length - 1], old = [...snaps].reverse().find((x) => !x.newRules) || null;
  return { types, snaps, latest, old, live: latest.newRules, pool, comp };
}

/** Rounds are projected through February 2027, or four months past the latest round once that is later. */
export function horizon(c) {
  if (!c) return HORIZON;
  const last = c.types.reduce((m, t) => (t.lastDate > m ? t.lastDate : m), '');
  const roll = iso(ms(last) + 120 * DAY);
  return roll > HORIZON ? roll : HORIZON;
}

/** The round sizes offered for a type: a quarter to four times its usual size. */
export function sizeRange(t) {
  const lo = Math.max(50, Math.round(t.usualSize / 4 / 50) * 50), hi = Math.min(10000, Math.max(lo + 500, Math.round((t.usualSize * 4) / 250) * 250));
  return { lo, hi, step: hi <= 2000 ? 50 : 250 };
}

/** The engine for one context. Results are memoised until the context changes (a new engine is made then). */
export function createForecast(c) {
  const memo = new Map();
  const cached = (k, f) => { if (!memo.has(k)) memo.set(k, f()); return memo.get(k); };
  const density = (snap) => cached('density|' + snap.asOf, () => M.density(snap));

  // the scenario, resolved against the sourced defaults
  const cat = (s) => s.cat || 'cec';
  const size = (s) => (s.size == null ? null : Number(s.size));
  const jo = (s) => shareOf(s.jo, c.pool.joShare);
  const cw = (s) => shareOf(s.cw, c.pool.cwShare);
  const hwSet = (s) => isSet(s.hw);
  const type = (key) => c.types.find((t) => t.key === key) || null;
  const nextFor = (t, s) => (t.key === cat(s) && /^\d{4}-\d{2}-\d{2}$/.test(s.next || '') && s.next >= t.lastDate ? s.next : t.nextDate);

  // the points a type's eligible profiles gain at high-wage share h. Category rounds use their own occupations'
  // share, scaled by h against the sourced default, so a fitted or scenario share moves them too.
  const typeGains = (t, h, joV, cwV) => {
    const h0 = c.pool.hwShare, cwT = t.key === 'cec' ? 1 : t.cwShare ?? cwV;
    const hwT = Math.max(0, Math.min(1, t.hwShare == null ? h : h0 ? t.hwShare * (h / h0) : t.hwShare));
    const mixT = t.mix || c.pool.mix;
    return { cwT, hwT, mixT, g: M.gains(cwT, hwT, mixT, joV, c.pool.mix) };
  };

  // A type's rounds from its last round under the old rules and IRCC's last count under the old rules,
  // through the rounds it has held since at their real dates and sizes, then the rounds in `ahead`.
  // Each round held is projected before its size is taken out, so the misses show how the model is doing.
  const runType = (t, h, joV, cwV, ahead, o = {}) => {
    const snap = c.old || c.latest;
    const g = o.oldRules ? [[0, 1]] : typeGains(t, h, joV, cwV).g;
    const rounds = t.since.map((r) => ({ date: r.date, size: r.size })).concat(ahead);
    return M.path({ d: density(snap), share: t.key === 'cec' ? cwV : t.eligibleShare, c0: t.base.crs, t0: t.base.date, rate: t.base.rate, g, mu: t.turnover, rounds, keep: o.keep ?? -1 });
  };

  // the whole pool under the new rules: profiles with Canadian work gain the work points, the rest a job offer
  const rescorePool = (snap, hwV, joV, cwV) => {
    const d = M.density(snap), cec = c.types.find((t) => t.key === 'cec');
    const c0 = cec ? cec.lastCRS : 1201, inflow = cec ? cec.ratePerDay * Math.max(0, (ms(snap.asOf) - ms(cec.lastDate)) / DAY) * cwV : 0;
    const work = M.eligible(d, cwV, c0, inflow);
    for (let s = 601; s <= 1200; s++) work[s] = d[s] * cwV; // nominees: not cleared by CEC rounds
    const rest = d.map((v, s) => v - work[s]);
    const a = M.shift(work, M.gains(1, hwV, c.pool.mix, 0, c.pool.mix)), b = M.shift(rest, M.gains(0, 0, c.pool.mix, joV, c.pool.mix));
    return M.toBands(a.map((v, s) => v + b[s]));
  };

  // once IRCC publishes a count under the new rules: the high-wage share that best turns its last old count into it
  const impliedHw = (s) => cached('implied|' + jo(s) + '|' + cw(s), () => {
    if (!c.live || !c.old) return null;
    const cuts = [451, 471, 491, 501, 601], want = cuts.map((x) => M.BANDS.filter((b) => b[2] >= x).reduce((sum, b) => sum + c.latest[b[0]], 0));
    let best = null;
    for (let h = 0; h <= 1.0001; h += 0.01) {
      const got = rescorePool(c.old, h, jo(s), cw(s));
      const err = cuts.reduce((sum, x, i) => { const g = got.filter((b) => b.lo >= x).reduce((t, b) => t + b.v, 0); return sum + ((g - want[i]) / want[i]) ** 2; }, 0);
      if (!best || err < best.err) best = { h, err };
    }
    return best ? Math.round(best.h * 100) / 100 : null;
  });

  // Self-correction. Before any round under the new rules the high-wage share is the sourced default, or once
  // IRCC publishes a count under the new rules, the share that turns its last old count into that one. After
  // each round under the new rules, the share is refitted so the projections of every round held so far come
  // closest to the cut-offs IRCC drew. Each miss counts against the type's usual miss (a 5-point miss on a type
  // that usually misses by 3 weighs far more than on one that misses by 17), and moving the share by 10 points
  // costs as much as a 5-point miss on a 3-point type, so a single round can't swing it far. Each round's record
  // uses only the rounds before it, as it would have been shown.
  const hwPrior = (s) => cached('prior|' + jo(s) + '|' + cw(s), () => {
    const imp = c.live ? impliedHw(s) : null;
    return imp != null ? { h: imp, from: 'count' } : { h: c.pool.hwShare, from: 'sources' };
  });
  const calib = (s) => cached('calib|' + jo(s) + '|' + cw(s), () => {
    const prior = hwPrior(s), joV = jo(s), cwV = cw(s);
    const pool = c.types.filter((t) => t.method === 'pool' && t.since.length);
    const rows = pool.flatMap((t) => t.since.map((r, j) => ({ t, j, r }))).sort((a, b) => a.r.date.localeCompare(b.r.date) || a.r.drawNumber - b.r.drawNumber);
    if (!rows.length) return { h: prior.h, n: 0, prior, records: [] };
    const sims = new Map(pool.map((t) => [t.key, GRID.map((h) => runType(t, h, joV, cwV, []).map((x) => x.cut))]));
    const weight = new Map(pool.map((t) => [t.key, (3 / Math.max(3, t.replayError ?? 6)) ** 2]));
    const fit = (upto) => {
      let best = null;
      GRID.forEach((h, gi) => {
        let e = 25 * ((h - prior.h) / 0.1) ** 2;
        for (let i = 0; i < upto; i++) { const x = rows[i]; e += weight.get(x.t.key) * (sims.get(x.t.key)[gi][x.j] - x.r.crs) ** 2; }
        if (!best || e < best.e) best = { h, gi, e };
      });
      return best;
    };
    const records = rows.map((x, i) => {
      const f = fit(i), sim = sims.get(x.t.key)[f.gi];
      const anchor = x.j > 0 ? (x.t.since[x.j - 1].crs - sim[x.j - 1]) / 2 : 0;
      const projected = Math.round(sim[x.j] + anchor);
      return { key: x.t.key, category: x.t.category, drawNumber: x.r.drawNumber, date: x.r.date, size: x.r.size, actual: x.r.crs, projected, miss: x.r.crs - projected, h: f.h };
    });
    return { h: fit(rows.length).h, n: rows.length, prior, records };
  });
  // the high-wage share in use: the scenario value when one is set, otherwise the fitted one
  const hw = (s) => (hwSet(s) ? shareOf(s.hw, 0.4) : calib(s).h);

  // Provincial Nominee, Senior managers and Physicians rounds: the median of the last four cut-offs, with
  // rounds under the old rules lifted by the points every candidate gains (none known for nominees). After
  // rounds under the new rules, their average miss is added, shrunk toward zero: half of it after one round.
  const patternPlan = (t) => cached('pattern|' + t.key, () => {
    const S = t.method === 'shift' && t.mix && t.hwShare != null ? Math.round([70, 40, 20].reduce((sum, p, i) => sum + p * t.hwShare * t.mix[i], 0)) : 0;
    const adj = t.history.map((r) => ({ ...r, v: r.crs + (r.date < M.RULES ? S : 0) }));
    const records = []; let sum = 0, n = 0;
    adj.forEach((r, i) => {
      if (r.date < M.RULES || i < 1) return;
      const med = M.median(adj.slice(Math.max(0, i - 4), i).map((x) => x.v)), projected = Math.round(med + sum / (n + 1));
      records.push({ key: t.key, category: t.category, drawNumber: r.drawNumber, date: r.date, size: r.size, actual: r.crs, projected, miss: r.crs - projected });
      sum += r.crs - med; n++;
    });
    const med = M.median(adj.slice(-4).map((x) => x.v)), bias = sum / (n + 1);
    return { S, med, bias, n, projected: Math.round(med + bias), records };
  });
  // the likely range: the average miss under the new rules once there are two such rounds, before that the
  // average miss on old-rules rounds; it grows with the square root of the rounds ahead
  const errFor = (t, records) => {
    const own = records.filter((r) => r.key === t.key);
    if (own.length >= 2) return Math.max(3, Math.round(own.reduce((sum, r) => sum + Math.abs(r.miss), 0) / own.length));
    return Math.max(3, Math.round(t.replayError ?? 6));
  };
  // every round under the new rules with what was projected before it, newest first
  const track = (s) => cached('track|' + jo(s) + '|' + cw(s), () => {
    const pool = calib(s).records;
    const other = c.types.filter((t) => t.method !== 'pool').flatMap((t) => patternPlan(t).records);
    return pool.concat(other).sort((a, b) => b.date.localeCompare(a.date) || b.drawNumber - a.drawNumber);
  });

  // eligible profiles of a type at its next round (old scores), and the gains the new points give them
  const setup = (t, hwV, joV, cwV, next) => {
    const snap = c.old || c.latest;
    if (!snap) return null;
    const d = density(snap), sh = t.key === 'cec' ? cwV : t.eligibleShare;
    const days = Math.max(0, (ms(next) - ms(t.lastDate)) / DAY), inflow = t.base.rate * days;
    const a = M.eligible(d, sh, t.lastCRS, inflow);
    const G = typeGains(t, hwV, joV, cwV);
    const g = (h) => typeGains(t, Math.max(0, Math.min(1, h)), joV, cwV).g;
    return { snap, d, sh, days, inflow, a, cwT: G.cwT, hwT: G.hwT, mixT: G.mixT, rescore: true, g, after: M.shift(a, G.g) };
  };

  // projection for a draw type at a size (null = usual), under scenario s unless o overrides hw, jo, cw or next
  const project = (key, sz, s, o = {}) => {
    const hwV = o.hw ?? hw(s), joV = o.jo ?? jo(s), cwV = o.cw ?? cw(s);
    const t = type(key || cat(s)); if (!t) return null;
    const next = o.next || nextFor(t, s), n = Math.max(1, Math.round(sz ?? t.usualSize));
    return cached([t.key, n, hwV, joV, cwV, next].join('|'), () => {
      const base = { key: t.key, category: t.category, method: t.method, size: n, usual: n === t.usualSize, usualSize: t.usualSize, lastCRS: t.lastCRS, lastDate: t.lastDate, nextDate: next, t };
      if (t.method !== 'pool') {
        const p = patternPlan(t), err = errFor(t, p.records), tiers = [70, 40, 20].filter((x, i) => t.mix && t.mix[i] > 0);
        const spread = t.method === 'shift' && !p.n && tiers.length ? Math.round((Math.max(...tiers) - Math.min(...tiers)) / 2) : 0;
        // steps from the last cut-off: the recent median and the learned miss, then the new points lifting old-rules rounds
        const biasR = Math.round(p.bias), poolEffect = t.pattern - t.lastCRS + biasR;
        return { ...base, modelled: false, projected: p.projected, oldRule: t.pattern, poolEffect, ruleEffect: p.projected - t.lastCRS - poolEffect, sizeEffect: 0, err, spread, low: p.projected - err - spread, high: p.projected + err + spread, ruleShift: p.S, median: p.med, bias: p.bias, held: p.n };
      }
      const err = errFor(t, calib(s).records);
      if (t.since.length) {
        // rounds have run under the new rules: carry the pool through them, then this round
        const i = t.since.length, at = (h, size2, old, keep) => runType(t, h, joV, cwV, [{ date: next, size: size2 }], { oldRules: old, keep: keep ? i : -1 });
        const held = runType(t, hwV, joV, cwV, []), anchor = Math.round((t.since[i - 1].crs - held[i - 1].cut) / 2);
        const cut = at(hwV, n, false, true)[i], newU = at(hwV, t.usualSize)[i], oldN = at(hwV, n, true, true)[i];
        const lo = at(Math.max(0, hwV - 0.1), n)[i].cut + anchor, hi = at(Math.min(1, hwV + 0.1), n)[i].cut + anchor, projected = cut.cut + anchor;
        const G = typeGains(t, hwV, joV, cwV), snap = c.old || c.latest;
        return {
          ...base, modelled: true, assimilated: i, short: cut.short, projected, oldRule: oldN.cut + anchor,
          poolEffect: newU.cut + anchor - t.lastCRS, ruleEffect: 0, ruleIn: true, sizeEffect: cut.cut - newU.cut,
          low: Math.min(lo, hi, projected) - err, high: Math.max(lo, hi, projected) + err, err, hwLo: lo, hwHi: hi,
          anchor, held: held.map((x, j) => ({ ...t.since[j], sim: x.cut })), snapAsOf: snap.asOf, poolTotal: snap.total, stock: cut.eligible, withPoints: cut.withPoints,
          cwT: G.cwT, hwT: G.hwT, mixT: G.mixT, jo: joV, rescore: true, a: oldN.T, after: cut.T, baseDate: t.base.date, baseCRS: t.base.crs,
        };
      }
      const m = setup(t, hwV, joV, cwV, next);
      if (!m) return null;
      const oldN = M.cutoff(m.a, n), oldU = M.cutoff(m.a, t.usualSize), newU = M.cutoff(m.after, t.usualSize), cut = M.cutoff(m.after, n);
      const lo = M.cutoff(M.shift(m.a, m.g(hwV - 0.1)), n).score, hi = M.cutoff(M.shift(m.a, m.g(hwV + 0.1)), n).score;
      const gains = m.g(hwV), stock = m.a.reduce((sum, v) => sum + v, 0), still = (gains.find(([p]) => p === 0) || [0, 0])[1];
      return {
        ...base, modelled: true, short: cut.short, projected: cut.score, oldRule: oldN.score,
        poolEffect: oldU.score - t.lastCRS, ruleEffect: newU.score - oldU.score, sizeEffect: cut.score - newU.score,
        low: Math.min(lo, cut.score) - err, high: Math.max(hi, cut.score) + err, err, hwLo: lo, hwHi: hi,
        snapAsOf: m.snap.asOf, poolTotal: m.snap.total, belowLast: m.d.slice(0, t.lastCRS).reduce((sum, v) => sum + v, 0),
        share: m.sh, backlog: m.a.slice(0, t.lastCRS).reduce((sum, v) => sum + v, 0), days: m.days, inflow: m.inflow, stock,
        cwT: m.cwT, hwT: m.hwT, mixT: m.mixT, jo: joV, rescore: m.rescore, gains, gainers: stock * (1 - still), a: m.a, after: m.after,
      };
    });
  };

  // Every round of a type from the next one through the horizon: its usual gap and size (the selected type
  // takes the scenario size for each round), with the year-end break skipped. Always at least the next round.
  const schedule = (t, sz, next) => {
    const H = horizon(c), out = [];
    for (let date = next; out.length < 40 && (!out.length || date <= H); date = M.offBreak(iso(ms(date) + t.gapDays * DAY))) out.push({ date, size: sz });
    return out;
  };
  const plan = (key, s) => {
    const t = type(key || cat(s)); if (!t) return null;
    const h = hw(s), joV = jo(s), cwV = cw(s), sel = t.key === cat(s) && size(s) != null;
    const sz = sel ? size(s) : t.usualSize, next = nextFor(t, s);
    return cached(['plan', t.key, h, joV, cwV, sz, next].join('|'), () => {
      const ahead = schedule(t, sz, next);
      if (t.method !== 'pool') {
        const p = project(t.key, sz, s), pp = patternPlan(t);
        return { t, method: t.method, records: pp.records, rounds: ahead.map((r, k) => { const e = (p.err + (p.spread || 0)) * Math.sqrt(k + 1); return { ...r, projected: p.projected, low: Math.round(p.projected - e), high: Math.round(p.projected + e), withPoints: null }; }) };
      }
      const n0 = t.since.length, err = errFor(t, calib(s).records);
      const mid = runType(t, h, joV, cwV, ahead), lo = runType(t, Math.max(0, h - 0.1), joV, cwV, ahead), hi = runType(t, Math.min(1, h + 0.1), joV, cwV, ahead);
      const miss = n0 ? t.since[n0 - 1].crs - mid[n0 - 1].cut : 0;
      const rounds = ahead.map((r, k) => {
        const i = n0 + k, off = n0 ? Math.round(miss * 0.5 ** (k + 1)) : 0, e = err * Math.sqrt(k + 1);
        const p = mid[i].cut + off, a = Math.min(lo[i].cut, hi[i].cut, mid[i].cut) + off, b = Math.max(lo[i].cut, hi[i].cut, mid[i].cut) + off;
        return { ...r, projected: p, low: Math.round(a - e), high: Math.round(b + e), withPoints: mid[i].withPoints, eligible: mid[i].eligible, short: mid[i].short };
      });
      return { t, method: 'pool', records: calib(s).records.filter((r) => r.key === t.key), rounds, h };
    });
  };

  // the pool by score band before and after the new points: IRCC's count under the new rules once there is one,
  // otherwise IRCC's last count rescored with the scenario
  const poolView = (s) => {
    const hwV = hw(s), joV = jo(s), cwV = cw(s);
    return cached(['pool', hwV, joV, cwV].join('|'), () => {
      const bandsOf = (snap) => M.BANDS.map(([f, band, lo, hi]) => ({ band, lo, hi, v: snap[f] }));
      const before = bandsOf(c.live && c.old ? c.old : c.latest);
      const after = c.live ? bandsOf(c.latest) : rescorePool(c.latest, hwV, joV, cwV);
      const rows = before.map((r, i) => ({ band: r.band, lo: r.lo, hi: r.hi, before: r.v, after: Math.round(after[i].v) }));
      const sum = (min, k) => rows.filter((r) => r.lo >= min).reduce((t, r) => t + r[k], 0);
      return { live: c.live, asOf: c.latest.asOf, beforeAsOf: (c.live && c.old ? c.old : c.latest).asOf, rows,
        before501: sum(501, 'before'), after501: sum(501, 'after'), before451: sum(451, 'before'), after451: sum(451, 'after') };
    });
  };

  return {
    jo, cw, hw, hwSet, type, nextFor, hwPrior, calib, track, impliedHw, poolView, plan,
    project, cur: (s) => project(cat(s), size(s), s),
  };
}
