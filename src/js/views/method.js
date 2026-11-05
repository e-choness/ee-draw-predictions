// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Method and sources: the calculator's receipt (every step of the projection for the inputs set), the sourced
// values quoted in the text, and how each draw type's method does when replayed on past rounds.
import { store, model } from '../state.js';
import { RULES, tail } from '../model/eem.js';
import { num, signed, date, pctOf } from '../ui/format.js';
import { typeCell } from '../ui/dom.js';

const comp = () => { const c = model.ctx(); return c ? c.pool : null; };
const pc = (v) => (v == null ? '—' : pctOf(v));
const mixText = (m) => (m ? m.map((v) => Math.round(v * 100) + '%').join(' / ') : '—');
const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
const cats = () => {
  const c = model.ctx(); if (!c) return '—';
  const g = (k) => c.comp.find((r) => r.key === k);
  return [['health', 'healthcare'], ['trades', 'trades'], ['transport', 'transport'], ['stem', 'STEM']].map(([k, n]) => (g(k) ? n + ' ' + pc(g(k).hwShare) : null)).filter(Boolean).join(', ');
};
const text = (f) => (el) => { el.textContent = f(); };

/** Sourced values quoted in the Pool scores and Method text. */
export const sourceValues = {
  'c-cw': text(() => pc(comp() && comp().cwShare)),
  'c-hw': text(() => pc(comp() && comp().hwShare)),
  'c-jo': text(() => pc(comp() && comp().joShare)),
  'c-mix': text(() => mixText(comp() && comp().mix)),
  'c-cats': text(cats),
  'src-cw': text(() => pc(comp() && comp().cwShare)),
  'src-hw': text(() => (comp() ? pc(comp().hwShare) + ' (' + mixText(comp().mix) + ')' : '—')),
  'src-jo': text(() => pc(comp() && comp().joShare)),
  'src-cat': text(cats),
  'asof-long': text(() => { const c = model.ctx(); return c ? date((c.live && c.old ? c.old : c.latest).asOf) : 'latest'; }),
};

// where the high-wage share in use comes from
const hwSource = () => {
  if (model.hwSet()) return 'Scenario value';
  const f = model.calib();
  return f.n ? 'Refitted to ' + plural(f.n, 'round') + ' under the new rules' : f.prior.from === 'count' ? 'From IRCC’s first count under the new rules' : 'Sourced default';
};
const hwNote = (t) => {
  if (t.key === 'cec' || t.hwShare == null) return hwSource();
  const c = comp(), h = model.hw();
  return 'This category’s occupations, weighted by people' + (c && Math.abs(h - c.hwShare) > 0.005 ? ', scaled by ' + pc(h) + ' in use against ' + pc(c.hwShare) + ' sourced' : '');
};

/** The sourced defaults, and the high-wage share in use, under the calculator's inputs. */
export function calcDefaults(el) {
  const c = comp(), imp = model.impliedHw();
  el.textContent = !c ? '' : 'Sourced defaults: ' + pc(c.cwShare) + ' with Canadian work, ' + pc(c.hwShare) + ' of them in high-wage jobs, ' + pc(c.joShare) + ' job offers.'
    + (imp != null ? ' IRCC’s first count under the new rules fits a high-wage share of about ' + pc(imp) + '.' : '')
    + (model.hwSet() ? '' : ' High-wage share in use: ' + pc(model.hw()) + ' (' + hwSource().toLowerCase() + ').');
}

/* ---------- The receipt ---------- */

// one line of the receipt: operator, label (with an optional note), value
const line = (box, op, label, val, opts = {}) => {
  const row = document.createElement('div'); row.className = 'ee-rc-row' + (opts.cls ? ' ' + opts.cls : '');
  const o = document.createElement('span'); o.className = 'ee-rc-op'; o.textContent = op || '';
  const l = document.createElement('span'); l.className = 'ee-rc-label'; l.textContent = label;
  if (opts.note) { const s = document.createElement('small'); s.textContent = opts.note; l.appendChild(s); }
  const v = document.createElement('span'); v.className = 'ee-rc-val'; v.textContent = val;
  row.append(o, l, v); box.appendChild(row);
};
const head = (box, label) => { const h = document.createElement('div'); h.className = 'ee-rc-head'; h.textContent = label; box.appendChild(h); };
const n0 = (v) => num(Math.round(v));
const delta = (a, b) => (a == null || b == null ? '—' : signed(a - b));

