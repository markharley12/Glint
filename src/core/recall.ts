/**
 * "What was that?" after the fact: someone saw a light cross the sky a
 * few minutes ago and remembers roughly when, which way it went and how
 * bright it was. Rank the visible passes around that time by how well
 * they fit.
 */
import type { Pass } from './passes.ts'
import { wrap180 } from './vec.ts'

export interface RecallQuery {
  /** When it was seen, roughly. */
  ms: number
  /** How far off that time may be, ms. */
  slackMs: number
  /** Compass direction it came from and went towards, degrees, if
   *  remembered. */
  fromAz: number | null
  toAz: number | null
  /** Roughly how bright, if remembered: 'bright' (like the brightest
   *  stars or brighter) or 'faint' (only just visible). */
  brightness: 'bright' | 'faint' | null
}

export interface RecallMatch {
  pass: Pass
  /** Lower is better. */
  score: number
}

/** Directions are remembered to an eighth of the compass at best. */
const DIRECTION_SIGMA = 45

export function scoreRecall(p: Pass, q: RecallQuery): number | null {
  const v = p.visible
  if (!v) return null
  // Time: free within the slack, then a minute counts like a direction
  // off by an eighth.
  const gapMs = q.ms < v.start.ms ? v.start.ms - q.ms : q.ms > v.end.ms ? q.ms - v.end.ms : 0
  if (gapMs > q.slackMs) return null
  let score = (gapMs / q.slackMs) ** 2
  if (q.fromAz !== null) score += (wrap180(v.start.az - q.fromAz) / DIRECTION_SIGMA) ** 2
  if (q.toAz !== null) score += (wrap180(v.end.az - q.toAz) / DIRECTION_SIGMA) ** 2
  const mag = v.brightest?.mag ?? null
  if (q.brightness === 'bright') score += mag === null ? 2 : Math.max(0, mag - 1.5) ** 2 / 2
  else if (q.brightness === 'faint') score += mag === null ? 0.5 : Math.max(0, 3 - mag) ** 2
  // Not remembered: brighter things are more likely to have been noticed.
  else score += mag === null ? 1 : Math.max(0, mag - 3) / 2
  return score
}

export function rankRecall(passes: Pass[], q: RecallQuery, limit = 6): RecallMatch[] {
  const out: RecallMatch[] = []
  for (const pass of passes) {
    const score = scoreRecall(pass, q)
    if (score !== null) out.push({ pass, score })
  }
  return out.sort((a, b) => a.score - b.score).slice(0, limit)
}
