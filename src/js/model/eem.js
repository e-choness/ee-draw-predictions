// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Model math under the CRS rules in force since November 3, 2026: the pool as profiles per score, who is eligible
// for a round, the points the new rules add, where a round's invitations run out, and rounds carried forward.
// Pure functions over plain arrays; no DOM, no state.

export const RULES = '2026-11-03', RESUME = '2026-11-17';
// IRCC's bands: field, label, lowest and highest score
export const BANDS = [['dd17', '0–300', 0, 300], ['dd16', '301–350', 301, 350], ['dd15', '351–400', 351, 400],
  ['dd14', '401–410', 401, 410], ['dd13', '411–420', 411, 420], ['dd12', '421–430', 421, 430], ['dd11', '431–440', 431, 440], ['dd10', '441–450', 441, 450],
  ['dd8', '451–460', 451, 460], ['dd7', '461–470', 461, 470], ['dd6', '471–480', 471, 480], ['dd5', '481–490', 481, 490], ['dd4', '491–500', 491, 500],
  ['dd2', '501–600', 501, 600], ['dd1', '601–1200', 601, 1200]];
export const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// profiles at each score 0..1200, keeping every band total. Bands up to 50 points wide are spread evenly;
// 501-600 thins out from the 491-500 density (exponential), instead of 100 equal steps
export const density = (snap) => {
  const d = new Float64Array(1201);
  BANDS.forEach(([f, , lo, hi]) => { for (let s = lo; s <= hi; s++) d[s] = (snap[f] || 0) / (hi - lo + 1); });
  const f0 = (snap.dd4 || 0) / 10, tot = snap.dd2 || 0;
  if (f0 > 0 && tot > 0 && tot < 100 * f0) {
    let lo = 1e-6, hi = 3;
    for (let it = 0; it < 60; it++) { const k = (lo + hi) / 2, s = f0 * Math.exp(-k) * (1 - Math.exp(-k * 100)) / (1 - Math.exp(-k)); if (s > tot) lo = k; else hi = k; }
    const k = (lo + hi) / 2; let sum = 0;
    for (let i = 0; i < 100; i++) { d[501 + i] = f0 * Math.exp(-k * (i + 1)); sum += d[501 + i]; }
    for (let i = 0; i < 100; i++) d[501 + i] *= tot / sum;
  }
  return d;
};
// tail[s] = profiles at s or above
export const tail = (a) => { const t = new Float64Array(1202); for (let s = 1200; s >= 0; s--) t[s] = t[s + 1] + a[s]; return t; };
// profiles eligible for a draw type when it runs: below the last cut-off c0, the type's whole-pool share;
// at or above c0, everyone eligible was invited, so only those who arrived since (inflow), spread like the pool
// up to 600. Scores of 601+ carry a provincial nomination and are invited in Provincial Nominee rounds.
export const eligible = (d, share, c0, inflow) => {
  const a = new Float64Array(1201), t = tail(d), top = c0 <= 600 ? 601 : 1201;
  const up = (t[Math.min(1200, c0)] - (top <= 1200 ? t[top] : 0)) || 1, k = Math.min(1, inflow / up);
  for (let s = 0; s <= 1200; s++) a[s] = s < c0 ? d[s] * share : s < top ? d[s] * k : 0;
  return a;
};
// points gained under the Nov 3 rules: with Canadian work, +70/+40/+20 for 2x/1.5x/1.3x occupations;
// without Canadian work, a high-wage job offer gives 100/70/50. With Canadian work an offer in the same
// tier never beats the work points (factor takes the higher), so offers only count for the rest
export const gains = (cw, hw, mix, jo, joMix) => {
  const g = new Map(), add = (p, q) => { if (q > 0) g.set(p, (g.get(p) || 0) + q); };
  add(0, cw * (1 - hw)); [70, 40, 20].forEach((p, i) => add(p, cw * hw * mix[i]));
  add(0, (1 - cw) * (1 - jo)); [100, 70, 50].forEach((p, i) => add(p, (1 - cw) * jo * joMix[i]));
  return [...g];
};
export const shift = (a, g) => {
  const out = new Float64Array(1201);
  for (let s = 0; s <= 1200; s++) if (a[s]) g.forEach(([p, q]) => { out[Math.min(1200, s + p)] += a[s] * q; });
  return out;
};
// the lowest score still invited when n profiles are invited from the top
export const cutoff = (a, n) => {
  const t = tail(a);
  for (let s = 1200; s >= 0; s--) if (t[s] >= n) return { score: s, short: false };
  let low = 0; while (low < 1200 && !a[low]) low++;
  return { score: low, short: true };
};
export const toBands = (a) => BANDS.map(([f, band, lo, hi]) => { let v = 0; for (let s = lo; s <= hi; s++) v += a[s]; return { f, band, lo, hi, v }; });

