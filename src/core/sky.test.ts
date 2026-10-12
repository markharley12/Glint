import { describe, expect, it } from 'vitest'
import { reference } from './fixtures/index.ts'
import { enuToHorizontal, separation } from './frames.ts'
import { bodyPositions, eqjToEnu, getConstellations, getStars } from './sky.ts'
import { mat3 } from './vec.ts'

describe('sky catalogue', () => {
  it('has the brightest star first and names it', () => {
    const stars = getStars()
    expect(stars.length).toBeGreaterThan(2500)
    expect(stars[0]!.name).toBe('Sirius')
    for (let i = 1; i < stars.length; i++) expect(stars[i]!.mag).toBeGreaterThanOrEqual(stars[i - 1]!.mag)
  })

  it('has all 88 constellations (Serpens in two parts)', () => {
    const ids = new Set(getConstellations().map((c) => c.id))
    expect(ids.size).toBeGreaterThanOrEqual(88)
    expect(ids.has('Ori')).toBe(true)
    expect(ids.has('UMa')).toBe(true)
  })
})

describe('eqjToEnu', () => {
  it('is a rotation', () => {
    const m = eqjToEnu(Date.UTC(2026, 9, 12, 21), { latitude: 51.5, longitude: -0.1, height: 0 })
    const i = mat3.mul(m, mat3.transpose(m))
    const id = mat3.identity()
    for (let k = 0; k < 9; k++) expect(i[k]).toBeCloseTo(id[k]!, 12)
  })
})

describe('sky against Skyfield', () => {
  const stars = getStars()
  const starByName = new Map(stars.filter((s) => s.name).map((s) => [s.name!, s]))

  // Measured Oct 2026: stars ≤ 21″, bodies ≤ 20″.
  const TOLERANCE_DEG = 30 / 3600

  it('places stars within half an arcminute', () => {
    // We skip annual aberration (≤ 20.5″) and proper motion; Skyfield
    // applies both.
    for (const ref of reference.sky) {
      const star = starByName.get(ref.target)
      if (!star) continue
      const m = eqjToEnu(ref.ms, reference.observers[ref.observer]!)
      const h = enuToHorizontal(mat3.mulVec(m, star.v))
      expect(separation(h, ref), `${ref.target} ${ref.observer} ${new Date(ref.ms).toISOString()}`).toBeLessThan(TOLERANCE_DEG)
    }
  })

  it('places the Sun, Moon and planets within half an arcminute', () => {
    for (const ref of reference.sky) {
      if (starByName.has(ref.target)) continue
      const bodies = bodyPositions(ref.ms, reference.observers[ref.observer]!)
      const body = bodies.find((b) => b.name === ref.target)!
      const h = enuToHorizontal(body.v)
      expect(separation(h, ref), `${ref.target} ${ref.observer} ${new Date(ref.ms).toISOString()}`).toBeLessThan(TOLERANCE_DEG)
    }
  })
})

describe('bodyPositions', () => {
  it('gives sensible magnitudes and sizes', () => {
    const b = Object.fromEntries(bodyPositions(Date.UTC(2026, 9, 12), { latitude: 0, longitude: 0, height: 0 }).map((x) => [x.name, x]))
    expect(b.Sun!.radius).toBeGreaterThan(0.25)
    expect(b.Sun!.radius).toBeLessThan(0.28)
    expect(b.Moon!.radius).toBeGreaterThan(0.24)
    expect(b.Moon!.radius).toBeLessThan(0.29)
    expect(b.Venus!.mag).toBeLessThan(-3)
    expect(b.Moon!.phase).toBeGreaterThanOrEqual(0)
    expect(b.Moon!.phase).toBeLessThanOrEqual(1)
  })
})
