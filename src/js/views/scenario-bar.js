// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// The scenario controls: the bar at the top of every page and the calculator's inputs on the Method page. Every input
// with data-param edits one scenario value; the effect below puts the values in use back into them.
import { store, scenario, model } from '../state.js';
import { num, pctOf } from '../ui/format.js';

const PCT = { hw: () => model.hw(), jo: () => model.jo(), cw: () => model.cw() };

export function setupScenarioControls() {
  // on phones the bar folds into a summary line that opens it
  const bar = document.querySelector('.ee-bar'), sum = document.querySelector('.ee-bar-sum');
  const toggleBar = () => { if (!bar) return; bar.classList.toggle('is-open'); if (sum) sum.setAttribute('aria-expanded', String(bar.classList.contains('is-open'))); };
  if (sum) { sum.addEventListener('click', toggleBar); sum.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBar(); } }); }

  // sliders, number boxes and the date: percentages are 0–100; a size equal to the usual one clears it
  document.querySelectorAll('[data-param]').forEach((i) => i.addEventListener('input', () => {
    const k = i.dataset.param;
    if (k === 'next') { scenario.set({ next: i.value || null }); return; }
    if (k === 'size') { const t = model.type(); const v = Math.round(Number(i.value)); if (t && v > 0) scenario.set({ size: v === t.usualSize ? null : v }); return; }
    if (i.value === '') return;
    scenario.set({ [k]: Math.max(0, Math.min(Number(i.max || 100), Number(i.value))) });
  }));
  document.querySelectorAll('.ee-reset').forEach((b) => b.addEventListener('click', () => scenario.reset()));
  document.querySelectorAll('.ee-span').forEach((b) => b.addEventListener('click', () => scenario.set({ span: b.dataset.span })));
  // projected rounds: every type, or only the selected one
  document.querySelectorAll('.ee-rounds-pill').forEach((b) => b.addEventListener('click', () => scenario.set({ view: b.dataset.rounds })));
}

/** Effect: inputs, pills and ranges show the values in use, except the input being edited. */
export function syncScenarioControls() {
  const t = model.type(), r = t ? model.cur() : null;
  document.querySelectorAll('[data-param]').forEach((i) => {
    if (i === document.activeElement) return;
    const k = i.dataset.param;
    if (PCT[k]) i.value = String(Math.round(PCT[k]() * 1000) / 10);
    else if (k === 'next') i.value = t ? model.nextFor(t) : '';
    else if (k === 'size' && t) {
      const sr = model.sizeRange(t);
      if (i.type === 'range') { i.min = String(sr.lo); i.max = String(sr.hi); i.step = String(sr.step); }
      i.value = String(r ? r.size : t.usualSize);
      i.disabled = t.method !== 'pool';
    }
  });
  document.querySelectorAll('.ee-span').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.span === scenario.span())));
  document.querySelectorAll('.ee-rounds-pill').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.rounds === scenario.rounds())));
}

/** The draw type select. It keeps its own element so it stays open and focused across redraws. */
export const typeSelect = {
  mount: (el) => {
    const sel = document.createElement('select');
    sel.className = 'ee-select'; sel.setAttribute('aria-label', 'Draw type');
    sel.addEventListener('change', () => scenario.pick(sel.value));
    el.appendChild(sel);
    return sel;
  },
  update: (el, sel) => {
    const rows = store.rows('types') || [];
    const sig = rows.map((r) => r.key).join();
    if (sel.dataset.sig !== sig) { sel.replaceChildren(...rows.map((r) => new Option(r.category, r.key))); sel.dataset.sig = sig; }
    sel.value = scenario.cat();
    sel.disabled = !rows.length;
  },
};

export const hwOut = (el) => { el.textContent = pctOf(model.hw()); };
export const joOut = (el) => { el.textContent = pctOf(model.jo()); };

export const sizeLabel = (el) => {
  const r = model.cur();
  el.textContent = !r ? '—' : !r.modelled ? 'Usual size (not modelled)' : num(r.size) + (r.usual ? ' (usual)' : '');
};

/** The folded bar's one-line summary on phones. */
export const barSummary = (el) => {
  const r = model.cur(), f = model.hwSet() ? null : model.calib();
  const from = !f ? '' : f.n ? ' (fitted)' : f.prior.from === 'count' ? ' (from IRCC count)' : '';
  el.textContent = r ? r.category + ', ' + num(r.size) + ' a round, ' + pctOf(model.hw()) + ' high-wage' + from : '—';
};
