// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Draw tables: the latest draws on the Overview, and every draw on All draws with search and sorting.
import { store } from '../state.js';
import { date } from '../ui/format.js';
import { drawRow } from '../ui/dom.js';

/** The eight latest draws. */
export function recentDraws(tb) {
  const draws = store.rows('draws');
  tb.replaceChildren();
  if (!draws) return;
  draws.slice(0, 8).forEach((r) => tb.appendChild(drawRow(r)));
}

// the sort is this table's own state, not part of the scenario; the search is read from its box
const sort = { k: 'drawNumber', dir: -1 };

/** Every draw, filtered by the search box and sorted by the column chosen. */
export function allDraws(tb) {
  const draws = store.rows('draws');
  tb.replaceChildren();
  if (!draws) return;
  const box = document.querySelector('.ee-search'), q = ((box && box.value) || '').trim().toLowerCase();
  draws.filter((r) => !q || [r.drawNumber, r.drawDate, r.category, r.drawName, date(r.drawDate)].join(' ').toLowerCase().includes(q))
    .slice().sort((a, b) => { const va = a[sort.k], vb = b[sort.k]; return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir; })
    .forEach((r) => tb.appendChild(drawRow(r)));
}

/** Wire the search box and sortable headers; redraw() redraws the table. */
export function setupDrawSearch(redraw) {
  const search = document.querySelector('.ee-search');
  if (search) search.addEventListener('input', redraw);
  document.querySelectorAll('.ee-sort').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.sort;
    sort.dir = sort.k === k ? -sort.dir : k === 'category' ? 1 : -1; sort.k = k;
    document.querySelectorAll('.ee-sort').forEach((o) => { const th = o.closest('th'); if (th) th.setAttribute('aria-sort', o === b ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'); });
    redraw();
  }));
}
