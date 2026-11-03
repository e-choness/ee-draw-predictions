// Recomputes the high-wage scenario defaults from whole-pool IRCC figures.
//   node scripts/assumptions.mjs
// Inputs: data/assumption_inputs.json and data/high_wage_occupations.json.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const inp = JSON.parse(await readFile(join(root, 'data/assumption_inputs.json'), 'utf8'));
const hwList = JSON.parse(await readFile(join(root, 'data/high_wage_occupations.json'), 'utf8')).occupations;
const hw = new Map(hwList.map((o) => [o.noc, o.tier]));
const tiers = ['2x', '1.5x', '1.3x'];
const pct = (v) => (v * 100).toFixed(1) + '%';

const { total, byCategory } = inp.pool;
const inCategory = new Set();
const parts = [];
for (const [cat, count] of Object.entries(byCategory)) {
  const nocs = inp.categoryOccupations[cat];
  nocs.forEach((n) => inCategory.add(n));
  const t = Object.fromEntries(tiers.map((k) => [k, nocs.filter((n) => hw.get(n) === k).length / nocs.length]));
  parts.push({ group: cat, profiles: count, ...t });
}
const restNocs = inp.expressEntryEligibleOccupations.count - inCategory.size;
const rest = Object.fromEntries(tiers.map((k) => [k, hwList.filter((o) => o.tier === k && !inCategory.has(o.noc)).length / restNocs]));
parts.push({ group: 'No occupation category', profiles: total - Object.values(byCategory).reduce((a, b) => a + b, 0), ...rest });

const byTier = Object.fromEntries(tiers.map((k) => [k, parts.reduce((s, p) => s + p.profiles * p[k], 0) / total]));
const hwShare = tiers.reduce((s, k) => s + byTier[k], 0);
const p = inp.profiles2024;
const canadianShare = p.educationInCanada / p.eligibleProfiles;
const offerShare = p.arrangedEmployment / p.eligibleProfiles;

console.table(parts.map((x) => ({ group: x.group, profiles: x.profiles, highWage: pct(x['2x'] + x['1.5x'] + x['1.3x']) })));
console.log('High-wage share of the pool:', pct(hwShare));
console.log('Tier mix among high-wage profiles:', tiers.map((k) => `${k} ${pct(byTier[k] / hwShare)}`).join(', '));
console.log('Profiles with Canadian education (proxy for Canadian work):', pct(canadianShare));
console.log('Work points share = high-wage × Canadian:', pct(hwShare * canadianShare));
console.log('Profiles with job-offer points:', pct(offerShare), '→ high-wage offers:', pct(offerShare * hwShare));
