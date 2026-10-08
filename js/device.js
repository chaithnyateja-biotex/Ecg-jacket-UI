/* ==========================================================================
   BIOTEX LIFE — device.js
   DeviceManager: Biotex ECG Jacket connection state machine, battery,
   sensors, calibration / firmware / diagnostic demo flows.
   ========================================================================== */
(function (BL) {
  'use strict';
  const { clamp } = BL;

  class DeviceManager {
    constructor() {
      this.ev = BL.emitter();
      const saved = BL.storage.get('device', {});
      this.state = saved.state === 'connected' ? 'connected' : 'disconnected'; // disconnected | searching | connecting | connected
      this.battery = saved.battery != null ? clamp(saved.battery, 0, 100) : 82;
      this.batteryFloat = this.battery;
      this.charging = false;
      this.firmware = 'v1.0.8';
      this.latestFirmware = 'v1.0.9';
      this.signal = 'Excellent';
      this.noise = 'Low';
      this.lastSyncAt = Date.now();
      this.sensors = BL.data.SENSORS.map((s) => Object.assign({}, s, { status: 'Active' }));
      this.busy = null;
      this.timers = [];
      this.lowBatteryNotified = false;
      this.everConnected = !!BL.storage.get('deviceEverConnected', false);
      this.name = 'BIOTEX ECG JACKET';
      this.serial = 'BTX-ECG-0427';
      setInterval(() => this.tick(), 1000);
      BL.settings.on('change:gpsTracking', () => this.ev.emit('change', this));
    }

    on(type, fn) { return this.ev.on(type, fn); }
    get connected() { return this.state === 'connected'; }
    get gpsEnabled() { return !!BL.settings.get('gpsTracking'); }
    get gpsStatus() { if (!this.connected) return 'Unavailable'; return this.gpsEnabled ? (BL.activity && BL.activity.isRunning() ? 'Active' : 'Ready') : 'Off'; }
    get btStatus() { return this.state === 'connected' ? 'Connected' : this.state === 'disconnected' ? 'Disconnected' : this.state === 'searching' ? 'Searching' : 'Connecting'; }
    get signalQuality() { return this.connected ? this.signal : '—'; }
    statusText() { return { connected: 'Connected', searching: 'Searching for jacket...', connecting: 'Connecting...', disconnected: 'Disconnected' }[this.state]; }
    statusShort() { return { connected: 'Jacket Connected', searching: 'Searching…', connecting: 'Connecting…', disconnected: 'Jacket Disconnected' }[this.state]; }
    lastSyncText() {
      if (!this.connected) return 'Paused';
      const s = Math.round((Date.now() - this.lastSyncAt) / 1000);
      if (s < 45) return 'Just now';
      if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
      return `${Math.round(s / 3600)}h ago`;
    }
    batteryEtaText() {
      if (this.charging) { const min = Math.round((100 - this.battery) * 1.6); return `Full in about ${BL.fmtMinutes(min)}`; }
      return `Estimated remaining ${BL.fmtMinutes(Math.round(this.battery * 13.66))}`;
    }
    persist() { BL.storage.set('device', { state: this.state, battery: this.battery }); }
    clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }
    later(fn, ms) { const t = setTimeout(fn, ms); this.timers.push(t); return t; }

    tick() {
      if (this.charging) this.batteryFloat = Math.min(100, this.batteryFloat + 0.7);
      else if (this.connected) this.batteryFloat = Math.max(0, this.batteryFloat - 1 / 820);
      const b = Math.round(this.batteryFloat);
      if (b !== this.battery) {
        this.battery = b; this.persist();
        if (b <= 20 && !this.charging && !this.lowBatteryNotified) { this.lowBatteryNotified = true; this.ev.emit('low-battery', b); }
        if (b > 25) this.lowBatteryNotified = false;
        this.ev.emit('change', this);
      }
      if (this.connected && BL.settings.get('autoSync') && Date.now() - this.lastSyncAt > 5 * 60000) { this.lastSyncAt = Date.now(); this.ev.emit('synced', this); }
      this.ev.emit('tick', this);
    }

    search() {
      if (this.state === 'connected' || this.state === 'searching' || this.state === 'connecting') return;
      this.clearTimers();
      this.state = 'searching'; this.ev.emit('change', this);
      this.later(() => { this.state = 'connecting'; this.ev.emit('change', this); }, 2300);
      this.later(() => { this.state = 'connected'; this.everConnected = true; BL.storage.set('deviceEverConnected', true); this.lastSyncAt = Date.now(); this.sensors.forEach((s) => { s.status = 'Active'; }); this.persist(); this.ev.emit('change', this); this.ev.emit('connected', this); }, 3700);
    }
    connect() { this.search(); }
    reconnect() { if (this.state === 'connected') { this.state = 'disconnected'; this.ev.emit('change', this); } this.search(); }
    disconnect() {
      this.clearTimers();
      if (this.state === 'disconnected') return;
      this.state = 'disconnected'; this.charging = false; this.persist();
      this.sensors.forEach((s) => { s.status = 'Inactive'; });
      this.ev.emit('change', this); this.ev.emit('disconnected', this);
    }
    toggleCharging() { this.charging = !this.charging; if (this.charging) this.lowBatteryNotified = true; this.ev.emit('change', this); return this.charging; }
    setBattery(v) { this.batteryFloat = this.battery = clamp(Math.round(v), 0, 100); this.persist(); if (this.battery <= 20) { this.lowBatteryNotified = true; this.ev.emit('low-battery', this.battery); } this.ev.emit('change', this); }

    /** Generic multi-step demo flow with progress events */
    runFlow(type, steps, totalMs) {
      if (this.busy) return Promise.resolve(false);
      this.busy = type;
      return new Promise((resolve) => {
        const n = steps.length, stepMs = totalMs / n;
        let i = 0;
        const run = () => {
          if (i >= n) { this.busy = null; this.ev.emit('flow', { type, pct: 100, text: steps[n - 1], done: true, step: n }); resolve(true); return; }
          this.ev.emit('flow', { type, pct: Math.round((i / n) * 100), text: steps[i], step: i, steps, done: false });
          i++;
          this.later(run, stepMs);
        };
        run();
      });
    }
    calibrate() {
      return this.runFlow('calibrate', ['Checking electrode contact…', 'Measuring skin impedance…', 'Checking optical sensor contact…', 'Aligning temperature baseline…', 'Verifying ECG lead quality…', 'Calibration complete'], 4200)
        .then((ok) => { if (ok) { this.signal = 'Excellent'; this.noise = 'Low'; this.lastSyncAt = Date.now(); this.ev.emit('change', this); } return ok; });
    }
    updateFirmware() {
      const already = this.firmware === this.latestFirmware;
      const steps = already ? ['Checking for updates…', `Firmware ${this.firmware} is up to date`] : ['Checking for updates…', `Downloading ${this.latestFirmware}…`, 'Verifying package…', 'Installing on jacket module…', 'Restarting sensors…', `Updated to ${this.latestFirmware}`];
      return this.runFlow('firmware', steps, already ? 1800 : 5600).then((ok) => { if (ok && !already) { this.firmware = this.latestFirmware; this.ev.emit('change', this); } return ok; });
    }
    diagnostic() {
      const steps = this.sensors.map((s) => `${s.name} — OK`).concat(['Bluetooth link quality — OK', 'Battery health — 97%', 'Diagnostics complete']);
      return this.runFlow('diagnostic', steps, 5200);
    }
    find() { this.ev.emit('find', this); }
    info() { return BL.data.DEVICE_INFO.map((row) => (row[0] === 'Firmware' ? ['Firmware', this.firmware] : row)); }
  }

  BL.DeviceManager = DeviceManager;
})(window.BL = window.BL || {});
