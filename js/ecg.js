/* ==========================================================================
   BIOTEX LIFE — ecg.js
   ECGRenderer: mathematically generated PQRST morphology rendered as a
   monitor-style sweeping trace on <canvas> (requestAnimationFrame).
   25 mm/s · 10 mm/mV · interval timing scales with heart rate.
   ========================================================================== */
(function (BL) {
  'use strict';
  const { clamp, gauss } = BL;

  const g = (t, c, s) => Math.exp(-((t - c) * (t - c)) / (2 * s * s));
  const tri = (t, c, w) => Math.max(0, 1 - Math.abs(t - c) / w);

  /**
   * One cardiac cycle in millivolts.
   * tMs: time since beat onset (P-wave start). rrMs: current RR interval.
   * Sequence: baseline → P → PR segment → Q → R → S → ST → T → (U) → baseline
   */
  function beatValue(tMs, rrMs, respPhase) {
    const k = clamp(Math.sqrt(rrMs / 1000), 0.78, 1.1); // QT shortens as HR rises (Bazett-like)
    const rAmp = 1.22 * (1 + 0.035 * Math.sin(respPhase));   // slight respiratory amplitude modulation
    let v = 0;
    v += 0.13 * g(tMs, 72 * k, 19 * k);        // P wave (rounded, small, positive)
    v += -0.09 * tri(tMs, 184, 9);             // Q (small negative)
    v += rAmp * tri(tMs, 198, 15);             // R (tall, sharp)
    v += -0.27 * tri(tMs, 214, 11);            // S (negative)
    v += 0.02 * g(tMs, 260, 30);               // ST segment (near-isoelectric, slight lift)
    v += 0.31 * g(tMs, 412 * k, 46 * k);       // T wave (rounded, positive)
    v += 0.025 * g(tMs, 565 * k, 28 * k);      // U wave (tiny)
    return v;
  }

  class ECGRenderer {
    constructor(canvas, opts) {
      opts = opts || {};
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.mmPx = opts.mmPx || 5;        // CSS px per mm
      this.speed = opts.speed || 25;     // mm/s
      this.gain = opts.gain || 10;       // mm/mV
      this.mini = !!opts.mini;
      this.gapPx = opts.gapPx || (this.mini ? 18 : 28);
      this.lineWidth = opts.lineWidth || (this.mini ? 1.6 : 2);
      this.grid = opts.grid !== false;
      this.hrProvider = opts.hr || (() => 72);
      this.running = false;
      this.raf = 0;
      this.t = 0; this.headX = 0; this.lastY = null; this.lastTs = 0;
      this.beatStart = -1; this.nextBeat = 0; this.rrMs = 833;
      this.width = 0; this.height = 0; this.dpr = 1;
      this.lastHr = 72;
      this.breathHz = opts.breathHz || 0.23;
      this.onBeat = opts.onBeat || null;
      this.hrvFn = opts.hrv || null; // target RMSSD (ms) → sets the beat-to-beat modulation depth
      this.onResize = () => this.resize();
      if (window.ResizeObserver) { this.ro = new ResizeObserver(BL.debounce(this.onResize, 60)); this.ro.observe(canvas.parentElement || canvas); }
      else window.addEventListener('resize', this.onResize);
      this.resize();
    }

    colors() {
      return {
        bg: BL.cssVar('--ecg-bg') || (document.documentElement.dataset.theme === 'light' ? '#F7FBFB' : '#040A0B'),
        trace: BL.colorFor('aqua'),
        minor: BL.rgbaFor('aqua', document.documentElement.dataset.theme === 'light' ? 0.12 : 0.07),
        major: BL.rgbaFor('aqua', document.documentElement.dataset.theme === 'light' ? 0.28 : 0.16),
      };
    }

    resize() {
      const host = this.canvas.parentElement || this.canvas;
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.width = w; this.height = h;
      this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
      this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.buildGrid();
      this.reset();
    }

    buildGrid() {
      const c = this.colors();
      const off = document.createElement('canvas');
      off.width = this.canvas.width; off.height = this.canvas.height;
      const x = off.getContext('2d');
      x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      x.fillStyle = c.bg; x.fillRect(0, 0, this.width, this.height);
      if (this.grid) {
        const step = this.mmPx, w = this.width, h = this.height;
        const baseY = this.baselineY();
        x.lineWidth = 1;
        // minor grid (1 mm)
        x.strokeStyle = c.minor; x.beginPath();
        for (let gx = 0.5; gx < w; gx += step) { x.moveTo(gx, 0); x.lineTo(gx, h); }
        for (let gy = baseY + 0.5; gy < h; gy += step) { x.moveTo(0, gy); x.lineTo(w, gy); }
        for (let gy = baseY + 0.5 - step; gy > 0; gy -= step) { x.moveTo(0, gy); x.lineTo(w, gy); }
        x.stroke();
        // major grid (5 mm)
        x.strokeStyle = c.major; x.beginPath();
        for (let gx = 0.5; gx < w; gx += step * 5) { x.moveTo(gx, 0); x.lineTo(gx, h); }
        for (let gy = baseY + 0.5; gy < h; gy += step * 5) { x.moveTo(0, gy); x.lineTo(w, gy); }
        for (let gy = baseY + 0.5 - step * 5; gy > 0; gy -= step * 5) { x.moveTo(0, gy); x.lineTo(w, gy); }
        x.stroke();
      }
      this.gridCanvas = off;
      this._colors = c;
    }

    baselineY() { return Math.round(this.height * (this.mini ? 0.64 : 0.6)); }
    yFor(mv) { return this.baselineY() - mv * this.gain * this.mmPx; }

    reset() {
      if (!this.gridCanvas) return;
      this.ctx.drawImage(this.gridCanvas, 0, 0, this.gridCanvas.width, this.gridCanvas.height, 0, 0, this.width, this.height);
      this.headX = 0; this.lastY = null; this.t = 0; this.beatStart = -1; this.nextBeat = 0.35;
    }

    start() {
      if (this.running) return;
      this.running = true; this.lastTs = performance.now();
      const loop = (ts) => { if (!this.running) return; this.frame(ts); this.raf = requestAnimationFrame(loop); };
      this.raf = requestAnimationFrame(loop);
    }
    stop() { this.running = false; cancelAnimationFrame(this.raf); }
    destroy() { this.stop(); if (this.ro) this.ro.disconnect(); window.removeEventListener('resize', this.onResize); }

    frame(ts) {
      let dt = (ts - this.lastTs) / 1000; this.lastTs = ts;
      if (!(dt > 0)) return;
      if (dt > 0.25) dt = 0.25; // tab was hidden or a slow frame — advance at most a quarter second so the beat clock keeps real time without a big smear
      if (!this.width) return;
      const pxPerSec = this.speed * this.mmPx;
      let advance = dt * pxPerSec;
      while (advance > 0.0001) {
        const step = Math.min(advance, this.width - this.headX);
        this.drawSegment(this.headX, this.headX + step);
        this.headX += step; advance -= step;
        if (this.headX >= this.width - 0.001) { this.headX = 0; this.lastY = null; }
      }
    }

    sample(tt) {
      // beat scheduling (monotonic time)
      while (tt >= this.nextBeat) {
        this.beatStart = this.nextBeat;
        const hr = clamp(this.hrProvider() || 72, 30, 220);
        this.lastHr = hr;
        const rr = 60 / hr;
        /* beat-to-beat variability: respiratory sinus arrhythmia (~14 breaths/min) + small random component */
        /* respiratory sinus arrhythmia + random jitter, scaled so RMSSD of the RR series ≈ the target HRV:
           for a sinusoid of amplitude A at 0.23 Hz the mean successive difference ≈ 0.86 · A */
        const target = this.hrvFn ? this.hrvFn() : null;
        const depth = target != null ? Math.min(0.12, (target / 0.86) * 0.8 / (rr * 1000)) : (hr < 100 ? 0.045 : 0.015);
        const jitter = target != null ? Math.min(0.03, (target * 0.45) / (rr * 1000)) : 0.012;
        const rsa = 1 + depth * Math.sin(2 * Math.PI * this.breathHz * this.beatStart + 0.4);
        this.rrMs = rr * 1000 * rsa * (1 + gauss() * jitter);
        this.nextBeat = this.beatStart + this.rrMs / 1000;
        if (this.onBeat) { try { this.onBeat(Math.round(this.rrMs), this.beatStart); } catch (e) { /* listener error must not stop the trace */ } }
      }
      const resp = 2 * Math.PI * this.breathHz * tt;
      let v = this.beatStart >= 0 ? beatValue((tt - this.beatStart) * 1000, this.rrMs, resp) : 0;
      v += 0.035 * Math.sin(resp);                 // baseline wander (respiration)
      v += gauss() * (this.mini ? 0.006 : 0.008);  // sensor noise
      return v;
    }

    drawSegment(fromX, toX) {
      const ctx = this.ctx, w = this.width, h = this.height, pxPerSec = this.speed * this.mmPx;
      // restore grid in the gap ahead of the sweep head
      const gapStart = Math.floor(toX), gapW = this.gapPx;
      const drawGap = (gx, gw) => { ctx.drawImage(this.gridCanvas, gx * this.dpr, 0, gw * this.dpr, this.gridCanvas.height, gx, 0, gw, h); };
      if (gapStart + gapW <= w) drawGap(gapStart, gapW); else { drawGap(gapStart, w - gapStart); drawGap(0, gapStart + gapW - w); }

      const c = this._colors || this.colors();
      ctx.lineWidth = this.lineWidth; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = c.trace;
      if (!this.mini) { ctx.shadowColor = BL.rgbaFor('aqua', 0.55); ctx.shadowBlur = 6; } else { ctx.shadowBlur = 0; }
      ctx.beginPath();
      const tBase = this.t;
      const x0 = fromX;
      if (this.lastY == null) this.lastY = this.yFor(this.sample(tBase));
      ctx.moveTo(x0, this.lastY);
      let x = Math.floor(fromX) + 1;
      const xEnd = toX;
      const sub = 4; // sub-samples per pixel so the R-peak is never skipped
      for (; x <= xEnd; x += 1) {
        let best = 0, bestAbs = -1;
        for (let i = 1; i <= sub; i++) {
          const tt = tBase + (x - 1 + i / sub - fromX) / pxPerSec;
          const v = this.sample(tt);
          if (Math.abs(v) > bestAbs) { bestAbs = Math.abs(v); best = v; }
        }
        const y = clamp(this.yFor(best), 2, h - 2);
        ctx.lineTo(x, y);
        this.lastY = y;
      }
      // fractional tail to keep continuity
      const tt = tBase + (toX - fromX) / pxPerSec;
      const yEnd = clamp(this.yFor(this.sample(tt)), 2, h - 2);
      ctx.lineTo(toX, yEnd); this.lastY = yEnd;
      ctx.stroke();
      ctx.shadowBlur = 0;
      this.t = tt;
    }

    /** Static strip (saved sessions / previews) */
    static drawStatic(canvas, opts) {
      opts = opts || {};
      const hr = opts.hr || 72, mmPx = opts.mmPx || 2.2, gain = 10;
      const host = canvas.parentElement || canvas;
      const w = host.clientWidth || 300, h = host.clientHeight || 44;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const theme = document.documentElement.dataset.theme === 'light';
      ctx.fillStyle = theme ? '#F7FBFB' : '#040A0B'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = BL.rgbaFor('aqua', theme ? 0.18 : 0.09); ctx.lineWidth = 1; ctx.beginPath();
      for (let gx = 0.5; gx < w; gx += mmPx * 5) { ctx.moveTo(gx, 0); ctx.lineTo(gx, h); }
      for (let gy = 0.5; gy < h; gy += mmPx * 5) { ctx.moveTo(0, gy); ctx.lineTo(w, gy); }
      ctx.stroke();
      const pxPerSec = 25 * mmPx, rr = 60000 / hr, baseY = h * 0.64;
      ctx.strokeStyle = BL.colorFor('aqua'); ctx.lineWidth = 1.4; ctx.beginPath();
      const rnd = BL.seeded(opts.seed || 7);
      for (let x = 0; x <= w; x++) {
        const tMs = (x / pxPerSec) * 1000;
        const beatT = tMs % rr;
        const v = beatValue(beatT, rr, 0) + (rnd() - 0.5) * 0.01;
        const y = clamp(baseY - v * gain * mmPx, 1, h - 1);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  BL.ECGRenderer = ECGRenderer;
  BL.ecgBeatValue = beatValue;
})(window.BL = window.BL || {});
