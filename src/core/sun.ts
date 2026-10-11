/**
 * The Sun as satellites see it: its TEME direction, whether a satellite is in
 * Earth's shadow, and the observer's twilight.
 *
 * Vallado's low-precision solar position (via satellite.js) is good to 0.01°,
 * which moves a shadow entry by well under a second; the cheapness matters
 * because it runs once per tick for thousands of satellites. Precise Sun,
 * Moon and planet positions for display come from astronomy-engine in
 * bodies.ts.
 */
import { shadowFraction, sunPos } from 'satellite.js'
import type { TopocentricFrame } from './frames.ts'
import { mat3, RAD, type Vec3 } from './vec.ts'

export const KM_PER_AU = 149_597_870.7

/** Sun position in TEME (strictly, mean equator of date), AU. */
export function sunTemeAu(jd: number): Vec3 {
  const { rsun } = sunPos(jd)
  return [rsun.x, rsun.y, rsun.z]
}

/**
 * Fraction of the Sun's disc a satellite can see: 1 in full sunlight, 0 in
 * umbra, in between in penumbra (which lasts ~8 s for a LEO satellite).
 */
export function sunlitFraction(sunAu: Vec3, satTemeKm: Vec3): number {
  return 1 - shadowFraction({ x: sunAu[0], y: sunAu[1], z: sunAu[2] }, { x: satTemeKm[0], y: satTemeKm[1], z: satTemeKm[2] })
}

/** Unit vector toward the Sun in the observer's ENU frame. The frame's GMST
 *  must already be set for the same instant. */
export function sunEnu(frame: TopocentricFrame, sunAu: Vec3): Vec3 {
  const ecf = frame.temeToEcf(sunAu)
  const v = mat3.mulVec(frame.enu, ecf)
  const n = Math.hypot(v[0], v[1], v[2])
  return [v[0] / n, v[1] / n, v[2] / n]
}

export function sunElevationDeg(sunEnuDir: Vec3): number {
  return Math.asin(Math.max(-1, Math.min(1, sunEnuDir[2]))) * RAD
}

export type Twilight = 'day' | 'civil' | 'nautical' | 'astronomical' | 'night'

/** Twilight band for a (geometric) solar elevation. */
export function twilight(sunElDeg: number): Twilight {
  if (sunElDeg > -0.833) return 'day'
  if (sunElDeg > -6) return 'civil'
  if (sunElDeg > -12) return 'nautical'
  if (sunElDeg > -18) return 'astronomical'
  return 'night'
}
