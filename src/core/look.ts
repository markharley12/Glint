/**
 * Everything about one satellite as seen by one observer at one instant:
 * where it is in the sky, how far, whether it is lit, and how bright.
 */
import { gstime } from 'satellite.js'
import { enuToHorizontal, type TopocentricFrame } from './frames.ts'
import { apparentMagnitude, phaseAngle } from './magnitude.ts'
import { jdFromMs, propagateJd, type Satellite } from './satellite.ts'
import { sunEnu, sunElevationDeg, sunlitFraction, sunTemeAu } from './sun.ts'
import type { Vec3 } from './vec.ts'

export interface Look {
  ms: number
  /** Degrees, geometric (no refraction). */
  az: number
  el: number
  /** Kilometres from the observer. */
  range: number
  /** km/s, positive when receding. */
  rangeRate: number
  /** Position relative to the observer, ENU km, and its rate, ENU km/s. */
  enu: Vec3
  enuVel: Vec3
  /** Satellite height above a spherical Earth, km — for display only. */
  altitude: number
  /** 1 = full sunlight, 0 = Earth's umbra. */
  sunlit: number
  /** The Sun's elevation at the observer, degrees. */
  sunEl: number
  /** Phase angle at the satellite (Sun–satellite–observer), radians. */
  phase: number
  /** Apparent magnitude if sunlit and the standard magnitude is known. */
  mag: number | null
}

const EARTH_MEAN_RADIUS = 6371.0

export function look(sat: Satellite, frame: TopocentricFrame, ms: number): Look | null {
  const jd = jdFromMs(ms)
  const sv = propagateJd(sat, jd)
  if (!sv) return null
  frame.setGmst(gstime(jd))
  const out = [0, 0, 0, 0, 0, 0]
  frame.toEnu(sv.p, sv.v, out)
  const enu: Vec3 = [out[0]!, out[1]!, out[2]!]
  const enuVel: Vec3 = [out[3]!, out[4]!, out[5]!]
  const range = Math.hypot(...enu)
  const { az, el } = enuToHorizontal(enu)
  const sunAu = sunTemeAu(jd)
  const sun = sunEnu(frame, sunAu)
  const sunlit = sunlitFraction(sunAu, sv.p)
  const phase = phaseAngle(enu, sun)
  const mag = sunlit > 0 && sat.stdMag !== null ? apparentMagnitude(sat.stdMag, range, phase) - 2.5 * Math.log10(sunlit) : null
  return {
    ms,
    az,
    el,
    range,
    rangeRate: (enu[0] * enuVel[0] + enu[1] * enuVel[1] + enu[2] * enuVel[2]) / range,
    enu,
    enuVel,
    altitude: Math.hypot(...sv.p) - EARTH_MEAN_RADIUS,
    sunlit,
    sunEl: sunElevationDeg(sun),
    phase,
    mag,
  }
}
