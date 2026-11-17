// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Every chart is an ECharts instance behind a renderer view. This module gives them one look (axes, labels,
// legends and tooltips from the CSS tokens) and pins: click or tap a figure, or the plot near one, to pin its value
// on the chart. Pins are kept per chart across redraws, so changing the scenario or resizing the window keeps them,
// and the card header carries a button that clears them. keyboard.js does the same from the keyboard.
import echarts from '../lib/echarts.js';
import { css } from '../ui/theme.js';
import { attachKeyboard } from './keyboard.js';

export { echarts };

const pinsOf = new Map(); // data-view name -> the names of its pinned figures
const KEY_HINT = '. Arrow keys move between figures, Enter pins one on the chart, Escape clears the pins.';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
const plain = (v) => v != null && Object.getPrototypeOf(v) === Object.prototype;

/** Deep-merge plain objects; arrays and anything else in b replace what a has. */
export const merge = (a, b) => {
  if (b === undefined) return a;
  if (!plain(a) || !plain(b)) return b;
  const o = { ...a };
  Object.keys(b).forEach((k) => { o[k] = merge(a[k], b[k]); });
  return o;
};

/** A rounded axis extent around lo..hi with about `count` ticks, on steps of 1, 2 or 5: { min, max, interval } */
export const nice = (lo, hi, count = 5) => {
  const raw = (hi - lo) / count || 1, p = 10 ** Math.floor(Math.log10(raw)), e = raw / p;
  const step = (e >= 7.07 ? 10 : e >= 3.16 ? 5 : e >= 1.41 ? 2 : 1) * p;
  return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, interval: step };
};

/* ---------- The dashboard's look ---------- */

const axisText = () => ({ color: css('--ee-muted'), fontSize: 11 });
/** A value axis: no axis line, recessive gridlines. */
export const valueAxis = (o) => merge({ type: 'value', axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: css('--ee-line') } }, axisLabel: axisText() }, o);
/** A time axis along the bottom, labelled by ECharts in months and years. */
export const timeAxis = (o) => merge({ type: 'time', axisLine: { lineStyle: { color: css('--ee-line') } }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { ...axisText(), margin: 10, hideOverlap: true } }, o);
/** A category axis along the bottom. */
export const categoryAxis = (o) => merge({ type: 'category', axisLine: { lineStyle: { color: css('--ee-line') } }, axisTick: { show: false }, axisLabel: { ...axisText(), margin: 10 } }, o);
/** A legend: click an entry to hide or show its series. */
export const legend = (o) => merge({ top: 0, left: 0, icon: 'roundRect', itemWidth: 9, itemHeight: 9, itemGap: 16, textStyle: { color: css('--ee-muted'), fontSize: 12 }, inactiveColor: css('--ee-faint') }, o);
/** The height a legend of these names takes in a chart W wide (it wraps onto more rows when it must). */
export const legendHeight = (names, W) => {
  let rows = 1, x = 0;
  names.forEach((n) => { const w = 30 + n.length * 6.7; if (x && x + w > W) { rows++; x = 0; } x += w; });
  return rows * 22;
};
/** A label in a filled rounded box, like a callout. */
export const bubble = (o) => merge({ show: true, position: 'top', distance: 8, color: css('--ee-bubble-ink'), backgroundColor: css('--ee-bubble'), padding: [3, 6], borderRadius: 4, fontSize: 11, fontWeight: 600 }, o);
/**
 * Series options that make its figures pinnable; each data item needs a stable name. label: a pinned figure's label,
 * over a bubble; item: its item style, over an outline. Labels that collide are hidden, pinned ones last.
 */
export const pinnable = (label, item) => ({
  pin: { label: bubble(label), item: merge({ borderColor: css('--ee-ink'), borderWidth: 2 }, item) },
  labelLayout: { hideOverlap: true },
});

/* ---------- The view ---------- */

/**
 * A renderer view drawing one chart. build(el) describes the chart for the current state:
 *   { height, label,      px; the accessible name
 *     option,             the ECharts option; the shared look is merged under it
 *     describe(id, i),    a figure's tooltip, by series id and data index: { title, rows: [text | { text, color, bold }] }
 *     nav,                the figures in arrow-key order, as columns of [seriesIndex, dataIndex] from top to bottom
 *                         (default: every pinnable figure, each its own column, series by series)
 *     start,              the column the arrow keys start from (default: the last)
 *     pick: 'x' | 'xy' }  a click in the plot that misses every figure pins the nearest pinnable one: the nearest
 *                         along x, or the nearest in both directions
 * or { height, empty } for a message instead of a chart, or null to draw nothing yet.
 * o.decorative: no tooltip, pins or keyboard, and hidden from assistive technology (the KPI sparkline).
 */
