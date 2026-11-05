// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Pool scores: profiles in each IRCC score band under the new rules, over the same bands before the new points,
// with the band the next projected cut-off falls in highlighted.
import d3 from '../lib/d3.js';
import { model } from '../state.js';
import { num, signed } from '../ui/format.js';
import { css } from '../ui/theme.js';
import { tipLine, swatch } from '../ui/dom.js';
import { chartSvg, yAxis, grid } from './axes.js';
import { selectable, nearestX } from './pick.js';

export function scoreBandsChart(el) {
  const pv = model.poolView(), r = model.cur();
  el.replaceChildren();
  if (!pv) return;
  drawBands(el, pv.rows, {
    a: { key: 'after', fill: css('--ee-blue'), label: pv.live ? 'IRCC, new rules' : 'New rules, estimated' },
    b: { key: 'before', fill: css('--ee-track'), stroke: css('--ee-slate'), label: pv.live ? 'IRCC, old rules' : 'IRCC count, old rules' },
    mark: r ? { v: r.projected, label: 'Next ' + r.category + ' ≈ ' + r.projected } : null,
  });
}

// rows: { band, lo, hi, [a.key], [b.key] }; a is drawn narrow in front of b
function drawBands(el, rows, { a, b, mark }) {
  const W = Math.max(280, el.clientWidth), H = W < 560 ? 280 : 320, mt = 24, mb = 44;
  const y = d3.scaleLinear([0, d3.max(rows, (r) => Math.max(r[a.key], r[b.key]))], [H - mb, mt]).nice();
  const svg = chartSvg(el, W, H, 'Profiles by score band');
  const ml = yAxis(svg, y, d3.format('~s'), 5);
  grid(svg, y, ml, W - 4, 5);
  const x = d3.scaleBand(rows.map((r) => r.band), [ml + 2, W - 4]).padding(0.2);
  const bw = x.bandwidth();
  const obstacles = [];
  if (mark) {
    const band = rows.find((r) => mark.v >= r.lo && mark.v <= r.hi);
    if (band) {
      const bx = x(band.band) + bw / 2;
      svg.append('rect').attr('x', x(band.band) - (x.step() - bw) / 2).attr('width', x.step()).attr('y', mt - 6).attr('height', H - mb - mt + 6).style('fill', css('--ee-chip'));
      const t = svg.append('text').attr('class', 'ee-t-ink').attr('y', 12).text(mark.label);
      const tw = t.node().getComputedTextLength(), tx = Math.min(W - tw - 2, Math.max(ml, bx - tw / 2));
      t.attr('x', tx);
      obstacles.push([tx, 0, tx + tw, 16]);
    }
  }
  const g = svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (r) => `translate(${x(r.band)},0)`);
  g.append('rect').attr('x', 0).attr('width', bw).attr('y', (r) => y(r[b.key])).attr('height', (r) => y(0) - y(r[b.key])).attr('rx', 2)
    .style('fill', b.fill).style('stroke', b.stroke || 'none').attr('stroke-width', 1);
  g.append('rect').attr('x', bw * 0.22).attr('width', bw * 0.56).attr('y', (r) => y(r[a.key])).attr('height', (r) => y(0) - y(r[a.key])).attr('rx', 2).style('fill', a.fill);
  const every = bw < 22 ? 2 : 1;
  svg.append('g').selectAll('text').data(rows.filter((r, i) => i % every === 0 || i === rows.length - 1)).join('text')
    .attr('x', (r) => x(r.band) + bw / 2).attr('y', H - mb + 16).attr('text-anchor', 'middle').text((r) => (r.lo === 0 ? '≤300' : r.lo === 601 ? '601+' : r.lo));
  svg.append('text').attr('x', (ml + W) / 2).attr('y', H - 6).attr('text-anchor', 'middle').text('CRS score, start of band');

  // each band is selectable: a pin shows its count under the new rules
  const fmt = d3.format('.3~s');
  const marks = rows.map((r) => {
    const top = y(Math.max(r[a.key], r[b.key]));
    return {
      id: r.band, x: x(r.band) + bw / 2, y: top, hl: [{ rect: [x(r.band) - 2, top - 2, bw + 4, y(0) - top + 2] }], label: { text: fmt(r[a.key]), y: top - 2 },
      tip: (tip) => {
        tipLine(tip, 'ee-tip-h', ['CRS ' + r.band]);
        tipLine(tip, '', [swatch(a.fill), a.label + '  ' + num(r[a.key])]);
        tipLine(tip, '', [swatch(b.stroke || b.fill), b.label + '  ' + num(r[b.key])]);
        tipLine(tip, '', ['Difference  ' + signed(r[a.key] - r[b.key])]);
      },
    };
  });
  selectable(el, svg, W, H, { marks, area: [ml, 0, W, H], brush: 'x', obstacles, find: nearestX(marks) });
}
