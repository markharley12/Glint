import { describe, expect, it } from 'vitest'
import { calibrationTargets, solveCorrection } from './calibration.ts'
import { eqjToEnu, bodyPositions, getStars } from './sky.ts'

describe('solveCorrection', () => {
  it('moves heading and tilt by the miss', () => {
    const c = solveCorrection({ yawDeg: 2, pitchDeg: 0 }, { az: 100, el: 30 }, { az: 108, el: 31.5 })
    expect(c.yawDeg).toBeCloseTo(10, 9)
    expect(c.pitchDeg).toBeCloseTo(1.5, 9)
  })

  it('takes the short way round north', () => {
    expect(solveCorrection({ yawDeg: 0, pitchDeg: 0 }, { az: 355, el: 20 }, { az: 5, el: 20 }).yawDeg).toBeCloseTo(10, 9)
  })

  it('ignores azimuth near the zenith, where it means nothing', () => {
    expect(solveCorrection({ yawDeg: 3, pitchDeg: 0 }, { az: 10, el: 85 }, { az: 190, el: 86 }).yawDeg).toBe(3)
  })

  it('keeps tilt within reason', () => {
    expect(solveCorrection({ yawDeg: 0, pitchDeg: 25 }, { az: 0, el: 10 }, { az: 0, el: 30 }).pitchDeg).toBe(30)
  })
})

describe('calibrationTargets', () => {
  const observer = { latitude: 51.48, longitude: 0, height: 0 }

  it('offers bright stars at night, brightest first, all well above the horizon', () => {
    // 2026-10-12 22:00 UTC: dark in London.
    const ms = Date.UTC(2026, 9, 12, 22)
    const m = eqjToEnu(ms, observer)
    const bodies = bodyPositions(ms, observer, m)
    const sunEl = (Math.asin(bodies.find((b) => b.name === 'Sun')!.v[2]) * 180) / Math.PI
    const t = calibrationTargets(m, bodies, getStars(), sunEl)
    expect(t.length).toBeGreaterThan(3)
    expect(t.map((x) => x.name)).toContain('Vega')
    for (const x of t) expect(x.el).toBeGreaterThanOrEqual(8)
    for (let i = 1; i < t.length; i++) expect(t[i]!.mag).toBeGreaterThanOrEqual(t[i - 1]!.mag)
    expect(t.map((x) => x.name)).not.toContain('Sun')
  })

  it('offers no stars in daylight', () => {
    const ms = Date.UTC(2026, 9, 12, 12)
    const m = eqjToEnu(ms, observer)
    const bodies = bodyPositions(ms, observer, m)
    const t = calibrationTargets(m, bodies, getStars(), 25)
    for (const x of t) expect(x.name).toBe('Moon')
  })
})
