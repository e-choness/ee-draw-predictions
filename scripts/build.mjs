// Assembles the static site in dist/: the dashboard page inside a standalone shell,
// the dash runtime shim and the data file.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, process.env.OUT_DIR || 'dist');

// Each inline script gets its own scope, as it does inside the Claude dashboard.
const scoped = (html) => html.replace(/<script>([\s\S]*?)<\/script>/g, (_, body) => `<script>(function () {\n${body}\n})();</script>`);

const page = await readFile(join(root, 'src/page.html'), 'utf8');
const shell = await readFile(join(root, 'src/shell.html'), 'utf8');
await mkdir(join(out, 'data'), { recursive: true });
await writeFile(join(out, 'index.html'), shell.replace('<!-- PAGE -->', scoped(page)));
await copyFile(join(root, 'src/dash-shim.js'), join(out, 'dash-shim.js'));
await copyFile(join(root, 'data/ee_rounds.json'), join(out, 'data/ee_rounds.json'));
await writeFile(join(out, '.nojekyll'), '');
const data = JSON.parse(await readFile(join(root, 'data/ee_rounds.json'), 'utf8'));
console.log(`Built ${out}: ${data.rows.length} draws, latest #${data.rows[0]?.drawNumber} (${data.rows[0]?.drawDate}), fetched ${data.fetchedAt}`);
