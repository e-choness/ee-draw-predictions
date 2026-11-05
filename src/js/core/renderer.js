// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Draws the page. Views are registered by name and drawn into every element with a matching data-view attribute,
// on the next animation frame after something changes: the store, the width of a view, or which page is shown.
// Views on hidden pages are skipped until the page is shown.
//
// A view is either a function (el) => void that redraws el from scratch, or { mount(el) -> handle, update(el, handle) }
// for a view that keeps its own DOM (a select keeps its focus and open state that way).

const hiddenIn = (el) => { for (let n = el; n && n.nodeType === 1; n = n.parentNode) if (n.hidden) return true; return false; };

export function createRenderer(root = document.body) {
  const views = new Map(), effects = [], mounted = new WeakMap(), widths = new WeakMap(), watched = new WeakSet();
  let started = false, queued = false;

  const run = (name, spec, el) => {
    try {
      if (typeof spec === 'function') { spec(el); return; }
      let m = mounted.get(el);
      if (!m) { el.replaceChildren(); m = { handle: spec.mount ? spec.mount(el) : undefined }; mounted.set(el, m); }
      if (spec.update) spec.update(el, m.handle);
    } catch (err) {
      console.error('[ee] view ' + name + ' failed:', err);
    }
  };
  const elementsOf = (name) => root.querySelectorAll('[data-view="' + name + '"]');

  // redraw a view when its own width changes (not on the first measurement)
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
    let dirty = false;
    entries.forEach((e) => {
      const w = Math.round(e.contentRect.width);
      if (widths.get(e.target) !== w) { if (widths.has(e.target)) dirty = true; widths.set(e.target, w); }
    });
    if (dirty) schedule();
  }) : null;

  function render() {
    queued = false;
    effects.forEach((fn) => { try { fn(); } catch (err) { console.error('[ee] effect failed:', err); } });
    views.forEach((spec, name) => elementsOf(name).forEach((el) => {
      if (hiddenIn(el)) return;
      if (resize && !watched.has(el)) { watched.add(el); resize.observe(el); }
      run(name, spec, el);
    }));
  }
  function schedule() {
    if (!started || queued) return;
    queued = true;
    requestAnimationFrame(render);
  }

  return {
    /** Register a view under the name its mount points carry in data-view. */
    view(name, spec) { views.set(name, spec); schedule(); },
    /** Register something to run before the views on every render, such as syncing inputs to the scenario. */
    effect(fn) { effects.push(fn); schedule(); },
    /** Draw on the next frame. */
    schedule,
    /** Redraw one view now, for state the store does not hold (a table's search box). */
    redraw(name) { const spec = views.get(name); if (spec) elementsOf(name).forEach((el) => { if (!hiddenIn(el)) run(name, spec, el); }); },
    start() {
      started = true;
      // pages are shown and hidden with the hidden attribute: draw a page when it appears. Only an element that holds
      // a view counts, so a tooltip or button shown or hidden inside a chart does not redraw everything.
      new MutationObserver((list) => {
        if (list.some(({ target: t }) => t.nodeType === 1 && (t.hasAttribute('data-view') || t.querySelector('[data-view]')))) schedule();
      }).observe(root, { attributes: true, subtree: true, attributeFilter: ['hidden'] });
      schedule();
    },
  };
}
