// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// d3 v7 is loaded by index.html as a classic script before the modules run (module scripts are deferred).
// Importing it from here keeps every chart's dependency explicit.
const d3 = globalThis.d3;
if (!d3) throw new Error('d3 did not load: index.html loads it from cdn.jsdelivr.net before the app');
export default d3;
