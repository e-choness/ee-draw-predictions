// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Overview KPI: the pool's size at each IRCC count, as a sparkline.
import d3 from '../lib/d3.js';
import { store } from '../state.js';
import { toDate } from '../ui/format.js';
import { css } from '../ui/theme.js';

export function poolSparkline(el) {
  const data = store.rows('pool_trend');
  el.replaceChildren();
  if (!data || !data.length) return;
  const W = Math.max(120, el.clientWidth), H = 34, rows = data.map((r) => ({ t: toDate(r.asOf), v: r.total }));
  const x = d3.scaleUtc(d3.extent(rows, (r) => r.t), [2, W - 4]), y = d3.scaleLinear(d3.extent(rows, (r) => r.v), [H - 3, 3]);
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('aria-hidden', 'true');
  svg.append('path').datum(rows).style('fill', 'none').style('stroke', css('--ee-blue')).attr('stroke-width', 1.6).attr('stroke-linejoin', 'round')
    .attr('d', d3.line((r) => x(r.t), (r) => y(r.v)));
  const last = rows[rows.length - 1];
  svg.append('circle').attr('cx', x(last.t)).attr('cy', y(last.v)).attr('r', 2.6).style('fill', css('--ee-blue'));
}
