// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Forecast: how the next projection is built, step by step from the last cut-off.
import { model } from '../state.js';
import { signed, date } from '../ui/format.js';
import { css } from '../ui/theme.js';
import { chartView, valueAxis, categoryAxis, pinnable, nice } from './base.js';

export const waterfallChart = chartView(() => {
  const r = model.cur();
  if (!r) return null;
  const steps = [
    { label: 'Last cut-off', abs: r.lastCRS },
    { label: r.assimilated ? 'Pool since' : r.modelled ? 'Pool and pause' : 'Recent pattern', d: r.poolEffect },
    { label: 'New points', d: r.ruleEffect, off: r.method === 'pattern' || r.ruleIn, offText: r.ruleIn ? 'in pool' : 'n/a' },
    { label: 'Draw size', d: r.sizeEffect, off: !r.modelled && !r.sized },
    { label: 'Projected', abs: r.projected, end: true },
  ];
  let run = 0;
  steps.forEach((s) => { if (s.abs != null) { s.y0 = s.abs; s.y1 = s.abs; run = s.abs; } else { s.y0 = run; run += s.d; s.y1 = run; } });
  const vals = steps.flatMap((s) => [s.y0, s.y1]).concat([r.low, r.high]);
  const lo = Math.min(...vals), hi = Math.max(...vals), ext = nice(lo - Math.max(6, (hi - lo) * 0.25), hi + Math.max(6, (hi - lo) * 0.25));
  const coral = css('--ee-coral'), green = css('--ee-green'), blue = css('--ee-blue'), slate = css('--ee-slate'), ink = css('--ee-ink');
  // totals stand on the axis; changes float from the running total, coral when they push the cut-off up
  const bars = steps.map((s) => (s.abs != null
    ? { a: ext.min, b: s.abs, fill: s.end ? blue : slate }
    : { a: Math.min(s.y0, s.y1), b: Math.max(s.y0, s.y1), fill: s.d > 0 ? coral : s.d < 0 ? green : slate }));
  const text = (s) => (s.abs != null ? String(s.abs) : s.off ? s.offText || 'n/a' : signed(s.d));
  // a pinned step shows where it leaves the cut-off: from and to for a change, the likely range for the projection
  const pinned = (s) => (s.end ? r.low + '–' + r.high : s.abs != null ? String(s.abs) : s.off ? text(s) : s.y0 + ' → ' + s.y1);
  // the likely range, as a whisker on the projection
  const whisker = (params, api) => {
    const [x, yl] = api.coord([api.value(0), api.value(1)]), yh = api.coord([api.value(0), api.value(2)])[1];
    const style = { stroke: ink, lineWidth: 1.5, opacity: 0.6 };
    return { type: 'group', children: [[x, yl, x, yh], [x - 5, yl, x + 5, yl], [x - 5, yh, x + 5, yh]].map(([x1, y1, x2, y2]) => ({ type: 'line', shape: { x1, y1, x2, y2 }, style })) };
  };

  return {
    height: 260,
    label: 'Projection steps',
    pick: 'x',
    start: steps.length - 1,
    option: {
      grid: { top: 30 },
      xAxis: categoryAxis({ data: steps.map((s) => s.label), axisLabel: { interval: 0, lineHeight: 13, formatter: (v) => v.split(' ').join('\n') } }),
      yAxis: valueAxis(ext),
      series: [
        { id: 'base', type: 'bar', stack: 'steps', silent: true, tooltip: { show: false }, itemStyle: { color: 'rgba(0,0,0,0)' }, data: bars.map((b) => b.a) },
        {
          id: 'steps', type: 'bar', stack: 'steps', barCategoryGap: '32%', barMinHeight: 2,
          ...pinnable({ formatter: (p) => pinned(steps[p.dataIndex]) }),
          label: { show: true, position: 'top', color: ink, fontSize: 11, fontWeight: 600, formatter: (p) => text(steps[p.dataIndex]) },
          itemStyle: { borderRadius: 3 },
          data: steps.map((s, i) => ({ name: r.key + ':' + i, value: bars[i].b - bars[i].a, itemStyle: { color: bars[i].fill, opacity: s.off ? 0.35 : 1 } })),
          markLine: {
            silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: css('--ee-faint'), width: 1, type: [3, 3] },
            data: steps.slice(0, -1).map((s, i) => [{ coord: [i, s.y1] }, { coord: [i + 1, s.y1] }]),
          },
        },
        { id: 'range', type: 'custom', silent: true, tooltip: { show: false }, z: 5, renderItem: whisker, encode: { x: 0, y: [1, 2] }, data: [[steps.length - 1, r.low, r.high]] },
      ],
    },
    describe: (id, i) => {
      const s = steps[i];
      if (s.end) return { title: s.label, rows: ['Projected cut-off ' + r.projected, 'Likely ' + r.low + ' to ' + r.high] };
      if (s.abs != null) return { title: s.label, rows: ['Cut-off ' + s.abs + ', ' + date(r.lastDate)] };
      if (s.off) return { title: s.label, rows: [s.offText === 'in pool' ? 'Already counted in Pool since' : 'Not used for this draw type'] };
      return { title: s.label, rows: ['Moves the cut-off ' + signed(s.d), 'From ' + s.y0 + ' to ' + s.y1] };
    },
  };
});
