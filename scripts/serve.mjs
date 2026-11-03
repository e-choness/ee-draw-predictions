// Zero-dependency static server for dist/, used by the Docker image.
// Every REFRESH_HOURS (default 6) it re-downloads the IRCC feed and rebuilds the site.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const port = Number(process.env.PORT || 8080);
const refreshHours = Number(process.env.REFRESH_HOURS ?? 6);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const run = (script, env = {}) => new Promise((resolve) => {
  const p = spawn(process.execPath, [join(root, 'scripts', script)], { stdio: 'inherit', env: { ...process.env, ...env } });
  p.on('exit', (code) => resolve(code === 0));
});
const refresh = async () => { await run('fetch-ircc.mjs', { ALLOW_STALE: '1' }); await run('build.mjs'); };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (path.includes('..')) throw Object.assign(new Error('bad path'), { code: 400 });
    let full = join(dist, path || 'index.html');
    if ((await stat(full).catch(() => null))?.isDirectory()) full = join(full, 'index.html');
    const body = await readFile(full);
    const ext = extname(full);
    res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream', 'cache-control': ext === '.json' ? 'no-cache' : 'public, max-age=300', 'x-content-type-options': 'nosniff' });
    res.end(body);
  } catch (err) {
    res.writeHead(err.code === 400 ? 400 : 404, { 'content-type': 'text/plain' });
    res.end(err.code === 400 ? 'Bad request' : 'Not found');
  }
}).listen(port, () => console.log(`EE Outlook on http://localhost:${port} (refresh every ${refreshHours || 'never'} h)`));

if (process.env.REFRESH_ON_START !== '0') refresh();
if (refreshHours > 0) setInterval(refresh, refreshHours * 3600e3);
