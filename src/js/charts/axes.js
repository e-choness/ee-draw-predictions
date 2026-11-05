// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Axes and gridlines in the dashboard's style: no domain lines on the value axis, recessive grid, text from CSS.
import d3 from '../lib/d3.js';
import { css } from '../ui/theme.js';

/** A responsive chart svg in el, sized by its viewBox. */
export const chartSvg = (el, W, H, label) => d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', label);

/** A left axis that measures its own labels; returns the left margin the plot starts at. */
export const yAxis = (svg, y, fmt, ticks) => {
  const g = svg.append('g').call(d3.axisLeft(y).ticks(ticks || 5).tickSize(0).tickFormat(fmt || null)).attr('font-size', null).attr('font-family', null);
  g.select('.domain').remove();
  const ml = Math.ceil(d3.max(g.selectAll('text').nodes(), (n) => n.getComputedTextLength()) || 20) + 10;
  g.attr('transform', `translate(${ml - 6},0)`);
  return ml;
};

/** Horizontal gridlines at the y ticks, behind everything else. */
export const grid = (svg, y, x0, x1, ticks) => svg.insert('g', ':first-child').selectAll('line').data(y.ticks(ticks || 5)).join('line')
  .attr('x1', x0).attr('x2', x1).attr('y1', (v) => y(v)).attr('y2', (v) => y(v)).style('stroke', css('--ee-line'));

/** A bottom axis at y0; for a time scale, months and years about every 120px. Returns the axis group. */
export const xAxis = (svg, x, y0, { ticks, values, format } = {}) => {
  const ax = d3.axisBottom(x).tickSize(0).tickPadding(10);
  if (values) ax.tickValues(values); else ax.ticks(ticks);
  ax.tickFormat(format || d3.utcFormat('%b %Y'));
  const g = svg.append('g').attr('transform', `translate(0,${y0})`).call(ax).attr('font-size', null).attr('font-family', null);
  g.select('.domain').style('stroke', css('--ee-line'));
  return g;
};
/** Time ticks for a chart W wide. */
export const timeTicks = (W) => Math.max(2, Math.floor(W / 120));