export function chartView(build, o = {}) {
  return {
    mount(el) {
      const chart = echarts.init(el, null, { renderer: 'svg' });
      const name = el.getAttribute('data-view');
      if (!pinsOf.has(name)) pinsOf.set(name, new Set());
      const st = { el, chart, o, pins: pinsOf.get(name), how: 'Click', off: new Set(), spec: null, option: null, sig: '', mode: null, size: '' };
      if (o.decorative) { el.setAttribute('aria-hidden', 'true'); return st; }
      el.setAttribute('role', 'group');
      // a click on a figure pins it; a click in the plot that hits none pins the nearest
      chart.on('click', (p) => {
        if (figureName(st, p.seriesIndex, p.dataIndex) == null) return;
        st.hit = true;
        toggle(st, p.seriesIndex, p.dataIndex);
        chart.dispatchAction({ type: 'showTip', seriesIndex: p.seriesIndex, dataIndex: p.dataIndex });
      });
      chart.getZr().on('click', (e) => setTimeout(() => { const hit = st.hit; st.hit = false; if (!hit) pickNearest(st, e.offsetX, e.offsetY); }));
      chart.on('legendselectchanged', (e) => { st.off = new Set(Object.keys(e.selected).filter((k) => !e.selected[k])); });
      el.addEventListener('pointermove', (ev) => { st.how = ev.pointerType === 'touch' ? 'Tap' : 'Click'; });
      st.keys = attachKeyboard(el, chart, {
        nav: () => navOf(st),
        start: () => st.spec && st.spec.start,
        toggle: (si, di) => toggle(st, si, di),
        clear: () => clearPins(st),
        text: (si, di) => describeText(st, si, di),
        setHow: (how) => { st.how = how; },
      });
      return st;
    },
    update(el, st) { draw(st, build(el)); },
  };
}

function draw(st, spec) {
  const { el, chart, o } = st;
  const mode = !spec ? 'none' : spec.empty != null ? 'empty' : 'chart';
  if (spec && spec.height && el.style.height !== spec.height + 'px') el.style.height = spec.height + 'px';
  const size = el.clientWidth + 'x' + el.clientHeight;
  if (size !== st.size) { st.size = size; chart.resize(); }
  if (mode === 'none') {
    if (st.mode !== 'none') { chart.clear(); st.mode = 'none'; st.sig = ''; st.option = null; syncClear(st); }
    return;
  }
  const option = mode === 'empty' ? emptyOption(spec.empty, el.clientWidth) : compose(st, spec, o);
  // functions drop out of the signature, but what they read is in the option: an unchanged chart is left alone
  const sig = size + JSON.stringify(option);
  if (sig === st.sig) return;
  const fresh = st.mode !== mode;
  Object.assign(st, { sig, mode, spec, option });
  chart.setOption(option, fresh ? { notMerge: true } : { replaceMerge: ['series', 'xAxis', 'yAxis', 'legend', 'graphic', 'title'] });
  if (mode === 'chart' && !o.decorative) st.keys.refresh();
  syncClear(st);
}

// draw again after the pins change
const repaint = (st) => { if (st.mode === 'chart') { st.sig = ''; draw(st, st.spec); } };

function compose(st, spec, o) {
  const ink = css('--ee-ink'), muted = css('--ee-muted'), font = css('--ee-font') || "'Open Sans', system-ui, sans-serif";
  const option = merge({
    useUTC: true,
    animationDuration: 450,
    animationDurationUpdate: 300,
    textStyle: { fontFamily: font, fontSize: 11, color: muted },
    grid: { left: 4, right: 12, top: 16, bottom: 4, containLabel: true },
    aria: { enabled: !o.decorative, label: { description: (spec.label || 'Chart') + (o.decorative ? '' : KEY_HINT) } },
    tooltip: o.decorative ? { show: false } : {
      show: true, trigger: 'item', confine: true, transitionDuration: 0,
      backgroundColor: css('--ee-card'), borderColor: css('--ee-line'), borderWidth: 1, padding: [6, 10],
      textStyle: { color: ink, fontSize: 12, fontFamily: font },
      extraCssText: 'border-radius:6px;box-shadow:0 6px 18px rgba(20,26,46,.16);line-height:1.5;white-space:nowrap;font-variant-numeric:tabular-nums',
      formatter: (p) => tipHtml(st, p),
    },
  }, spec.option);
  // pinned figures carry their pin's label and outline
  option.series = option.series.map((s) => (!s.pin ? s : {
    ...s,
    data: s.data.map((d) => (d && d.name != null && st.pins.has(d.name) ? { ...d, label: merge(d.label, s.pin.label), itemStyle: merge(d.itemStyle, s.pin.item) } : d)),
  }));
  return option;
}

const emptyOption = (text, W) => ({
  title: { text, left: 'center', top: 'middle', textAlign: 'center', textStyle: { color: css('--ee-muted'), fontSize: 12.5, fontWeight: 'normal', lineHeight: 18, width: Math.max(120, W - 48), overflow: 'break' } },
});

/* ---------- Tooltips ---------- */

