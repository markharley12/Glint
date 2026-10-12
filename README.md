# Glint — what’s overhead?

Point your phone at the sky and see which satellites are up there. Glint is a
free, open-source web app: no app store, no account, and it works offline once
loaded. (The name is provisional; the repository is `sat-ar`.)

- **Sky map** — a chart of the whole sky above you, with every satellite you
  could see right now, the stars, constellations, Moon and planets.
- **Sky view** — a planetarium you drag around and pinch to zoom.
- **AR view** — the camera feed with the sky drawn over it, steered by your
  phone’s motion sensors. Calibrate on the Moon, a planet or a bright star to
  fix your compass.
- **“What’s that?”** — saw something moving? Follow it with the phone for
  five seconds and Glint works out which satellite it was from its path.
- **“What did I see?”** — for something you noticed a few minutes ago: say
  roughly when, which way it went and how bright it was.
- **Satellite trains** — the strings of new Starlinks (and other
  constellations’ launches) are drawn as one line with one label, and listed
  in Passes.
- **Tap a dot** to see what it is, how high and bright it is, and when it
  next passes over — then jump there in time or add it to your calendar.
- **Passes** — the bright satellites (ISS, Tiangong, Hubble, rocket bodies…)
  and satellite trains you can see in the next 48 hours.
- **Time travel** — step or fast-forward the clock to preview tonight’s sky.
- **Night mode** — red only, to keep your eyes dark-adapted.

## How it works

| Piece | What it does |
|---|---|
| `scripts/fetch-data.ts` | Downloads orbital elements from [CelesTrak](https://celestrak.org) plus catalogue data and McCants’ magnitudes, and writes compact “packs” to `public/data/`. Run by the Pages workflow every six hours, so browsers never contact CelesTrak. |
| `src/core/` | The maths, all pure TypeScript: SGP4 (via [satellite.js](https://github.com/shashwatak/satellite-js)) to topocentric coordinates, Earth’s shadow, brightness, pass prediction, stars and planets (via [Astronomy Engine](https://github.com/cosinekitty/astronomy)), magnetic declination (WMM2025), calibration. |
| `src/worker/` | A Web Worker that propagates every loaded satellite (11,000+ with Starlink) a few times a second and answers pass and track queries, keeping the UI at 60 fps. |
| `src/sky/` | One canvas renderer drawing the sky through either projection: polar chart or perspective camera. |
| `src/sensors/` | Device orientation (Generic Sensor API, `deviceorientationabsolute`, or iOS’s compass) and the camera. |
| `src/ui/`, `src/state/` | Preact components and signals. |

### Accuracy

The core maths is checked against [Skyfield](https://rhodesmill.org/skyfield/)
(`tools/reference/`): satellite positions agree to within 9 arcseconds and
40 m, all 228 reference passes are found with rise and set within a second,
and stars and planets agree to within 21″. Declination matches an independent
WMM2025 implementation to 0.01°.

In practice the limits are elsewhere: orbital elements a few days old put
fast-decaying satellites a few seconds early or late, and phone compasses are
often 5–15° out — which is what calibration is for.

## Development

Needs Node 22.18 or newer (scripts run TypeScript directly).

```bash
npm install
npm run data        # fetch orbital data into public/data (needed once, then every few days)
npm run dev         # http://localhost:5173
npm run check       # lint + types + unit tests
npm run e2e         # end-to-end tests (uses the system Chrome)
npm run build       # production build in dist/
```

Other scripts:

- `npm run data -- --cache-only` rebuilds packs from `.cache/data/` without
  touching the network. Downloads are cached and reused while fresh (two
  hours for orbits), because CelesTrak blocks clients that download too often.
- `npm run cities` rebuilds `src/data/places/` (towns for the location
  search, from GeoNames; committed).
- `npm run stars` rebuilds `src/data/sky.json` (stars and constellations; the
  output is committed).
- `node scripts/render-icons.ts` re-renders the PNG icons from `pwa/icon.svg`.
- `node scripts/make-e2e-data.ts` regenerates the end-to-end tests’ fixture data.
- `tools/reference/make_fixtures.py` regenerates the Skyfield reference values
  (Python; see the file for setup).

Handy URL parameters: `?lat=51.48&lon=-0.01&t=2026-10-12T19:30:00Z&view=sky&sat=25544&paused=1`.

### Testing on a phone

Camera and motion sensors only work in a secure context, so the phone needs
HTTPS:

- **Tailscale** (no certificate warnings): run `npm run dev`, then
  `tailscale serve --bg 5173` and open the `https://<machine>.<tailnet>.ts.net`
  address on the phone.
- **LAN**: `HTTPS=1 npm run dev` serves a self-signed certificate; accept the
  warning on the phone.

## Deployment

`.github/workflows/pages.yml` fetches fresh data, tests, builds and deploys to
GitHub Pages on every push to `master` and every six hours. Enable Pages once
with the source set to GitHub Actions. The build uses relative paths, so it
also works from any static host.

## Credits and licences

Code: MIT (see `LICENSE`).

- Orbital elements and satellite catalogue: CelesTrak (T. S. Kelso).
- Standard magnitudes: Mike McCants’ `quicksat.mag`.
- Stars: Yale Bright Star Catalogue, 5th revised edition (Hoffleit & Warren),
  via CDS VizieR (catalogue V/50).
- Constellation lines and names: [d3-celestial](https://github.com/ofrohn/d3-celestial)
  by Olaf Frohn, BSD-3-Clause.
- satellite.js (MIT), Astronomy Engine (MIT), geomagnetism with NOAA/BGS’s
  World Magnetic Model (MIT; WMM is public domain), Preact (MIT).
