/* ==========================================================================
   BIOTEX LIFE — utils.js
   Shared helpers: DOM, math, formatting, animation, events, files.
   All modules attach to the single BL namespace (classic scripts, works on file://).
   ========================================================================== */
(function (BL) {
  'use strict';

  /* ---------- DOM ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const el = (tag, attrs, children) => {
    const node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach((k) => {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== undefined && attrs[k] !== null) node.setAttribute(k, attrs[k]);
    });
    if (children) (Array.isArray(children) ? children : [children]).forEach((c) => { if (c != null) node.append(c); });
    return node;
  };
  const icon = (name, cls) => `<svg class="${cls || ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Event delegation: on(root, 'click', '[data-x]', (e, matched) => {}) */
  const on = (root, type, selector, handler, opts) => {
    root.addEventListener(type, (e) => {
      const target = e.target.closest ? e.target.closest(selector) : null;
      if (target && root.contains(target)) handler(e, target);
    }, opts);
  };

  /* ---------- Math ---------- */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const round = (v, d) => { const m = Math.pow(10, d || 0); return Math.round(v * m) / m; };
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  /** Approximately normal random (mean 0, sd 1) */
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v); };
  /** Deterministic PRNG for stable demo datasets */
  const seeded = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const avg = (arr) => (arr.length ? sum(arr) / arr.length : 0);
  const haversine = (a, b) => {
    const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  /* ---------- Formatting ---------- */
  const pad2 = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const fmtTimer = (sec) => { sec = Math.max(0, Math.floor(sec)); return `${pad2(sec / 3600)}:${pad2((sec % 3600) / 60)}:${pad2(sec % 60)}`; };
  const fmtClock = (sec) => { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600); return h ? `${h}:${pad2((sec % 3600) / 60)}:${pad2(sec % 60)}` : `${pad2(sec / 60)}:${pad2(sec % 60)}`; };
  const fmtDurationHuman = (sec) => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; if (h) return `${h}h ${pad2(m)}m`; if (m) return s ? `${m}m ${pad2(s)}s` : `${m}m`; return `${s}s`; };
  const fmtMinutes = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h}h ${pad2(m)}m` : `${m}m`; };
  const fmtNumber = (n, d) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const fmtTime = (date) => new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAYS_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const fmtRelativeDay = (date) => {
    const d = new Date(date), now = new Date();
    const diff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return DAYS[d.getDay()];
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  };
  const fmtDateTime = (date) => `${fmtRelativeDay(date)}, ${fmtTime(date)}`;
  const greetingFor = (date) => { const h = (date || new Date()).getHours(); if (h < 5) return 'Good Night'; if (h < 12) return 'Good Morning'; if (h < 17) return 'Good Afternoon'; if (h < 21) return 'Good Evening'; return 'Good Night'; };
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  /* ---------- Animation ---------- */
  const prefersReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** animate a numeric value; returns cancel fn */
  const animateValue = (from, to, duration, onUpdate, ease) => {
    ease = ease || easeOutCubic;
    if (prefersReducedMotion() || duration <= 0) { onUpdate(to, 1); return () => {}; }
    let raf = 0; const t0 = performance.now();
    const step = (now) => { const p = clamp((now - t0) / duration, 0, 1); onUpdate(lerp(from, to, ease(p)), p); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  };
  const counters = new WeakMap();
  /** Count an element's text toward a value (handles decimals + thousands) */
  const countTo = (node, to, opts) => {
    opts = opts || {};
    const decimals = opts.decimals != null ? opts.decimals : 0;
    const current = parseFloat(String(node.textContent).replace(/[^0-9.\-]/g, '')) || 0;
    if (counters.has(node)) counters.get(node)();
    if (Math.abs(current - to) < Math.pow(10, -decimals) / 2) { node.textContent = opts.thousands ? fmtNumber(to, decimals) : to.toFixed(decimals); return; }
    const cancel = animateValue(current, to, opts.duration || 700, (v) => { node.textContent = opts.thousands ? fmtNumber(v, decimals) : v.toFixed(decimals); });
    counters.set(node, cancel);
  };
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const throttle = (fn, ms) => { let last = 0, t; return (...a) => { const now = Date.now(); if (now - last >= ms) { last = now; fn(...a); } else { clearTimeout(t); t = setTimeout(() => { last = Date.now(); fn(...a); }, ms - (now - last)); } }; };

  /* ---------- Events ---------- */
  const emitter = () => {
    const map = new Map();
    return {
      on(type, fn) { if (!map.has(type)) map.set(type, new Set()); map.get(type).add(fn); return () => map.get(type).delete(fn); },
      off(type, fn) { if (map.has(type)) map.get(type).delete(fn); },
      emit(type, payload) { if (map.has(type)) map.get(type).forEach((fn) => { try { fn(payload); } catch (err) { console.error('[BL] listener error', type, err); } }); },
    };
  };

  /* ---------- Files / device ---------- */
  const downloadFile = (name, content, mime) => {
    try {
      const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return true;
    } catch (err) { console.error('[BL] download failed', err); return false; }
  };
  const toCSV = (rows) => rows.map((r) => r.map((v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
  let interacted = false;
  ['pointerdown', 'keydown', 'touchstart'].forEach((t) => document.addEventListener(t, () => { interacted = true; }, { once: true, passive: true }));
  const vibrate = (pattern) => { try { if (interacted && BL.settings && BL.settings.get('haptics') && navigator.vibrate) navigator.vibrate(pattern || 12); } catch (e) { /* ignore */ } };
  const copyText = async (text) => {
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* fall through */ }
    try { const ta = el('textarea', { style: 'position:fixed;opacity:0' }); ta.value = text; document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
  };
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const colorFor = (key) => ({ aqua: cssVar('--accent-primary'), green: cssVar('--accent-green'), blue: cssVar('--accent-blue'), purple: cssVar('--accent-purple'), orange: cssVar('--accent-orange'), red: cssVar('--accent-red'), amber: cssVar('--accent-amber'), muted: cssVar('--text-muted'), text: cssVar('--text-primary') }[key] || key);
  /** colour token → rgba() with the given alpha; falls back to parsing the resolved hex / rgb() colour (text, muted, custom) */
  const rgbaFor = (key, a) => {
    const rgb = cssVar(`--accent-${key === 'aqua' ? 'primary' : key}-rgb`);
    if (rgb) return `rgba(${rgb}, ${a})`;
    const c = (colorFor(key) || '').trim();
    const hex = /^#([0-9a-f]{3,8})$/i.exec(c);
    if (hex) { let h = hex[1]; if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join(''); const n = parseInt(h.slice(0, 6), 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; }
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (m) { const p = m[1].split(',').slice(0, 3).map((x) => x.trim()); return `rgba(${p.join(', ')}, ${a})`; }
    return c || key;
  };

  Object.assign(BL, {
    $, $$, el, icon, escapeHtml, on, clamp, lerp, round, easeOutCubic, easeInOut, gauss, seeded, sum, avg, haversine,
    pad2, fmtTimer, fmtClock, fmtDurationHuman, fmtMinutes, fmtNumber, fmtTime, fmtRelativeDay, fmtDateTime, greetingFor, uid,
    DAYS, DAYS_SHORT, MONTHS_SHORT, startOfDay,
    prefersReducedMotion, animateValue, countTo, debounce, throttle, emitter, downloadFile, toCSV, vibrate, copyText, cssVar, colorFor, rgbaFor,
  });
})(window.BL = window.BL || {});
