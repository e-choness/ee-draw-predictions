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
import { transition, KNOTS } from '../src/js/model/transition.js';
import { FEED_URL, parseFeed, upToDate } from '../src/js/model/ircc-feed.js';
import { createStore } from '../src/js/core/store.js';

const read = (f) => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const ROUNDS = read('ee_rounds.json').rows, COMP = read('pool_composition.json').rows;

const build = (rounds) => {
  const draws = D.toDraws(rounds), types = D.drawTypes(draws, COMP), c = context(types, D.snapshots(rounds), COMP, draws);
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
    const draws = D.toDraws(ROUNDS), types = D.drawTypes(draws, COMP, today), F2 = createForecast(context(types, D.snapshots(ROUNDS), COMP, draws));
    types.forEach((t) => {
      assert.ok(t.nextDate >= today, `${t.key}: next round ${t.nextDate} is before ${today}`);
      assert.equal(t.nextDate, M.offBreak(t.nextDate), `${t.key}: ${t.nextDate} is a weekday outside the break`);
      assert.equal(F2.plan(t.key, S).rounds[0].date, t.nextDate, `${t.key}: the projected rounds start at the next round`);
    });
  });
  // without a date the floor is unchanged: the day after the latest round, or the end of IRCC's rescoring estimate
  D.drawTypes(D.toDraws(ROUNDS), COMP).forEach((t) => assert.ok(t.nextDate > latest && t.nextDate >= (latest >= M.RULES ? latest : M.RESUME), t.key));
});

test('no round is projected in the empty weeks after a draw week', () => {
  const draws = D.toDraws(ROUNDS), { lastWeek, cadence } = D.drawWeeks(draws);
  assert.ok(cadence >= 7 && cadence % 7 === 0, `cadence ${cadence}`);
  const day = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const nextWeek = day(lastWeek, cadence);
  // the Saturday after the latest draw week and, when the cadence leaves one, the Monday of an empty week after it
  [day(lastWeek, 5), cadence > 7 ? day(lastWeek, 7) : null].filter(Boolean).forEach((today) => {
    D.drawTypes(draws, COMP, today).forEach((t) => {
      // a round pushed into the year-end break moves to January, which is later still
      assert.ok(t.nextDate >= M.offBreak(day(nextWeek, t.weekday)), `${t.key}: ${t.nextDate} falls before its day in the draw week of ${nextWeek} (today ${today})`);
    });
  });
  // once the next draw week has passed with no round, a type whose usual gap has passed is projected for this week:
  // a Wednesday two draw weeks late, so this week's Friday is the latest (in January, should that be the break)
  const late = day(nextWeek, cadence + 2), friday = M.offBreak(day(late, 2));
  D.drawTypes(draws, COMP, late).forEach((t) => {
    if (day(t.lastDate, t.gapDays) > late) return;
    assert.ok(t.nextDate >= late && t.nextDate <= friday, `${t.key}: ${t.nextDate}, not in the week of ${late}`);
  });
});

test('a bigger round never raises the cut-off', () => {
  c.types.filter((t) => t.method === 'pool').forEach((t) => {
    const cuts = [0.5, 1, 2, 4].map((k) => F.project(t.key, Math.round(t.usualSize * k), S).projected);
    cuts.slice(1).forEach((v, i) => assert.ok(v <= cuts[i], `${t.key}: ${cuts.join(' > ')}`));
  });
});

test('the pool under the new rules: rescoring moves profiles between bands, or IRCC’s own count once there is one', () => {
  const pv = F.poolView(S), before = pv.rows.reduce((s, r) => s + r.before, 0), after = pv.rows.reduce((s, r) => s + r.after, 0);
  if (pv.live) {
    // two IRCC counts: the last under the old rules and the latest, each as IRCC published it
    assert.equal(before, c.old.total);
    assert.equal(after, c.latest.total);
  } else {
    assert.ok(Math.abs(after - before) / before < 0.005, `${before} vs ${after}`);
    assert.ok(pv.after501 >= pv.before501, 'the new points only add');
  }
});

