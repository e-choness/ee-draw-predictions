// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Keyboard access for a chart, which ECharts leaves out: Tab focuses the chart, the arrow keys move between its
// figures and show each one's tooltip, Enter or Space pins the figure in focus, and Escape clears the pins.
// A polite live region reads out the figure in focus.
//
// h: { nav() -> columns of [seriesIndex, dataIndex] top to bottom, start() -> first column or null,
//      toggle(si, di), clear(), text(si, di) -> what to read out, setHow(word) for the tooltip's hint }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const MOVES = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], Home: [-Infinity, 0], End: [Infinity, 0] };

export function attachKeyboard(el, chart, h) {
  el.tabIndex = 0;
  const live = document.createElement('div');
  live.className = 'ee-sr';
  live.setAttribute('aria-live', 'polite');
  el.appendChild(live);

  let col = -1, row = 0, lit = null;
  const current = (nav) => nav[col] && nav[col][clamp(row, 0, nav[col].length - 1)];
  const unlight = () => { if (lit) chart.dispatchAction({ type: 'downplay', seriesIndex: lit[0], dataIndex: lit[1] }); lit = null; };
  const show = (f) => {
    unlight();
    if (!f) return;
    lit = f;
    h.setHow('Enter');
    chart.dispatchAction({ type: 'highlight', seriesIndex: f[0], dataIndex: f[1] });
    chart.dispatchAction({ type: 'showTip', seriesIndex: f[0], dataIndex: f[1] });
    live.textContent = h.text(f[0], f[1]);
  };

  el.addEventListener('keydown', (ev) => {
    const nav = h.nav();
    if (!nav.length) return;
    if (MOVES[ev.key]) {
      ev.preventDefault();
      if (col < 0 || col >= nav.length) { col = clamp(h.start() ?? nav.length - 1, 0, nav.length - 1); row = 0; } else {
        const [dc, dr] = MOVES[ev.key];
        col = clamp(col + dc, 0, nav.length - 1);
        row = clamp(row + dr, 0, nav[col].length - 1);
      }
      show(current(nav));
    } else if ((ev.key === 'Enter' || ev.key === ' ') && current(nav)) {
      ev.preventDefault();
      const f = current(nav);
      h.toggle(f[0], f[1]);
      show(f);
    } else if (ev.key === 'Escape') {
      h.clear();
      unlight();
      chart.dispatchAction({ type: 'hideTip' });
      live.textContent = 'Pins cleared';
    }
  });
  el.addEventListener('blur', () => { unlight(); chart.dispatchAction({ type: 'hideTip' }); });

  return {
    /** After a redraw: keep the figure in focus lit, or start over if it is gone. */
    refresh() {
      const nav = h.nav();
      if (col >= nav.length) { col = -1; lit = null; return; }
      if (lit && document.activeElement === el) show(current(nav));
    },
  };
}
