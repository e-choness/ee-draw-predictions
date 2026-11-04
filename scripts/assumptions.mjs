// Builds the whole-pool composition the dashboard rescores the pool with, and writes
// data/pool_composition.json.
//   node scripts/census.mjs        (optional: refresh the census counts from Statistics Canada)
//   node scripts/assumptions.mjs
// Inputs: data/assumption_inputs.json, data/high_wage_occupations.json, data/census_noc_2021.json.
// Every figure describes the whole pool, every profile submitted, or every worker in Canada;
// none comes from invited candidates.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = async (f) => JSON.parse(await readFile(join(root, f), 'utf8'));
const inp = await load('data/assumption_inputs.json');
const hwFile = await load('data/high_wage_occupations.json');
const census = await load('data/census_noc_2021.json');
const TIERS = ['2x', '1.5x', '1.3x']; // +70 / +40 / +20 for Canadian work, 100 / 70 / 50 for job offers
const tier = new Map(hwFile.occupations.map((o) => [o.noc, o.tier]));
// the census reports senior managers 00011-00015 as one code, 00018: three are 2x, two are 1.5x
const tiersOf = (noc) => (noc === '00018' ? { '2x': 0.6, '1.5x': 0.4 } : tier.has(noc) ? { [tier.get(noc)]: 1 } : {});
const people = new Map(census.rows.map((r) => [r.noc, r]));
const expand = (nocs) => [...new Set(nocs.map((n) => (/^0001[1-5]$/.test(n) ? '00018' : n)))];
const r3 = (v) => Math.round(v * 1000) / 1000;
const pct = (v) => (v * 100).toFixed(1) + '%';

// high-wage share and tier mix of a set of occupations, each weighted by its non-permanent resident workers
const weighted = (nocs, key = 'npr') => {
  let all = 0; const by = Object.fromEntries(TIERS.map((t) => [t, 0]));
  expand(nocs).forEach((n) => { const p = people.get(n)?.[key] || 0; all += p; Object.entries(tiersOf(n)).forEach(([t, w]) => { by[t] += p * w; }); });
  const hw = TIERS.reduce((s, t) => s + by[t], 0);
  return { workers: Math.round(all), share: all ? hw / all : 0, mix: TIERS.map((t) => (hw ? by[t] / hw : 0)) };
};
// the earlier method: every occupation counted once, however many people work in it
const codesOnly = (nocs) => nocs.filter((n) => tier.has(n)).length / nocs.length;
// a check on IRCC's list only: occupations whose census median earnings (full-year full-time) reach 1.3x
// the all-occupation median. IRCC uses its own wage data and keeps the highest level an occupation reached
// in any recent year, so its list is more generous; points follow IRCC's list.
const earningsTest = (nocs) => {
  const T = census.allOccupationsMedian; let all = 0, hi = 0;
  expand(nocs).forEach((n) => { const r = people.get(n); if (!r) return; all += r.npr; if (T && r.median >= 1.3 * T) hi += r.npr; });
  return all ? hi / all : 0;
};

// 1. Canadian work: share of the pool eligible for the Canadian Experience Class (12+ months of skilled Canadian work)
const prog = inp.poolByProgram;
const cwShare = prog.CEC / prog.total;

// 2. High-wage share of Canadian work: temporary residents working in Canada in TEER 0-3 occupations.
// Post-secondary teaching and research assistants (41201) are students; work while studying full time does not count.
const STUDENT_JOBS = ['41201'];
const eligibleNocs = census.rows.filter((r) => r.teer <= 3 && !STUDENT_JOBS.includes(r.noc)).map((r) => r.noc);
const cw = weighted(eligibleNocs);
const cwAll = weighted(eligibleNocs, 'all');

// 3. Category groups (Table 17a), each weighted by people in its occupations
const { total, byCategory } = inp.pool;
const catNocs = new Set(Object.entries(inp.categoryOccupations).filter(([, v]) => Array.isArray(v)).flatMap(([, v]) => v));
const groups = Object.entries(byCategory).map(([g, profiles]) => {
  const nocs = inp.categoryOccupations[g];
  return { group: g, profiles, codes: codesOnly(nocs), earnings: earningsTest(nocs), ...weighted(nocs) };
});
const restNocs = eligibleNocs.filter((n) => !catNocs.has(n));
const restProfiles = total - Object.values(byCategory).reduce((a, b) => a + b, 0);
const rest = weighted(restNocs);
groups.push({ group: 'No category', profiles: restProfiles, codes: codesOnly(restNocs.filter((n) => n !== '00018').concat(['00011', '00012', '00013', '00014', '00015'])), earnings: earningsTest(restNocs), ...rest });
const composed = groups.reduce((s, g) => s + g.profiles * g.share, 0) / total;

// 4. Check: IRCC's count of the most common occupations in the pool against the census
const big = inp.largestPoolOccupations;
const nprTotal = eligibleNocs.reduce((s, n) => s + (people.get(n)?.npr || 0), 0);
const check = big.occupations.map((o) => ({ noc: o.noc, name: o.name, poolShareOfCEC: o.profiles / prog.CEC, censusShare: (people.get(o.noc)?.npr || 0) / nprTotal, highWage: tier.get(o.noc) || 'no' }));

