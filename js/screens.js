/* ==========================================================================
   BIOTEX LIFE — screens.js
   Per-screen controllers. Each exposes init() (once) and optional
   enter()/leave() hooks wired by App through NavigationManager.
   ========================================================================== */
(function (BL) {
  'use strict';
  const { $, $$, el, icon, escapeHtml, on, clamp, round } = BL;
  const UI = () => BL.UI;
  const A = () => BL.app; // { sim, device, notif, activity, nav, ecgMini, ecgMain }
  const S = {};
  const CM = () => BL.ChartManager;
  const dayLabels = () => { const out = []; const d = new Date(); for (let i = 6; i >= 0; i--) { const x = new Date(d); x.setDate(d.getDate() - i); out.push(BL.DAYS_SHORT[x.getDay()]); } return out; };
  const weekSeries = (arr, live) => arr.concat([live]);

  /* =====================================================================
     SPLASH
     ===================================================================== */
  S.splash = {
    init() {
      this.canvas = $('#splash-particles'); this.ctx = this.canvas.getContext('2d'); this.running = false;
      this.particles = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.6, s: 0.02 + Math.random() * 0.05, a: 0.15 + Math.random() * 0.45, p: Math.random() * Math.PI * 2 }));
    },
    enter() {
      const c = this.canvas, ctx = this.ctx; this.running = true;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const resize = () => { c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
      resize(); this.onResize = resize; window.addEventListener('resize', resize);
      let last = performance.now();
      const loop = (now) => {
        if (!this.running) return;
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        const w = c.clientWidth, h = c.clientHeight;
        ctx.clearRect(0, 0, w, h);
        /* sensor grid */
        ctx.strokeStyle = 'rgba(62,226,212,0.045)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let x = (now / 90) % 48; x < w; x += 48) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
        for (let y = 0; y < h; y += 48) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
        ctx.stroke();
        this.particles.forEach((p) => {
          p.y -= p.s * dt; p.p += dt; if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
          const x = p.x * w + Math.sin(p.p) * 6, y = p.y * h;
          ctx.fillStyle = `rgba(62,226,212,${p.a * (0.6 + 0.4 * Math.sin(p.p * 2))})`;
          ctx.beginPath(); ctx.arc(x, y, p.r, 0, Math.PI * 2); ctx.fill();
        });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        const done = BL.storage.get('onboardingComplete', false);
        const target = A().initialTarget;
        A().nav.go(done ? (target || (A().device.connected ? 'home' : 'connect')) : 'onboarding', { replace: true });
      }, BL.prefersReducedMotion() ? 900 : 2700);
    },
    leave() { this.running = false; window.removeEventListener('resize', this.onResize); },
  };

  /* =====================================================================
     ONBOARDING
     ===================================================================== */
  S.onboarding = {
    init() {
      this.index = 0; this.slides = $$('.onb__slide'); this.dots = $$('#onb-dots span');
      on($('[data-screen="onboarding"]'), 'click', '[data-onb]', (e, b) => {
        const a = b.dataset.onb;
        if (a === 'skip') this.finish();
        else if (a === 'back') this.show(this.index - 1);
        else if (a === 'next') { if (this.index === this.slides.length - 1) this.finish(); else this.show(this.index + 1); }
      });
      let sx = 0; const track = $('#onb-track');
      track.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
      track.addEventListener('touchend', (e) => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) this.show(this.index + (dx < 0 ? 1 : -1)); }, { passive: true });
      document.addEventListener('keydown', (e) => { if (A().nav.current !== 'onboarding') return; if (e.key === 'ArrowRight') this.show(this.index + 1); if (e.key === 'ArrowLeft') this.show(this.index - 1); });
    },
    enter() { this.show(0); },
    show(i) {
      i = clamp(i, 0, this.slides.length - 1); this.index = i;
      this.slides.forEach((s, k) => s.classList.toggle('is-active', k === i));
      this.dots.forEach((d, k) => d.classList.toggle('is-active', k === i));
      $('[data-onb="back"]').style.visibility = i === 0 ? 'hidden' : 'visible';
      $('[data-onb="next"]').textContent = i === this.slides.length - 1 ? 'Get Started' : 'Next';
      if (i === 1) { ['onb-bb', 'onb-rec', 'onb-fat', 'onb-hrv', 'onb-str', 'onb-tl'].forEach((k, n) => { const r = UI().rings[k]; if (!r) return; r.set(0); setTimeout(() => r.set(parseFloat(r.el.dataset.value)), 80 + n * 90); }); }
      BL.vibrate(8);
    },
    finish() { BL.storage.set('onboardingComplete', true); A().nav.go(A().device.connected ? 'home' : 'connect', { replace: true }); },
  };

  /* =====================================================================
     CONNECT
     ===================================================================== */
  S.connect = {
    init() {
      this.stage = $('#connect-stage'); this.actions = $('#connect-actions'); this.status = $('#connect-status-text'); this.dot = $('#connect-dot'); this.info = $('#connect-info'); this.cont = $('#connect-continue');
      A().device.on('change', () => this.render());
      A().device.on('find', () => { if (A().nav.current === 'connect') { this.stage.classList.add('is-finding'); setTimeout(() => this.stage.classList.remove('is-finding'), 3200); } });
      this.render();
    },
    enter() { this.render(); UI().renderSensorList($('[data-sensor-list="connect"]'), A().device.sensors, A().device.connected); },
    render() {
      const d = A().device, st = d.state;
      this.stage.dataset.state = st === 'disconnected' ? (d.everConnected ? 'disconnected' : 'idle') : st;
      this.status.textContent = { connected: 'Connected', searching: 'Searching for jacket...', connecting: 'Connecting...', disconnected: d.everConnected ? 'Jacket disconnected' : 'Ready to pair' }[st];
      this.dot.className = 'status-dot ' + ({ connected: 'status-dot--live', searching: 'status-dot--searching', connecting: 'status-dot--searching', disconnected: 'status-dot--off' }[st]);
      let html = '';
      if (st === 'disconnected') html = `<button class="btn btn--primary btn--lg btn--block" data-device="search">${icon('search')}Search for Jacket</button>`;
      else if (st === 'searching' || st === 'connecting') html = `<button class="btn btn--secondary btn--lg btn--block" disabled>${icon('bluetooth')}${st === 'searching' ? 'Searching…' : 'Pairing…'}</button><button class="btn btn--ghost btn--lg" data-device="disconnect">Cancel</button>`;
      else html = `<button class="btn btn--secondary btn--lg btn--block" data-device="disconnect">${icon('bluetooth')}Disconnect</button><button class="btn btn--ghost btn--lg" data-device="reconnect">${icon('refresh')}Reconnect</button>`;
      this.actions.innerHTML = html;
      this.info.hidden = st !== 'connected';
      this.cont.innerHTML = (st === 'connected' ? 'Continue to Dashboard' : 'Continue without jacket') + icon('chevron-right');
      this.cont.className = 'btn btn--block btn--lg ' + (st === 'connected' ? 'btn--primary' : 'btn--secondary');
      UI().renderSensorList($('[data-sensor-list="connect"]'), d.sensors, d.connected);
    },
  };

  /* =====================================================================
     HOME
     ===================================================================== */
  S.home = {
    init() {
      this.screen = $('[data-screen="home"]');
      this.hrSpark = $$('[data-spark="hr"]'); this.tempSpark = $$('[data-spark="temp"]');
      UI().renderInsights($('[data-insights-mini]'), BL.data.INSIGHTS, true);
      // keyboard activation for role=button cards
      on(document, 'keydown', '[role="button"][data-go]', (e, t) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); A().nav.go(t.dataset.go); } });
    },
    enter() {
      if (A().ecgMini && A().device.connected && BL.settings.get('alwaysOnEcg')) { A().ecgMini.reset(); A().ecgMini.start(); }
      this.drawSparks();
      UI().countScreen(this.screen);
      if (!this.map) {
        const route = A().activity.route;
        const pts = route.slice(0, Math.round(route.length * 0.62));
        this.map = BL.MapController.create('home', $('#map-home'), { static: true, attribution: false, fitPadding: [12, 12] });
        if (this.map) { this.map.setRoute(pts); this.map.setProgress(pts, pts[pts.length - 1], { follow: false }); }
      } else { setTimeout(() => this.map.invalidate(), 60); }
      CM().replayAll(this.screen);
    },
    leave() { if (A().ecgMini) A().ecgMini.stop(); },
    tick(vm) {
      if (A().nav.current !== 'home' && A().nav.current !== 'heart') return;
      this.drawSparks();
    },
    drawSparks() {
      const sim = A().sim;
      this.hrSpark.forEach((c) => { if (c.closest('.screen.is-active')) BL.ChartManager.sparkline(c, sim.hrHistory.slice(-40), { color: 'red' }); });
      this.tempSpark.forEach((c) => { if (c.closest('.screen.is-active')) BL.ChartManager.sparkline(c, sim.tempHistory.slice(0, new Date().getHours() + 1), { color: 'aqua', endDot: false, lineWidth: 1.4 }); });
    },
  };

  /* =====================================================================
     ECG MONITOR + HISTORY
     ===================================================================== */
  S.ecg = {
    init() {
      this.screen = $('[data-screen="ecg"]');
      this.controls = $('[data-ecg-controls]');
      this.state = 'idle'; this.elapsed = 0; this.samples = []; this.timer = null; this.lastTs = 0;
      const saved = BL.storage.get('ecgSessions', null);
      this.sessions = Array.isArray(saved) ? saved : BL.data.SEED_ECG.slice();
      if (!Array.isArray(saved)) this.persist();
      on(document, 'click', '[data-ecg-action]', (e, b) => this.action(b.dataset.ecgAction));
      on(document, 'click', '[data-ecg-session]', (e, b) => { const art = b.closest('[data-session]'); this.sessionAction(b.dataset.ecgSession, art.dataset.session); });
      this.renderHistory();
    },
    enter() { if (A().ecgMain && A().device.connected) { A().ecgMain.reset(); A().ecgMain.start(); } UI().countScreen(this.screen); this.renderHistory(); },
    leave() { if (A().ecgMain) A().ecgMain.stop(); },
    persist() { BL.storage.set('ecgSessions', this.sessions.slice(0, 40)); },
    get recording() { return this.state === 'recording'; },
    action(a) {
      if (!A().device.connected && a === 'start') { BL.toast('Connect the jacket to record an ECG', 'warn'); A().nav.go('device'); return; }
      if (a === 'start') { this.state = 'recording'; this.elapsed = 0; this.samples = []; this.lastTs = performance.now(); clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 250); BL.toast('ECG recording started', { type: 'info', icon: 'ecg' }); }
      else if (a === 'pause') { this.state = 'paused'; }
      else if (a === 'resume') { this.state = 'recording'; this.lastTs = performance.now(); }
      else if (a === 'save') { this.save(); }
      else if (a === 'stop') {
        if (this.elapsed > 8) { UI().confirm('Discard recording?', 'The current ECG recording has not been saved.', { confirmLabel: 'Discard', danger: true }).then((ok) => { if (ok) this.stop(); }); }
        else this.stop();
      }
      BL.vibrate(10);
      this.renderControls();
    },
    tick() {
      if (this.state !== 'recording') return;
      const now = performance.now(); this.elapsed += (now - this.lastTs) / 1000; this.lastTs = now;
      if (!this.samples.length || now - this.samples[this.samples.length - 1].at > 950) this.samples.push({ at: now, hr: A().sim.state.hr });
      if (A().device.connected && A().device.battery <= 1) { BL.toast('Jacket battery depleted — recording paused', 'warn'); this.state = 'paused'; this.renderControls(); }
    },
    stats() {
      const hrs = this.samples.map((s) => s.hr);
      if (!hrs.length) return { avg: 71, min: 64, max: 84 };
      return { avg: Math.round(BL.avg(hrs)), min: Math.min.apply(null, hrs), max: Math.max.apply(null, hrs) };
    },
    stop() { this.state = 'idle'; clearInterval(this.timer); this.elapsed = 0; this.samples = []; this.renderControls(); },
    save() {
      const st = this.stats();
      const session = { id: BL.uid(), name: `ECG session · ${BL.fmtTime(Date.now())}`, date: Date.now(), durationSec: Math.max(1, Math.round(this.elapsed)), avgHr: st.avg, minHr: st.min, maxHr: st.max, quality: A().device.signal, noise: A().device.noise };
      this.sessions.unshift(session); this.persist();
      this.state = 'idle'; clearInterval(this.timer); this.elapsed = 0; this.samples = [];
      this.renderControls(); this.renderHistory();
      BL.toast('ECG session saved', 'success');
      A().notif.add({ kind: 'ecg', title: 'ECG session saved', body: `${BL.fmtDurationHuman(session.durationSec)} · average ${session.avgHr} BPM · signal ${session.quality}`, icon: 'ecg', color: 'aqua', screen: 'ecg', read: true });
    },
    renderControls() { this.controls.dataset.state = this.state; },
    vm() {
      const st = this.stats();
      return { ecgTimer: BL.fmtTimer(this.elapsed), ecgRecording: this.state === 'recording', ecgStateText: this.state === 'recording' ? 'Recording · Lead II' : this.state === 'paused' ? 'Paused' : 'Ready to record', ecgAvg: this.state === 'idle' ? 71 : st.avg, ecgMin: this.state === 'idle' ? 64 : st.min, ecgMaxHr: this.state === 'idle' ? 84 : st.max, ecgCount: this.sessions.length };
    },
    renderHistory() { $$('[data-ecg-history]').forEach((c) => UI().renderEcgHistory(c, this.sessions.slice().sort((a, b) => b.date - a.date))); },
    sessionAction(a, id) {
      const s = this.sessions.find((x) => x.id === id); if (!s) return;
      if (a === 'view') {
        const body = el('div');
        body.innerHTML = `<div class="ecg-session__strip" style="height:70px;margin-bottom:12px"><canvas data-strip="${s.avgHr}"></canvas></div><div class="kv-list"><div><span>Recorded</span><b>${BL.fmtDateTime(s.date)}</b></div><div><span>Duration</span><b>${BL.fmtDurationHuman(s.durationSec)}</b></div><div><span>Average HR</span><b>${s.avgHr} BPM</b></div><div><span>Minimum</span><b>${s.minHr} BPM</b></div><div><span>Maximum</span><b>${s.maxHr} BPM</b></div><div><span>Signal quality</span><b>${escapeHtml(s.quality)}</b></div><div><span>Noise</span><b>${escapeHtml(s.noise)}</b></div><div><span>Paper speed</span><b>25 mm/s · 10 mm/mV</b></div></div>`;
        UI().modal({ title: s.name, body, actions: [{ label: 'Export CSV', cls: 'btn--secondary', onClick: () => { this.exportSession(s); return false; } }, { label: 'Close', cls: 'btn--primary' }] });
        requestAnimationFrame(() => BL.ECGRenderer.drawStatic(body.querySelector('canvas'), { hr: s.avgHr, mmPx: 3, seed: 3 }));
      } else if (a === 'rename') {
        UI().prompt('Rename session', { label: 'Session name', value: s.name }).then((v) => { if (v && v.trim()) { s.name = v.trim(); this.persist(); this.renderHistory(); BL.toast('Session renamed', 'success'); } });
      } else if (a === 'delete') {
        UI().confirm('Delete ECG session?', 'This removes the saved session from this device.', { confirmLabel: 'Delete', danger: true }).then((ok) => { if (ok) { this.sessions = this.sessions.filter((x) => x.id !== id); this.persist(); this.renderHistory(); BL.toast('Session deleted', 'info'); } });
      } else if (a === 'export') this.exportSession(s);
    },
    exportSession(s) {
      const rows = [['Field', 'Value'], ['Session', s.name], ['Recorded', new Date(s.date).toISOString()], ['Duration (s)', s.durationSec], ['Average HR', s.avgHr], ['Min HR', s.minHr], ['Max HR', s.maxHr], ['Signal quality', s.quality], ['Noise', s.noise], ['Sampling (demo waveform)', '250 Hz, 10 s excerpt'], [], ['t (s)', 'mV']];
      const rr = 60000 / s.avgHr;
      for (let i = 0; i < 2500; i++) { const tMs = i * 4; rows.push([(tMs / 1000).toFixed(3), BL.ecgBeatValue(tMs % rr, rr, 0).toFixed(4)]); }
      BL.downloadFile(`biotex-ecg-${new Date(s.date).toISOString().slice(0, 10)}-${s.id}.csv`, BL.toCSV(rows), 'text/csv');
      BL.toast('ECG CSV exported', 'success');
    },
    exportAll() {
      const rows = [['id', 'name', 'date', 'duration_s', 'avg_hr', 'min_hr', 'max_hr', 'quality', 'noise']];
      this.sessions.forEach((s) => rows.push([s.id, s.name, new Date(s.date).toISOString(), s.durationSec, s.avgHr, s.minHr, s.maxHr, s.quality, s.noise]));
      BL.downloadFile('biotex-ecg-sessions.csv', BL.toCSV(rows), 'text/csv');
      BL.toast('ECG history exported', 'success');
    },
    reset() { this.sessions = BL.data.SEED_ECG.slice(); this.persist(); this.renderHistory(); },
  };

  /* =====================================================================
     ACTIVITY HUB + SELECTION SHEET
     ===================================================================== */
  S.activity = {
    init() {
      this.screen = $('[data-screen="activity"]');
      UI().renderActivityTypes($('[data-activity-types]'), null, (id) => this.openSheet(id));
      A().activity.on('history', () => this.renderRecent());
      this.renderRecent();
    },
    enter() { this.renderRecent(); this.renderWeek(true); },
    renderRecent() { UI().renderHistory($('[data-history-list="recent"]'), A().activity.getHistory(), { limit: 3 }); },
    renderWeek(animate) {
      const live = round(A().sim.state.distanceKm, 1);
      const data = weekSeries(BL.data.WEEK.distance, live);
      const cfg = { type: 'bar', data: data.map((v) => round(parseFloat(BL.fmt.distance(v, 1)), 1)), labels: dayLabels(), color: 'aqua', highlightIndex: 6, unit: BL.fmt.distUnit(), yAxis: false, formatValue: (v) => (v === 0 ? 'Rest' : v.toFixed(1)) };
      if (CM().get('weekDistance')) CM().update('weekDistance', cfg, animate); else CM().create('weekDistance', $('[data-chart="weekDistance"]'), cfg);
    },
    openSheet(preselect) {
      let selected = preselect || 'walk';
      const body = el('div');
      body.innerHTML = `<p class="text-muted small" style="margin-bottom:12px">Choose an activity. Live ECG, GPS route and body response are recorded together.</p><div class="activity-types" data-sheet-types></div>`;
      UI().renderActivityTypes(body.querySelector('[data-sheet-types]'), selected, (id) => { selected = id; startBtn.innerHTML = `${icon('play')}Start ${BL.data.activityType(id).label}`; });
      const startBtn = el('button', { class: 'btn btn--cta btn--block', html: `${icon('play')}Start ${BL.data.activityType(selected).label}` });
      startBtn.addEventListener('click', () => { UI().closeSheet(); this.start(selected); });
      UI().sheet({ title: 'Start Activity', body, footer: startBtn });
    },
    start(typeId) {
      if (!A().device.connected) {
        UI().confirm('Jacket not connected', 'Start without live ECG and sensor data? GPS tracking will continue.', { confirmLabel: 'Start anyway' }).then((ok) => { if (ok) this.begin(typeId); else A().nav.go('device'); });
        return;
      }
      this.begin(typeId);
    },
    begin(typeId) {
      A().activity.start(typeId);
      BL.vibrate([10, 40, 10]);
      A().nav.go('activity-live');
      BL.toast(`${BL.data.activityName(typeId)} started`, { type: 'success', icon: 'play' });
    },
  };

  /* =====================================================================
     LIVE ACTIVITY
     ===================================================================== */
  S.live = {
    init() {
      this.screen = $('[data-screen="activity-live"]'); this.controls = $('[data-act-controls]'); this.lockBar = $('[data-act-lock]');
      on(this.screen, 'click', '[data-act]', (e, b) => this.action(b.dataset.act));
      const act = A().activity;
      act.on('state', (st) => { this.controls.dataset.state = st; });
      act.on('lock', (locked) => { this.screen.querySelector('.live').classList.toggle('is-locked', locked); this.lockBar.hidden = !locked; });
      act.on('tick', (s) => { if (this.map && (A().nav.current === 'activity-live')) this.map.setProgress(s.path, s.position); });
      act.on('start', () => { if (this.map) this.map.clearProgress(); });
      // hold-to-unlock
      let holdTimer = null;
      on(this.screen, 'pointerdown', '[data-act="unlock"]', (e, b) => { b.textContent = 'Keep holding…'; holdTimer = setTimeout(() => { act.toggleLock(false); b.textContent = 'Hold to unlock'; BL.vibrate(20); }, 700); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => on(this.screen, t, '[data-act="unlock"]', (e, b) => { clearTimeout(holdTimer); b.textContent = 'Hold to unlock'; }));
    },
    enter() {
      const act = A().activity;
      if (!act.isRunning()) { A().nav.go('activity', { replace: true }); return; }
      if (!this.map) { this.map = BL.MapController.create('live', $('#map-live'), { fitPadding: [24, 24], followZoom: 15.75 }); if (this.map) this.map.setRoute(act.route); }
      else setTimeout(() => this.map.invalidate(), 80);
      if (this.map) { this.map.follow = true; this.map.setProgress(act.session.path, act.session.position); }
      this.controls.dataset.state = act.state;
    },
    action(a) {
      const act = A().activity;
      if (a === 'pause') { act.pause(); BL.toast('Activity paused', { type: 'info', icon: 'pause' }); }
      else if (a === 'resume') { act.resume(); BL.toast('Activity resumed', { type: 'success', icon: 'play' }); }
      else if (a === 'lock') act.toggleLock(true);
      else if (a === 'finish') {
        UI().confirm('Finish activity?', 'Your session summary will be generated from the recorded data.', { confirmLabel: 'Finish' }).then((ok) => {
          if (!ok) return;
          const summary = act.finish();
          if (summary) { S.summary.show(summary); A().nav.go('activity-summary', { replace: true }); }
        });
      }
      BL.vibrate(10);
    },
  };

  /* =====================================================================
     FULL MAP
     ===================================================================== */
  S.map = {
    init() {
      this.screen = $('[data-screen="map"]');
      on(this.screen, 'click', '[data-map-ctl]', (e, b) => this.ctl(b.dataset.mapCtl, b));
      A().activity.on('tick', (s) => { if (this.map && A().nav.current === 'map') this.map.setProgress(s.path, s.position); });
      A().activity.on('start', () => { if (this.map) this.map.clearProgress(); });
    },
    enter() {
      const act = A().activity;
      if (!this.map) { this.map = BL.MapController.create('full', $('#map-full'), { fitPadding: [40, 40], followZoom: 16 }); if (this.map) this.map.setRoute(act.route); }
      else setTimeout(() => this.map.invalidate(), 80);
      if (!this.map) return;
      if (act.isRunning()) { this.map.follow = true; this.map.setProgress(act.session.path, act.session.position); }
      else { const pts = act.route.slice(0, Math.round(act.route.length * 0.62)); this.map.setProgress(pts, pts[pts.length - 1], { follow: false }); this.map.fitRoute(); }
    },
    ctl(a, btn) {
      if (!this.map) return;
      if (a === 'recenter') this.map.recenter();
      else if (a === 'zoom-in') this.map.zoomIn();
      else if (a === 'zoom-out') this.map.zoomOut();
      else if (a === 'overview') this.map.overview();
      else if (a === 'layers') {
        const existing = $('.map-layers', this.screen); if (existing) { existing.remove(); return; }
        const menu = el('div', { class: 'map-layers', role: 'menu' });
        Object.keys(BL.MapController.TILES).forEach((k) => { const b = el('button', { role: 'menuitem', class: this.map.layerName === k ? 'is-active' : '', text: BL.MapController.TILES[k].label }); b.addEventListener('click', () => { BL.MapController.setLayerAll(k); menu.remove(); }); menu.append(b); });
        this.screen.querySelector('.fullmap').append(menu);
        setTimeout(() => document.addEventListener('click', function off(e) { if (!menu.contains(e.target) && e.target !== btn) { menu.remove(); document.removeEventListener('click', off); } }), 0);
      }
      BL.vibrate(6);
    },
  };

  /* =====================================================================
     ACTIVITY SUMMARY
     ===================================================================== */
  S.summary = {
    init() {
      this.screen = $('[data-screen="activity-summary"]'); this.current = null;
      on(this.screen, 'click', '[data-sum]', (e, b) => this.action(b.dataset.sum));
    },
    show(summary) {
      this.current = summary; const a = summary, f = BL.fmt, t = BL.data.activityType(a.type);
      const set = (k, v) => $$(`[data-sum-field="${k}"]`, this.screen).forEach((n) => { n.textContent = v; });
      set('typeLabel', t.label.toUpperCase()); set('name', a.name); set('dateText', `${BL.fmtRelativeDay(a.date)} · ${BL.fmtTime(a.date)} · ${a.route || 'Hyderabad'}`);
      set('distance', f.distance(a.distanceKm)); set('duration', BL.fmtClock(a.durationSec)); set('avgPace', a.avgPace ? f.pace(a.avgPace, false) + '/' + f.distUnit() : '—');
      set('calories', a.calories); set('avgHr', a.avgHr); set('maxHr', a.maxHr); set('elevation', a.elevation); set('steps', BL.fmtNumber(a.steps)); set('avgTemp', f.tempWithUnit(a.avgTemp)); set('load', a.load);
      const fd = $('[data-sum-field="fatigueDelta"]', this.screen); fd.textContent = (a.fatigueDelta >= 0 ? '+' : '−') + Math.abs(a.fatigueDelta); fd.className = a.fatigueDelta > 0 ? 'c-orange' : 'c-green';
      const bd = $('[data-sum-field="bbDelta"]', this.screen); bd.textContent = (a.bbDelta >= 0 ? '+' : '−') + Math.abs(a.bbDelta); bd.className = a.bbDelta < 0 ? 'c-aqua' : 'c-green';
      $('[data-sum="save"]', this.screen).innerHTML = a.saved ? `${icon('check-circle')}Saved to history` : `${icon('check')}Save Activity`;
      $('[data-sum="save"]', this.screen).disabled = !!a.saved;
      $('[data-sum="delete"]', this.screen).innerHTML = `${icon('trash')}${a.saved ? 'Delete' : 'Discard'}`;
      $('h1.screen-title', this.screen).textContent = a.saved ? 'ACTIVITY' : 'ACTIVITY COMPLETE';
      this.pendingRender = true;
    },
    enter() {
      if (!this.current) { const last = A().activity.getHistory()[0]; if (last) this.show(last); else { A().nav.go('activity', { replace: true }); return; } }
      const a = this.current, samples = a.samples && a.samples.length > 3 ? a.samples : BL.ActivityTracker.syntheticSamples(a);
      const labels = samples.map((s) => BL.fmtClock(s.t));
      const base = { labels, labelEvery: Math.ceil(samples.length / 5), tooltipLabels: labels };
      const mk = (key, series, extra) => { const cfg = Object.assign({ type: 'line', series: [series] }, base, extra || {}); if (CM().get(key)) CM().update(key, cfg, true); else CM().create(key, $(`[data-chart="${key}"]`, this.screen), cfg); };
      mk('sumHr', { data: samples.map((s) => s.hr), color: 'red' }, { unit: 'bpm' });
      mk('sumPace', { data: samples.map((s) => (s.pace ? round(s.pace / 60, 2) : null)), color: 'blue' }, { unit: 'min/km', formatY: (v) => v.toFixed(1), formatValue: (v) => (v == null ? '—' : BL.fmt.pace(v * 60)) });
      mk('sumElev', { data: samples.map((s) => s.elev), color: 'green' }, { unit: 'm' });
      mk('sumTemp', { data: samples.map((s) => parseFloat(BL.fmt.temp(s.temp))), color: 'orange' }, { unit: BL.fmt.tempUnit(), formatY: (v) => v.toFixed(1), formatValue: (v) => v.toFixed(2) });
      mk('sumFatigue', { data: samples.map((s) => s.fatigue), color: 'purple' }, { unit: '/100', yMin: 0, yMax: 100 });
      UI().renderZones($('[data-zones="summary"]', this.screen), a.zones || [0, 0, 0, 0, 0]);
      const path = a.path && a.path.length > 1 ? a.path : A().activity.route.slice(0, Math.round(A().activity.route.length * Math.min(1, a.distanceKm / 10.1)));
      if (this.map) BL.MapController.destroy('summary');
      $('#map-summary').innerHTML = '<div class="map-skeleton"><span></span>Loading route…</div>';
      this.map = BL.MapController.create('summary', $('#map-summary'), { static: false, fitPadding: [30, 30] });
      if (this.map && path.length > 1) { this.map.setRoute(path, { fit: true }); this.map.setProgress(path, null); this.map.follow = false; setTimeout(() => { this.map.invalidate(); this.map.fitRoute(path); }, 120); }
      UI().countScreen(this.screen);
    },
    action(a) {
      const cur = this.current; if (!cur) return;
      if (a === 'save') { A().activity.save(cur); this.show(cur); BL.toast('Activity saved to history', 'success'); A().notif.add({ kind: 'activity', title: `${cur.name} saved`, body: `${BL.fmt.distance(cur.distanceKm)} ${BL.fmt.distUnit()} · ${BL.fmtClock(cur.durationSec)} · ${cur.avgHr} avg BPM`, icon: 'walk', color: 'blue', screen: 'history', read: true }); }
      else if (a === 'share') this.share(cur);
      else if (a === 'export') { BL.downloadFile(`biotex-activity-${new Date(cur.date).toISOString().slice(0, 10)}.csv`, BL.ActivityTracker.toCSV(cur), 'text/csv'); BL.toast('Activity CSV exported', 'success'); }
      else if (a === 'delete') {
        UI().confirm(cur.saved ? 'Delete activity?' : 'Discard activity?', cur.saved ? 'This removes the activity from your history.' : 'The recorded session will be discarded.', { confirmLabel: cur.saved ? 'Delete' : 'Discard', danger: true }).then((ok) => {
          if (!ok) return;
          if (cur.saved) A().activity.deleteActivity(cur.id); else A().activity.discard();
          this.current = null; BL.toast(cur.saved ? 'Activity deleted' : 'Activity discarded', 'info'); A().nav.go('home', { tab: true });
        });
      }
    },
    async share(a) {
      const text = BL.ActivityTracker.shareText(a);
      if (navigator.share) { try { await navigator.share({ title: `${a.name} — Biotex Life`, text }); BL.toast('Shared', 'success'); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
      const ok = await BL.copyText(text);
      BL.toast(ok ? 'Summary copied to clipboard' : 'Sharing unavailable in this browser', ok ? 'success' : 'warn');
    },
  };

  /* =====================================================================
     DETAIL SCREENS (Body Battery, Fatigue, Recovery, Heart, Temperature, Sleep)
     ===================================================================== */
  S.bodyBattery = {
    init() { this.screen = $('[data-screen="body-battery"]'); UI().renderTimeline($('[data-timeline="bb"]'), BL.data.BB_EVENTS); },
    enter() {
      const hour = new Date().getHours(), data = BL.data.BB_24.slice(); data[hour] = A().sim.state.bodyBattery;
      const cfg = { type: 'line', series: [{ data, color: 'aqua', dashedFrom: hour, endDot: false }], labels: BL.data.HOUR_LABELS, labelEvery: 1, tooltipLabels: BL.data.HOUR_LABELS.map((_, i) => `${i % 12 || 12} ${i < 12 ? 'AM' : 'PM'}`), yMin: 0, yMax: 100, unit: '/100', markers: BL.data.BB_EVENTS.map((e) => ({ index: e.hour, label: e.label, color: e.color === 'muted' ? 'blue' : e.color })) };
      if (CM().get('bb24')) CM().update('bb24', cfg, true); else CM().create('bb24', $('[data-chart="bb24"]'), cfg);
      UI().countScreen(this.screen);
    },
  };
  S.fatigue = {
    init() { this.screen = $('[data-screen="fatigue"]'); },
    enter() {
      const cfg = { type: 'line', series: [{ data: weekSeries(BL.data.WEEK.fatigue, A().sim.state.fatigue), color: 'orange', dots: true, endDot: true }], labels: dayLabels(), yMin: 0, yMax: 100, unit: '/100' };
      if (CM().get('fatigue7')) CM().update('fatigue7', cfg, true); else CM().create('fatigue7', $('[data-chart="fatigue7"]'), cfg);
      const arc = UI().arcs.fatigueDetail; if (arc) { arc.set(0); setTimeout(() => arc.set(A().sim.state.fatigue, String(A().sim.state.fatigue)), 60); }
      UI().countScreen(this.screen);
    },
  };
  S.recovery = {
    init() { this.screen = $('[data-screen="recovery"]'); },
    enter() {
      const data = weekSeries(BL.data.WEEK.recovery, A().sim.state.recovery);
      const cfg = { type: 'bar', data, labels: dayLabels(), colors: data.map((v) => (v >= 85 ? 'green' : v >= 70 ? 'aqua' : v >= 50 ? 'orange' : 'red')), highlightIndex: 6, yMin: 0, yMax: 100, unit: '%', formatValue: (v) => `${v}%` };
      if (CM().get('recovery7')) CM().update('recovery7', cfg, true); else CM().create('recovery7', $('[data-chart="recovery7"]'), cfg);
      const ring = UI().rings.recDetail; if (ring) { ring.set(0); setTimeout(() => ring.set(A().sim.state.recovery, A().sim.state.recovery + '%'), 60); }
      UI().countScreen(this.screen);
    },
  };
  S.heart = {
    init() { this.screen = $('[data-screen="heart"]'); },
    enter() {
      const hour = new Date().getHours(), data = BL.data.HR_24.slice(); data[hour] = A().sim.state.hr;
      const hourNames = BL.data.HOUR_LABELS.map((_, i) => `${i % 12 || 12} ${i < 12 ? 'AM' : 'PM'}`);
      const mk = (key, cfg) => { if (CM().get(key)) CM().update(key, cfg, true); else CM().create(key, $(`[data-chart="${key}"]`, this.screen), cfg); };
      mk('hr24', { type: 'line', series: [{ data, color: 'red', dashedFrom: hour }], labels: BL.data.HOUR_LABELS, labelEvery: 1, tooltipLabels: hourNames, unit: 'bpm', yMin: 40 });
      mk('rhr7', { type: 'line', series: [{ data: weekSeries(BL.data.WEEK.restingHr, A().sim.state.restingHr), color: 'blue', dots: true, endDot: true }], labels: dayLabels(), unit: 'bpm', yMin: 50, yMax: 72 });
      mk('hrv7', { type: 'line', series: [{ data: weekSeries(BL.data.WEEK.hrv, A().sim.state.hrv), color: 'aqua', dots: true, endDot: true }], labels: dayLabels(), unit: 'ms', yMin: 30, yMax: 70 });
      const last = A().activity.getHistory()[0];
      if (last) { const samples = last.samples && last.samples.length > 3 ? last.samples : BL.ActivityTracker.syntheticSamples(last); const labels = samples.map((s) => BL.fmtClock(s.t)); mk('lastActHr', { type: 'line', series: [{ data: samples.map((s) => s.hr), color: 'orange' }], labels, labelEvery: Math.ceil(samples.length / 5), unit: 'bpm' }); $('[data-bind="lastActivityName"]').textContent = last.name; }
      UI().renderZones($('[data-zones="today"]'), BL.data.ZONE_MINUTES_TODAY);
      S.ecg.renderHistory();
      S.home.drawSparks();
      UI().countScreen(this.screen);
    },
  };
  S.temperature = {
    init() { this.screen = $('[data-screen="temperature"]'); },
    enter() {
      const hour = new Date().getHours(), raw = A().sim.tempHistory.slice(); raw[hour] = A().sim.state.temp;
      const data = raw.map((v) => parseFloat(BL.fmt.temp(v, 2)));
      const hourNames = BL.data.HOUR_LABELS.map((_, i) => `${i % 12 || 12} ${i < 12 ? 'AM' : 'PM'}`);
      const f = (c) => parseFloat(BL.fmt.temp(c, 2));
      const cfg = { type: 'line', series: [{ data, color: 'orange', dashedFrom: hour }], labels: BL.data.HOUR_LABELS, labelEvery: 1, tooltipLabels: hourNames, unit: BL.fmt.tempUnit(), band: { from: f(36.4), to: f(36.8), color: 'green' }, yMin: f(35.9), yMax: f(37.6), formatY: (v) => v.toFixed(1), formatValue: (v) => v.toFixed(1) };
      if (CM().get('temp24')) CM().update('temp24', cfg, true); else CM().create('temp24', $('[data-chart="temp24"]'), cfg);
      UI().countScreen(this.screen);
    },
  };
  S.sleep = {
    init() { this.screen = $('[data-screen="sleep"]'); UI().renderHypno($('[data-hypno]'), BL.data.SLEEP.stages, BL.data.SLEEP.inBedMin); },
    enter() {
      UI().renderHypno($('[data-hypno]'), BL.data.SLEEP.stages, BL.data.SLEEP.inBedMin);
      const cfg = { type: 'bar', data: weekSeries(BL.data.WEEK.sleepHours, BL.data.SLEEP_TODAY_HOURS), labels: dayLabels(), color: 'purple', highlightIndex: 6, unit: 'h', formatValue: (v) => `${Math.floor(v)}h ${Math.round((v % 1) * 60)}m` };
      if (CM().get('sleep7')) CM().update('sleep7', cfg, true); else CM().create('sleep7', $('[data-chart="sleep7"]'), cfg);
      const ring = UI().rings.sleepDetail; if (ring) { ring.set(0); setTimeout(() => ring.set(86), 60); }
      UI().countScreen(this.screen);
    },
  };

  /* =====================================================================
     ANALYTICS
     ===================================================================== */
  S.analytics = {
    init() {
      this.screen = $('[data-screen="analytics"]'); this.period = 'day'; this.grid = $('[data-analytics-grid]');
      const tabs = $('[data-tabs="analytics"]');
      on(tabs, 'click', '[data-tab]', (e, b) => this.setPeriod(b.dataset.tab));
      tabs.addEventListener('keydown', (e) => { const order = ['day', 'week', 'month', 'year']; const i = order.indexOf(this.period); if (e.key === 'ArrowRight') this.setPeriod(order[(i + 1) % 4]); if (e.key === 'ArrowLeft') this.setPeriod(order[(i + 3) % 4]); });
    },
    enter() { this.render(true); },
    setPeriod(p) { if (p === this.period) return; this.period = p; const tabs = $$('[data-tabs="analytics"] [role="tab"]'); tabs.forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === p)); const i = ['day', 'week', 'month', 'year'].indexOf(p); $('.tabs__indicator', this.screen).style.transform = `translateX(${i * 100}%)`; this.render(true); BL.vibrate(6); },
    datasets() {
      const s = A().sim.state, p = this.period, f = BL.fmt;
      const hourNames = BL.data.HOUR_LABELS.map((_, i) => `${i % 12 || 12} ${i < 12 ? 'AM' : 'PM'}`);
      const hour = new Date().getHours();
      const dist = (arr) => arr.map((v) => round(parseFloat(f.distance(v, 1)), 1));
      const temp = (arr) => arr.map((v) => parseFloat(f.temp(v, 2)));
      if (p === 'day') {
        const prof = [0, 0, 0, 0, 0, 0, 0.02, 0.1, 0.22, 0.09, 0.06, 0.06, 0.05, 0.05, 0.04, 0.04, 0.04, 0.03, 0.15, 0.03, 0.01, 0.01, 0, 0];
        const stepsH = prof.map((w, i) => (i <= hour ? Math.round(w * s.steps) : null));
        const bb = BL.data.BB_24.slice(); bb[hour] = s.bodyBattery;
        const hr = BL.data.HR_24.slice(); hr[hour] = s.hr;
        const tp = A().sim.tempHistory.slice(); tp[hour] = s.temp;
        const fat = BL.data.HOUR_LABELS.map((_, i) => (i <= hour ? Math.round(26 + (s.fatigue - 26) * (i / Math.max(1, hour)) + Math.sin(i) * 1.5) : null));
        const rec = BL.data.HOUR_LABELS.map((_, i) => (i <= hour ? Math.round(84 - (84 - s.recovery) * (i / Math.max(1, hour))) : null));
        const hrv = BL.data.HOUR_LABELS.map((_, i) => (i <= hour ? Math.round(58 - 6 * Math.sin(i / 4) + (i === hour ? s.hrv - 58 + 6 * Math.sin(i / 4) : 0)) : null));
        const kcalH = prof.map((w, i) => (i <= hour ? Math.round(26 + w * (s.calories - 26 * 24)) : null));
        return { labels: BL.data.HOUR_LABELS, tooltipLabels: hourNames, labelEvery: 1, dashed: hour, items: [
          ['Heart Rate', 'line', hr, 'red', 'bpm', `${s.hr}`, 'now'],
          ['Recovery', 'line', rec, 'green', '%', `${s.recovery}`, 'now'],
          ['Fatigue', 'line', fat, 'orange', '/100', `${s.fatigue}`, 'now'],
          ['Body Battery', 'line', bb, 'aqua', '/100', `${s.bodyBattery}`, 'now'],
          ['Steps', 'bar', stepsH, 'blue', 'steps', BL.fmtNumber(s.steps), 'today'],
          ['Distance', 'bar', prof.map((w, i) => (i <= hour ? round(parseFloat(f.distance(w * s.distanceKm, 2)), 2) : null)), 'aqua', f.distUnit(), f.distance(s.distanceKm, 1), 'today'],
          ['Calories', 'bar', kcalH, 'orange', 'kcal', `${s.calories}`, 'today'],
          ['Temperature', 'line', temp(tp), 'orange', f.tempUnit(), f.temp(s.temp), 'now', { band: { from: parseFloat(f.temp(36.4, 2)), to: parseFloat(f.temp(36.8, 2)) }, formatY: (v) => v.toFixed(1) }],
          ['Training Load', 'line', BL.data.HOUR_LABELS.map((_, i) => (i <= hour ? s.trainingLoad - (hour - i) * 0.2 : null)), 'purple', '', `${s.trainingLoad}`, '7-day'],
          ['HRV', 'line', hrv, 'aqua', 'ms', `${s.hrv}`, 'now'],
          ['Sleep', 'bar', [26, 102, 258, 108], 'purple', '', '7h 48m', 'last night', { labels: ['Awake', 'REM', 'Light', 'Deep'], colors: ['orange', 'aqua', 'blue', 'purple'] }],
        ] };
      }
      const W = BL.data.WEEK, M = BL.data.MONTH, Y = BL.data.YEAR;
      const labels = p === 'week' ? dayLabels() : p === 'month' ? Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 29 + i); return `${d.getDate()}`; }) : Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - 11 + i); return BL.MONTHS_SHORT[d.getMonth()]; });
      const src = p === 'week' ? {
        hr: weekSeries([74, 72, 76, 71, 73, 70], s.hr), recovery: weekSeries(W.recovery, s.recovery), fatigue: weekSeries(W.fatigue, s.fatigue), bb: weekSeries(W.bodyBattery, s.bodyBattery), steps: weekSeries(W.steps, s.steps), distance: weekSeries(W.distance, round(s.distanceKm, 1)), calories: weekSeries(W.calories, s.calories), temp: weekSeries(W.temp, round(s.temp, 1)), load: weekSeries(W.trainingLoad, s.trainingLoad), hrv: weekSeries(W.hrv, s.hrv), sleep: weekSeries(W.sleepHours, BL.data.SLEEP_TODAY_HOURS),
      } : p === 'month' ? { hr: M.heartRate, recovery: M.recovery, fatigue: M.fatigue, bb: M.bodyBattery, steps: M.steps, distance: M.distance, calories: M.calories, temp: M.temp, load: M.trainingLoad, hrv: M.hrv, sleep: M.sleepHours }
        : { hr: Y.heartRate, recovery: Y.recovery, fatigue: Y.fatigue, bb: Y.bodyBattery, steps: Y.steps, distance: Y.distance, calories: Y.calories, temp: Y.temp, load: Y.trainingLoad, hrv: Y.hrv, sleep: Y.sleepHours };
      const sumLabel = p === 'week' ? 'this week' : p === 'month' ? '30 days' : '12 months';
      const avgOf = (arr) => Math.round(BL.avg(arr));
      return { labels, labelEvery: p === 'month' ? 5 : 1, items: [
        ['Heart Rate', 'line', src.hr, 'red', 'bpm', `${avgOf(src.hr)}`, 'avg ' + sumLabel],
        ['Recovery', 'line', src.recovery, 'green', '%', `${avgOf(src.recovery)}`, 'avg'],
        ['Fatigue', 'line', src.fatigue, 'orange', '/100', `${avgOf(src.fatigue)}`, 'avg'],
        ['Body Battery', 'line', src.bb, 'aqua', '/100', `${avgOf(src.bb)}`, 'avg end-of-day'],
        ['Steps', 'bar', src.steps, 'blue', 'steps', BL.fmtNumber(BL.sum(src.steps)), sumLabel],
        ['Distance', 'bar', dist(src.distance), 'aqua', f.distUnit(), f.distance(BL.sum(src.distance), 1), sumLabel],
        ['Calories', 'bar', src.calories, 'orange', 'kcal', BL.fmtNumber(BL.sum(src.calories)), sumLabel],
        ['Temperature', 'line', temp(src.temp), 'orange', f.tempUnit(), f.temp(BL.avg(src.temp)), 'avg', { band: { from: parseFloat(f.temp(36.4, 2)), to: parseFloat(f.temp(36.8, 2)) }, formatY: (v) => v.toFixed(1) }],
        ['Training Load', 'bar', src.load, 'purple', '', `${avgOf(src.load)}`, 'avg'],
        ['HRV', 'line', src.hrv, 'aqua', 'ms', `${avgOf(src.hrv)}`, 'avg'],
        ['Sleep', 'bar', src.sleep, 'purple', 'h', `${(BL.avg(src.sleep)).toFixed(1)}`, 'avg / night', { formatValue: (v) => `${Math.floor(v)}h ${Math.round((v % 1) * 60)}m` }],
      ] };
    },
    render(animate) {
      const ds = this.datasets();
      if (!this.grid.children.length) {
        this.grid.innerHTML = ds.items.map((it, i) => `<section class="card analytics-card${i === 0 ? ' card--wide' : ''}"><div class="card__head"><span class="card__label">${escapeHtml(it[0]).toUpperCase()}</span><span class="text-muted small" data-an-sub="${i}"></span></div><div class="analytics-card__value"><b data-an-val="${i}"></b><span>${escapeHtml(it[4])}</span></div><div class="chart chart--sm" data-chart="an-${i}"></div></section>`).join('');
      }
      ds.items.forEach((it, i) => {
        const [name, type, data, color, unit, value, sub, extra] = it;
        $(`[data-an-val="${i}"]`).textContent = value; $(`[data-an-sub="${i}"]`).textContent = sub;
        $(`[data-an-val="${i}"]`).nextElementSibling.textContent = unit;
        const ex = extra || {};
        const cfg = Object.assign({ labels: ex.labels || ds.labels, tooltipLabels: ex.labels ? null : ds.tooltipLabels, labelEvery: ex.labels ? 1 : ds.labelEvery, unit, yAxis: type !== 'bar' }, type === 'bar' ? { type: 'bar', data, color, colors: ex.colors, highlightIndex: this.period === 'week' ? 6 : undefined } : { type: 'line', series: [{ data, color, dashedFrom: ds.dashed, endDot: this.period !== 'day' }] }, ex);
        if (CM().get('an-' + i)) CM().update('an-' + i, cfg, animate); else CM().create('an-' + i, $(`[data-chart="an-${i}"]`), cfg);
      });
      const loadCfg = { type: 'bar', data: weekSeries(BL.data.WEEK.trainingLoad, A().sim.state.trainingLoad), labels: dayLabels(), color: 'aqua', highlightIndex: 6, yAxis: false, xLabels: false, yMin: 0, yMax: 100 };
      if (CM().get('load7')) CM().update('load7', loadCfg, animate); else CM().create('load7', $('[data-chart="load7"]'), loadCfg);
    },
  };

  /* =====================================================================
     INSIGHTS / NOTIFICATIONS
     ===================================================================== */
  S.insights = { init() { UI().renderInsights($('[data-insights]'), BL.data.INSIGHTS); on($('[data-insights]'), 'keydown', '[role="button"]', (e, t) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); A().nav.go(t.dataset.go); } }); } };
  S.notifications = {
    init() {
      this.root = $('[data-notif-root]'); this.screen = $('[data-screen="notifications"]');
      A().notif.on('change', () => this.render());
      on(this.screen, 'click', '[data-notif]', (e, b) => { if (b.dataset.notif === 'read-all') { A().notif.markAllRead(); BL.toast('All notifications marked as read', 'info'); } else if (b.dataset.notif === 'clear') UI().confirm('Clear notifications?', 'All notifications will be removed from this device.', { confirmLabel: 'Clear', danger: true }).then((ok) => { if (ok) A().notif.clear(); }); });
      on(this.root, 'click', '[data-notif-action]', (e, b) => { e.stopPropagation(); const card = b.closest('[data-notif-id]'); const id = card.dataset.notifId; if (b.dataset.notifAction === 'dismiss') A().notif.dismiss(id); else { A().notif.markRead(id); if (card.dataset.screenTarget) A().nav.go(card.dataset.screenTarget); } });
      on(this.root, 'click', '.notif', (e, card) => { if (e.target.closest('[data-notif-action]')) return; A().notif.markRead(card.dataset.notifId); if (card.dataset.screenTarget) A().nav.go(card.dataset.screenTarget); });
      this.render();
    },
    enter() { this.render(); },
    render() { UI().renderNotifications(this.root, A().notif.grouped()); },
  };

  /* =====================================================================
     DEVICE
     ===================================================================== */
  S.device = {
    init() {
      this.screen = $('[data-screen="device"]'); this.progress = $('[data-device-progress]');
      on(document, 'click', '[data-device]', (e, b) => this.action(b.dataset.device, b));
      const d = A().device;
      d.on('change', () => this.render());
      d.on('connected', () => { BL.toast('Biotex ECG Jacket connected', { type: 'success', icon: 'bluetooth' }); BL.vibrate([10, 30, 10]); A().sim.setFrozen(false); });
      d.on('disconnected', () => { BL.toast('Jacket disconnected', { type: 'warn', icon: 'bluetooth' }); A().sim.setFrozen(true); A().notif.add({ kind: 'alert', title: 'Jacket Disconnected', body: 'Bluetooth connection to your ECG jacket was interrupted.', icon: 'bluetooth', color: 'red', screen: 'device', actions: true }); });
      d.on('synced', () => { if (BL.settings.get('autoSync')) BL.toast('Jacket synchronized', { type: 'success', icon: 'refresh' }); });
      d.on('low-battery', (b) => { A().notif.add({ kind: 'device', title: `Battery remaining: ${b}%`, body: 'Charge the jacket before your next session.', icon: 'battery', color: 'orange', screen: 'device' }); BL.toast(`Jacket battery at ${b}%`, 'warn'); });
      d.on('find', () => { const v = $('#device-visual'); v.classList.add('is-finding'); setTimeout(() => v.classList.remove('is-finding'), 3200); BL.toast('Jacket is flashing its LED and vibrating', { type: 'info', icon: 'vibrate' }); });
      d.on('flow', (f) => this.flow(f));
      A().sim.setFrozen(!d.connected);
      this.render();
    },
    enter() { this.render(); },
    render() { const d = A().device; $$('[data-sensor-list="device"]').forEach((c) => UI().renderSensorList(c, d.sensors, d.connected)); const ct = $('[data-device="charge-toggle"]'); if (ct) ct.setAttribute('aria-pressed', d.charging); },
    action(a, btn) {
      const d = A().device;
      if (a === 'search' || a === 'connect') d.search();
      else if (a === 'reconnect') { d.reconnect(); BL.toast('Reconnecting to jacket…', { type: 'info', icon: 'bluetooth' }); }
      else if (a === 'disconnect') d.disconnect();
      else if (a === 'charge-toggle') { const on_ = d.toggleCharging(); BL.toast(on_ ? 'Demo charging enabled' : 'Demo charging stopped', 'info'); }
      else if (a === 'find') d.find();
      else if (a === 'info') { UI().modal({ title: 'Device information', body: `<div class="kv-list">${d.info().map((r) => `<div><span>${escapeHtml(r[0])}</span><b>${escapeHtml(r[1])}</b></div>`).join('')}</div>`, actions: [{ label: 'Close', cls: 'btn--primary' }] }); }
      else if (a === 'calibrate' || a === 'firmware' || a === 'diagnostic') {
        if (!d.connected) { BL.toast('Connect the jacket first', 'warn'); return; }
        if (d.busy) { BL.toast('Another operation is in progress', 'warn'); return; }
        if (A().nav.current !== 'device') A().nav.go('device');
        const fn = { calibrate: () => d.calibrate(), firmware: () => d.updateFirmware(), diagnostic: () => d.diagnostic() }[a];
        fn().then((ok) => { if (ok) BL.toast({ calibrate: 'Sensors calibrated', firmware: 'Firmware is up to date', diagnostic: 'Diagnostics passed' }[a], 'success'); });
      }
      BL.vibrate(8);
    },
    flow(f) {
      const p = this.progress; p.hidden = false;
      $('[data-device-progress-title]', p).textContent = { calibrate: 'Sensor calibration', firmware: 'Firmware update', diagnostic: 'Diagnostic check' }[f.type];
      $('[data-device-progress-pct]', p).textContent = f.pct + '%';
      $('[data-device-progress-bar]', p).style.width = f.pct + '%';
      $('[data-device-progress-text]', p).textContent = f.text;
      const list = $('[data-diag-list]', p);
      if (f.type === 'diagnostic') { list.hidden = false; list.innerHTML = f.steps ? f.steps.map((s, i) => `<li class="${i < f.step ? 'is-done' : i === f.step ? 'is-running' : ''}">${icon(i < f.step ? 'check-circle' : i === f.step ? 'refresh' : 'more')}${escapeHtml(s)}</li>`).join('') : list.innerHTML; if (f.done) $$('li', list).forEach((li) => { li.className = 'is-done'; li.querySelector('svg').innerHTML = '<use href="#i-check-circle"/>'; }); }
      else list.hidden = true;
      if (f.done) setTimeout(() => { p.hidden = true; }, 2600);
      p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
  };

  /* =====================================================================
     PROFILE & SETTINGS
     ===================================================================== */
  S.profile = {
    init() {
      this.screen = $('[data-screen="profile"]');
      on(document, 'click', '[data-profile-edit]', (e, b) => this.edit(b.dataset.profileEdit));
      BL.settings.on('profile', () => this.render()); BL.settings.on('change', () => this.render());
      this.render();
    },
    enter() { this.render(); UI().countScreen(this.screen); },
    render() {
      const p = BL.settings.profile(), s = BL.settings, f = BL.fmt, row = UI().profileRow;
      $('[data-profile-list="body"]').innerHTML = row('age', 'Age', `${p.age} yrs`, 'user') + row('height', 'Height', f.height(p.heightCm), 'ruler') + row('weight', 'Weight', f.weight(p.weightKg), 'scale');
      $('[data-profile-list="goals"]').innerHTML = row('stepGoal', 'Daily step goal', BL.fmtNumber(p.stepGoal), 'steps') + row('fitnessGoal', 'Fitness goal', p.fitnessGoal, 'target') + row('maxHr', 'Max heart rate', `${p.maxHr} BPM`, 'heart');
      $('[data-profile-list="units"]').innerHTML = row('unitSystem', 'Preferred units', s.get('unitSystem') === 'imperial' ? 'Imperial' : 'Metric', 'sliders') + row('distanceUnit', 'Distance units', s.get('distanceUnit') === 'mi' ? 'Miles' : 'Kilometres', 'route') + row('tempUnit', 'Temperature units', s.get('tempUnit') === 'F' ? 'Fahrenheit (°F)' : 'Celsius (°C)', 'thermometer');
    },
    async edit(key) {
      const p = BL.settings.profile(), s = BL.settings;
      const num = async (title, label, value, min, max, step, hint) => { const v = await UI().prompt(title, { label, value, type: 'number', min, max, step, hint }); if (v == null || v === '') return null; const n = parseFloat(v); return isFinite(n) ? clamp(n, min, max) : null; };
      let v;
      switch (key) {
        case 'name': v = await UI().prompt('Edit name', { label: 'Display name', value: p.name }); if (v && v.trim()) { s.setProfile({ name: v.trim() }); BL.toast('Profile updated', 'success'); } break;
        case 'age': v = await num('Age', 'Years', p.age, 10, 100, 1); if (v != null) { s.setProfile({ age: Math.round(v), maxHr: Math.round(220 - v) }); BL.toast('Age updated — max HR recalculated', 'success'); } break;
        case 'height': v = await num('Height', 'Centimetres', p.heightCm, 100, 230, 1); if (v != null) s.setProfile({ heightCm: Math.round(v) }); break;
        case 'weight': v = await num('Weight', 'Kilograms', p.weightKg, 30, 250, 0.1); if (v != null) s.setProfile({ weightKg: round(v, 1) }); break;
        case 'stepGoal': v = await num('Daily step goal', 'Steps', p.stepGoal, 1000, 50000, 500); if (v != null) { s.setProfile({ stepGoal: Math.round(v) }); BL.toast('Step goal updated', 'success'); } break;
        case 'maxHr': v = await num('Max heart rate', 'BPM', p.maxHr, 120, 220, 1, 'Default estimate is 220 − age'); if (v != null) s.setProfile({ maxHr: Math.round(v) }); break;
        case 'fitnessGoal': v = await UI().form('Fitness goal', [{ key: 'goal', label: 'Goal', type: 'select', value: p.fitnessGoal, options: [['Improve endurance', 'Improve endurance'], ['Build strength', 'Build strength'], ['Lose weight', 'Lose weight'], ['Improve recovery', 'Improve recovery'], ['Maintain health', 'Maintain health'], ['Race preparation', 'Race preparation']] }]); if (v) s.setProfile({ fitnessGoal: v.goal }); break;
        case 'unitSystem': v = await UI().form('Preferred units', [{ key: 'u', label: 'System', type: 'segment', value: s.get('unitSystem'), options: [['metric', 'Metric'], ['imperial', 'Imperial']] }]); if (v) { s.set('unitSystem', v.u); s.set('distanceUnit', v.u === 'imperial' ? 'mi' : 'km'); s.set('tempUnit', v.u === 'imperial' ? 'F' : 'C'); BL.toast('Units updated', 'success'); } break;
        case 'distanceUnit': v = await UI().form('Distance units', [{ key: 'u', label: 'Unit', type: 'segment', value: s.get('distanceUnit'), options: [['km', 'Kilometres'], ['mi', 'Miles']] }]); if (v) s.set('distanceUnit', v.u); break;
        case 'tempUnit': v = await UI().form('Temperature units', [{ key: 'u', label: 'Unit', type: 'segment', value: s.get('tempUnit'), options: [['C', 'Celsius'], ['F', 'Fahrenheit']] }]); if (v) s.set('tempUnit', v.u); break;
        case 'privacy': v = await UI().form('Privacy', [{ key: 'p', label: 'Health data storage', type: 'segment', value: p.privacy, options: [['device', 'This device only'], ['cloud', 'Encrypted cloud sync']] }]); if (v) { s.setProfile({ privacy: v.p }); BL.toast('Privacy preference saved', 'success'); } break;
        case 'emergency': v = await UI().form('Emergency contact', [{ key: 'n', label: 'Name', value: p.emergencyName, placeholder: 'Contact name' }, { key: 'ph', label: 'Phone', type: 'tel', value: p.emergencyPhone, placeholder: '+91 …', hint: 'Shown on the device page. Biotex Life never contacts emergency services automatically.' }]); if (v) { s.setProfile({ emergencyName: v.n.trim(), emergencyPhone: v.ph.trim() }); BL.toast('Emergency contact saved', 'success'); } break;
        default: break;
      }
      if (['unitSystem', 'distanceUnit', 'tempUnit'].includes(key)) BL.app.refreshAll();
    },
  };

  S.settings = {
    groups: {
      sync: [['autoSync', 'Auto Sync', 'Sync jacket data in the background', 'refresh'], ['activityAutoPause', 'Activity Auto Pause', 'Pause when you stop moving', 'pause'], ['gpsTracking', 'GPS Tracking', 'Record routes during activities', 'gps']],
      alerts: [['healthInsights', 'Health Insights', 'Daily wellness insights', 'sparkles'], ['sensorAlerts', 'Sensor Alerts', 'Heart rate, ECG and SpO₂ alerts', 'alert'], ['tempAlerts', 'Temperature Alerts', 'Deviation from your baseline', 'thermometer'], ['recoveryNotifications', 'Recovery Notifications', 'Morning readiness updates', 'leaf'], ['weeklyReport', 'Weekly Report', 'Summary every Monday', 'calendar']],
      experience: [['hapticsX', 'Haptic Feedback', 'Vibrate on key interactions', 'vibrate'], ['darkMode', 'Dark Mode', 'Dark interface (recommended)', 'moon'], ['alwaysOnEcg', 'Always-On ECG Preview', 'Live strip on the dashboard', 'ecg']],
    },
    init() {
      this.screen = $('[data-screen="settings"]');
      on(document, 'click', '[data-setting]', (e, b) => { const key = b.dataset.setting; const v = BL.settings.toggle(key); b.setAttribute('aria-checked', v); BL.vibrate(8); this.effect(key, v); });
      on(document, 'keydown', '[data-setting]', (e, b) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); b.click(); } });
      BL.settings.on('change', () => this.render());
      this.render();
      this.applyTheme(BL.settings.get('darkMode'));
    },
    enter() { this.render(); },
    render() {
      const keyMap = { activityAutoPause: 'autoPause', hapticsX: 'haptics' };
      Object.keys(this.groups).forEach((g) => { const c = $(`[data-settings-group="${g}"]`); if (c) c.innerHTML = this.groups[g].map(([k, l, d, i]) => UI().settingRow(keyMap[k] || k, l, d, !!BL.settings.get(keyMap[k] || k), i)).join(''); });
    },
    effect(key, v) {
      if (key === 'darkMode') { this.applyTheme(v); BL.toast(v ? 'Dark mode on' : 'Light mode on', 'info'); }
      if (key === 'alwaysOnEcg') { if (A().ecgMini) { if (v && A().nav.current === 'home' && A().device.connected) { A().ecgMini.reset(); A().ecgMini.start(); } else if (!v) A().ecgMini.stop(); } }
      if (key === 'gpsTracking') BL.toast(v ? 'GPS tracking enabled' : 'GPS tracking disabled — routes will not be recorded', v ? 'success' : 'warn');
      if (key === 'autoSync') BL.toast(v ? 'Auto sync enabled' : 'Auto sync paused', 'info');
    },
    applyTheme(dark) {
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      const meta = $('meta[name="theme-color"]'); if (meta) meta.content = dark ? '#050708' : '#F3F6F8';
      [A().ecgMini, A().ecgMain].forEach((r) => { if (r) r.resize(); });
      BL.MapController.setLayerAll(dark ? 'dark' : 'light');
      CM().redrawAll();
      S.ecg.renderHistory();
    },
  };

  /* =====================================================================
     HISTORY
     ===================================================================== */
  S.history = {
    init() {
      this.screen = $('[data-screen="history"]'); this.filter = 'all'; this.list = $('[data-history-list="full"]');
      on($('[data-history-filters]'), 'click', '[data-filter]', (e, b) => { this.filter = b.dataset.filter; $$('[data-filter]').forEach((x) => x.classList.toggle('is-active', x === b)); this.render(); BL.vibrate(6); });
      on(document, 'click', '[data-activity]', (e, b) => { const a = A().activity.find(b.dataset.activity); if (a) { S.summary.show(a); A().nav.go('activity-summary'); } });
      A().activity.on('history', () => this.render());
      this.render();
    },
    enter() { this.render(); },
    render() { UI().renderHistory(this.list, A().activity.getHistory(this.filter)); },
    exportAll() {
      const rows = [['id', 'name', 'type', 'date', 'duration_s', 'distance_km', 'avg_pace_s_per_km', 'calories', 'avg_hr', 'max_hr', 'elevation_m', 'steps', 'avg_temp_c', 'fatigue_delta', 'body_battery_delta', 'training_load']];
      A().activity.getHistory().forEach((a) => rows.push([a.id, a.name, a.type, new Date(a.date).toISOString(), a.durationSec, a.distanceKm, a.avgPace, a.calories, a.avgHr, a.maxHr, a.elevation, a.steps, a.avgTemp, a.fatigueDelta, a.bbDelta, a.load]));
      BL.downloadFile('biotex-activities.csv', BL.toCSV(rows), 'text/csv'); BL.toast('Activity history exported', 'success');
    },
  };

  BL.screens = S;
})(window.BL = window.BL || {});
