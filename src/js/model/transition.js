// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// The rescoring of November 3, 2026, reverse-calculated from IRCC's own counts: its last count under the old rules
// and its first under the new ones. The pool before is carried to the date of the count after (the rounds held in
// between taken out, the usual arrivals added), and the points gained are fitted so that pool, rescored, adds up to
// IRCC's count after, band by band. What the fit can't explain is kept as a ratio per band, so the projections start
// from a pool that matches IRCC's count exactly. Pure: plain arrays in, plain arrays out.
import * as M from './eem.js';

const N = 1201, DAY = 864e5;
const ms = (d) => Date.parse(d + 'T00:00:00Z');
const TOP = M.BANDS.length - 1; // 601–1200: nominees, plus anyone the new points lift past 600
const BAND = new Int8Array(N);
M.BANDS.forEach(([, , lo, hi], b) => { for (let s = lo; s <= hi; s++) BAND[s] = b; });
const sumOf = (a, lo = 0, hi = N - 1) => { let v = 0; for (let s = lo; s <= hi; s++) v += a[s]; return v; };
const bandsOf = (a) => { const o = new Float64Array(M.BANDS.length); for (let s = 0; s < N; s++) o[BAND[s]] += a[s]; return o; };

/** Old scores where the high-wage share is fitted; it is linear between them and flat beyond. */
export const KNOTS = [350, 400, 450, 500, 550];
/** The high-wage share at every old score from its values at the knots. */
export const curve = (levels) => {
  const a = new Float64Array(N);
  for (let s = 0; s < N; s++) {
    let v;
    if (s <= KNOTS[0]) v = levels[0];
    else if (s >= KNOTS[KNOTS.length - 1]) v = levels[levels.length - 1];
    else { let j = 0; while (s > KNOTS[j + 1]) j++; v = levels[j] + ((s - KNOTS[j]) / (KNOTS[j + 1] - KNOTS[j])) * (levels[j + 1] - levels[j]); }
    a[s] = Math.max(0, Math.min(1, v));
  }
  return a;
};

// coordinate descent within bounds, halving the step when no move helps
const descend = (x0, lo, hi, loss) => {
  let x = [...x0], e = loss(x), step = 0.2;
  while (step > 5e-4) {
    let moved = false;
    for (let i = 0; i < x.length; i++) for (const dir of [1, -1]) {
      const y = [...x]; y[i] = Math.max(lo[i], Math.min(hi[i], y[i] + dir * step * (hi[i] - lo[i])));
      const ey = loss(y);
      if (ey < e) { x = y; e = ey; moved = true; }
    }
    if (!moved) step /= 2;
  }
  return { x, e };
};

/**
 * The rescoring reverse-calculated from IRCC's last count before November 3 and its first after, or null until
 * both exist. draws: every round, labelled (toDraws); snaps: IRCC's counts (snapshots); types: drawTypes; comp: the
 * pool composition rows.
 */
