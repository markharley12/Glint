import { describe, expect, it } from 'vitest'
import { horizontalToEnu } from './frames.ts'
import { findTrains, launchKey, trainName, type TrainCandidate } from './trains.ts'
import type { Vec3 } from './vec.ts'

/** A satellite at (az, el) moving toward increasing azimuth along the
 *  horizon direction — enough for the heading test. */
function sat(index: number, launch: string, az: number, el: number, heading: Vec3 = [0, 0, 0]): TrainCandidate {
  const dir = horizontalToEnu(az, el)
  // Default motion: eastward-ish tangent at that point.
  const motion: Vec3 = heading[0] || heading[1] || heading[2] ? heading : [Math.cos((az * Math.PI) / 180), -Math.sin((az * Math.PI) / 180), 0]
  return { index, launch, dir, motion }
}

describe('launchKey', () => {
  it.each([
    ['2026-123A', '2026-123'],
    ['1998-067BZ', '1998-067'],
    ['', null],
    ['UNKNOWN', null],
  ])('%s → %s', (des, want) => expect(launchKey(des)).toBe(want))
})

describe('findTrains', () => {
  it('finds a string of same-launch satellites, leader first', () => {
    // Five satellites strung out 4° apart, moving toward higher azimuth.
    const c = [0, 1, 2, 3, 4].map((k) => sat(10 + k, '2026-200', 100 + 4 * k, 40))
    const trains = findTrains(c)
    expect(trains).toHaveLength(1)
    // Moving toward higher azimuth, so the highest-azimuth one leads.
    expect(trains[0]!.members).toEqual([14, 13, 12, 11, 10])
  })

  it('needs enough members, close enough, from one launch', () => {
    const three = [0, 1, 2].map((k) => sat(k, '2026-200', 100 + 3 * k, 40))
    expect(findTrains(three)).toEqual([])
    const spread = [0, 1, 2, 3].map((k) => sat(k, '2026-200', 100 + 20 * k, 40))
    expect(findTrains(spread)).toEqual([])
    const mixed = [0, 1, 2, 3].map((k) => sat(k, k % 2 ? '2026-200' : '2026-201', 100 + 3 * k, 40))
    expect(findTrains(mixed)).toEqual([])
  })

  it('splits satellites of one launch crossing in different directions', () => {
    const north: Vec3 = [0, 1, 0]
    const south: Vec3 = [0, -1, 0]
    const a = [0, 1, 2, 3].map((k) => sat(k, '2026-200', 100 + 2 * k, 40, north))
    const b = [0, 1, 2, 3].map((k) => sat(10 + k, '2026-200', 101 + 2 * k, 41, south))
    const trains = findTrains([...a, ...b])
    expect(trains).toHaveLength(2)
    expect(trains.map((t) => t.members.length)).toEqual([4, 4])
  })
})

describe('trainName', () => {
  it('names Starlink trains, and others by launch', () => {
    expect(trainName(['STARLINK-35001', 'STARLINK-35002'], '2026-200')).toBe('Starlink train')
    expect(trainName(['QIANFAN-101', 'QIANFAN-102'], '2026-201')).toBe('Qianfan train')
    expect(trainName(['OBJECT A', 'CZ-6A R/B'], '2026-202')).toBe('Launch 2026-202')
  })
})
