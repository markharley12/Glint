import { describe, expect, it } from 'vitest'
import { enuToHorizontal, horizontalToEnu } from './frames.ts'
import { angleDeg, confidence, matchPath, pathSpanDeg } from './identify.ts'
import type { Vec3 } from './vec.ts'

/** A path moving steadily from (az0, el0) by (dAz, dEl) per step. */
function path(az0: number, el0: number, dAz: number, dEl: number, n = 9): Vec3[] {
  return Array.from({ length: n }, (_, k) => horizontalToEnu(az0 + dAz * k, el0 + dEl * k))
}

function shift(dirs: Vec3[], dAz: number, dEl: number): Vec3[] {
  return dirs.map((d) => {
    const h = enuToHorizontal(d)
    return horizontalToEnu(h.az + dAz, h.el + dEl)
  })
}

describe('matchPath', () => {
  const truth = path(120, 40, 0.6, 0.4)

  it('scores an exact match zero', () => {
    const m = matchPath(truth, truth)
    expect(m.residualDeg).toBeCloseTo(0, 6)
    expect(m.score).toBeCloseTo(0, 6)
  })

  it('removes a constant compass and pitch error', () => {
    const m = matchPath(shift(truth, 10, -2), truth)
    expect(m.azOffsetDeg).toBeCloseTo(10, 1)
    expect(m.elOffsetDeg).toBeCloseTo(-2, 1)
    expect(m.residualDeg).toBeLessThan(0.05)
    // The offset still costs something, but less than a wrong path.
    expect(m.score).toBeGreaterThan(0.5)
    expect(m.score).toBeLessThan(matchPath(truth, path(120, 40, -0.6, 0.4)).score)
  })

  it('prefers the right motion over the right place', () => {
    const observed = shift(truth, 8, 1)
    const samePlaceWrongWay = path(128, 41, 0, -0.7)
    const samePlaceTooSlow = path(128, 41, 0.15, 0.1)
    const right = matchPath(observed, truth)
    expect(right.score).toBeLessThan(matchPath(observed, samePlaceWrongWay).score)
    expect(right.score).toBeLessThan(matchPath(observed, samePlaceTooSlow).score)
  })

  it('copes with paths through the zenith', () => {
    const overhead = path(90, 85, 0, 1) // up and over to az 270
    const m = matchPath(shift(overhead, 0, 0.3), overhead)
    expect(m.residualDeg).toBeLessThan(0.5)
  })
})

describe('helpers', () => {
  it('measures angles and spans', () => {
    expect(angleDeg([1, 0, 0], [0, 1, 0])).toBeCloseTo(90, 9)
    expect(angleDeg([1, 0, 0], [1, 1e-9, 0])).toBeGreaterThan(0)
    const p = path(0, 30, 1, 0, 5).map((dir, k) => ({ ms: k * 1000, dir }))
    expect(pathSpanDeg(p)).toBeCloseTo(4 * Math.cos(30 * (Math.PI / 180)), 1)
  })

  it('grades confidence', () => {
    expect(confidence(1.2, 9)).toBe('good')
    expect(confidence(1.2, 2)).toBe('fair')
    expect(confidence(12, null)).toBe('poor')
  })
})
