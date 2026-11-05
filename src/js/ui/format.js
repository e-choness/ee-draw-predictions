// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// How numbers and dates read on the page.
import d3 from '../lib/d3.js';

const comma = d3.format(','), dayLong = d3.utcFormat('%b %-d, %Y'), dayShort = d3.utcFormat('%b %-d');

/** 12,345 */
export const num = comma;
/** +12, −12 (a real minus sign) or ±0 */
export const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + comma(Math.abs(v));
/** 12.3% from 0.123 */
export const pct = d3.format('.1%');
/** 12.3% or 12% from 0.123 or 0.12: no trailing .0 */
export const pctOf = (v) => (v * 100).toFixed(1).replace(/\.0$/, '') + '%';
/** An ISO date (YYYY-MM-DD) as a UTC Date */
export const toDate = (s) => new Date(s + 'T00:00:00Z');
/** Nov 3, 2026 */
export const date = (s) => dayLong(toDate(s));
/** Nov 3 */
export const shortDate = (s) => dayShort(toDate(s));
