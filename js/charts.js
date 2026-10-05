/* ==========================================================================
   BIOTEX LIFE — charts.js
   ChartManager: canvas line/area + bar charts with animation and
   touch-friendly tooltips; sparklines; SVG ring & arc gauges.
   ========================================================================== */
(function (BL) {
  'use strict';
  const { clamp, el, animateValue, prefersReducedMotion, debounce } = BL;

  const font = (px, weight) => `${weight || 500} ${px}px ${BL.cssVar('--font-body') || 'Inter, system-ui, sans-serif'}`;

  /* Catmull-Rom → bezier smoothing */
  function smoothPath(ctx, pts, tension) {
    tension = tension == null ? 0.5 : tension;
    if (pts.length < 2) return;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6 * tension * 2, cp1y = p1.y + (p2.y - p0.y) / 6 * tension * 2;
      const cp2x = p2.x - (p3.x - p1.x) / 6 * tension * 2, cp2y = p2.y - (p3.y - p1.y) / 6 * tension * 2;
      ctx.bezierCurveTo(cp1x, clampY(cp1y, p1, p2), cp2x, clampY(cp2y, p1, p2), p2.x, p2.y);
    }
  }
  const clampY = (y, a, b) => { const lo = Math.min(a.y, b.y) - 6, hi = Math.max(a.y, b.y) + 6; return clamp(y, lo, hi); };

  class Chart {
    constructor(container, config) {
      this.container = container;
      this.config = config;
      this.canvas = el('canvas', { 'aria-hidden': 'true' });
      this.tooltip = el('div', { class: 'chart__tooltip' });
      container.innerHTML = '';
      container.append(this.canvas, this.tooltip);
      this.ctx = this.canvas.getContext('2d');
      this.progress = 1; this.hover = -1; this.cancelAnim = null;
      this.points = [];
      if (window.ResizeObserver) { this.ro = new ResizeObserver(debounce(() => this.draw(), 50)); this.ro.observe(container); }
      const move = (e) => this.onPointer(e);
      this.canvas.addEventListener('pointermove', move);
      this.canvas.addEventListener('pointerdown', move);
      this.canvas.addEventListener('pointerleave', () => { this.hover = -1; this.tooltip.classList.remove('is-visible'); this.draw(); });
      this.render(true);
    }

    setConfig(config, animate) { this.config = config; this.hover = -1; this.tooltip.classList.remove('is-visible'); this.render(animate !== false); }

    render(animate) {
      if (this.cancelAnim) this.cancelAnim();
      if (animate && !prefersReducedMotion()) {
        this.progress = 0;
        this.cancelAnim = animateValue(0, 1, this.config.type === 'bar' ? 800 : 1000, (v) => { this.progress = v; this.draw(); });
      } else { this.progress = 1; this.draw(); }
    }

    layout() {
      const w = this.container.clientWidth, h = this.container.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
        this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
        this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
      }
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const c = this.config;
      const padL = c.yAxis === false ? 8 : 36, padR = 10, padT = 14, padB = c.xLabels === false ? 8 : 22;
      return { w, h, padL, padR, padT, padB, iw: Math.max(1, w - padL - padR), ih: Math.max(1, h - padT - padB) };
    }

    range() {
      const c = this.config;
      let vals = [];
      (c.series || []).forEach((s) => s.data.forEach((v) => { if (v != null && isFinite(v)) vals.push(v); }));
      if (c.type === 'bar') vals = vals.concat(c.data.filter((v) => v != null));
      if (c.band) vals.push(c.band.from, c.band.to);
      let min = c.yMin != null ? c.yMin : Math.min.apply(null, vals), max = c.yMax != null ? c.yMax : Math.max.apply(null, vals);
      if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
      if (c.type === 'bar' && c.yMin == null) min = 0;
      if (max === min) { max = min + 1; }
      if (c.yMin == null && c.type !== 'bar') min -= (max - min) * 0.12;
      if (c.yMax == null) max += (max - min) * 0.1;
      return { min, max };
    }

    draw() {
      const L = this.layout(), ctx = this.ctx, c = this.config;
      if (!L.w || !L.h) return;
      ctx.clearRect(0, 0, L.w, L.h);
      const { min, max } = this.range();
      const yFor = (v) => L.padT + (1 - (v - min) / (max - min)) * L.ih;
      const muted = BL.cssVar('--text-muted') || '#6F7B86';
      const gridColor = document.documentElement.dataset.theme === 'light' ? 'rgba(6,20,24,0.08)' : 'rgba(255,255,255,0.07)';

      /* grid + y labels */
      ctx.save();
      ctx.strokeStyle = gridColor; ctx.lineWidth = 1; ctx.font = font(10); ctx.fillStyle = muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const gridLines = c.gridLines || 3;
      for (let i = 0; i <= gridLines; i++) {
        const v = min + ((max - min) * i) / gridLines, y = Math.round(yFor(v)) + 0.5;
        ctx.beginPath(); ctx.moveTo(L.padL, y); ctx.lineTo(L.w - L.padR, y); ctx.stroke();
        if (c.yAxis !== false) ctx.fillText(c.formatY ? c.formatY(v) : Math.round(v), L.padL - 8, y);
      }
      ctx.restore();

      /* baseline band */
      if (c.band) {
        ctx.save();
        ctx.fillStyle = BL.rgbaFor(c.band.color || 'green', 0.09);
        const y1 = yFor(c.band.to), y2 = yFor(c.band.from);
        ctx.fillRect(L.padL, y1, L.iw, y2 - y1);
        ctx.setLineDash([4, 4]); ctx.strokeStyle = BL.rgbaFor(c.band.color || 'green', 0.45);
        ctx.beginPath(); ctx.moveTo(L.padL, y1 + 0.5); ctx.lineTo(L.w - L.padR, y1 + 0.5); ctx.moveTo(L.padL, y2 + 0.5); ctx.lineTo(L.w - L.padR, y2 + 0.5); ctx.stroke();
        ctx.restore();
      }

      if (c.type === 'bar') this.drawBars(L, yFor, min); else this.drawLines(L, yFor);

      /* x labels */
      if (c.xLabels !== false && c.labels) {
        ctx.save(); ctx.font = font(10, 600); ctx.fillStyle = muted; ctx.textBaseline = 'alphabetic';
        const n = c.labels.length;
        const every = c.labelEvery || (n > 14 ? Math.ceil(n / 7) : 1);
        c.labels.forEach((lab, i) => {
          if (!lab || i % every !== 0 && i !== n - 1 && c.labelEvery == null) return;
          if (c.labelEvery != null && i % every !== 0) return;
          const x = c.type === 'bar' ? L.padL + (i + 0.5) * (L.iw / n) : L.padL + (n > 1 ? (i / (n - 1)) * L.iw : 0);
          ctx.textAlign = c.type === 'bar' ? 'center' : i === 0 ? 'left' : i === n - 1 ? 'right' : 'center';
          ctx.fillText(lab, x, L.h - 6);
        });
        ctx.restore();
      }

      /* hover crosshair */
      if (this.hover >= 0 && this.points[this.hover]) {
        const p = this.points[this.hover];
        ctx.save();
        ctx.strokeStyle = BL.rgbaFor('aqua', 0.5); ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x + 0.5, L.padT); ctx.lineTo(p.x + 0.5, L.padT + L.ih); ctx.stroke();
        if (c.type !== 'bar') { ctx.setLineDash([]); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
        ctx.restore();
      }
    }

    drawLines(L, yFor) {
      const ctx = this.ctx, c = this.config;
      this.points = [];
      (c.series || []).forEach((s, si) => {
        const data = s.data, n = data.length;
        if (!n) return;
        const color = BL.colorFor(s.color || 'aqua');
        const pts = data.map((v, i) => (v == null ? null : { x: L.padL + (n > 1 ? (i / (n - 1)) * L.iw : L.iw / 2), y: yFor(v), v, i, color }));
        if (si === 0) this.points = pts;
        const visibleW = L.padL + L.iw * this.progress;
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, visibleW + 2, L.h); ctx.clip();
        /* split into contiguous runs (null gaps) */
        const runs = []; let run = [];
        pts.forEach((p) => { if (p) run.push(p); else if (run.length) { runs.push(run); run = []; } });
        if (run.length) runs.push(run);
        runs.forEach((r) => {
          const solidEnd = s.dashedFrom != null ? Math.min(r.length, Math.max(1, r.findIndex((p) => p.i >= s.dashedFrom) === -1 ? r.length : r.findIndex((p) => p.i >= s.dashedFrom) + 1)) : r.length;
          const solid = r.slice(0, solidEnd), dashed = r.slice(Math.max(0, solidEnd - 1));
          if (s.fill !== false && solid.length > 1) {
            ctx.beginPath(); smoothPath(ctx, solid, s.tension);
            ctx.lineTo(solid[solid.length - 1].x, L.padT + L.ih); ctx.lineTo(solid[0].x, L.padT + L.ih); ctx.closePath();
            const grad = ctx.createLinearGradient(0, L.padT, 0, L.padT + L.ih);
            grad.addColorStop(0, BL.rgbaFor(s.color || 'aqua', s.fillAlpha || 0.28)); grad.addColorStop(1, BL.rgbaFor(s.color || 'aqua', 0));
            ctx.fillStyle = grad; ctx.fill();
          }
          ctx.lineWidth = s.width || 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = color;
          if (solid.length > 1) { ctx.beginPath(); smoothPath(ctx, solid, s.tension); ctx.stroke(); }
          if (s.dashedFrom != null && dashed.length > 1) { ctx.save(); ctx.setLineDash([4, 5]); ctx.globalAlpha = 0.55; ctx.beginPath(); smoothPath(ctx, dashed, s.tension); ctx.stroke(); ctx.restore(); }
          if (s.dots) r.forEach((p) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); });
          if (s.endDot && this.progress >= 1) {
            const p = solid[solid.length - 1];
            ctx.fillStyle = BL.rgbaFor(s.color || 'aqua', 0.25); ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
          }
        });
        ctx.restore();
      });
      /* event markers */
      if (c.markers && this.progress >= 1) {
        const n = (c.series[0] || { data: [] }).data.length;
        ctx.save(); ctx.font = font(9.5, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        c.markers.forEach((m, mi) => {
          const p = this.points[m.index]; if (!p) return;
          const col = BL.colorFor(m.color || 'aqua');
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
          const below = mi % 2 === 1;
          ctx.textBaseline = below ? 'top' : 'bottom';
          ctx.fillStyle = col; ctx.fillText(m.label.toUpperCase(), clamp(p.x, L.padL + 16, L.w - L.padR - 16), below ? p.y + 8 : p.y - 8);
        });
        ctx.restore();
      }
    }

    drawBars(L, yFor, min) {
      const ctx = this.ctx, c = this.config, data = c.data, n = data.length;
      const slot = L.iw / n, bw = Math.min(slot * 0.62, 34);
      const baseY = yFor(min);
      this.points = [];
      const ease = BL.easeOutCubic(this.progress);
      data.forEach((v, i) => {
        const x = L.padL + (i + 0.5) * slot;
        const target = v == null ? baseY : yFor(v);
        const y = baseY - (baseY - target) * ease;
        const key = c.colors ? c.colors[i] : c.color || 'aqua';
        const isHi = c.highlightIndex === i;
        const color = isHi || c.highlightIndex == null ? BL.colorFor(key) : BL.rgbaFor(key, 0.45);
        this.points.push({ x, y: target, v, i, color: BL.colorFor(key) });
        const hgt = Math.max(0, baseY - y);
        ctx.fillStyle = color;
        roundRect(ctx, x - bw / 2, y, bw, hgt, Math.min(6, bw / 2));
        ctx.fill();
        if (v === 0 || v == null) { ctx.fillStyle = BL.rgbaFor('muted', 0.35); roundRect(ctx, x - bw / 2, baseY - 3, bw, 3, 1.5); ctx.fill(); }
      });
    }

    onPointer(e) {
      if (!this.points.length) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      let best = -1, bd = Infinity;
      this.points.forEach((p, i) => { if (!p) return; const d = Math.abs(p.x - x); if (d < bd) { bd = d; best = i; } });
      if (best < 0 || best === this.hover) return;
      this.hover = best;
      const p = this.points[best], c = this.config;
      const lab = c.labels ? (c.tooltipLabels ? c.tooltipLabels[best] : c.labels[best]) : '';
      const val = c.formatValue ? c.formatValue(p.v, best) : (p.v == null ? '—' : Math.round(p.v * 10) / 10);
      this.tooltip.innerHTML = `${lab ? BL.escapeHtml(lab) : ''}<b>${BL.escapeHtml(String(val))}${c.unit ? ' <small>' + BL.escapeHtml(c.unit) + '</small>' : ''}</b>`;
      const L = this.layout();
      const ty = c.type === 'bar' ? p.y : p.y;
      this.tooltip.style.left = clamp(p.x, 40, L.w - 40) + 'px';
      this.tooltip.style.top = Math.max(ty, 36) + 'px';
      this.tooltip.classList.add('is-visible');
      this.draw();
    }

    destroy() { if (this.cancelAnim) this.cancelAnim(); if (this.ro) this.ro.disconnect(); this.container.innerHTML = ''; }
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  /* ---------- Sparkline ---------- */
  function sparkline(canvas, data, opts) {
    opts = opts || {};
    const host = canvas.parentElement || canvas;
    const w = canvas.clientWidth || host.clientWidth || 120, h = canvas.clientHeight || parseInt(canvas.getAttribute('height') || 56, 10);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    if (!data || data.length < 2) return;
    let min = Math.min.apply(null, data), max = Math.max.apply(null, data);
    if (opts.min != null) min = Math.min(min, opts.min); if (opts.max != null) max = Math.max(max, opts.max);
    if (max === min) { max += 1; min -= 1; }
    const pad = 4, n = data.length;
    const pts = data.map((v, i) => ({ x: pad + (i / (n - 1)) * (w - pad * 2), y: pad + (1 - (v - min) / (max - min)) * (h - pad * 2) }));
    const color = BL.colorFor(opts.color || 'red');
    if (opts.fill !== false) {
      ctx.beginPath(); smoothPath(ctx, pts, 0.5); ctx.lineTo(pts[n - 1].x, h); ctx.lineTo(pts[0].x, h); ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, BL.rgbaFor(opts.color || 'red', 0.3)); grad.addColorStop(1, BL.rgbaFor(opts.color || 'red', 0));
      ctx.fillStyle = grad; ctx.fill();
    }
    ctx.beginPath(); smoothPath(ctx, pts, 0.5); ctx.strokeStyle = color; ctx.lineWidth = opts.lineWidth || 1.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
    if (opts.endDot !== false) { const p = pts[n - 1]; ctx.fillStyle = BL.rgbaFor(opts.color || 'red', 0.3); ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2); ctx.fill(); }
  }

  /* ---------- Ring gauge (SVG) ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => { const n = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach((k) => n.setAttribute(k, attrs[k])); return n; };
  function ring(container, opts) {
    const size = opts.size || parseInt(container.dataset.size || 100, 10);
    const stroke = opts.stroke || parseInt(container.dataset.stroke || 10, 10);
    const color = opts.color || container.dataset.color || 'aqua';
    const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
    container.style.width = size + 'px'; container.style.height = size + 'px'; container.style.setProperty('--ring-size', size + 'px');
    container.innerHTML = '';
    const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true' });
    const track = svgEl('circle', { class: 'ring__track', cx: size / 2, cy: size / 2, r, 'stroke-width': stroke });
    const val = svgEl('circle', { class: 'ring__value', cx: size / 2, cy: size / 2, r, 'stroke-width': stroke, 'stroke-dasharray': circ, 'stroke-dashoffset': circ, stroke: BL.colorFor(color) });
    svg.append(track, val); container.append(svg);
    let label = null;
    if (opts.label != null || container.dataset.label != null) {
      label = el('div', { class: 'ring__label' });
      label.append(el('b', { text: opts.label != null ? opts.label : container.dataset.label }));
      if (opts.sub || container.dataset.sub) label.append(el('span', { text: opts.sub || container.dataset.sub }));
      container.append(label);
    }
    const api = {
      el: container, size,
      set(value, text, sub) {
        const v = clamp(value, 0, opts.max || 100) / (opts.max || 100);
        val.setAttribute('stroke-dashoffset', circ * (1 - v));
        if (label && text != null) label.firstChild.textContent = text;
        if (label && sub != null && label.children[1]) label.children[1].textContent = sub;
      },
      color(c) { val.setAttribute('stroke', BL.colorFor(c)); },
    };
    requestAnimationFrame(() => requestAnimationFrame(() => api.set(opts.value != null ? opts.value : parseFloat(container.dataset.value || 0))));
    return api;
  }

  /* ---------- Arc gauge (240°) ---------- */
  function polar(cx, cy, r, deg) { const a = ((deg - 90) * Math.PI) / 180; return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; }
  function arcPath(cx, cy, r, start, end) { const s = polar(cx, cy, r, start), e = polar(cx, cy, r, end); const large = end - start <= 180 ? 0 : 1; return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`; }
  function arc(container, opts) {
    const size = opts.size || parseInt(container.dataset.size || 120, 10);
    const stroke = opts.stroke || Math.max(8, Math.round(size * 0.085));
    const color = opts.color || container.dataset.color || 'orange';
    const sweep = 240, start = -120, end = 120;
    const r = (size - stroke) / 2 - 2, cx = size / 2, cy = size / 2;
    const h = Math.round(size * 0.78);
    container.style.width = size + 'px'; container.style.height = h + 'px'; container.style.setProperty('--arc-size', size + 'px');
    container.innerHTML = '';
    const svg = svgEl('svg', { viewBox: `0 0 ${size} ${h}`, 'aria-hidden': 'true' });
    const track = svgEl('path', { class: 'arc__track', d: arcPath(cx, cy, r, start, end), 'stroke-width': stroke });
    const len = (Math.PI * 2 * r * sweep) / 360;
    const val = svgEl('path', { class: 'arc__value', d: arcPath(cx, cy, r, start, end), 'stroke-width': stroke, 'stroke-dasharray': len, 'stroke-dashoffset': len, stroke: BL.colorFor(color) });
    const ticks = svgEl('g', { class: 'arc__ticks', 'stroke-width': 1.5 });
    for (let i = 0; i <= 10; i++) { const a = start + (sweep * i) / 10; const p1 = polar(cx, cy, r - stroke / 2 - 5, a), p2 = polar(cx, cy, r - stroke / 2 - (i % 5 === 0 ? 11 : 8), a); ticks.append(svgEl('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y })); }
    svg.append(track, val, ticks); container.append(svg);
    let label = null;
    if (opts.label != null || container.dataset.label != null) {
      label = el('div', { class: 'arc__label' });
      label.append(el('b', { text: opts.label != null ? opts.label : container.dataset.label }));
      if (opts.sub || container.dataset.sub) label.append(el('span', { text: opts.sub || container.dataset.sub }));
      label.style.bottom = Math.round(h * 0.06) + 'px';
      container.append(label);
    }
    const api = {
      el: container,
      set(value, text, sub) {
        const v = clamp(value, 0, 100) / 100;
        val.setAttribute('stroke-dashoffset', len * (1 - v));
        if (label && text != null) label.firstChild.textContent = text;
        if (label && sub != null && label.children[1]) label.children[1].textContent = sub;
      },
      color(c) { val.setAttribute('stroke', BL.colorFor(c)); },
    };
    requestAnimationFrame(() => requestAnimationFrame(() => api.set(opts.value != null ? opts.value : parseFloat(container.dataset.value || 0))));
    return api;
  }

  /* ---------- Manager ---------- */
  const registry = new Map();
  const ChartManager = {
    Chart,
    create(key, container, config) {
      if (registry.has(key)) registry.get(key).destroy();
      const chart = new Chart(container, config);
      registry.set(key, chart);
      return chart;
    },
    update(key, config, animate) { const c = registry.get(key); if (c) c.setConfig(config, animate); return c; },
    get(key) { return registry.get(key); },
    redrawAll() { registry.forEach((c) => c.draw()); },
    replayAll(root) { registry.forEach((c) => { if (!root || root.contains(c.container)) c.render(true); }); },
    sparkline, ring, arc,
  };
  BL.ChartManager = ChartManager;
})(window.BL = window.BL || {});
