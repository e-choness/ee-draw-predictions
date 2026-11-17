// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Forecast: how the next cut-off moves with the number of invitations, under the new rules and on old scores.
import { model } from '../state.js';
import { num, si } from '../ui/format.js';
import { css } from '../ui/theme.js';
import { chartView, valueAxis, bubble, pinnable, nice } from './base.js';

const NOT_MODELLED = {
  shift: 'Draw size is not modelled for this type: IRCC reports its scores in one wide band, so only the new points are added to its recent cut-offs.',
  pattern: 'Draw size is not modelled for Provincial Nominee rounds: nearly every nominee is invited, so the cut-off is the lowest-scoring nominee.',
};

export const sensitivityChart = chartView((el) => {
  const cur = model.cur(), t = model.type();
  if (!cur || !t) return null;
  if (!cur.modelled) return { height: 260, empty: cur.method === 'shift' ? NOT_MODELLED.shift : NOT_MODELLED.pattern };
  // 23 sizes spread evenly on a log scale across the type's range, plus its usual size and the size in use
  const sr = model.sizeRange(t), n = 22, sizes = new Set([t.usualSize, cur.size]);
  for (let i = 0; i <= n; i++) sizes.add(Math.round(sr.lo * Math.pow(sr.hi / sr.lo, i / n) / 10) * 10);
  const rows = [...sizes].sort((a, b) => a - b).map((s) => model.project(t.key, s)).filter(Boolean);
  const W = el.clientWidth, first = rows[0].size, lastSize = rows[rows.length - 1].size;
  const ys = rows.flatMap((r) => [r.projected, r.oldRule]);
  const ticks = [50, 100, 250, 500, 1000, 2500, 5000, 10000].filter((v) => v >= first && v <= lastSize && (W > 420 || [100, 500, 2500, 10000].includes(v)));
  const blue = css('--ee-blue'), slate = css('--ee-slate'), coral = css('--ee-coral'), muted = css('--ee-muted'), faint = css('--ee-faint');

  return {
    height: 260,
    label: 'Cut-off by draw size',
    pick: 'x',
    start: rows.findIndex((h) => h.size === cur.size),
    option: {
      grid: { top: 30, right: 16, bottom: 20 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: faint } } },
      xAxis: {
        type: 'log', min: first, max: lastSize, name: 'Invitations in the next draw', nameLocation: 'middle', nameGap: 30, nameTextStyle: { color: muted },
        axisLine: { lineStyle: { color: css('--ee-line') } }, axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { color: muted, fontSize: 11, margin: 10, customValues: ticks, formatter: si },
      },
      yAxis: valueAxis(nice(Math.min(...ys) - 6, Math.max(...ys) + 6)),
      series: [
        { id: 'old', type: 'line', silent: true, symbol: 'none', lineStyle: { color: slate, width: 1.8, type: [5, 4] }, data: rows.map((h) => [h.size, h.oldRule]) },
        {
          id: 'new', type: 'line', symbol: 'circle', symbolSize: 7, showAllSymbol: true,
          ...pinnable({ formatter: (p) => String(p.value[1]) }, { opacity: 1 }),
          // the sizes are marked only when hovered or pinned
          itemStyle: { color: blue, opacity: 0 }, emphasis: { itemStyle: { opacity: 1 } }, lineStyle: { color: blue, width: 2.5 },
          data: rows.map((h) => ({ name: t.key + ':' + h.size, value: [h.size, h.projected] })),
          markLine: {
            silent: true, symbol: 'none', lineStyle: { color: faint, width: 1, type: [3, 3] },
            label: { formatter: 'usual ' + num(t.usualSize), position: 'end', color: muted }, data: [{ xAxis: t.usualSize }],
          },
        },
        {
          id: 'now', type: 'scatter', silent: true, tooltip: { show: false }, z: 5, symbolSize: 11,
          itemStyle: { color: css('--ee-card'), borderColor: coral, borderWidth: 2.5 },
          label: bubble({ backgroundColor: coral, color: '#fff', formatter: cur.projected + ' at ' + si(cur.size) }),
          labelLayout: { hideOverlap: true },
          data: [[cur.size, cur.projected]],
        },
      ],
    },
    describe: (id, i) => {
      const h = rows[i];
      return {
        title: num(h.size) + ' invitations' + (h.usual ? ' (usual)' : ''),
        rows: [{ color: blue, text: 'New rules  ' + h.projected + ' (likely ' + h.low + ' to ' + h.high + ')' }, { color: slate, text: 'Same pool, old rules  ' + h.oldRule }],
      };
    },
  };
});
