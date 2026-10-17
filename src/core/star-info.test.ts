import { describe, expect, it } from 'vitest'
import { describeStar, starTemperature } from './star-info.ts'

describe('star info', () => {
  it('gives plausible temperatures', () => {
    expect(starTemperature(0.65)).toBeGreaterThan(5500) // Sun, ~5800 K
    expect(starTemperature(0.65)).toBeLessThan(6100)
    expect(starTemperature(0)).toBeGreaterThan(9000)
    expect(starTemperature(1.85)).toBeLessThan(3800)
  })
  it('describes Sirius', () => {
    const t = describeStar({ name: 'Sirius', mag: -1.46, bv: 0, rank: 1, az: 190, el: 25.4 })
    expect(t).toContain('1st brightest star in the sky')
    expect(t).toContain('magnitude −1.5')
    expect(t).toContain('blue')
    expect(t).toContain('25° up, S (190°)')
  })
})
