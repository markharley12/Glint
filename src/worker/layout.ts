/**
 * Layout of the tick buffer the propagation worker sends: STRIDE floats
 * per satellite, in catalogue order. Its own module so the UI thread can
 * read buffers without importing the engine (and SGP4 with it).
 */

/** Floats per satellite in a tick buffer. */
export const STRIDE = 8

/** Offsets within a satellite's slot. Position is ENU km relative to the
 *  observer, velocity ENU km/s; position x is NaN when the satellite is
 *  below the horizon (skipped) or the model failed. SUNLIT is the fraction
 *  of the Sun's disc in view (0–1); MAG the apparent magnitude, NaN if
 *  unknown or in shadow. */
export const Slot = { E: 0, N: 1, U: 2, VE: 3, VN: 4, VU: 5, SUNLIT: 6, MAG: 7 } as const
