import { describe, expect, it } from 'vitest'
import { enuToHorizontal } from '../core/frames.ts'
import { quat, type Quat, type Vec3 } from '../core/vec.ts'
import { angleDiff, correct, HeadingOffset, OrientationFilter, quatFromEuler, screenAdjust } from './orientation-math.ts'

/** Where the rear camera points, and which way is "up" on the screen. */
function camera(q: Quat) {
  const look = enuToHorizontal(quat.rotate(q, [0, 0, -1]))
  const up: Vec3 = quat.rotate(q, [0, 1, 0])
  return { ...look, up }
}

describe('quatFromEuler', () => {
  it('with all angles zero, lies flat, top to the north, camera down', () => {
    const c = camera(quatFromEuler(0, 0, 0))
    expect(c.el).toBeCloseTo(-90, 9)
    expect(quat.rotate(quatFromEuler(0, 0, 0), [0, 1, 0])[1]).toBeCloseTo(1, 12)
  })

  it('held upright (β = 90°) points the camera at the horizon, north', () => {
    const c = camera(quatFromEuler(0, 90, 0))
    expect(c.el).toBeCloseTo(0, 9)
    expect(c.az).toBeCloseTo(0, 9)
    expect(c.up[2]).toBeCloseTo(1, 9)
  })

  it('turns west as α increases (α is counter-clockwise from above)', () => {
    expect(camera(quatFromEuler(90, 90, 0)).az).toBeCloseTo(270, 9)
    expect(camera(quatFromEuler(270, 90, 0)).az).toBeCloseTo(90, 9)
  })

  it('tilts the camera up as β goes past 90°', () => {
    expect(camera(quatFromEuler(0, 120, 0)).el).toBeCloseTo(30, 9)
  })
})

describe('screenAdjust', () => {
  it('is the identity in portrait', () => {
    const device = quatFromEuler(20, 70, -10)
    expect(quat.angleBetween(screenAdjust(device, 0), device)).toBeCloseTo(0, 9)
  })

  it('rotating the device and the screen together leaves the camera view unchanged', () => {
    // Upright, facing north, then turned into landscape about the camera
    // axis: device y rolls to the left.
    const portrait = quatFromEuler(0, 90, 0)
    const roll = quat.fromAxisAngle([0, 0, 1], (90 * Math.PI) / 180) // device CCW about its z
    const landscapeDevice = quat.mul(portrait, roll)
    const q = screenAdjust(landscapeDevice, 90)
    const c = camera(q)
    expect(c.az).toBeCloseTo(0, 9)
    expect(c.el).toBeCloseTo(0, 9)
    expect(c.up[2]).toBeCloseTo(1, 9) // screen up is still sky-up
  })
})

describe('correct', () => {
  it('adds yaw clockwise and pitch upward', () => {
    const q = quatFromEuler(0, 90, 0) // facing north, level
    const c = camera(correct(q, 10, 5))
    expect(c.az).toBeCloseTo(10, 9)
    expect(c.el).toBeCloseTo(5, 9)
  })
})

describe('angleDiff', () => {
  it.each([
    [10, 350, 20],
    [350, 10, -20],
    [180, 0, -180],
    [0, 0, 0],
  ])('%d − %d = %d', (a, b, d) => expect(angleDiff(a, b)).toBeCloseTo(d, 12))
})

describe('HeadingOffset', () => {
  it('locks onto the compass and follows it slowly', () => {
    const h = new HeadingOffset(3)
    // Gyro alpha says 10°, compass says the device heading is 30° (so
    // absolute alpha = 330°): offset = 320° ≡ −40°.
    expect(angleDiff(h.update(10, 30, 0), -40)).toBeCloseTo(0, 9)
    // The compass jumps 10°: one second later the offset has moved only
    // part of the way.
    const after = h.update(10, 40, 1)
    const moved = angleDiff(after, -40)
    expect(moved).toBeLessThan(0)
    expect(moved).toBeGreaterThan(-10)
  })
})

describe('OrientationFilter', () => {
  it('smooths jitter while still but follows a fast turn closely', () => {
    const f = new OrientationFilter()
    const base = quatFromEuler(0, 90, 0)
    f.update(base, 0)
    // Still: a 1° jitter sample moves the output only a little.
    const jitter = quatFromEuler(1, 90, 0)
    const out = f.update(jitter, 1 / 60)
    expect((quat.angleBetween(out, base) * 180) / Math.PI).toBeLessThan(0.2)
    // A steady 90°/s sweep (brisk, for someone hunting across the sky)
    // lags by only a few degrees.
    const f2 = new OrientationFilter()
    let t = 0
    let az = 0
    let last = f2.update(quatFromEuler(0, 90, 0), 0)
    for (let i = 0; i < 30; i++) {
      t += 1 / 60
      az += 1.5
      last = f2.update(quatFromEuler(az, 90, 0), t)
    }
    expect((quat.angleBetween(last, quatFromEuler(az, 90, 0)) * 180) / Math.PI).toBeLessThan(4)
  })
})
