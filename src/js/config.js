// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Where the data comes from and what the scenario starts at.

/** Source files, relative to the page. The build copies data/ next to it. */
export const SOURCES = {
  rounds: 'data/ee_rounds.json',
  composition: 'data/pool_composition.json',
};

/** The scenario when nothing is set: Canadian Experience Class at its usual size, high-wage share fitted. */
export const DEFAULTS = { cat: 'cec' };

/** Pages in the rail, in order. The first is shown when the address names none. */
export const PAGES = ['overview', 'forecast', 'pool', 'draws', 'method'];
