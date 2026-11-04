// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

/*
 * Standalone runtime for the dashboard page.
 *
 * The page in src/page.html is written against the small `dash` API that the
 * Claude dashboard provides (datasets, calculations, drawings, filters). This
 * file implements the same API in plain browser JavaScript so the very same
 * page runs on GitHub Pages, in Docker, or from any static web server.
 */
(function () {
  'use strict';

  var cfg = window.EE_CONFIG || {};
  var datasetUrls = cfg.datasets || { rounds: 'data/ee_rounds.json', composition: 'data/pool_composition.json' };
  var defaults = cfg.params || { cat: 'cec' };

  var datasets = {};   // id -> {status, data, message}
  var calcs = {};      // id -> {inputs, fn, cache, sig}
  var draws = [];      // [{name, spec}]
  var made = new WeakMap();
  var onDataFns = [];
  var params = Object.assign({}, defaults);
  var started = false;
  var scheduled = false;

  function rowsOf(json) {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.rows)) return json.rows;
    if (json && Array.isArray(json.data)) return json.data;
    if (json && Array.isArray(json.results)) return json.results;
    return [];
  }

  function load(id) {
    var url = datasetUrls[id];
    if (!url) { datasets[id] = { status: 'missing', data: [], message: 'No file for dataset ' + id }; return; }
    var prev = datasets[id];
    datasets[id] = prev && prev.status === 'ok' ? Object.assign({}, prev, { refreshing: true }) : { status: 'loading', data: [] };
    var bust = url.indexOf('?') >= 0 ? '&' : '?';
    fetch(url + bust + 't=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' loading ' + url); return r.json(); })
      .then(function (json) {
        var rows = rowsOf(json);
        datasets[id] = { status: 'ok', data: rows, columns: rows.length ? Object.keys(rows[0]) : [], meta: json && json.meta ? json.meta : [], refreshing: false };
        Object.keys(calcs).forEach(function (k) { calcs[k].cache = null; });
        schedule();
      })
      .catch(function (err) {
        datasets[id] = { status: 'error', data: [], message: String(err && err.message || err) };
        console.error('[dash] dataset ' + id + ' failed:', err);
        schedule();
      });
  }

  function data(id) {
    if (calcs[id]) return calc(id);
    if (!datasets[id]) load(id);
    return datasets[id];
  }

  function calc(id) {
    var c = calcs[id];
    if (c.cache) return c.cache;
    var ins = c.inputs.map(function (i) { return data(i); });
    var bad = ins.filter(function (d) { return d.status !== 'ok'; })[0];
    if (bad) return { status: bad.status === 'error' ? 'error' : 'loading', data: [], message: bad.message };
    try {
      var out = c.fn.apply(null, ins.map(function (d) { return d.data; }));
      c.cache = { status: 'ok', data: out, columns: Array.isArray(out) && out.length ? Object.keys(out[0]) : [], meta: [] };
    } catch (err) {
      console.error('[dash] calculation ' + id + ' failed:', err);
      c.cache = { status: 'error', data: [], message: String(err && err.message || err) };
    }
    return c.cache;
  }

  function isHidden(el) {
    for (var n = el; n && n !== document; n = n.parentNode) if (n.hasAttribute && n.hasAttribute('hidden')) return true;
    return false;
  }

  function runDraw(d, el) {
    try {
      if (typeof d.spec === 'function') { d.spec(el); return; }
      var m = made.get(el);
      if (!m) { el.replaceChildren(); m = { v: d.spec.mount ? d.spec.mount(el) : undefined }; made.set(el, m); }
      if (d.spec.update) d.spec.update(el, m.v);
    } catch (err) {
      console.error('[dash] drawing ' + d.name + ' failed:', err);
    }
  }

  function render() {
    scheduled = false;
    onDataFns.forEach(function (fn) { try { fn(); } catch (err) { console.error('[dash] onData failed:', err); } });
    draws.forEach(function (d) {
      document.querySelectorAll('[data-draw="' + d.name + '"]').forEach(function (el) {
        if (isHidden(el)) return;
        observe(el);
        runDraw(d, el);
      });
    });
    var root = document.getElementById('dash-root');
    if (root) {
      var loading = Object.keys(datasets).some(function (k) { return datasets[k].status === 'loading'; });
      if (loading) root.setAttribute('data-dash-state', 'loading'); else root.removeAttribute('data-dash-state');
    }
  }

  function schedule() {
    if (!started || scheduled) return;
    scheduled = true;
    requestAnimationFrame(render);
  }

  // redraw an element when its own width changes
  var widths = new WeakMap();
  var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function (entries) {
    var dirty = false;
    entries.forEach(function (e) {
      var w = Math.round(e.contentRect.width);
      if (widths.get(e.target) !== w) { if (widths.has(e.target)) dirty = true; widths.set(e.target, w); }
    });
    if (dirty) schedule();
  }) : null;
  var observed = new WeakSet();
  function observe(el) { if (ro && !observed.has(el)) { observed.add(el); ro.observe(el); } }

  window.dash = {
    data: data,
    calc: function (id, spec) { calcs[id] = { inputs: spec.inputs || [], fn: spec.fn, title: spec.title, description: spec.description, cache: null }; },
    loader: function () { /* answers are already rows in the standalone build */ },
    onData: function (fn) { onDataFns.push(fn); if (started) try { fn(); } catch (err) { console.error(err); } },
    draw: function (name, spec) {
      if (spec === undefined) {
        var d = draws.filter(function (x) { return x.name === name; })[0];
        if (d) document.querySelectorAll('[data-draw="' + name + '"]').forEach(function (el) { if (!isHidden(el)) runDraw(d, el); });
        return;
      }
      draws.push({ name: name, spec: spec });
      schedule();
    },
    params: function () { return Object.assign({}, params); },
    setParams: function (obj) {
      Object.keys(obj || {}).forEach(function (k) { if (obj[k] === null || obj[k] === undefined) delete params[k]; else params[k] = obj[k]; });
      schedule();
    },
    resetParams: function () { params = Object.assign({}, defaults); schedule(); },
    refresh: function (id) { if (datasetUrls[id]) load(id); },
    setLink: function (name) { try { history.replaceState(null, '', name ? '#' + name : location.pathname + location.search); } catch (e) { /* ignore */ } },
    colors: ['#3b97e3', '#c8349f', '#17bfe3', '#ffa22b', '#3fb46a', '#8a6ee6', '#ef5461', '#9aa6bb'],
  };

  function start() {
    started = true;
    Object.keys(datasetUrls).forEach(function (id) { if (!datasets[id]) load(id); });
    // pages are shown and hidden with the hidden attribute: draw a page when it appears
    var root = document.getElementById('dash-root') || document.body;
    new MutationObserver(function (list) {
      if (list.some(function (m) { return m.attributeName === 'hidden'; })) schedule();
    }).observe(root, { attributes: true, subtree: true, attributeFilter: ['hidden'] });
    window.addEventListener('hashchange', schedule);
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else setTimeout(start, 0);
})();
