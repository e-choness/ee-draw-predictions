// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Pool scores: every IRCC pool count since 2024, stacked by score range.
import { store } from '../state.js';
import { num, si, date, toDate } from '../ui/format.js';
import { css } from '../ui/theme.js';
import { chartView, valueAxis, timeAxis, legend, legendHeight, pinnable, nice } from './base.js';

// from the bottom of the stack up
const KEYS = [['b0', '400 or less', '--ee-blue'], ['b401', '401–450', '--ee-cyan'], ['b451', '451–500', '--ee-orange'], ['b501', '501–600', '--ee-coral'], ['b601', '601+', '--ee-magenta']];

export const poolTrendChart = chartView((el) => {
  const data = store.rows('pool_trend');
  if (!data || !data.length) return null;
  const rows = data.map((r) => ({ ...r, t: toDate(r.asOf).getTime() })), W = el.clientWidth, H = W < 560 ? 280 : 320;
  const names = KEYS.map((k) => k[1]).reverse(), top = legendHeight(names, W);

  return {
    height: H + top,
    label: 'Pool over time',
    pick: 'x',
    start: rows.length - 1,
    option: {
      legend: legend({ data: names }),
      grid: { top: top + 20 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: css('--ee-faint') } } },
      xAxis: timeAxis({ min: rows[0].t, max: rows[rows.length - 1].t }),
      yAxis: valueAxis({ ...nice(0, Math.max(...rows.map((r) => r.total))), axisLabel: { formatter: si } }),
      series: KEYS.map(([k, label, c]) => ({
        id: k, name: label, type: 'line', stack: 'pool', symbol: 'none', color: css(c), lineStyle: { width: 0 }, areaStyle: { opacity: 0.88 },
        data: rows.map((r) => [r.t, r[k]]),
      })).concat([{
        // each count's total, marked only when hovered or pinned
        id: 'total', type: 'line', symbol: 'circle', symbolSize: 7, showAllSymbol: true, lineStyle: { opacity: 0 },
        ...pinnable({ formatter: (p) => si(p.value[1]) }, { opacity: 1 }),
        itemStyle: { color: css('--ee-card'), borderColor: css('--ee-ink'), borderWidth: 2, opacity: 0 }, emphasis: { itemStyle: { opacity: 1 } },
        data: rows.map((r) => ({ name: r.asOf, value: [r.t, r.total] })),
      }]),
    },
    describe: (id, i) => {
      const r = rows[i];
      return { title: date(r.asOf) + ', ' + num(r.total) + ' profiles', rows: KEYS.slice().reverse().map(([k, label, c]) => ({ color: css(c), text: label + '  ' + num(r[k]) })) };
    },
  };
});
