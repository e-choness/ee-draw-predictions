// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Pool scores: profiles in each IRCC score band under the new rules, over the same bands before the new points,
// with the band the next projected cut-off falls in highlighted.
import { model } from '../state.js';
import { num, signed, si } from '../ui/format.js';
import { css } from '../ui/theme.js';
import { chartView, valueAxis, categoryAxis, legend, legendHeight, pinnable, nice } from './base.js';

export const scoreBandsChart = chartView((el) => {
  const pv = model.poolView(), r = model.cur();
  if (!pv) return null;
  const rows = pv.rows, W = el.clientWidth, H = W < 560 ? 280 : 320;
  const a = { name: pv.live ? 'IRCC, new rules' : 'New rules, estimated', fill: css('--ee-blue') };
  const b = { name: pv.live ? 'IRCC, old rules' : "IRCC's last count, before the new points", fill: css('--ee-track'), stroke: css('--ee-slate') };
  const top = legendHeight([a.name, b.name], W), ext = nice(0, Math.max(...rows.map((x) => Math.max(x.after, x.before))));
  const band = r ? rows.find((x) => r.projected >= x.lo && r.projected <= x.hi) : null;
  const every = ((W - 60) / rows.length) * 0.8 < 22 ? 2 : 1;
  const bands = rows.map((x) => x.band);
  // each series on its own copy of the axis, so bars of different widths share a centre
  const copy = { type: 'category', data: bands, show: false, position: 'bottom', axisLabel: { show: false } };

  return {
    height: H + top,
    label: 'Profiles by score band',
    pick: 'x',
    option: {
      legend: legend({ data: [a.name, b.name] }),
      grid: { top: top + 30, bottom: 22 },
      xAxis: [
        categoryAxis({
          data: bands, name: 'CRS score, start of band', nameLocation: 'middle', nameGap: 30, nameTextStyle: { color: css('--ee-muted') },
          axisLabel: { interval: (i) => i % every === 0 || i === rows.length - 1, formatter: (v, i) => (rows[i].lo === 0 ? '≤300' : rows[i].lo === 601 ? '601+' : String(rows[i].lo)) },
        }),
        copy, copy,
      ],
      yAxis: valueAxis({ ...ext, axisLabel: { formatter: si } }),
      series: [
        // the band the next projected cut-off falls in
        {
          id: 'mark', type: 'bar', xAxisIndex: 2, silent: true, tooltip: { show: false }, barWidth: '100%', itemStyle: { color: css('--ee-chip') },
          // the label slides to stay inside the chart
          labelLayout: ({ labelRect: l }) => ({ dx: Math.max(4 - l.x, Math.min(0, W - 4 - (l.x + l.width))) }),
          data: rows.map((x) => (x === band ? { value: ext.max, label: { show: true, position: 'top', distance: 8, color: css('--ee-ink'), fontWeight: 600, formatter: 'Next ' + r.category + ' ≈ ' + r.projected } } : '-')),
        },
        { id: 'before', name: b.name, type: 'bar', xAxisIndex: 0, barWidth: '80%', itemStyle: { color: b.fill, borderColor: b.stroke, borderWidth: 1, borderRadius: 2 }, data: rows.map((x) => x.before) },
        {
          id: 'after', name: a.name, type: 'bar', xAxisIndex: 1, barWidth: '45%', itemStyle: { color: a.fill, borderRadius: 2 },
          ...pinnable({ formatter: (p) => si(p.value) }),
          data: rows.map((x) => ({ name: x.band, value: x.after })),
        },
      ],
    },
    describe: (id, i) => {
      const x = rows[i];
      return { title: 'CRS ' + x.band, rows: [{ color: a.fill, text: a.name + '  ' + num(x.after) }, { color: b.stroke, text: b.name + '  ' + num(x.before) }, 'Difference  ' + signed(x.after - x.before)] };
    },
  };
});