// counting down from the top of the eligible profiles: the cut-off is the first score where the count reaches the size
const ladder = (box, r, c, oldLabel) => {
  const tl = tail(r.after), tlOld = tail(r.a);
  [c + 10, c + 5, c + 2, c + 1, c, c - 1, c - 5].filter((s) => s >= 0 && s <= 1200).forEach((s) => {
    line(box, s === c ? '◀' : '', 'Eligible scoring ' + s + ' or more', n0(tl[s]), { cls: s === c ? 'ee-rc-cut' : 'ee-rc-ladder', note: (s === c ? 'First score where the count reaches ' + num(r.size) + '. ' : '') + oldLabel + n0(tlOld[s]) });
  });
};

// Provincial Nominee, Senior managers and Physicians: the recent median, plus the new points where they apply
function patternReceipt(box, r) {
  const t = r.t;
  head(box, r.category + ': recent rounds');
  line(box, '', 'Median cut-off of the last four rounds', String(t.pattern), { note: 'Last round ' + date(t.lastDate) + ' at ' + t.lastCRS + (t.lastDate >= RULES ? ', new rules' : ', old rules') });
  if (r.method === 'shift') {
    line(box, '+', 'New points, on the old-rules rounds among them', signed(r.ruleEffect), { note: 'Each old-rules round is lifted by ' + r.ruleShift + ' points: all eligible candidates have 12+ months of Canadian work in high-wage occupations (' + mixText(t.mix) + ' in 2× / 1.5× / 1.3×), so the whole group moves up together' });
  } else {
    line(box, '', 'New points', 'not added', { note: 'Nearly every nominee is invited, so the cut-off is the lowest-scoring nominee. Pool counts can’t place that score: 601+ is one IRCC band' });
  }
  if (r.held) line(box, '+', 'Learned from rounds under the new rules', signed(Math.round(r.bias)), { note: 'Average miss over ' + plural(r.held, 'round') + ', shrunk toward zero (' + r.held + ' of ' + (r.held + 1) + ')' });
  line(box, '=', 'Projected cut-off', String(r.projected), { cls: 'ee-rc-total' });
  line(box, '', 'Likely range', r.low + ' to ' + r.high, { note: (r.held >= 2 ? 'Average miss under the new rules: ' : 'Average miss of this method on recent rounds: ') + r.err + ' points' + (r.spread ? ', plus ' + r.spread + ' for the spread between occupation tiers' : '') });
}

// a type that has had rounds under the new rules: the pool carried through them, then this round
function carriedReceipt(box, r) {
  const t = r.t, c = r.projected, last = r.held[r.held.length - 1], cm = c - r.anchor;
  head(box, 'Carried through the rounds under the new rules');
  line(box, '', 'Start: last round under the old rules', String(r.baseCRS), { note: date(r.baseDate) + '. IRCC pool count of ' + date(r.snapAsOf) + ' (' + n0(r.poolTotal) + ' profiles), rescored with the new points' });
  r.held.forEach((h) => line(box, '', 'Draw #' + h.drawNumber + ', ' + date(h.date) + ', ' + num(h.size) + ' invited', 'drew ' + h.crs, { note: 'Carried to this round, the model gives ' + h.sim + '. Its invitees leave; new profiles arrive at ' + num(Math.round(t.base.rate)) + ' a day and replace the invited at the pool’s rate of new points' }));
  line(box, '=', 'Eligible at the next round, ' + date(r.nextDate), n0(r.stock), { cls: 'ee-rc-sub' });
  head(box, 'New points');
  line(box, '', 'Of those with Canadian work, in high-wage occupations', pc(r.hwT), { note: hwNote(t) });
  if (r.withPoints != null) line(box, '', 'Invitees with new points at this round', pc(r.withPoints), { note: 'Falls as the high-wage profiles waiting are invited; those replacing them gain the points only as often as the pool does' });
  head(box, 'Where ' + num(r.size) + ' invitations run out');
  ladder(box, r, cm, 'Same rounds under the old rules: ');
  line(box, '+', 'Half the last round’s miss', signed(r.anchor), { note: 'Draw #' + last.drawNumber + ' drew ' + last.crs + '; the model carried to it gave ' + last.sim });
  line(box, '=', 'Projected cut-off', String(c), { cls: 'ee-rc-total' });
  line(box, '', 'Likely range', r.low + ' to ' + r.high, { note: 'High-wage share ±10 points gives ' + Math.min(r.hwLo, r.hwHi) + ' to ' + Math.max(r.hwLo, r.hwHi) + '; plus the ' + r.err + '-point average miss' });
  head(box, 'From the last cut-off');
  line(box, '', 'Last cut-off, new rules', String(r.lastCRS));
  line(box, '+', 'Pool since', signed(r.poolEffect), { note: 'At the usual size (' + num(r.usualSize) + '): ' + (r.lastCRS + r.poolEffect) + ', the new points already in the pool' });
  line(box, '+', 'Draw size', signed(r.sizeEffect), { note: r.usual ? 'Usual size' : num(r.size) + ' instead of ' + num(r.usualSize) });
  line(box, '=', 'Projected', String(c), { cls: 'ee-rc-sub' });
}

