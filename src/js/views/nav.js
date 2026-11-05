// Copyright 2026 Beili (Echo) Yin
// SPDX-License-Identifier: Apache-2.0

// Pages: the rail shows one page at a time and keeps it in the address (#forecast), so a link or a reload opens it.
import { PAGES } from '../config.js';
import { model } from '../state.js';

const setLink = (id) => { try { history.replaceState(null, '', '#' + id); } catch { /* sandboxed */ } };

function showPage(id, scroll) {
  if (!PAGES.includes(id)) id = PAGES[0];
  document.querySelectorAll('.ee-page').forEach((s) => { s.hidden = s.id !== id; });
  document.querySelectorAll('.ee-nav button[data-page]').forEach((b) => { if (b.dataset.page === id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  setLink(id);
  if (scroll) { const m = document.querySelector('.ee-main'); if (m) m.scrollIntoView({ block: 'start' }); }
}

export function setupNav() {
  document.querySelectorAll('.ee-nav button[data-page]').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.page, true)));
  document.querySelectorAll('.ee-go').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); showPage(a.dataset.go, true); }));
  showPage(location.hash.slice(1), false);
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (PAGES.includes(h)) showPage(h, false); });
}

/**
 * Effect: once IRCC publishes a count scored under the new rules, the notes about rescoring the old count give way
 * to ones about IRCC's own count.
 */
export function syncEstimateNotes() {
  const c = model.ctx(), live = !!(c && c.live);
  // set only on a change: rewriting the attribute counts as a change and would schedule another render
  document.querySelectorAll('.ee-est').forEach((n) => { if (n.hidden !== live) n.hidden = live; });
  document.querySelectorAll('.ee-live').forEach((n) => { if (n.hidden !== !live) n.hidden = !live; });
}