test('the rescoring reverse-calculated from IRCC’s counts adds up to its count under the new rules', (t) => {
  if (!c.live) { t.skip('no IRCC count under the new rules yet'); return; }
  const tr = c.trans;
  assert.ok(tr, 'reverse-calculated once IRCC counts the pool under the new rules');
  // the pool it starts from holds every profile IRCC counted
  assert.ok(Math.abs(tr.d.reduce((s, v) => s + v, 0) - c.latest.total) < 1, 'carried pool total');
  // the high-wage share never falls as scores rise, and stays a share
  tr.levels.forEach((v, i) => { assert.ok(v >= 0 && v <= 1, 'share ' + v); if (i) assert.ok(v >= tr.levels[i - 1], 'non-decreasing'); });
  assert.equal(tr.levels.length, KNOTS.length);
  // the fit explains every band to within 10% before the leftover is calibrated away
  tr.bands.slice(0, -1).forEach((b) => assert.ok(Math.abs(b.fitted - b.ircc) / b.ircc < 0.1, `${b.band}: ${b.fitted} vs ${b.ircc}`));
  // calibrated, a whole-pool profile set rescored at the fitted shares adds up to IRCC's count band by band
  const g = M.calibrate(M.gains(0.5, tr.hw, c.pool.mix, tr.jo, c.pool.mix), tr.ratio);
  assert.ok(g.m.every((v) => v > 0.5 && v < 2), 'calibration stays modest');
  // it is pure: the same inputs give the same answer
  const again = transition(D.toDraws(ROUNDS), D.snapshots(ROUNDS), c.types, COMP);
  assert.deepEqual(again.levels, tr.levels);
});

test('a bigger Provincial Nominee round reaches further down the nominees', () => {
  const t = F.type('pnp');
  if (!t) return;
  assert.ok(t.sizeSlope < 0, 'cut-offs fall with size');
  const cuts = [0.5, 1, 2, 4].map((k) => F.project('pnp', Math.round(t.usualSize * k), S).projected);
  cuts.slice(1).forEach((v, i) => assert.ok(v <= cuts[i], cuts.join(' > ')));
  // each round under the new rules is recorded against a projection at the size IRCC drew
  F.track(S).filter((r) => r.key === 'pnp').forEach((r) => {
    const h = t.history.findIndex((x) => x.drawNumber === r.drawNumber);
    const med = M.sizedMedian(t.history, h, M.sizeSlopeBefore(t.history, h), r.size);
    assert.ok(Math.abs(r.projected - med) <= Math.abs(r.projected - M.sizedMedian(t.history, h, 0, r.size)) + 60, 'size-aware record');
  });
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

// The page reads IRCC's feed itself, after the saved file: these run the store with a stand-in for fetch.
const feedOf = (rows) => ({ rounds: rows.map((r) => ({ ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])),
  drawDistributionAsOn: new Date(r.distributionAsOn + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) })) });
const storeOver = (fileRows, feed) => {
  const reply = (body) => ({ ok: true, text: async () => JSON.stringify(body), json: async () => body });
  return createStore({
    sources: { rounds: 'data/ee_rounds.json' },
    live: { rounds: { url: FEED_URL, parse: (f) => parseFeed(f).rows, accept: upToDate } },
    fetch: async (url) => { if (url !== FEED_URL) return reply({ rows: fileRows }); if (feed instanceof Error) throw feed; return reply(feed); },
  });
};

test('IRCC’s feed parses to the saved rows, and a round whose pool counts do not add up is left out', () => {
  assert.deepEqual(parseFeed(feedOf(ROUNDS)).rows, ROUNDS);
  const feed = feedOf(ROUNDS);
  feed.rounds[0].dd18 = String(ROUNDS[0].dd18 + 1);
  const { rows, skipped } = parseFeed(feed);
  assert.equal(skipped, 1);
  assert.equal(rows[0].drawNumber, ROUNDS[1].drawNumber);
  assert.throws(() => parseFeed({}));
});

test('the page shows a round IRCC has published before the site is rebuilt, and keeps the saved file otherwise', async () => {
  // the saved file is one round behind the feed
  let s = storeOver(ROUNDS.slice(1), feedOf(ROUNDS));
  await s.loadAll();
  assert.equal(s.rows('rounds')[0].drawNumber, ROUNDS[0].drawNumber);
  // a re-check with nothing new redraws nothing
  let redraws = 0;
  s.subscribe(() => redraws++);
  await s.refresh();
  assert.equal(redraws, 0);
  // a feed behind the saved file (a stale cache), or one that can't be read, is not used
  s = storeOver(ROUNDS, feedOf(ROUNDS.slice(1)));
  await s.loadAll();
  assert.equal(s.rows('rounds').length, ROUNDS.length);
  s = storeOver(ROUNDS, new Error('offline'));
  await s.loadAll();
  assert.deepEqual(s.rows('rounds'), ROUNDS);
});
