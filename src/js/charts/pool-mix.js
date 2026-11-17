// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Overview: the pool by score range under the new rules, as a ring with its legend.
import { model } from '../state.js';
import { num, pct } from '../ui/format.js';
import { css } from '../ui/theme.js';
import { chartView, legend, pinnable } from './base.js';

// score ranges, from IRCC's bands (by their lowest score)
const PARTS = [
  ['601 and above', '--ee-magenta', (b) => b.lo >= 601],
  ['501–600', '--ee-coral', (b) => b.lo === 501],
  ['451–500', '--ee-orange', (b) => b.lo >= 451 && b.lo <= 491],
  ['401–450', '--ee-cyan', (b) => b.lo >= 401 && b.lo <= 441],
  ['400 or less', '--ee-blue', (b) => b.lo <= 351],
];

export const poolMixChart = chartView((el) => {
  const pv = model.poolView();
  if (!pv) return null;
  const parts = PARTS.map(([label, c, inRange]) => ({ label, v: pv.rows.filter(inRange).reduce((t, b) => t + b.after, 0), color: css(c) }));
  const total = parts.reduce((t, p) => t + p.v, 0), share = new Map(parts.map((p) => [p.label, pct(p.v / total)]));
  // the legend beside the ring, or under it on narrow screens
  const W = el.clientWidth, side = W < 420, size = Math.min(190, side ? W - 20 : W * 0.5);
  const cx = side ? W / 2 : size / 2 + 4, cy = size / 2 + 4, R = size / 2;
  const lx = side ? 16 : size + 22, lw = side ? W - 32 : W - lx - 4;
  const ink = css('--ee-ink'), muted = css('--ee-muted'), font = css('--ee-font');
  const centre = (y, text, style) => ({ type: 'text', x: cx, y, silent: true, style: { text, textAlign: 'center', fontFamily: font, ...style } });

  return {
    height: side ? size + 150 : Math.max(size + 10, 220),
    label: 'Pool by score range',
    option: {
      legend: legend({
        orient: 'vertical', left: lx, top: side ? size + 20 : 'middle', itemGap: 14,
        formatter: (n) => '{n|' + n + '}{p|' + share.get(n) + '}',
        textStyle: { rich: { n: { width: lw - 72, color: muted, fontSize: 12 }, p: { width: 52, align: 'right', color: ink, fontSize: 12, fontWeight: 600 } } },
      }),
      graphic: [
        centre(cy - 4, 'Profiles', { fill: muted, fontSize: 11, textVerticalAlign: 'bottom' }),
        centre(cy + 2, num(total), { fill: ink, fontSize: 20, fontWeight: 600, textVerticalAlign: 'top' }),
      ],
      series: [{
        id: 'mix', type: 'pie', center: [cx, cy], radius: [R * 0.7, R], padAngle: 1, selectedOffset: 6,
        itemStyle: { borderRadius: 2 }, label: { show: false }, labelLine: { show: false }, emphasis: { scaleSize: 4 },
        ...pinnable({ position: 'inside', formatter: (p) => num(p.value) }),
        data: parts.map((p) => ({ name: p.label, value: p.v, itemStyle: { color: p.color } })),
      }],
    },
    describe: (id, i) => ({ title: 'CRS ' + parts[i].label, rows: [{ color: parts[i].color, text: num(parts[i].v) + ' profiles, ' + pct(parts[i].v / total) }] }),
  };
});
