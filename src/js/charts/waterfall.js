// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Forecast: how the next projection is built, step by step from the last cut-off.
import d3 from '../lib/d3.js';
import { model } from '../state.js';
import { signed, date } from '../ui/format.js';
import { css } from '../ui/theme.js';
import { tipLine } from '../ui/dom.js';
import { chartSvg, yAxis, grid } from './axes.js';
import { selectable, nearestX } from './pick.js';

export function waterfallChart(el) {
  const r = model.cur();
  el.replaceChildren();
  if (!r) return;
  const steps = [
    { label: 'Last cut-off', abs: r.lastCRS },
    { label: r.assimilated ? 'Pool since' : r.modelled ? 'Pool and pause' : 'Recent pattern', d: r.poolEffect },
    { label: 'New points', d: r.ruleEffect, off: r.method === 'pattern' || r.ruleIn, offText: r.ruleIn ? 'in pool' : 'n/a' },
    { label: 'Draw size', d: r.sizeEffect, off: !r.modelled },
    { label: 'Projected', abs: r.projected, end: true },
  ];
  let run = 0;
  steps.forEach((s) => { if (s.abs != null) { s.y0 = s.abs; s.y1 = s.abs; run = s.abs; } else { s.y0 = run; run += s.d; s.y1 = run; } });
  const vals = steps.flatMap((s) => [s.y0, s.y1]).concat([r.low, r.high]);
  const lo = d3.min(vals), hi = d3.max(vals), pad = Math.max(6, (hi - lo) * 0.25);
  const W = Math.max(260, el.clientWidth), H = 260, mt = 26, mb = 40;
  const y = d3.scaleLinear([lo - pad, hi + pad], [H - mb, mt]).nice();
  const svg = chartSvg(el, W, H, 'Projection steps');
  const ml = yAxis(svg, y, null, 5);
  grid(svg, y, ml, W - 4, 5);
  const x = d3.scaleBand(steps.map((s) => s.label), [ml + 4, W - 4]).padding(0.32);
  const base = y.domain()[0], coral = css('--ee-coral'), green = css('--ee-green'), blue = css('--ee-blue'), slate = css('--ee-slate');
  const marks = [];
  steps.forEach((s, i) => {
    const bx = x(s.label), bw = x.bandwidth();
    // totals stand on the axis; changes float from the running total, coral when they push the cut-off up
    let top, bot, fill;
    if (s.abs != null) { top = y(s.abs); bot = y(base); fill = s.end ? blue : slate; }
    else { top = y(Math.max(s.y0, s.y1)); bot = y(Math.min(s.y0, s.y1)); fill = s.d > 0 ? coral : s.d < 0 ? green : slate; if (bot - top < 2) { top -= 1; bot += 1; } }
    svg.append('rect').attr('x', bx).attr('width', bw).attr('y', top).attr('height', Math.max(2, bot - top)).attr('rx', 3).style('fill', fill).attr('opacity', s.off ? 0.35 : 1);
    if (i < steps.length - 1) svg.append('line').attr('x1', bx + bw).attr('x2', x(steps[i + 1].label)).attr('y1', y(s.y1)).attr('y2', y(s.y1)).style('stroke', css('--ee-faint')).attr('stroke-dasharray', '3 3');
    const txt = s.abs != null ? String(s.abs) : s.off ? s.offText || 'n/a' : signed(s.d);
    svg.append('text').attr('class', 'ee-t-ink').attr('x', bx + bw / 2).attr('y', top - 7).attr('text-anchor', 'middle').text(txt);
    s.label.split(' ').forEach((w, j) => svg.append('text').attr('x', bx + bw / 2).attr('y', H - mb + 16 + j * 13).attr('text-anchor', 'middle').text(w));
    // a pinned step shows where it leaves the cut-off: from and to for a change, the likely range for the projection
    const ltop = s.end ? Math.min(top, y(r.high)) : top;
    marks.push({
      id: r.key + ':' + i, x: bx + bw / 2, y: top, hl: [{ rect: [bx - 2, top - 2, bw + 4, Math.max(2, bot - top) + 4] }],
      label: s.off ? null : { text: s.end ? r.low + '–' + r.high : s.abs != null ? String(s.abs) : s.y0 + ' → ' + s.y1, y: ltop - 20, by: Math.min(bot, top + 24) },
      tip: (t) => {
        tipLine(t, 'ee-tip-h', [s.label]);
        if (s.end) { tipLine(t, '', ['Projected cut-off ' + r.projected]); tipLine(t, '', ['Likely ' + r.low + ' to ' + r.high]); }
        else if (s.abs != null) tipLine(t, '', ['Cut-off ' + s.abs + ', ' + date(r.lastDate)]);
        else if (s.off) tipLine(t, '', [s.offText === 'in pool' ? 'Already counted in Pool since' : 'Not used for this draw type']);
        else { tipLine(t, '', ['Moves the cut-off ' + signed(s.d)]); tipLine(t, '', ['From ' + s.y0 + ' to ' + s.y1]); }
      },
    });
  });
  // the likely range, as a whisker on the projection
  const ex = x('Projected') + x.bandwidth() / 2;
  svg.append('line').attr('x1', ex).attr('x2', ex).attr('y1', y(r.high)).attr('y2', y(r.low)).style('stroke', css('--ee-ink')).attr('stroke-width', 1.5).attr('opacity', 0.6);
  [r.low, r.high].forEach((v) => svg.append('line').attr('x1', ex - 5).attr('x2', ex + 5).attr('y1', y(v)).attr('y2', y(v)).style('stroke', css('--ee-ink')).attr('stroke-width', 1.5).attr('opacity', 0.6));
  selectable(el, svg, W, H, { marks, area: [ml, 0, W, H], find: nearestX(marks) });
}
