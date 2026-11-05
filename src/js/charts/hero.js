// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Overview hero: the selected type's cut-off history, every projected round through the horizon with its likely
// range, and what was projected before each round under the new rules.
import d3 from '../lib/d3.js';
import { store, scenario, model } from '../state.js';
import { RULES } from '../model/eem.js';
import { num, signed, date, toDate } from '../ui/format.js';
import { css } from '../ui/theme.js';
import { empty, tipLine } from '../ui/dom.js';
import { chartSvg, yAxis, grid, xAxis, timeTicks } from './axes.js';
import { selectable, nearestX } from './pick.js';

export function heroChart(el) {
  const draws = store.rows('draws');
  el.replaceChildren();
  if (!draws) return;
  const key = scenario.cat(), r = model.cur(), plan = model.plan(key);
  let pts = draws.filter((d) => d.key === key).map((d) => ({ ...d, t: toDate(d.drawDate) })).sort((a, b) => a.t - b.t);
  if (!pts.length || !r || !plan) { empty(el, 'No draws of this type yet.'); return; }
  const span = scenario.span();
  if (span !== 'all') { const cut = d3.utcMonth.offset(pts[pts.length - 1].t, -Number(span)); const k = pts.filter((p) => p.t >= cut); if (k.length >= 2) pts = k; }
  // the projected rounds: from the next one (the type's usual gap, no earlier than the end of the rescoring pause) through the horizon
  const fut = plan.rounds.map((q) => ({ ...q, t: toDate(q.date) }));
  const rec = new Map((plan.records || []).map((x) => [x.drawNumber, x]));
  const nextT = fut[fut.length - 1].t;
  const W = Math.max(280, el.clientWidth), H = W < 560 ? 280 : 330, mt = 44, mb = 30, mr = W < 560 ? 34 : 56;
  const ys = pts.map((p) => p.drawCRS).concat(fut.flatMap((q) => [q.low, q.high]), pts.filter((p) => rec.has(p.drawNumber)).map((p) => rec.get(p.drawNumber).projected));
  const pad = Math.max(8, (d3.max(ys) - d3.min(ys)) * 0.12);
  const y = d3.scaleLinear([d3.min(ys) - pad, d3.max(ys) + pad], [H - mb, mt]).nice();
  const svg = chartSvg(el, W, H, 'Cut-off history and projected rounds');
  const ml = yAxis(svg, y, null, 5);
  const x = d3.scaleUtc([pts[0].t, nextT], [ml + 8, W - mr]);
  grid(svg, y, ml, W - 4, 5);

  // the history: a magenta-to-orange line over a fading area
  const id = 'eeg' + Math.random().toString(36).slice(2, 8);
  const defs = svg.append('defs');
  const lg = defs.append('linearGradient').attr('id', id).attr('x1', 0).attr('x2', 1).attr('y1', 0).attr('y2', 0);
  lg.append('stop').attr('offset', '0%').style('stop-color', css('--ee-magenta'));
  lg.append('stop').attr('offset', '100%').style('stop-color', css('--ee-orange'));
  const fade = defs.append('linearGradient').attr('id', id + 'f').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
  [[0, 0.55], [0.6, 0.18], [1, 0.02]].forEach(([o, a]) => fade.append('stop').attr('offset', o).style('stop-color', '#fff').style('stop-opacity', a));
  defs.append('mask').attr('id', id + 'm').append('rect').attr('x', 0).attr('y', 0).attr('width', W).attr('height', H).style('fill', `url(#${id}f)`);
  svg.append('path').datum(pts).style('fill', `url(#${id})`).attr('mask', `url(#${id}m)`)
    .attr('d', d3.area((p) => x(p.t), H - mb, (p) => y(p.drawCRS)));
  svg.append('path').datum(pts).style('fill', 'none').style('stroke', `url(#${id})`).attr('stroke-width', 2.5).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round')
    .attr('d', d3.line((p) => x(p.t), (p) => y(p.drawCRS)));
  xAxis(svg, x, H - mb, { ticks: timeTicks(W) });

  const last = pts[pts.length - 1], coral = css('--ee-coral'), ruleT = toDate(RULES);
  if (ruleT > x.domain()[0] && ruleT < x.domain()[1]) {
    svg.append('line').attr('x1', x(ruleT)).attr('x2', x(ruleT)).attr('y1', mt - 14).attr('y2', H - mb).style('stroke', css('--ee-orange')).attr('stroke-width', 1.5).attr('stroke-dasharray', '4 3');
    svg.append('text').attr('class', 'ee-rules-label').attr('x', x(ruleT) - 6).attr('y', mt - 18).attr('text-anchor', 'end').text('New rules, Nov 3');
  }
  // projected rounds: the likely range shaded, the path dashed from the last cut-off drawn
  const path = [{ t: last.t, projected: last.drawCRS, low: last.drawCRS, high: last.drawCRS }].concat(fut);
  svg.append('path').datum(path).style('fill', coral).attr('opacity', 0.12).attr('d', d3.area((q) => x(q.t), (q) => y(q.low), (q) => y(q.high)));
  svg.append('path').datum(path).style('fill', 'none').style('stroke', coral).attr('stroke-width', 2).attr('stroke-dasharray', '5 4').attr('stroke-linejoin', 'round')
    .attr('d', d3.line((q) => x(q.t), (q) => y(q.projected)));
  // what was projected before each round under the new rules
  const held = pts.filter((p) => rec.has(p.drawNumber));
  svg.append('g').selectAll('line').data(held).join('line').attr('x1', (p) => x(p.t)).attr('x2', (p) => x(p.t)).attr('y1', (p) => y(p.drawCRS)).attr('y2', (p) => y(rec.get(p.drawNumber).projected))
    .style('stroke', coral).attr('stroke-width', 1).attr('opacity', 0.6);
  svg.append('g').selectAll('circle').data(held).join('circle').attr('cx', (p) => x(p.t)).attr('cy', (p) => y(rec.get(p.drawNumber).projected)).attr('r', 4.5)
    .style('fill', 'none').style('stroke', coral).attr('stroke-width', 1.5);
  svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', (p) => x(p.t)).attr('cy', (p) => y(p.drawCRS)).attr('r', pts.length > 40 ? 2.6 : 3.6)
    .style('fill', css('--ee-card')).style('stroke', css('--ee-magenta')).attr('stroke-width', 2);
  svg.append('g').selectAll('circle').data(fut).join('circle').attr('cx', (q) => x(q.t)).attr('cy', (q) => y(q.projected)).attr('r', (q, i) => (i ? 3.4 : 5.5))
    .style('fill', css('--ee-card')).style('stroke', coral).attr('stroke-width', (q, i) => (i ? 2 : 2.5));

  // every draw and projected round is selectable. Labelled without a pin: the next round, the last projected round,
  // and the latest draws while there is room.
  const recent = pts.slice(-4).reverse();
  const marks = pts.map((p) => {
    const px = x(p.t), py = y(p.drawCRS), was = rec.get(p.drawNumber), d = recent.indexOf(p);
    return {
      id: key + ':d' + p.drawNumber, x: px, y: py, hl: [{ circle: [px, py, 7] }], label: { text: String(p.drawCRS) }, def: d < 0 ? null : 2 + d, drop: H - mb,
      tip: (tip) => {
        tipLine(tip, 'ee-tip-h', [date(p.drawDate) + ', draw #' + p.drawNumber]);
        tipLine(tip, '', ['Cut-off ' + p.drawCRS + ', ' + num(p.drawSize) + ' invitations']);
        if (was) tipLine(tip, '', ['Projected before it ' + was.projected + ', missed by ' + signed(was.miss)]);
      },
    };
  }).concat(fut.map((q, i) => {
    const qx = x(q.t), qy = y(q.projected);
    return {
      id: key + ':p' + q.date, x: qx, y: qy, hl: [{ circle: [qx, qy, i ? 7 : 9] }], def: i === 0 ? 0 : i === fut.length - 1 ? 1 : null,
      label: { text: (i ? '' : '≈ ') + q.projected, y: y(q.high) - 2, by: y(q.low) + 2, fill: coral, ink: '#fff' },
      tip: (tip) => {
        tipLine(tip, 'ee-tip-h', [(i ? 'Projected round ' + (i + 1) : 'Next round') + ', about ' + date(q.date)]);
        tipLine(tip, '', ['Cut-off ' + q.projected + ' (likely ' + q.low + ' to ' + q.high + ')']);
        tipLine(tip, '', [num(q.size) + ' invitations' + (q.size === plan.t.usualSize ? ', usual size' : '')]);
        if (q.withPoints != null) tipLine(tip, '', [Math.round(q.withPoints * 100) + '% of invitees with new points']);
      },
    };
  }));
  const rules = svg.select('.ee-rules-label').node(), rw = rules ? rules.getComputedTextLength() : 0;
  selectable(el, svg, W, H, {
    marks, area: [ml, 0, W, H], brush: 'x',
    obstacles: rules ? [[x(ruleT) - 6 - rw, mt - 30, x(ruleT) - 6, mt - 14]] : [],
    find: nearestX(marks),
  });
}
