// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Small DOM builders for the tables.
import { typeColor } from './theme.js';
import { num, date } from './format.js';

const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

/* ---------- Table cells ---------- */

/** The draw type's dot and name, in a cell. */
export const typeCell = (td, key, label) => {
  const s = make('span', 'ee-type'), dot = make('span', 'ee-dot');
  dot.style.background = typeColor(key);
  s.append(dot, document.createTextNode(label));
  td.appendChild(s);
};
/** Append a cell: text, with an optional class, or a draw type ({ key, category }) as its dot and name. */
export const cell = (tr, v, cls, typeOf) => {
  const td = make('td', cls || null);
  if (typeOf) typeCell(td, typeOf.key, typeOf.category); else td.textContent = v;
  tr.appendChild(td);
  return td;
};
/** A single row spanning the table with a message. */
export const emptyRow = (tb, cols, text) => { const tr = document.createElement('tr'); cell(tr, text, 'ee-empty').colSpan = cols; tb.appendChild(tr); };

/** A draw as a table row: number, date, type, invitations, and the cut-off as a coloured tag. */
export const drawRow = (r) => {
  const tr = document.createElement('tr'); tr.dataset.key = String(r.drawNumber);
  cell(tr, r.drawNumber, 'num');
  cell(tr, date(r.drawDate));
  cell(tr, null, '', r);
  cell(tr, num(r.drawSize), 'num');
  const tag = make('span', 'ee-tag', r.drawCRS); tag.style.background = typeColor(r.key);
  cell(tr, null, 'num').appendChild(tag);
  return tr;
};
