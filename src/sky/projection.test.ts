import { describe, expect, it } from 'vitest'
import { enuToHorizontal, horizontalToEnu } from '../core/frames.ts'
import { quat } from '../core/vec.ts'
import { lookAt, PerspectiveProjector, PolarProjector, viewDirection, type Point } from './projection.ts'

describe('PolarProjector', () => {
  const p = new PolarProjector(400, 400, 0)
  const at = (az: number, el: number) => {
    const out: Point = { x: 0, y: 0 }
    p.project(horizontalToEnu(az, el), out)
    return out
  }

  it('puts the zenith in the middle and the horizon on the rim', () => {
    expect(at(123, 90)).toEqual({ x: 200, y: 200 })
    const n = at(0, 0)
    expect(n.x).toBeCloseTo(200, 9)
    expect(n.y).toBeCloseTo(0, 9)
  })

  it('has north up and east on the left, as the sky looks from below', () => {
    expect(at(90, 0).x).toBeCloseTo(0, 9)
    expect(at(270, 0).x).toBeCloseTo(400, 9)
    expect(at(180, 0).y).toBeCloseTo(400, 9)
  })

  it('is equidistant: 45° up is halfway out', () => {
    expect(at(180, 45).y).toBeCloseTo(300, 9)
  })

  it('round-trips through unproject', () => {
    for (const [az, el] of [[10, 10], [200, 70], [300, 1]] as const) {
      const pt = at(az, el)
      const h = enuToHorizontal(p.unproject(pt.x, pt.y)!)
      expect(h.az).toBeCloseTo(az, 6)
      expect(h.el).toBeCloseTo(el, 6)
    }
  })

  it('has nothing to unproject outside the disc', () => {
    expect(p.unproject(0, 0)).toBeNull()
  })
})

describe('PerspectiveProjector', () => {
  it('centres the direction it looks at', () => {
    const cam = new PerspectiveProjector(800, 600, lookAt(135, 30), 60)
    const out: Point = { x: 0, y: 0 }
    expect(cam.project(horizontalToEnu(135, 30), out)).toBe(true)
    expect(out.x).toBeCloseTo(400, 6)
    expect(out.y).toBeCloseTo(300, 6)
  })

  it('maps the vertical field of view to the screen height', () => {
    const cam = new PerspectiveProjector(800, 600, lookAt(0, 0), 60)
    const out: Point = { x: 0, y: 0 }
    cam.project(horizontalToEnu(0, 30), out)
    expect(out.y).toBeCloseTo(0, 6)
    cam.project(horizontalToEnu(0, -30), out)
    expect(out.y).toBeCloseTo(600, 6)
  })

  it('puts east on the right when facing north', () => {
    const cam = new PerspectiveProjector(800, 600, lookAt(0, 0), 60)
    const out: Point = { x: 0, y: 0 }
    cam.project(horizontalToEnu(10, 0), out)
    expect(out.x).toBeGreaterThan(400)
  })

  it('refuses points behind the camera', () => {
    const cam = new PerspectiveProjector(800, 600, lookAt(0, 0), 60)
    expect(cam.project(horizontalToEnu(180, 0), { x: 0, y: 0 })).toBe(false)
  })

  it('round-trips through unproject', () => {
    const cam = new PerspectiveProjector(800, 600, lookAt(250, 40), 50)
    const out: Point = { x: 0, y: 0 }
    for (const [az, el] of [[250, 40], [240, 50], [262, 25]] as const) {
      cam.project(horizontalToEnu(az, el), out)
      const h = enuToHorizontal(cam.unproject(out.x, out.y))
      expect(h.az).toBeCloseTo(az, 6)
      expect(h.el).toBeCloseTo(el, 6)
    }
  })

  it('draws the level horizon as a horizontal line at the right height', () => {
    const cam = new PerspectiveProjector(800, 600, lookAt(0, 10), 60)
    const { a, b, c } = cam.horizonLine()
    expect(Math.abs(a)).toBeLessThan(1e-12)
    const y = -c / b
    const out: Point = { x: 0, y: 0 }
    cam.project(horizontalToEnu(0, 0), out)
    expect(y).toBeCloseTo(out.y, 6)
    // The sky (screen top) is on the positive side.
    expect(a * 400 + b * 0 + c).toBeGreaterThan(0)
  })
})

describe('lookAt / viewDirection', () => {
  it('round-trip', () => {
    for (const [az, el] of [[0, 0], [90, 45], [359, -10], [180, 80]] as const) {
      const v = viewDirection(lookAt(az, el))
      expect(v.az).toBeCloseTo(az, 9)
      expect(v.el).toBeCloseTo(el, 9)
    }
  })

  it('keeps the camera upright (its x axis horizontal)', () => {
    const q = lookAt(77, 33)
    expect(quat.rotate(q, [1, 0, 0])[2]).toBeCloseTo(0, 12)
    expect(quat.rotate(q, [0, 1, 0])[2]).toBeGreaterThan(0)
  })
})
