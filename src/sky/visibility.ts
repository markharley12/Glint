/**
 * Which satellites the views draw, and how prominently.
 */
import { limitingMagnitude } from '../core/magnitude.ts'
import { clamp } from '../core/vec.ts'
import type { ShowFilter } from '../state/settings.ts'

/** The Sun must be at least this far down for the sky to be dark enough
 *  to see satellites: bright ones (the ISS) show from about here. */
export const DARK_ENOUGH_SUN_EL = -4

export interface SatAppearance {
  /** Drawn at all. */
  shown: boolean
  /** Naked-eye visible right now (lit, dark sky, bright enough). */
  visible: boolean
}

/**
 * @param sunlit fraction of the Sun's disc the satellite sees
 * @param mag apparent magnitude, NaN if unknown or eclipsed
 * @param sunEl the Sun's elevation for the observer, degrees
 * @param limitingMag the user's faintest-magnitude setting
 */
export function appearance(show: ShowFilter, sunlit: number, mag: number, sunEl: number, limitingMag: number): SatAppearance {
  const lit = sunlit >= 0.5
  const dark = sunEl <= DARK_ENOUGH_SUN_EL
  const limit = Math.min(limitingMag, limitingMagnitude(sunEl))
  const visible = lit && dark && !Number.isNaN(mag) && mag <= limit
  switch (show) {
    case 'all':
      return { shown: true, visible }
    case 'sunlit':
      return { shown: lit, visible }
    case 'naked-eye':
      return { shown: visible, visible }
  }
}

/** Dot radius in px for a satellite of apparent magnitude `mag`. */
export function satRadius(mag: number): number {
  if (Number.isNaN(mag)) return 1.6
  return clamp(3.3 - 0.42 * mag, 1.3, 5)
}

/** Dot radius in px for a star of magnitude `mag`. */
export function starRadius(mag: number, scale = 1): number {
  return Math.max(0.55, (2.7 - 0.4 * mag) * scale)
}
