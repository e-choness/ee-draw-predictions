// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Datasets derived from IRCC's rounds and the pool composition defaults. Pure functions: each takes rows and
// returns rows, so the runtime can cache them until a source file reloads.
import * as M from './eem.js';

/** Each IRCC round, labelled with a draw type taken from its name; newest first. */
export function toDraws(rounds) {
  const types = [
    [/provincial/i, 'pnp', 'Provincial Nominee Program'], [/canadian experience/i, 'cec', 'Canadian Experience Class'],
    [/french/i, 'french', 'French language'], [/health/i, 'health', 'Healthcare & social services'],
    [/trade/i, 'trades', 'Trades'], [/transport/i, 'transport', 'Transport'], [/stem/i, 'stem', 'STEM'],
    [/education/i, 'education', 'Education'], [/agri/i, 'agri', 'Agriculture & agri-food'],
    [/senior manager/i, 'senior', 'Senior managers'], [/physician/i, 'physicians', 'Physicians'],
    [/military/i, 'military', 'Military recruits'], [/general/i, 'general', 'General'],
  ];
  return rounds.map((r) => {
    const t = types.find(([re]) => re.test(r.drawName)) || [null, 'other', 'Other'];
    return { ...r, drawNumber: Number(r.drawNumber), drawSize: Number(r.drawSize), drawCRS: Number(r.drawCRS), key: t[1], category: t[2] };
  }).sort((a, b) => b.drawNumber - a.drawNumber);
}

/** Invitations issued each month, split into Canadian Experience Class, Provincial Nominee, French language and other categories. */
export function monthly(draws) {
  const m = new Map();
  draws.forEach((d) => {
    const k = d.drawDate.slice(0, 7);
    if (!m.has(k)) m.set(k, { month: k, cec: 0, pnp: 0, french: 0, other: 0, total: 0, draws: 0 });
    const r = m.get(k), g = ['cec', 'pnp', 'french'].includes(d.key) ? d.key : 'other';
    r[g] += d.drawSize; r.total += d.drawSize; r.draws += 1;
  });
  const keys = [...m.keys()].sort(), out = [];
  const [y0, m0] = keys[0].split('-').map(Number), [y1, m1] = keys[keys.length - 1].split('-').map(Number);
  for (let y = y0, mo = m0; y < y1 || (y === y1 && mo <= m1); mo === 12 ? (y++, mo = 1) : mo++) {
    const k = y + '-' + String(mo).padStart(2, '0');
    out.push(m.get(k) || { month: k, cec: 0, pnp: 0, french: 0, other: 0, total: 0, draws: 0 });
  }
  return out;
}

// IRCC's pool counts, oldest first, one per date. IRCC sometimes cites the same count under two dates
// (December 14 and 15, 2025 hold identical numbers): a count identical to the one before it is kept once.
export const distinctCounts = (rounds) => {
  const seen = new Map();
  rounds.forEach((r) => { if (!seen.has(r.distributionAsOn)) seen.set(r.distributionAsOn, r); });
  const sig = (r) => Array.from({ length: 18 }, (_, i) => r['dd' + (i + 1)]).join();
  return [...seen.values()].sort((a, b) => a.distributionAsOn.localeCompare(b.distributionAsOn)).filter((r, i, all) => i === 0 || sig(r) !== sig(all[i - 1]));
};

/** Total profiles and profiles at 451+ and 501+ in the latest pool count, against the one before. */
export function poolSummary(rounds) {
  const counts = distinctCounts(rounds);
  const now = counts[counts.length - 1], prev = counts[counts.length - 2] || now;
  const top = now.dd1 + now.dd2;
  return [{ asOf: now.distributionAsOn, prevAsOf: prev.distributionAsOn, total: now.dd18, change: now.dd18 - prev.dd18,
    above500: top, shareAbove500: top / now.dd18, above450: top + now.dd3, shareAbove450: (top + now.dd3) / now.dd18 }];
}

