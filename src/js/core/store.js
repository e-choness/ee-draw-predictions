// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// The app's state, without any DOM: source files, datasets derived from them, and the scenario parameters.
//
// A dataset reads as { status: 'loading' | 'ok' | 'error', data, message }. Derived datasets are computed on first
// use and cached until a source file reloads. Every change notifies the subscribers, which redraw on the next frame.

const rowsOf = (json) => (Array.isArray(json) ? json : json && ['rows', 'data', 'results'].map((k) => json[k]).find(Array.isArray)) || [];

export function createStore({ sources = {}, defaults = {}, fetch: get = globalThis.fetch } = {}) {
  const files = new Map(), derived = new Map(), subscribers = new Set();
  let params = { ...defaults };
  const changed = () => subscribers.forEach((f) => f());

  const put = (id, value) => {
    files.set(id, value);
    derived.forEach((d) => { d.cache = null; });
    changed();
  };

  // fetch a source file; the browser revalidates it with the server every time, so a new snapshot shows at once
  const load = async (id) => {
    const url = sources[id];
    if (!url) { put(id, { status: 'error', data: [], message: 'No file for dataset ' + id }); return; }
    const prev = files.get(id);
    if (!prev || prev.status !== 'ok') files.set(id, { status: 'loading', data: [] });
    try {
      const res = await get(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' loading ' + url);
      put(id, { status: 'ok', data: rowsOf(await res.json()) });
    } catch (err) {
      console.error('[ee] dataset ' + id + ' failed:', err);
      put(id, { status: 'error', data: [], message: String((err && err.message) || err) });
    }
  };

  const compute = (id, d) => {
    if (d.cache) return d.cache;
    const ins = d.inputs.map(dataset), bad = ins.find((x) => x.status !== 'ok');
    if (bad) return { status: bad.status === 'error' ? 'error' : 'loading', data: [], message: bad.message };
    try {
      d.cache = { status: 'ok', data: d.fn(...ins.map((x) => x.data)) };
    } catch (err) {
      console.error('[ee] dataset ' + id + ' failed:', err);
      d.cache = { status: 'error', data: [], message: String((err && err.message) || err) };
    }
    return d.cache;
  };
  function dataset(id) {
    if (derived.has(id)) return compute(id, derived.get(id));
    if (!files.has(id)) { if (sources[id]) load(id); else return { status: 'error', data: [], message: 'Unknown dataset ' + id }; }
    return files.get(id) || { status: 'loading', data: [] };
  }

  return {
    /** A dataset by id: a source file or a derived one. */
    get: dataset,
    /** A dataset's data once it is ready, otherwise null. */
    rows: (id) => { const d = dataset(id); return d.status === 'ok' ? d.data : null; },
    /** Register a dataset computed from others: fn receives their data in order. */
    derive: (id, inputs, fn) => { derived.set(id, { inputs, fn, cache: null }); },
    /** Provide a source's rows directly instead of fetching it (tests, or data loaded another way). */
    provide: (id, json) => put(id, { status: 'ok', data: rowsOf(json) }),
    /** Fetch every source file again. */
    loadAll: () => Promise.all(Object.keys(sources).map(load)),

    /** A copy of the scenario parameters. */
    params: () => ({ ...params }),
    /** Change some parameters; null or undefined removes one. */
    set: (patch) => {
      params = { ...params };
      Object.entries(patch || {}).forEach(([k, v]) => { if (v == null) delete params[k]; else params[k] = v; });
      changed();
    },
    /** Back to the defaults. */
    reset: () => { params = { ...defaults }; changed(); },

    subscribe: (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); },
  };
}
