// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Overview hero: the selected type's cut-off history, every projected round through the horizon with its likely
// range, and what was projected before each round under the new rules.
import { store, scenario, model } from '../state.js';
import { RULES } from '../model/eem.js';
import { num, signed, date, toDate } from '../ui/format.js';
import { css, alpha } from '../ui/theme.js';
import { echarts, chartView, valueAxis, timeAxis, bubble, pinnable, nice } from './base.js';

const monthsBefore = (t, n) => { const d = new Date(t); d.setUTCMonth(d.getUTCMonth() - n); return d.getTime(); };
const gradient = (c0, c1, across) => new echarts.graphic.LinearGradient(0, 0, across ? 1 : 0, across ? 0 : 1, [{ offset: 0, color: c0 }, { offset: 1, color: c1 }]);
const quiet = { silent: true, symbol: 'none', tooltip: { show: false } };

export const heroChart = chartView((el) => {
  const draws = store.rows('draws');
  if (!draws) return null;
  const key = scenario.cat(), r = model.cur(), plan = model.plan(key), W = el.clientWidth, H = W < 560 ? 280 : 330;
  let pts = draws.filter((d) => d.key === key).map((d) => ({ ...d, t: toDate(d.drawDate).getTime() })).sort((a, b) => a.t - b.t);
  if (!pts.length || !r || !plan) return { height: H, empty: 'No draws of this type yet.' };
  const span = scenario.span();
  if (span !== 'all') { const cut = monthsBefore(pts[pts.length - 1].t, Number(span)), k = pts.filter((p) => p.t >= cut); if (k.length >= 2) pts = k; }

  // the projected rounds, from the next one through the horizon; their path starts at the last cut-off drawn
  const fut = plan.rounds.map((q) => ({ ...q, t: toDate(q.date).getTime() }));
  const last = pts[pts.length - 1];
  const path = [{ t: last.t, projected: last.drawCRS, low: last.drawCRS, high: last.drawCRS }].concat(fut);
  // what was projected before each round under the new rules
  const rec = new Map((plan.records || []).map((x) => [x.drawNumber, x]));
  const held = pts.filter((p) => rec.has(p.drawNumber));

  const ys = pts.map((p) => p.drawCRS).concat(fut.flatMap((q) => [q.low, q.high]), held.map((p) => rec.get(p.drawNumber).projected));
  const lo = Math.min(...ys), hi = Math.max(...ys), pad = Math.max(8, (hi - lo) * 0.12);
  const t0 = pts[0].t, t1 = fut[fut.length - 1].t, tpad = (t1 - t0) * 0.02, ruleT = toDate(RULES).getTime();
  const magenta = css('--ee-magenta'), orange = css('--ee-orange'), coral = css('--ee-coral'), card = css('--ee-card');
  // labelled without a pin: the latest draws, the next round and the last projected round
  const recent = new Set(pts.slice(-4)), cutoff = (p) => String(p.value[1]);

  return {
    height: H,
    label: 'Cut-off history and projected rounds',
    pick: 'x',
    start: pts.length, // the next round
    option: {
      grid: { top: 44, right: W < 560 ? 26 : 46 },
      xAxis: timeAxis({ min: t0 - tpad, max: t1 + tpad }),
      yAxis: valueAxis(nice(lo - pad, hi + pad)),
      series: [
        // the likely range: the low end, then the band stacked on it
        { id: 'band-low', type: 'line', ...quiet, stack: 'band', lineStyle: { opacity: 0 }, data: path.map((q) => [q.t, q.low]) },
        { id: 'band', type: 'line', ...quiet, stack: 'band', lineStyle: { opacity: 0 }, areaStyle: { color: coral, opacity: 0.12 }, data: path.map((q) => [q.t, q.high - q.low]) },
        { id: 'path', type: 'line', ...quiet, lineStyle: { color: coral, width: 2, type: [5, 4] }, data: path.map((q) => [q.t, q.projected]) },
        {
          id: 'before', type: 'scatter', ...quiet, symbol: 'circle', symbolSize: 9,
          itemStyle: { color: 'rgba(0,0,0,0)', borderColor: coral, borderWidth: 1.5 },
          data: held.map((p) => [p.t, rec.get(p.drawNumber).projected]),
          markLine: {
            silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: coral, width: 1, type: 'solid', opacity: 0.6 },
            data: held.map((p) => [{ coord: [p.t, p.drawCRS] }, { coord: [p.t, rec.get(p.drawNumber).projected] }]),
          },
        },
        {
          id: 'draws', type: 'line', z: 3, ...pinnable({ formatter: cutoff }),
          symbol: 'circle', symbolSize: pts.length > 40 ? 5.5 : 7.5, showAllSymbol: true,
          lineStyle: { width: 2.5, color: gradient(magenta, orange, true) },
          areaStyle: { color: gradient(alpha(magenta, 0.28), alpha(orange, 0.02)) },
          itemStyle: { color: card, borderColor: magenta, borderWidth: 2 },
          label: bubble({ show: false, formatter: cutoff }),
          markLine: ruleT > t0 && ruleT < t1 ? {
            silent: true, symbol: 'none', lineStyle: { color: orange, width: 1.5, type: [4, 3] },
            label: { formatter: 'New rules, Nov 3', position: 'end', color: css('--ee-muted') }, data: [{ xAxis: ruleT }],
          } : undefined,
          data: pts.map((p) => ({ name: key + ':d' + p.drawNumber, value: [p.t, p.drawCRS], label: recent.has(p) ? { show: true } : undefined })),
        },
        {
          id: 'next', type: 'scatter', z: 4, ...pinnable({ backgroundColor: coral, color: '#fff', formatter: (p) => (p.dataIndex ? '' : '≈ ') + p.value[1] }),
          itemStyle: { color: card, borderColor: coral, borderWidth: 2 },
          label: bubble({ show: false, backgroundColor: coral, color: '#fff', formatter: (p) => (p.dataIndex ? '' : '≈ ') + p.value[1] }),
          data: fut.map((q, i) => ({ name: key + ':p' + q.date, value: [q.t, q.projected], symbolSize: i ? 7 : 11, label: i === 0 || i === fut.length - 1 ? { show: true } : undefined })),
        },
      ],
    },
    describe: (id, i) => {
      if (id === 'draws') {
        const p = pts[i], was = rec.get(p.drawNumber);
        return { title: date(p.drawDate) + ', draw #' + p.drawNumber, rows: ['Cut-off ' + p.drawCRS + ', ' + num(p.drawSize) + ' invitations', was && 'Projected before it ' + was.projected + ', missed by ' + signed(was.miss)] };
      }
      const q = fut[i];
      return {
        title: (i ? 'Projected round ' + (i + 1) : 'Next round') + ', about ' + date(q.date),
        rows: ['Cut-off ' + q.projected + ' (likely ' + q.low + ' to ' + q.high + ')', num(q.size) + ' invitations' + (q.size === plan.t.usualSize ? ', usual size' : ''),
          q.withPoints != null && Math.round(q.withPoints * 100) + '% of invitees with new points'],
      };
    },
  };
});
