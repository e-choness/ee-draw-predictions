// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// The one store the page runs on, the datasets derived from IRCC's files, and the forecast for the current scenario.
// Views read everything through `store`, `scenario` and `model`; nothing else holds state.
import { SOURCES, DEFAULTS } from './config.js';
import { createStore } from './core/store.js';
import * as D from './model/datasets.js';
import { context, createForecast, horizon, sizeRange } from './model/forecast.js';

export const store = createStore({ sources: SOURCES, defaults: DEFAULTS });

store.derive('draws', ['rounds'], D.toDraws);
store.derive('monthly', ['draws'], D.monthly);
store.derive('pool_summary', ['rounds'], D.poolSummary);
store.derive('pool_trend', ['rounds'], D.poolTrend);
store.derive('snapshots', ['rounds'], D.snapshots);
store.derive('types', ['draws', 'composition'], D.drawTypes);
// the forecast engine memoises its results; a new one is made whenever the data reloads
store.derive('forecast', ['types', 'snapshots', 'composition'], (types, snaps, comp) => {
  const c = context(types, snaps, comp);
  return c && { ctx: c, engine: createForecast(c) };
});

/** The scenario parameters, with their defaults applied. */
export const scenario = {
  /** The selected draw type. */
  cat: () => store.params().cat || 'cec',
  /** The selected type's invitations per round, or null for its usual size. */
  size: () => { const v = store.params().size; return v == null ? null : Number(v); },
  /** How far back the cut-off history goes: 'all' or a number of months. */
  span: () => store.params().span || 'all',
  /** Projected rounds of every type ('all') or the selected one ('type'). */
  rounds: () => store.params().view || 'all',
  set: store.set,
  reset: store.reset,
  /** Select a draw type, at its usual size and date. */
  pick: (key) => store.set({ cat: key, size: null, next: null }),
};

const F = () => store.rows('forecast');
const E = () => { const f = F(); return f && f.engine; };
const P = () => store.params();

/** The forecast under the current scenario. Each returns null until the data is in. */
export const model = {
  ctx: () => { const f = F(); return f ? f.ctx : null; },
  /** The latest date projected. */
  horizon: () => horizon(model.ctx()),
  sizeRange,
  /** Shares in use: high-wage (fitted unless set), job offers, Canadian work. */
  hw: () => { const e = E(); return e ? e.hw(P()) : 0.4; },
  jo: () => { const e = E(); return e ? e.jo(P()) : 0.06; },
  cw: () => { const e = E(); return e ? e.cw(P()) : 0.66; },
  hwSet: () => { const e = E(); return e ? e.hwSet(P()) : false; },
  /** A draw type's row, the selected one by default. */
  type: (key) => { const e = E(); return e ? e.type(key || scenario.cat()) : null; },
  nextFor: (t) => { const e = E(); return e ? e.nextFor(t, P()) : t.nextDate; },
  hwPrior: () => { const e = E(); return e && e.hwPrior(P()); },
  calib: () => { const e = E(); return e && e.calib(P()); },
  track: () => { const e = E(); return e ? e.track(P()) : []; },
  impliedHw: () => { const e = E(); return e && e.impliedHw(P()); },
  poolView: () => { const e = E(); return e && e.poolView(P()); },
  /** Every round of a type through the horizon, the selected one by default. */
  plan: (key) => { const e = E(); return e && e.plan(key, P()); },
  /** The next round of a type at a size (null: usual), optionally overriding hw, jo, cw or next. */
  project: (key, size, o) => { const e = E(); return e && e.project(key, size, P(), o); },
  /** The next round of the selected type at the selected size. */
  cur: () => { const e = E(); return e && e.cur(P()); },
};
