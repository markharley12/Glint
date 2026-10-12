import { describe, expect, it } from 'vitest'
import { fixtureSatellites, reference } from './fixtures/index.ts'
import { gstime } from 'satellite.js'
import { TopocentricFrame } from './frames.ts'
import { darkIntervals, findPasses, findVisiblePasses, type Pass } from './passes.ts'
import { jdFromMs } from './satellite.ts'
import { sunElevationDeg, sunEnu, sunTemeAu } from './sun.ts'

const sats = fixtureSatellites()
const START = Date.UTC(2026, 9, 11, 12, 0, 0)
const END = START + 3 * 86_400_000

describe('findPasses against Skyfield', () => {
  // Our pass list for every (observer, satellite) pair Skyfield covered.
  const ours = new Map<string, Pass[]>()
  for (const ref of reference.passes) {
    const key = `${ref.observer}/${ref.norad}`
    if (!ours.has(key)) {
      const passes = findPasses(sats.get(ref.norad)!, reference.observers[ref.observer]!, START, END, { minPeak: 0 })
      ours.set(key, passes)
    }
  }

  it('finds every pass Skyfield finds, with matching rise, peak and set', () => {
    for (const ref of reference.passes) {
      const label = `${ref.observer}/${ref.norad} rising ${new Date(ref.rise).toISOString()}`
      const match = ours.get(`${ref.observer}/${ref.norad}`)!.find((p) => Math.abs(p.rise.ms - ref.rise) < 10_000)
      expect(match, label).toBeDefined()
      const p = match!
      // Horizon crossings are steep, so their times are sharp: both sides
      // bisect to well under a second, and UT1−UTC accounts for the rest.
      expect(Math.abs(p.rise.ms - ref.rise), label).toBeLessThan(1_000)
      expect(Math.abs(p.set.ms - ref.set), label).toBeLessThan(1_000)
      // The peak is flat-topped, so its *time* is soft but its height sharp.
      expect(Math.abs(p.max.el - ref.maxEl), label).toBeLessThan(0.01)
      expect(Math.abs(p.max.ms - ref.max), label).toBeLessThan(3_000)
    }
  })

  it('finds no passes Skyfield does not', () => {
    for (const [key, passes] of ours) {
      const [observer, norad] = key.split('/')
      const refs = reference.passes.filter((r) => r.observer === observer && r.norad === Number(norad))
      const complete = passes.filter((p) => !p.startsUp && !p.endsUp)
      for (const p of complete) {
        expect(
          refs.some((r) => Math.abs(r.rise - p.rise.ms) < 10_000),
          `${key} extra pass rising ${new Date(p.rise.ms).toISOString()}`,
        ).toBe(true)
      }
    }
  })
})

describe('findPasses', () => {
  const iss = sats.get(25544)!
  const greenwich = reference.observers.greenwich!

  it('drops passes that peak below minPeak', () => {
    const all = findPasses(iss, greenwich, START, END, { minPeak: 0 })
    const high = findPasses(iss, greenwich, START, END, { minPeak: 30 })
    expect(high.length).toBeGreaterThan(0)
    expect(high.length).toBeLessThan(all.length)
    for (const p of high) expect(p.max.el).toBeGreaterThanOrEqual(30)
  })

  it('keeps each visible window inside its pass and within the rules', () => {
    for (const p of findPasses(iss, greenwich, START, END)) {
      if (!p.visible) continue
      const v = p.visible
      expect(v.start.ms).toBeGreaterThanOrEqual(p.rise.ms)
      expect(v.end.ms).toBeLessThanOrEqual(p.set.ms)
      expect(v.start.ms).toBeLessThan(v.end.ms)
      expect(v.start.el).toBeGreaterThanOrEqual(10 - 0.05)
      expect(v.end.el).toBeGreaterThanOrEqual(10 - 0.05)
      expect(v.max.el).toBeLessThanOrEqual(p.max.el + 1e-6)
      // The ISS has a standard magnitude, so a visible pass has a brightest point.
      expect(v.brightest?.mag).toBeTypeOf('number')
    }
  })

  it('reports a satellite already up at the window start', () => {
    // Find a moment mid-pass, then search from there.
    const first = findPasses(iss, greenwich, START, END, { minPeak: 0 })[0]!
    const passes = findPasses(iss, greenwich, first.max.ms, first.max.ms + 3_600_000, { minPeak: 0 })
    expect(passes[0]!.startsUp).toBe(true)
    expect(passes[0]!.rise.ms).toBe(first.max.ms)
    expect(Math.abs(passes[0]!.set.ms - first.set.ms)).toBeLessThan(500)
  })

  it('returns nothing for a geostationary satellite below the horizon', () => {
    // GOES 16 sits over 75° W: never above Sydney's horizon.
    expect(findPasses(sats.get(41866)!, reference.observers.sydney!, START, END, { minPeak: 0 })).toEqual([])
  })

  it('is quick for a LEO satellite (skip-ahead bounds the work)', () => {
    const t0 = performance.now()
    for (let i = 0; i < 5; i++) findPasses(sats.get(44714)!, greenwich, START, END)
    // Generous for slow CI machines; a fixed 10 s step takes ~10× longer.
    expect((performance.now() - t0) / 5).toBeLessThan(200)
  })
})

describe('darkIntervals and findVisiblePasses', () => {
  const greenwich = reference.observers.greenwich!
  const frame = new TopocentricFrame(greenwich)
  const sunEl = (ms: number) => {
    const jd = jdFromMs(ms)
    frame.setGmst(gstime(jd))
    return sunElevationDeg(sunEnu(frame, sunTemeAu(jd)))
  }

  it('brackets each night at the given solar elevation', () => {
    const nights = darkIntervals(greenwich, START, END, -6)
    // Three October nights in London, about 11 h each.
    expect(nights).toHaveLength(3)
    for (const [a, b] of nights) {
      expect(sunEl(a)).toBeCloseTo(-6, 1)
      expect(sunEl(b)).toBeCloseTo(-6, 1)
      expect(sunEl((a + b) / 2)).toBeLessThan(-6)
      expect((b - a) / 3_600_000).toBeGreaterThan(10)
      expect((b - a) / 3_600_000).toBeLessThan(13)
    }
  })

  it('finds the same visible passes as a full search', () => {
    for (const norad of [25544, 20580, 44714]) {
      const all = findPasses(sats.get(norad)!, greenwich, START, END).filter((p) => p.visible)
      const dark = findVisiblePasses(sats.get(norad)!, greenwich, START, END)
      expect(dark).toHaveLength(all.length)
      // Different sample grids, so the bisected edges differ by up to its tolerance.
      dark.forEach((p, k) => expect(Math.abs(p.visible!.start.ms - all[k]!.visible!.start.ms)).toBeLessThan(250))
    }
  })
})
