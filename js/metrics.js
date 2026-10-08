/* ==========================================================================
   BIOTEX LIFE — metrics.js
   The calculation layer: turns raw signals into training metrics.
   Every function is pure and documented with its source so the app can show
   "how it is calculated" next to every number.

   Sources: Tanaka 2001 (HRmax) · Karvonen 1957 (zones) · Banister 1991 (TRIMP)
   Gabbett 2016 (ACWR) · Uth 2004 (VO2max) · Keytel 2005 (energy) · Moran 1998 (PSI)
   Population formulas carry individual error — calibrate to the athlete.
   ========================================================================== */
(function (BL) {
  'use strict';
  const { clamp, round } = BL;
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1)); };
  const sum = (a) => a.reduce((x, y) => x + y, 0);

  const M = {
    mean, sd, sum,

    /* 1 · Max heart rate — Tanaka 2001: HRmax = 208 − 0.7 × age */
    hrMax(age) { return Math.round(208 - 0.7 * age); },

    /* 2 · Training zones — Karvonen: target = HRrest + % × (HRmax − HRrest) */
    zones(rest, max) {
      const hrr = Math.max(40, max - rest);
      const bands = [[0.5, 0.6, 'Recovery'], [0.6, 0.7, 'Endurance'], [0.7, 0.8, 'Aerobic'], [0.8, 0.9, 'Threshold'], [0.9, 1.0, 'Maximum']];
      return bands.map(([lo, hi, name], i) => ({
        zone: i + 1, name, cls: 'z' + (i + 1), pct: `${Math.round(lo * 100)}–${Math.round(hi * 100)} %`,
        min: Math.round(rest + lo * hrr), max: i === 4 ? max : Math.round(rest + hi * hrr) - 1,
      }));
    },
    zoneIndex(hr, zones) { for (let i = zones.length - 1; i >= 0; i--) if (hr >= zones[i].min) return i; return -1; },

    /* 3 · Heart-rate recovery — HRR60 = HRpeak − HR 60 s after stopping (12 bpm or less is a warning) */
    hrRecovery(samples) {
      if (!samples || !samples.length) return null;
      const peak = samples[0].hr;
      const at = (s) => { const p = samples.find((x) => x.t >= s); return p ? p.hr : null; };
      const h60 = at(60), h120 = at(120);
      return { peak, hr60: h60, hr120: h120, hrr60: h60 != null ? peak - h60 : null, hrr120: h120 != null ? peak - h120 : null, seconds: samples[samples.length - 1].t };
    },
    /** fraction of the (stop − rest) excess still present t seconds after stopping: 0.45·e^(−t/55) + 0.55·e^(−t/1000) → 33 % gone at 60 s, 46 % at 120 s */
    recoveryFraction(t) { return 0.45 * Math.exp(-t / 55) + 0.55 * Math.exp(-t / 1000); },
    /** HRR is only meaningful when the stop followed an effort: a stop after a cool-down starts near rest and the drop is small by design */
    hrrValidStop(peak) { return peak == null || peak >= 115; },
    hrrLabel(hrr60, peak) {
      if (hrr60 == null) return '—';
      if (!this.hrrValidStop(peak)) return `Stopped after a cool-down (${peak} bpm) — stop right after the effort to measure`;
      return hrr60 <= 12 ? 'Warning: 12 bpm or less' : hrr60 < 20 ? 'Below typical' : hrr60 < 30 ? 'Good recovery' : 'Well clear of the 12 bpm warning line';
    },

    /* 4 · Heart-rate variability from RR intervals (ms) */
    hrv(rr) {
      const n = rr.length; if (n < 3) return null;
      const m = mean(rr);
      const diffs = []; for (let i = 1; i < n; i++) diffs.push(rr[i] - rr[i - 1]);
      const rmssd = Math.sqrt(mean(diffs.map((d) => d * d)));
      const sdnn = sd(rr);
      const pnn50 = (diffs.filter((d) => Math.abs(d) > 50).length / diffs.length) * 100;
      return { n, meanRR: Math.round(m), hr: Math.round(60000 / m), rmssd: round(rmssd, 1), sdnn: round(sdnn, 1), pnn50: Math.round(pnn50), lnRmssd: round(Math.log(Math.max(1, rmssd)), 2) };
    },
    /* Breathing rate from the RR wave (respiratory sinus arrhythmia): count the cycles */
    breathingRate(rr) {
      const n = rr.length; if (n < 12) return null;
      const w = 5; const sm = rr.map((_, i) => mean(rr.slice(Math.max(0, i - w), Math.min(n, i + w + 1))));
      const det = rr.map((v, i) => v - sm[i]);
      let peaks = 0, last = -10;
      for (let i = 1; i < n - 1; i++) if (det[i] > det[i - 1] && det[i] >= det[i + 1] && det[i] > 4 && i - last > 2) { peaks++; last = i; }
      const minutes = sum(rr) / 60000;
      return minutes > 0 ? round(peaks / minutes, 1) : null;
    },

    /* 5 · Readiness check — z = (today − 28-day mean) ÷ 28-day SD */
    zscore(x, arr) { const s = sd(arr) || 1; return round((x - mean(arr)) / s, 2); },
    normalRange(arr) { const m = mean(arr), s = sd(arr); return { from: round(m - 0.5 * s, 2), to: round(m + 0.5 * s, 2), mean: round(m, 2), sd: round(s, 3) }; },
    readiness(o) {
      const hrvZ = this.zscore(o.lnToday, o.ln28), rhrZ = this.zscore(o.rhrToday, o.rhr28);
      const flags = [];
      if (hrvZ <= -1) flags.push('HRV z-score −1 or lower');
      if (rhrZ >= 1) flags.push('resting HR z-score +1 or higher');
      if (o.tempDev >= 0.5) flags.push('skin temperature 0.5 °C above baseline');
      const range = this.normalRange(o.ln28);
      const inRange = o.lnToday >= range.from && o.lnToday <= range.to;
      let verdict, label, color;
      if (flags.length) { verdict = 'ease'; label = 'Ease off today'; color = 'orange'; }
      else if (hrvZ > 0.5 && rhrZ < 0.25) { verdict = 'push'; label = 'Above range: good day to push'; color = 'green'; }
      else if (inRange || Math.abs(hrvZ) < 1) { verdict = 'planned'; label = 'In range: train as planned'; color = 'green'; }
      else { verdict = 'planned'; label = 'Train as planned'; color = 'green'; }
      return { hrvZ, rhrZ, flags, range, inRange, verdict, label, color };
    },

    /* 6 · Session load — Banister TRIMP = minutes × x × 0.64 × e^(1.92x), x = (HRavg − HRrest) ÷ (HRmax − HRrest); women 0.86 × e^(1.67x) */
    trimp(minutes, hrAvg, rest, max, sex) {
      const x = clamp((hrAvg - rest) / Math.max(1, max - rest), 0, 1);
      const [a, b] = sex === 'female' ? [0.86, 1.67] : [0.64, 1.92];
      return round(minutes * x * a * Math.exp(b * x), 1);
    },

    /* 7 · Load balance — ACWR = 7-day average load ÷ 28-day average load (0.8–1.3 steady build, > 1.5 spike) */
    acwr(daily) {
      const last7 = daily.slice(-7), last28 = daily.slice(-28);
      const acute = mean(last7), chronic = mean(last28);
      return { acute: round(acute, 1), chronic: round(chronic, 1), ratio: chronic ? round(acute / chronic, 2) : 0, load7: Math.round(sum(last7)), avgWeek28: Math.round(sum(last28) / (last28.length / 7)) };
    },
    acwrSeries(daily) { return daily.map((_, i) => { const a = daily.slice(Math.max(0, i - 6), i + 1), c = daily.slice(Math.max(0, i - 27), i + 1); const cm = mean(c); return cm ? round(mean(a) / cm, 2) : 1; }); },
    acwrLabel(r) { return r < 0.8 ? 'planned deload' : r <= 1.3 ? 'steady build' : r <= 1.5 ? 'building fast' : 'spike — injury risk'; },
    acwrBadge(r) { return r < 0.8 ? 'blue' : r <= 1.3 ? 'aqua' : r <= 1.5 ? 'orange' : 'red'; },
    acwrStatus(r) { return r < 0.8 ? 'DELOAD' : r <= 1.3 ? 'OPTIMAL' : r <= 1.5 ? 'HIGH' : 'SPIKE'; },
    /* Monotony = mean ÷ SD of the last 7 daily loads (above 2 = too uniform) */
    monotony(last7) { const s = sd(last7); return s ? round(mean(last7) / s, 2) : 0; },

    /* 8 · Heart-rate drift — (HR 2nd half − HR 1st half) ÷ HR 1st half × 100 at a steady effort */
    /** cardiovascular drift over the steady part of a session: the warm-up (first 20 % of samples, ≥ 1 sample) is skipped, then 2nd-half mean vs 1st-half mean */
    hrDrift(hrs, skipFrac) {
      const steady = hrs.slice(Math.max(1, Math.floor(hrs.length * (skipFrac == null ? 0.2 : skipFrac))));
      const n = steady.length; if (n < 6) return null;
      const h = Math.floor(n / 2); const a = mean(steady.slice(0, h)), b = mean(steady.slice(h));
      return a ? round(((b - a) / a) * 100, 1) : null;
    },

    /* 9 · VO2max estimate — Uth 2004: 15.3 × HRmax ÷ HRrest */
    vo2max(rest, max) { return round((15.3 * max) / rest, 1); },

    /* 10 · Energy — Keytel 2005: kcal/min = (a + b×HR + c×kg + d×age) ÷ 4.184 */
    kcalPerMin(hr, kg, age, sex) {
      const [a, b, c, d] = sex === 'female' ? [-20.4022, 0.4472, -0.1263, 0.074] : [-55.0969, 0.6309, 0.1988, 0.2017];
      return Math.max(0, (a + b * hr + c * kg + d * age) / 4.184);
    },

    /* 11 · SpO2 from light — R = (ACred ÷ DCred) ÷ (ACir ÷ DCir); SpO2 ≈ 110 − 25 × R (calibrate against a reference oximeter) */
    rRatio(acRed, dcRed, acIr, dcIr) { return (acRed / dcRed) / (acIr / dcIr); },
    spo2FromR(R) { return clamp(110 - 25 * R, 70, 100); },
    rFromSpo2(spo2) { return round((110 - spo2) / 25, 3); },

    /* 12 · Heat strain — Moran 1998 PSI = 5 × (T − T0) ÷ (39.5 − T0) + 5 × (HR − HR0) ÷ (180 − HR0), scale 0–10 */
    psi(T, T0, HR, HR0) { return clamp(5 * (T - T0) / (39.5 - T0) + 5 * (HR - HR0) / (180 - HR0), 0, 10); },
    psiLabel(v) { return v < 2 ? 'No strain' : v < 4 ? 'Low' : v < 6 ? 'Moderate' : v < 8 ? 'High' : 'Very high'; },

    /* Combined — only possible with two or more sensors */
    crossCheck(ecgHr, ppgHr) { const diff = Math.abs(ecgHr - ppgHr); return { diff, artefact: diff > 5, label: diff > 5 ? 'Motion artefact — flag' : diff <= 1 ? 'Agree within 1 bpm' : `Agree within ${diff} bpm` }; },

    /* Insight sentences from computed numbers (wellness guidance only) */
    insights(ctx) {
      const out = [];
      if (ctx.acwr) out.push({ text: `Training load ratio is ${ctx.acwr.ratio.toFixed(2)} — ${this.acwrLabel(ctx.acwr.ratio)} (7-day ${ctx.acwr.load7} TRIMP vs ${ctx.acwr.avgWeek28} per week average).`, icon: 'target', color: this.acwrBadge(ctx.acwr.ratio), tag: 'Load', screen: 'analytics' });
      if (ctx.readiness) out.push({ text: `Morning HRV z-score ${ctx.readiness.hrvZ >= 0 ? '+' : ''}${ctx.readiness.hrvZ.toFixed(1)}, resting HR z-score ${ctx.readiness.rhrZ >= 0 ? '+' : ''}${ctx.readiness.rhrZ.toFixed(1)} — ${ctx.readiness.label.toLowerCase()}.`, icon: 'activity', color: ctx.readiness.color, tag: 'Readiness', screen: 'recovery' });
      if (ctx.hrr && ctx.hrr.hrr60 != null) out.push({ text: `Heart-rate recovery after ${ctx.hrr.source ? ctx.hrr.source : 'your last session'}: −${ctx.hrr.hrr60} bpm in 60 s — ${this.hrrLabel(ctx.hrr.hrr60).toLowerCase()}.`, icon: 'heart', color: ctx.hrr.hrr60 <= 12 ? 'red' : 'green', tag: 'Recovery', screen: 'heart' });
      if (ctx.vo2max) out.push({ text: `Estimated VO₂max ${ctx.vo2max} ml/kg/min from HRmax ÷ HRrest — watch the trend more than the number.`, icon: 'trend-up', color: 'blue', tag: 'Fitness', screen: 'heart' });
      if (ctx.drift != null) out.push({ text: `Heart-rate drift ${ctx.drift >= 0 ? '+' : ''}${ctx.drift}% in your last steady session — ${Math.abs(ctx.drift) < 5 ? 'your aerobic base holds for that duration' : 'the effort was above your aerobic base for that duration'}.`, icon: 'gauge', color: Math.abs(ctx.drift) < 5 ? 'green' : 'orange', tag: 'Drift', screen: 'heart' });
      return out;
    },
  };

  BL.metrics = M;
})(window.BL = window.BL || {});
