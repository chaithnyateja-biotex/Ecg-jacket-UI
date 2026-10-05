/* ==========================================================================
   BIOTEX LIFE — simulator.js
   HealthDataSimulator + BodyBattery / Fatigue / Recovery engines.
   Values move smoothly (random-walk toward targets) and never leave
   physiological bounds. Demo only — not a validated algorithm.
   ========================================================================== */
(function (BL) {
  'use strict';
  const { clamp, round, gauss } = BL;

  /* ---------- Scoring engines (pure functions) ---------- */
  const BodyBatteryEngine = {
    label(v) { return v >= 75 ? 'HIGH ENERGY' : v >= 50 ? 'GOOD ENERGY' : v >= 25 ? 'MODERATE' : 'LOW ENERGY'; },
    badge(v) { return v >= 75 ? 'aqua' : v >= 50 ? 'green' : v >= 25 ? 'orange' : 'red'; },
  };
  const FatigueEngine = {
    /* Bands tuned so the demo's 32/100 reads as "LOW" (0–39 Low · 40–59 Moderate · 60–79 High · 80–100 Very High) */
    label(v) { return v < 40 ? 'LOW' : v < 60 ? 'MODERATE' : v < 80 ? 'HIGH' : 'VERY HIGH'; },
    badge(v) { return v < 40 ? 'orange' : v < 60 ? 'orange' : v < 80 ? 'red' : 'red'; },
    recoveryEtaMinutes(v) { return Math.round(v * 14.4); }, // 32 → 7h 40m
  };
  const RecoveryEngine = {
    label(v) { return v >= 85 ? 'EXCELLENT' : v >= 70 ? 'READY' : v >= 50 ? 'MODERATE' : 'RECOVER'; },
    labelLong(v) { return v >= 85 ? 'EXCELLENT RECOVERY' : v >= 70 ? 'READY TO TRAIN' : v >= 50 ? 'MODERATE — TRAIN LIGHT' : 'PRIORITISE RECOVERY'; },
    badge(v) { return v >= 85 ? 'green' : v >= 70 ? 'green' : v >= 50 ? 'orange' : 'red'; },
  };
  const stressLabel = (v) => (v <= 25 ? 'LOW' : v <= 50 ? 'MODERATE' : v <= 75 ? 'HIGH' : 'VERY HIGH');
  const stressBadge = (v) => (v <= 25 ? 'green' : v <= 50 ? 'orange' : 'red');
  const loadLabel = (v) => (v < 40 ? 'LOW' : v <= 75 ? 'OPTIMAL' : v <= 90 ? 'HIGH' : 'VERY HIGH');
  const loadBadge = (v) => (v < 40 ? 'blue' : v <= 75 ? 'aqua' : v <= 90 ? 'orange' : 'red');

  class HealthDataSimulator {
    constructor() {
      this.ev = BL.emitter();
      const v = BL.data.INITIAL_VITALS;
      this.s = Object.assign({}, v, {
        hrFloat: v.hr, tempFloat: v.temp, bbFloat: v.bodyBattery, strainAcc: 0, calFloat: v.calories, activeMinutesFloat: v.activeMinutes, stepsFloat: v.steps,
      });
      this.baseFatigue = v.fatigue; this.baseRecovery = v.recovery; this.baseLoad = v.trainingLoad;
      this.hrvFloat = v.hrv; this.stressFloat = v.stress; this.spo2Float = v.spo2; this.respFloat = v.resp;
      this.activity = null;
      this.hrHistory = Array.from({ length: 48 }, (_, i) => Math.round(72 + Math.sin(i / 3) * 2 + (Math.random() - 0.5) * 2));
      this.tempHistory = BL.data.TEMP_24.slice();
      this.timer = null; this.last = 0; this.frozen = false;
      this.recompute();
    }

    on(type, fn) { return this.ev.on(type, fn); }
    get state() { return this.s; }

    start() { if (this.timer) return; this.last = performance.now(); this.timer = setInterval(() => this.tick(), 1000); }
    stop() { clearInterval(this.timer); this.timer = null; }
    /** Freeze vitals while the jacket is disconnected */
    setFrozen(f) { this.frozen = !!f; }

    /** Called by ActivityTracker: { type, intensity, elapsedMin } or null */
    setActivity(ctx) { this.activity = ctx; }

    /** Strain integration — called per simulated minute slice during activity */
    addStrain(type, simMinutes) {
      const s = this.s;
      s.strainAcc += type.strainRate * simMinutes;
      s.bbFloat = clamp(s.bbFloat - type.drainPerMin * simMinutes, 0, 100);
      s.calFloat += type.kcalPerMin * simMinutes;
      s.activeMinutesFloat += simMinutes;
      s.stepsFloat += type.cadence * 60 * simMinutes;
      s.bbDrained = round(BL.data.INITIAL_VITALS.bbDrained + (BL.data.INITIAL_VITALS.bodyBattery - s.bbFloat > 0 ? BL.data.INITIAL_VITALS.bodyBattery - s.bbFloat : 0));
      this.recompute();
    }

    tick() {
      const now = performance.now();
      const dt = clamp((now - this.last) / 1000, 0.2, 5);
      this.last = now;
      if (this.frozen) { this.ev.emit('tick', this.s); return; }
      const s = this.s, act = this.activity;
      const t = now / 1000;

      /* Heart rate: smooth pursuit of a target with gentle beat-to-beat noise */
      let target;
      if (act) {
        const ramp = clamp(act.elapsedMin / 6, 0, 1); // warm-up over ~6 simulated minutes
        const wave = Math.sin(t / 25) * act.type.hrVar * 0.6 + Math.sin(t / 7.3) * 1.5;
        target = 78 + (act.type.hrBase - 78) * ramp + wave;
        if (act.paused) target = 92 + Math.sin(t / 20) * 3;
      } else {
        target = 71.5 + Math.sin(t / 60) * 1.8 + Math.sin(t / 13) * 0.6;
      }
      s.hrFloat += (target - s.hrFloat) * (act ? 0.09 : 0.06) * dt + gauss() * 0.55;
      s.hrFloat = clamp(s.hrFloat, 44, Math.min(205, (BL.settings.profile().maxHr || 190) + 6));
      s.hr = Math.round(s.hrFloat);
      if (s.hr > s.hrMax) s.hrMax = s.hr;
      this.hrHistory.push(s.hr); if (this.hrHistory.length > 60) this.hrHistory.shift();

      /* Temperature: very slow drift */
      const tempTarget = act ? 36.74 + clamp(act.elapsedMin / 25, 0, 1) * act.type.intensity * 0.6 : 36.68 + Math.sin(t / 420) * 0.03;
      s.tempFloat += clamp((tempTarget - s.tempFloat) * 0.015 * dt, -0.004, 0.004) + gauss() * 0.0015;
      s.tempFloat = clamp(s.tempFloat, 35.8, 38.2);
      s.temp = round(s.tempFloat, 2);
      this.tempHistory[new Date().getHours()] = round(s.tempFloat, 1);

      /* SpO₂ 97–99 mostly */
      this.spo2Float += (98.1 - this.spo2Float) * 0.08 * dt + gauss() * 0.22;
      s.spo2 = clamp(Math.round(this.spo2Float), 95, 100);

      /* Respiration 13–17 at rest */
      const respTarget = act ? (act.paused ? 17 : 17 + act.type.intensity * 14) : 15 + Math.sin(t / 90) * 0.8;
      this.respFloat += (respTarget - this.respFloat) * 0.06 * dt + gauss() * 0.12;
      s.resp = clamp(Math.round(this.respFloat), 10, 38);

      /* HRV & stress drift */
      this.hrvFloat += ((act ? 46 : 54) - this.hrvFloat) * 0.01 * dt + gauss() * 0.1;
      s.hrv = clamp(Math.round(this.hrvFloat), 20, 120);
      const stressTarget = act ? 24 + act.type.intensity * 22 : 23.5 + Math.sin(t / 200) * 1.5;
      this.stressFloat += (stressTarget - this.stressFloat) * 0.02 * dt + gauss() * 0.15;
      s.stress = clamp(Math.round(this.stressFloat), 0, 100);

      /* At rest: slow recharge and strain decay */
      if (!act) {
        s.bbFloat = clamp(s.bbFloat + dt / 300, 0, 100); // +1 per 5 min at rest
        s.strainAcc = Math.max(0, s.strainAcc - dt / 720);
        s.bbCharged = round(BL.data.INITIAL_VITALS.bbCharged + Math.max(0, s.bbFloat - BL.data.INITIAL_VITALS.bodyBattery));
      }
      this.recompute();
      this.ev.emit('tick', s);
    }

    recompute() {
      const s = this.s;
      s.bodyBattery = Math.round(clamp(s.bbFloat, 0, 100));
      s.fatigue = Math.round(clamp(this.baseFatigue + s.strainAcc, 0, 100));
      s.recovery = Math.round(clamp(this.baseRecovery - s.strainAcc * 0.5, 0, 100));
      s.trainingLoad = Math.round(clamp(this.baseLoad + s.strainAcc * 0.4, 0, 100));
      s.calories = Math.round(s.calFloat);
      s.activeMinutes = Math.round(s.activeMinutesFloat);
      s.steps = Math.round(s.stepsFloat);
      s.tempDeviation = round(s.temp - s.tempBaseline, 2);
    }

    /* ---------- Derived descriptors ---------- */
    describe() {
      const s = this.s, act = this.activity;
      const rec = s.recovery, fat = s.fatigue;
      let readinessTitle, readinessText;
      if (rec >= 70 && fat < 40) { readinessTitle = 'Ready for your day'; readinessText = 'Recovery is strong and fatigue remains low.'; }
      else if (rec >= 70) { readinessTitle = 'Good to go — pace yourself'; readinessText = 'Recovery is solid but fatigue is building after your session.'; }
      else if (rec >= 50) { readinessTitle = 'Take it steady today'; readinessText = 'Recovery is moderate; keep intensity controlled.'; }
      else { readinessTitle = 'Prioritise recovery'; readinessText = 'Your body is asking for rest and light movement.'; }
      const dev = s.tempDeviation;
      const tempStatus = Math.abs(dev) <= 0.3 ? 'Within Baseline' : dev > 0.6 ? 'Above Baseline' : dev > 0.3 ? 'Slightly Elevated' : 'Below Baseline';
      const hrStatus = act && !act.paused ? 'Active' : s.hr > 100 ? 'Elevated' : s.hr < 50 ? 'Low' : 'Normal';
      return {
        readinessTitle, readinessText, tempStatus,
        tempStatusColor: Math.abs(dev) <= 0.3 ? 'green' : Math.abs(dev) <= 0.6 ? 'orange' : 'red',
        hrStatus, hrStatusColor: hrStatus === 'Normal' ? 'green' : hrStatus === 'Active' ? 'aqua' : 'orange',
        bodyBatteryStatus: BodyBatteryEngine.label(s.bodyBattery), bodyBatteryBadge: BodyBatteryEngine.badge(s.bodyBattery),
        fatigueStatus: FatigueEngine.label(s.fatigue), fatigueBadge: FatigueEngine.badge(s.fatigue), fatigueStatusLong: FatigueEngine.label(s.fatigue) + ' FATIGUE',
        recoveryStatus: RecoveryEngine.label(s.recovery), recoveryStatusLong: RecoveryEngine.labelLong(s.recovery), recoveryBadge: RecoveryEngine.badge(s.recovery),
        stressStatus: stressLabel(s.stress), stressBadge: stressBadge(s.stress),
        trainingLoadStatus: loadLabel(s.trainingLoad), trainingLoadBadge: loadBadge(s.trainingLoad),
        fullRecoveryEta: BL.fmtMinutes(FatigueEngine.recoveryEtaMinutes(s.fatigue)),
      };
    }
  }

  BL.HealthDataSimulator = HealthDataSimulator;
  BL.engines = { BodyBatteryEngine, FatigueEngine, RecoveryEngine, stressLabel, loadLabel, loadBadge };
})(window.BL = window.BL || {});
