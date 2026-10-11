# sat-ar — options & decisions

Each section lists options, trade-offs, and a **recommendation (★)**. Nothing here is final —
pick, swap, and update `PLAN.md` once decided.

---

## 1. Project name

Check GitHub / npm / domain / app-store availability before committing.

| Name | Vibe | Notes |
|---|---|---|
| ★ **Overhead** | Plain, descriptive | "What's overhead?" — the exact question the app answers. Easy to say. |
| ★ **Glint** | Short, evocative | Satellites are only visible because sunlight glints off them. Memorable, brandable. |
| ★ **Sunlit** | Nerdy-evocative | Ties to the core physics (visible = sunlit sat over a dark observer). |
| Satspot | Descriptive, playful | Very clear; a bit generic. |
| Flyby | Playful | Nice for passes; may be taken in many places. |
| Skytrace | Descriptive | Fits the trails/tracks visual. |
| OrbitLens | Descriptive | Clear "AR lens" framing; a bit corporate. |
| Look Up | Friendly | Great tagline, weak as a name (also a film). |
| What's That Sat? | Playful | Good tagline for the identify feature. |
| Dusk | Evocative | Best viewing time; probably too vague. |

Avoid: OpenSky (ADS-B network), Heavens-anything (Heavens-Above), Zenith/Skywatch (overused),
Passover (holiday clash).

**Suggestion:** *Glint* as the name, "What's overhead?" as the tagline.

---

## 2. Default satellites on first launch

| Option | Contents | Pros | Cons |
|---|---|---|---|
| A. Minimal | `stations` + `visual` (~150 brightest) | Clean, fast, every label is plausibly naked-eye | Misses Starlink trains — the most common "what was that?!" |
| ★ B. Spotter | A + recent launches (`last-30-days`, catches fresh Starlink trains) + Starlink, **"visible now" filter on** | Covers what people actually see; still uncluttered because of the filter | Starlink adds ~10k objects to propagate (fine in a worker) |
| C. Everything | All `active` (~12k+) | Complete | Cluttered; needs aggressive label culling |

Opt-in categories in filters: GPS/GNSS, weather, amateur radio, science, geostationary, debris (later via Space-Track).

---

## 3. Platform

| Option | Pros | Cons |
|---|---|---|
| ★ **PWA (web app)** | One codebase, no store, instant updates, free hosting | iOS: no Generic Sensor API, limited push notifications |
| Capacitor wrapper of the PWA | Same code + store presence, native notifications & better sensors | Store accounts (Apple $99/yr), review process |
| Flutter / React Native | Near-native perf, good sensor access | Rewrite; more complexity |
| Native Swift + Kotlin | Best sensors/ARKit/ARCore | Two codebases — not vibe-code friendly |

**Recommendation:** PWA now; keep the option of wrapping with Capacitor later if notifications/sensors demand it.

---

## 4. UI framework

| Option | Notes |
|---|---|
| Vanilla TS | Smallest, fastest; UI panels get tedious |
| ★ **Preact** | React API (AI tools know it well), ~4 KB |
| Svelte | Lovely DX, small output; slightly less AI familiarity |
| React | Heaviest; no real benefit here |

The AR render loop stays plain TS + canvas regardless; the framework only handles panels/menus.

---

## 5. Rendering

| Option | Use for |
|---|---|
| ★ **Canvas 2D** | v1 sky map + v2 AR overlay — simple, plenty fast for a few hundred visible labels |
| three.js (WebGL) | Later: 3D globe view, orbit rings, star field with thousands of points |
| PixiJS | Middle ground; probably unnecessary |

---

## 6. Orbit data source & pipeline

| Option | Pros | Cons |
|---|---|---|
| Client fetches CelesTrak directly | Zero infra | Every user hits CelesTrak; CORS/rate-limit risk |
| ★ **GitHub Action cache** (fetch every ~6h → static JSON deployed with site) | Free, polite to CelesTrak, works offline | Data up to ~6h old (fine) |
| Cloudflare Worker proxy + cache | Fresher on demand | Extra service to maintain |
| Space-Track.org | Full catalogue incl. debris | Account + stricter usage terms; better as a later add-on |

**Metadata extras:**
- CelesTrak SATCAT — owner, launch date, object type.
- **SatNOGS DB** (open) — transmitter frequencies → enables a ham-radio mode.
- McCants intrinsic magnitudes — brightness estimates.
- Launch Library 2 (free API) — upcoming launches / "new train coming".

---

## 7. Propagation library

| Option | Notes |
|---|---|
| ★ **satellite.js** | Standard, MIT, well-tested |
| ootk | TypeScript-native, more features (used by KeepTrack); heavier |
| Own SGP4 → WASM | Only if perf becomes a problem (unlikely) |

