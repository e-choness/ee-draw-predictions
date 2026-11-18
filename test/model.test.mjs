// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Checks the model against the committed data: run with `npm test`. The checks are invariants that hold for any
// IRCC snapshot, so they keep passing as the data updates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as D from '../src/js/model/datasets.js';
import * as M from '../src/js/model/eem.js';
import { context, createForecast, horizon } from '../src/js/model/forecast.js';

const read = (f) => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const ROUNDS = read('ee_rounds.json').rows, COMP = read('pool_composition.json').rows;

const build = (rounds) => {
  const types = D.drawTypes(D.toDraws(rounds), COMP), c = context(types, D.snapshots(rounds), COMP);
  return { c, F: createForecast(c) };
};
const { c, F } = build(ROUNDS);
const S = { cat: 'cec' };

test('datasets: draws newest first, every draw typed; pool counts oldest first', () => {
  const draws = D.toDraws(ROUNDS);
  assert.equal(draws.length, ROUNDS.length);
  draws.slice(1).forEach((d, i) => assert.ok(d.drawNumber < draws[i].drawNumber));
  draws.forEach((d) => assert.ok(d.key && d.category));
  const snaps = D.snapshots(ROUNDS);
  snaps.slice(1).forEach((s, i) => assert.ok(s.asOf > snaps[i].asOf));
  assert.ok(c && c.types.some((t) => t.key === 'cec'));
});

test('density keeps every IRCC band total', () => {
  const snap = c.latest, d = M.density(snap);
  M.BANDS.forEach(([f, , lo, hi]) => {
    let v = 0; for (let s = lo; s <= hi; s++) v += d[s];
    assert.ok(Math.abs(v - snap[f]) < 1e-6 * Math.max(1, snap[f]), f);
  });
});

test('every type is projected through the horizon, each round inside its likely range', () => {
  const H = horizon(c);
  c.types.forEach((t) => {
    const p = F.plan(t.key, S);
    assert.ok(p.rounds.length >= 1, t.key);
    assert.ok(p.rounds[0].date >= t.lastDate, t.key + ' starts after its last round');
    p.rounds.forEach((r, i) => {
      assert.ok(r.low <= r.projected && r.projected <= r.high, `${t.key} round ${i}: ${r.low} ≤ ${r.projected} ≤ ${r.high}`);
      if (i) assert.ok(r.date > p.rounds[i - 1].date && r.date <= H, `${t.key} round ${i} on ${r.date}`);
      const day = new Date(r.date + 'T00:00:00Z').getUTCDay();
      assert.ok(day > 0 && day < 6, `${t.key} round ${i} falls on a weekday`);
    });
  });
});

test('no round is projected before today, on a weekend, or in the year-end break', () => {
  const latest = ROUNDS.reduce((m, r) => (r.drawDate > m ? r.drawDate : m), '');
  const day = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  // a day three weeks after the latest round, the Saturday after it, and a day in the year-end break
  const start = day(latest, 21), sat = day(start, (6 - new Date(start + 'T00:00:00Z').getUTCDay() + 7) % 7);
  [start, sat, latest.slice(0, 4) + '-12-22'].filter((d) => d > latest).forEach((today) => {
    const types = D.drawTypes(D.toDraws(ROUNDS), COMP, today), F2 = createForecast(context(types, D.snapshots(ROUNDS), COMP));
    types.forEach((t) => {
      assert.ok(t.nextDate >= today, `${t.key}: next round ${t.nextDate} is before ${today}`);
      assert.equal(t.nextDate, M.offBreak(t.nextDate), `${t.key}: ${t.nextDate} is a weekday outside the break`);
      assert.equal(F2.plan(t.key, S).rounds[0].date, t.nextDate, `${t.key}: the projected rounds start at the next round`);
    });
  });
  // without a date the floor is unchanged: the day after the latest round, or the end of IRCC's rescoring estimate
  D.drawTypes(D.toDraws(ROUNDS), COMP).forEach((t) => assert.ok(t.nextDate > latest && t.nextDate >= (latest >= M.RULES ? latest : M.RESUME), t.key));
});

test('a bigger round never raises the cut-off', () => {
  c.types.filter((t) => t.method === 'pool').forEach((t) => {
    const cuts = [0.5, 1, 2, 4].map((k) => F.project(t.key, Math.round(t.usualSize * k), S).projected);
    cuts.slice(1).forEach((v, i) => assert.ok(v <= cuts[i], `${t.key}: ${cuts.join(' > ')}`));
  });
});

test('rescoring moves profiles between bands without adding or losing any', () => {
  const pv = F.poolView(S), before = pv.rows.reduce((s, r) => s + r.before, 0), after = pv.rows.reduce((s, r) => s + r.after, 0);
  assert.ok(Math.abs(after - before) / before < 0.005, `${before} vs ${after}`);
  if (!pv.live) assert.ok(pv.after501 >= pv.before501, 'the new points only add');
});

test('a higher high-wage share never lowers the next cut-off', () => {
  ['cec', 'french'].filter((k) => F.type(k)).forEach((k) => {
    const lo = F.project(k, null, { ...S, hw: 20 }).projected, hi = F.project(k, null, { ...S, hw: 60 }).projected;
    assert.ok(hi >= lo, `${k}: ${lo} at 20%, ${hi} at 60%`);
  });
});

test('after a round under the new rules, the projections correct themselves from it', () => {
  const t = F.type('cec'), latest = ROUNDS.reduce((a, b) => (Number(b.drawNumber) > Number(a.drawNumber) ? b : a));
  const date = M.offBreak(t.nextDate), size = t.usualSize;
  // what the dashboard shows before the round, for that date and size
  const before = F.project('cec', size, { ...S, next: date });
  const drawn = before.projected + 12;
  // the round IRCC holds: drawn 12 points above the projection, with no new pool count
  const round = { ...latest, drawNumber: String(Number(latest.drawNumber) + 1), drawDate: date, drawName: 'Canadian Experience Class', drawSize: String(size), drawCRS: String(drawn) };
  const after = build([round, ...ROUNDS]).F;
  const rec = after.track(S).find((r) => r.drawNumber === Number(round.drawNumber));
  assert.ok(rec, 'the round is in the track record');
  assert.equal(rec.projected, before.projected, 'its record shows what was projected before it');
  assert.equal(rec.miss, 12);
  assert.ok(after.calib(S).n >= 1, 'the high-wage share is refitted to it');
  const next = after.plan('cec', S).rounds[0];
  assert.ok(next.date > date, 'the next round comes after it');
  // with no other change, half the miss is carried into the next projection
  assert.equal(after.project('cec', null, S).anchor, Math.round((drawn - after.project('cec', null, S).held[0].sim) / 2));
});
