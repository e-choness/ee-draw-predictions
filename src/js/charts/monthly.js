// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Overview: invitations issued each month, stacked by program.
import d3 from '../lib/d3.js';
import { store } from '../state.js';
import { num, toDate } from '../ui/format.js';
import { css, groupColor } from '../ui/theme.js';
import { tipLine, swatch } from '../ui/dom.js';
import { chartSvg, yAxis, grid } from './axes.js';
import { selectable } from './pick.js';

const KEYS = ['cec', 'pnp', 'french', 'other'];
const NAMES = { cec: 'Canadian Experience Class', pnp: 'Provincial Nominee', french: 'French language', other: 'Other categories' };
const monthOf = (m) => toDate(m + '-01');

export function monthlyChart(el) {
  const rows = store.rows('monthly');
  el.replaceChildren();
  if (!rows || !rows.length) return;
  const W = Math.max(280, el.clientWidth), H = 260, mt = 30, mb = 34;
  const y = d3.scaleLinear([0, d3.max(rows, (r) => r.total)], [H - mb, mt]).nice();
  const svg = chartSvg(el, W, H, 'Invitations per month');
  const ml = yAxis(svg, y, d3.format('~s'), 4);
  const x = d3.scaleBand(rows.map((r) => r.month), [ml + 2, W - 2]).paddingInner(0.28).paddingOuter(0.1);
  grid(svg, y, ml, W - 2, 4);
  const stack = d3.stack().keys(KEYS)(rows);
  const bw = x.bandwidth();
  svg.append('g').selectAll('g').data(stack).join('g').style('fill', (s) => groupColor(s.key))
    .selectAll('rect').data((s) => s).join('rect')
    .attr('x', (p) => x(p.data.month)).attr('width', bw).attr('y', (p) => y(p[1])).attr('height', (p) => Math.max(0, y(p[0]) - y(p[1])));
  // month labels thin out as the bars narrow: every month, quarters, or January and July
  const lab = rows.filter((r) => (bw < 14 ? r.month.endsWith('-01') || r.month.endsWith('-07') : bw < 24 ? /-(01|04|07|10)$/.test(r.month) : true));
  svg.append('g').selectAll('text').data(lab).join('text').attr('x', (r) => x(r.month) + bw / 2).attr('y', H - mb + 16).attr('text-anchor', 'middle')
    .text((r) => (r.month.endsWith('-01') || lab.length < 14 ? d3.utcFormat(r.month.endsWith('-01') ? '%b %Y' : '%b')(monthOf(r.month)) : d3.utcFormat('%b')(monthOf(r.month))));

  // each month's total and each of its segments is selectable; the busiest and the latest month are labelled without a pin
  const max = rows.reduce((m, r) => (r.total > m.total ? r : m), rows[0]), lastM = rows[rows.length - 1], fmt = d3.format('.3~s');
  const marks = rows.flatMap((r, i) => {
    const cx = x(r.month) + bw / 2, top = y(r.total);
    const tip = (k) => (t) => {
      tipLine(t, 'ee-tip-h', [d3.utcFormat('%B %Y')(monthOf(r.month)) + ', ' + r.draws + (r.draws === 1 ? ' draw' : ' draws')]);
      KEYS.forEach((s) => { if (r[s]) tipLine(t, s === k ? 'ee-tip-b' : '', [swatch(groupColor(s)), NAMES[s] + '  ' + num(r[s])]); });
      tipLine(t, k ? '' : 'ee-tip-b', ['Total  ' + num(r.total)]);
    };
    const total = {
      id: r.month, x: cx, y: top, ty: top, hl: [{ rect: [x(r.month) - 2, top - 2, bw + 4, y(0) - top + 2] }], tip: tip(null),
      label: { text: fmt(r.total), y: top - 2, ...(r === lastM && r !== max ? { fill: css('--ee-coral'), ink: '#fff' } : {}) },
      def: r === max ? 0 : r === lastM ? 1 : null,
    };
    return [total].concat(stack.filter((s) => s[i][1] > s[i][0]).map((s) => {
      const y0 = y(s[i][0]), y1 = y(s[i][1]);
      return { id: r.month + ':' + s.key, x: cx, y: (y0 + y1) / 2, ty: top, top: y1, bot: y0, brush: false, hl: [{ rect: [x(r.month) - 1, y1, bw + 2, y0 - y1] }], label: { text: fmt(s[i][1] - s[i][0]) }, tip: tip(s.key) };
    }));
  });
  const byMonth = d3.group(marks, (m) => m.x);
  selectable(el, svg, W, H, {
    marks, area: [ml, 0, W, H], brush: 'x',
    // the column under the pointer, then the segment under it, or the month's total above the bar
    find: (mx, my) => { const c = byMonth.get(d3.least([...byMonth.keys()], (k) => Math.abs(k - mx))); return c.find((m) => m.top != null && my >= m.top && my <= m.bot) || c[0]; },
  });
}
