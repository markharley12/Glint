import { describe, expect, it } from 'vitest'
import { shareUrl } from './url.ts'

describe('shareUrl', () => {
  it('links to a place, time, view and satellite, with the place rounded', () => {
    const url = shareUrl('https://example.org/glint/?lat=1&x=2#frag', {
      lat: 51.47791,
      lon: -0.00147,
      ms: Date.UTC(2026, 9, 12, 19, 30, 0, 400),
      view: 'sky',
      sat: 25544,
    })
    expect(url).toBe('https://example.org/glint/?lat=51.48&lon=-0.00&t=2026-10-12T19%3A30%3A00.000Z&view=sky&sat=25544')
  })
})
