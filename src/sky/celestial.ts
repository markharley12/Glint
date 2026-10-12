/**
 * The natural sky for the renderer, recomputed at most once per simulated
 * second: in one second the stars turn 15″ and the Moon moves less, far
 * below a pixel, while astronomy-engine's rotation and planet positions
 * cost real time on a phone.
 */
import type { Observer } from '../core/frames.ts'
import { bodyPositions, eqjToEnu, type BodyPosition } from '../core/sky.ts'
import { RAD, type Mat3 } from '../core/vec.ts'

export interface Celestial {
  eqjToEnu: Mat3
  bodies: BodyPosition[]
  /** Geometric solar elevation, degrees. */
  sunEl: number
}

export class CelestialCache {
  private ms = Number.NaN
  private key = ''
  private value: Celestial | null = null

  get(ms: number, o: Observer): Celestial {
    const key = `${o.latitude},${o.longitude},${o.height}`
    if (this.value && key === this.key && Math.abs(ms - this.ms) < 1000) return this.value
    const m = eqjToEnu(ms, o)
    const bodies = bodyPositions(ms, o, m)
    const sun = bodies.find((b) => b.name === 'Sun')!
    this.value = { eqjToEnu: m, bodies, sunEl: Math.asin(sun.v[2]) * RAD }
    this.ms = ms
    this.key = key
    return this.value
  }
}
