/* ==========================================================================
   BIOTEX LIFE — script.js
   App bootstrap: wires simulator, device, notifications, activity tracker,
   navigation, ECG renderers and screen controllers; builds the view model.
   ========================================================================== */
(function (BL) {
  'use strict';
  const { $, $$, on, clamp, round } = BL;

  const SCREEN_CTRL = {
    splash: 'splash', onboarding: 'onboarding', connect: 'connect', home: 'home', ecg: 'ecg', activity: 'activity', 'activity-live': 'live', map: 'map', 'activity-summary': 'summary',
    'body-battery': 'bodyBattery', fatigue: 'fatigue', recovery: 'recovery', heart: 'heart', temperature: 'temperature', sleep: 'sleep', analytics: 'analytics', insights: 'insights',
    notifications: 'notifications', device: 'device', profile: 'profile', settings: 'settings', history: 'history',
  };

  const App = {
    init() {
      BL.app = this;
      this.sim = new BL.HealthDataSimulator();
      this.device = new BL.DeviceManager();
      this.notif = new BL.NotificationManager();
      this.activity = new BL.ActivityTracker(this.sim);
      this.nav = new BL.NavigationManager();
      this.hrAlerted = false;

      this.loadBrandLogo();
      BL.UI.initBindings();

      const hrFn = () => this.sim.state.hr;
      this.ecgMini = new BL.ECGRenderer($('[data-ecg="mini"]'), { mini: true, mmPx: 3, hr: hrFn });
      this.ecgMain = new BL.ECGRenderer($('[data-ecg="main"]'), { mmPx: 5, hr: hrFn });

      Object.keys(BL.screens).forEach((k) => { try { if (BL.screens[k].init) BL.screens[k].init(); } catch (err) { console.error('[BL] screen init failed:', k, err); } });

      this.nav.on('enter', (name) => {
        const c = BL.screens[SCREEN_CTRL[name]];
        this.refresh(true);
        if (c && c.enter) setTimeout(() => { try { c.enter(); } catch (err) { console.error('[BL] enter failed:', name, err); } }, 40);
      });
      this.nav.on('leave', (name) => { const c = BL.screens[SCREEN_CTRL[name]]; if (c && c.leave) { try { c.leave(); } catch (err) { console.error('[BL] leave failed:', name, err); } } });

      on(document, 'click', '[data-action]', (e, b) => { e.preventDefault(); this.action(b.dataset.action, b); });
      on(document, 'click', '.btn, .icon-btn, .tile, .quick, .bottom-nav__item, .act-type, .hist-card', () => BL.vibrate(6));

      this.sim.on('tick', () => { this.refresh(); if (BL.screens.home.tick) BL.screens.home.tick(); });
      this.activity.on('tick', (s) => { this.refreshActivity(); this.checkAlerts(s); });
      this.activity.on('state', () => { this.hrAlerted = false; this.refresh(true); });
      this.activity.on('speed', (m) => BL.toast(`Demo speed ×${m}`, 'info'));
      this.device.on('change', () => this.refresh(true));
      this.device.on('tick', () => this.refresh());
      this.notif.on('change', () => this.refresh(true));
      BL.settings.on('change', () => this.refresh(true));
      BL.settings.on('profile', () => this.refresh(true));

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { this.ecgMini.stop(); this.ecgMain.stop(); }
        else { if (this.nav.current === 'home' && this.device.connected && BL.settings.get('alwaysOnEcg')) { this.ecgMini.reset(); this.ecgMini.start(); } if (this.nav.current === 'ecg' && this.device.connected) { this.ecgMain.reset(); this.ecgMain.start(); } }
      });
      window.addEventListener('resize', BL.debounce(() => { BL.ChartManager.redrawAll(); if (BL.screens.home.drawSparks) BL.screens.home.drawSparks(); }, 120));
      window.addEventListener('error', (e) => { console.error('[BL] runtime error', e.message); });

      this.sim.start();

      const target = this.nav.parseHash();
      this.initialTarget = target && target !== 'splash' && this.nav.screens[target] && !['activity-live', 'activity-summary', 'onboarding', 'connect'].includes(target) ? target : null;
      this.nav.go('splash', { replace: true });
      this.refresh(true);
      console.info('%cBIOTEX LIFE%c prototype ready · ECG • Activity • Recovery', 'color:#3EE2D4;font-weight:800', 'color:inherit');
    },

    /* Prefer an official Biotex logo if one is dropped into assets/images */
    loadBrandLogo() {
      const candidates = ['assets/images/biotex-logo.png', 'assets/images/biotex-logo.svg'];
      const tryNext = (i) => {
        if (i >= candidates.length) return;
        const img = new Image();
        img.onload = () => {
          $$('.brand-logo img').forEach((node) => { node.src = candidates[i]; node.hidden = false; });
          document.documentElement.classList.add('has-real-logo');
          try {
            const c = document.createElement('canvas'); c.width = c.height = 48; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 48, 48);
            const px = ctx.getImageData(0, 0, 48, 48).data; let lum = 0, n = 0;
            for (let k = 0; k < px.length; k += 4) { if (px[k + 3] > 60) { lum += (0.2126 * px[k] + 0.7152 * px[k + 1] + 0.0722 * px[k + 2]) / 255; n++; } }
            if (n && lum / n < 0.35) document.documentElement.classList.add('logo-needs-light-bg');
          } catch (e) { /* canvas tainted on file:// — keep logo as-is */ }
        };
        img.onerror = () => tryNext(i + 1);
        img.src = candidates[i];
      };
      tryNext(0);
    },

    /* ---------- View model ---------- */
    initials(name) { return name.replace(/^dr\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'B'; },

    activityVm() {
      const act = this.activity, s = act.session, f = BL.fmt, running = act.isRunning();
      const gpsOn = BL.settings.get('gpsTracking') && this.device.connected;
      const gps = !gpsOn ? 'Off' : running ? s.gps : 'Ready';
      const last = act.getHistory()[0];
      const paceCap = running && s.typeDef.speedKmh > 0 ? (1000 / (s.typeDef.speedKmh / 3.6)) * 1.6 : 0;
      return {
        activityInProgress: running, noActivity: !running,
        actTimer: BL.fmtTimer(running ? s.elapsed : 0),
        actName: running ? s.name : last ? last.name : 'No activity',
        actType: running ? s.typeDef.label.toUpperCase() : 'READY',
        actDistance: f.distance(running ? s.distanceM / 1000 : 0),
        actPace: running && s.paceSec && s.elapsed > 20 && s.paceSec <= paceCap ? f.pace(s.paceSec, false) + ' /' + f.distUnit() : '—',
        actAvgPace: running && s.avgPace && s.elapsed > 20 && s.avgPace <= paceCap ? f.pace(s.avgPace, false) + ' /' + f.distUnit() : '—',
        actCalories: running ? Math.round(s.calories) : 0, actElevation: running ? s.elevation : 0, actSteps: running ? BL.fmtNumber(s.steps) : '0',
        actStateText: act.state === 'paused' ? 'PAUSED' : running ? 'ACTIVE' : 'IDLE',
        actStateBadge: act.state === 'paused' ? 'is-paused' : running ? 'is-active' : 'is-idle',
        gpsStrength: gps, gpsChip: 'GPS ' + gps, gpsChipLong: gpsOn ? 'GPS Connected' : 'GPS Unavailable', gpsDot: gpsOn ? 'status-dot--live' : 'status-dot--off',
        simSpeed: `×${act.speedMul}`,
        lastActivityName: last ? last.name : '—',
        todayRouteDistance: f.distance(last ? last.distanceKm : 6.24),
      };
    },

    vm() {
      const s = this.sim.state, d = this.sim.describe(), dev = this.device, p = BL.settings.profile(), f = BL.fmt, notif = this.notif;
      const hour = new Date().getHours();
      const temps = this.sim.tempHistory.slice(0, hour + 1).concat([s.temp]);
      const ecg = BL.screens.ecg ? BL.screens.ecg.vm() : {};
      const weekKm = BL.sum(BL.data.WEEK.distance) + s.distanceKm;
      return Object.assign({
        hr: s.hr, restingHr: s.restingHr, hrMax: s.hrMax, hrv: s.hrv, spo2: s.spo2, resp: s.resp,
        hrStatus: d.hrStatus, hrStatusBadge: d.hrStatusColor,
        temp: f.temp(s.temp), tempUnit: f.tempUnit(), tempStatus: d.tempStatus, tempStatusBadge: d.tempStatusColor,
        tempBaseline: f.tempWithUnit(s.tempBaseline), tempDeviation: f.tempDelta(s.tempDeviation),
        tempMin: f.tempWithUnit(Math.min.apply(null, temps)), tempAvg: f.tempWithUnit(BL.avg(temps)), tempMax: f.tempWithUnit(Math.max.apply(null, temps)),
        bodyBattery: s.bodyBattery, bodyBatteryStatus: d.bodyBatteryStatus, bodyBatteryStatusBadge: d.bodyBatteryBadge, bbCharged: s.bbCharged, bbDrained: s.bbDrained,
        fatigue: s.fatigue, fatigueStatus: d.fatigueStatus, fatigueStatusBadge: d.fatigueBadge, fatigueStatusLong: d.fatigueStatusLong, fatigueStatusLongBadge: d.fatigueBadge, fullRecoveryEta: d.fullRecoveryEta,
        recovery: s.recovery, recoveryStatus: d.recoveryStatus, recoveryStatusBadge: d.recoveryBadge, recoveryStatusLong: d.recoveryStatusLong, recoveryStatusLongBadge: d.recoveryBadge,
        stress: s.stress, stressStatus: d.stressStatus, stressStatusBadge: d.stressBadge,
        sleepTotal: BL.data.SLEEP.total,
        stepsFmt: BL.fmtNumber(s.steps), stepsPct: clamp((s.steps / p.stepGoal) * 100, 0, 100), stepGoalFmt: BL.fmtNumber(p.stepGoal),
        calories: s.calories, distanceFmt: f.distance(s.distanceKm, 1), distUnit: f.distUnit(), activeMinutes: s.activeMinutes,
        trainingLoad: s.trainingLoad, trainingLoadStatus: d.trainingLoadStatus, trainingLoadStatusBadge: d.trainingLoadBadge,
        jacketBattery: dev.battery, firmware: dev.firmware, btStatus: dev.btStatus, signalQuality: dev.signalQuality, signalQualityText: dev.connected ? `Signal ${dev.signal}` : 'No signal', noiseLevel: dev.connected ? dev.noise : '—', gpsStatus: dev.gpsStatus, lastSync: dev.lastSyncText(),
        deviceStatusText: dev.statusText(), deviceStatusShort: dev.statusShort(), deviceStatusMini: dev.connected ? 'Connected' : dev.state === 'disconnected' ? 'Disconnected' : 'Pairing…', deviceDisconnected: !dev.connected, deviceConnected: dev.connected,
        deviceDot: dev.connected ? 'status-dot--live' : dev.state === 'disconnected' ? 'status-dot--off' : 'status-dot--searching',
        batteryState: dev.charging ? 'is-charging' : dev.battery <= 20 ? 'is-low' : dev.battery <= 40 ? 'is-mid' : '', batteryEta: dev.batteryEtaText(), chargeToggleText: dev.charging ? 'Charging (demo)' : 'Demo charging',
        hasUnread: notif.unreadCount > 0, unreadCount: notif.unreadCount ? String(notif.unreadCount) : '',
        initials: this.initials(p.name), userName: p.name, greeting: BL.greetingFor(), syncText: dev.connected ? `Synced ${dev.lastSyncText().toLowerCase()}` : 'Sync paused',
        readinessTitle: d.readinessTitle, readinessText: d.readinessText,
        weekTotal: f.distance(weekKm, 1),
        fitnessGoal: p.fitnessGoal,
        notifSummary: BL.settings.get('sensorAlerts') ? 'Sensor alerts and reports enabled' : 'Sensor alerts off',
        privacyText: p.privacy === 'cloud' ? 'Encrypted cloud sync' : 'Data stays on this device',
        emergencyText: p.emergencyName ? `${p.emergencyName}${p.emergencyPhone ? ' · ' + p.emergencyPhone : ''}` : 'Not set',
        btAvailabilityNote: navigator.bluetooth ? 'Web Bluetooth available — demo pairing uses simulated jacket data.' : 'Demo pairing — Bluetooth hardware access is not available in this browser, so jacket data is simulated.',
      }, ecg, this.activityVm());
    },

    refresh(force) {
      const now = performance.now();
      if (!force && this._lastRefresh && now - this._lastRefresh < 400) { this._pending = true; return; }
      this._lastRefresh = now; this._pending = false;
      const vm = this.vm();
      BL.UI.apply(vm);
      this.updateGauges(vm);
    },
    refreshActivity() { BL.UI.apply(Object.assign({}, BL.UI.lastVm, this.activityVm(), { hr: this.sim.state.hr })); },

    updateGauges(vm) {
      const R = BL.UI.rings, Ar = BL.UI.arcs;
      if (R.bodyBattery) R.bodyBattery.set(vm.bodyBattery, String(vm.bodyBattery));
      if (R.bbDetail) R.bbDetail.set(vm.bodyBattery, String(vm.bodyBattery));
      if (R.recovery) R.recovery.set(vm.recovery, vm.recovery + '%');
      if (R.recDetail) R.recDetail.set(vm.recovery, vm.recovery + '%');
      if (R.spo2) R.spo2.set(vm.spo2);
      if (Ar.fatigue) { Ar.fatigue.set(vm.fatigue); Ar.fatigue.color(vm.fatigueStatusBadge); }
      if (Ar.fatigueDetail) { Ar.fatigueDetail.set(vm.fatigue, String(vm.fatigue)); Ar.fatigueDetail.color(vm.fatigueStatusBadge); }
      if (R.bodyBattery) R.bodyBattery.color(vm.bodyBatteryStatusBadge === 'aqua' ? 'aqua' : vm.bodyBatteryStatusBadge);
      if (R.recovery) R.recovery.color(vm.recoveryStatusBadge);
      // heart icon speed
      const period = (60 / Math.max(40, vm.hr)).toFixed(2) + 's';
      if (this._lastPeriod !== period) { this._lastPeriod = period; $$('[data-heart] svg').forEach((h) => { h.style.animationDuration = period; }); }
    },

    refreshAll() {
      this.refresh(true);
      const cur = this.nav.current, c = BL.screens[SCREEN_CTRL[cur]];
      if (c && c.enter) c.enter();
      if (BL.screens.activity) BL.screens.activity.renderWeek(false);
      if (BL.screens.history) BL.screens.history.render();
      if (BL.screens.activity) BL.screens.activity.renderRecent();
    },

    checkAlerts(session) {
      if (!BL.settings.get('sensorAlerts') || this.hrAlerted) return;
      const max = BL.settings.profile().maxHr || 182;
      if (this.sim.state.hr >= max * 0.9) {
        this.hrAlerted = true;
        this.notif.add({ kind: 'alert', title: 'Heart Rate Above Configured Range', body: 'Your heart rate is above the activity range you configured.', icon: 'heart', color: 'red', screen: 'heart', actions: true });
        BL.toast('Heart rate above configured range', { type: 'warn', icon: 'heart' });
      }
    },

    /* ---------- Global actions ---------- */
    action(a, btn) {
      const S = BL.screens;
      switch (a) {
        case 'start-activity': if (this.activity.isRunning()) this.nav.go('activity-live'); else S.activity.openSheet(); break;
        case 'quick-walk': if (this.activity.isRunning()) this.nav.go('activity-live'); else S.activity.start('walk'); break;
        case 'sim-speed': this.activity.cycleSpeed(); break;
        case 'export-ecg-all': S.ecg.exportAll(); break;
        case 'export-activities': S.history.exportAll(); break;
        case 'export-daily': this.exportDaily(); break;
        case 'about': this.about(); break;
        case 'demo-alert':
          this.notif.add({ kind: 'alert', title: 'Heart Rate Above Configured Range', body: 'Your heart rate is above the activity range you configured.', icon: 'heart', color: 'red', screen: 'heart', actions: true });
          BL.toast('Sensor alert pushed to Notifications', { type: 'warn', icon: 'alert' }); break;
        case 'demo-disconnect': this.device.disconnect(); this.nav.go('home', { tab: true }); break;
        case 'demo-low-battery': this.device.setBattery(20); BL.toast('Jacket battery set to 20%', 'warn'); break;
        case 'demo-sync-fail':
          BL.toast('Sensor sync failed — retrying…', { type: 'error', icon: 'refresh', duration: 2200 });
          this.notif.add({ kind: 'alert', title: 'Sensor sync failed', body: 'The last sensor packet could not be verified. Retrying automatically.', icon: 'refresh', color: 'orange', screen: 'device', actions: true });
          setTimeout(() => { this.device.lastSyncAt = Date.now(); this.refresh(true); BL.toast('Sensors synchronized after retry', 'success'); }, 2600);
          break;
        case 'reset-demo':
          BL.UI.confirm('Reset demo data?', 'Saved activities, ECG sessions, notifications and settings will return to their defaults.', { confirmLabel: 'Reset', danger: true }).then((ok) => { if (ok) { BL.storage.clearAll(); location.hash = ''; location.reload(); } });
          break;
        default: break;
      }
    },

    exportDaily() {
      const s = this.sim.state, f = BL.fmt, hour = new Date().getHours();
      const rows = [['Biotex Life — daily health metrics', new Date().toISOString().slice(0, 10)], [], ['Metric', 'Value', 'Unit'],
        ['Heart rate (current)', s.hr, 'bpm'], ['Resting heart rate', s.restingHr, 'bpm'], ['Max heart rate today', s.hrMax, 'bpm'], ['HRV', s.hrv, 'ms'], ['SpO2', s.spo2, '%'], ['Respiration', s.resp, '/min'],
        ['Body temperature', s.temp, '°C'], ['Temperature baseline', s.tempBaseline, '°C'], ['Body battery', s.bodyBattery, '/100'], ['Fatigue', s.fatigue, '/100'], ['Recovery', s.recovery, '%'], ['Stress', s.stress, '/100'], ['Sleep score', s.sleepScore, '/100'],
        ['Steps', s.steps, ''], ['Calories', s.calories, 'kcal'], ['Distance', s.distanceKm.toFixed(2), 'km'], ['Active minutes', s.activeMinutes, 'min'], ['Training load', s.trainingLoad, ''], ['Jacket battery', this.device.battery, '%'],
        [], ['Hour', 'Heart rate (bpm)', 'Temperature (°C)', 'Body battery']];
      for (let h = 0; h <= hour; h++) rows.push([`${h}:00`, h === hour ? s.hr : BL.data.HR_24[h], h === hour ? s.temp : this.sim.tempHistory[h], h === hour ? s.bodyBattery : BL.data.BB_24[h]]);
      BL.downloadFile(`biotex-daily-metrics-${new Date().toISOString().slice(0, 10)}.csv`, BL.toCSV(rows), 'text/csv');
      BL.toast('Daily metrics exported', 'success');
    },

    about() {
      BL.UI.modal({ title: 'About Biotex Life', body: `<div style="display:flex;justify-content:center;margin:4px 0 14px"><span class="brand-logo brand-logo--lg"><img alt="Biotex" ${document.documentElement.classList.contains('has-real-logo') ? `src="${$('.brand-logo img').src}"` : 'hidden'}><svg class="brand-logo__svg"><use href="#logo-full"/></svg></span></div><p><b>Biotex Life</b> v1.0 · Connected Human Performance for the Biotex ECG Jacket.</p><p>Biotex Life Solutions Pvt. Ltd., Hyderabad · ECG • Activity • Recovery</p><p class="small" style="margin-top:12px"><b>Important</b><br>Biotex Life is presented here as a wellness, fitness and physiological monitoring interface. The prototype is not intended to diagnose, treat, cure or prevent any medical condition and does not replace professional medical evaluation.</p><p class="text-muted small" style="margin-top:10px">Map data © OpenStreetMap contributors, © CARTO. Demo physiology is simulated.</p>`, actions: [{ label: 'Close', cls: 'btn--primary' }] });
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.init()); else App.init();
})(window.BL = window.BL || {});
