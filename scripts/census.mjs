// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Downloads 2021 Census worker counts by occupation from Statistics Canada's Web Data Service
// and writes data/census_noc_2021.json:
//   node scripts/census.mjs
// Non-permanent residents (people in Canada on a work or study permit) are the population that
// Express Entry candidates with Canadian work come from. The census has their count by NOC minor group
// (table 98-10-0585: Total minus Non-immigrants minus Immigrants). Each minor group is split into its
// unit groups by the unit-group mix of all employed workers (table 98-10-0449).
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WDS = 'https://www150.statcan.gc.ca/t1/wds/rest/';
const post = async (method, body) => {
  const r = await fetch(WDS + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`StatCan ${method} answered HTTP ${r.status}`);
  return r.json();
};
const meta = async (pid) => (await post('getCubeMetadata', [{ productId: pid }]))[0].object;
const values = async (pid, coords) => {
  const out = new Map();
  for (let i = 0; i < coords.length; i += 100) {
    const res = await post('getDataFromCubePidCoordAndLatestNPeriods', coords.slice(i, i + 100).map((coordinate) => ({ productId: pid, coordinate, latestN: 1 })));
    res.forEach((x) => { if (x.status === 'SUCCESS') out.set(x.object.coordinate, x.object.vectorDataPoint?.[0]?.value ?? null); });
  }
  return out;
};

const INCOME = 98100585, UNITS = 98100449, EARNINGS = 98100586;
const [mi, mu, me] = await Promise.all([meta(INCOME), meta(UNITS), meta(EARNINGS)]);
const minors = mi.dimension.find((d) => /Minor group/.test(d.dimensionNameEn)).member.filter((x) => /^\d{4} /.test(x.memberNameEn));
const units = mu.dimension.find((d) => /Unit group/.test(d.dimensionNameEn)).member.filter((x) => /^\d{5} /.test(x.memberNameEn));
// Canada, count, immigrant status (1 total, 2 non-immigrants, 3 immigrants), all education, work activity, age, gender, minor group, income recipients
const cMinor = (imm, occ) => `1.1.${imm}.1.1.1.1.${occ}.1.0`;
// Canada, all education, age, gender, unit group, employed
const cUnit = (occ) => `1.1.1.1.${occ}.2.0.0.0.0`;
const dm = await values(INCOME, minors.flatMap((m) => [1, 2, 3].map((i) => cMinor(i, m.memberId))));
const du = await values(UNITS, units.map((u) => cUnit(u.memberId)));

// median employment income of full-year full-time workers (98-10-0586): Canada, count, all, all education,
// full year full time, all gender and age, unit group (1 = all occupations), median. A check on the high-wage list only.
const eUnits = me.dimension.find((d) => /Unit group/.test(d.dimensionNameEn)).member.filter((x) => /^\d{5} /.test(x.memberNameEn));
const cEarn = (occ) => `1.1.1.1.4.1.${occ}.2.0.0`;
const de = await values(EARNINGS, [cEarn(1), ...eUnits.map((u) => cEarn(u.memberId))]);
const medianOf = new Map(eUnits.map((u) => [u.memberNameEn.slice(0, 5), de.get(cEarn(u.memberId)) ?? null]));

const unitRows = units.map((u) => ({ noc: u.memberNameEn.slice(0, 5), name: u.memberNameEn.slice(6).trim(), all: du.get(cUnit(u.memberId)) ?? 0, median: medianOf.get(u.memberNameEn.slice(0, 5)) ?? null }));
const rows = [];
for (const m of minors) {
  const code = m.memberNameEn.slice(0, 4);
  const npr = Math.max(0, (dm.get(cMinor(1, m.memberId)) ?? 0) - (dm.get(cMinor(2, m.memberId)) ?? 0) - (dm.get(cMinor(3, m.memberId)) ?? 0));
  const us = unitRows.filter((u) => u.noc.startsWith(code)), tot = us.reduce((s, u) => s + u.all, 0);
  us.forEach((u) => rows.push({ noc: u.noc, name: u.name, teer: Number(u.noc[1]), npr: Math.round(tot ? (npr * u.all) / tot : npr / us.length), all: u.all, median: u.median }));
}
if (rows.length < 400) throw new Error(`Only ${rows.length} unit groups came back`);
await writeFile(join(root, 'data/census_noc_2021.json'), JSON.stringify({
  source: 'Statistics Canada, 2021 Census of Population, tables 98-10-0585-01 (employment income recipients by NOC 2021 minor group and immigrant status), 98-10-0449-01 (employed labour force by NOC 2021 unit group) and 98-10-0586-01 (median employment income by unit group)',
  urls: ['https://doi.org/10.25318/9810058501-eng', 'https://doi.org/10.25318/9810044901-eng', 'https://doi.org/10.25318/9810058601-eng'],
  note: 'npr: non-permanent residents who worked in 2020, by unit group (minor-group count split by the unit-group mix of all workers). all: all employed workers. median: median 2020 employment income of full-year full-time workers. Census code 00018 combines senior managers 00011 to 00015.',
  allOccupationsMedian: de.get(cEarn(1)) ?? null,
  rows,
}) + '\n');
console.log(`Wrote data/census_noc_2021.json: ${rows.length} unit groups, ${rows.reduce((s, r) => s + r.npr, 0).toLocaleString('en')} non-permanent residents with an occupation`);
