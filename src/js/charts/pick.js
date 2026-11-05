// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Chart selection, shared by every chart: hover for details, click or tap to pin a figure on the chart, drag across
// a stretch to pin all of it, and the same from the keyboard. Pins are kept per chart across redraws, so changing
// the scenario or resizing the window keeps them.
import d3 from '../lib/d3.js';
import { css } from '../ui/theme.js';
import { tooltip, tipLine, placeTip } from '../ui/dom.js';

const store = new Map();
const pinsOf = (name) => { if (!store.has(name)) store.set(name, new Set()); return store.get(name); };
const hits = (a, b) => a[0] < b[2] + 2 && a[2] + 2 > b[0] && a[1] < b[3] + 2 && a[3] + 2 > b[1];
const listOf = (m) => (m.label ? [].concat(m.label).filter(Boolean) : []);

// an outline around a mark: circle [cx, cy, r], rect [x, y, w, h], path (with a transform) or vline [x, y0, y1]
const shape = (g, s, pinned) => {
  let n;
  if (s.circle) n = g.append('circle').attr('cx', s.circle[0]).attr('cy', s.circle[1]).attr('r', s.circle[2]);
  else if (s.rect) n = g.append('rect').attr('x', s.rect[0]).attr('y', s.rect[1]).attr('width', s.rect[2]).attr('height', Math.max(1, s.rect[3])).attr('rx', 3);
  else if (s.path) n = g.append('path').attr('d', s.path).attr('transform', s.transform || null);
  else if (s.vline) n = g.append('line').attr('x1', s.vline[0]).attr('x2', s.vline[0]).attr('y1', s.vline[1]).attr('y2', s.vline[2]);
  else return;
  n.style('fill', 'none').style('stroke', css('--ee-ink')).attr('stroke-width', 1.5).attr('opacity', s.vline ? (pinned ? 0.5 : 0.3) : pinned ? 1 : 0.55);
};

/**
 * A rounded callout whose tip points at (cx, cy), above it or below it; the body slides to stay inside 0..W.
 * Returns the group and its box [x0, y0, x1, y1].
 */
export const callout = (g, cx, cy, text, { fill, ink, below, W } = {}) => {
  const b = g.append('g').attr('class', 'ee-bubble');
  const t = b.append('text').attr('class', 'ee-t-bubble').attr('text-anchor', 'middle').text(text);
  if (ink) t.style('fill', ink);
  const w = t.node().getComputedTextLength() + 16, half = w / 2 + 4;
  let dx = 0;
  if (W) { if (cx - half < 1) dx = 1 - (cx - half); else if (cx + half > W - 1) dx = W - 1 - (cx + half); }
  dx = Math.max(6 - w / 2, Math.min(w / 2 - 6, dx));
  const xl = dx - w / 2, xr = dx + w / 2;
  b.insert('path', 'text').attr('d', `M${xl},-32H${xr}a4,4 0 0 1 4,4V-16a4,4 0 0 1 -4,4H5l-5,5l-5,-5H${xl}a4,4 0 0 1 -4,-4V-28a4,4 0 0 1 4,-4Z`)
    .attr('transform', below ? 'scale(1,-1)' : null).style('fill', fill || css('--ee-bubble'));
  t.attr('x', dx).attr('y', below ? 26 : -18);
  b.attr('transform', `translate(${cx},${cy})`);
  return { node: b, box: [cx + xl - 4, below ? cy + 7 : cy - 32, cx + xr + 4, below ? cy + 32 : cy - 7] };
};

/**
 * Make a chart selectable. Call it last, after the chart is drawn into svg (a d3 selection, W × H in viewBox units)
 * inside el (the view's element; its data-view name keys the pins).
 *
 * o.marks: the selectable figures, each
 *   { id, x, y,                 stable id and the point the figure belongs to
 *     tip(el),                  fills the tooltip
 *     hl: [shape],              outlined on hover and while pinned
 *     label: { text, y, by, fill, ink, below } or a list: callouts shown when pinned (a default shows the first);
 *       y and by place the tip above or below (default: 4px off the point)
 *     def,                      priority of a label shown without a pin (0 first); null: only when pinned
 *     drop,                     baseline for a dashed line under the label
 *     brush: false,             left out of a drag
 *     tx, ty }                  where the tooltip goes (default: the point)
 * o.find(mx, my): the mark under the pointer, or null
 * o.area: [x0, y0, x1, y1] that takes the pointer (default: the whole chart)
 * o.brush: 'x' to drag across a stretch, 'xy' to drag a box, unset for no drag
 * o.obstacles: boxes labels must not cover
 * o.linear: arrow keys step through the marks in order (otherwise by column, then up and down)
 */