// the day a projected round falls on: IRCC holds rounds on weekdays, and none over the year-end break
// (none from December 19 to January 4 since 2024). A round in the break moves to the same weekday in the
// first week of January; one on a weekend moves to the Monday after.
export const offBreak = (iso) => {
  const [y, m, dd] = iso.split('-').map(Number);
  let t = Date.UTC(y, m - 1, dd);
  if ((m === 12 && dd >= 19) || (m === 1 && dd <= 4)) {
    const wd = new Date(t).getUTCDay();
    t = Date.UTC(m === 12 ? y + 1 : y, 0, 5);
    while (new Date(t).getUTCDay() !== wd) t += 864e5;
  }
  const wd = new Date(t).getUTCDay();
  if (wd === 6 || wd === 0) t += (wd === 6 ? 2 : 1) * 864e5;
  return new Date(t).toISOString().slice(0, 10);
};

// Rounds after the next: the eligible profiles carried from round to round.
// Profiles are kept by their old-rules score and the points they gain (g: [[points, share], ...]), and a
// round invites from the top of score plus points. Below the last cut-off c0 the eligible profiles are the
// type's share of the pool (target). When rounds reach into them they recover at rate mu a day, but the
// profiles that replace them carry the new points only at the population rate g, not at the rate of those
// invited: 12 months in a high-wage job or a high-wage offer is a higher bar than the old turnover had.
// Above c0, profiles arrive at `rate` a day, spread like the pool up to 600 and never more than the pool
// count holds there. With no round before it, the first round equals the single-round calculation.
export const path = ({ d, share, c0, t0, rate, g, mu, rounds, keep = -1 }) => {
  const N = 1201, K = g.length, top = c0 <= 600 ? 601 : 1201, tl = tail(d);
  const up = (tl[Math.min(1200, c0)] - (top <= 1200 ? tl[top] : 0)) || 1;
  const target = new Float64Array(N), arr = new Float64Array(N);
  for (let s = 0; s < N; s++) { if (s < c0) target[s] = d[s] * share; else if (s < top) arr[s] = d[s] / up; }
  const W = g.map(([, p]) => target.map((v) => v * p)), A = g.map(() => new Float64Array(N));
  let t = Date.parse(t0 + 'T00:00:00Z');
  return rounds.map((r, i) => {
    const days = Math.max(0, (Date.parse(r.date + 'T00:00:00Z') - t) / 864e5), f = 1 - Math.exp(-mu * days);
    t = Date.parse(r.date + 'T00:00:00Z');
    for (let s = 0; s < N; s++) {
      if (target[s] > 0) {
        let have = 0; for (let k = 0; k < K; k++) have += W[k][s];
        const gap = target[s] - have;
        if (gap > 0) for (let k = 0; k < K; k++) W[k][s] += f * gap * g[k][1];
      }
      if (arr[s] > 0) {
        let have = 0; for (let k = 0; k < K; k++) have += A[k][s];
        const add = Math.min(arr[s] * rate * days, Math.max(0, d[s] - have));
        if (add > 0) for (let k = 0; k < K; k++) A[k][s] += add * g[k][1];
      }
    }
    const T = new Float64Array(N);
    for (let k = 0; k < K; k++) { const p = g[k][0]; for (let s = 0; s < N; s++) { const v = W[k][s] + A[k][s]; if (v) T[Math.min(1200, s + p)] += v; } }
    const c = cutoff(T, r.size), tt = tail(T), eligibleN = tt[0];
    const frac = c.short || !T[c.score] ? 1 : Math.min(1, Math.max(0, (r.size - (c.score < 1200 ? tt[c.score + 1] : 0)) / T[c.score]));
    let invited = 0, withPoints = 0;
    for (let k = 0; k < K; k++) {
      const p = g[k][0];
      for (let s = 0; s < N; s++) {
        const ns = Math.min(1200, s + p);
        if (ns < c.score) continue;
        const take = ns === c.score ? frac : 1, v = (W[k][s] + A[k][s]) * take;
        invited += v; if (p > 0) withPoints += v;
        W[k][s] *= 1 - take; A[k][s] *= 1 - take;
      }
    }
    return { date: r.date, size: r.size, cut: c.score, short: c.short, eligible: eligibleN, withPoints: invited ? withPoints / invited : 0, T: i === keep ? T : null };
  });
};
// turnover rates tried when fitting each draw type's history (per day)
export const TURNOVER = [1 / 365, 1 / 180, 1 / 90, 1 / 60, 1 / 40, 1 / 25, 1 / 15, 1 / 10];
