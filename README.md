# BIOTEX LIFE — ECG • Activity • Recovery

Premium mobile-first web prototype for the **BIOTEX ECG JACKET** (Biotex Life Solutions Pvt. Ltd., Hyderabad).
Connected human performance: live ECG, wearable physiology, GPS activity tracking, Body Battery, fatigue, recovery and analytics.

## Launch

**Option 1 — double-click `index.html`.**
Everything runs client-side (vanilla HTML/CSS/JS, Canvas, SVG, Leaflet). Map tiles, Leaflet and the Inter/Manrope fonts are loaded from the internet; the app degrades gracefully without a connection (map shows an "unavailable" state, system fonts are used).

**Option 2 — local server (recommended for recording demos / testing Web Share):**

```
start-local-server.bat         (Windows — uses Python or Node, opens http://localhost:8080)
```
or manually: `python -m http.server 8080` / `npx serve .` inside this folder.

Deep links work: `index.html#/ecg`, `#/analytics`, `#/device`, `#/body-battery`, … (the splash plays first).

## Demo journey

Splash → Onboarding (3 screens) → Connect Your Jacket (Search → Connected) → Dashboard →
Body Battery / Heart Rate / Live ECG (Start Recording → Save) → START ACTIVITY → Live Activity →
Open Map (route draws in Hyderabad) → Open ECG during activity → Pause / Resume → Finish →
Activity Summary (Save / Share / CSV) → Fatigue → Recovery → Analytics (Day/Week/Month/Year) → Profile → Jacket.

Tips for presentations
- On the live activity screen tap **Demo ×1** to cycle the simulation speed (×1 / ×5 / ×20) so the route and metrics advance quickly on screen.
- **Settings → Demo scenarios** pushes a sensor alert, simulates a jacket disconnect, a low battery or a sensor-sync failure, and resets all demo data.
- **Jacket → Demo charging** animates the battery; **Find My Jacket**, **Calibrate**, **Firmware Update** and **Diagnostic Check** run full progress flows.
- Dark mode is the primary design; a light theme is available in Settings.

## Official Biotex logo

No logo file existed in this folder, so the app ships with an original BIOTEX LIFE SVG wordmark.
To use the official artwork, drop a file at **either** of these paths — no code changes needed, every placement (splash, onboarding, header, pairing, device, profile, about) switches automatically:

```
assets/images/biotex-logo.png
assets/images/biotex-logo.svg
```
Use a transparent PNG/SVG, ideally a white/light version for the dark UI. If the artwork is dark, the app places it on a light glass background automatically (when served over http; on `file://` the logo is shown as-is).

## Structure

```
index.html            app shell, all 22 screens, inline SVG icon sprite + brand mark
style.css             design tokens (CSS variables), base, layout, animations, light theme
css/components.css    buttons, cards, chips, gauges, charts, lists, nav, sheets, modals, toasts, map, jacket, battery
css/screens.css       per-screen layouts
css/responsive.css    phone → tablet → desktop shell (sidebar at ≥1024px)
script.js             App bootstrap, view-model, global actions, CSV export
js/utils.js           DOM / math / formatting / animation helpers
js/storage.js         StorageManager (localStorage), SettingsStore, unit formatters
js/data.js            demo datasets, seed activities / ECG sessions / notifications, insights
js/simulator.js       HealthDataSimulator + BodyBattery / Fatigue / Recovery engines
js/ecg.js             ECGRenderer — mathematical PQRST morphology, 25 mm/s · 10 mm/mV sweep on Canvas
js/charts.js          ChartManager — canvas line/area/bar charts, sparklines, SVG ring & arc gauges
js/map.js             MapController — Leaflet + OpenStreetMap tiles, route progression, GPS marker
js/device.js          DeviceManager — connection state machine, battery, sensors, demo flows
js/notifications.js   NotificationManager + toasts
js/activity.js        ActivityTracker — live session engine, summary builder, history store
js/navigation.js      NavigationManager — SPA routing, transitions, hash deep-links, nav state
js/ui.js              UIManager — data-binding, bottom sheet / modal / prompt / form, renderers
js/screens.js         screen controllers (splash … history)
assets/data/route-hyderabad.js   real road geometry: Hussain Sagar loop from Lumbini Park (OSM/OSRM)
assets/images/        favicon + drop-in location for the official logo
```

Persistence (localStorage, prefix `biotexlife.`): onboarding, settings, profile, saved ECG sessions, saved activities, notifications, jacket connection status.

## Notes

- All physiology is **simulated** for interface evaluation. Body Battery, Fatigue and Recovery are demo models — not clinically validated algorithms.
- Map data © OpenStreetMap contributors. The dark map style is a CSS treatment of standard OSM tiles (no API key required). CARTO/Stadia dark tiles now require keys, so they are intentionally not used.
- Web Share API is used where available (mobile browsers / https); otherwise the summary is copied to the clipboard.

**Important** — Biotex Life is presented here as a wellness, fitness and physiological monitoring interface. The prototype is not intended to diagnose, treat, cure or prevent any medical condition and does not replace professional medical evaluation.
