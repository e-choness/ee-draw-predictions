// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Forecast page tables: every projected round, the track record under the new rules, and every draw type side by side.
// Selecting a row of another type selects that type in the scenario.
import { store, scenario, model } from '../state.js';
import { num, signed, date, pctOf } from '../ui/format.js';
import { css } from '../ui/theme.js';
import { cell, typeCell, emptyRow } from '../ui/dom.js';

const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
const clickable = (tr, key, picked) => {
  tr.className = 'ee-click' + (picked ? ' is-picked' : '');
  tr.addEventListener('click', () => { if (key !== scenario.cat()) scenario.pick(key); });
};

/** Every projected round through the horizon, by date: every type, or only the selected one. */
export function roundsTable(tb) {
  tb.replaceChildren();
  const types = store.rows('types');
  if (!types || !model.ctx()) return;
  const cur = scenario.cat(), all = scenario.rounds() === 'all';
  const rows = types.filter((t) => all || t.key === cur).flatMap((t) => {
    const p = model.plan(t.key);
    return p ? p.rounds.map((q, i) => ({ ...q, key: t.key, category: t.category, prev: i ? p.rounds[i - 1].projected : t.lastCRS })) : [];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.category.localeCompare(b.category));
  if (!rows.length) { emptyRow(tb, 7, 'No rounds to project.'); return; }
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.dataset.key = r.key + ',' + r.date;
    clickable(tr, r.key, all && r.key === cur);
    cell(tr, date(r.date));
    cell(tr, null, '', r);
    cell(tr, num(r.size), 'num');
    cell(tr, String(r.projected), 'num');
    cell(tr, r.low + ' to ' + r.high, 'num');
    cell(tr, signed(r.projected - r.prev), 'num');
    cell(tr, r.withPoints == null ? 'n/a' : Math.round(r.withPoints * 100) + '%', 'num');
    tb.appendChild(tr);
  });
}

/** What was projected before each round under the new rules, and what IRCC drew. */
export function trackTable(tb) {
  tb.replaceChildren();
  if (!model.ctx()) return;
  const rows = model.track();
  if (!rows.length) { emptyRow(tb, 7, 'No rounds under the new rules yet. Each round IRCC holds after the rescoring pause is listed here with the cut-off projected before it.'); return; }
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.dataset.key = String(r.drawNumber);
    cell(tr, '#' + r.drawNumber, 'num');
    cell(tr, date(r.date));
    cell(tr, null, '', r);
    cell(tr, num(r.size), 'num');
    cell(tr, String(r.projected), 'num');
    cell(tr, String(r.actual), 'num');
    cell(tr, signed(r.miss), 'num');
    tb.appendChild(tr);
  });
}

/** The track record in a sentence, and where the high-wage share in use comes from. */
export function trackNote(el) {
  if (!model.ctx()) { el.textContent = ''; return; }
  const cal = model.calib(), rows = model.track(), n = rows.length;
  const miss = n ? rows.reduce((s, r) => s + Math.abs(r.miss), 0) / n : 0;
  const share = model.hwSet()
    ? 'The high-wage share is set to ' + pctOf(model.hw()) + ' in the scenario, so it is not refitted.'
    : 'High-wage share in use: ' + pctOf(cal.h) + (cal.n ? ', refitted to ' + plural(cal.n, 'round') + ' under the new rules.' : cal.prior.from === 'count' ? ', from IRCC’s first count under the new rules.' : ', the sourced default until rounds under the new rules come in.');
  el.textContent = (n ? plural(n, 'round') + ' so far, missed by ' + miss.toFixed(1) + ' points on average. Each projection uses only the rounds before it. ' : '') + share;
}

/** Every draw type's next round at its usual size (the selected type at the selected size), with how it is built. */
export function typesTable(tb) {
  tb.replaceChildren();
  const types = store.rows('types');
  if (!types) return;
  const cur = scenario.cat();
  const rows = types.map((t) => model.project(t.key, t.key === cur ? scenario.size() : null)).filter(Boolean);
  const maxAbs = Math.max(20, ...rows.map((r) => Math.abs(r.projected - r.lastCRS)));
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.dataset.key = r.key + ',' + r.size;
    clickable(tr, r.key, r.key === cur);
    const vals = [null, num(r.size), r.projected, r.low, r.high, signed(r.poolEffect), r.method === 'pattern' ? 'n/a' : r.ruleIn ? 'in pool' : signed(r.ruleEffect), r.modelled ? signed(r.sizeEffect) : 'n/a', null];
    vals.forEach((v, i) => {
      const td = document.createElement('td');
      if (i > 0 && i < 8) td.className = 'num';
      if (i === 0) typeCell(td, r.key, r.category);
      else if (i === 8) changeBar(td, r.projected - r.lastCRS, maxAbs);
      else td.textContent = v;
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
}

// against the last cut-off: a bar from zero, coral up and green down, and the change in points
const svgNode = (tag, attrs, text) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  if (text != null) n.textContent = text;
  return n;
};
function changeBar(td, dlt, maxAbs) {
  const w = 150, h = 16, x = (v) => ((v + maxAbs) / (2 * maxAbs)) * w, zero = x(0);
  const svg = svgNode('svg', { width: w + 46, height: h, 'aria-hidden': 'true' });
  svg.append(
    svgNode('line', { x1: zero, x2: zero, y1: 0, y2: h, style: 'stroke:' + css('--ee-faint') }),
    svgNode('rect', { x: Math.min(zero, x(dlt)), width: Math.max(2, Math.abs(x(dlt) - zero)), y: 4, height: h - 8, rx: 2, style: 'fill:' + (dlt > 0 ? css('--ee-coral') : css('--ee-green')) }),
    svgNode('text', { x: w + 6, y: h - 4, style: 'font-size:11.5px;fill:' + css('--ee-ink') }, signed(dlt)),
  );
  td.appendChild(svg);
}
