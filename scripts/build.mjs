// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Assembles the static site in dist/ (or OUT_DIR):
//   index.html                  src/index.html, pointing at the versioned assets
//   assets/<hash>/app.css       src/styles/*.css, the @imports inlined into one file
//   assets/<hash>/js/**         src/js/** as it is: native ES modules, no bundler
//   data/*.json                 the IRCC snapshot and the scenario defaults
// <hash> is taken from the code and styles, so a browser can keep the assets forever and a new build is always
// fetched in full: the page never mixes new markup with old scripts.
import { readFile, writeFile, mkdir, readdir, rm, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const out = resolve(root, process.env.OUT_DIR || 'dist');
const DATA = ['ee_rounds.json', 'pool_composition.json'];

const walk = async (dir) => (await Promise.all((await readdir(dir, { withFileTypes: true }))
  .map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])))).flat().sort();
const posix = (p) => p.split(sep).join('/');
// write to a temporary file and move it into place, so a server reading the file never sees half of it
const writeAtomic = async (file, body) => { await writeFile(file + '.tmp', body); await rename(file + '.tmp', file); };

// styles: app.css lists the other files with @import; inline them in order
const inlineCss = async (file, seen = new Set()) => {
  seen.add(file);
  const css = await readFile(file, 'utf8');
  let outCss = '';
  for (const part of css.split(/(@import\s+url\(['"]?[^'")]+['"]?\);)/)) {
    const m = part.match(/@import\s+url\(['"]?([^'")]+)['"]?\);/);
    if (!m) { outCss += part; continue; }
    const dep = join(dirname(file), m[1]);
    if (seen.has(dep)) throw new Error('CSS import cycle at ' + relative(root, dep));
    outCss += (await inlineCss(dep, seen)).trim() + '\n';
  }
  return outCss;
};
const css = await inlineCss(join(src, 'styles/app.css'));
const scripts = (await walk(join(src, 'js'))).filter((f) => f.endsWith('.js'));
const code = await Promise.all(scripts.map((f) => readFile(f)));

const hash = createHash('sha256');
hash.update(css);
scripts.forEach((f, i) => hash.update(posix(relative(src, f))).update(code[i]));
const version = hash.digest('hex').slice(0, 10), base = 'assets/' + version + '/';

// the page: point it at this version's assets, and preload every module so they load in parallel
let html = await readFile(join(src, 'index.html'), 'utf8');
const swap = (from, to) => { if (!html.includes(from)) throw new Error('src/index.html no longer references ' + from); html = html.replace(from, to); };
swap('href="styles/app.css"', `href="${base}app.css"`);
swap('src="js/main.js"', `src="${base}js/main.js"`);
const preload = scripts.filter((f) => !f.endsWith(sep + 'main.js')).map((f) => `  <link rel="modulepreload" href="${base}${posix(relative(src, f))}">`).join('\n');
swap('  <script type="module"', preload + '\n  <script type="module"');

await mkdir(join(out, 'data'), { recursive: true });
const assets = join(out, 'assets', version);
await mkdir(join(assets, 'js'), { recursive: true });
await writeFile(join(assets, 'app.css'), css);
for (const [i, f] of scripts.entries()) {
  const to = join(assets, relative(src, f));
  await mkdir(dirname(to), { recursive: true });
  await writeFile(to, code[i]);
}
for (const f of DATA) await writeAtomic(join(out, 'data', f), await readFile(join(root, 'data', f)));
await writeAtomic(join(out, 'index.html'), html);
await writeFile(join(out, '.nojekyll'), '');
// older versions go once the page no longer points at them
for (const e of await readdir(join(out, 'assets'))) if (e !== version) await rm(join(out, 'assets', e), { recursive: true, force: true });
// files of the single-page build this replaced
for (const f of ['dash-shim.js']) await rm(join(out, f), { force: true });

const data = JSON.parse(await readFile(join(root, 'data/ee_rounds.json'), 'utf8'));
console.log(`Built ${relative(root, out) || '.'} (assets ${version}, ${scripts.length} modules): ${data.rows.length} draws, latest #${data.rows[0]?.drawNumber} (${data.rows[0]?.drawDate}), fetched ${data.fetchedAt}`);
