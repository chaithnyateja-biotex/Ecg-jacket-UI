/* ==========================================================================
   BIOTEX LIFE — storage.js
   StorageManager: namespaced localStorage with in-memory fallback.
   SettingsStore: persisted user settings + profile with change events.
   ========================================================================== */
(function (BL) {
  'use strict';

  const PREFIX = 'biotexlife.';
  const memory = new Map();
  let available = false;
  try {
    const k = PREFIX + '__probe';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    available = true;
  } catch (e) { available = false; }

  const StorageManager = {
    available,
    get(key, fallback) {
      try {
        const raw = available ? window.localStorage.getItem(PREFIX + key) : memory.get(PREFIX + key);
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try {
        const raw = JSON.stringify(value);
        if (available) window.localStorage.setItem(PREFIX + key, raw); else memory.set(PREFIX + key, raw);
        return true;
      } catch (e) { console.warn('[BL] storage write failed', key, e); return false; }
    },
    remove(key) { try { if (available) window.localStorage.removeItem(PREFIX + key); else memory.delete(PREFIX + key); } catch (e) { /* ignore */ } },
    keys() {
      const out = [];
      if (available) { for (let i = 0; i < window.localStorage.length; i++) { const k = window.localStorage.key(i); if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length)); } }
      else memory.forEach((_, k) => out.push(k.slice(PREFIX.length)));
      return out;
    },
    clearAll() { this.keys().forEach((k) => this.remove(k)); },
  };

  /* ---------- Settings & profile ---------- */
  const DEFAULT_SETTINGS = {
    autoSync: true,
    autoPause: true,
    healthInsights: true,
    sensorAlerts: true,
    gpsTracking: true,
    haptics: true,
    darkMode: true,
    alwaysOnEcg: true,
    tempAlerts: true,
    recoveryNotifications: true,
    weeklyReport: true,
    distanceUnit: 'km',   // km | mi
    tempUnit: 'C',        // C | F
    unitSystem: 'metric', // metric | imperial
  };
  const DEFAULT_PROFILE = {
    name: 'Dr. Leroy',
    age: 38,
    sex: 'male',
    heightCm: 176,
    weightKg: 72,
    stepGoal: 10000,
    fitnessGoal: 'Improve endurance',
    maxHr: 181, // Tanaka 2001: 208 − 0.7 × age
    emergencyName: '',
    emergencyPhone: '',
    privacy: 'device', // device | cloud
  };

  const settingsEmitter = BL.emitter();
  const SettingsStore = {
    _data: Object.assign({}, DEFAULT_SETTINGS, StorageManager.get('settings', {})),
    _profile: Object.assign({}, DEFAULT_PROFILE, StorageManager.get('profile', {})),
    on: settingsEmitter.on,
    get(key) { return this._data[key]; },
    all() { return Object.assign({}, this._data); },
    set(key, value) { this._data[key] = value; StorageManager.set('settings', this._data); settingsEmitter.emit('change', { key, value }); settingsEmitter.emit('change:' + key, value); },
    toggle(key) { this.set(key, !this._data[key]); return this._data[key]; },
    profile() { return Object.assign({}, this._profile); },
    setProfile(patch) { Object.assign(this._profile, patch); StorageManager.set('profile', this._profile); settingsEmitter.emit('profile', this.profile()); },
    reset() { this._data = Object.assign({}, DEFAULT_SETTINGS); this._profile = Object.assign({}, DEFAULT_PROFILE); StorageManager.remove('settings'); StorageManager.remove('profile'); settingsEmitter.emit('change', { key: '*' }); settingsEmitter.emit('profile', this.profile()); },
    defaults: { settings: DEFAULT_SETTINGS, profile: DEFAULT_PROFILE },
  };

  /* ---------- Unit formatting helpers (respect settings) ---------- */
  const fmt = {
    distUnit() { return SettingsStore.get('distanceUnit') === 'mi' ? 'mi' : 'km'; },
    tempUnit() { return SettingsStore.get('tempUnit') === 'F' ? '°F' : '°C'; },
    /** km → display number (string with d decimals) */
    distance(km, d) { const mi = SettingsStore.get('distanceUnit') === 'mi'; const v = mi ? km * 0.621371 : km; return v.toFixed(d == null ? 2 : d); },
    /** °C → display string without unit */
    temp(c, d) { const f = SettingsStore.get('tempUnit') === 'F'; const v = f ? c * 9 / 5 + 32 : c; return v.toFixed(d == null ? 1 : d); },
    tempWithUnit(c, d) { return this.temp(c, d) + this.tempUnit(); },
    tempDelta(c, d) { const f = SettingsStore.get('tempUnit') === 'F'; const v = f ? c * 9 / 5 : c; const s = v >= 0 ? '+' : '−'; return `${s}${Math.abs(v).toFixed(d == null ? 1 : d)}${this.tempUnit()}`; },
    /** seconds per km → "6:21 /km" or "10:13 /mi" */
    pace(secPerKm, withUnit) {
      if (!secPerKm || !isFinite(secPerKm) || secPerKm <= 0) return '—';
      const mi = SettingsStore.get('distanceUnit') === 'mi';
      const s = mi ? secPerKm * 1.609344 : secPerKm;
      const m = Math.floor(s / 60), r = Math.round(s % 60);
      const str = `${m}:${String(r === 60 ? 59 : r).padStart(2, '0')}`;
      return withUnit === false ? str : `${str} /${mi ? 'mi' : 'km'}`;
    },
    height(cm) { if (SettingsStore.get('unitSystem') === 'imperial') { const inches = cm / 2.54; return `${Math.floor(inches / 12)}′ ${Math.round(inches % 12)}″`; } return `${cm} cm`; },
    weight(kg) { return SettingsStore.get('unitSystem') === 'imperial' ? `${(kg * 2.20462).toFixed(1)} lb` : `${kg} kg`; },
  };

  BL.storage = StorageManager;
  BL.settings = SettingsStore;
  BL.fmt = fmt;
})(window.BL = window.BL || {});
