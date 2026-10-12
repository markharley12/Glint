/** Twilight bands by solar elevation. Kept apart from sun.ts, which pulls
 *  in satellite.js, so the UI can use it cheaply. */

export type Twilight = 'day' | 'civil' | 'nautical' | 'astronomical' | 'night'

/** Twilight band for a (geometric) solar elevation, degrees. */
export function twilight(sunElDeg: number): Twilight {
  if (sunElDeg > -0.833) return 'day'
  if (sunElDeg > -6) return 'civil'
  if (sunElDeg > -12) return 'nautical'
  if (sunElDeg > -18) return 'astronomical'
  return 'night'
}
