// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// All draws: every round's cut-off over time, with its size as the bubble's area. The slider under the chart zooms
// into a stretch of time.
import { store } from '../state.js';
import { num, date, toDate } from '../ui/format.js';
import { css, alpha, groupColor } from '../ui/theme.js';
import { chartView, valueAxis, timeAxis, legend, legendHeight, pinnable, nice } from './base.js';

const NAMES = { cec: 'Canadian Experience Class', pnp: 'Provincial Nominee', french: 'French language', other: 'Other categories' };
const LEGEND = ['cec', 'pnp', 'french', 'other'];
// drawn in this order, so the groups with the smaller rounds stay on top
const GROUPS = ['french', 'cec', 'other', 'pnp'];
const groupOf = (key) => (NAMES[key] && key !== 'other' ? key : 'other');

export const drawBubblesChart = chartView((el) => {
  const draws = store.rows('draws');
  if (!draws || !draws.length) return null;
  const rows = draws.map((r) => ({ ...r, t: toDate(r.drawDate).getTime() }));
  const W = el.clientWidth, H = W < 560 ? 300 : 360, names = LEGEND.map((g) => NAMES[g]), top = legendHeight(names, W);
  const R = W < 560 ? 11 : 16, maxSize = Math.max(...rows.map((q) => q.drawSize)), crs = rows.map((q) => q.drawCRS);
  const t0 = Math.min(...rows.map((q) => q.t)), t1 = Math.max(...rows.map((q) => q.t)), tpad = (t1 - t0) * 0.02;
  // largest first within a group, so small rounds stay on top
  const groups = GROUPS.map((g) => rows.filter((q) => groupOf(q.key) === g).sort((a, b) => b.drawSize - a.drawSize));
  // the arrow keys go through the draws by date
  const byDate = groups.flatMap((list, s) => list.map((q, i) => ({ q, s, i }))).sort((a, b) => a.q.t - b.q.t || a.q.drawNumber - b.q.drawNumber);
  const slate = css('--ee-slate'), line = css('--ee-line');

  return {
    height: H + top + 34,
    label: 'Every draw',
    pick: 'xy',
    nav: byDate.map(({ s, i }) => [[s, i]]),
    option: {
      legend: legend({ data: names }),
      grid: { top: top + 16, bottom: 44 },
      xAxis: timeAxis({ min: t0 - tpad, max: t1 + tpad }),
      yAxis: valueAxis(nice(Math.min(...crs) - 20, Math.max(...crs) + 20, 6)),
      dataZoom: [
        {
          type: 'slider', xAxisIndex: 0, bottom: 6, height: 18, borderColor: line, fillerColor: alpha(css('--ee-blue'), 0.12),
          handleStyle: { color: css('--ee-card'), borderColor: slate }, moveHandleStyle: { color: slate }, textStyle: { color: css('--ee-muted'), fontSize: 11 },
          dataBackground: { lineStyle: { color: slate, opacity: 0.5 }, areaStyle: { color: slate, opacity: 0.12 } },
          labelFormatter: (v) => date(new Date(v).toISOString().slice(0, 10)),
        },
        // Ctrl and the mouse wheel zoom too, so the wheel alone still scrolls the page
        { type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: 'ctrl', moveOnMouseWheel: false, moveOnMouseMove: false },
      ],
      series: groups.map((list, s) => {
        const c = groupColor(GROUPS[s]);
        return {
          id: GROUPS[s], name: NAMES[GROUPS[s]], type: 'scatter',
          ...pinnable({ formatter: (p) => String(p.value[1]) }),
          itemStyle: { color: alpha(c, 0.55), borderColor: c, borderWidth: 1 },
          data: list.map((q) => ({ name: String(q.drawNumber), value: [q.t, q.drawCRS], symbolSize: 2 * Math.max(2, Math.sqrt(q.drawSize / maxSize) * R) })),
        };
      }),
    },
    describe: (id, i) => {
      const q = groups[GROUPS.indexOf(id)][i];
      return { title: date(q.drawDate) + ', draw #' + q.drawNumber, rows: [q.category, 'Cut-off ' + q.drawCRS + ', ' + num(q.drawSize) + ' invitations'] };
    },
  };
});