// the first round under the new rules: who can be invited, the points they gain, where the invitations run out
function firstRoundReceipt(box, r) {
  const t = r.t, isCec = r.key === 'cec';
  head(box, 'Who can be invited');
  line(box, '', 'IRCC pool count, ' + date(r.snapAsOf), n0(r.poolTotal), { note: 'Every profile in the pool, by CRS band' });
  line(box, '', 'Below the last cut-off, ' + r.lastCRS, n0(r.belowLast), { note: 'Last ' + r.category + ' round ' + date(r.lastDate) + '; everyone eligible above it was invited' });
  line(box, '×', isCec ? 'Share with 12+ months of Canadian work' : 'Share eligible for this round', pc(r.share), { note: isCec ? 'CEC-eligible share of the whole pool' : t.basis });
  line(box, '=', 'Eligible, waiting below ' + r.lastCRS, n0(r.backlog));
  line(box, '+', 'Arrivals above ' + r.lastCRS + ' until ' + date(r.nextDate), n0(r.inflow), { note: num(Math.round(t.base.rate * 10) / 10) + ' a day (invitations per day over recent rounds) × ' + Math.round(r.days) + ' days' });
  line(box, '=', 'Eligible at the next round', n0(r.stock), { cls: 'ee-rc-sub' });

  head(box, 'New points, rules from November 3');
  if (r.rescore) {
    const withWork = r.stock * r.cwT;
    line(box, '×', 'With Canadian work', pc(r.cwT) + ' = ' + n0(withWork), { note: isCec ? 'Every CEC candidate has Canadian work' : 'Whole-pool share' });
    line(box, '×', 'Of those, in high-wage occupations', pc(r.hwT), { note: hwNote(t) });
    [70, 40, 20].forEach((pts, i) => line(box, '', '  +' + pts + ' points (' + ['2×', '1.5×', '1.3×'][i] + ' occupations, ' + Math.round(r.mixT[i] * 100) + '%)', n0(withWork * r.hwT * r.mixT[i]), { cls: 'ee-rc-indent' }));
    if (r.cwT < 1) {
      const without = r.stock * (1 - r.cwT);
      line(box, '×', 'No Canadian work, high-wage job offer', pc(r.jo) + ' of ' + n0(without), { note: '100, 70 or 50 points; the factor takes the higher of work or offer, so offers only lift these profiles' });
    }
    line(box, '=', 'Profiles gaining points', n0(r.gainers) + ' (' + pc(r.gainers / r.stock) + ')', { cls: 'ee-rc-sub' });
  } else {
    line(box, '', 'Already in IRCC’s count', 'no rescoring', { note: 'The last round and the pool count both use the new rules' });
  }

  head(box, 'Where ' + num(r.size) + ' invitations run out');
  ladder(box, r, r.projected, 'Before the new points: ');
  line(box, '=', 'Projected cut-off', String(r.projected), { cls: 'ee-rc-total' });
  line(box, '', 'Likely range', r.low + ' to ' + r.high, { note: 'High-wage share ±10 points gives ' + r.hwLo + ' to ' + r.hwHi + '; plus the ' + r.err + '-point average miss on recent rounds' });

  head(box, 'From the last cut-off');
  line(box, '', 'Last cut-off, old rules', String(r.lastCRS));
  line(box, '+', 'Pool and pause', signed(r.poolEffect), { note: 'Same pool on old scores at the usual size (' + num(r.usualSize) + '): ' + (r.lastCRS + r.poolEffect) });
  line(box, '+', 'New points', signed(r.ruleEffect));
  line(box, '+', 'Draw size', signed(r.sizeEffect), { note: r.usual ? 'Usual size' : num(r.size) + ' instead of ' + num(r.usualSize) });
  line(box, '=', 'Projected', String(r.projected), { cls: 'ee-rc-sub' });
}

