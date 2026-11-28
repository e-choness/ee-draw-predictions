// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Downloads IRCC's Express Entry rounds feed and writes data/ee_rounds.json.
// Keeps rounds since SINCE (default 2024-01-01) whose pool distribution adds up.
// If the download fails, the existing file is left untouched and the script exits 1
// (set ALLOW_STALE=1 to exit 0 instead, so a build can carry on with the last snapshot).
// The file is rewritten only when the rounds differ from the saved ones (a new round, or IRCC correcting one).
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import https from 'node:https';
import zlib from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEED_URL, SINCE as DEFAULT_SINCE, parseFeed, upToDate } from '../src/js/model/ircc-feed.js';

const FEED = process.env.IRCC_FEED_URL || FEED_URL;
const SINCE = process.env.SINCE || DEFAULT_SINCE;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(root, process.env.DATA_FILE || 'data/ee_rounds.json');
// canada.ca's CDN (Akamai) is picky about who it serves:
// - Over HTTP/2 it resets the stream (NGHTTP2_INTERNAL_ERROR, which fetch reports as "fetch failed
//   (ERR_HTTP2_STREAM_ERROR)") for requests it doesn't like. Newer Node versions' fetch negotiates HTTP/2, so every
//   GitHub Actions run on Node 26 failed this way. The download therefore goes through node:https, which only speaks
//   HTTP/1.1, the protocol the feed has always been served over to scripts.
// - It stalls requests that don't carry the headers a browser sends (no answer at all, not an error), so they are sent
//   explicitly, each attempt is cut off after TIMEOUT_MS, and a failed attempt is retried after a pause.
// If every attempt fails, curl (HTTP/1.1 too) gets one last try where it is installed, as on GitHub's runners, since
// the CDN tells clients apart by their TLS handshake as well as by their headers.
// TIMEOUT_MS, ATTEMPTS and RETRY_MS (the pause before the second attempt, doubled before the third, ...) tune this.
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
const RETRY_MS = Number(process.env.RETRY_MS ?? 15000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const timedOut = () => new Error(`no answer within ${TIMEOUT_MS / 1000} s`);

/** One HTTP/1.1 GET of `url` with HEADERS, following redirects, resolving to the decoded body as text. */
function get(url, redirects = 5) {
  return new Promise((resolveBody, reject) => {
    let settled = false;
    const done = (err, body) => { if (settled) return; settled = true; clearTimeout(timer); err ? reject(err) : resolveBody(body); };
    const req = https.get(url, { headers: HEADERS }, (res) => {
      const { statusCode: status, headers } = res;
      if (status >= 300 && status < 400 && headers.location) {
        res.resume();
        if (redirects <= 0) return done(new Error('IRCC feed redirects too many times'));
        return get(new URL(headers.location, url), redirects - 1).then((b) => done(null, b), done);
      }
      if (status !== 200) { res.resume(); return done(new Error(`IRCC feed answered HTTP ${status}`)); }
      const enc = String(headers['content-encoding'] || '').trim().toLowerCase();
      const decode = { br: zlib.createBrotliDecompress, gzip: zlib.createGunzip, 'x-gzip': zlib.createGunzip, deflate: zlib.createInflate }[enc];
      if (enc && enc !== 'identity' && !decode) { res.resume(); return done(new Error(`IRCC feed sent an unknown encoding, ${enc}`)); }
      const body = decode ? res.pipe(decode()) : res;
      const chunks = [];
      body.on('data', (c) => chunks.push(c));
      body.on('end', () => done(null, Buffer.concat(chunks).toString('utf8')));
      body.on('error', done);
      res.on('error', done);
      res.on('aborted', () => done(new Error('IRCC feed closed the connection mid-download')));
    });
    req.on('error', (err) => done(err));
    // the deadline covers the whole download, not just the wait for the first byte
    const timer = setTimeout(() => { done(timedOut()); req.destroy(); }, TIMEOUT_MS);
  });
}

/**
 * The same GET through curl, or null when curl isn't installed. curl keeps its own user-agent and sends no
 * browser-style headers: the CDN stalls a curl handshake that claims to be anything other than curl.
 */
function curl(url) {
  const args = ['--http1.1', '--fail', '--silent', '--show-error', '--location', '--compressed', '--max-time', String(TIMEOUT_MS / 1000),
    '--header', `accept: ${HEADERS.accept}`, url];
  return new Promise((resolveBody, reject) => {
    execFile('curl', args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err?.code === 'ENOENT') return resolveBody(null);
      if (err) return reject(new Error(String(stderr).trim() || err.message));
      resolveBody(stdout);
    });
  });
}

function parseBody(text) {
  let feed;
  try { feed = JSON.parse(text); } catch { throw new Error(`IRCC feed is not JSON (starts with ${JSON.stringify(String(text).slice(0, 60))})`); }
  if (!Array.isArray(feed?.rounds)) throw new Error('IRCC feed has no "rounds" list');
  return feed;
}

// a network error's message alone ("socket hang up") hides the reason; its code (ECONNRESET, ENOTFOUND, ...) says it
const describe = (err) => err.message + (err.code && !err.message.includes(err.code) ? ` (${err.code})` : '');

async function download() {
  let last;
  for (let i = 1; i <= ATTEMPTS; i++) {
    try {
      return parseBody(await get(FEED));
    } catch (err) {
      last = describe(err);
      if (i < ATTEMPTS) {
        console.warn(`Attempt ${i} of ${ATTEMPTS} failed: ${last}; retrying in ${(RETRY_MS * i) / 1000} s`);
        await sleep(RETRY_MS * i);
      }
    }
  }
  console.warn(`All ${ATTEMPTS} attempts failed, the last with: ${last}; trying curl`);
  try {
    const text = await curl(FEED);
    if (text !== null) return parseBody(text);
    last += '; curl is not installed';
  } catch (err) {
    last += `; curl: ${describe(err)}`;
  }
  throw new Error(`${last} (after ${ATTEMPTS} attempts)`);
}

async function main() {
  const feed = await download();

  // the rounds since SINCE whose pool distribution adds up, newest first, without repeats of a draw number
  const { rows, skipped, notes } = parseFeed(feed, SINCE);
  notes.forEach((n) => console.warn(n));

  // Checks across rounds, reported only, because the dashboard handles them.
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
  if (!upToDate(rows, before?.rows)) throw new Error(`IRCC feed ends at draw #${rows[0].drawNumber}, behind the saved data (#${savedTop}); keeping the saved data`);
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
