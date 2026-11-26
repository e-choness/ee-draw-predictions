// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// The app's state, without any DOM: source files, datasets derived from them, and the scenario parameters.
//
// A dataset reads as { status: 'loading' | 'ok' | 'error', data, message }. Derived datasets are computed on first
// use and cached until a source file reloads. Every change notifies the subscribers, which redraw on the next frame.
//
// A source may also have a live origin, { url, parse, accept }: the place its file was made from. The file is shown
// first; the live copy is then fetched and replaces it when accept(liveRows, fileRows) agrees. A live copy that can't
// be fetched or parsed is ignored, so the file is always enough on its own.

const rowsOf = (json) => (Array.isArray(json) ? json : json && ['rows', 'data', 'results'].map((k) => json[k]).find(Array.isArray)) || [];

const LIVE_TIMEOUT_MS = 20000;

export function createStore({ sources = {}, live = {}, defaults = {}, fetch: get = globalThis.fetch } = {}) {
  const files = new Map(), derived = new Map(), subscribers = new Set();
  let params = { ...defaults };
  const changed = () => subscribers.forEach((f) => f());

  const put = (id, value) => {
    files.set(id, value);
    derived.forEach((d) => { d.cache = null; });
    changed();
  };

  // fetch a source file; the browser revalidates it with the server every time, so a new snapshot shows at once.
  // quiet: a re-check of a file already loaded, which changes nothing unless the file did, and keeps what is there
  // when the fetch fails
  const load = async (id, quiet = false) => {
    const url = sources[id];
    if (!url) { put(id, { status: 'error', data: [], message: 'No file for dataset ' + id }); return; }
    const prev = files.get(id), had = prev && prev.status === 'ok';
    if (!had) files.set(id, { status: 'loading', data: [] });
    try {
      const res = await get(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' loading ' + url);
      const text = await res.text();
      if (!(quiet && had && prev.text === text)) {
        // a live copy already in use stays unless the new file has moved past it
        const file = rowsOf(JSON.parse(text)), keep = had && prev.live && live[id] && live[id].accept(prev.live, file);
        put(id, { status: 'ok', data: keep ? prev.live : file, file, text, live: keep ? prev.live : null });
      }
    } catch (err) {
      if (!(quiet && had)) {
        console.error('[ee] dataset ' + id + ' failed:', err);
        put(id, { status: 'error', data: [], message: String((err && err.message) || err) });
        return;
      }
      console.warn('[ee] re-checking dataset ' + id + ' failed; keeping the loaded copy:', err);
    }
    if (live[id]) await loadLive(id);
  };

  // the live copy of a source whose file is loaded; redraws only when it differs from what is shown
  const loadLive = async (id) => {
    const { url, parse, accept } = live[id];
    try {
      const res = await get(url, { cache: 'no-cache', signal: AbortSignal.timeout(LIVE_TIMEOUT_MS) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = parse(await res.json()), cur = files.get(id);
      if (!cur || cur.status !== 'ok' || !accept(rows, cur.file)) return;
      if (JSON.stringify(rows) === JSON.stringify(cur.data)) { cur.live = rows; return; }
      put(id, { ...cur, data: rows, live: rows });
    } catch (err) {
      console.warn('[ee] live copy of dataset ' + id + ' not used; showing the saved file:', err);
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
    provide: (id, json) => { const rows = rowsOf(json); put(id, { status: 'ok', data: rows, file: rows }); },
    /** Fetch every source file again. */
    loadAll: () => Promise.all(Object.keys(sources).map((id) => load(id))),
    /** Fetch every source again, but redraw only for those that changed; a failed fetch keeps the loaded copy. */
    refresh: () => Promise.all(Object.keys(sources).map((id) => load(id, true))),

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
