/**
 * The satellites visible right now, brightest first: the sky map as a
 * list, for screen readers and for "what should I look for?".
 */
import { enuToHorizontal } from '../core/frames.ts'
import type { SatelliteInfo } from '../core/satellite.ts'
import { Slot, STRIDE } from '../worker/layout.ts'
import type { TickData } from '../worker/protocol.ts'
import { apparent, satellitePosition } from './renderer.ts'
import { appearance } from './visibility.ts'

export interface UpNow {
  sat: SatelliteInfo
  /** Apparent direction, degrees. */
  az: number
  el: number
  mag: number
}

export function visibleNow(tick: TickData, sats: SatelliteInfo[], ms: number, sunEl: number, limitingMag: number, limit = 20): UpNow[] {
  const out: UpNow[] = []
  const n = Math.min(sats.length, tick.buffer.length / STRIDE)
  for (let i = 0; i < n; i++) {
    const v = satellitePosition(tick, i, ms)
    if (!v || v[2] <= 0) continue
    const sunlit = tick.buffer[i * STRIDE + Slot.SUNLIT]!
    const mag = tick.buffer[i * STRIDE + Slot.MAG]!
    if (!appearance('naked-eye', sunlit, mag, sunEl, limitingMag).visible) continue
    const { az, el } = enuToHorizontal(apparent(v))
    out.push({ sat: sats[i]!, az, el, mag })
  }
  return out.sort((a, b) => a.mag - b.mag).slice(0, limit)
}
