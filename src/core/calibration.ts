/**
 * Compass calibration: the user points the camera's crosshair at a real
 * object whose position we know, and the difference between where the
 * sensors say the camera points and where the object is becomes a heading
 * (and tilt) correction. Phone compasses are commonly 5–15° out, so this is
 * what makes AR labels land on the right dots.
 */
import { enuToHorizontal, refraction } from './frames.ts'
import type { BodyPosition, Star } from './sky.ts'
import { clamp, DEG, wrap180, type Mat3, type Vec3 } from './vec.ts'

export interface CalibrationTarget {
  name: string
  /** Apparent (refracted) azimuth and elevation now, degrees. */
  az: number
  el: number
  mag: number
}

const MIN_EL = 8

function apparentHorizontal(v: Vec3): { az: number; el: number } {
  const h = enuToHorizontal(v)
  return { az: h.az, el: h.el + refraction(h.el) }
}

/**
 * Objects good to calibrate on right now, best first: bright enough to find
 * on a phone camera, high enough to be clear of buildings and refraction
 * trouble. Never the Sun — nobody should aim a phone, or eyes, at it.
 */
export function calibrationTargets(eqjToEnu: Mat3, bodies: BodyPosition[], stars: Star[], sunEl: number): CalibrationTarget[] {
  const out: CalibrationTarget[] = []
  for (const b of bodies) {
    if (b.name === 'Sun') continue
    const h = apparentHorizontal(b.v)
    if (h.el < MIN_EL) continue
    // The Moon works in daylight; planets need at least twilight (Venus
    // excepted, which phone cameras catch in a blue sky only with luck).
    if (b.name !== 'Moon' && (sunEl > -3 || b.mag > 1.5)) continue
    out.push({ name: b.name, az: h.az, el: h.el, mag: b.mag })
  }
  if (sunEl < -6) {
    for (const s of stars) {
      if (s.mag > 1.6) break // sorted brightest first
      if (!s.name) continue
      const v: Vec3 = [
        eqjToEnu[0] * s.v[0] + eqjToEnu[1] * s.v[1] + eqjToEnu[2] * s.v[2],
        eqjToEnu[3] * s.v[0] + eqjToEnu[4] * s.v[1] + eqjToEnu[5] * s.v[2],
        eqjToEnu[6] * s.v[0] + eqjToEnu[7] * s.v[1] + eqjToEnu[8] * s.v[2],
      ]
      const h = apparentHorizontal(v)
      if (h.el < MIN_EL) continue
      out.push({ name: s.name, az: h.az, el: h.el, mag: s.mag })
    }
  }
  return out.sort((a, b) => a.mag - b.mag)
}

export interface Correction {
  yawDeg: number
  pitchDeg: number
}

/**
 * The corrected correction. `aim` is where the camera centre points with
 * the current correction applied; `target` is where the object really is.
 * Yaw turns the view about the vertical, so it shifts azimuth one-for-one;
 * pitch tilts the camera about its own horizontal axis, which with the
 * phone held level shifts elevation one-for-one. Calibrating twice
 * converges if the phone was tilted the first time.
 */
export function solveCorrection(current: Correction, aim: { az: number; el: number }, target: { az: number; el: number }): Correction {
  // Near the zenith azimuth is meaningless and the yaw estimate explodes.
  const yawWeight = Math.cos(Math.max(Math.abs(aim.el), Math.abs(target.el)) * DEG) > 0.25 ? 1 : 0
  return {
    yawDeg: wrap180(current.yawDeg + yawWeight * wrap180(target.az - aim.az)),
    pitchDeg: clamp(current.pitchDeg + (target.el - aim.el), -30, 30),
  }
}
