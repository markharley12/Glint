// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, parseSettings } from './settings.ts'

describe('parseSettings', () => {
  it('gives the defaults for nothing, junk or the wrong type', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('hello')).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings(42)).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps valid fields and replaces invalid ones field by field', () => {
    const s = parseSettings({
      view: 'sky',
      show: 'everything', // not an option
      limitingMag: 99, // out of range
      night: true,
      labels: 'many',
      packs: ['bright', 3], // not all strings
      calibration: { yawDeg: 12.5, pitchDeg: 'up' },
    })
    expect(s.view).toBe('sky')
    expect(s.show).toBe(DEFAULT_SETTINGS.show)
    expect(s.limitingMag).toBe(DEFAULT_SETTINGS.limitingMag)
    expect(s.night).toBe(true)
    expect(s.labels).toBe('many')
    expect(s.packs).toBeNull()
    expect(s.calibration).toEqual({ yawDeg: 12.5, pitchDeg: 0, at: null })
  })

  it('validates a saved location and drops a bad one', () => {
    expect(parseSettings({ location: { latitude: 51.5, longitude: -0.1, height: 0.02, label: 'GPS', at: 5 } }).location).toEqual({
      latitude: 51.5,
      longitude: -0.1,
      height: 0.02,
      label: 'GPS',
      at: 5,
    })
    expect(parseSettings({ location: { latitude: 95, longitude: 0 } }).location).toBeNull()
    expect(parseSettings({ location: 'here' }).location).toBeNull()
  })

  it('does not share nested objects with the defaults', () => {
    const s = parseSettings(null)
    s.calibration.yawDeg = 30
    expect(DEFAULT_SETTINGS.calibration.yawDeg).toBe(0)
  })
})
