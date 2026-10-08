/* ==========================================================================
   BIOTEX LIFE — ui.js
   UIManager: declarative data-binding (data-bind*, data-ring, data-arc,
   data-spark), overlays (bottom sheet, modal, confirm, prompt, form) and
   reusable list renderers.
   ========================================================================== */
(function (BL) {
  'use strict';
  const { $, $$, el, icon, escapeHtml, on } = BL;

  const UI = {
    rings: {}, arcs: {}, sparks: [],
    lastVm: {},

    /* ---------- Binding ---------- */
    initBindings() {
      $$('[data-ring]').forEach((node) => { const key = node.dataset.ring; UI.rings[key] = BL.ChartManager.ring(node, {}); });
      $$('[data-arc]').forEach((node) => { const key = node.dataset.arc; UI.arcs[key] = BL.ChartManager.arc(node, {}); });
      UI.sparks = $$('[data-spark]');
    },

    apply(vm) {
      const prev = UI.lastVm;
      $$('[data-bind]').forEach((node) => {
        const key = node.dataset.bind; if (!(key in vm) || node.dataset.counting) return;
        const v = vm[key];
        if (prev[key] !== v || node.textContent !== String(v)) {
          if (node.textContent !== String(v)) node.textContent = v;
        }
        const badgeKey = key + 'Badge';
        if (node.classList.contains('badge') && vm[badgeKey] && prev[badgeKey] !== vm[badgeKey]) { node.className = node.className.replace(/badge--\w+/g, '').trim() + ' badge--' + vm[badgeKey]; }
      });
      $$('[data-bind-show]').forEach((node) => { const key = node.dataset.bindShow; if (key in vm) node.hidden = !vm[key]; });
      $$('[data-bind-width]').forEach((node) => { const key = node.dataset.bindWidth; if (key in vm) node.style.width = BL.clamp(parseFloat(vm[key]) || 0, 0, 100) + '%'; });
      $$('[data-bind-left]').forEach((node) => { const key = node.dataset.bindLeft; if (key in vm) node.style.left = BL.clamp(parseFloat(vm[key]) || 0, 0, 100) + '%'; });
      $$('[data-bind-class]').forEach((node) => {
        const key = node.dataset.bindClass; if (!(key in vm)) return;
        const spec = vm[key]; if (prev[key] === spec) return;
        if (node.dataset.classBase) node.className = node.dataset.classBase + ' ' + spec;
        else if (node.classList.contains('status-dot')) node.className = 'status-dot ' + spec;
        else if (node.classList.contains('badge')) node.className = 'badge ' + spec;
        else if (node.classList.contains('battery__shell')) node.className = 'battery__shell ' + spec;
      });
      UI.lastVm = Object.assign({}, vm);
    },

    /* Animate numbers on a screen when it is entered */
    countScreen(screen) {
      $$('.metric__value[data-bind], .hero__stat-value[data-bind], .hero__stat-value > [data-bind], .stat-box > b > [data-bind]', screen).forEach((node) => {
        const v = parseFloat(String(node.textContent).replace(/[^0-9.\-]/g, ''));
        if (!isFinite(v) || !/^[0-9.,\-]+$/.test(node.textContent.trim())) return;
        const decimals = (String(node.textContent).split('.')[1] || '').length;
        const thousands = node.textContent.includes(',');
        const txt = node.textContent;
        node.dataset.counting = '1';
        node.textContent = thousands ? '0' : (0).toFixed(decimals);
        BL.countTo(node, v, { decimals, thousands, duration: 800 });
        setTimeout(() => { delete node.dataset.counting; if (Math.abs(parseFloat(node.textContent.replace(/,/g, '')) - v) > 0.01) node.textContent = txt; }, 900);
      });
      $$('[data-anim-width]', screen).forEach((bar) => { bar.style.width = '0%'; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = bar.dataset.animWidth + '%'; })); });
    },

    /* ---------- Bottom sheet ---------- */
    sheet(opts) {
      const root = $('#sheet-root');
      UI.closeSheet(true);
      const backdrop = el('div', { class: 'sheet-backdrop' });
      const sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || 'Sheet' });
      sheet.append(el('div', { class: 'sheet__grip' }));
      const head = el('div', { class: 'sheet__head' });
      head.append(el('h2', { text: opts.title || '' }));
      const close = el('button', { class: 'icon-btn', 'aria-label': 'Close', html: icon('x') });
      head.append(close);
      sheet.append(head);
      const body = el('div', { class: 'sheet__body' });
      if (typeof opts.body === 'string') body.innerHTML = opts.body; else if (opts.body) body.append(opts.body);
      sheet.append(body);
      if (opts.footer) { const foot = el('div', { class: 'sheet__foot' }); if (typeof opts.footer === 'string') foot.innerHTML = opts.footer; else foot.append(opts.footer); sheet.append(foot); }
      root.append(backdrop, sheet);
      requestAnimationFrame(() => root.classList.add('is-open'));
      const onClose = () => UI.closeSheet();
      backdrop.addEventListener('click', onClose);
      close.addEventListener('click', onClose);
      UI._sheet = { root, sheet, backdrop, onClose: opts.onClose };
      setTimeout(() => { const f = sheet.querySelector('button:not(.icon-btn), input'); if (f) f.focus(); }, 60);
      document.addEventListener('keydown', UI._sheetKey = (e) => { if (e.key === 'Escape') UI.closeSheet(); });
      return { close: () => UI.closeSheet(), body, sheet };
    },
    closeSheet(immediate) {
      const s = UI._sheet; if (!s) return;
      UI._sheet = null;
      document.removeEventListener('keydown', UI._sheetKey);
      s.root.classList.remove('is-open');
      if (immediate) { s.sheet.remove(); s.backdrop.remove(); }
      else { s.sheet.classList.add('is-closing'); setTimeout(() => { s.sheet.remove(); s.backdrop.remove(); }, 230); }
      if (s.onClose) s.onClose();
    },

    /* ---------- Modal ---------- */
    modal(opts) {
      const root = $('#modal-root');
      UI.closeModal();
      const backdrop = el('div', { class: 'modal-backdrop' });
      const modal = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || 'Dialog' });
      const head = el('div', { class: 'modal__head' });
      head.append(el('h2', { text: opts.title || '' }));
      const close = el('button', { class: 'icon-btn', 'aria-label': 'Close', html: icon('x') });
      head.append(close);
      const body = el('div', { class: 'modal__body' });
      if (typeof opts.body === 'string') body.innerHTML = opts.body; else if (opts.body) body.append(opts.body);
      modal.append(head, body);
      if (opts.actions && opts.actions.length) {
        const foot = el('div', { class: 'modal__foot' });
        opts.actions.forEach((a) => {
          const b = el('button', { class: 'btn ' + (a.cls || 'btn--secondary'), text: a.label });
          b.addEventListener('click', () => { const r = a.onClick ? a.onClick(body) : undefined; if (r !== false) UI.closeModal(); });
          foot.append(b);
        });
        modal.append(foot);
      }
      root.innerHTML = ''; root.append(backdrop, modal); root.classList.add('is-open');
      const onClose = () => { UI.closeModal(); if (opts.onCancel) opts.onCancel(); };
      backdrop.addEventListener('click', onClose); close.addEventListener('click', onClose);
      document.addEventListener('keydown', UI._modalKey = (e) => { if (e.key === 'Escape') onClose(); });
      setTimeout(() => { const f = modal.querySelector('input, select, .modal__foot .btn--primary, .modal__foot .btn'); if (f) f.focus(); }, 50);
      return { close: () => UI.closeModal(), body, modal };
    },
    closeModal() { const root = $('#modal-root'); if (!root) return; root.classList.remove('is-open'); root.innerHTML = ''; document.removeEventListener('keydown', UI._modalKey); },
    confirm(title, text, opts) {
      opts = opts || {};
      return new Promise((resolve) => {
        UI.modal({ title, body: `<p>${escapeHtml(text)}</p>`, onCancel: () => resolve(false), actions: [
          { label: opts.cancelLabel || 'Cancel', cls: 'btn--ghost', onClick: () => resolve(false) },
          { label: opts.confirmLabel || 'Confirm', cls: opts.danger ? 'btn--danger' : 'btn--primary', onClick: () => resolve(true) },
        ] });
      });
    },
    prompt(title, opts) {
      opts = opts || {};
      return new Promise((resolve) => {
        const body = el('div');
        const field = el('div', { class: 'field' });
        field.append(el('label', { text: opts.label || 'Value', for: 'bl-prompt-input' }));
        const input = el('input', { id: 'bl-prompt-input', type: opts.type || 'text', value: opts.value != null ? opts.value : '', placeholder: opts.placeholder || '', autocomplete: 'off' });
        if (opts.min != null) input.min = opts.min; if (opts.max != null) input.max = opts.max; if (opts.step != null) input.step = opts.step;
        field.append(input);
        if (opts.hint) field.append(el('div', { class: 'field__hint', text: opts.hint }));
        body.append(field);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { resolve(input.value); UI.closeModal(); } });
        UI.modal({ title, body, onCancel: () => resolve(null), actions: [
          { label: 'Cancel', cls: 'btn--ghost', onClick: () => resolve(null) },
          { label: opts.confirmLabel || 'Save', cls: 'btn--primary', onClick: () => resolve(input.value) },
        ] });
      });
    },
    /** fields: [{key,label,type:'text'|'number'|'select'|'segment',value,options:[[v,label]],hint}] */
    form(title, fields, opts) {
      opts = opts || {};
      return new Promise((resolve) => {
        const body = el('div');
        const inputs = {};
        fields.forEach((f) => {
          const wrap = el('div', { class: 'field' });
          wrap.append(el('label', { text: f.label }));
          if (f.type === 'select') {
            const sel = el('select');
            (f.options || []).forEach(([v, lab]) => { const o = el('option', { value: v, text: lab }); if (String(v) === String(f.value)) o.selected = true; sel.append(o); });
            inputs[f.key] = () => sel.value; wrap.append(sel);
          } else if (f.type === 'segment') {
            const seg = el('div', { class: 'seg', role: 'radiogroup' }); let val = f.value;
            (f.options || []).forEach(([v, lab]) => { const b = el('button', { type: 'button', class: 'seg__btn' + (String(v) === String(val) ? ' is-active' : ''), text: lab, role: 'radio', 'aria-checked': String(v) === String(val) }); b.addEventListener('click', () => { val = v; $$('button', seg).forEach((x) => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-checked', x === b); }); }); seg.append(b); });
            inputs[f.key] = () => val; wrap.append(seg);
          } else {
            const input = el('input', { type: f.type || 'text', value: f.value != null ? f.value : '', placeholder: f.placeholder || '', autocomplete: 'off' });
            if (f.min != null) input.min = f.min; if (f.max != null) input.max = f.max; if (f.step != null) input.step = f.step;
            inputs[f.key] = () => input.value; wrap.append(input);
          }
          if (f.hint) wrap.append(el('div', { class: 'field__hint', text: f.hint }));
          body.append(wrap);
        });
        UI.modal({ title, body, onCancel: () => resolve(null), actions: [
          { label: 'Cancel', cls: 'btn--ghost', onClick: () => resolve(null) },
          { label: opts.confirmLabel || 'Save', cls: 'btn--primary', onClick: () => { const out = {}; Object.keys(inputs).forEach((k) => { out[k] = inputs[k](); }); resolve(out); } },
        ] });
      });
    },

    /* ---------- Renderers ---------- */
    renderSensorList(container, sensors, connected) {
      container.innerHTML = sensors.map((s) => {
        const active = connected && s.status === 'Active';
        const warn = connected && s.status !== 'Active';
        return `<li>${icon(s.icon)}<span class="sensor__name">${escapeHtml(s.name)}</span><span class="sensor__status ${active ? '' : warn ? 'is-warn' : 'is-off'}"><span class="status-dot ${active ? 'status-dot--live' : warn ? 'status-dot--warn' : 'status-dot--off'}"></span>${connected ? escapeHtml(s.status) : 'Inactive'}</span></li>`;
      }).join('');
    },

    renderActivityTypes(container, selected, onSelect) {
      container.innerHTML = BL.data.ACTIVITY_TYPES.map((t) => `<button class="act-type${selected === t.id ? ' is-selected' : ''}" data-type="${t.id}" role="radio" aria-checked="${selected === t.id}"><span class="act-type__icon">${icon(t.icon)}</span><b>${escapeHtml(t.label)}</b><span>${escapeHtml(t.desc)}</span></button>`).join('');
      container.setAttribute('role', 'radiogroup');
      if (onSelect) on(container, 'click', '.act-type', (e, b) => { $$('.act-type', container).forEach((x) => { x.classList.toggle('is-selected', x === b); x.setAttribute('aria-checked', x === b); }); onSelect(b.dataset.type); });
    },

    histCard(a) {
      const t = BL.data.activityType(a.type), f = BL.fmt;
      const colorKey = { walk: 'blue', run: 'orange', cycle: 'aqua', hike: 'green', training: 'purple', recovery: 'green' }[t.id] || 'aqua';
      const primary = t.speedKmh > 0 ? `${f.distance(a.distanceKm)} <small>${f.distUnit()}</small>` : `${a.calories} <small>kcal</small>`;
      return `<button class="hist-card" data-activity="${a.id}" aria-label="${escapeHtml(a.name)}"><span class="hist-card__icon ic--${colorKey}">${icon(t.icon)}</span><span class="hist-card__text"><b>${escapeHtml(a.name)}</b><span>${BL.fmtRelativeDay(a.date)} · ${BL.fmtTime(a.date)} · ${a.avgHr} avg BPM</span></span><span class="hist-card__stats"><b>${primary}</b><span>${BL.fmtDurationHuman(a.durationSec)}</span></span></button>`;
    },
    renderHistory(container, list, opts) {
      opts = opts || {};
      if (!list.length) { container.innerHTML = `<div class="empty">${icon('activity')}<b>No completed activities yet.</b><p>Start an activity to record your route, pace and body response.</p><button class="btn btn--primary btn--sm" data-action="start-activity">${icon('play')}Start Activity</button></div>`; return; }
      container.innerHTML = list.slice(0, opts.limit || list.length).map(UI.histCard).join('');
    },

    renderEcgHistory(container, sessions) {
      if (!sessions.length) { container.innerHTML = `<div class="empty">${icon('ecg')}<b>No ECG sessions yet.</b><p>Record a session to build your ECG history.</p><button class="btn btn--primary btn--sm" data-ecg-action="start" data-go="ecg">${icon('play')}Start ECG Recording</button></div>`; return; }
      container.innerHTML = sessions.map((s) => `<article class="ecg-session" data-session="${s.id}"><div class="ecg-session__head"><b>${escapeHtml(s.name || 'ECG session')}</b><span>${BL.fmtDateTime(s.date)}</span></div><div class="ecg-session__meta"><div><span>Duration</span><b>${BL.fmtDurationHuman(s.durationSec)}</b></div><div><span>Average HR</span><b>${s.avgHr} BPM</b></div>${s.hrv ? `<div><span>RMSSD</span><b>${Math.round(s.hrv.rmssd)} ms</b></div>` : ''}<div><span>Signal</span><b>${escapeHtml(s.quality)}</b></div></div><div class="ecg-session__strip"><canvas data-strip="${s.avgHr}" data-seed="${s.id.length}"></canvas></div><div class="ecg-session__actions"><button class="btn btn--sm btn--secondary" data-ecg-session="view">${icon('eye')}View</button><button class="btn btn--sm btn--secondary" data-ecg-session="rename">${icon('edit')}Rename</button><button class="btn btn--sm btn--secondary" data-ecg-session="export">${icon('download')}CSV</button><button class="btn btn--sm btn--danger-ghost" data-ecg-session="delete">${icon('trash')}Delete</button></div></article>`).join('');
      $$('canvas[data-strip]', container).forEach((c) => BL.ECGRenderer.drawStatic(c, { hr: parseInt(c.dataset.strip, 10), seed: parseInt(c.dataset.seed, 10) }));
    },

    renderNotifications(container, groups) {
      if (!groups.length) { container.innerHTML = `<div class="empty">${icon('bell')}<b>You're all caught up.</b><p>Sensor alerts, sync events and reports will appear here.</p></div>`; return; }
      container.innerHTML = groups.map(([title, items]) => `<section class="notif-group"><h2 class="notif-group__title">${title}</h2>${items.map((n) => `<article class="notif${n.read ? '' : ' is-unread'}" data-notif-id="${n.id}" data-screen-target="${n.screen || ''}"><span class="notif__icon ic--${n.color || 'aqua'}">${icon(n.icon || 'bell')}</span><div class="notif__body"><b>${escapeHtml(n.title)}</b><p>${escapeHtml(n.body || '')}</p><time class="notif__time">${BL.fmtDateTime(n.time)}</time>${n.actions ? `<div class="notif__actions"><button class="btn btn--sm btn--secondary" data-notif-action="view">${icon('eye')}View Data</button><button class="btn btn--sm btn--ghost" data-notif-action="dismiss">Dismiss</button></div>` : ''}</div></article>`).join('')}</section>`).join('');
    },

    renderInsights(container, list, mini) {
      if (mini) { container.innerHTML = list.slice(0, 3).map((i) => `<li><svg class="c-${i.color}"><use href="#i-${i.icon}"/></svg>${escapeHtml(i.text)}</li>`).join(''); return; }
      container.innerHTML = list.map((i) => `<article class="insight" data-go="${i.screen}" role="button" tabindex="0"><span class="insight__icon ic--${i.color}">${icon(i.icon)}</span><div class="insight__body"><p>${escapeHtml(i.text)}</p><div class="insight__meta"><span class="badge badge--${i.color}">${escapeHtml(i.tag)}</span><span class="text-muted small">Tap to explore</span></div></div>${icon('chevron-right', 'row__chev')}</article>`).join('');
    },

    renderTimeline(container, events) {
      container.innerHTML = events.map((e) => `<li><time>${e.time}</time><i class="c-bg-${e.color === 'muted' ? 'blue' : e.color}" style="${e.color === 'muted' ? 'background:var(--text-muted)' : ''}"></i><span>${escapeHtml(e.label)}</span><span class="tl-delta ${e.delta.startsWith('+') ? 'c-green' : e.delta ? 'c-orange' : ''}">${e.delta}</span></li>`).join('');
    },

    renderHypno(container, stages, inBedMin) {
      const order = ['awake', 'rem', 'light', 'deep'];
      const rows = order.map((st) => ({ st, segs: [] }));
      let t = 0;
      stages.forEach(([st, min], i) => { rows.find((r) => r.st === st).segs.push({ left: (t / inBedMin) * 100, width: (min / inBedMin) * 100, delay: i * 60 }); t += min; });
      container.innerHTML = rows.map((r) => `<div class="hypno__row"><span>${r.st}</span><div class="hypno__lane">${r.segs.map((s) => `<i class="hypno__seg st-${r.st}" style="left:${s.left}%;width:${s.width}%;animation-delay:${s.delay}ms"></i>`).join('')}</div></div>`).join('') + `<div class="hypno__axis"><span>10:54 PM</span><span>1 AM</span><span>3 AM</span><span>5 AM</span><span>7:08 AM</span></div>`;
      container.style.height = '150px';
    },

    renderZones(container, minutes, zones) {
      zones = zones || BL.data.HR_ZONES;
      const total = minutes.reduce((a, b) => a + b, 0) || 1;
      container.innerHTML = `<div class="zones__bar">${zones.map((z, i) => `<span class="${z.cls}" data-w="${(minutes[i] / total) * 100}" style="width:0%"></span>`).join('')}</div><div class="zones__list">${zones.map((z, i) => `<div class="zones__item"><i class="${z.cls}"></i><span class="z-name"><b>Zone ${z.zone}</b><span>${z.name}${z.pct ? ' · ' + z.pct : ''}</span></span><span class="z-range">${z.min}–${z.max} BPM</span><span class="z-time">${BL.fmtMinutes(minutes[i])}</span></div>`).join('')}</div>`;
      requestAnimationFrame(() => requestAnimationFrame(() => $$('.zones__bar span', container).forEach((s) => { s.style.width = s.dataset.w + '%'; })));
    },

    /* Time in zone — horizontal bars, Z5 at the top, plus the time below zone 1 */
    renderZoneTime(container, zones, minutes, belowMin) {
      const rows = zones.map((z, i) => ({ label: `Z${z.zone}`, cls: z.cls, min: minutes[i] || 0 })).reverse();
      rows.push({ label: 'Below', cls: 'zbelow', min: belowMin || 0 });
      const maxMin = Math.max(1, Math.max.apply(null, rows.map((r) => r.min)));
      container.innerHTML = `<div class="zonetime__title">Time in zone · min</div>` + rows.map((r) => `<div class="zonetime__row"><span>${r.label}</span><div class="zonetime__bar"><i class="${r.cls}" data-w="${(r.min / maxMin) * 100}"></i></div><b>${r.min.toFixed(1)}</b></div>`).join('');
      requestAnimationFrame(() => requestAnimationFrame(() => $$('.zonetime__bar i', container).forEach((b) => { b.style.width = b.dataset.w + '%'; })));
    },

    renderSignalMap(container, map) {
      container.innerHTML = map.map((sMap) => `<article class="signal" style="border-top-color:var(--accent-${sMap.color === 'aqua' ? 'primary' : sMap.color})"><div class="signal__head"><i class="c-bg-${sMap.color}"></i><h3>${escapeHtml(sMap.name)}</h3></div><p class="signal__desc">${escapeHtml(sMap.desc)}</p><div class="signal__label">Raw signal</div><p class="signal__raw">${escapeHtml(sMap.raw)}</p><div class="signal__label">Parameters you can collect</div><ul class="signal__list">${sMap.params.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul><div class="signal__label">Training metrics you can derive</div><ul class="signal__list c-${sMap.color}">${sMap.derived.map((x) => `<li><span style="color:var(--text-primary)">${escapeHtml(x)}</span></li>`).join('')}</ul></article>`).join('');
    },
    renderCombined(container, items) {
      container.innerHTML = items.map((c) => `<article class="combined"><div class="combined__dots">${c.sensors.map((k) => `<i class="c-bg-${k}"></i>`).join('')}</div><b>${escapeHtml(c.title)}</b><p>${escapeHtml(c.text)}</p></article>`).join('');
    },
    renderFormulas(container, items) {
      container.innerHTML = items.map((f) => `<article class="formula"><div class="formula__head"><h3>${escapeHtml(f.title)}</h3><div class="formula__dots">${f.sensors.map((k) => `<i class="c-bg-${k}"></i>`).join('')}</div></div><pre class="formula__code">${escapeHtml(f.code)}</pre><p class="formula__note">${f.note}</p>${f.example ? `<div class="formula__example"><span>${f.example.label}</span><b>${escapeHtml(f.example.value)}</b></div>` : ''}</article>`).join('');
    },

    settingRow(key, label, desc, value, iconName) {
      return `<div class="row"><svg class="row__icon"><use href="#i-${iconName}"/></svg><span class="row__text"><b>${escapeHtml(label)}</b><span>${escapeHtml(desc)}</span></span><button class="toggle" role="switch" aria-checked="${value}" data-setting="${key}" aria-label="${escapeHtml(label)}"></button></div>`;
    },
    profileRow(key, label, value, iconName) {
      return `<button class="row" data-profile-edit="${key}"><svg class="row__icon"><use href="#i-${iconName}"/></svg><span class="row__text"><b>${escapeHtml(label)}</b></span><span class="row__value">${escapeHtml(value)}</span><svg class="row__chev"><use href="#i-chevron-right"/></svg></button>`;
    },
  };

  BL.UI = UI;
})(window.BL = window.BL || {});
