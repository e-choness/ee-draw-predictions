// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Entry point: wires the controls, maps every data-view mount point in index.html to the view that draws it, and
// loads the data. Views redraw on the next frame whenever the data or the scenario changes.
import { store } from './state.js';
import { createRenderer } from './core/renderer.js';
import { setupNav, syncEstimateNotes } from './views/nav.js';
import { setupScenarioControls, syncScenarioControls, typeSelect, hwOut, joOut, sizeLabel, barSummary } from './views/scenario-bar.js';
import { values } from './views/values.js';
import { recentDraws, allDraws, setupDrawSearch } from './views/draw-tables.js';
import { roundsTable, trackTable, trackNote, typesTable } from './views/forecast-tables.js';
import { sourceValues, calcDefaults, calcReceipt, replayTable } from './views/method.js';
import { poolSparkline } from './charts/sparkline.js';
import { heroChart } from './charts/hero.js';
import { monthlyChart } from './charts/monthly.js';
import { poolMixChart } from './charts/pool-mix.js';
import { waterfallChart } from './charts/waterfall.js';
import { sensitivityChart } from './charts/sensitivity.js';
import { scoreBandsChart } from './charts/score-bands.js';
import { poolTrendChart } from './charts/pool-trend.js';
import { drawBubblesChart } from './charts/draw-bubbles.js';

const VIEWS = {
  // scenario bar
  'type-select': typeSelect,
  'hw-out': hwOut,
  'jo-out': joOut,
  'size-label': sizeLabel,
  'bar-summary': barSummary,
  // values in the text
  ...values,
  // Overview
  'k-pool-spark': poolSparkline,
  'hero-chart': heroChart,
  'monthly-chart': monthlyChart,
  'mix-chart': poolMixChart,
  'recent-body': recentDraws,
  // Forecast
  'rounds-body': roundsTable,
  'track-note': trackNote,
  'track-body': trackTable,
  'wf-chart': waterfallChart,
  'sens-chart': sensitivityChart,
  'types-body': typesTable,
  // Pool scores
  'rescored-chart': scoreBandsChart,
  'trend-chart': poolTrendChart,
  // All draws
  'bubble-chart': drawBubblesChart,
  'all-body': allDraws,
  // Method and sources
  ...sourceValues,
  'calc-defaults': calcDefaults,
  'calc-receipt': calcReceipt,
  'replay-body': replayTable,
};

const app = document.getElementById('app') || document.body;
const renderer = createRenderer(app);

setupNav();
setupScenarioControls();
setupDrawSearch(() => renderer.redraw('all-body'));

renderer.effect(syncEstimateNotes);
renderer.effect(syncScenarioControls);
Object.entries(VIEWS).forEach(([name, view]) => renderer.view(name, view));

// a mount point with no view, or a view with no mount point, is a typo in one place or the other
const names = new Set([...app.querySelectorAll('[data-view]')].map((n) => n.dataset.view));
names.forEach((n) => { if (!VIEWS[n]) console.warn('[ee] no view for data-view="' + n + '"'); });
Object.keys(VIEWS).forEach((n) => { if (!names.has(n)) console.warn('[ee] view ' + n + ' has no mount point'); });

store.subscribe(renderer.schedule);
renderer.start();
store.loadAll();
