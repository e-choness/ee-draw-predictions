// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Apache ECharts 6, served with the site rather than from a CDN, so a blocked or unreachable CDN can't take the
// charts down. vendor/echarts.esm.min.js is the npm package's single-file ES module build, unchanged (Apache-2.0,
// with its LICENSE and NOTICE beside it). Importing it from here keeps every chart's dependency explicit.
import * as echarts from '../vendor/echarts.esm.min.js';

export default echarts;