const pinnableSeries = (st, si) => !!(st.option && st.option.series && st.option.series[si] && st.option.series[si].pin);
const figureName = (st, si, di) => { const d = pinnableSeries(st, si) && st.option.series[si].data[di]; return d && d.name != null ? d.name : null; };
// the pinnable figure a tooltip belongs to: its own, or for a tooltip over a whole column, the column's
const tipFigure = (st, si, di, column) => {
  if (figureName(st, si, di) != null) return [si, di];
  if (!column && !st.spec.pick) return null;
  const k = st.option.series.findIndex((s, i) => figureName(st, i, di) != null);
  return k < 0 ? null : [k, di];
};
const describe = (st, si, di) => { const s = st.option.series[si]; return s && st.spec.describe ? st.spec.describe(s.id, di) : null; };
const rowsOf = (d) => d.rows.filter(Boolean).map((r) => (typeof r === 'string' ? { text: r } : r));

function tipHtml(st, p) {
  const column = Array.isArray(p), q = column ? p[0] : p;
  const d = q && describe(st, q.seriesIndex, q.dataIndex);
  if (!d) return '';
  let html = '<div class="ee-tip-h">' + esc(d.title) + '</div>' + rowsOf(d).map((r) => '<div' + (r.bold ? ' class="ee-tip-b"' : '') + '>'
    + (r.color ? '<span class="ee-sw" style="background:' + esc(r.color) + '"></span>' : '') + esc(r.text) + '</div>').join('');
  const f = tipFigure(st, q.seriesIndex, q.dataIndex, column);
  if (f) html += '<div class="ee-tip-h">' + st.how + (st.pins.has(figureName(st, f[0], f[1])) ? ' to unpin from the chart' : ' to pin on the chart') + '</div>';
  return html;
}

function describeText(st, si, di) {
  const d = describe(st, si, di);
  if (!d) return '';
  return [d.title].concat(rowsOf(d).map((r) => r.text)).join('. ') + (st.pins.has(figureName(st, si, di)) ? '. Pinned' : '');
}

/* ---------- Pins ---------- */

function eachFigure(st, fn) {
  if (st.mode !== 'chart' || !st.option) return;
  st.option.series.forEach((s, si) => { if (s.pin) s.data.forEach((d, di) => { if (d && d.name != null) fn(si, di, d.name, s); }); });
}

function toggle(st, si, di) {
  const n = figureName(st, si, di);
  if (n == null) return;
  if (st.pins.has(n)) st.pins.delete(n); else st.pins.add(n);
  repaint(st);
}

function clearPins(st) {
  st.pins.clear();
  repaint(st);
  syncClear(st);
}

function pickNearest(st, x, y) {
  const mode = st.spec && st.spec.pick;
  if (!mode || st.mode !== 'chart' || !st.chart.containPixel({ gridIndex: 0 }, [x, y])) return;
  let best = null;
  eachFigure(st, (si, di, n, s) => {
    const d = s.data[di];
    if (st.off.has(s.name) || d.value === 0) return; // a hidden series, or an empty segment of a stack
    const [px, py] = st.chart.convertToPixel({ seriesIndex: si }, Array.isArray(d.value) ? d.value : [di, d.value]);
    const dist = mode === 'xy' ? Math.hypot(px - x, py - y) : Math.abs(px - x);
    // on a tie the later series wins: in a stack, the segment on top
    if (!best || dist <= best.dist) best = { si, di, dist };
  });
  if (!best) return;
  toggle(st, best.si, best.di);
  st.chart.dispatchAction({ type: 'showTip', seriesIndex: best.si, dataIndex: best.di });
}

function navOf(st) {
  if (st.mode !== 'chart') return [];
  const shown = ([si]) => !st.off.has(st.option.series[si].name);
  if (st.spec.nav) return st.spec.nav.map((c) => c.filter(shown)).filter((c) => c.length);
  const cols = [];
  eachFigure(st, (si, di) => { if (shown([si])) cols.push([[si, di]]); });
  return cols;
}

// the card header's Clear button, shown while the chart has pins
function syncClear(st) {
  const head = st.el.closest('.ee-card') && st.el.closest('.ee-card').querySelector(':scope > .ee-card-h');
  if (!head) return;
  let n = 0;
  eachFigure(st, (si, di, name) => { if (st.pins.has(name)) n++; });
  let b = head.querySelector(':scope > .ee-pin-clear');
  if (!b) {
    if (!n) return;
    b = document.createElement('button');
    b.type = 'button'; b.className = 'ee-pill ee-pin-clear'; b.hidden = true;
    head.appendChild(b);
  }
  b.onclick = () => { clearPins(st); st.chart.dispatchAction({ type: 'hideTip' }); };
  // written only on a change: the renderer redraws when a view's hidden attribute changes
  const text = 'Clear selection (' + n + ')';
  if (b.hidden !== !n) b.hidden = !n;
  if (b.textContent !== text) b.textContent = text;
}
