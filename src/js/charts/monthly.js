// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Overview: invitations issued each month, stacked by program.
import { store } from '../state.js';
import { num, si, month } from '../ui/format.js';
import { css, groupColor } from '../ui/theme.js';
import { chartView, valueAxis, categoryAxis, legend, legendHeight, bubble, pinnable } from './base.js';

const KEYS = ['cec', 'pnp', 'french', 'other'];
const NAMES = { cec: 'Canadian Experience Class', pnp: 'Provincial Nominee', french: 'French language', other: 'Other categories' };

export const monthlyChart = chartView((el) => {
  const rows = store.rows('monthly');
  if (!rows || !rows.length) return null;
  const W = el.clientWidth, names = KEYS.map((k) => NAMES[k]), top = legendHeight(names, W);
  // month labels thin out as the bars narrow: every month, quarters, or January and July
  const bw = ((W - 50) / rows.length) * 0.72;
  const shown = (m) => (bw < 14 ? /-(01|07)$/.test(m) : bw < 24 ? /-(01|04|07|10)$/.test(m) : true);
  // the busiest and the latest month carry their totals without a pin
  const max = rows.reduce((m, r) => (r.total > m.total ? r : m), rows[0]), latest = rows[rows.length - 1];
  const totals = [max, latest].filter((r, i, a) => a.indexOf(r) === i).map((r) => ({
    coord: [r.month, r.total],
    label: bubble({ formatter: si(r.total), ...(r === latest && r !== max ? { backgroundColor: css('--ee-coral'), color: '#fff' } : {}) }),
  }));

  return {
    height: 236 + top,
    label: 'Invitations per month',
    pick: 'x',
    start: rows.length - 1,
    // by month, then from the top segment down
    nav: rows.map((r, i) => KEYS.map((k, s) => [s, i]).filter(([s]) => r[KEYS[s]] > 0).reverse()).filter((c) => c.length),
    option: {
      legend: legend({ data: names }),
      grid: { top: top + 24 },
      xAxis: categoryAxis({ data: rows.map((r) => r.month), axisLabel: { interval: 0, formatter: (m) => (!shown(m) ? '' : month(m, m.endsWith('-01') ? 'year' : undefined)) } }),
      yAxis: valueAxis({ splitNumber: 4, axisLabel: { formatter: si } }),
      series: KEYS.map((k) => ({
        id: k, name: NAMES[k], type: 'bar', stack: 'month', barCategoryGap: '28%',
        itemStyle: { color: groupColor(k) },
        ...pinnable({ position: 'inside', formatter: (p) => si(p.value) }),
        data: rows.map((r) => ({ name: r.month + ':' + k, value: r[k] || 0 })),
        markPoint: k === KEYS[KEYS.length - 1] ? { silent: true, symbol: 'circle', symbolSize: 0, data: totals } : undefined,
      })),
    },
    describe: (id, i) => {
      const r = rows[i];
      return {
        title: month(r.month, 'long') + ', ' + r.draws + (r.draws === 1 ? ' draw' : ' draws'),
        rows: KEYS.filter((k) => r[k]).map((k) => ({ color: groupColor(k), text: NAMES[k] + '  ' + num(r[k]), bold: k === id })).concat(['Total  ' + num(r.total)]),
      };
    },
  };
});
