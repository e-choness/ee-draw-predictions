// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Forecast: how the next cut-off moves with the number of invitations, under the new rules and on old scores.
import d3 from '../lib/d3.js';
import { model } from '../state.js';
import { num } from '../ui/format.js';
import { css } from '../ui/theme.js';
import { empty, tipLine, swatch } from '../ui/dom.js';
import { chartSvg, yAxis, grid, xAxis } from './axes.js';
import { selectable, nearestX } from './pick.js';

const NOT_MODELLED = {
  shift: 'Draw size is not modelled for this type: IRCC reports its scores in one wide band, so only the new points are added to its recent cut-offs.',
  pattern: 'Draw size is not modelled for Provincial Nominee rounds: nearly every nominee is invited, so the cut-off is the lowest-scoring nominee.',
};

export function sensitivityChart(el) {
  el.replaceChildren();
  const cur = model.cur(), t = model.type();
  if (!cur || !t) return;
  if (!cur.modelled) { empty(el, cur.method === 'shift' ? NOT_MODELLED.shift : NOT_MODELLED.pattern); return; }
  // 23 sizes spread evenly on a log scale across the type's range, plus its usual size and the size in use
  const sr = model.sizeRange(t), n = 22, sizes = new Set([t.usualSize, cur.size]);
  for (let i = 0; i <= n; i++) sizes.add(Math.round(sr.lo * Math.pow(sr.hi / sr.lo, i / n) / 10) * 10);
  const rows = [...sizes].sort((a, b) => a - b).map((s) => model.project(t.key, s)).filter(Boolean);
  const W = Math.max(280, el.clientWidth), H = 260, mt = 26, mb = 36, mr = 12;
  const ys = rows.flatMap((r) => [r.projected, r.oldRule]);
  const y = d3.scaleLinear([d3.min(ys) - 6, d3.max(ys) + 6], [H - mb, mt]).nice();
  const svg = chartSvg(el, W, H, 'Cut-off by draw size');
  const ml = yAxis(svg, y, null, 5);
  const x = d3.scaleLog([rows[0].size, rows[rows.length - 1].size], [ml + 6, W - mr]);
  grid(svg, y, ml, W - mr, 5);
  const ticks = [50, 100, 250, 500, 1000, 2500, 5000, 10000].filter((v) => v >= rows[0].size && v <= rows[rows.length - 1].size && (W > 420 || [100, 500, 2500, 10000].includes(v)));
  xAxis(svg, x, H - mb, { values: ticks, format: d3.format('~s') });
  svg.append('text').attr('x', W - mr).attr('y', H - 4).attr('text-anchor', 'end').text('Invitations in the next draw');
  svg.append('line').attr('x1', x(t.usualSize)).attr('x2', x(t.usualSize)).attr('y1', mt - 8).attr('y2', H - mb).style('stroke', css('--ee-faint')).attr('stroke-dasharray', '3 3');
  svg.append('text').attr('x', x(t.usualSize) + 4).attr('y', mt - 10).text('usual ' + num(t.usualSize));
  const ln = (k) => d3.line((r) => x(r.size), (r) => y(r[k]));
  svg.append('path').datum(rows).style('fill', 'none').style('stroke', css('--ee-slate')).attr('stroke-width', 1.8).attr('stroke-dasharray', '5 4').attr('d', ln('oldRule'));
  svg.append('path').datum(rows).style('fill', 'none').style('stroke', css('--ee-blue')).attr('stroke-width', 2.5).attr('stroke-linejoin', 'round').attr('d', ln('projected'));
  svg.append('circle').attr('cx', x(cur.size)).attr('cy', y(cur.projected)).attr('r', 5.5).style('fill', css('--ee-card')).style('stroke', css('--ee-coral')).attr('stroke-width', 2.5);

  // each size is selectable: a pin shows the cut-off on both lines; the size in use is labelled without a pin
  const marks = rows.map((h) => {
    const hx = x(h.size), hy = y(h.projected), oy = y(h.oldRule), now = h.size === cur.size;
    return {
      id: t.key + ':' + h.size, x: hx, y: hy, hl: [{ circle: [hx, hy, 7] }, { circle: [hx, oy, 6] }], def: now ? 0 : null,
      label: [now ? { text: cur.projected + ' at ' + d3.format('~s')(cur.size), y: hy - 6, fill: css('--ee-coral'), ink: '#fff' } : { text: String(h.projected), y: hy - 6 },
        { text: String(h.oldRule), y: oy - 4, by: oy + 4, below: true, fill: css('--ee-track'), ink: css('--ee-ink') }],
      tip: (tip) => {
        tipLine(tip, 'ee-tip-h', [num(h.size) + ' invitations' + (h.usual ? ' (usual)' : '')]);
        tipLine(tip, '', [swatch(css('--ee-blue')), 'New rules  ' + h.projected + ' (likely ' + h.low + ' to ' + h.high + ')']);
        tipLine(tip, '', [swatch(css('--ee-slate')), 'Same pool, old rules  ' + h.oldRule]);
      },
    };
  });
  selectable(el, svg, W, H, { marks, area: [ml, 0, W, H], brush: 'x', find: nearestX(marks) });
}
