import { describe, expect, it } from 'vitest'
import { brightnessWords, compass, duration, magnitude, relative } from './format.ts'

describe('format', () => {
  it.each([
    [0, 'N'],
    [11, 'N'],
    [12, 'NNE'],
    [90, 'E'],
    [225, 'SW'],
    [359, 'N'],
    [-45, 'NW'],
  ])('compass(%d) = %s', (az, want) => expect(compass(az)).toBe(want))

  it('formats relative times both ways', () => {
    expect(relative(65_000, 0)).toBe('in 1 min')
    expect(relative(0, 30_000)).toBe('30 s ago')
    expect(relative(2 * 3_600_000 + 10 * 60_000, 0)).toBe('in 2 h 10 min')
    expect(relative(400, 0)).toBe('now')
    expect(relative(3_590_000, 0)).toBe('in 1 h')
    expect(relative(2 * 3_600_000 - 20_000, 0)).toBe('in 2 h')
    expect(relative(3 * 3_600_000, 0)).toBe('in 3 h')
  })

  it('formats durations and magnitudes', () => {
    expect(duration(260_000)).toBe('4 min 20 s')
    expect(duration(9_000)).toBe('9 s')
    expect(magnitude(-3.24)).toBe('−3.2')
    expect(magnitude(null)).toBe('—')
    expect(brightnessWords(-3)).toBe('brilliant')
    expect(brightnessWords(4)).toBe('faint')
  })
})
