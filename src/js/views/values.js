// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Single values in the text: KPI tiles, the rail, titles and notes. Each is a small view that writes a dash
// until its data is in.
import { store, model } from '../state.js';
import { RULES } from '../model/eem.js';
import { num, signed, date, shortDate } from '../ui/format.js';

const show = (el, v) => { el.textContent = v == null || v === '' ? '—' : v; };
// from the first row of a dataset
const first = (id, read) => (el) => { const rows = store.rows(id); show(el, rows && rows.length ? read(rows[0]) : null); };
// from the next round of the selected type at the selected size
const next = (read) => (el) => { const r = model.cur(); show(el, r ? read(r) : null); };
// from the pool under the new rules
const pool = (read) => (el) => { const p = model.poolView(); show(el, p ? read(p) : null); };
const horizon = (el) => { el.textContent = model.ctx() ? date(model.horizon()) : '—'; };

export const values = {
  'rail-draw': first('draws', (r) => '#' + r.drawNumber + ', ' + shortDate(r.drawDate)),
  'rail-asof': first('pool_summary', (r) => shortDate(r.asOf)),
  'k-pool': first('pool_summary', (r) => num(r.total)),
  'k-pool-change': first('pool_summary', (r) => signed(r.change)),
  'k-top': pool((p) => num(p.after501)),
  'k-top-before': pool((p) => num(p.before501)),
  'r-501': pool((p) => num(p.after501)),
  'r-501-change': pool((p) => signed(p.after501 - p.before501)),
  'r-451': pool((p) => num(p.after451)),
  'r-451-change': pool((p) => signed(p.after451 - p.before451)),
  'k-next': next((r) => r.projected),
  'k-next-low': next((r) => r.low),
  'k-next-high': next((r) => r.high),
  'k-next-size': next((r) => num(r.size)),
  'k-next-label': next((r) => r.category),
  'k-last': next((r) => r.lastCRS),
  'k-last-date': next((r) => date(r.lastDate)),
  'k-last-size': next((r) => num(r.t.lastSize)),
  'k-last-rules': next((r) => (r.lastDate >= RULES ? 'new rules' : 'old rules')),
  'horizon': horizon,
  'horizon-2': horizon,
  'horizon-3': horizon,
  'hero-title': next((r) => r.category),
  'wf-title': next((r) => r.category),
  'p-asof': first('pool_summary', (r) => shortDate(r.asOf)),
  'k-pool-2': first('pool_summary', (r) => num(r.total)),
};
