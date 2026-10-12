import { describe, expect, it } from 'vitest'
import { horizontalToEnu } from './frames.ts'
import type { Pass, PassPoint } from './passes.ts'
import type { SatelliteInfo } from './satellite.ts'
import { findTrains, groupTrainPasses, launchGroups, launchKey, recentLaunch, trainName, type TrainCandidate } from './trains.ts'
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

const NOW = Date.UTC(2026, 9, 12)
const DAY = 86_400_000

function info(norad: number, intlDes: string, launch: string, groups: string[] = []): SatelliteInfo {
  return { norad, name: `SAT-${norad}`, intlDes, type: 'payload', owner: '', launch, stdMag: null, magSource: 'none', groups }
}

describe('recentLaunch and launchGroups', () => {
  it('uses the launch date, or CelesTrak\'s last-30-days list without one', () => {
    expect(recentLaunch(info(1, '2026-220A', '2026-10-01'), NOW, 30 * DAY)).toBe('2026-220')
    expect(recentLaunch(info(1, '2026-120A', '2026-05-01'), NOW, 30 * DAY)).toBeNull()
    expect(recentLaunch(info(1, '2026-230A', '', ['last-30-days']), NOW, 30 * DAY)).toBe('2026-230')
    expect(recentLaunch(info(1, '2026-230A', ''), NOW, 30 * DAY)).toBeNull()
  })

  it('keeps launches with enough objects', () => {
    const sats = [
      ...[1, 2, 3, 4, 5].map((n) => info(n, `2026-220${'ABCDE'[n - 1]}`, '2026-10-01')),
      ...[6, 7].map((n) => info(n, `2026-221${'AB'[n - 6]}`, '2026-10-02')),
      ...[8, 9, 10, 11].map((n) => info(n, `2026-100${'ABCD'[n - 8]}`, '2026-04-01')),
    ]
    expect([...launchGroups(sats, NOW, 30 * DAY)]).toEqual([['2026-220', [1, 2, 3, 4, 5]]])
  })
})

function point(ms: number, mag: number | null = null): PassPoint {
  return { ms, az: 0, el: 30, range: 500, mag, sunlit: 1 }
}

function pass(norad: number, startMin: number, mag: number | null = 4): Pass {
  const t = NOW + startMin * 60_000
  const start = point(t)
  const end = point(t + 4 * 60_000)
  return {
    norad,
    rise: point(t - 60_000),
    max: point(t + 2 * 60_000),
    set: point(t + 5 * 60_000),
    startsUp: false,
    endsUp: false,
    visible: { start, end, max: point(t + 2 * 60_000), brightest: point(t + 2 * 60_000, mag) },
  }
}

describe('groupTrainPasses', () => {
  const launchOf = (norad: number) => (norad < 100 ? '2026-220' : norad < 200 ? '2026-221' : null)

  it('chains same-launch passes that follow each other', () => {
    const passes = [pass(1, 0, 4.5), pass(2, 0.5, 3.8), pass(3, 1.2, 4.1), pass(4, 2, 5)]
    const [train, ...rest] = groupTrainPasses(passes, launchOf)
    expect(rest).toEqual([])
    expect(train!.launch).toBe('2026-220')
    expect(train!.members.map((p) => p.norad)).toEqual([1, 2, 3, 4])
    // Runs from the first appearing to the last vanishing, and stands in
    // for the middle member at its brightest.
    expect(train!.pass.norad).toBe(3)
    expect(train!.pass.visible!.start.ms).toBe(passes[0]!.visible!.start.ms)
    expect(train!.pass.visible!.end.ms).toBe(passes[3]!.visible!.end.ms)
    expect(train!.pass.visible!.brightest!.mag).toBe(3.8)
  })

  it('splits passes far apart in time, ignores other launches and stragglers', () => {
    const passes = [
      pass(1, 0), pass(2, 1), pass(3, 2), // a train
      pass(4, 95), pass(5, 96), pass(6, 97), // the same launch an orbit later
      pass(101, 0), pass(102, 1), // too few
      pass(300, 0), pass(301, 1), pass(302, 2), // not a recent launch
    ]
    const trains = groupTrainPasses(passes, launchOf)
    expect(trains.map((t) => t.members.map((p) => p.norad))).toEqual([[1, 2, 3], [4, 5, 6]])
  })
})