export function selectable(el, svg, W, H, o) {
  const name = el.getAttribute('data-view'), pins = pinsOf(name), tip = tooltip(el);
  const marks = o.marks.filter(Boolean), byId = new Map(marks.map((m) => [m.id, m]));
  const area = o.area || [0, 0, W, H];
  const under = svg.insert('g', 'g'), hlPin = svg.append('g'), hlHover = svg.append('g'), labels = svg.append('g');
  [under, hlPin, hlHover, labels].forEach((g) => g.style('pointer-events', 'none'));
  const band = svg.append('rect').attr('display', 'none').style('pointer-events', 'none').style('fill', css('--ee-blue')).attr('fill-opacity', 0.1)
    .style('stroke', css('--ee-blue')).attr('stroke-opacity', 0.5);
  const hit = svg.append('rect').attr('x', area[0]).attr('y', area[1]).attr('width', area[2] - area[0]).attr('height', area[3] - area[1])
    .style('fill', 'transparent').style('cursor', o.brush ? 'crosshair' : 'pointer');

  // the card header carries a button that clears this chart's pins
  const card = el.closest('.ee-card'), head = card && card.querySelector(':scope > .ee-card-h');
  let clear = head && head.querySelector(':scope > .ee-pin-clear');
  if (head && !clear) {
    clear = document.createElement('button'); clear.type = 'button'; clear.className = 'ee-pill ee-pin-clear'; clear.hidden = true;
    head.appendChild(clear);
  }

  // pinned labels first (the latest always shows), then default labels by priority where they fit
  const paint = () => {
    under.selectAll('*').remove(); hlPin.selectAll('*').remove(); labels.selectAll('*').remove();
    const placed = (o.obstacles || []).slice();
    const put = (m, l, tries, force) => {
      const lx = l.x == null ? m.x : l.x;
      const at = (below) => (below ? (l.by == null ? m.y + 4 : l.by) : (l.y == null ? m.y - 4 : l.y));
      const draw = (below) => callout(labels, lx, at(below), l.text, { fill: l.fill, ink: l.ink, below, W });
      const keep = (r, below) => {
        placed.push(r.box);
        if (m.drop != null && !below) {
          under.append('line').attr('x1', lx).attr('x2', lx).attr('y1', m.y + 5).attr('y2', m.drop).style('stroke', css('--ee-faint')).attr('stroke-dasharray', '2 3');
          placed.push([lx - 1, m.y + 5, lx + 1, m.drop]);
        }
      };
      for (const below of tries) {
        const r = draw(below);
        if (r.box[1] > -2 && r.box[3] < H + 10 && !placed.some((p) => hits(r.box, p))) { keep(r, below); return; }
        r.node.remove();
      }
      if (force) keep(draw(tries[0]), tries[0]);
    };
    const on = [...pins].reverse().map((id) => byId.get(id)).filter(Boolean);
    on.forEach((m) => (m.hl || []).forEach((s) => shape(hlPin, s, true)));
    on.forEach((m, i) => listOf(m).forEach((l, j) => put(m, l, l.below ? [true, false] : [false, true], i === 0 && j === 0)));
    marks.filter((m) => m.def != null && !pins.has(m.id)).sort((a, b) => a.def - b.def)
      .forEach((m) => { const l = listOf(m)[0]; if (l) put(m, l, [!!l.below], false); });
    if (clear) {
      // written only on a change: the renderer redraws when a view's hidden attribute changes
      const text = 'Clear selection (' + on.length + ')';
      if (clear.hidden !== !on.length) clear.hidden = !on.length;
      if (clear.textContent !== text) clear.textContent = text;
    }
  };
  const toggle = (ids) => {
    const all = ids.length && ids.every((id) => pins.has(id));
    ids.forEach((id) => (all ? pins.delete(id) : pins.add(id)));
    paint();
  };
  if (clear) clear.onclick = () => { pins.clear(); paint(); tip.hidden = true; hlHover.selectAll('*').remove(); };

  let how = 'Click';
  const show = (m) => {
    hlHover.selectAll('*').remove();
    if (!m) { tip.hidden = true; return; }
    (m.hl || []).forEach((s) => shape(hlHover, s, false));
    tip.replaceChildren();
    m.tip(tip);
    tipLine(tip, 'ee-tip-h', [how + (pins.has(m.id) ? ' to unpin from the chart' : ' to pin on the chart')]);
    const k = svg.node().getBoundingClientRect().width / W;
    placeTip(el, tip, (m.tx == null ? m.x : m.tx) * k, (m.ty == null ? m.y : m.ty) * k);
  };

  // pointer: hover, click or tap toggles the nearest mark, a mouse drag toggles every mark in the stretch.
  // The press is kept on the container, so a redraw between press and release does not lose the click.
  const at = (ev) => d3.pointer(ev, svg.node());
  hit.on('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const [mx, my] = at(ev);
    el._eeDown = { mx, my, type: ev.pointerType, drag: false };
    if (o.brush && ev.pointerType !== 'touch') { try { hit.node().setPointerCapture(ev.pointerId); } catch { /* not capturable */ } }
  }).on('pointermove', (ev) => {
    const [mx, my] = at(ev);
    how = ev.pointerType === 'touch' ? 'Tap' : 'Click';
    const down = el._eeDown;
    if (down && o.brush && down.type !== 'touch' && (Math.abs(mx - down.mx) > 5 || (o.brush === 'xy' && Math.abs(my - down.my) > 5))) {
      down.drag = true; show(null);
      const x0 = Math.max(area[0], Math.min(mx, down.mx)), x1 = Math.min(area[2], Math.max(mx, down.mx));
      const y0 = o.brush === 'xy' ? Math.max(area[1], Math.min(my, down.my)) : area[1], y1 = o.brush === 'xy' ? Math.min(area[3], Math.max(my, down.my)) : area[3];
      band.attr('display', null).attr('x', x0).attr('y', y0).attr('width', x1 - x0).attr('height', y1 - y0);
      return;
    }
    show(o.find(mx, my));
  }).on('pointerup', (ev) => {
    const d = el._eeDown;
    if (!d) return;
    const [mx, my] = at(ev); el._eeDown = null;
    band.attr('display', 'none');
    if (d.drag) {
      const x0 = Math.min(mx, d.mx), x1 = Math.max(mx, d.mx), y0 = Math.min(my, d.my), y1 = Math.max(my, d.my);
      toggle(marks.filter((m) => m.brush !== false && m.x >= x0 && m.x <= x1 && (o.brush !== 'xy' || (m.y >= y0 && m.y <= y1))).sort((a, b) => a.x - b.x).map((m) => m.id));
      return;
    }
    const m = o.find(d.mx, d.my);
    if (m) { el._eePick = m.id; toggle([m.id]); if (d.type !== 'touch') show(m); }
  }).on('pointercancel', () => { el._eeDown = null; band.attr('display', 'none'); })
    .on('pointerleave', () => { if (!el._eeDown || !el._eeDown.drag) { el._eeDown = null; show(null); } });

  // keyboard: arrows move between figures, Enter or Space pins, Escape clears
  const cols = o.linear ? marks.map((m) => [m]) : d3.groups(marks, (m) => Math.round(m.x)).sort((a, b) => a[0] - b[0]).map(([, g]) => g.sort((a, b) => a.y - b.y));
  el.tabIndex = 0;
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', (svg.attr('aria-label') || 'Chart') + '. Arrow keys move between figures, Enter pins one on the chart, Escape clears the pins.');
  tip.setAttribute('aria-live', 'polite');
  el.onkeydown = (ev) => {
    if (!cols.length) return;
    let m = byId.get(el._eePick);
    const ci = m ? cols.findIndex((c) => c.includes(m)) : -1;
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], Home: [-Infinity, 0], End: [Infinity, 0] };
    if (moves[ev.key]) {
      ev.preventDefault();
      how = 'Enter';
      if (ci < 0) m = marks.filter((q) => q.def != null).sort((a, b) => a.def - b.def)[0] || cols[cols.length - 1][0];
      else {
        const [dc, dr] = moves[ev.key];
        if (o.linear && dr) { const n = Math.max(0, Math.min(cols.length - 1, ci + dr)); m = cols[n][0]; }
        else if (dc) { const n = Math.max(0, Math.min(cols.length - 1, ci + dc)); m = d3.least(cols[n], (q) => Math.abs(q.y - m.y)); }
        else { const c = cols[ci], j = Math.max(0, Math.min(c.length - 1, c.indexOf(m) + dr)); m = c[j]; }
      }
      el._eePick = m.id; show(m);
    } else if ((ev.key === 'Enter' || ev.key === ' ') && m) { ev.preventDefault(); how = 'Enter'; toggle([m.id]); show(m); }
    else if (ev.key === 'Escape') { if (pins.size) { pins.clear(); paint(); } show(null); }
  };
  el.onblur = () => { if (!el._eeDown) show(null); };
  paint();
}

/** The mark nearest the pointer along x. */
export const nearestX = (marks) => (mx) => d3.least(marks, (m) => Math.abs(m.x - mx));