/** Profiles by score range at each IRCC pool count. */
export const poolTrend = (rounds) => distinctCounts(rounds).map((r) => ({
  asOf: r.distributionAsOn, b0: r.dd15 + r.dd16 + r.dd17, b401: r.dd9, b451: r.dd3, b501: r.dd2, b601: r.dd1, total: r.dd18,
}));

/** Every distinct IRCC pool count (profiles by CRS band), oldest first, flagged when it was scored under the rules in force since November 3, 2026. */
export const snapshots = (rounds) => distinctCounts(rounds).map((r) => {
  const o = { asOf: r.distributionAsOn, newRules: r.distributionAsOn >= M.RULES, total: r.dd18 };
  M.BANDS.forEach(([f]) => { o[f] = r[f]; });
  return o;
});

/**
 * For each draw type: its last round, usual size, how fast eligible profiles arrive between rounds, its share of the
 * whole pool and occupation mix, and how far the model was off when replayed on its recent rounds.
 */
export function drawTypes(draws, comp) {
  const day = 864e5, ms = (d) => Date.parse(d + 'T00:00:00Z'), iso = (t) => new Date(t).toISOString().slice(0, 10);
  const byKey = new Map(comp.map((r) => [r.key, r])), pool = byKey.get('pool') || {};
  const asc = [...draws].sort((a, b) => a.drawDate.localeCompare(b.drawDate) || a.drawNumber - b.drawNumber);
  const latest = asc[asc.length - 1].drawDate;
  // invitations per day over up to six gaps before index i: in a steady run of rounds, what each round
  // takes out is what arrived above the last cut-off since the round before
  const rateBefore = (list, i) => {
    const w = list.slice(Math.max(0, i - 7), i);
    if (w.length < 2) return w.length ? w[0].drawSize / 14 : 0;
    return w.slice(1).reduce((s, d) => s + d.drawSize, 0) / Math.max(7, (ms(w[w.length - 1].drawDate) - ms(w[0].drawDate)) / day);
  };
  const keys = [...new Set(asc.map((d) => d.key))].filter((k) => k !== 'military' && k !== 'other');
  const out = keys.map((key) => {
    const all = asc.filter((d) => d.key === key);
    const recent = all.filter((d) => ms(latest) - ms(d.drawDate) <= 365 * day);
    if (recent.length < 2 || all.length < 3) return null;
    const c = byKey.get(key) || {}, last = all[all.length - 1];
    const method = key === 'pnp' ? 'pattern' : c.eligibleShare ? 'pool' : c.hwShare != null ? 'shift' : 'pattern';
    const share = key === 'cec' ? pool.cwShare : c.eligibleShare;
    const tail = recent.slice(-7), gaps = tail.slice(1).map((d, i) => (ms(d.drawDate) - ms(tail[i].drawDate)) / day);
    const gap = Math.max(7, Math.round(M.median(gaps)));
    const floor = latest >= M.RULES ? ms(latest) + day : ms(M.RESUME);
    // replay the same model on this type's recent rounds, each against the pool count IRCC published before it
    const errs = [], naive = [];
    for (let i = Math.max(3, all.length - 8); i < all.length; i++) {
      const cur = all[i], prev = all[i - 1];
      if (prev.drawDate < M.RULES && cur.distributionAsOn >= M.RULES) continue;
      let pred;
      if (method === 'pool') {
        const inflow = rateBefore(all, i) * (ms(cur.drawDate) - ms(prev.drawDate)) / day;
        pred = M.cutoff(M.eligible(M.density(cur), share, prev.drawCRS, inflow), cur.drawSize).score;
      } else pred = M.median(all.slice(Math.max(0, i - 4), i).map((d) => d.drawCRS));
      errs.push(Math.abs(pred - cur.drawCRS));
      naive.push(Math.abs(prev.drawCRS - cur.drawCRS));
    }
    const mean = (a) => (a.length ? Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 10) / 10 : null);
    // turnover: how fast eligible profiles below the last cut-off are replaced once rounds reach into them.
    // Replayed on old-rules rounds of the last two years: from each round, the next two to four rounds at
    // their real dates and sizes, each against the pool count IRCC published before the first of them.
    // Only the second round on depends on turnover, so those are scored.
    const turnoverErr = method !== 'pool' ? null : M.TURNOVER.map((mu) => {
      let e = 0, n = 0;
      for (let i = 3; i < all.length - 2; i++) {
        const start = all[i], next = all.slice(i + 1, i + 5).filter((x) => x.drawDate < M.RULES);
        if (start.drawDate < iso(ms(latest) - 730 * day) || next.length < 2) continue;
        const p = M.path({ d: M.density(next[0]), share, c0: start.drawCRS, t0: start.drawDate, rate: rateBefore(all, i + 1), g: [[0, 1]], mu, rounds: next.map((x) => ({ date: x.drawDate, size: x.drawSize })) });
        for (let j = 1; j < p.length; j++) { e += Math.abs(p[j].cut - next[j].drawCRS); n++; }
      }
      return { mu, e, n };
    });
    const fitted = turnoverErr && turnoverErr[0].n >= 6 ? turnoverErr.reduce((b, x) => (x.e < b.e ? x : b)) : null;
    // the starting point for rounds under the new rules: the type's last round under the old rules
    const firstNew = all.findIndex((d) => d.drawDate >= M.RULES), baseIdx = firstNew < 0 ? all.length - 1 : firstNew - 1;
    const base = baseIdx >= 0 ? { date: all[baseIdx].drawDate, crs: all[baseIdx].drawCRS, size: all[baseIdx].drawSize, rate: rateBefore(all, baseIdx + 1) } : null;
    return {
      key, category: last.category, method: base ? method : 'pattern', draws12m: recent.length,
      lastDate: last.drawDate, lastCRS: last.drawCRS, lastSize: last.drawSize, lastAsOf: last.distributionAsOn, lastNumber: last.drawNumber,
      gapDays: gap, nextDate: M.offBreak(iso(Math.max(ms(last.drawDate) + gap * day, floor))),
      usualSize: Math.round(M.median(all.slice(-4).map((d) => d.drawSize))), ratePerDay: Math.round(rateBefore(all, all.length) * 10) / 10,
      pattern: Math.round(M.median(all.slice(-4).map((d) => d.drawCRS))),
      eligibleShare: share ?? null, cwShare: c.cwShare ?? null, hwShare: c.hwShare ?? null, mix: c.mix ?? null, basis: c.basis || '',
      replayError: mean(errs), replayNaive: mean(naive), replayN: errs.length,
      turnover: fitted ? fitted.mu : null, turnoverErr, turnoverOwn: !!fitted,
      base, since: (firstNew < 0 ? [] : all.slice(firstNew)).map((d) => ({ drawNumber: d.drawNumber, date: d.drawDate, size: d.drawSize, crs: d.drawCRS, asOf: d.distributionAsOn })),
      history: all.map((d) => ({ date: d.drawDate, crs: d.drawCRS, size: d.drawSize, drawNumber: d.drawNumber })),
    };
  }).filter(Boolean).sort((a, b) => b.draws12m - a.draws12m || a.category.localeCompare(b.category));
  // types with too little history take the turnover that fits every pool type's replays together
  const pooled = M.TURNOVER.map((mu, i) => ({ mu, e: out.reduce((s, t) => s + (t.turnoverErr ? t.turnoverErr[i].e : 0), 0) })).reduce((b, x) => (x.e < b.e ? x : b));
  out.forEach((t) => { if (t.method === 'pool' && t.turnover == null) t.turnover = pooled.mu; delete t.turnoverErr; });
  return out;
}
