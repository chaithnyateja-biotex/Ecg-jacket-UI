/* ==========================================================================
   BIOTEX LIFE — activity.js
   ActivityTracker: live session engine (timer, distance, pace, route
   progression, HR zones, samples), summary builder and history store.
   ========================================================================== */
(function (BL) {
  'use strict';
  const { clamp, round } = BL;

  const SAMPLE_EVERY = 5; // simulated seconds

  class ActivityTracker {
    constructor(sim) {
      this.sim = sim;
      this.ev = BL.emitter();
      const routeData = (window.BL_ROUTES && window.BL_ROUTES.hyderabad) || { points: [[17.4095, 78.4713], [17.4079, 78.4713]] };
      this.route = routeData.points;
      this.routeName = routeData.name || 'Hyderabad route';
      this.cum = BL.RouteUtil.cumulative(this.route);
      this.state = 'idle'; // idle | active | paused | finished
      this.session = null;
      this.speedMul = 1;
      this.timer = null; this.lastTick = 0;
      this.locked = false;
      const saved = BL.storage.get('activities', null);
      this.history = Array.isArray(saved) ? saved : BL.data.SEED_ACTIVITIES.slice();
      if (!Array.isArray(saved)) this.persist();
      this.lastSummary = null;
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.lastTick = performance.now(); });
    }

    on(type, fn) { return this.ev.on(type, fn); }
    isRunning() { return this.state === 'active' || this.state === 'paused'; }
    persist() { BL.storage.set('activities', this.history.slice(0, 50)); }

    elevationAt(d) { return 540 + 26 * Math.sin(d / 520) + 14 * Math.sin(d / 170 + 1.2) + 6 * Math.sin(d / 61); }

    start(typeId) {
      if (this.isRunning()) return this.session;
      const type = BL.data.activityType(typeId);
      const now = Date.now();
      const s = this.sim.state;
      this.session = {
        id: BL.uid(), type: type.id, typeDef: type, name: BL.data.activityName(type.id, new Date(now)), startedAt: now,
        elapsed: 0, distanceM: 0, paceSec: 0, avgPace: 0, elevGain: 0, lastElev: this.elevationAt(0), elevation: 0,
        calories: 0, steps: 0, startCal: s.calories, startSteps: s.steps,
        hrSum: 0, hrTime: 0, hrMax: 0, tempSum: 0, zonesSec: [0, 0, 0, 0, 0],
        fatigueStart: s.fatigue, bbStart: s.bodyBattery, loadStart: s.trainingLoad,
        position: this.route[0], path: [this.route[0]], samples: [], lastSampleAt: -SAMPLE_EVERY, gps: 'Strong', gpsNoise: 0,
      };
      this.state = 'active'; this.locked = false;
      this.sim.setActivity({ type, intensity: type.intensity, elapsedMin: 0, paused: false });
      this.lastTick = performance.now();
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 250);
      this.ev.emit('start', this.session);
      this.ev.emit('state', this.state);
      return this.session;
    }
    pause() { if (this.state !== 'active') return; this.state = 'paused'; if (this.sim.activity) this.sim.activity.paused = true; this.ev.emit('state', this.state); }
    resume() { if (this.state !== 'paused') return; this.state = 'active'; if (this.sim.activity) this.sim.activity.paused = false; this.lastTick = performance.now(); this.ev.emit('state', this.state); }
    toggleLock(force) { this.locked = force != null ? !!force : !this.locked; this.ev.emit('lock', this.locked); return this.locked; }
    setSpeed(mul) { this.speedMul = mul; this.ev.emit('speed', mul); }
    cycleSpeed() { const order = [1, 5, 20]; const i = order.indexOf(this.speedMul); this.setSpeed(order[(i + 1) % order.length]); return this.speedMul; }

    tick() {
      if (this.state !== 'active') return;
      const now = performance.now();
      const dtReal = clamp((now - this.lastTick) / 1000, 0, 1.5);
      this.lastTick = now;
      const dt = dtReal * this.speedMul;
      if (dt <= 0) return;
      const s = this.session, t = s.typeDef, vit = this.sim.state;
      s.elapsed += dt;
      /* speed with warm-up ramp and gentle variation */
      const ramp = Math.min(1, s.elapsed / 40);
      const speedKmh = t.speedKmh * ramp * (1 + 0.07 * Math.sin(s.elapsed / 55) + 0.03 * Math.sin(s.elapsed / 9));
      const speedMs = speedKmh / 3.6;
      s.distanceM += speedMs * dt;
      s.paceSec = speedMs > 0.25 ? 1000 / speedMs : 0;
      s.avgPace = s.distanceM > 25 ? s.elapsed / (s.distanceM / 1000) : 0;
      /* elevation */
      const elev = t.speedKmh > 0 ? this.elevationAt(s.distanceM * (t.elevPerKm / 13)) : s.lastElev;
      if (elev > s.lastElev) s.elevGain += elev - s.lastElev;
      s.lastElev = elev; s.elevation = Math.round(s.elevGain);
      /* physiology */
      this.sim.addStrain(t, dt / 60);
      if (this.sim.activity) this.sim.activity.elapsedMin = s.elapsed / 60;
      const hr = vit.hr;
      s.hrSum += hr * dt; s.hrTime += dt; s.hrMax = Math.max(s.hrMax, hr); s.tempSum += vit.temp * dt;
      const zi = BL.data.HR_ZONES.findIndex((z) => hr <= z.max);
      if (zi >= 0 && hr >= BL.data.HR_ZONES[0].min) s.zonesSec[zi] += dt;
      s.calories = Math.max(0, vit.calories - s.startCal);
      s.steps = Math.max(0, vit.steps - s.startSteps);
      /* route */
      if (t.speedKmh > 0) { const pos = BL.RouteUtil.positionAt(this.route, this.cum, s.distanceM); s.position = pos.latlng; s.path = pos.path; }
      /* GPS quality flicker */
      if (Math.random() < 0.004 * dt) s.gps = Math.random() < 0.8 ? 'Strong' : 'Good';
      /* samples */
      if (s.elapsed - s.lastSampleAt >= SAMPLE_EVERY) {
        s.lastSampleAt = s.elapsed;
        const paceCap = t.speedKmh > 0 ? (1000 / (t.speedKmh / 3.6)) * 1.5 : 0;
        s.samples.push({ t: round(s.elapsed), hr, pace: s.elapsed < 30 ? null : round(Math.min(s.paceSec, paceCap)), elev: round(elev - 540 + 60), temp: vit.temp, fatigue: vit.fatigue, bb: vit.bodyBattery, dist: round(s.distanceM) });
        if (s.samples.length > 1200) s.samples = s.samples.filter((_, i) => i % 2 === 0);
      }
      this.ev.emit('tick', s);
    }

    finish() {
      if (!this.isRunning()) return null;
      clearInterval(this.timer); this.timer = null;
      this.state = 'finished'; this.locked = false;
      this.sim.setActivity(null);
      const summary = this.buildSummary(this.session);
      this.lastSummary = summary;
      this.ev.emit('state', this.state);
      this.ev.emit('finish', summary);
      return summary;
    }
    discard() { clearInterval(this.timer); this.timer = null; this.state = 'idle'; this.session = null; this.sim.setActivity(null); this.ev.emit('state', this.state); }
    reset() { this.state = 'idle'; this.session = null; this.ev.emit('state', this.state); }

    buildSummary(s) {
      const vit = this.sim.state;
      const dur = Math.max(1, Math.round(s.elapsed));
      const distanceKm = s.distanceM / 1000;
      const decimate = (arr, max) => (arr.length <= max ? arr : arr.filter((_, i) => i % Math.ceil(arr.length / max) === 0));
      return {
        id: s.id, type: s.type, name: s.name, date: s.startedAt, durationSec: dur,
        distanceKm: round(distanceKm, 2), avgPace: s.typeDef.speedKmh > 0 && distanceKm > 0.02 ? Math.round(dur / distanceKm) : 0,
        calories: Math.round(s.calories), avgHr: Math.round(s.hrTime ? s.hrSum / s.hrTime : vit.hr), maxHr: Math.round(s.hrMax || vit.hr),
        elevation: Math.round(s.elevGain), steps: Math.round(s.steps), avgTemp: round(s.hrTime ? s.tempSum / s.hrTime : vit.temp, 1),
        fatigueDelta: vit.fatigue - s.fatigueStart, bbDelta: vit.bodyBattery - s.bbStart, load: vit.trainingLoad,
        zones: s.zonesSec.map((v) => round(v / 60, 1)),
        samples: decimate(s.samples, 160), path: decimate(s.path, 220), route: this.routeName, saved: false,
      };
    }

    save(summary) {
      if (!summary) return;
      summary.saved = true;
      this.history = this.history.filter((a) => a.id !== summary.id);
      this.history.unshift(summary);
      this.persist();
      this.state = 'idle'; this.session = null;
      this.ev.emit('history', this.history);
      this.ev.emit('state', this.state);
    }
    deleteActivity(id) { this.history = this.history.filter((a) => a.id !== id); this.persist(); this.ev.emit('history', this.history); }
    getHistory(filter) {
      const list = this.history.slice().sort((a, b) => b.date - a.date);
      if (!filter || filter === 'all') return list;
      return list.filter((a) => BL.data.activityType(a.type).category === filter);
    }
    find(id) { return this.history.find((a) => a.id === id) || (this.lastSummary && this.lastSummary.id === id ? this.lastSummary : null); }
    resetHistory() { this.history = BL.data.SEED_ACTIVITIES.slice(); this.persist(); this.ev.emit('history', this.history); }

    /** Synthetic per-activity series for seeded records (no live samples) */
    static syntheticSamples(a) {
      const n = 60, rnd = BL.seeded(a.date % 10007);
      const out = [];
      for (let i = 0; i < n; i++) {
        const p = i / (n - 1), warm = Math.min(1, p * 5);
        out.push({
          t: Math.round(p * a.durationSec),
          hr: Math.round(78 + (a.avgHr - 78) * warm * (1 + 0.1 * Math.sin(p * 9)) + (rnd() - 0.5) * 8 + (p > 0.6 && p < 0.75 ? (a.maxHr - a.avgHr) * 0.8 : 0)),
          pace: a.avgPace ? Math.round(a.avgPace * (1 + 0.12 * Math.sin(p * 7 + 1) + (rnd() - 0.5) * 0.08)) : 0,
          elev: Math.round(60 + a.elevation * 0.5 * (1 + Math.sin(p * 4 - 1)) * (0.6 + 0.4 * Math.sin(p * 11))),
          temp: round(36.6 + (a.avgTemp - 36.6) * 2 * warm * (0.7 + 0.3 * p) + (rnd() - 0.5) * 0.06, 2),
          fatigue: Math.round(32 + a.fatigueDelta * p + (rnd() - 0.5) * 2),
          bb: Math.round(78 + a.bbDelta * p),
          dist: Math.round(a.distanceKm * 1000 * p),
        });
      }
      return out;
    }

    static shareText(a) {
      const f = BL.fmt;
      return `${a.name} — Biotex Life\n${f.distance(a.distanceKm)} ${f.distUnit()} · ${BL.fmtClock(a.durationSec)} · ${f.pace(a.avgPace)}\nAvg HR ${a.avgHr} BPM · Max ${a.maxHr} BPM · ${a.calories} kcal · ${a.elevation} m climb\nRecorded with the Biotex ECG Jacket`;
    }
    static toCSV(a) {
      const rows = [['Field', 'Value'], ['Activity', a.name], ['Type', a.type], ['Date', new Date(a.date).toISOString()], ['Duration (s)', a.durationSec], ['Distance (km)', a.distanceKm], ['Average pace (s/km)', a.avgPace], ['Calories (kcal)', a.calories], ['Average HR (bpm)', a.avgHr], ['Max HR (bpm)', a.maxHr], ['Elevation gain (m)', a.elevation], ['Steps', a.steps], ['Average temperature (C)', a.avgTemp], ['Fatigue change', a.fatigueDelta], ['Body battery change', a.bbDelta], ['Training load', a.load], [], ['t (s)', 'hr', 'pace (s/km)', 'elevation (m)', 'temp (C)', 'fatigue', 'body battery', 'distance (m)']];
      (a.samples && a.samples.length ? a.samples : ActivityTracker.syntheticSamples(a)).forEach((s) => rows.push([s.t, s.hr, s.pace, s.elev, s.temp, s.fatigue, s.bb, s.dist]));
      return BL.toCSV(rows);
    }
  }
  BL.ActivityTracker = ActivityTracker;
})(window.BL = window.BL || {});
