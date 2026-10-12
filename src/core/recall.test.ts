import { describe, expect, it } from 'vitest'
import type { Pass, PassPoint } from './passes.ts'
import { rankRecall, type RecallQuery } from './recall.ts'

const T = Date.UTC(2026, 9, 12, 19, 0)

function point(ms: number, az: number, mag: number | null = null): PassPoint {
  return { ms, az, el: 30, range: 800, mag, sunlit: 1 }
}

/** A visible pass from `fromAz` to `toAz`, starting `startMin` after T. */
function pass(norad: number, startMin: number, fromAz: number, toAz: number, mag: number | null): Pass {
  const s = T + startMin * 60_000
  const e = s + 4 * 60_000
  return {
    norad,
    rise: point(s - 60_000, fromAz),
    max: point(s + 120_000, (fromAz + toAz) / 2),
    set: point(e + 60_000, toAz),
    startsUp: false,
    endsUp: false,
    visible: { start: point(s, fromAz), end: point(e, toAz), max: point(s + 120_000, (fromAz + toAz) / 2), brightest: point(s + 120_000, 0, mag) },
  }
}

const query = (q: Partial<RecallQuery>): RecallQuery => ({ ms: T, slackMs: 5 * 60_000, fromAz: null, toAz: null, brightness: null, ...q })
const ids = (passes: Pass[], q: RecallQuery) => rankRecall(passes, q).map((m) => m.pass.norad)

describe('rankRecall', () => {
  const passes = [
    pass(1, -2, 225, 45, 2), // SW → NE, during
    pass(2, -1, 315, 135, 1.5), // NW → SE, during
    pass(3, 1, 225, 60, 5), // SW → ENE, faint
    pass(4, 30, 225, 45, -2), // far too late
  ]

  it('drops passes outside the time slack', () => {
    expect(ids(passes, query({}))).not.toContain(4)
  })

  it('ranks by the remembered directions', () => {
    expect(ids(passes, query({ fromAz: 315, toAz: 135 }))[0]).toBe(2)
    expect(ids(passes, query({ fromAz: 225, toAz: 45 }))[0]).toBe(1)
  })

  it('uses brightness to break near-ties', () => {
    expect(ids(passes, query({ fromAz: 225, toAz: 50, brightness: 'faint' }))[0]).toBe(3)
    expect(ids(passes, query({ fromAz: 225, toAz: 50, brightness: 'bright' }))[0]).toBe(1)
  })

  it('wraps directions across north', () => {
    const north = [pass(5, 0, 350, 170, 2), pass(6, 0, 90, 270, 2)]
    expect(ids(north, query({ fromAz: 10 }))[0]).toBe(5)
  })
})
