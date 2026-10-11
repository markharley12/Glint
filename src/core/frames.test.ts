import { describe, expect, it } from 'vitest'
import { ecfToEnuMatrix, enuToHorizontal, horizontalToEnu, observerEcf, refraction, separation, TopocentricFrame } from './frames.ts'
import { mat3, vec } from './vec.ts'

describe('observer position', () => {
  it('puts the equator/prime-meridian point on the semi-major axis', () => {
    const p = observerEcf({ latitude: 0, longitude: 0, height: 0 })
    expect(p[0]).toBeCloseTo(6378.137, 9)
    expect(p[1]).toBeCloseTo(0, 9)
    expect(p[2]).toBeCloseTo(0, 9)
  })

  it('puts the pole on the semi-minor axis', () => {
    expect(observerEcf({ latitude: 90, longitude: 0, height: 0 })[2]).toBeCloseTo(6356.7523142, 6)
  })
})

describe('ENU basis', () => {
  it('is orthonormal and right-handed everywhere', () => {
    for (const [lat, lon] of [[51.5, -0.1], [-33.9, 151.2], [89.9, 45], [0, 180]] as const) {
      const m = ecfToEnuMatrix({ latitude: lat, longitude: lon, height: 0 })
      const e = [m[0], m[1], m[2]] as [number, number, number]
      const n = [m[3], m[4], m[5]] as [number, number, number]
      const u = [m[6], m[7], m[8]] as [number, number, number]
      for (const v of [e, n, u]) expect(vec.norm(v)).toBeCloseTo(1, 12)
      expect(vec.dot(e, n)).toBeCloseTo(0, 12)
      // east × north = up
      const c = vec.cross(e, n)
      for (let i = 0; i < 3; i++) expect(c[i]).toBeCloseTo(u[i]!, 12)
    }
  })

  it('has "up" along the ellipsoid normal, not the geocentric radius', () => {
    // At 45° geodetic latitude the two differ by ~0.19°.
    const o = { latitude: 45, longitude: 0, height: 0 }
    const up = mat3.mulVec(mat3.transpose(ecfToEnuMatrix(o)), [0, 0, 1])
    const radial = vec.normalize(observerEcf(o))
    expect((vec.angle(up, radial) * 180) / Math.PI).toBeCloseTo(0.192, 2)
  })
})

describe('horizontal coordinates', () => {
  it.each([
    [0, 0, [0, 1, 0]],
    [90, 0, [1, 0, 0]],
    [180, 0, [0, -1, 0]],
    [270, 45, [-Math.SQRT1_2, 0, Math.SQRT1_2]],
  ] as const)('az %d° el %d°', (az, el, enu) => {
    const v = horizontalToEnu(az, el)
    for (let i = 0; i < 3; i++) expect(v[i]).toBeCloseTo(enu[i]!, 12)
    const back = enuToHorizontal(v)
    expect(back.az).toBeCloseTo(az, 9)
    expect(back.el).toBeCloseTo(el, 9)
  })

  it('measures separation along a great circle', () => {
    expect(separation({ az: 0, el: 0 }, { az: 90, el: 0 })).toBeCloseTo(90, 9)
    expect(separation({ az: 10, el: 89 }, { az: 190, el: 89 })).toBeCloseTo(2, 9)
  })
})

describe('TopocentricFrame', () => {
  it('sees a point straight above the observer at the zenith', () => {
    const o = { latitude: 40, longitude: -75, height: 0.1 }
    const f = new TopocentricFrame(o)
    f.setGmst(0) // TEME = ECF
    const up = mat3.mulVec(mat3.transpose(f.enu), [0, 0, 1])
    const p = vec.add(f.ecf, vec.scale(up, 500))
    const out = [0, 0, 0]
    f.toEnu(p, null, out)
    expect(out[0]).toBeCloseTo(0, 9)
    expect(out[1]).toBeCloseTo(0, 9)
    expect(out[2]).toBeCloseTo(500, 9)
  })

  it('reports a geostationary-like object as nearly fixed in the sky', () => {
    // An object co-rotating with the Earth has zero velocity relative to it.
    const f = new TopocentricFrame({ latitude: 0, longitude: 0, height: 0 })
    const gmst = 1.234
    f.setGmst(gmst)
    const r = 42164
    const p: [number, number, number] = [r * Math.cos(gmst), r * Math.sin(gmst), 0]
    const w = 7.292115e-5
    const v: [number, number, number] = [-w * p[1], w * p[0], 0]
    const out = [0, 0, 0, 0, 0, 0]
    f.toEnu(p, v, out)
    expect(out[2]).toBeCloseTo(r - 6378.137, 6)
    for (let i = 3; i < 6; i++) expect(out[i]).toBeCloseTo(0, 9)
  })
})

describe('refraction', () => {
  it('lifts the horizon by about half a degree and the zenith by nothing', () => {
    expect(refraction(0)).toBeGreaterThan(0.45)
    expect(refraction(0)).toBeLessThan(0.52)
    expect(refraction(45)).toBeCloseTo(1.0 / 60, 2)
    expect(refraction(90)).toBeLessThan(0.001)
  })

  it('stays finite and continuous below the horizon', () => {
    expect(Number.isFinite(refraction(-30))).toBe(true)
    expect(refraction(-30)).toBe(refraction(-1))
  })
})
