// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// How numbers and dates read on the page. Negative numbers take a real minus sign, and dates are read in UTC, since
// IRCC's dates carry no time of day.
const MINUS = '−';
const fmt = (opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts });
const comma = new Intl.NumberFormat('en-US'), pct1 = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dayLong = fmt({ month: 'short', day: 'numeric', year: 'numeric' }), dayShort = fmt({ month: 'short', day: 'numeric' });
const monShort = fmt({ month: 'short' }), monYear = fmt({ month: 'short', year: 'numeric' }), monLong = fmt({ month: 'long', year: 'numeric' });
const sign = (v, f) => (v < 0 ? MINUS : '') + f(Math.abs(v));

/** 12,345 */
export const num = (v) => sign(v, (a) => comma.format(a));
/** +12, −12 or ±0 */
export const signed = (v) => (v > 0 ? '+' : v < 0 ? MINUS : '±') + comma.format(Math.abs(v));
/** 12.3% from 0.123 */
export const pct = (v) => sign(v, (a) => pct1.format(a));
/** 12.3% or 12% from 0.123 or 0.12: no trailing .0 */
export const pctOf = (v) => (v * 100).toFixed(1).replace(/\.0$/, '') + '%';
/** 25.1k, 229k, 1.2M, 800: three significant digits with an SI suffix, for axes and chart labels */
const SI = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, '']];
export const si = (v) => sign(v, (a) => {
  const f = SI.findIndex(([d]) => a >= d), i = f < 0 ? SI.length - 1 : f, x = +(a / SI[i][0]).toPrecision(3);
  // 999.96k rounds to 1000k: that is 1M
  return i > 0 && x >= 1000 ? +(x / 1000).toPrecision(3) + SI[i - 1][1] : x + SI[i][1];
});
/** An ISO date (YYYY-MM-DD) as a UTC Date */
export const toDate = (s) => new Date(s + 'T00:00:00Z');
/** Nov 3, 2026 */
export const date = (s) => dayLong.format(toDate(s));
/** Nov 3 */
export const shortDate = (s) => dayShort.format(toDate(s));
/** Months, from YYYY-MM: Jan, Jan 2026, January 2026 */
export const month = (m, style) => (style === 'long' ? monLong : style === 'year' ? monYear : monShort).format(toDate(m + '-01'));
