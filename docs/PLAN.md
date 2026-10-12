# sat-ar — AR satellite tracker (plan)

Free, open, browser-based "Stellarium for satellites": point your phone at the sky,
see what's up there, tap a moving dot to identify it.

## Goals
- Live AR overlay of satellites on the camera feed, accurate enough to identify a naked-eye pass.
- Tap-to-identify a moving object.
- "What's visible tonight" pass predictions.
- Works on Android + iOS with no app store (installable PWA), works offline once data is cached.

## Non-goals (for now)
- Native apps, accounts, backend servers.
- Debris/full catalogue (Space-Track) — maybe later.
- Precise photometric brightness modelling.

---

## Stack
- **Vite + TypeScript**, no UI framework (vanilla + small modules; Preact only if UI grows).
- **satellite.js** — SGP4 propagation + look angles.
- **astronomy-engine** (MIT) — Sun/Moon/planet positions (for twilight, eclipse, calibration targets).
- **Canvas 2D** overlay on top of a `<video>` camera feed. (WebGL only if perf demands.)
- **Web Worker** for propagation so the UI thread stays at 60fps.
- **vite-plugin-pwa** for installability + offline cache.
- **@vitejs/plugin-basic-ssl** (or mkcert) — HTTPS for phone testing on LAN; camera/sensors require a secure context.
- Hosting: GitHub Pages or Cloudflare Pages (free, HTTPS).

## Data pipeline
- Source: CelesTrak GP data, JSON/OMM format
  `https://celestrak.org/NORAD/elements/gp.php?GROUP=<group>&FORMAT=json`
  Groups to start: `stations`, `visual` (brightest ~150), `starlink`, `active`.
- **Don't have every user hit CelesTrak.** A scheduled GitHub Action fetches groups every
  ~6h and commits/deploys them as static JSON alongside the site. Solves CORS uncertainty
  and respects CelesTrak's "don't poll more than every 2h" rule.
- Client caches the latest data in IndexedDB; shows data age; warns if > 3 days old
  (SGP4 accuracy degrades with element age, esp. for low/manoeuvring sats like Starlink).
- Optional extra metadata later: satellite type/owner/launch (CelesTrak SATCAT), intrinsic
  magnitudes (McCants list) for brightness estimates.

## Core maths
Per satellite, per tick:
1. `propagate(satrec, date)` → ECI position/velocity.
2. `gstime(date)` → `eciToEcf` → `ecfToLookAngles(observer, ecf)` → azimuth, elevation, range.
3. **Visibility:** naked-eye visible when
   - elevation > 0 (or > ~10° for practical viewing),
   - observer in darkness (Sun elevation < −6°),
   - satellite sunlit (cylindrical Earth-shadow test using Sun vector — good enough).
4. Angular velocity / direction of motion on the sky (difference of look angles over ~1s) — used for tap-to-identify.

Performance plan:
- Worker propagates the active set at ~1 Hz (10k SGP4 calls ≈ tens of ms — fine).
- Main thread interpolates az/el between worker ticks for smooth 60fps rendering.
- Skip propagating sats that are well below horizon on the previous tick, with periodic full refresh.

## AR projection
- Orientation source, best first:
  1. `AbsoluteOrientationSensor` (Generic Sensor API, Chrome Android) → quaternion.
  2. `deviceorientationabsolute` event (Android).
  3. iOS: `DeviceOrientationEvent.requestPermission()` on a user tap, then `deviceorientation` + `webkitCompassHeading`.
- Build rotation matrix world(ENU) → device; camera looks along device −Z.
- Satellite az/el → ENU unit vector → camera frame → pinhole projection using camera FOV.
- FOV: start with a sensible default (~60–65° vertical in portrait); user-adjustable and refined by calibration.
- Handle screen orientation (portrait/landscape) and smooth with a low-pass/slerp filter.
- Magnetic vs true north: compass gives magnetic heading → apply declination (WMM via a small
  `geomagnetism` lib) and/or let the calibration offset absorb it.

## Calibration (the differentiator)
Phone compasses are commonly 5–15° off — this is why most AR sky apps feel wrong.
- "Calibrate" mode: app shows nearest bright reference (Moon, Venus/Jupiter, or one of ~50
  brightest stars). User centres it in crosshair and taps.
- Compute yaw (and small pitch) offset between predicted and sensor direction; store per device.
- Re-calibrate prompt if sensors report low accuracy.
- Daytime/fallback: calibrate on the Sun (with a warning about not looking at it) or skip.

## Tap-to-identify
- Tap point → screen to az/el (inverse projection).
- Candidates within ~5° (scaled by calibration confidence).
- Score = angular distance + (optional) direction-of-motion match: user can swipe along the
  object's path; compare swipe vector to each candidate's sky motion.
- Prefer currently-visible (sunlit) objects.
- Result card: name, NORAD ID, type/owner, altitude, range, speed, sunlit/eclipsed, next pass.

## UI / screens
1. **Sky map** (polar az/el plot, zenith centre) — desktop & no-sensor fallback; also v1's proving ground.
2. **AR view** — camera + overlay, labels, motion trails/ground arcs, crosshair.
3. **Passes** — list of upcoming visible passes for next 24–48h (start/max/end, max elevation, direction).
4. **Filters** — groups (stations, bright, Starlink, GPS, weather…), visible-only, min elevation, label density.
5. **Settings** — location (GPS or manual), FOV, calibration, data refresh.

---

## Milestones

Progress as of Oct 2026; see CLAUDE.md for what was decided along the way.

### v1 — Sky map (prove the maths)
- [x] Vite + TS scaffold, HTTPS dev server reachable from phone (`tailscale serve` or `HTTPS=1`).
- [x] Load `stations` + `visual` groups (built into packs by `scripts/fetch-data.ts`).
- [x] Geolocation (with manual lat/lon fallback).
- [x] Worker propagation + polar sky map, live updating; sunlit vs eclipsed colouring.
- [x] **Validation:** checked against Skyfield instead of by hand against Heavens-Above:
      9″ / 40 m in position, rise/set within 1 s for all 228 reference passes.

### v2 — AR view
- [x] Camera feed (`getUserMedia`, rear camera).
- [x] Orientation pipeline for Android + iOS, screen-orientation handling, smoothing. **Needs real-device testing.**
- [x] Projection + labels + trails; on-screen arrow pointing to off-screen tracked sat.
- [x] Tap-to-identify + result card.

### v3 — Accuracy + usefulness
- [x] Calibration flow (Moon/planets/bright stars via astronomy-engine).
- [x] Pass predictions screen (+ .ics export).
- [x] GitHub Action data pipeline + offline cache (service worker, not IndexedDB) + data-age indicator.
- [x] PWA install + offline.
- [x] Filters, rough brightness estimates, satellite-train detection (drawn and listed).

### Since
- [x] "What's that?": identify a light by following it with the phone.
- [x] Night (red) mode, share links, place-name search, keyboard shortcuts.
- [x] Battery: the render loop draws at 10–20 fps when nothing changes.

### Later ideas
- Pass notifications (web push is limited on iOS — maybe calendar export instead).
- Space-Track full catalogue (debris, rocket bodies).
- "What was that?" lookup for a time + direction after the fact.

## Risks / open questions
- Compass accuracy and sensor quirks across phones → mitigated by calibration; needs real-device testing.
- iOS Safari: permission prompts, no Generic Sensor API, PWA limitations.
- Camera FOV varies by phone → calibration/adjustable setting.
- Battery use with camera + sensors + worker → throttle when idle.
- Name, defaults, and all other open choices: see `OPTIONS.md` (options + recommended picks).
