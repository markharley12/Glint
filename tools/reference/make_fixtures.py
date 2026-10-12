"""Reference values from Skyfield, for checking the TypeScript maths.

Skyfield is an independent implementation with the full IERS treatment
(UT1, precession-nutation, JPL ephemerides), so agreement with it checks
satellite.js's SGP4, our TEME → ENU transform, the Sun and shadow model,
and the pass finder all at once.

Reads src/core/fixtures/elements.json, writes src/core/fixtures/skyfield.json.
The output is committed; CI never runs this. Re-run it only when the
elements fixture changes:

    cd tools/reference
    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
    .venv/bin/python make_fixtures.py
"""

import json
from datetime import timedelta
from pathlib import Path

from skyfield.api import EarthSatellite, Loader, Star, wgs84

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "src" / "core" / "fixtures"

load = Loader(Path(__file__).parent / ".cache")
ts = load.timescale()
eph = load("de421.bsp")
earth, sun = eph["earth"], eph["sun"]

OBSERVERS = {
    "greenwich": (51.4769, -0.0005, 46.0),
    "sydney": (-33.8688, 151.2093, 50.0),
    "fairbanks": (64.8378, -147.7164, 136.0),
}

# A day from shortly after the newest epoch in the fixture, sampled every
# 17 minutes so samples land at varied orbital phases.
START = ts.utc(2026, 10, 11, 12, 0, 0)
SAMPLE_MINUTES = 17
SAMPLE_COUNT = 85  # just over 24 h


def satellites():
    elements = json.loads((FIXTURES / "elements.json").read_text())["elements"]
    sats = []
    for omm in elements:
        fields = {k: str(v) for k, v in omm.items()}
        sats.append(EarthSatellite.from_omm(ts, fields))
    return sats


def iso(t):
    return t.utc_strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def ms(t):
    # Unix milliseconds of a Skyfield Time, from its UTC calendar fields.
    dt = t.utc_datetime()
    return round(dt.timestamp() * 1000, 1)


def looks(sats):
    out = []
    times = ts.utc(2026, 10, 11, 12, [i * SAMPLE_MINUTES for i in range(SAMPLE_COUNT)])
    for name, (lat, lon, h) in OBSERVERS.items():
        topos = wgs84.latlon(lat, lon, elevation_m=h)
        sun_alt, _, _ = (earth + topos).at(times).observe(sun).apparent().altaz()
        for sat in sats:
            diff = (sat - topos).at(times)
            alt, az, dist = diff.altaz()
            sunlit = sat.at(times).is_sunlit(eph)
            for i, t in enumerate(times):
                out.append(
                    {
                        "observer": name,
                        "norad": sat.model.satnum,
                        "ms": ms(t),
                        "iso": iso(t),
                        "az": round(float(az.degrees[i]), 6),
                        "el": round(float(alt.degrees[i]), 6),
                        "range": round(float(dist.km[i]), 4),
                        "sunlit": bool(sunlit[i]),
                        "sunEl": round(float(sun_alt.degrees[i]), 4),
                    }
                )
    return out


def passes(sats):
    """Rise / culmination / set over three days, for the LEO objects."""
    out = []
    t0 = START
    t1 = ts.utc(START.utc_datetime() + timedelta(days=3))
    for name, (lat, lon, h) in OBSERVERS.items():
        topos = wgs84.latlon(lat, lon, elevation_m=h)
        for sat in sats:
            if sat.model.no_kozai * 1440 / (2 * 3.141592653589793) < 6:
                continue  # deep-space objects: hours-long passes, not useful here
            times, events = sat.find_events(topos, t0, t1, altitude_degrees=0.0)
            current = {}
            for t, e in zip(times, events):
                if e == 0:
                    current = {"rise": ms(t)}
                elif e == 1 and "rise" in current:
                    alt, az, _ = (sat - topos).at(t).altaz()
                    current["max"] = ms(t)
                    current["maxEl"] = round(float(alt.degrees), 5)
                    current["maxAz"] = round(float(az.degrees), 5)
                elif e == 2 and "max" in current:
                    current["set"] = ms(t)
                    out.append({"observer": name, "norad": sat.model.satnum, **current})
                    current = {}
    return out


# Stars by their BSC5 J2000 position as src/data/sky.json stores it, so the
# check covers our EQJ -> ENU rotation and not catalogue differences.
STARS = {"Sirius": (101.2871, -16.7161), "Vega": (279.2346, 38.7836), "Polaris": (37.9529, 89.2642), "Acrux": (186.6496, -63.0992)}
BODIES = {"Sun": "sun", "Moon": "moon", "Venus": "venus", "Jupiter": "jupiter barycenter", "Saturn": "saturn barycenter"}


def sky():
    """Apparent (aberrated, unrefracted) altaz of stars and bodies."""
    out = []
    times = ts.utc(2026, 10, 11, 12, [i * 97 for i in range(15)])
    for name, (lat, lon, h) in OBSERVERS.items():
        observer = earth + wgs84.latlon(lat, lon, elevation_m=h)
        targets = {k: Star(ra_hours=ra / 15, dec_degrees=dec) for k, (ra, dec) in STARS.items()}
        targets.update({k: eph[v] for k, v in BODIES.items()})
        for target, obj in targets.items():
            alt, az, dist = observer.at(times).observe(obj).apparent().altaz()
            for i, t in enumerate(times):
                out.append(
                    {
                        "observer": name,
                        "target": target,
                        "ms": ms(t),
                        "az": round(float(az.degrees[i]), 6),
                        "el": round(float(alt.degrees[i]), 6),
                    }
                )
    return out


def main():
    sats = satellites()
    data = {
        "note": "Generated by tools/reference/make_fixtures.py from elements.json with Skyfield. Do not edit.",
        "observers": {k: {"latitude": v[0], "longitude": v[1], "height": v[2] / 1000} for k, v in OBSERVERS.items()},
        "looks": looks(sats),
        "passes": passes(sats),
        "sky": sky(),
    }
    path = FIXTURES / "skyfield.json"
    path.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    print(f"wrote {path.relative_to(ROOT)}: {len(data['looks'])} looks, {len(data['passes'])} passes, {len(data['sky'])} sky")


if __name__ == "__main__":
    main()
