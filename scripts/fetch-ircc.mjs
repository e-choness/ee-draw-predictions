// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Downloads IRCC's Express Entry rounds feed and writes data/ee_rounds.json.
// Keeps rounds since SINCE (default 2024-01-01) whose pool distribution adds up.
// If the download fails, the existing file is left untouched and the script exits 1
// (set ALLOW_STALE=1 to exit 0 instead, so a build can carry on with the last snapshot).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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

async function main() {
  const res = await fetch(FEED, { headers: { 'user-agent': 'ee-outlook-data-refresh', accept: 'application/json' } });
  if (!res.ok) throw new Error(`IRCC feed answered HTTP ${res.status}`);
  const feed = await res.json();
  if (!Array.isArray(feed.rounds)) throw new Error('IRCC feed has no "rounds" list');

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

  let before = null;
  try { before = JSON.parse(await readFile(file, 'utf8')); } catch { /* first run */ }
  const out = { source: FEED, fetchedAt: new Date().toISOString(), since: SINCE, rows };
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(out));
  const prevTop = before?.rows?.[0]?.drawNumber;
  console.log(`Wrote ${rows.length} draws (latest #${rows[0].drawNumber}, ${rows[0].drawDate}; ${skipped} skipped)` + (prevTop ? `; previous latest #${prevTop}` : ''));
  if (process.env.GITHUB_OUTPUT) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_OUTPUT, `latest=${rows[0].drawNumber}\nchanged=${prevTop !== rows[0].drawNumber}\n`);
  }
}

main().catch((err) => {
  console.error('IRCC refresh failed:', err.message);
  process.exit(process.env.ALLOW_STALE ? 0 : 1);
});
