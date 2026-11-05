// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Small DOM builders shared by charts and tables.
import { typeColor } from './theme.js';
import { num, date } from './format.js';

const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

/** Replace an element's content with a centred message. */
export const empty = (el, text) => el.replaceChildren(make('div', 'ee-empty', text));

/** A colour swatch for legends and tooltips. */
export const swatch = (color) => { const s = make('span', 'ee-sw'); s.style.background = color; return s; };

/* ---------- Tooltip ---------- */

/** The tooltip element of a chart container, made on first use. */
export const tooltip = (box) => {
  let t = box.querySelector(':scope > .ee-tip');
  if (!t) { t = make('div', 'ee-tip'); t.hidden = true; box.appendChild(t); }
  return t;
};
/** Add a line to a tooltip: text and nodes (a swatch) in order. */
export const tipLine = (tip, cls, parts) => {
  const div = make('div', cls || null);
  parts.forEach((x) => div.appendChild(typeof x === 'string' ? document.createTextNode(x) : x));
  tip.appendChild(div);
};
/** Show a tooltip above and to the right of (x, y) in the box, flipping left near the right edge. */
export const placeTip = (box, tip, x, y) => {
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight, bw = box.clientWidth;
  let left = x + 14; if (left + w > bw) left = Math.max(0, x - w - 14);
  tip.style.left = left + 'px'; tip.style.top = Math.max(0, y - h - 10) + 'px';
};

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
