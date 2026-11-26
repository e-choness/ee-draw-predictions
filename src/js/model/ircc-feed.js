// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// IRCC's Express Entry rounds feed, and how its rounds become the rows the dashboard works on. Used twice: by
// scripts/fetch-ircc.mjs, which saves the snapshot the site ships with, and by the page itself, which reads the feed
// straight from canada.ca (IRCC serves it to any origin) so a new round shows without waiting for a rebuild.

export const FEED_URL = 'https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json';
/** The earliest draw date kept. */
export const SINCE = '2024-01-01';

const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const int = (v) => Number(String(v ?? '').replace(/[^0-9-]/g, ''));
const isoFromLong = (s) => {
  const m = String(s || '').trim().match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m || !MONTHS[m[1].toLowerCase()]) return null;
  return `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
};

/**
 * The feed's rounds since `since`, newest first, as { drawNumber, drawDate, drawName, drawSize, drawCRS,
 * distributionAsOn, dd1..dd18 }. A round is kept only when its pool distribution adds up, and a repeated draw number
 * is dropped, since it would count one round twice. Returns { rows, skipped, notes }; throws when the feed has no
 * usable round.
 */
export function parseFeed(feed, since = SINCE) {
  if (!feed || !Array.isArray(feed.rounds)) throw new Error('IRCC feed has no "rounds" list');
  const rows = [], notes = [];
  let skipped = 0;
  for (const r of feed.rounds) {
    if (!r || !r.drawDate || r.drawDate < since) continue;
    const o = {
      drawNumber: int(r.drawNumber), drawDate: r.drawDate, drawName: String(r.drawName || '').trim(),
      drawSize: int(r.drawSize), drawCRS: int(r.drawCRS), distributionAsOn: isoFromLong(r.drawDistributionAsOn),
    };
    for (let i = 1; i <= 18; i++) o['dd' + i] = int(r['dd' + i]);
    const ok = o.distributionAsOn && o.drawNumber && o.drawSize > 0
      && o.dd3 === o.dd4 + o.dd5 + o.dd6 + o.dd7 + o.dd8
      && o.dd9 === o.dd10 + o.dd11 + o.dd12 + o.dd13 + o.dd14
      && o.dd18 === o.dd1 + o.dd2 + o.dd3 + o.dd9 + o.dd15 + o.dd16 + o.dd17;
    if (!ok) { skipped++; notes.push(`Skipping draw #${o.drawNumber}: pool distribution does not add up`); continue; }
    rows.push(o);
  }
  if (!rows.length) throw new Error('No usable rounds in the IRCC feed');
  rows.sort((a, b) => b.drawNumber - a.drawNumber);
  const seen = new Set();
  for (let i = rows.length - 1; i >= 0; i--) {
    if (seen.has(rows[i].drawNumber)) { notes.push(`Dropping a repeat of draw #${rows[i].drawNumber}`); rows.splice(i, 1); skipped++; } else seen.add(rows[i].drawNumber);
  }
  return { rows, skipped, notes };
}

/** Whether rows read from the feed are at least as recent as the saved ones: a feed served from a stale cache is not. */
export const upToDate = (rows, saved) => !saved || !saved.length || (rows.length > 0 && rows[0].drawNumber >= saved[0].drawNumber);
