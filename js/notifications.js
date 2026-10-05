/* ==========================================================================
   BIOTEX LIFE — notifications.js
   NotificationManager: persisted notification centre + toast helper.
   ========================================================================== */
(function (BL) {
  'use strict';
  const { el, icon } = BL;

  class NotificationManager {
    constructor() {
      this.ev = BL.emitter();
      const saved = BL.storage.get('notifications', null);
      this.items = Array.isArray(saved) ? saved : BL.data.SEED_NOTIFICATIONS.slice();
      if (!Array.isArray(saved)) this.persist();
    }
    on(type, fn) { return this.ev.on(type, fn); }
    persist() { BL.storage.set('notifications', this.items.slice(0, 60)); }
    get unreadCount() { return this.items.filter((n) => !n.read).length; }
    list() { return this.items.slice().sort((a, b) => b.time - a.time); }
    /** group by New / Earlier Today / Yesterday / Earlier */
    grouped() {
      const groups = [['New', []], ['Earlier Today', []], ['Yesterday', []], ['Earlier', []]];
      const today = BL.startOfDay(new Date()).getTime(), yesterday = today - 86400000;
      this.list().forEach((n) => {
        if (!n.read) groups[0][1].push(n);
        else if (n.time >= today) groups[1][1].push(n);
        else if (n.time >= yesterday) groups[2][1].push(n);
        else groups[3][1].push(n);
      });
      return groups.filter((g) => g[1].length);
    }
    add(n) {
      const item = Object.assign({ id: BL.uid(), time: Date.now(), read: false, icon: 'bell', color: 'aqua', kind: 'info' }, n);
      this.items.unshift(item);
      this.persist();
      this.ev.emit('change', this);
      return item;
    }
    markRead(id) { const n = this.items.find((x) => x.id === id); if (n && !n.read) { n.read = true; this.persist(); this.ev.emit('change', this); } }
    markAllRead() { this.items.forEach((n) => { n.read = true; }); this.persist(); this.ev.emit('change', this); }
    dismiss(id) { this.items = this.items.filter((x) => x.id !== id); this.persist(); this.ev.emit('change', this); }
    clear() { this.items = []; this.persist(); this.ev.emit('change', this); }
    reset() { this.items = BL.data.SEED_NOTIFICATIONS.slice(); this.persist(); this.ev.emit('change', this); }
  }
  BL.NotificationManager = NotificationManager;

  /* ---------- Toasts ---------- */
  const root = () => document.getElementById('toast-root');
  const toast = (message, opts) => {
    opts = typeof opts === 'string' ? { type: opts } : (opts || {});
    const host = root(); if (!host) return;
    const node = el('div', { class: `toast toast--${opts.type || 'info'}`, role: 'status' });
    node.innerHTML = `${icon(opts.icon || ({ success: 'check-circle', warn: 'alert', error: 'alert', info: 'info' }[opts.type || 'info']))}<span>${BL.escapeHtml(message)}</span>`;
    host.append(node);
    while (host.children.length > 3) host.firstChild.remove();
    const ttl = opts.duration || 2800;
    setTimeout(() => { node.classList.add('is-leaving'); setTimeout(() => node.remove(), 260); }, ttl);
    return node;
  };
  BL.toast = toast;
})(window.BL = window.BL || {});
