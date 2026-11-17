// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Overview KPI: the pool's size at each IRCC count, as a sparkline.
import { store } from '../state.js';
import { toDate } from '../ui/format.js';
import { css } from '../ui/theme.js';
import { chartView } from './base.js';

export const poolSparkline = chartView(() => {
  const data = store.rows('pool_trend');
  if (!data || !data.length) return null;
  const blue = css('--ee-blue'), pts = data.map((r) => [toDate(r.asOf).getTime(), r.total]);
  return {
    height: 34,
    option: {
      animation: false,
      grid: { left: 2, right: 4, top: 3, bottom: 3, containLabel: false },
      xAxis: { type: 'time', show: false, min: 'dataMin', max: 'dataMax' },
      yAxis: { type: 'value', show: false, scale: true },
      series: [
        { type: 'line', silent: true, symbol: 'none', lineStyle: { color: blue, width: 1.6 }, data: pts },
        { type: 'scatter', silent: true, symbolSize: 5, itemStyle: { color: blue }, data: [pts[pts.length - 1]] },
      ],
    },
  };
}, { decorative: true });
