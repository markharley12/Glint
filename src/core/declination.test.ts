import { describe, expect, it } from 'vitest'
import { declination } from './declination.ts'

describe('declination', () => {
  const when = new Date(Date.UTC(2026, 9, 12))
  // Reference values from an independent WMM implementation, pygeomag
  // 1.1.0 with NOAA's WMM_2025.COF, at decimal year 2026.78.
  it.each([
    ['Sydney', -33.87, 151.21, 12.828],
    ['New York', 40.71, -74.01, -12.461],
    ['London', 51.51, -0.13, 1.209],
    ['Fairbanks', 64.84, -147.72, 14.776],
  ])('%s', (_name, lat, lon, expected) => {
    expect(Math.abs(declination(lat, lon, 0, when) - expected)).toBeLessThan(0.01)
  })

  it('works outside the model years instead of throwing', () => {
    expect(Number.isFinite(declination(0, 0, 0, new Date(Date.UTC(2035, 0, 1))))).toBe(true)
  })
})
