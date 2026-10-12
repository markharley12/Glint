import { describe, expect, it } from 'vitest'
import type { OMMJsonObject } from 'satellite.js'
import { elements, fixtureSatellites, reference } from '../core/fixtures/index.ts'
import { horizontalToEnu, TopocentricFrame } from '../core/frames.ts'
import { look } from '../core/look.ts'
import { makeSatellite, revsPerDay, type Satellite } from '../core/satellite.ts'
import { Engine, Slot, STRIDE } from './engine.ts'

const START = Date.UTC(2026, 9, 11, 18, 0, 0)
const observer = reference.observers.greenwich!

/** The fixture orbits, each spun to 20 phases around its plane and node:
 *  160 satellites with realistic elements and varied geometry. */
function constellation(): Satellite[] {
  const sats: Satellite[] = []
  let id = 90_000
  for (const o of elements) {
    for (let k = 0; k < 20; k++) {
      const omm = {
        ...o,
        NORAD_CAT_ID: id,
        MEAN_ANOMALY: (Number(o.MEAN_ANOMALY) + k * 18) % 360,
        RA_OF_ASC_NODE: (Number(o.RA_OF_ASC_NODE) + k * 37) % 360,
      } as OMMJsonObject
      sats.push(
        makeSatellite(
          { norad: id++, name: `${o.OBJECT_NAME} #${k}`, intlDes: '', type: 'payload', owner: '', launch: '', stdMag: 4, magSource: 'rcs', groups: [], dockedTo: null },
          omm,
        ),
      )
    }
  }
  return sats
}

describe('Engine.tick', () => {
  it('agrees with look() for every satellite above the horizon', () => {
    const sats = [...fixtureSatellites().values()]
    const engine = new Engine()
    engine.setSatellites(sats)
    engine.setObserver(observer)
    const frame = new TopocentricFrame(observer)
    for (let t = START; t < START + 6 * 3_600_000; t += 7 * 60_000) {
      const { buffer } = engine.tick(t)
      sats.forEach((sat, i) => {
        const l = look(sat, frame, t)!
        const o = i * STRIDE
        if (l.el > 0) {
          expect(buffer[o + Slot.E]).toBeCloseTo(l.enu[0], 1)
          expect(buffer[o + Slot.N]).toBeCloseTo(l.enu[1], 1)
          expect(buffer[o + Slot.U]).toBeCloseTo(l.enu[2], 1)
          expect(buffer[o + Slot.VU]).toBeCloseTo(l.enuVel[2], 4)
          expect(buffer[o + Slot.SUNLIT]).toBeCloseTo(l.sunlit, 5)
          if (l.mag === null) expect(buffer[o + Slot.MAG]).toBeNaN()
          else expect(buffer[o + Slot.MAG]).toBeCloseTo(l.mag, 3)
        }
      })
    }
  })

  it('never skips a satellite that is above the horizon', () => {
    const sats = constellation()
    const engine = new Engine()
    engine.setSatellites(sats)
    engine.setObserver(observer)
    const frame = new TopocentricFrame(observer)
    let computed = 0
    let ticks = 0
    // 2 h at 5 s, the way the UI ticks in real time.
    for (let t = START; t < START + 2 * 3_600_000; t += 5_000) {
      const r = engine.tick(t)
      computed += r.computed
      ticks++
      // Checking every satellite every tick is slow; every 12th tick (1 min)
      // still crosses every rise.
      if (ticks % 12 !== 0) continue
      sats.forEach((sat, i) => {
        const l = look(sat, frame, t)
        if (l && l.el > 0) expect(r.buffer[i * STRIDE], `${sat.name} at ${new Date(t).toISOString()}`).not.toBeNaN()
      })
    }
    // And the skipping is actually doing something.
    expect(computed / ticks).toBeLessThan(sats.length * 0.6)
  })

  it('recomputes everything when time goes backwards', () => {
    const sats = constellation()
    const engine = new Engine()
    engine.setSatellites(sats)
    engine.setObserver(observer)
    engine.tick(START)
    const second = engine.tick(START + 1000)
    expect(second.computed).toBeLessThan(sats.length)
    expect(engine.tick(START - 3_600_000).computed).toBe(sats.length)
  })
})

describe('Engine queries', () => {
  const engine = new Engine()
  engine.setSatellites([...fixtureSatellites().values()])
  engine.setObserver(observer)

  it('looks up one satellite', () => {
    expect(engine.look(25544, START)?.range).toBeGreaterThan(0)
    expect(engine.look(1, START)).toBeNull()
  })

  it('lists passes in time order, optionally only visible ones', () => {
    const all = engine.passes(null, START, START + 86_400_000)
    const visible = engine.passes(null, START, START + 86_400_000, {}, true)
    expect(all.length).toBeGreaterThan(visible.length)
    for (const p of visible) expect(p.visible).not.toBeNull()
    for (let i = 1; i < all.length; i++) {
      const key = (p: (typeof all)[number]) => p.visible?.start.ms ?? p.rise.ms
      expect(key(all[i]!)).toBeGreaterThanOrEqual(key(all[i - 1]!))
    }
  })

  it('tracks a satellite across the sky', () => {
    const pass = engine.passes([25544], START, START + 86_400_000)[0]!
    const track = engine.track(25544, pass.rise.ms - 60_000, pass.set.ms + 60_000, 10_000)
    expect(track[0]!.el).toBeLessThan(0)
    expect(Math.max(...track.map((p) => p.el))).toBeCloseTo(pass.max.el, 0)
  })
})

describe('Engine.identify', () => {
  it('picks out the satellite the user followed despite sensor errors', () => {
    const sats = constellation()
    const engine = new Engine()
    engine.setSatellites(sats)
    // A wobbling hand, a compass 9° out and a half-second lag.
    const wobble = (k: number) => 0.4 * Math.sin(k * 2.3)
    let cases = 0
    let hits = 0
    for (const obs of Object.values(reference.observers)) {
      engine.setObserver(obs)
      const frame = new TopocentricFrame(obs)
      // Every lit, moving satellite well above the horizon, every 15 min of
      // a day. (Geostationary ones barely move, so only their position
      // tells them apart.)
      for (let t0 = START; t0 < START + 86_400_000; t0 += 15 * 60_000) {
        for (const target of sats) {
          const l = look(target, frame, t0)
          if (!l || l.el < 15 || l.sunlit < 1 || l.mag === null || l.mag > 6 || revsPerDay(target) < 6) continue
          cases++
          const samples = Array.from({ length: 9 }, (_, k) => {
            const ms = t0 + k * 500
            const lk = look(target, frame, ms - 500)!
            return { ms, dir: horizontalToEnu(lk.az + 9, lk.el + wobble(k)) }
          })
          if (engine.identify(samples, 1)[0]?.norad === target.norad) hits++
        }
      }
    }
    expect(cases).toBeGreaterThan(50)
    expect(hits).toBe(cases)
  })
})
