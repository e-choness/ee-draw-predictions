// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Where the data comes from and what the scenario starts at.
import { FEED_URL, parseFeed, upToDate } from './model/ircc-feed.js';

/** Source files, relative to the page. The build copies data/ next to it. */
export const SOURCES = {
  rounds: 'data/ee_rounds.json',
  composition: 'data/pool_composition.json',
};

/**
 * Where a source file is made from, read by the page itself after the file. The rounds come from IRCC's feed, so a
 * round shows as soon as IRCC publishes it, whether or not the site has been rebuilt since; a feed behind the saved
 * rounds (a stale cache) is not used.
 */
export const LIVE = {
  rounds: { url: FEED_URL, parse: (feed) => parseFeed(feed).rows, accept: upToDate },
};

/** The scenario when nothing is set: Canadian Experience Class at its usual size, high-wage share fitted. */
export const DEFAULTS = { cat: 'cec' };

/** Pages in the rail, in order. The first is shown when the address names none. */
export const PAGES = ['overview', 'forecast', 'pool', 'draws', 'method'];
