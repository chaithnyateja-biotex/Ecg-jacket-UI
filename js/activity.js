/* ==========================================================================
   BIOTEX LIFE — activity.js
   ActivityTracker: live session engine (timer, distance, pace, route
   progression, Karvonen zones, TRIMP, drift, heat strain, SpO₂ sampling,
   samples), post-session heart-rate-recovery capture, summary builder,
   history store and 28-day load statistics (ACWR, monotony).
   ========================================================================== */
(function (BL) {
  'use strict';
  const { clamp, round } = BL;
  const M = () => BL.metrics;

  const SAMPLE_EVERY = 5;        // simulated seconds between samples
  const RECOVERY_SECONDS = 180;  // post-session HR capture window (real time)

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
      let changed = !Array.isArray(saved);
      this.history.forEach((a) => { if (this.enrich(a)) changed = true; });
      if (changed) this.persist();
      this.lastSummary = null;
      this.capture = null;
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.lastTick = performance.now(); });
      BL.settings.on('profile', () => { this.history.forEach((a) => { a.trimp = null; this.enrich(a); }); this.persist(); this.ev.emit('history', this.history); });
    }

    on(type, fn) { return this.ev.on(type, fn); }
    isRunning() { return this.state === 'active' || this.state === 'paused'; }
    persist() { BL.storage.set('activities', this.history.slice(0, 50)); }
    athlete() { const p = BL.settings.profile(); return { rest: this.sim.state.restingHr, max: p.maxHr || M().hrMax(p.age || 38), sex: p.sex || 'male', age: p.age || 38, kg: p.weightKg || 72 }; }
    zones() { const a = this.athlete(); return M().zones(a.rest, a.max); }

    elevationAt(d) { return 540 + 26 * Math.sin(d / 520) + 14 * Math.sin(d / 170 + 1.2) + 6 * Math.sin(d / 61); }

    /* ---------- Interval schedule ---------- */
    phaseAt(type, min) {
      const iv = type.intervals;
      if (!iv) return { phase: 'steady', rep: 0, hrTarget: 78 + (type.hrBase - 78) * clamp(min / 6, 0, 1), speedKmh: type.speedKmh };
      if (min < iv.warmup) return { phase: 'warmup', rep: 0, hrTarget: 92 + (128 - 92) * clamp(min / iv.warmup, 0, 1), speedKmh: 9 };
      const block = iv.hard + iv.easy, t = min - iv.warmup, rep = Math.floor(t / block);
      if (rep < iv.reps) {
        const inBlock = t - rep * block;
        if (inBlock < iv.hard) return { phase: 'hard', rep: rep + 1, hrTarget: 160 + 12 * clamp(inBlock / 0.9, 0, 1) + rep * 1.2, speedKmh: 13 };
        return { phase: 'easy', rep: rep + 1, hrTarget: 140 - 4 * clamp((inBlock - iv.hard) / 1.2, 0, 1), speedKmh: 8.5 };
      }
      const cd = clamp((t - iv.reps * block) / iv.cooldown, 0, 1);
      return { phase: 'cooldown', rep: 0, hrTarget: 150 - 55 * cd, speedKmh: 7.5 - 2 * cd };
    }

    start(typeId) {
      if (this.isRunning()) return this.session;
      const type = BL.data.activityType(typeId);
      const now = Date.now();
      const s = this.sim.state;
      this.stopCapture();
      this.session = {
        id: BL.uid(), type: type.id, typeDef: type, name: BL.data.activityName(type.id, new Date(now)), startedAt: now,
        elapsed: 0, distanceM: 0, paceSec: 0, avgPace: 0, elevGain: 0, lastElev: this.elevationAt(0), elevation: 0,
        calories: 0, steps: 0, startCal: s.calories, startSteps: s.steps,
        hrSum: 0, hrTime: 0, hrMax: 0, tempSum: 0, tempStart: s.temp, tempMax: s.temp, zonesSec: [0, 0, 0, 0, 0], belowSec: 0, psiPeak: 0,
        spo2Min: 100, spo2BelowSec: 0, spo2Rest: s.spo2,
        fatigueStart: s.fatigue, bbStart: s.bodyBattery, loadStart: s.trainingLoad,
        position: this.route[0], path: [this.route[0]], samples: [], lastSampleAt: -SAMPLE_EVERY, gps: 'Strong', phase: 'steady', rep: 0,
      };
      this.zonesCache = this.zones();
      this.state = 'active'; this.locked = false;
      this.sim.setActivity({ type, intensity: type.intensity, elapsedMin: 0, paused: false, hrTarget: this.phaseAt(type, 0).hrTarget, phase: 'steady' });
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
      const ph = this.phaseAt(t, s.elapsed / 60);
      s.phase = ph.phase; s.rep = ph.rep;
      if (this.sim.activity) { this.sim.activity.elapsedMin = s.elapsed / 60; this.sim.activity.hrTarget = ph.hrTarget; this.sim.activity.phase = ph.phase; this.sim.activity.speedMul = this.speedMul; }
      /* speed with warm-up ramp and gentle variation */
      const ramp = Math.min(1, s.elapsed / 40);
      const speedKmh = ph.speedKmh * ramp * (1 + 0.07 * Math.sin(s.elapsed / 55) + 0.03 * Math.sin(s.elapsed / 9));
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
      const hr = vit.hr;
      s.hrSum += hr * dt; s.hrTime += dt; s.hrMax = Math.max(s.hrMax, hr); s.tempSum += vit.temp * dt; s.tempMax = Math.max(s.tempMax, vit.temp);
      s.psiPeak = Math.max(s.psiPeak, vit.psi || 0);
      const zi = M().zoneIndex(hr, this.zonesCache);
      if (zi >= 0) s.zonesSec[zi] += dt; else s.belowSec += dt;
      if (vit.spo2Reliable) { s.spo2Min = Math.min(s.spo2Min, vit.spo2Exact || vit.spo2); if ((vit.spo2Exact || vit.spo2) < 95) s.spo2BelowSec += dt; }
      s.calories = Math.max(0, vit.calories - s.startCal);
      s.steps = Math.max(0, vit.steps - s.startSteps);
      /* route */
      if (t.speedKmh > 0) { const pos = BL.RouteUtil.positionAt(this.route, this.cum, s.distanceM); s.position = pos.latlng; s.path = pos.path; }
      /* GPS quality flicker */
      if (Math.random() < 0.004 * dt) s.gps = Math.random() < 0.8 ? 'Strong' : 'Good';
      /* samples */
      if (s.elapsed - s.lastSampleAt >= SAMPLE_EVERY) {
        s.lastSampleAt = s.elapsed;
        s.samples.push({ t: round(s.elapsed), hr, pace: s.elapsed < 30 ? null : round(Math.min(s.paceSec, t.speedKmh > 0 ? (1000 / (t.speedKmh / 3.6)) * 1.5 : 0)), elev: round(elev - 540 + 60), temp: vit.temp, fatigue: vit.fatigue, bb: vit.bodyBattery, dist: round(s.distanceM), spo2: vit.spo2Exact || vit.spo2, spo2Ok: !!vit.spo2Reliable, psi: vit.psi, phase: ph.phase, zone: zi + 1 });
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
      this.startCapture(summary);
      this.ev.emit('state', this.state);
      this.ev.emit('finish', summary);
      return summary;
    }
    discard() { clearInterval(this.timer); this.timer = null; this.stopCapture(); this.state = 'idle'; this.session = null; this.sim.setActivity(null); this.ev.emit('state', this.state); }
    reset() { this.state = 'idle'; this.session = null; this.ev.emit('state', this.state); }

    /* ---------- Heart-rate recovery capture (3 minutes standing still after Finish) ---------- */
    startCapture(summary) {
      this.stopCapture();
      const start = performance.now();
      summary.recovery = [{ t: 0, hr: this.sim.state.hr }];
      summary.recoveryDone = false;
      summary.hrrValid = M().hrrValidStop(this.sim.state.hr); // stop after a cool-down → informative only
      this.capture = { summary, timer: setInterval(() => {
        const t = Math.round((performance.now() - start) / 1000);
        summary.recovery.push({ t, hr: this.sim.state.hr });
        const r = M().hrRecovery(summary.recovery);
        summary.hrr60 = r.hrr60; summary.hrr120 = r.hrr120; summary.recoverySeconds = t;
        if (t >= RECOVERY_SECONDS) { summary.recoveryDone = true; this.stopCapture(); }
        if (summary.saved) this.persist();
        this.ev.emit('recovery', summary);
      }, 1000) };
    }
    stopCapture() { if (this.capture) { clearInterval(this.capture.timer); this.capture = null; } }
    get capturing() { return !!this.capture; }

    buildSummary(s) {
      const vit = this.sim.state, a = this.athlete();
      const dur = Math.max(1, Math.round(s.elapsed));
      const distanceKm = s.distanceM / 1000;
      const decimate = (arr, max) => (arr.length <= max ? arr : arr.filter((_, i) => i % Math.ceil(arr.length / max) === 0));
      const avgHr = Math.round(s.hrTime ? s.hrSum / s.hrTime : vit.hr);
      const samples = decimate(s.samples, 180);
      const out = {
        id: s.id, type: s.type, name: s.name, date: s.startedAt, durationSec: dur,
        distanceKm: round(distanceKm, 2), avgPace: s.typeDef.speedKmh > 0 && distanceKm > 0.02 ? Math.round(dur / distanceKm) : 0,
        calories: Math.round(s.calories), avgHr, maxHr: Math.round(s.hrMax || vit.hr),
        elevation: Math.round(s.elevGain), steps: Math.round(s.steps), avgTemp: round(s.hrTime ? s.tempSum / s.hrTime : vit.temp, 1),
        fatigueDelta: vit.fatigue - s.fatigueStart, bbDelta: vit.bodyBattery - s.bbStart, load: vit.trainingLoad,
        zones: s.zonesSec.map((v) => round(v / 60, 1)), belowMin: round(s.belowSec / 60, 1),
        trimp: M().trimp(dur / 60, avgHr, a.rest, a.max, a.sex),
        drift: ActivityTracker.isSteady(s.typeDef) ? M().hrDrift(samples.map((x) => x.hr)) : null, // drift needs one steady pace — not defined for intervals or strength work
        psiPeak: round(s.psiPeak, 1),
        spo2Rest: s.spo2Rest, spo2Min: s.spo2Min < 100 ? round(s.spo2Min, 1) : null, timeBelow95: round(s.spo2BelowSec / 60, 1),
        tempRise: round(s.tempMax - s.tempStart, 1),
        hardReps: ActivityTracker.repRanges(samples),
        samples, path: decimate(s.path, 220), route: this.routeName, saved: false,
      };
      return out;
    }

    /* Backfill computed metrics on seeded / older records */
    enrich(a) {
      if (a.trimp != null && a.hrr60 != null) return false;
      const at = this.athlete();
      a.trimp = M().trimp(a.durationSec / 60, a.avgHr, at.rest, at.max, at.sex);
      if (a.hrr60 == null) { a.hrr60 = clamp(Math.round(0.19 * a.maxHr - 0.5), 14, 46); a.hrr120 = Math.round(a.hrr60 * ((1 - M().recoveryFraction(120)) / (1 - M().recoveryFraction(60)))); a.recoveryDone = true; a.recoverySynthetic = true; a.hrrValid = true; }
      if (a.hrrValid == null) a.hrrValid = true;
      const samples = a.samples && a.samples.length > 3 ? a.samples : ActivityTracker.syntheticSamples(a);
      if (a.drift == null && ActivityTracker.isSteady(BL.data.activityType(a.type))) a.drift = M().hrDrift(samples.map((x) => x.hr));
      if (a.psiPeak == null) a.psiPeak = round(M().psi(a.avgTemp + 0.3, 36.6, a.maxHr, at.rest), 1);
      if (a.spo2Min == null) { const ok = samples.filter((x) => x.spo2Ok !== false && x.spo2 != null); a.spo2Min = ok.length ? Math.min.apply(null, ok.map((x) => x.spo2)) : null; a.spo2Rest = 98; a.timeBelow95 = round(ok.filter((x) => x.spo2 < 95).length * (a.durationSec / Math.max(1, samples.length)) / 60, 1); }
      if (a.tempRise == null) a.tempRise = round(Math.max(0.2, a.avgTemp - 36.6 + 0.4), 1);
      if (a.belowMin == null) a.belowMin = round(Math.max(0, a.durationSec / 60 - a.zones.reduce((x, y) => x + y, 0)), 1);
      if (!a.hardReps) a.hardReps = ActivityTracker.repRanges(samples);
      return true;
    }

    save(summary) {
      if (!summary) return;
      summary.saved = true;
      this.history = this.history.filter((x) => x.id !== summary.id);
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
    resetHistory() { this.history = BL.data.SEED_ACTIVITIES.map((a) => Object.assign({}, a)); this.history.forEach((a) => this.enrich(a)); this.persist(); this.ev.emit('history', this.history); }
    /** latest session with a heart-rate-recovery measurement */
    /** latest session with a valid heart-rate-recovery measurement (stopped after an effort, not after a cool-down) */
    latestWithRecovery() {
      const ok = (a) => a && a.hrr60 != null && a.hrrValid !== false;
      const live = ok(this.lastSummary) ? this.lastSummary : null;
      const saved = this.getHistory().find(ok);
      return live && (!saved || live.date >= saved.date) ? live : saved || null;
    }

    /* ---------- 28-day load statistics ---------- */
    dailyLoads() {
      const today = BL.startOfDay(new Date()).getTime();
      const designed = BL.data.DAILY_28.designedLoads;
      const out = [];
      for (let i = 0; i < 28; i++) {
        const daysAgo = 27 - i;
        if (daysAgo >= 9) { out.push(designed[i] || 0); continue; }
        const dayStart = today - daysAgo * 86400000, dayEnd = dayStart + 86400000;
        const load = this.history.filter((a) => a.date >= dayStart && a.date < dayEnd).reduce((s, a) => s + (a.trimp || 0), 0);
        out.push(round(load));
      }
      return out;
    }
    loadStats() {
      const daily = this.dailyLoads();
      const acwr = M().acwr(daily);
      const labels = daily.map((_, i) => (i === 0 ? 'Day 1' : i === 27 ? 'Day 28' : (i + 1) % 7 === 0 ? String(i + 1) : ''));
      const avg7 = daily.map((_, i) => round(M().mean(daily.slice(Math.max(0, i - 6), i + 1)), 1));
      return { daily, labels, avg7, acwr, series: M().acwrSeries(daily), monotony: M().monotony(daily.slice(-7)) };
    }

    /* ---------- Helpers ---------- */
    /** steady-pace sessions are the only ones where cardiovascular drift is meaningful */
    static isSteady(type) { return !!type && !type.intervals && type.category !== 'training'; }

    static repRanges(samples) {
      const out = []; let start = -1;
      samples.forEach((x, i) => { if (x.phase === 'hard' && start < 0) start = i; if (x.phase !== 'hard' && start >= 0) { out.push({ from: start, to: i }); start = -1; } });
      if (start >= 0) out.push({ from: start, to: samples.length - 1 });
      return out;
    }

    /** Synthetic per-activity series for seeded records (no live samples) */
    static syntheticSamples(a) {
      const type = BL.data.activityType(a.type);
      const rnd = BL.seeded(a.date % 10007);
      const out = [];
      if (type.intervals) {
        const iv = type.intervals, n = 90, total = a.durationSec / 60;
        let hr = 92, spo2 = 98;
        for (let i = 0; i < n; i++) {
          const min = (i / (n - 1)) * total;
          let phase = 'warmup', target = 92 + 36 * clamp(min / iv.warmup, 0, 1);
          if (min >= iv.warmup) {
            const block = iv.hard + iv.easy, t = min - iv.warmup, rep = Math.floor(t / block);
            if (rep < iv.reps) { const inB = t - rep * block; if (inB < iv.hard) { phase = 'hard'; target = 164 + 8 * clamp(inB / 0.8, 0, 1) + rep * 1.3; } else { phase = 'easy'; target = 141 - 3 * clamp((inB - iv.hard) / 1.2, 0, 1); } }
            else { phase = 'cooldown'; target = 150 - 55 * clamp((t - iv.reps * block) / iv.cooldown, 0, 1); }
          }
          hr += (target - hr) * 0.55 + (rnd() - 0.5) * 3;
          const sTarget = phase === 'hard' ? 94.6 : phase === 'easy' ? 96.8 : 98;
          spo2 += (sTarget - spo2) * 0.45 + (rnd() - 0.5) * 0.3;
          const temp = round(36.6 + 0.75 * (1 - Math.exp(-min / 14)) - (phase === 'cooldown' ? 0.15 * clamp((min - 34) / 11, 0, 1) : 0), 2);
          out.push({ t: Math.round(min * 60), hr: Math.round(hr), pace: Math.round(phase === 'hard' ? 277 : phase === 'easy' ? 424 : phase === 'warmup' ? 400 : 480) + Math.round((rnd() - 0.5) * 20), elev: Math.round(60 + 20 * Math.sin(i / 9)), temp, fatigue: Math.round(32 + a.fatigueDelta * (i / n)), bb: Math.round(78 + a.bbDelta * (i / n)), dist: Math.round(a.distanceKm * 1000 * (i / (n - 1))), spo2: round(spo2, 1), spo2Ok: phase !== 'hard', psi: round(BL.metrics.psi(temp, 36.6, hr, 61), 1), phase });
        }
        return out;
      }
      const n = 60;
      /* designed cardiovascular drift per session type (% rise of the 2nd half over the 1st half after the warm-up) */
      const DRIFT = { walk: 1.8, run: 3.4, recovery: 1.1, cycle: 2.9, training: 5.2, hike: 6.3 };
      const D = (2 * (DRIFT[a.type] != null ? DRIFT[a.type] : 3) / 100) * (a.avgHr / Math.max(20, a.avgHr - 78)); // linear ramp of 2 × target (scaled to the above-rest part) gives ≈ target between the halves
      for (let i = 0; i < n; i++) {
        const p = i / (n - 1), warm = Math.min(1, p * 5), steady = Math.max(0, (p - 0.2) / 0.8);
        const hr = Math.round(78 + (a.avgHr - 78) * warm * (1 + D * steady + 0.02 * Math.sin(p * 9)) + (rnd() - 0.5) * 5 + (p > 0.55 && p < 0.65 ? (a.maxHr - a.avgHr) * 0.8 : 0));
        const temp = round(36.6 + (a.avgTemp - 36.6) * 2 * warm * (0.7 + 0.3 * p) + (rnd() - 0.5) * 0.06, 2);
        out.push({
          t: Math.round(p * a.durationSec), hr,
          pace: a.avgPace ? Math.round(a.avgPace * (1 + 0.12 * Math.sin(p * 7 + 1) + (rnd() - 0.5) * 0.08)) : 0,
          elev: Math.round(60 + a.elevation * 0.5 * (1 + Math.sin(p * 4 - 1)) * (0.6 + 0.4 * Math.sin(p * 11))),
          temp, fatigue: Math.round(32 + a.fatigueDelta * p + (rnd() - 0.5) * 2), bb: Math.round(78 + a.bbDelta * p),
          dist: Math.round(a.distanceKm * 1000 * p), spo2: round(98 - (hr > 150 ? 2.2 : hr > 130 ? 1.2 : 0.3) * warm + (rnd() - 0.5) * 0.4, 1), spo2Ok: hr < 150, psi: round(BL.metrics.psi(temp, 36.6, hr, 61), 1), phase: 'steady',
        });
      }
      return out;
    }
    /** Synthetic recovery curve for records without a live capture */
    static syntheticRecovery(a) {
      /* same two-exponential shape as the simulator, scaled so the curve passes exactly through the session's HRR60 / HRR120 */
      const M = BL.metrics, stop = Math.round(a.maxHr * 0.97), rnd = BL.seeded(a.date % 7919);
      const hrr60 = a.hrr60 || Math.round(0.19 * a.maxHr), excess = hrr60 / (1 - M.recoveryFraction(60));
      const out = [];
      for (let t = 0; t <= 180; t += 5) { const exact = t === 0 || t === 60 || t === 120; out.push({ t, hr: Math.round(stop - excess * (1 - M.recoveryFraction(t)) + (exact ? 0 : (rnd() - 0.5) * 2)) }); }
      return out;
    }

    static shareText(a) {
      const f = BL.fmt;
      return `${a.name} — Biotex Life\n${f.distance(a.distanceKm)} ${f.distUnit()} · ${BL.fmtClock(a.durationSec)} · ${f.pace(a.avgPace)}\nAvg HR ${a.avgHr} BPM · Max ${a.maxHr} BPM · Load ${Math.round(a.trimp || 0)} TRIMP · ${a.calories} kcal\nRecorded with the Biotex ECG Jacket`;
    }
    static toCSV(a) {
      const rows = [['Field', 'Value'], ['Activity', a.name], ['Type', a.type], ['Date', new Date(a.date).toISOString()], ['Duration (s)', a.durationSec], ['Distance (km)', a.distanceKm], ['Average pace (s/km)', a.avgPace], ['Calories (kcal)', a.calories], ['Average HR (bpm)', a.avgHr], ['Max HR (bpm)', a.maxHr], ['Session load (TRIMP)', a.trimp], ['HR drift (%)', a.drift], ['HRR60 (bpm)', a.hrr60], ['HRR120 (bpm)', a.hrr120], ['Peak heat strain (PSI)', a.psiPeak], ['Lowest SpO2 (%)', a.spo2Min], ['Time below 95% SpO2 (min)', a.timeBelow95], ['Temperature rise (C)', a.tempRise], ['Elevation gain (m)', a.elevation], ['Steps', a.steps], ['Average temperature (C)', a.avgTemp], ['Fatigue change', a.fatigueDelta], ['Body battery change', a.bbDelta], [], ['t (s)', 'hr', 'pace (s/km)', 'elevation (m)', 'temp (C)', 'spo2 (%)', 'spo2 reliable', 'psi', 'phase', 'fatigue', 'body battery', 'distance (m)']];
      (a.samples && a.samples.length ? a.samples : ActivityTracker.syntheticSamples(a)).forEach((s) => rows.push([s.t, s.hr, s.pace, s.elev, s.temp, s.spo2, s.spo2Ok ? 1 : 0, s.psi, s.phase, s.fatigue, s.bb, s.dist]));
      return BL.toCSV(rows);
    }
  }
  BL.ActivityTracker = ActivityTracker;
})(window.BL = window.BL || {});
