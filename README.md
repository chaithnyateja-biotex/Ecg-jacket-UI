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

## Sensors (v1.1)

The jacket carries **four sensors**: ECG textile electrodes, an optical pulse sensor (heart rate + SpO₂) and a skin-temperature sensor; the phone supplies GPS for routes, distance, pace and elevation. There is **no motion/accelerometer sensor and no respiration sensor**, so the app deliberately shows no steps, cadence or respiration-rate vitals. In their place:

- **Active minutes** are heart-rate based — minutes at or above 30 % of heart-rate reserve — with a daily goal in the profile.
- **Breathing rate** appears only as an *estimate* in the ECG RR panel (respiratory sinus arrhythmia in the RR series), never as a measured vital.
- **Optical artefacts** are detected from the signals themselves: the ECG-vs-optical cross-check (> 5 bpm apart) and PPG waveform stability (SpO₂ readings flagged "unstable" during hard efforts).

## What is calculated — and how (v1.1)

Every training number on screen is computed from the sensor signals with published formulas. The in-app **Signal Map** (Jacket → Signal Map) and **Calculations** (sidebar / Insights / Heart) screens show the formulas with a live worked example from your profile; the same functions live in `js/metrics.js`.

| Metric | Formula / method | Source | Where it shows |
| --- | --- | --- | --- |
| HRmax | 208 − 0.7 × age (or your own value) | Tanaka 2001 | Profile, Heart, Calculations |
| Training zones Z1–Z5 | HRrest + 50/60/70/80/90 % × (HRmax − HRrest) | Karvonen | Heart, Live activity, Summary (HR vs zones, time in zone) |
| Heart-rate recovery HRR60 / HRR120 | HRpeak − HR 60 s / 120 s after stopping — measured live for 3 min after **Finish** | — | Summary, Heart (curve + 8-week trend), Insights |
| HRV: RMSSD, SDNN, pNN50, ln RMSSD | from the ECG RR intervals (every R-peak of the live trace) | — | ECG (RR panel, saved sessions), Recovery, Calculations |
| Breathing rate | respiratory modulation of the RR series | — | ECG RR panel |
| Readiness | z = (today − 28-day mean) ÷ 28-day SD for ln RMSSD and resting HR; ease off at HRV z ≤ −1, RHR z ≥ +1 or skin temp ≥ +0.5 °C | — | Recovery (28-day chart with normal range), Home insight |
| Session load TRIMP | minutes × x × 0.64 × e^(1.92x) (women 0.86 × e^(1.67x)), x = (HRavg − HRrest) ÷ (HRmax − HRrest) | Banister 1991 | Live activity, Summary, History |
| Load balance ACWR | 7-day average load ÷ 28-day average load; 0.8–1.3 steady, > 1.5 spike; monotony = mean ÷ SD of 7 days | Gabbett 2016 | Home card, Analytics (28-day bars + ratio line) |
| HR drift | (2nd-half mean − 1st-half mean) ÷ 1st-half mean, warm-up skipped, steady-pace sessions only | — | Summary, Heart |
| VO₂max | 15.3 × HRmax ÷ HRrest | Uth 2004 | Profile, Heart |
| Energy | kcal/min = (a + b·HR + c·kg + d·age) ÷ 4.184 | Keytel 2005 | Live calories |
| SpO₂ | R = (ACred/DCred) ÷ (ACir/DCir), SpO₂ ≈ 110 − 25 R; readings flagged while moving | — | Live tile, Summary (SpO₂ + temperature with hard reps shaded) |
| Heat strain PSI | 5 (T − T0)/(39.5 − T0) + 5 (HR − HR0)/(180 − HR0), 0–10 | Moran 1998 | Live tile, Summary |
| HR cross-check | ECG R-peak rate vs optical pulse rate; > 5 bpm apart = optical artefact | — | Heart |

Population formulas carry individual error — the screens say so, and HRmax can be overridden in the profile. Choose **Interval Run** (5 × 3 min hard / 2 min easy) in Start Activity to see the zone chart, SpO₂ dips, heat strain and a live heart-rate-recovery capture; stop right after a hard rep to measure HRR from the peak.

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
index.html            app shell, all 24 screens, inline SVG icon sprite + brand mark
style.css             design tokens (CSS variables), base, layout, animations, light theme
css/components.css    buttons, cards, chips, gauges, charts, lists, nav, sheets, modals, toasts, map, jacket, battery
css/screens.css       per-screen layouts
css/responsive.css    phone → tablet → desktop shell (sidebar at ≥1024px)
script.js             App bootstrap, view-model, global actions, CSV export
js/utils.js           DOM / math / formatting / animation helpers
js/storage.js         StorageManager (localStorage), SettingsStore, unit formatters
js/data.js            demo datasets, seed activities / ECG sessions / notifications, 28-day load & HRV series, signal map
js/metrics.js         pure calculation layer — Tanaka, Karvonen, HRR, HRV, readiness z-scores, TRIMP, ACWR, drift, VO₂max, Keytel, SpO₂ R-ratio, PSI
js/simulator.js       HealthDataSimulator + BodyBattery / Fatigue / Recovery engines
js/ecg.js             ECGRenderer — mathematical PQRST morphology, 25 mm/s · 10 mm/mV sweep on Canvas
js/charts.js          ChartManager — canvas line/area/bar charts, sparklines, SVG ring & arc gauges
js/map.js             MapController — Leaflet + OpenStreetMap tiles, route progression, GPS marker
js/device.js          DeviceManager — connection state machine, battery, sensors, demo flows
js/notifications.js   NotificationManager + toasts
js/activity.js        ActivityTracker — live session engine, summary builder, history store
js/navigation.js      NavigationManager — SPA routing, transitions, hash deep-links, nav state
js/ui.js              UIManager — data-binding, bottom sheet / modal / prompt / form, renderers
js/screens.js         screen controllers (splash … history, signal map, calculations)
assets/data/route-hyderabad.js   real road geometry: Hussain Sagar loop from Lumbini Park (OSM/OSRM)
assets/images/        favicon + drop-in location for the official logo
```

Persistence (localStorage, prefix `biotexlife.`): onboarding, settings, profile, saved ECG sessions, saved activities, notifications, jacket connection status.

## Notes

- All physiology is **simulated** for interface evaluation. Body Battery, Fatigue and Recovery are demo models — not clinically validated algorithms. The training metrics above use the published formulas on the simulated signals (ECG RR intervals, heart rate, SpO₂, skin temperature).
- Map data © OpenStreetMap contributors. The dark map style is a CSS treatment of standard OSM tiles (no API key required). CARTO/Stadia dark tiles now require keys, so they are intentionally not used.
- Web Share API is used where available (mobile browsers / https); otherwise the summary is copied to the clipboard.

**Important** — Biotex Life is presented here as a wellness, fitness and physiological monitoring interface. The prototype is not intended to diagnose, treat, cure or prevent any medical condition and does not replace professional medical evaluation.