// 5. Job offers: share of eligible profiles that claimed arranged employment, in a high-wage occupation
const p = inp.profiles2024;
const offerShare = p.arrangedEmployment / p.eligibleProfiles;
const joShare = offerShare * cw.share;

const single = (nocs) => { const w = weighted(nocs, 'all'); return { share: w.share, mix: w.mix }; };
const senior = single(inp.singleOccupationDraws.senior), phys = single(inp.singleOccupationDraws.physicians);
const cat = (name) => groups.find((g) => g.group === name);

const rows = [
  { key: 'pool', label: 'Whole pool', eligibleShare: 1, cwShare: r3(cwShare), hwShare: r3(cw.share), mix: cw.mix.map(r3), joShare: r3(joShare),
    basis: `Canadian work: ${pct(cwShare)} of the pool is CEC-eligible. High-wage: ${pct(cw.share)} of temporary residents working in Canada in TEER 0-3 jobs (2021 Census, people-weighted). Job offers: ${pct(offerShare)} of 2024 profiles claimed one, times the high-wage share.` },
  { key: 'cec', label: 'Canadian Experience Class', eligibleShare: r3(cwShare), cwShare: 1, hwShare: null, mix: null,
    basis: `${prog.CEC.toLocaleString('en')} of ${prog.total.toLocaleString('en')} profiles in the pool were CEC-eligible. All have Canadian work, so they gain points at the scenario high-wage share.` },
  { key: 'french', label: 'French language', eligibleShare: p.frenchCategoryShare, cwShare: null, hwShare: null, mix: null,
    basis: '9% of eligible profiles submitted in 2024 met the French-language category. Canadian work and high-wage shares are the whole-pool scenario values.' },
  ...[['health', 'Health'], ['trades', 'Trade'], ['transport', 'Transport'], ['stem', 'STEM'], ['agri', 'Agri']].map(([key, g]) => ({
    key, label: g, eligibleShare: r3(cat(g).profiles / total), cwShare: null, hwShare: r3(cat(g).share), mix: cat(g).mix.map(r3),
    basis: `${cat(g).profiles.toLocaleString('en')} of ${total.toLocaleString('en')} candidates in the pool qualified (Table 17a). ${pct(cat(g).share)} of temporary residents working in the category's ${inp.categoryOccupations[g].length} occupations are in one on IRCC's high-wage list. Only those with 12+ months of that work in Canada gain points.`,
  })),
  { key: 'senior', label: 'Senior managers', eligibleShare: null, cwShare: 1, hwShare: r3(senior.share), mix: senior.mix.map(r3),
    basis: 'Every candidate has Canadian work as a senior manager (NOC 00010 to 00015); weighted by workers, nearly all are high-wage.' },
  { key: 'physicians', label: 'Physicians', eligibleShare: null, cwShare: 1, hwShare: r3(phys.share), mix: phys.mix.map(r3),
    basis: 'Every candidate has Canadian work as a physician (NOC 31100 to 31102); all three are in the 2x tier, worth +70.' },
];

console.table(groups.map((g) => ({ group: g.group, profiles: g.profiles, 'codes counted once': pct(g.codes), 'people-weighted': pct(g.share), 'census earnings test': pct(g.earnings), '2x/1.5x/1.3x': g.mix.map((v) => (v * 100).toFixed(0)).join('/') })));
console.log('Canadian work (CEC-eligible) share of the pool:', pct(cwShare));
console.log('High-wage share of Canadian work (temporary residents, TEER 0-3):', pct(cw.share), '| all workers in Canada, same occupations:', pct(cwAll.share), '| census earnings test:', pct(earningsTest(eligibleNocs)));
console.log('Tier mix among high-wage:', TIERS.map((t, i) => `${t} ${pct(cw.mix[i])}`).join(', '));
console.log('Whole pool composed from Table 17a groups:', pct(composed));
console.table(check.map((c) => ({ ...c, poolShareOfCEC: pct(c.poolShareOfCEC), censusShare: pct(c.censusShare) })));
console.log('High-wage job offers:', pct(offerShare), 'x', pct(cw.share), '=', pct(joShare));

await writeFile(join(root, 'data/pool_composition.json'), JSON.stringify({
  note: 'Generated by scripts/assumptions.mjs. Whole-pool and whole-population figures only; nothing from invited candidates.',
  highWageListAsOf: hwFile.asOf,
  sources: [inp.poolByProgram.source, census.source, inp.pool.source, inp.profiles2024.source, hwFile.source],
  highWageCheck: { peopleWeighted: r3(cw.share), allWorkers: r3(cwAll.share), censusEarningsTest: r3(earningsTest(eligibleNocs)), composedWholePool: r3(composed), codesCountedOnce: 0.514 },
  groups: groups.map((g) => ({ group: g.group, profiles: g.profiles, codesCountedOnce: r3(g.codes), peopleWeighted: r3(g.share), censusEarningsTest: r3(g.earnings), mix: g.mix.map(r3) })),
  largestPoolOccupations: check.map((c) => ({ ...c, poolShareOfCEC: r3(c.poolShareOfCEC), censusShare: r3(c.censusShare) })),
  rows,
}, null, 2) + '\n');
console.log('Wrote data/pool_composition.json');
