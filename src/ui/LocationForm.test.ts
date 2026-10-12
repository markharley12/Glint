// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseLatLon } from './LocationForm.tsx'

describe('parseLatLon', () => {
  it.each([
    ['51.48, -0.01', { lat: 51.48, lon: -0.01 }],
    ['51.48 -0.01', { lat: 51.48, lon: -0.01 }],
    ['51.48;-0.01', { lat: 51.48, lon: -0.01 }],
    ['33.9 S, 151.2 E', { lat: -33.9, lon: 151.2 }],
    ['33.9°S 18.4°E', { lat: -33.9, lon: 18.4 }],
    ['40.7 N 74 W', { lat: 40.7, lon: -74 }],
    ['  -33.92 ,  18.42  ', { lat: -33.92, lon: 18.42 }],
  ])('%s', (text, want) => expect(parseLatLon(text)).toEqual(want))

  it.each(['', 'London', '91, 0', '0, 181', '51.48', '1,2,3'])('rejects %j', (text) => expect(parseLatLon(text)).toBeNull())
})