// what moves the projection: the same calculation with one input changed
function whatMovesIt(box, r) {
  const c = r.projected, isCec = r.key === 'cec';
  head(box, 'What moves it');
  const sens = document.createElement('div'); sens.className = 'ee-sensi';
  const chip = (label, v) => { const d = document.createElement('div'); const a = document.createElement('span'); a.textContent = label; const b = document.createElement('b'); b.textContent = v; d.append(a, b); sens.appendChild(d); };
  const up = model.project(r.key, r.size + 1000), down = r.size > 1000 ? model.project(r.key, r.size - 1000) : null;
  chip('1,000 more invitations', up ? delta(up.projected, c) : '—');
  chip('1,000 fewer invitations', down ? delta(down.projected, c) : '—');
  chip('High-wage share +10 points', delta(r.hwHi, c));
  if (isCec) { const cw = model.project(r.key, r.size, { cw: Math.min(1, model.cw() + 0.1) }); chip('Canadian work share +10 points', cw ? delta(cw.projected, c) : '—'); }
  else { const jo = model.project(r.key, r.size, { jo: Math.min(1, model.jo() + 0.05) }); chip('Job offers +5 points', jo ? delta(jo.projected, c) : '—'); }
  const wk = model.project(r.key, r.size, { next: new Date(Date.parse(r.nextDate + 'T00:00:00Z') + 7 * 864e5).toISOString().slice(0, 10) });
  chip('Round a week later', wk ? delta(wk.projected, c) : '—');
  box.appendChild(sens);
}

/** The calculator's receipt for the next round of the selected type. */
export function calcReceipt(box) {
  box.replaceChildren();
  const r = model.cur();
  if (!r) { const e = document.createElement('div'); e.className = 'ee-empty'; e.textContent = 'Loading IRCC data…'; box.appendChild(e); return; }
  if (!r.modelled) { patternReceipt(box, r); return; }
  if (r.assimilated) carriedReceipt(box, r); else firstRoundReceipt(box, r);
  whatMovesIt(box, r);
}

/** How each draw type's method does when replayed on its recent rounds. */
export function replayTable(tb) {
  tb.replaceChildren();
  const types = store.rows('types');
  if (!types) return;
  const names = { pool: 'Pool calculation', shift: 'Recent median + new points', pattern: 'Recent median' };
  types.forEach((t) => {
    const tr = document.createElement('tr'); tr.dataset.key = t.key;
    const turn = t.method !== 'pool' || !t.turnover ? 'n/a' : 'about ' + Math.round(1 / t.turnover) + ' days' + (t.turnoverOwn ? '' : ', all types');
    [null, names[t.method], t.replayN, t.replayError == null ? '—' : t.replayError.toFixed(1), t.replayNaive == null ? '—' : t.replayNaive.toFixed(1), t.method === 'pool' ? pc(t.eligibleShare) : 'n/a', turn].forEach((v, i) => {
      const td = document.createElement('td');
      if (i >= 2 && i <= 4) td.className = 'num';
      if (i === 0) typeCell(td, t.key, t.category); else td.textContent = v;
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
}
