// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Pool scores: the rescoring of November 3 reverse-calculated from IRCC's counts on either side of it, and how well
// it reproduces IRCC's count under the new rules, band by band.
import { model } from '../state.js';
import { BANDS } from '../model/eem.js';
import { num, pctOf, date, signed } from '../ui/format.js';

const T = () => model.transition();
const shareAt = (t, lo, hi) => { let v = 0; for (let s = lo; s <= hi; s++) v += t.hw[s]; return v / (hi - lo + 1); };

/** The high-wage share by old score, as a phrase: "6% at 350 and below, rising to 56% at 500 and above". */
export const curveText = (t) => {
  const k = t.knots, l = t.levels.map((v) => pctOf(Math.round(v * 100) / 100));
  // knots past the point where the share stops rising add nothing
  let last = l.length - 1; while (last > 0 && t.levels[last] - t.levels[last - 1] < 0.005) last--;
  const mid = k.slice(1, last).map((s, i) => l[i + 1] + ' at ' + s);
  return l[0] + ' at ' + k[0] + ' and below, ' + (mid.length ? mid.join(', ') + ', ' : '') + 'rising to ' + l[last] + ' at ' + k[last] + ' and above';
};

/** What went into the reverse calculation and what it found. */
export function revNote(el) {
  const t = T();
  if (!t) { el.textContent = ''; return; }
  const usual = Math.round(t.driftPerDay * t.days);
  el.textContent = 'IRCC’s count of ' + date(t.from) + ' is carried to ' + date(t.to) + ', still on old scores: the '
    + num(Math.round(t.removed)) + ' profiles invited in the rounds between the two counts leave, and '
    + num(usual) + ' arrive at the pool’s usual pace for ' + t.days + ' days (each band at its own rate over the seven months before), plus '
    + num(Math.round(t.extra)) + ' more than usual. Rescored, it matches IRCC’s count of ' + date(t.to) + ' when, among profiles with Canadian work, the high-wage share is '
    + curveText(t) + ' (' + pctOf(Math.round(t.hwAvg * 1000) / 1000) + ' on average), '
    + (t.jo < 0.005 ? 'no job offers are needed' : 'job offers lift ' + pctOf(Math.round(t.jo * 1000) / 1000) + ' of the profiles without it')
    + ', and the Canadian Experience Class profiles that arrived since its last round sit just above its cut-off'
    + (t.fill < 0.99 ? ' (' + pctOf(Math.round(t.fill * 100) / 100) + ' of them; the rest spread like the pool)' : '') + '.'
    + (t.pnpDraw ? ' Of the ' + num(t.bands[t.bands.length - 1].ircc) + ' profiles at 601+, round #' + t.pnpDraw + ' invited ' + num(t.nominees) + ' nominees, leaving '
      + num(t.nonNominees) + ' the new points lifted past 600; the reconstruction has ' + num(Math.round(t.lifted)) + '.'
      + ' That small number rules out many job offers among profiles above 500, where 50 to 100 points would cross 600. Below 500 the counts alone can’t tell gains from Canadian work and from job offers apart.' : '')
    + ' The projections start from this pool, scaled band by band to IRCC’s count.';
}

/** IRCC's two counts, the reconstruction, and the high-wage share fitted at each old score. */
export function revTable(tb) {
  tb.replaceChildren();
  const t = T(), c = model.ctx();
  if (!t || !c) return;
  t.bands.forEach((b, k) => {
    const tr = document.createElement('tr'), old = c.old ? c.old[BANDS[k][0]] : null;
    const top = k === t.bands.length - 1;
    [b.band, old == null ? '—' : num(old), num(b.ircc), num(b.fitted), top ? 'nominees' : signed(Math.round((b.fitted / b.ircc - 1) * 1000) / 10) + '%', top ? '—' : pctOf(Math.round(shareAt(t, b.lo, Math.min(600, b.hi)) * 100) / 100)].forEach((v, i) => {
      const td = document.createElement('td');
      if (i) td.className = 'num';
      td.textContent = v;
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
}