export function transition(draws, snaps, types, comp) {
  const pool = comp.find((r) => r.key === 'pool'), byKey = new Map(types.map((t) => [t.key, t])), cec = byKey.get('cec');
  const before = [...snaps].reverse().find((s) => !s.newRules), after = snaps.find((s) => s.newRules);
  if (!pool || !cec || !cec.base || !before || !after) return null;
  const asc = [...draws].sort((a, b) => a.drawDate.localeCompare(b.drawDate) || a.drawNumber - b.drawNumber);
  // rounds after a count and before the next: a round on a count's date comes after that count
  const between = (a, b) => asc.filter((r) => r.drawDate >= a && r.drawDate < b);

  // a type's invitations per day over up to six gaps before its round i, as drawTypes measures it: only rounds
  // before it, so a round IRCC holds later never changes what this calculation finds
  const rateAt = (h, i) => {
    const w = h.slice(Math.max(0, i - 7), i);
    if (w.length < 2) return w.length ? w[0].size / 14 : 0;
    return w.slice(1).reduce((v, x) => v + x.size, 0) / Math.max(7, (ms(w[w.length - 1].date) - ms(w[0].date)) / DAY);
  };
  // the profiles a round invited, by old score: its type's eligible profiles at or above its cut-off, scaled to its
  // size. Provincial Nominee rounds invite nominees (601+); types without a pool share, from the whole pool.
  const invited = (d, r) => {
    const t = byKey.get(r.key), el = new Float64Array(N);
    if (r.key === 'pnp') for (let s = 601; s < N; s++) el[s] = d[s];
    else if (t && t.eligibleShare != null) {
      const i = t.history.findIndex((x) => x.drawNumber === r.drawNumber), prev = i > 0 ? t.history[i - 1] : null;
      if (prev) el.set(M.eligible(d, t.eligibleShare, prev.crs, (rateAt(t.history, i) * (ms(r.drawDate) - ms(prev.date))) / DAY));
      else el.set(d);
    } else el.set(d);
    for (let s = 0; s < Math.min(N, r.drawCRS); s++) el[s] = 0;
    const tot = sumOf(el), k = tot > 0 ? Math.min(1, r.drawSize / tot) : 0;
    for (let s = 0; s < N; s++) el[s] *= k;
    return el;
  };

  // 1. The usual drift of each band, per day: its change between IRCC's old-rules counts over the seven months
  // before the change, with the profiles each round invited added back. It is what arrives, net of what leaves.
  const counts = snaps.filter((s) => !s.newRules), since = ms(before.asOf) - 210 * DAY;
  const drift = new Float64Array(M.BANDS.length);
  let span = 0;
  for (let i = 1; i < counts.length; i++) {
    const a = counts[i - 1], b = counts[i];
    if (ms(a.asOf) < since) continue;
    const d = M.density(a), inv = new Float64Array(N);
    between(a.asOf, b.asOf).forEach((r) => invited(d, r).forEach((v, s) => { inv[s] += v; }));
    const ib = bandsOf(inv);
    M.BANDS.forEach(([f], k) => { drift[k] += b[f] - a[f] + ib[k]; });
    span += (ms(b.asOf) - ms(a.asOf)) / DAY;
  }
  if (!span) return null;
  for (let k = 0; k < drift.length; k++) drift[k] /= span;

  // 2. The count before, carried to the date of the count after, still on old scores: the rounds held in between
  // take out who they invited, and each band drifts as usual, spread like the band itself.
  const days = (ms(after.asOf) - ms(before.asOf)) / DAY, d0 = M.density(before), d = Float64Array.from(d0), b0 = bandsOf(d0);
  let removed = 0;
  between(before.asOf, after.asOf).forEach((r) => { const inv = invited(d, r); for (let s = 0; s < N; s++) { removed += Math.min(d[s], inv[s]); d[s] = Math.max(0, d[s] - inv[s]); } });
  for (let s = 0; s < N; s++) { const k = BAND[s]; if (b0[k] > 0) d[s] = Math.max(0, d[s] + (drift[k] * days * d0[s]) / b0[k]); }
  // Nominees: a Provincial Nominee round invites nearly every nominee in the pool, so one held within three days of
  // the count says how many of its 601+ were nominees. The rest of 601+ are profiles the new points lifted past 600.
  const pnp = asc.find((r) => r.key === 'pnp' && r.drawDate >= after.asOf && ms(r.drawDate) - ms(after.asOf) <= 3 * DAY);
  const nomCarried = sumOf(d, 601), nominees = pnp ? Math.min(after.dd1, pnp.drawSize) : nomCarried;
  for (let s = 601; s < N; s++) d[s] = nomCarried > 0 ? (d[s] * nominees) / nomCarried : nominees / 600;
  // the arrivals the usual drift doesn't account for (more than usual came in around the change), spread like the pool
  const below = sumOf(d, 0, 600), extra = after.total - nominees - below;
  for (let s = 0; s <= 600; s++) d[s] = Math.max(0, d[s] + (extra * d[s]) / below);

  // who has Canadian work, at the count's date: below the last CEC cut-off under the old rules, the pool's share;
  // above it, only CEC profiles that arrived since that round, at the rate CEC rounds had been inviting them. How
  // they spread above the cut-off (the share `fill` just above it, the rest like the pool) is fitted below.
  const c0 = cec.base.crs, inflow = cec.base.rate * Math.max(0, (ms(after.asOf) - ms(cec.base.date)) / DAY);
  let work, rest, splitFill = null;
  const split = (fill) => {
    if (fill === splitFill) return;
    work = M.eligible(d, pool.cwShare, c0, inflow, null, fill); rest = new Float64Array(N); splitFill = fill;
    for (let s = 0; s <= 600; s++) rest[s] = Math.max(0, d[s] - work[s]);
    for (let s = 601; s < N; s++) work[s] = 0;
  };

  // 3. Rescoring: with Canadian work, +70/+40/+20 at the high-wage share for that old score (the census split
  // between 2×, 1.5× and 1.3× occupations); without it, a high-wage job offer. Nominees stay at 601+.
  const rescore = (h, jo, fill) => {
    split(fill);
    const out = new Float64Array(N);
    let lifted = 0;
    for (let s = 601; s < N; s++) out[s] = d[s];
    for (let s = 0; s <= 600; s++) {
      const w = work[s], r = rest[s];
      if (!w && !r) continue;
      const put = (p, q) => { if (!q) return; const ns = Math.min(1200, s + p); out[ns] += q; if (ns > 600) lifted += q; };
      put(0, w * (1 - h[s]) + r * (1 - jo));
      [70, 40, 20].forEach((p, i) => put(p, w * h[s] * pool.mix[i]));
      [100, 70, 50].forEach((p, i) => put(p, r * jo * pool.mix[i]));
    }
    return { bands: bandsOf(out), lifted };
  };

  // 4. The fit: the high-wage share at each knot (never falling as scores rise: the steps up are fitted), the
  // job-offer share and how CEC arrivals spread above the cut-off, so the rescored pool adds up to IRCC's count in
  // every band, and to the profiles past 600 that are not nominees.
  const obs = M.BANDS.map(([f]) => after[f] || 0), nonNominees = pnp ? Math.max(0, after.dd1 - nominees) : null;
  const J = KNOTS.length, levels = (x) => { let v = 0; return KNOTS.map((_, i) => (v = Math.min(1, v + x[i]))); };
  const loss = (x) => {
    const f = rescore(curve(levels(x)), x[J], x[J + 1]);
    let e = 0;
    for (let k = 0; k < TOP; k++) if (obs[k] > 0) e += ((f.bands[k] - obs[k]) / (Math.sqrt(obs[k]) + 0.02 * obs[k])) ** 2;
    if (nonNominees != null) e += ((f.lifted - nonNominees) / (Math.sqrt(nonNominees) + 30)) ** 2;
    return e;
  };
  const x0 = [0.05, 0.1, 0.1, 0.1, 0.05, 0.02, 0], fit = descend(x0, x0.map(() => 0), [1, 1, 1, 1, 1, 0.2, 1], loss);
  const lv = levels(fit.x), hw = curve(lv), jo = fit.x[J], fill = fit.x[J + 1], res = rescore(hw, jo, fill);
  let wh = 0, wt = 0;
  for (let s = 0; s <= 600; s++) { wh += work[s] * hw[s]; wt += work[s]; }

  // 5. What the fit leaves over, as a ratio per band: IRCC's count over the rescored pool (past 600, the profiles
  // that are not nominees). The projections scale each type's profiles by it, so the pool they start from is IRCC's.
  const ratio = new Float64Array(N);
  const bands = M.BANDS.map(([f, band, lo, hi], k) => {
    const model = k === TOP ? res.lifted : res.bands[k], want = k === TOP ? nonNominees : obs[k];
    const r = want == null || !(model > 0) ? 1 : want / model;
    for (let s = lo; s <= hi; s++) ratio[s] = r;
    return { band, lo, hi, ircc: obs[k], fitted: Math.round(res.bands[k]), ratio: r };
  });

  return {
    from: before.asOf, to: after.asOf, days, d, total: after.total,
    knots: KNOTS, levels: lv, hw, hwAvg: wt ? wh / wt : pool.hwShare, jo, fill,
    nominees, nonNominees, lifted: res.lifted, pnpDraw: pnp ? pnp.drawNumber : null,
    removed, driftPerDay: drift.reduce((v, x) => v + x, 0), extra, bands, ratio, loss: fit.e,
  };
}
