/**
 * Apparent visual magnitude of a sunlit satellite.
 *
 * The model is the one behind Mike McCants' magnitude list (and most pass
 * predictors that use it): a satellite's *standard magnitude* is its
 * brightness at 1000 km range when half illuminated (phase angle 90°), and it
 * dims with the square of range and with the illuminated fraction of a
 * sphere, (1 + cos φ) / 2. At 1000 km and φ = 90° the formula returns the
 * standard magnitude itself; the 15.75 is 2.5·log10(1000² / 0.5).
 *
 * Real satellites are flat panels and cylinders, not spheres, so this is good
 * to a magnitude or so, and Starlinks in particular vary far more with
 * attitude. It is meant for "will I see it?", not photometry.
 */

/** Illuminated fraction of a diffuse sphere at phase angle φ (radians). */
export function illuminatedFraction(phaseAngle: number): number {
  return (1 + Math.cos(phaseAngle)) / 2
}

export function apparentMagnitude(stdMag: number, rangeKm: number, phaseAngle: number): number {
  // A satellite exactly between the observer and the Sun shows no lit face;
  // clamp so the magnitude stays finite (just very faint).
  const frac = Math.max(illuminatedFraction(phaseAngle), 1e-4)
  return stdMag - 15.75 + 2.5 * Math.log10((rangeKm * rangeKm) / frac)
}

/**
 * Phase angle at the satellite between the Sun and the observer, radians.
 * `satEnu` is the satellite's position relative to the observer (any unit);
 * `sunEnuDir` is the unit vector to the Sun, which at 1 AU is the same from
 * the satellite as from the observer to within 0.02°.
 */
export function phaseAngle(satEnu: readonly [number, number, number], sunEnuDir: readonly [number, number, number]): number {
  const [x, y, z] = satEnu
  const r = Math.hypot(x, y, z)
  // Satellite → observer is −satEnu.
  const c = -(x * sunEnuDir[0] + y * sunEnuDir[1] + z * sunEnuDir[2]) / r
  return Math.acos(Math.max(-1, Math.min(1, c)))
}

/** Faintest magnitude worth calling "naked-eye visible" by sky darkness.
 *  Rough figures for a suburban sky; the UI lets people raise them. */
export function limitingMagnitude(sunElDeg: number): number {
  if (sunElDeg > -0.833) return -2 // daytime: only the ISS-class and flares
  if (sunElDeg > -6) return 1.5 + (-sunElDeg / 6) * 1.5 // civil twilight: 1.5 → 3
  if (sunElDeg > -12) return 3 + ((-sunElDeg - 6) / 6) * 1.5 // nautical: 3 → 4.5
  return 4.5
}
