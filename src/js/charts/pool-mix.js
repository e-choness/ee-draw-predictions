// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Overview: the pool by score range under the new rules, as a ring with its legend.
import d3 from '../lib/d3.js';
import { model } from '../state.js';
import { num, pct } from '../ui/format.js';
import { css } from '../ui/theme.js';
import { tipLine, swatch } from '../ui/dom.js';
import { chartSvg } from './axes.js';
import { selectable } from './pick.js';

// score ranges, from IRCC's bands (by their lowest score)
const PARTS = [
  ['b601', '601 and above', '--ee-magenta', (b) => b.lo >= 601],
  ['b501', '501–600', '--ee-coral', (b) => b.lo === 501],
  ['b451', '451–500', '--ee-orange', (b) => b.lo >= 451 && b.lo <= 491],
  ['b401', '401–450', '--ee-cyan', (b) => b.lo >= 401 && b.lo <= 441],
  ['b0', '400 or less', '--ee-blue', (b) => b.lo <= 351],
];

export function poolMixChart(el) {
  const pv = model.poolView();
  el.replaceChildren();
  if (!pv) return;
  const parts = PARTS.map(([k, label, c, inRange]) => ({ k, label, v: pv.rows.filter(inRange).reduce((t, b) => t + b.after, 0), color: css(c) }));
  const total = parts.reduce((t, p) => t + p.v, 0);
  const W = Math.max(240, el.clientWidth), side = W < 420, size = Math.min(190, side ? W - 20 : W * 0.5);
  const H = side ? size + 150 : Math.max(size + 10, 220);
  const svg = chartSvg(el, W, H, 'Pool by score range');
  const cx = side ? W / 2 : size / 2 + 4, cy = size / 2 + 4, R = size / 2;
  const arc = d3.arc().innerRadius(R * 0.7).outerRadius(R).cornerRadius(2).padAngle(0.012);
  const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);
  const pie = d3.pie().sort(null).value((p) => p.v)(parts);
  g.selectAll('path').data(pie).join('path').attr('d', arc).style('fill', (a) => a.data.color);
  g.append('text').attr('text-anchor', 'middle').attr('y', -4).text('Profiles');
  g.append('text').attr('class', 'ee-t-ink').attr('text-anchor', 'middle').attr('y', 16).style('font-size', '20px').text(num(total));
  // the legend: beside the ring, or under it on narrow screens
  const lx = side ? 16 : size + 22, ly = side ? size + 22 : cy - parts.length * 13, lw = side ? W - 32 : W - lx - 4;
  const leg = svg.append('g').attr('transform', `translate(${lx},${ly})`);
  parts.forEach((p, i) => {
    const row = leg.append('g').attr('transform', `translate(0,${i * 26})`);
    row.append('rect').attr('width', 9).attr('height', 9).attr('y', -8).attr('rx', 2).style('fill', p.color);
    row.append('text').attr('x', 16).text(p.label);
    row.append('text').attr('class', 'ee-t-ink').attr('x', lw).attr('text-anchor', 'end').text(pct(p.v / total));
  });

  // a slice, or its legend row, pins the slice's profile count on the ring
  const marks = pie.map((a) => {
    const [ax, ay] = arc.centroid(a);
    return {
      id: a.data.k, x: cx + ax, y: cy + ay, a0: a.startAngle, a1: a.endAngle, hl: [{ path: arc(a), transform: `translate(${cx},${cy})` }], label: { text: num(a.data.v) },
      tip: (t) => { tipLine(t, 'ee-tip-h', ['CRS ' + a.data.label]); tipLine(t, '', [swatch(a.data.color), num(a.data.v) + ' profiles, ' + pct(a.data.v / total)]); },
    };
  });
  selectable(el, svg, W, H, {
    marks, linear: true, obstacles: [[cx - 44, cy - 18, cx + 44, cy + 22]],
    find: (mx, my) => {
      const row = Math.round((my - ly + 4) / 26);
      if (mx >= lx && mx <= lx + lw && row >= 0 && row < marks.length && Math.abs(my - (ly - 4 + row * 26)) <= 12) return marks[row];
      const dx = mx - cx, dy = my - cy, d = Math.hypot(dx, dy);
      if (d < R * 0.55 || d > R + 8) return null;
      const ang = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI);
      return marks.find((m) => ang >= m.a0 && ang < m.a1) || null;
    },
  });
}
