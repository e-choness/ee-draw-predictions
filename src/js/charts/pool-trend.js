// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Pool scores: every IRCC pool count since 2024, stacked by score range.
import d3 from '../lib/d3.js';
import { store } from '../state.js';
import { num, date, toDate } from '../ui/format.js';
import { css } from '../ui/theme.js';
import { tipLine, swatch } from '../ui/dom.js';
import { chartSvg, yAxis, xAxis, timeTicks } from './axes.js';
import { selectable } from './pick.js';

const KEYS = [['b0', '400 or less', '--ee-blue'], ['b401', '401–450', '--ee-cyan'], ['b451', '451–500', '--ee-orange'], ['b501', '501–600', '--ee-coral'], ['b601', '601+', '--ee-magenta']];

export function poolTrendChart(el) {
  const data = store.rows('pool_trend');
  el.replaceChildren();
  if (!data || !data.length) return;
  const rows = data.map((r) => ({ ...r, t: toDate(r.asOf) }));
  const stack = d3.stack().keys(KEYS.map((k) => k[0]))(rows);
  const W = Math.max(280, el.clientWidth), H = W < 560 ? 280 : 320, mt = 14, mb = 30;
  const y = d3.scaleLinear([0, d3.max(rows, (r) => r.total)], [H - mb, mt]).nice();
  const svg = chartSvg(el, W, H, 'Pool over time');
  const ml = yAxis(svg, y, d3.format('~s'), 5);
  // room on the right for the range labels, measured from the longest one
  const probe = svg.append('text').text('400 or less'), mr = W < 480 ? 8 : Math.ceil(probe.node().getComputedTextLength()) + 14; probe.remove();
  const x = d3.scaleUtc(d3.extent(rows, (r) => r.t), [ml + 2, W - mr]);
  xAxis(svg, x, H - mb, { ticks: timeTicks(W) });
  svg.append('g').selectAll('path').data(stack).join('path').style('fill', (s, i) => css(KEYS[i][2])).attr('opacity', 0.88)
    .attr('d', d3.area((p) => x(p.data.t), (p) => y(p[0]), (p) => y(p[1])));
  if (W >= 480) {
    // direct labels at the latest count, pushed apart so they never overlap
    const li = rows.length - 1; let prevY = Infinity;
    stack.map((s, i) => ({ i, yy: y((s[li][0] + s[li][1]) / 2) })).sort((a, b) => b.yy - a.yy).forEach((o) => {
      const yy = Math.min(o.yy, prevY - 13); prevY = yy;
      svg.append('text').attr('x', W - mr + 6).attr('y', yy + 4).text(KEYS[o.i][1]);
    });
  }

  // each count's total and each of its score ranges is selectable
  const fmt = d3.format('.3~s');
  const marks = rows.flatMap((r, i) => {
    const rx = x(r.t), top = y(r.total);
    const tip = (k) => (t) => {
      tipLine(t, 'ee-tip-h', [date(r.asOf) + ', ' + num(r.total) + ' profiles']);
      KEYS.slice().reverse().forEach(([s, label, c]) => tipLine(t, s === k ? 'ee-tip-b' : '', [swatch(css(c)), label + '  ' + num(r[s])]));
    };
    const total = { id: r.asOf, x: rx, y: top, ty: 50, hl: [{ vline: [rx, mt, H - mb] }, { circle: [rx, top, 4] }], label: { text: fmt(r.total), y: top - 2 }, tip: tip(null) };
    return [total].concat(stack.filter((s) => s[i][1] > s[i][0]).map((s) => {
      const y0 = y(s[i][0]), y1 = y(s[i][1]), mid = (y0 + y1) / 2;
      return { id: r.asOf + ':' + s.key, x: rx, y: mid, ty: 50, top: y1, bot: y0, brush: false, hl: [{ vline: [rx, mt, H - mb] }, { circle: [rx, mid, 4] }], label: { text: fmt(s[i][1] - s[i][0]) }, tip: tip(s.key) };
    }));
  });
  const byDate = d3.group(marks, (m) => m.x);
  selectable(el, svg, W, H, {
    marks, area: [ml, 0, W - mr, H], brush: 'x',
    find: (mx, my) => { const c = byDate.get(d3.least([...byDate.keys()], (k) => Math.abs(k - mx))); return c.find((m) => m.top != null && my >= m.top && my <= m.bot) || c[0]; },
  });
}
