/* ==========================================================================
   BIOTEX LIFE — data.js
   Demo datasets, constants and seed records (no backend required).
   ========================================================================== */
(function (BL) {
  'use strict';

  const INITIAL_VITALS = {
    hr: 72, restingHr: 61, hrMax: 142, hrv: 54, spo2: 98,
    temp: 36.7, tempBaseline: 36.6,
    bodyBattery: 78, fatigue: 32, recovery: 82, stress: 24, sleepScore: 86,
    calories: 624, distanceKm: 6.4, activeMinutes: 74,
    trainingLoad: 68, jacketBattery: 82,
    bbCharged: 54, bbDrained: 26,
  };

  const SENSORS = [
    /* the jacket carries four sensors — ECG electrodes, an optical pulse sensor (HR + SpO₂) and a skin-temperature sensor; GPS comes from the phone */
    { id: 'ecg', name: 'ECG Electrodes', icon: 'ecg' },
    { id: 'hr', name: 'Heart Rate (optical)', icon: 'heart' },
    { id: 'spo2', name: 'SpO₂ (optical)', icon: 'droplet' },
    { id: 'temp', name: 'Skin Temperature', icon: 'thermometer' },
    { id: 'gps', name: 'GPS (phone)', icon: 'gps' },
  ];

  const HR_ZONES = [
    { zone: 1, name: 'Recovery', min: 90, max: 108, cls: 'z1' },
    { zone: 2, name: 'Endurance', min: 109, max: 126, cls: 'z2' },
    { zone: 3, name: 'Aerobic', min: 127, max: 144, cls: 'z3' },
    { zone: 4, name: 'Threshold', min: 145, max: 162, cls: 'z4' },
    { zone: 5, name: 'Maximum', min: 163, max: 220, cls: 'z5' },
  ];
  const ZONE_MINUTES_TODAY = [18, 24, 21, 9, 2];

  /** Activity type profiles used by the simulation engine */
  const ACTIVITY_TYPES = [
    /* strainRate = fatigue points per simulated minute; drainPerMin = body-battery points per minute */
    { id: 'walk', label: 'Walking', noun: 'Walk', category: 'walk', icon: 'walk', desc: 'Steady pace, low strain', speedKmh: 5.7, hrBase: 114, hrVar: 8, kcalPerMin: 5.8, strainRate: 0.19, drainPerMin: 0.29, elevPerKm: 13, intensity: 0.35 },
    { id: 'run', label: 'Running', noun: 'Run', category: 'run', icon: 'run', desc: 'Aerobic & threshold work', speedKmh: 11.6, hrBase: 152, hrVar: 7, kcalPerMin: 11.5, strainRate: 0.45, drainPerMin: 0.61, elevPerKm: 14, intensity: 0.85 },
    { id: 'cycle', label: 'Cycling', noun: 'Ride', category: 'cycle', icon: 'bike', desc: 'Road & endurance rides', speedKmh: 22, hrBase: 136, hrVar: 8, kcalPerMin: 9, strainRate: 0.24, drainPerMin: 0.35, elevPerKm: 10, intensity: 0.6 },
    { id: 'hike', label: 'Hiking', noun: 'Hike', category: 'walk', icon: 'hike', desc: 'Trail with elevation', speedKmh: 4.2, hrBase: 126, hrVar: 9, kcalPerMin: 7.5, strainRate: 0.14, drainPerMin: 0.2, elevPerKm: 45, intensity: 0.5 },
    { id: 'training', label: 'Training', noun: 'Training', category: 'training', icon: 'dumbbell', desc: 'Strength & conditioning', speedKmh: 0, hrBase: 138, hrVar: 14, kcalPerMin: 9.5, strainRate: 0.32, drainPerMin: 0.4, elevPerKm: 0, intensity: 0.65 },
    { id: 'recovery', label: 'Recovery Walk', noun: 'Recovery Walk', category: 'walk', icon: 'leaf', desc: 'Gentle, parasympathetic', speedKmh: 4.8, hrBase: 98, hrVar: 5, kcalPerMin: 4.2, strainRate: 0.07, drainPerMin: 0.14, elevPerKm: 8, intensity: 0.2 },
    { id: 'intervals', label: 'Interval Run', noun: 'Interval Run', category: 'run', icon: 'activity', desc: '5 × 3 min hard · 2 min easy', speedKmh: 10.5, hrBase: 150, hrVar: 6, kcalPerMin: 11, strainRate: 0.5, drainPerMin: 0.65, elevPerKm: 12, intensity: 0.85, intervals: { warmup: 9, hard: 3, easy: 2, reps: 5, cooldown: 11 } },
  ];
  const activityType = (id) => ACTIVITY_TYPES.find((t) => t.id === id) || ACTIVITY_TYPES[0];
  const activityName = (id, date) => {
    const t = activityType(id);
    if (t.id === 'recovery') return 'Recovery Walk';
    const h = (date || new Date()).getHours();
    const part = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
    return `${part} ${t.noun}`;
  };

  /* ---------- 24-hour series (index = hour) ---------- */
  const HR_24 = [58, 56, 55, 56, 57, 60, 66, 84, 112, 96, 82, 78, 76, 80, 86, 84, 82, 94, 138, 120, 90, 76, 68, 62];
  const TEMP_24 = [36.3, 36.2, 36.2, 36.3, 36.3, 36.4, 36.5, 36.6, 36.8, 36.7, 36.6, 36.7, 36.7, 36.8, 36.8, 36.7, 36.7, 36.9, 37.3, 37.1, 36.8, 36.6, 36.5, 36.4];
  const BB_24 = [62, 67, 72, 77, 82, 86, 90, 92, 88, 84, 81, 78, 77, 76, 75, 74, 73, 72, 60, 56, 57, 58, 59, 60];
  const BB_EVENTS = [
    { time: '12:00 AM', hour: 0, label: 'Sleep', color: 'purple', delta: '+34' },
    { time: '7:08 AM', hour: 7, label: 'Wake', color: 'aqua', delta: '' },
    { time: '8:10 AM', hour: 8, label: 'Walk', color: 'blue', delta: '−8' },
    { time: '1:00 PM', hour: 13, label: 'Work', color: 'muted', delta: '−3' },
    { time: '6:20 PM', hour: 18, label: 'Workout', color: 'orange', delta: '−18' },
  ];
  const HOUR_LABELS = ['12 AM', '', '', '', '', '', '6 AM', '', '', '', '', '', '12 PM', '', '', '', '', '', '6 PM', '', '', '', '', '11 PM'];

  /* ---------- 7-day series (oldest → yesterday; today appended live) ---------- */
  const WEEK = {
    distance: [4.8, 0, 8.1, 5.4, 10.2, 3.7],
    activeMinutes: [48, 22, 81, 55, 96, 40],
    calories: [470, 290, 690, 510, 860, 410],
    recovery: [72, 78, 68, 84, 81, 88],
    fatigue: [41, 36, 48, 30, 34, 27],
    hrv: [48, 51, 47, 55, 52, 58],
    restingHr: [63, 62, 64, 61, 62, 60],
    trainingLoad: [52, 60, 45, 72, 64, 80],
    sleepHours: [7.2, 6.8, 7.5, 6.9, 7.8, 8.1],
    temp: [36.5, 36.6, 36.6, 36.5, 36.7, 36.6],
    bodyBattery: [58, 64, 72, 55, 68, 74],
    activeMinutes: [48, 15, 92, 61, 118, 40],
  };
  const SLEEP_TODAY_HOURS = 7.8;

  /** Generates a plausible series of n points around a base with seeded noise */
  const series = (seed, n, base, spread, trend, min, max, decimals) => {
    const rnd = BL.seeded(seed);
    const out = [];
    let v = base;
    for (let i = 0; i < n; i++) {
      v = base + (trend || 0) * (i / n) + (rnd() - 0.5) * spread * 2 + Math.sin(i / 2.7) * spread * 0.4;
      v = BL.clamp(v, min, max);
      out.push(BL.round(v, decimals || 0));
    }
    return out;
  };
  const MONTH = {
    distance: series(11, 30, 5.2, 3.2, 0.8, 0, 14, 1).map((v, i) => (i % 7 === 2 ? 0 : v)),
    calories: series(13, 30, 560, 180, 40, 250, 980),
    recovery: series(14, 30, 76, 10, 4, 48, 95),
    fatigue: series(15, 30, 38, 11, -4, 12, 70),
    hrv: series(16, 30, 51, 5, 3, 38, 66),
    restingHr: series(17, 30, 62, 2, -1, 56, 68),
    trainingLoad: series(18, 30, 62, 16, 6, 20, 96),
    sleepHours: series(19, 30, 7.3, 0.6, 0.2, 5.5, 9, 1),
    temp: series(20, 30, 36.6, 0.12, 0, 36.3, 36.9, 2),
    bodyBattery: series(21, 30, 66, 12, 4, 35, 92),
    activeMinutes: series(22, 30, 62, 32, 6, 0, 150),
    heartRate: series(23, 30, 74, 4, -1, 66, 84),
  };
  const YEAR = {
    distance: series(31, 12, 128, 32, 24, 60, 220).map((v) => BL.round(v)),
    calories: series(33, 12, 16200, 2800, 900, 10000, 24000),
    recovery: series(34, 12, 74, 6, 5, 55, 90),
    fatigue: series(35, 12, 40, 7, -5, 20, 60),
    hrv: series(36, 12, 49, 4, 4, 38, 62),
    restingHr: series(37, 12, 63, 1.5, -2, 57, 68),
    trainingLoad: series(38, 12, 58, 12, 8, 30, 90),
    sleepHours: series(39, 12, 7.2, 0.4, 0.3, 6, 8.5, 1),
    temp: series(40, 12, 36.6, 0.08, 0, 36.4, 36.8, 2),
    bodyBattery: series(41, 12, 64, 8, 6, 40, 88),
    activeMinutes: series(42, 12, 1900, 420, 300, 900, 3200),
    heartRate: series(43, 12, 75, 3, -2, 66, 84),
  };

  /* ---------- Sleep ---------- */
  const SLEEP = {
    score: 86, total: '7h 48m', totalMin: 468, inBed: '8h 14m', inBedMin: 494, bedtime: '10:54 PM', wake: '7:08 AM',
    stages: [['awake', 8], ['light', 24], ['deep', 38], ['light', 30], ['rem', 18], ['light', 36], ['deep', 34], ['light', 28], ['rem', 26], ['awake', 6], ['light', 40], ['deep', 36], ['light', 30], ['rem', 30], ['light', 38], ['rem', 28], ['awake', 12], ['light', 32]],
  };

  /* ---------- Seed records ---------- */
  const today = new Date();
  const at = (daysAgo, h, m) => { const d = new Date(today); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.getTime(); };

  const SEED_ACTIVITIES = [
    { id: 'seed-a1', type: 'walk', name: 'Morning Walk', date: at(0, 8, 10), distanceKm: 6.24, durationSec: 2896, avgPace: 464, calories: 512, avgHr: 128, maxHr: 158, elevation: 82, avgTemp: 36.9, fatigueDelta: 9, bbDelta: -14, load: 68, zones: [9, 17, 15, 6, 1], seeded: true },
    { id: 'seed-a2', type: 'run', name: 'Morning Run', date: at(1, 6, 52), distanceKm: 4.82, durationSec: 1865, avgPace: 387, calories: 468, avgHr: 152, maxHr: 171, elevation: 54, avgTemp: 37.1, fatigueDelta: 14, bbDelta: -19, load: 74, zones: [2, 5, 10, 11, 3], seeded: true },
    { id: 'seed-a3', type: 'recovery', name: 'Recovery Walk', date: at(2, 17, 40), distanceKm: 3.4, durationSec: 2530, avgPace: 744, calories: 190, avgHr: 104, maxHr: 121, elevation: 22, avgTemp: 36.7, fatigueDelta: 3, bbDelta: -6, load: 40, zones: [28, 12, 2, 0, 0], seeded: true },
    { id: 'seed-a4', type: 'cycle', name: 'Evening Ride', date: at(3, 18, 30), distanceKm: 18.6, durationSec: 2790, avgPace: 150, calories: 540, avgHr: 139, maxHr: 162, elevation: 140, avgTemp: 37.0, fatigueDelta: 11, bbDelta: -16, load: 66, zones: [4, 10, 19, 11, 2], seeded: true },
    { id: 'seed-a5', type: 'training', name: 'Strength Training', date: at(4, 7, 15), distanceKm: 0, durationSec: 2280, avgPace: 0, calories: 392, avgHr: 131, maxHr: 160, elevation: 0, avgTemp: 37.0, fatigueDelta: 12, bbDelta: -15, load: 62, zones: [6, 9, 14, 8, 1], seeded: true },
    { id: 'seed-a7', type: 'intervals', name: 'Interval Session', date: at(6, 6, 40), distanceKm: 7.6, durationSec: 2700, avgPace: 355, calories: 560, avgHr: 142, maxHr: 176, elevation: 48, avgTemp: 37.2, fatigueDelta: 16, bbDelta: -21, load: 73, zones: [7, 4.5, 8, 8, 8], seeded: true },
    { id: 'seed-a6', type: 'hike', name: 'Weekend Hike', date: at(8, 6, 30), distanceKm: 9.4, durationSec: 7920, avgPace: 842, calories: 820, avgHr: 124, maxHr: 151, elevation: 410, avgTemp: 37.0, fatigueDelta: 18, bbDelta: -26, load: 80, zones: [30, 52, 38, 10, 2], seeded: true },
  ];

  const SEED_ECG = [
    { id: 'seed-e1', name: 'Morning resting ECG', date: at(0, 8, 42), durationSec: 252, avgHr: 72, minHr: 64, maxHr: 84, quality: 'Excellent', noise: 'Low', seeded: true },
  ];

  const SEED_NOTIFICATIONS = [
    { id: 'n1', kind: 'device', title: 'Jacket synchronized successfully', body: 'All sensors reported within the last sync window.', time: Date.now() - 2 * 60000, read: false, screen: 'device', icon: 'refresh', color: 'aqua' },
    { id: 'n2', kind: 'recovery', title: 'Recovery increased to 82%', body: 'Overnight HRV and sleep supported a strong recovery.', time: Date.now() - 25 * 60000, read: false, screen: 'recovery', icon: 'leaf', color: 'green' },
    { id: 'n3', kind: 'report', title: 'Your weekly activity report is ready', body: 'Distance, load and recovery trends for the past 7 days.', time: Date.now() - 62 * 60000, read: false, screen: 'analytics', icon: 'analytics', color: 'blue' },
    { id: 'n4', kind: 'alert', title: 'Heart Rate Above Configured Range', body: 'Your heart rate is above the activity range you configured.', time: at(0, 8, 31), read: true, screen: 'heart', icon: 'heart', color: 'red', actions: true },
    { id: 'n5', kind: 'activity', title: 'Morning Walk saved', body: '6.24 km · 48:16 · 128 avg BPM', time: at(0, 8, 58), read: true, screen: 'history', icon: 'walk', color: 'blue' },
    { id: 'n6', kind: 'alert', title: 'Temperature Above Personal Baseline', body: 'Temperature has increased relative to your recent baseline.', time: at(0, 8, 35), read: true, screen: 'temperature', icon: 'thermometer', color: 'orange', actions: true },
    { id: 'n7', kind: 'device', title: 'Battery remaining: 20%', body: 'Charge the jacket before your next session.', time: at(1, 21, 2), read: true, screen: 'device', icon: 'battery', color: 'orange' },
    { id: 'n8', kind: 'alert', title: 'GPS Signal Weak', body: 'Location accuracy may be reduced.', time: at(1, 6, 58), read: true, screen: 'map', icon: 'gps', color: 'orange', actions: true },
    { id: 'n9', kind: 'alert', title: 'ECG Signal Interrupted', body: 'Check jacket fit and electrode contact.', time: at(1, 6, 55), read: true, screen: 'ecg', icon: 'ecg', color: 'red', actions: true },
    { id: 'n10', kind: 'alert', title: 'Jacket Disconnected', body: 'Bluetooth connection to your ECG jacket was interrupted.', time: at(1, 22, 40), read: true, screen: 'device', icon: 'bluetooth', color: 'red', actions: true },
    { id: 'n11', kind: 'alert', title: 'Low SpO₂ Reading', body: 'Review the latest sensor measurement.', time: at(1, 3, 12), read: true, screen: 'heart', icon: 'droplet', color: 'orange', actions: true },
  ];

  const INSIGHTS = [
    { text: 'Recovery is 12% above your seven-day average.', icon: 'trend-up', color: 'green', tag: 'Recovery', screen: 'recovery' },
    { text: 'HRV improved overnight.', icon: 'activity', color: 'aqua', tag: 'HRV', screen: 'heart' },
    { text: 'Your resting heart rate remains stable.', icon: 'heart', color: 'blue', tag: 'Heart', screen: 'heart' },
    { text: 'Fatigue increased after your evening workout.', icon: 'gauge', color: 'orange', tag: 'Fatigue', screen: 'fatigue' },
    { text: 'Body Battery recovered strongly during sleep.', icon: 'moon', color: 'purple', tag: 'Energy', screen: 'body-battery' },
    { text: 'You covered 18% more distance than last week.', icon: 'route', color: 'blue', tag: 'Activity', screen: 'analytics' },
    { text: 'Your temperature remains close to baseline.', icon: 'thermometer', color: 'green', tag: 'Temperature', screen: 'temperature' },
    { text: 'Most of your recent activity was in aerobic heart-rate zones.', icon: 'target', color: 'aqua', tag: 'Zones', screen: 'heart' },
    { text: 'Today appears suitable for moderate training.', icon: 'sparkles', color: 'green', tag: 'Readiness', screen: 'recovery' },
  ];

  /* ---------- 28-day daily records (oldest → newest; the last entry is today and is filled live) ---------- */
  const DAILY_28 = {
    /* designed loads for days −27 … −9; days −8 … today are computed from the activity history */
    designedLoads: [58, 92, 0, 38, 0, 120, 64, 0, 68, 95, 0, 48, 136, 84, 0, 70, 110, 62, 0],
    lnRmssd: [3.98, 4.05, 4.02, 3.96, 4.01, 4.03, 3.97, 3.93, 3.99, 3.96, 3.91, 3.90, 3.95, 3.95, 3.93, 3.94, 3.92, 3.96, 4.02, 3.99, 3.86, 4.00, 3.96, 3.80, 3.98, 4.01, 3.97, null],
    restingHr: [63, 62, 64, 61, 62, 60, 61, 63, 62, 63, 61, 62, 61, 60, 62, 61, 63, 62, 60, 61, 64, 62, 61, 65, 62, 60, 61, null],
    tempDev: [0.0, 0.1, -0.1, 0.0, 0.1, 0.0, -0.1, 0.1, 0.2, 0.0, 0.1, 0.0, -0.1, 0.0, 0.1, 0.0, 0.0, 0.2, 0.1, 0.0, 0.3, 0.1, 0.0, 0.4, 0.2, 0.1, 0.0, null],
    spo2Rest: [98, 98, 97, 98, 98, 99, 98, 98, 97, 98, 98, 98, 97, 98, 98, 98, 98, 97, 98, 98, 98, 97, 98, 97, 98, 98, 98, null],
  };
  const HRR60_WEEKS = [26, 27, 28, 27, 30, 31, 33]; // the 8th week is the latest measured session

  /* ---------- Reference content: signal map (what each sensor collects and what it tells your training) ---------- */
  const SIGNAL_MAP = [
    { id: 'ecg', name: 'ECG', color: 'blue', icon: 'ecg', desc: 'Electrical activity of the heart, beat by beat', raw: 'Voltage waveform sampled at 250–500 Hz, plus lead-off status',
      params: ['R-peak times and RR intervals (ms)', 'Beat-to-beat heart rate', 'PR, QRS and QT intervals', 'R-wave amplitude', 'Irregular and extra beats per hour'],
      derived: ['HRV: RMSSD, SDNN, pNN50, LF/HF', 'Poincaré SD1/SD2 and DFA α1', 'Breathing rate from the ECG', 'Aerobic threshold estimate (DFA α1 near 0.75)', 'Recovery and stress status from HRV trend', 'QTc as a rhythm safety check'] },
    { id: 'hr', name: 'Heart rate', color: 'orange', icon: 'heart', desc: 'Optical pulse sensor (PPG) on the skin', raw: 'Pulse wave from light reflected by blood flow under the skin',
      params: ['Pulse rate (bpm), second by second', 'Pulse-to-pulse interval', 'Pulse amplitude', 'Resting, average and peak HR', 'HR at fixed times after stopping'],
      derived: ['HRmax, HR reserve and five zones', 'Time in each zone', 'Heart-rate recovery in 60 s', 'TRIMP training load per session', 'Acute vs chronic load ratio', 'HR drift at steady effort', 'Calories and VO₂max estimate'] },
    { id: 'spo2', name: 'SpO₂', color: 'green', icon: 'droplet', desc: 'Oxygen saturation of arterial blood', raw: 'Red and infrared light absorption, pulsing (AC) and steady (DC) parts',
      params: ['Red-to-infrared ratio R', 'SpO₂ in percent', 'Perfusion index (signal strength)', 'Signal-quality flag (waveform stability)'],
      derived: ['Resting baseline SpO₂', 'Lowest SpO₂ in a session', 'Desaturation events (drop of 4 % or more)', 'Time spent below 90 %', 'Altitude acclimatisation trend', 'SpO₂ recovery time between intervals'] },
    { id: 'temp', name: 'Body temperature', color: 'amber', icon: 'thermometer', desc: 'Skin temperature at the sensor site', raw: 'Skin temperature in °C, typically to ±0.1 °C',
      params: ['Skin temperature at rest', 'Skin temperature during work', 'Night-time skin temperature', 'Rate of rise during exercise', 'Cool-down time after stopping'],
      derived: ['Personal baseline and daily deviation', 'Heat-strain index, together with HR', 'Early illness or overreaching flag (0.5 °C or more above baseline)', 'Cycle-phase shift (about 0.3–0.5 °C)', 'Warm-up and cool-down completeness'] },
  ];
  const SIGNAL_COMBINED = [
    { title: 'Pulse arrival time', sensors: ['blue', 'orange'], text: 'ECG R-peak to pulse arrival. Tracks blood-pressure trend, not an absolute reading.' },
    { title: 'HR cross-check', sensors: ['blue', 'orange'], text: 'When ECG and optical HR disagree by more than 5 bpm, flag the optical reading as artefact.' },
    { title: 'Heat-strain index', sensors: ['orange', 'amber'], text: 'HR and temperature rise combined into a 0–10 strain score for hot sessions.' },
    { title: 'Morning readiness', sensors: ['blue', 'orange', 'green', 'amber'], text: 'HRV, resting HR, skin temperature and SpO₂, each scored against your own baseline.' },
    { title: 'Load vs recovery', sensors: ['blue', 'orange'], text: 'TRIMP load plotted against HRV trend shows when to push and when to back off.' },
  ];

  const DEVICE_INFO = [
    ['Model', 'Biotex ECG Jacket BTX-J1'],
    ['Serial number', 'BTX-ECG-0427'],
    ['Firmware', 'v1.0.8'],
    ['Bluetooth', 'BLE 5.3 · MAC 7C:2A:9E:41:0B:D3'],
    ['Electrodes', '7 textile dry electrodes'],
    ['Sampling', 'ECG 250 Hz · PPG 100 Hz · Skin temp 1 Hz'],
    ['Battery', '620 mAh Li-Po · USB-C'],
    ['Water resistance', 'IPX4 (sensor module removable)'],
    ['Manufacturer', 'Biotex Life Solutions Pvt. Ltd., Hyderabad'],
  ];

  BL.data = {
    INITIAL_VITALS, SENSORS, HR_ZONES, ZONE_MINUTES_TODAY, ACTIVITY_TYPES, activityType, activityName,
    HR_24, TEMP_24, BB_24, BB_EVENTS, HOUR_LABELS, WEEK, MONTH, YEAR, SLEEP, SLEEP_TODAY_HOURS,
    SEED_ACTIVITIES, SEED_ECG, SEED_NOTIFICATIONS, INSIGHTS, DEVICE_INFO, DAILY_28, HRR60_WEEKS, SIGNAL_MAP, SIGNAL_COMBINED,
  };
})(window.BL = window.BL || {});
