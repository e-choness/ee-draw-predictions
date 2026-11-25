// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Downloads IRCC's Express Entry rounds feed and writes data/ee_rounds.json.
// Keeps rounds since SINCE (default 2024-01-01) whose pool distribution adds up.
// If the download fails, the existing file is left untouched and the script exits 1
// (set ALLOW_STALE=1 to exit 0 instead, so a build can carry on with the last snapshot).
// The file is rewritten only when the rounds differ from the saved ones (a new round, or IRCC correcting one).
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FEED = process.env.IRCC_FEED_URL || 'https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json';
const SINCE = process.env.SINCE || '2024-01-01';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(root, process.env.DATA_FILE || 'data/ee_rounds.json');
const months = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

const int = (v) => Number(String(v ?? '').replace(/[^0-9-]/g, ''));
const isoFromLong = (s) => {
  const m = String(s || '').trim().match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m || !months[m[1].toLowerCase()]) return null;
  return `${m[3]}-${String(months[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
};

// canada.ca's CDN stalls requests that don't carry the headers a browser sends (no answer at all, not an error), so
// they are sent explicitly, each attempt is cut off after TIMEOUT_MS, and a failed attempt is retried after a pause.
const HEADERS = {
  'user-agent': 'ee-outlook-data-refresh',
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-CA,en;q=0.9',
  'accept-encoding': 'gzip, deflate, br',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
};
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 60000), ATTEMPTS = Number(process.env.ATTEMPTS || 4);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function download() {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(FEED, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`IRCC feed answered HTTP ${res.status}`);
      const feed = await res.json();
      if (!Array.isArray(feed.rounds)) throw new Error('IRCC feed has no "rounds" list');
      return feed;
    } catch (err) {
      const why = err.name === 'TimeoutError' ? `no answer within ${TIMEOUT_MS / 1000} s` : err.message;
      if (i >= ATTEMPTS) throw new Error(`${why} (after ${i} attempts)`);
      console.warn(`Attempt ${i} of ${ATTEMPTS} failed: ${why}; retrying in ${15 * i} s`);
      await sleep(15000 * i);
    }
  }
}

async function main() {
  const feed = await download();

  const rows = [];
  let skipped = 0;
  for (const r of feed.rounds) {
    if (!r.drawDate || r.drawDate < SINCE) continue;
    const o = {
      drawNumber: int(r.drawNumber), drawDate: r.drawDate, drawName: String(r.drawName || '').trim(),
      drawSize: int(r.drawSize), drawCRS: int(r.drawCRS), distributionAsOn: isoFromLong(r.drawDistributionAsOn),
    };
    for (let i = 1; i <= 18; i++) o['dd' + i] = int(r['dd' + i]);
    const ok = o.distributionAsOn && o.drawNumber && o.drawSize > 0
      && o.dd3 === o.dd4 + o.dd5 + o.dd6 + o.dd7 + o.dd8
      && o.dd9 === o.dd10 + o.dd11 + o.dd12 + o.dd13 + o.dd14
      && o.dd18 === o.dd1 + o.dd2 + o.dd3 + o.dd9 + o.dd15 + o.dd16 + o.dd17;
    if (!ok) { skipped++; console.warn(`Skipping draw #${o.drawNumber}: pool distribution does not add up`); continue; }
    rows.push(o);
  }
  if (!rows.length) throw new Error('No usable rounds in the IRCC feed');
  rows.sort((a, b) => b.drawNumber - a.drawNumber);

  // Checks across rounds. A repeated draw number is dropped, since it would count one round twice in the
  // projections' record; the others are reported only, because the dashboard handles them.
  const seen = new Set();
  for (let i = rows.length - 1; i >= 0; i--) {
    if (seen.has(rows[i].drawNumber)) { console.warn(`Dropping a repeat of draw #${rows[i].drawNumber}`); rows.splice(i, 1); skipped++; } else seen.add(rows[i].drawNumber);
  }
  const byDate = new Map();
  for (const r of rows) {
    if (r.distributionAsOn > r.drawDate) console.warn(`Draw #${r.drawNumber} (${r.drawDate}) carries a pool count dated after it, ${r.distributionAsOn}`);
    const prev = byDate.get(r.distributionAsOn);
    if (prev && prev.dd18 !== r.dd18) console.warn(`Two different pool counts dated ${r.distributionAsOn} (draws #${prev.drawNumber} and #${r.drawNumber})`);
    if (!prev) byDate.set(r.distributionAsOn, r);
  }
  const counts = [...byDate.values()].sort((a, b) => a.distributionAsOn.localeCompare(b.distributionAsOn));
  for (let i = 1; i < counts.length; i++) {
    const a = counts[i - 1], b = counts[i];
    if (Array.from({ length: 18 }, (_, k) => 'dd' + (k + 1)).every((k) => a[k] === b[k])) console.warn(`The pool count dated ${b.distributionAsOn} repeats the one dated ${a.distributionAsOn}; the dashboard counts it once`);
  }

  let before = null;
  try { before = JSON.parse(await readFile(file, 'utf8')); } catch { /* first run */ }
  // a feed served from a stale cache must not erase rounds the projections have already learned from
  const savedTop = before?.rows?.[0]?.drawNumber;
  if (savedTop && rows[0].drawNumber < savedTop) throw new Error(`IRCC feed ends at draw #${rows[0].drawNumber}, behind the saved data (#${savedTop}); keeping the saved data`);
  const prevTop = before?.rows?.[0]?.drawNumber;
  // unchanged rounds leave the file alone, so fetchedAt dates the last change and a scheduled run has nothing to commit
  const changed = JSON.stringify(before?.rows) !== JSON.stringify(rows);
  if (changed) {
    const out = { source: FEED, fetchedAt: new Date().toISOString(), since: SINCE, rows };
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(out));
  }
  const top = `#${rows[0].drawNumber} (${rows[0].drawDate}, ${rows[0].drawName}, ${rows[0].drawSize} at ${rows[0].drawCRS})`;
  const what = !changed ? `No change: ${rows.length} draws, latest ${top}`
    : prevTop === rows[0].drawNumber ? `IRCC corrected its rounds: ${rows.length} draws, latest ${top}`
    : `Wrote ${rows.length} draws, latest ${top}` + (prevTop ? `; previous latest #${prevTop}` : '');
  console.log(what + `; ${skipped} skipped`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `latest=${rows[0].drawNumber}\nchanged=${changed}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `IRCC refresh: ${what}\n`);
}

main().catch(async (err) => {
  console.error('IRCC refresh failed:', err.message);
  // a GitHub Actions annotation, so the failure shows on the run's page even when ALLOW_STALE lets the build go on
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=IRCC refresh failed::${err.message}. The site keeps the last snapshot.`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `IRCC refresh failed: ${err.message}. The site keeps the last snapshot.\n`).catch(() => {});
  process.exit(process.env.ALLOW_STALE ? 0 : 1);
});
