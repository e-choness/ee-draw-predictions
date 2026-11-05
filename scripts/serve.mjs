// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Zero-dependency static server for dist/, used by Docker and `npm run dev`.
// Every REFRESH_HOURS (default 6) it re-downloads the IRCC feed and rebuilds the site.
//
// Caching: the page and the data are revalidated on every load (no-cache with an ETag, so an unchanged file costs
// a 304), and the versioned files under assets/ are kept for a year, since a new build puts them under a new name.
// A rebuilt site therefore shows on the next ordinary reload.
//
// Flags: --no-refresh serves dist/ as it is (same as REFRESH_ON_START=0 REFRESH_HOURS=0).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const port = Number(process.env.PORT || 8080);
const noRefresh = process.argv.includes('--no-refresh');
const refreshHours = noRefresh ? 0 : Number(process.env.REFRESH_HOURS ?? 6);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.woff2': 'font/woff2',
};

const run = (script, env = {}) => new Promise((done) => {
  const p = spawn(process.execPath, [join(root, 'scripts', script)], { stdio: 'inherit', env: { ...process.env, ...env } });
  p.on('exit', (code) => done(code === 0));
});
const refresh = async () => { await run('fetch-ircc.mjs', { ALLOW_STALE: '1' }); await run('build.mjs'); };

createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }); res.end(); return; }
    const url = new URL(req.url, 'http://local');
    if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }); res.end('ok'); return; }
    const path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (path.includes('..')) throw Object.assign(new Error('bad path'), { code: 400 });
    let full = join(dist, path || 'index.html');
    let info = await stat(full);
    if (info.isDirectory()) { full = join(full, 'index.html'); info = await stat(full); }
    const ext = extname(full), versioned = /^assets[/\\]/.test(path);
    const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    const head = {
      'content-type': types[ext] || 'application/octet-stream',
      'cache-control': versioned ? 'public, max-age=31536000, immutable' : 'no-cache',
      etag, 'x-content-type-options': 'nosniff',
    };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); res.end(); return; }
    const body = await readFile(full);
    res.writeHead(200, { ...head, 'content-length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (err) {
    res.writeHead(err.code === 400 ? 400 : 404, { 'content-type': 'text/plain', 'cache-control': 'no-cache' });
    res.end(err.code === 400 ? 'Bad request' : 'Not found');
  }
}).listen(port, () => console.log(`EE Outlook on http://localhost:${port} (refresh every ${refreshHours || 'never'} h)`));

if (!noRefresh && process.env.REFRESH_ON_START !== '0') refresh();
if (refreshHours > 0) setInterval(refresh, refreshHours * 3600e3);
