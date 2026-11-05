// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// All draws: every round's cut-off over time, with its size as the bubble's area.
import d3 from '../lib/d3.js';
import { store } from '../state.js';
import { num, date, toDate } from '../ui/format.js';
import { groupColor } from '../ui/theme.js';
import { tipLine } from '../ui/dom.js';
import { chartSvg, yAxis, grid, xAxis, timeTicks } from './axes.js';
import { selectable } from './pick.js';

export function drawBubblesChart(el) {
  const draws = store.rows('draws');
  el.replaceChildren();
  if (!draws || !draws.length) return;
  const rows = draws.map((r) => ({ ...r, t: toDate(r.drawDate) }));
  const W = Math.max(280, el.clientWidth), H = W < 560 ? 300 : 360, mt = 16, mb = 30;
  const y = d3.scaleLinear([d3.min(rows, (r) => r.drawCRS) - 20, d3.max(rows, (r) => r.drawCRS) + 20], [H - mb, mt]).nice();
  const svg = chartSvg(el, W, H, 'Every draw');
  const ml = yAxis(svg, y, null, 6);
  grid(svg, y, ml, W - 4, 6);
  const x = d3.scaleUtc(d3.extent(rows, (r) => r.t), [ml + 12, W - 14]);
  xAxis(svg, x, H - mb, { ticks: timeTicks(W) });
  const r = d3.scaleSqrt([0, d3.max(rows, (q) => q.drawSize)], [0, W < 560 ? 11 : 16]);
  // largest first, so small rounds stay on top
  svg.append('g').selectAll('circle').data(rows.slice().sort((a, b) => b.drawSize - a.drawSize)).join('circle')
    .attr('cx', (q) => x(q.t)).attr('cy', (q) => y(q.drawCRS)).attr('r', (q) => Math.max(2, r(q.drawSize)))
    .style('fill', (q) => groupColor(q.key)).attr('fill-opacity', 0.55).style('stroke', (q) => groupColor(q.key)).attr('stroke-width', 1);

  // each draw is selectable: the nearest one to the pointer; drag a box to pin every draw inside it
  const marks = rows.map((q) => {
    const px = x(q.t), py = y(q.drawCRS), rr = Math.max(2, r(q.drawSize));
    return {
      id: String(q.drawNumber), x: px, y: py, hl: [{ circle: [px, py, rr + 3] }], label: { text: String(q.drawCRS), y: py - rr - 1, by: py + rr + 1 },
      tip: (tip) => {
        tipLine(tip, 'ee-tip-h', [date(q.drawDate) + ', draw #' + q.drawNumber]);
        tipLine(tip, '', [q.category]);
        tipLine(tip, '', ['Cut-off ' + q.drawCRS + ', ' + num(q.drawSize) + ' invitations']);
      },
    };
  });
  const dl = d3.Delaunay.from(marks, (m) => m.x, (m) => m.y);
  selectable(el, svg, W, H, { marks, area: [ml, 0, W, H - mb], brush: 'xy', find: (mx, my) => marks[dl.find(mx, my)] });
}
