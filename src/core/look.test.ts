import { describe, expect, it } from 'vitest'
import { fixtureSatellites, reference } from './fixtures/index.ts'
import { separation, TopocentricFrame } from './frames.ts'
import { look } from './look.ts'

const sats = fixtureSatellites()
const frames = new Map(Object.entries(reference.observers).map(([k, o]) => [k, new TopocentricFrame(o)]))

describe('look against Skyfield', () => {
  // Skyfield goes TEME → ITRS with UT1 and the IAU precession-nutation;
  // we rotate by GMST(UTC). The residual is UT1−UTC (~0.1 s of Earth
  // rotation, tens of metres at the observer), which shows up as a few
  // arcseconds for a close LEO pass and less for anything further away.
  // Measured Oct 2026: worst 8.6″ (a Starlink) and 40 m; a phone compass
  // is good to a few degrees at best.
  const MAX_SEPARATION_DEG = 0.005
  const MAX_RANGE_ERROR_KM = 0.06

  it('matches position in the sky and range for every sample', () => {
    let worstSep = 0
    let worstRange = 0
    for (const ref of reference.looks) {
      const l = look(sats.get(ref.norad)!, frames.get(ref.observer)!, ref.ms)
      expect(l, `${ref.norad} @ ${ref.iso}`).not.toBeNull()
      const sep = separation(l!, ref)
      worstSep = Math.max(worstSep, sep)
      worstRange = Math.max(worstRange, Math.abs(l!.range - ref.range))
      expect(sep, `${ref.norad} ${ref.observer} @ ${ref.iso}`).toBeLessThan(MAX_SEPARATION_DEG)
      expect(Math.abs(l!.range - ref.range), `${ref.norad} @ ${ref.iso}`).toBeLessThan(MAX_RANGE_ERROR_KM)
    }
    // Keep the tolerances honest: if the real error is far below them,
    // tighten them rather than let a regression hide under the slack.
    expect(worstSep).toBeGreaterThan(MAX_SEPARATION_DEG / 100)
  })

  it('agrees on the Sun’s elevation to within the low-precision model’s error', () => {
    // Vallado's series is quoted at 0.01°; measured worst 26″.
    for (const ref of reference.looks) {
      const l = look(sats.get(ref.norad)!, frames.get(ref.observer)!, ref.ms)!
      expect(Math.abs(l.sunEl - ref.sunEl)).toBeLessThan(0.01)
    }
  })

  it('agrees on sunlit vs eclipsed, except within seconds of a shadow edge', () => {
    let disagreements = 0
    for (const ref of reference.looks) {
      const sat = sats.get(ref.norad)!
      const frame = frames.get(ref.observer)!
      const l = look(sat, frame, ref.ms)!
      if (l.sunlit >= 0.5 === ref.sunlit) continue
      disagreements++
      // Skyfield's test is a sharp-edged cylinder-ish cut; ours a penumbra
      // fraction. They may only disagree while the satellite is crossing the
      // edge, so a few seconds either way must straddle it.
      const before = look(sat, frame, ref.ms - 15_000)!.sunlit >= 0.5
      const after = look(sat, frame, ref.ms + 15_000)!.sunlit >= 0.5
      expect(before !== after, `${ref.norad} @ ${ref.iso} not near a shadow edge`).toBe(true)
    }
    expect(disagreements).toBeLessThan(5)
  })
})
