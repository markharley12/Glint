import { describe, expect, it } from 'vitest'
import { rowDecoder } from '../../src/data/pack.ts'
import { buildPacks, standardMagnitude, validateOmm, type CelestrakOmm, type PackDefinition } from './build.ts'
import type { McCantsEntry, SatcatEntry } from './parse.ts'

const NOW = Date.UTC(2026, 9, 12)

function omm(norad: number, name: string, extra: Partial<CelestrakOmm> = {}): CelestrakOmm {
  return {
    OBJECT_NAME: name,
    OBJECT_ID: '2020-001A',
    EPOCH: '2026-10-11T04:13:59.875680',
    MEAN_MOTION: 15.5,
    ECCENTRICITY: 0.0007,
    INCLINATION: 51.6,
    RA_OF_ASC_NODE: 86,
    ARG_OF_PERICENTER: 248,
    MEAN_ANOMALY: 112,
    NORAD_CAT_ID: norad,
    ELEMENT_SET_NO: 999,
    REV_AT_EPOCH: 1000,
    BSTAR: 0.0002,
    MEAN_MOTION_DOT: 0.0001,
    MEAN_MOTION_DDOT: 0,
    ...extra,
  }
}

const mccants = new Map<number, McCantsEntry>([
  [25544, { norad: 25544, mag: -2.5, rcs: 399 }],
  [100, { norad: 100, mag: 5, rcs: 1 }],
  [101, { norad: 101, mag: 2.5, rcs: 10 }],
  [102, { norad: 102, mag: null, rcs: 100 }],
])
const satcat = new Map<number, SatcatEntry>([
  [25544, { norad: 25544, name: 'ISS', type: 'payload', owner: 'ISS', launch: '1998-11-20', rcs: 399, decayed: false }],
  [200, { norad: 200, name: 'X', type: 'debris', owner: 'US', launch: '', rcs: 1000, decayed: false }],
  [300, { norad: 300, name: 'GONE', type: 'payload', owner: 'US', launch: '', rcs: null, decayed: true }],
])

describe('standardMagnitude', () => {
  const model = { a: 5, b: -2.5, rms: 0, n: 3 }

  it('prefers McCants, then name class, then RCS', () => {
    expect(standardMagnitude(25544, 'ISS', mccants, satcat, model)).toEqual({ stdMag: -2.5, source: 'mccants' })
    expect(standardMagnitude(44714, 'STARLINK-1008', mccants, satcat, model)).toEqual({ stdMag: 5.5, source: 'class' })
    expect(standardMagnitude(102, 'X', mccants, satcat, model)).toEqual({ stdMag: 0, source: 'rcs' })
    expect(standardMagnitude(200, 'X', mccants, satcat, model)).toEqual({ stdMag: -2.5, source: 'rcs' })
    expect(standardMagnitude(999, 'X', mccants, satcat, model)).toEqual({ stdMag: null, source: 'none' })
  })
})

describe('validateOmm', () => {
  it('rejects nonsense, stale epochs and decayed objects', () => {
    expect(validateOmm(omm(1, 'A'), NOW, satcat)).toBeNull()
    expect(validateOmm(omm(1, 'A', { ECCENTRICITY: 1.2 }), NOW, satcat)).toBe('invalid')
    expect(validateOmm(omm(1, 'A', { MEAN_MOTION: Number.NaN }), NOW, satcat)).toBe('invalid')
    expect(validateOmm(omm(1, 'A', { EPOCH: '2026-08-01T00:00:00' }), NOW, satcat)).toBe('stale')
    expect(validateOmm(omm(300, 'GONE'), NOW, satcat)).toBe('decayed')
  })
})

describe('buildPacks', () => {
  const definitions: PackDefinition[] = [
    { id: 'bright', title: 'B', description: '', default: true, groups: ['stations', 'visual'] },
    { id: 'starlink', title: 'S', description: '', default: true, groups: ['starlink'] },
    { id: 'gnss', title: 'G', description: '', default: false, groups: ['gnss'] },
  ]
  const groups = new Map<string, CelestrakOmm[]>([
    ['stations', [omm(25544, 'ISS (ZARYA)')]],
    ['visual', [omm(25544, 'ISS (ZARYA)'), omm(100, 'SL-8 R/B'), omm(1, 'BAD', { ECCENTRICITY: 2 })]],
    ['starlink', [omm(44714, 'STARLINK-1008')]],
  ])
  const result = buildPacks({ definitions, groups, satcat, mccants, nowMs: NOW })

  it('merges a pack’s groups without duplicates, tagging each object with all its groups', () => {
    const bright = result.packs.find((p) => p.definition.id === 'bright')!.file
    const decode = rowDecoder(bright.fields)
    const rows = bright.rows.map(decode)
    expect(rows.map((r) => r.info.norad)).toEqual([25544, 100])
    expect(rows[0]!.info.groups).toEqual(['stations', 'visual'])
    expect(rows[0]!.info.owner).toBe('ISS')
  })

  it('skips packs with no downloaded groups and counts rejections', () => {
    expect(result.skipped).toEqual(['gnss'])
    expect(result.rejected.invalid).toBe(1)
    expect(result.magnitudeSources).toEqual({ mccants: 2, rcs: 0, class: 1, none: 0 })
  })
})
