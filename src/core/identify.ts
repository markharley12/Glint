/**
 * "What's that?": identify a moving light from how the user followed it.
 *
 * The user keeps the light in a circle at the centre of the screen for a
 * few seconds; where the camera pointed over that time is a sampled path
 * across the sky, which we compare with each candidate satellite's
 * predicted path at the same instants.
 *
 * Phone compasses are often 5–15° out and people trail behind what they
 * follow, so absolute position is weak evidence. We first remove the
 * constant offset that best lines the two paths up — a turn about the
 * vertical (compass error) plus an elevation shift — and score what is
 * left, the shape and speed of the motion, with a mild penalty on the size
 * of the offset.
 */
import { enuToHorizontal, horizontalToEnu } from './frames.ts'
import { DEG, wrap180, type Vec3 } from './vec.ts'

export interface PathSample {
  ms: number
  /** Unit ENU direction. */
  dir: Vec3
}

export interface PathMatch {
  /** RMS angle between the paths once the offset is removed, degrees. */
  residualDeg: number
  /** The offset removed, degrees: observed minus predicted. */
  azOffsetDeg: number
  elOffsetDeg: number
  /** Lower is better: a chi-square of the residual and the offsets
   *  against their typical sizes. */
  score: number
}

/** Typical errors, degrees (one sigma): how far a hand-held phone wobbles
 *  about what it follows, and how far out the sensors' heading and pitch
 *  are. Heading depends on whether the user has calibrated. */
export interface MatchSigmas {
  residual: number
  az: number
  el: number
}

export const DEFAULT_SIGMAS: MatchSigmas = { residual: 0.5, az: 10, el: 3 }

/** Angle between unit vectors, degrees (stable for small angles). */
export function angleDeg(a: Vec3, b: Vec3): number {
  const c: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  return Math.atan2(Math.hypot(c[0], c[1], c[2]), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / DEG
}

/** How far the path moved from first sample to last, degrees. */
export function pathSpanDeg(samples: PathSample[]): number {
  if (samples.length < 2) return 0
  return angleDeg(samples[0]!.dir, samples[samples.length - 1]!.dir)
}

/** Compare an observed path with a predicted one sampled at the same times. */
export function matchPath(observed: Vec3[], predicted: Vec3[], sigmas: MatchSigmas = DEFAULT_SIGMAS): PathMatch {
  const n = Math.min(observed.length, predicted.length)
  const o = observed.slice(0, n).map(enuToHorizontal)
  const p = predicted.slice(0, n).map(enuToHorizontal)
  // Azimuth differences are noisy near the zenith, where a small pointing
  // error swings the azimuth wildly: weight them by cos² elevation.
  let azSum = 0
  let azWeight = 0
  let elSum = 0
  let cosSum = 0
  for (let k = 0; k < n; k++) {
    const c = Math.cos(p[k]!.el * DEG)
    azSum += wrap180(o[k]!.az - p[k]!.az) * c * c
    azWeight += c * c
    elSum += o[k]!.el - p[k]!.el
    cosSum += c
  }
  const azOffsetDeg = azWeight > 1e-9 ? azSum / azWeight : 0
  const elOffsetDeg = n ? elSum / n : 0
  let sq = 0
  for (let k = 0; k < n; k++) {
    const shifted = horizontalToEnu(p[k]!.az + azOffsetDeg, p[k]!.el + elOffsetDeg)
    sq += angleDeg(observed[k]!, shifted) ** 2
  }
  const residualDeg = n ? Math.sqrt(sq / n) : Infinity
  // An azimuth offset moves things by az × cos(el) across the sky.
  const azAcross = Math.abs(azOffsetDeg) * (n ? cosSum / n : 1)
  const score = (residualDeg / sigmas.residual) ** 2 + (azAcross / sigmas.az) ** 2 + (elOffsetDeg / sigmas.el) ** 2
  return { residualDeg, azOffsetDeg, elOffsetDeg, score }
}

/** Extra score for a candidate the user is unlikely to have noticed: the
 *  fainter, the less likely; unknown brightness counts as middling. */
export function faintnessPenalty(mag: number | null): number {
  if (mag === null) return 1.5
  return Math.max(0, mag - 4)
}

/** Words for how good a match is. */
export type Confidence = 'good' | 'fair' | 'poor'

/**
 * @param score the best candidate's score
 * @param runnerUp the next best's, if any
 */
export function confidence(score: number, runnerUp: number | null): Confidence {
  // Scores are like chi-squares: a lead of 3 is a likelihood ratio of ~4.5.
  const clear = runnerUp === null || runnerUp - score > 3
  if (score < 4 && clear) return 'good'
  if (score < 10) return 'fair'
  return 'poor'
}