---

## 8. Orientation & calibration (the accuracy problem)

| Option | Effort | Notes |
|---|---|---|
| Raw compass only | Low | What the bad apps do — 5–15° error |
| ★ **Tap-to-calibrate on Moon/planet/bright star** | Low–Med | Big accuracy win, simple UX |
| Auto-detect Sun/Moon in camera frame | Med | Bright blob detection; automatic re-calibration |
| Declination correction (World Magnetic Model) | Low | Always do this; cheap |
| 🚀 Star plate-solving from camera | High | Detect stars in the feed, match to catalogue → near-perfect orientation. Phone video is noisy at night, so this is a moonshot/research item |

---

## 9. Identification method

| Option | Robustness | Notes |
|---|---|---|
| Tap nearest | OK | Fails in dense Starlink areas |
| Tap + swipe along direction of motion | Good | Cheap to add |
| ★ **"Follow it" mode** | Excellent | Keep the crosshair on the moving dot for 3–5s; match the phone's orientation trace against every satellite's sky path. Calibration errors mostly cancel out because direction and speed matter more than absolute position. **Probably the killer feature.** |
| 🚀 Camera detects moving dots | Very high effort | Moonshot |
| "What was that?" after the fact | Good | Enter rough time + direction (+ swipe direction) → candidates. Works with no AR at all |

---

## 10. Brightness estimates

| Option | Notes |
|---|---|
| None | Just show visible/not |
| Range-based heuristic | Easy, crude |
| ★ **Intrinsic magnitude + range + phase angle** | Standard approach (McCants data); good enough |
| Per-type models (Starlink attitude, etc.) | Research-grade; skip |

---

## 11. Notifications (pass alerts)

| Option | Notes |
|---|---|
| Web Push | Android fine; iOS only for installed PWAs (16.4+); needs a push server |
| ★ **Calendar export (.ics)** for upcoming passes | Zero infra, works everywhere — good v1 |
| Capacitor local notifications | Best UX; needs a store app |

---

## 12. Hosting

★ GitHub Pages (pairs with the GitHub Action data pipeline) · Cloudflare Pages (fast, also free) · Netlify/Vercel (fine, no advantage).

---

## 13. License

| Option | Notes |
|---|---|
| ★ **MIT** | Max reuse; fine if written from scratch |
| GPL/AGPL | Keeps forks open; **required** if we copy code from KeepTrack (AGPL) |

---

## 14. Feature ideas (ranked: value ÷ effort)

1. ★ ISS / Tiangong pass predictions + calendar export
2. ★ Starlink train finder (recent launches, "visible tonight at 19:42 NW→SE")
3. ★ "Follow it" identification
4. ★ Time scrubber — preview the sky at any time (the Stellarium feel)
5. Background star field + constellation lines in AR (HYG/Yale bright star catalogue) — makes it feel like Stellarium and doubles as calibration targets
6. Night/red mode for dark adaptation
7. "What was that?" retro lookup
8. Ground track map (2D) + 3D globe view
9. Ham radio mode — SatNOGS frequencies, Doppler shift, pass timing
10. Upcoming launches + re-entry predictions
11. Astrophotography planner — "a sat will cross Orion at 21:14"
12. Share a pass (link/image)

Iridium flares are a dead feature (the old satellites were deorbited) — skip.

---

## 15. Prior art to study (don't reinvent, do differentiate)

- **KeepTrack.space** — open-source (AGPL) web 3D tracker; great reference for data/propagation, not AR.
- **Stellarium** — has a satellites plugin; desktop-first, no proper AR.
- **Heavens-Above** — gold standard for pass predictions; use it to validate our maths.
- **N2YO**, **ISS Detector**, **Sky Tonight**, **Star Walk Satellite Tracker**, **GPredict** (desktop, ham radio).

Where we're different: free + open + web + **accuracy via calibration** + **"follow it" identification**.

---

## Summary of recommended picks

| Decision | Pick |
|---|---|
| Name | Glint (alt: Overhead, Sunlit) |
| Defaults | Spotter set, "visible now" filter on |
| Platform | PWA, Capacitor later if needed |
| UI | Preact + canvas render loop |
| Rendering | Canvas 2D (three.js later for 3D) |
| Data | CelesTrak via GitHub Action cache |
| Propagation | satellite.js |
| Calibration | Tap on Moon/planet/star + WMM declination |
| Identify | Tap + swipe → "Follow it" mode |
| Notifications | .ics calendar export first |
| Hosting | GitHub Pages |
| License | MIT |
