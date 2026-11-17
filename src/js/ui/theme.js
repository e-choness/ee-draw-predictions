// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Colours come from the CSS custom properties in styles/tokens.css, so charts follow light and dark mode.

/** The value of a custom property on the app root, such as css('--ee-blue'). */
export const css = (name) => {
  const root = document.querySelector('.ee');
  return root ? getComputedStyle(root).getPropertyValue(name).trim() : '';
};

const TYPE = { cec: '--ee-blue', pnp: '--ee-magenta', french: '--ee-cyan', health: '--ee-green', trades: '--ee-orange', transport: '--ee-violet', senior: '--ee-coral', physicians: '--ee-slate' };
const GROUP = { cec: '--ee-blue', pnp: '--ee-magenta', french: '--ee-cyan' };

/** A #rrggbb colour at an opacity, as rgba(), for fills and gradients. */
export const alpha = (hex, a) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return Number.isNaN(n) ? hex : `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** A draw type's own colour (dots and tags in tables). */
export const typeColor = (key) => css(TYPE[key] || '--ee-slate') || '#9aa6bb';
/** The colour of a draw group in charts: the three main programs, everything else orange. */
export const groupColor = (key) => css(GROUP[key] || '--ee-orange');
