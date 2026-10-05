/* ==========================================================================
   BIOTEX LIFE — map.js
   MapController: Leaflet + OpenStreetMap/CARTO tiles (no API key).
   Renders planned route, completed path, pulsing GPS marker, start/finish.
   Degrades gracefully when Leaflet or tiles are unavailable (offline).
   ========================================================================== */
(function (BL) {
  'use strict';

  const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
  /* Standard OpenStreetMap tiles (no API key). "Dark" and "Light" are CSS-filtered presentations of the same tiles. */
  const TILES = {
    dark: { label: 'Dark', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: OSM_ATTR, maxZoom: 19, cls: 'map-style-dark' },
    light: { label: 'Light', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: OSM_ATTR, maxZoom: 19, cls: 'map-style-light' },
    streets: { label: 'Streets', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: OSM_ATTR, maxZoom: 19, cls: 'map-style-streets' },
  };

  class MapView {
    constructor(container, opts) {
      opts = opts || {};
      this.container = container; this.opts = opts;
      this.skeleton = container.querySelector('.map-skeleton');
      this.follow = true; this.loaded = false; this.errors = 0; this.destroyed = false;
      const interactive = !opts.static;
      this.map = L.map(container, {
        zoomControl: false, attributionControl: opts.attribution !== false, preferCanvas: true,
        dragging: interactive, scrollWheelZoom: interactive, touchZoom: interactive, doubleClickZoom: interactive, keyboard: interactive, boxZoom: interactive, tap: interactive,
        zoomSnap: 0.25, zoomAnimation: true, fadeAnimation: true, inertia: true,
      });
      if (this.map.attributionControl) this.map.attributionControl.setPrefix(false);
      this.map.setView(opts.center || [17.4239, 78.4738], opts.zoom || 14);
      this.tileLayer = null; this.layerName = null;
      this.setLayer(opts.layer || (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'));

      const aqua = BL.colorFor('aqua');
      this.glowLine = L.polyline([], { color: aqua, weight: 14, opacity: 0.16, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(this.map);
      this.routeLine = L.polyline([], { color: this.layerName === 'dark' ? 'rgba(255,255,255,0.45)' : 'rgba(10,20,24,0.45)', weight: 4, dashArray: '2 10', lineCap: 'round', interactive: false }).addTo(this.map);
      this.progressLine = L.polyline([], { color: aqua, weight: 5, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(this.map);
      this.startMarker = null; this.finishMarker = null; this.currentMarker = null;
      this.lastPan = 0;

      this.map.on('dragstart', () => { this.follow = false; });
      if (!opts.static) this.map.on('zoomstart', () => { /* keep follow */ });
      this.loadTimer = setTimeout(() => { if (!this.loaded && this.skeleton) this.showError(); }, 9000);
    }

    showError() {
      if (!this.skeleton) return;
      this.skeleton.classList.add('is-error');
      this.skeleton.innerHTML = `${BL.icon('map')}<b>Map tiles unavailable</b><span>Check your connection — route data is still being recorded.</span>`;
      this.skeleton.style.display = '';
    }
    hideSkeleton() { if (this.skeleton) { this.skeleton.style.transition = 'opacity .4s'; this.skeleton.style.opacity = '0'; setTimeout(() => { if (this.skeleton) this.skeleton.style.display = 'none'; }, 420); } }

    setLayer(name) {
      const t = TILES[name] || TILES.dark;
      if (this.tileLayer) this.map.removeLayer(this.tileLayer);
      this.layerName = TILES[name] ? name : 'dark';
      this.container.classList.remove('map-style-dark', 'map-style-light', 'map-style-streets'); this.container.classList.add(t.cls);
      this.tileLayer = L.tileLayer(t.url, { attribution: t.attribution, maxZoom: t.maxZoom, updateWhenIdle: false, keepBuffer: 3, detectRetina: false });
      this.tileLayer.on('load', () => { this.loaded = true; clearTimeout(this.loadTimer); this.hideSkeleton(); });
      this.tileLayer.on('tileload', () => { if (!this.loaded) { this.loaded = true; clearTimeout(this.loadTimer); this.hideSkeleton(); } });
      this.tileLayer.on('tileerror', () => { this.errors++; if (!this.loaded && this.errors > 6) { clearTimeout(this.loadTimer); this.showError(); } });
      this.tileLayer.addTo(this.map);
      if (this.routeLine) this.routeLine.setStyle({ color: this.layerName === 'dark' ? 'rgba(255,255,255,0.45)' : 'rgba(10,20,24,0.45)' });
    }

    marker(latlng, cls) {
      return L.marker(latlng, { icon: L.divIcon({ className: cls === 'gps' ? 'gps-marker-icon' : 'route-marker-icon', html: cls === 'gps' ? '<div class="gps-marker"></div>' : `<div class="route-marker route-marker--${cls}"></div>`, iconSize: cls === 'gps' ? [18, 18] : [14, 14], iconAnchor: cls === 'gps' ? [9, 9] : [7, 7] }), interactive: false, keyboard: false });
    }

    setRoute(points, opts) {
      opts = opts || {};
      this.routeLine.setLatLngs(points);
      if (this.startMarker) this.map.removeLayer(this.startMarker);
      if (this.finishMarker) this.map.removeLayer(this.finishMarker);
      if (points.length) {
        this.startMarker = this.marker(points[0], 'start').addTo(this.map);
        this.finishMarker = this.marker(points[points.length - 1], 'finish').addTo(this.map);
      }
      if (opts.fit !== false) this.fitRoute(points);
    }

    fitRoute(points) {
      const pts = points || this.routeLine.getLatLngs();
      if (!pts.length) return;
      this.map.fitBounds(L.latLngBounds(pts), { padding: this.opts.fitPadding || [28, 28], animate: false, maxZoom: 16 });
    }

    /** completed path + current position */
    setProgress(path, current, opts) {
      opts = opts || {};
      this.progressLine.setLatLngs(path);
      this.glowLine.setLatLngs(path);
      if (current) {
        if (!this.currentMarker) this.currentMarker = this.marker(current, 'gps').addTo(this.map);
        else this.currentMarker.setLatLng(current);
        if (this.follow && !this.opts.static && opts.follow !== false) {
          const now = Date.now();
          if (now - this.lastPan > 900) {
            this.lastPan = now;
            const target = this.opts.followZoom || Math.max(this.map.getZoom(), 15.5);
            this.map.setView(current, target, { animate: true, duration: 0.8, easeLinearity: 0.35 });
          }
        }
      }
    }

    clearProgress() { this.progressLine.setLatLngs([]); this.glowLine.setLatLngs([]); if (this.currentMarker) { this.map.removeLayer(this.currentMarker); this.currentMarker = null; } }
    recenter() { this.follow = true; const ll = this.currentMarker ? this.currentMarker.getLatLng() : (this.routeLine.getLatLngs()[0] || null); if (ll) this.map.setView(ll, Math.max(this.map.getZoom(), 15.5), { animate: true }); }
    zoomIn() { this.map.zoomIn(); }
    zoomOut() { this.map.zoomOut(); }
    overview() { this.follow = false; this.fitRoute(); }
    invalidate() { try { this.map.invalidateSize({ animate: false }); } catch (e) { /* ignore */ } }
    destroy() { this.destroyed = true; clearTimeout(this.loadTimer); try { this.map.remove(); } catch (e) { /* ignore */ } }
  }

  const views = new Map();
  const MapController = {
    TILES,
    available() { return typeof window.L !== 'undefined' && !!window.L.map; },
    create(key, container, opts) {
      if (views.has(key)) { views.get(key).destroy(); views.delete(key); }
      if (!this.available()) {
        const sk = container.querySelector('.map-skeleton');
        if (sk) { sk.classList.add('is-error'); sk.innerHTML = `${BL.icon('map')}<b>Map unavailable offline</b><span>Leaflet could not be loaded. Route data is still recorded.</span>`; }
        return null;
      }
      try {
        const v = new MapView(container, opts);
        views.set(key, v);
        return v;
      } catch (err) { console.error('[BL] map init failed', err); return null; }
    },
    get(key) { return views.get(key) || null; },
    invalidate(key) { const v = views.get(key); if (v) v.invalidate(); },
    setLayerAll(name) { views.forEach((v) => v.setLayer(name)); },
    destroy(key) { const v = views.get(key); if (v) { v.destroy(); views.delete(key); } },
  };
  BL.MapController = MapController;

  /* ---------- Route geometry helpers ---------- */
  const RouteUtil = {
    /** cumulative distance array (meters) */
    cumulative(points) { const out = [0]; for (let i = 1; i < points.length; i++) out.push(out[i - 1] + BL.haversine(points[i - 1], points[i])); return out; },
    /** position after `meters` along route (loops if longer than route) */
    positionAt(points, cum, meters) {
      const total = cum[cum.length - 1];
      if (total <= 0) return { latlng: points[0], index: 0, path: [points[0]] };
      const d = meters % total, laps = Math.floor(meters / total);
      let i = 1; while (i < cum.length && cum[i] < d) i++;
      if (i >= cum.length) return { latlng: points[points.length - 1], index: points.length - 1, path: points.slice(), laps };
      const segLen = cum[i] - cum[i - 1] || 1, t = (d - cum[i - 1]) / segLen;
      const a = points[i - 1], b = points[i];
      const latlng = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const path = points.slice(0, i).concat([latlng]);
      return { latlng, index: i - 1, path, laps };
    },
  };
  BL.RouteUtil = RouteUtil;
})(window.BL = window.BL || {});
