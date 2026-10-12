import { describe, expect, it } from 'vitest'
import { propagate, json2satrec, type OMMJsonObject } from 'satellite.js'
import { elements } from '../core/fixtures/index.ts'
import { encodeRow, PACK_FIELDS, rowDecoder } from './pack.ts'

describe('pack rows', () => {
  it('round-trip every element set without changing where SGP4 puts it', () => {
    const decode = rowDecoder(PACK_FIELDS)
    const when = new Date(Date.UTC(2026, 9, 12, 3, 0, 0))
    for (const o of elements) {
      const row = encodeRow({
        norad: Number(o.NORAD_CAT_ID),
        name: o.OBJECT_NAME,
        intlDes: o.OBJECT_ID,
        epoch: o.EPOCH,
        meanMotion: Number(o.MEAN_MOTION),
        eccentricity: Number(o.ECCENTRICITY),
        inclination: Number(o.INCLINATION),
        raan: Number(o.RA_OF_ASC_NODE),
        argPericenter: Number(o.ARG_OF_PERICENTER),
        meanAnomaly: Number(o.MEAN_ANOMALY),
        bstar: Number(o.BSTAR),
        meanMotionDot: Number(o.MEAN_MOTION_DOT),
        meanMotionDdot: Number(o.MEAN_MOTION_DDOT),
        elementSetNo: Number(o.ELEMENT_SET_NO),
        revAtEpoch: Number(o.REV_AT_EPOCH),
        type: 'payload',
        owner: 'US',
        launch: '2020-01-01',
        stdMag: 4,
        magSource: 'rcs',
        groups: ['visual'],
      })
      // Through JSON, as the app receives it.
      const { omm, info } = decode(JSON.parse(JSON.stringify(row)) as typeof row)
      expect(info.stdMag).toBe(4)
      expect(info.magSource).toBe('rcs')
      const a = propagate(json2satrec(o), when)!
      const b = propagate(json2satrec(omm as unknown as OMMJsonObject), when)!
      expect(b.position.x).toBe(a.position.x)
      expect(b.position.y).toBe(a.position.y)
      expect(b.position.z).toBe(a.position.z)
    }
  })

  it('decodes rows whose columns are in a different order', () => {
    const fields = ['bstar', 'name', 'norad', 'epoch', 'meanMotion', 'eccentricity', 'inclination', 'raan', 'argPericenter', 'meanAnomaly']
    const { info, omm } = rowDecoder(fields)([0.0001, 'X', 42, '2026-10-11T00:00:00', 15, 0.001, 51, 1, 2, 3])
    expect(info.norad).toBe(42)
    expect(info.stdMag).toBeNull()
    expect(info.magSource).toBe('none')
    expect(info.groups).toEqual([])
    expect(omm.BSTAR).toBe(0.0001)
  })

  it('refuses a pack missing an essential column', () => {
    expect(() => rowDecoder(['norad', 'name'])).toThrow(/epoch/)
  })
})
