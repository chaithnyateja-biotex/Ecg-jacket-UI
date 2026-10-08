/* ==========================================================================
   BIOTEX LIFE — navigation.js
   NavigationManager: SPA screen routing with transitions, history stack,
   hash deep-links, bottom-nav / sidebar state, keyboard support.
   ========================================================================== */
(function (BL) {
  'use strict';
  const { $, $$, on } = BL;

  const TABS = ['home', 'activity', 'ecg', 'analytics', 'profile'];
  const PARENT = {
    home: 'home', 'body-battery': 'home', fatigue: 'home', recovery: 'home', heart: 'home', temperature: 'home', sleep: 'home', insights: 'home', notifications: 'home', device: 'home', signals: 'home', formulas: 'home',
    activity: 'activity', history: 'activity', 'activity-live': 'activity', map: 'activity', 'activity-summary': 'activity',
    ecg: 'ecg', analytics: 'analytics', profile: 'profile', settings: 'profile',
  };

  class NavigationManager {
    constructor() {
      this.ev = BL.emitter();
      this.app = $('#app');
      this.nav = $('#bottom-nav');
      this.indicator = $('.bottom-nav__indicator', this.nav);
      this.screens = {};
      $$('.screen').forEach((s) => { this.screens[s.dataset.screen] = s; s.setAttribute('tabindex', '-1'); });
      this.current = null;
      this.stack = [];
      this.transitionTimer = null;

      on(document, 'click', '[data-go]', (e, t) => { e.preventDefault(); this.go(t.dataset.go); });
      on(document, 'click', '[data-back]', (e) => { e.preventDefault(); this.back(); });
      on(document, 'click', '[data-nav]', (e, t) => { e.preventDefault(); this.go(t.dataset.nav, { tab: true }); });
      window.addEventListener('hashchange', () => {
        const name = this.parseHash();
        if (name && name !== this.current && this.screens[name] && !this.isLocked(name)) this.go(name, { fromHash: true, back: this.stack.includes(name) });
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !document.querySelector('.modal-root.is-open, .sheet-root.is-open')) { if (this.current && !TABS.includes(this.current) && !['splash', 'onboarding', 'connect'].includes(this.current)) this.back(); }
      });
      window.addEventListener('resize', BL.debounce(() => this.positionIndicator(), 100));
    }

    on(type, fn) { return this.ev.on(type, fn); }
    parseHash() { const m = location.hash.match(/^#\/([a-z-]+)/); return m ? m[1] : null; }
    isLocked(name) { return ['splash'].includes(name) && this.current && this.current !== 'splash'; }
    isTab(name) { return TABS.includes(name); }

    go(name, opts) {
      opts = opts || {};
      const nextEl = this.screens[name];
      if (!nextEl) return;
      if (name === this.current && !opts.force) { if (opts.tab) nextEl.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      const prev = this.current, prevEl = prev ? this.screens[prev] : null;
      const isBack = !!opts.back;

      if (isBack) { const idx = this.stack.lastIndexOf(name); this.stack = idx >= 0 ? this.stack.slice(0, idx) : []; }
      else if (opts.tab || ['splash', 'onboarding', 'connect'].includes(name)) this.stack = [];
      else if (prev && !['splash', 'onboarding', 'connect'].includes(prev)) { this.stack.push(prev); if (this.stack.length > 20) this.stack.shift(); }

      this.current = name;
      clearTimeout(this.transitionTimer);
      $$('.screen.is-leaving').forEach((s) => s.classList.remove('is-leaving', 'is-back'));
      if (prevEl) {
        prevEl.classList.remove('is-active', 'is-entering');
        prevEl.classList.add('is-leaving'); if (isBack) prevEl.classList.add('is-back');
        this.ev.emit('leave', prev);
      }
      nextEl.classList.add('is-active', 'is-entering'); if (isBack) nextEl.classList.add('is-back');
      if (!this.isTab(name) || opts.scrollTop) nextEl.scrollTop = 0;
      this.transitionTimer = setTimeout(() => { if (prevEl) prevEl.classList.remove('is-leaving', 'is-back'); nextEl.classList.remove('is-entering', 'is-back'); }, 320);

      this.app.dataset.current = name;
      const hideNav = nextEl.hasAttribute('data-nav-hidden');
      this.nav.classList.toggle('is-hidden', hideNav);
      this.updateNavState(name);
      if (!opts.fromHash && !['splash'].includes(name)) {
        const hash = '#/' + name;
        if (location.hash !== hash) { try { history[opts.replace || isBack ? 'replaceState' : 'pushState'](null, '', hash); } catch (e) { location.hash = hash; } }
      }
      this.ev.emit('enter', name);
      this.ev.emit('enter:' + name, name);
    }

    back() {
      const target = this.stack.length ? this.stack[this.stack.length - 1] : (PARENT[this.current] && PARENT[this.current] !== this.current ? PARENT[this.current] : 'home');
      this.go(target, { back: true });
    }

    updateNavState(name) {
      const tab = PARENT[name] || null;
      const bottomExact = !!$('.bottom-nav__item[data-nav="' + name + '"]');
      $$('.bottom-nav__item').forEach((a) => a.classList.toggle('is-active', a.dataset.nav === name || (!bottomExact && a.dataset.nav === tab)));
      const sideExact = !!$('.sidebar__link[data-nav="' + name + '"]');
      $$('.sidebar__link').forEach((a) => a.classList.toggle('is-active', a.dataset.nav === name || (!sideExact && a.dataset.nav === tab)));
      this.positionIndicator();
    }

    positionIndicator() {
      if (!this.indicator) return;
      const active = $('.bottom-nav__item.is-active', this.nav);
      if (!active || active.classList.contains('bottom-nav__item--center')) { this.indicator.classList.remove('is-visible'); return; }
      const rect = active.getBoundingClientRect(), navRect = this.nav.getBoundingClientRect();
      this.indicator.style.transform = `translateX(${rect.left - navRect.left + rect.width / 2}px) translateX(-50%)`;
      this.indicator.classList.add('is-visible');
    }
  }
  BL.NavigationManager = NavigationManager;
  BL.NAV_TABS = TABS;
})(window.BL = window.BL || {});
