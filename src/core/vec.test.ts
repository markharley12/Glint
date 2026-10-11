import { describe, expect, it } from 'vitest'
import { DEG, mat3, quat, vec, wrap180, wrap360, type Quat, type Vec3 } from './vec.ts'

function expectVec(a: Vec3, b: Vec3, digits = 12) {
  for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i]!, digits)
}

describe('vec', () => {
  it('measures small and near-opposite angles without losing precision', () => {
    const tiny = 1e-9
    expect(vec.angle([1, 0, 0], [Math.cos(tiny), Math.sin(tiny), 0])).toBeCloseTo(tiny, 18)
    expect(vec.angle([1, 0, 0], [-1, 1e-9, 0])).toBeCloseTo(Math.PI - 1e-9, 15)
  })
})

describe('quat', () => {
  it('rotates +x to +y by a quarter turn about +z', () => {
    expectVec(quat.rotate(quat.fromAxisAngle([0, 0, 1], Math.PI / 2), [1, 0, 0]), [0, 1, 0])
  })

  it('composes as "apply b, then a"', () => {
    const a = quat.fromAxisAngle([0, 0, 1], Math.PI / 2)
    const b = quat.fromAxisAngle([1, 0, 0], Math.PI / 2)
    const v: Vec3 = [0, 1, 0]
    expectVec(quat.rotate(quat.mul(a, b), v), quat.rotate(a, quat.rotate(b, v)))
  })

  it('round-trips through a rotation matrix for all four Shepperd branches', () => {
    const cases: Quat[] = [
      quat.fromAxisAngle([0.2, 0.3, 0.9], 0.4),
      quat.fromAxisAngle([1, 0, 0], 3.0),
      quat.fromAxisAngle([0, 1, 0], 3.0),
      quat.fromAxisAngle([0, 0, 1], 3.0),
    ]
    for (const q of cases) {
      const back = quat.fromMat3(quat.toMat3(q))
      expect(quat.angleBetween(q, back)).toBeLessThan(1e-7)
      const v: Vec3 = [0.3, -0.5, 0.8]
      expectVec(mat3.mulVec(quat.toMat3(q), v), quat.rotate(q, v))
    }
  })

  it('slerps halfway along the shorter arc', () => {
    const a = quat.identity()
    const b = quat.fromAxisAngle([0, 0, 1], 100 * DEG)
    const mid = quat.slerp(a, b, 0.5)
    expect(quat.angleBetween(a, mid)).toBeCloseTo(50 * DEG, 10)
    // −b is the same rotation; slerp must not go the long way round.
    const negB: Quat = [-b[0], -b[1], -b[2], -b[3]]
    expect(quat.angleBetween(a, quat.slerp(a, negB, 0.5))).toBeCloseTo(50 * DEG, 10)
  })

  it('agrees with matrix multiplication on composition', () => {
    const a = quat.fromAxisAngle([1, 2, 3], 0.7)
    const b = quat.fromAxisAngle([-2, 1, 0.5], 1.9)
    const m = mat3.mul(quat.toMat3(a), quat.toMat3(b))
    const q = quat.toMat3(quat.mul(a, b))
    for (let i = 0; i < 9; i++) expect(m[i]).toBeCloseTo(q[i]!, 12)
  })
})

describe('angle wrapping', () => {
  it.each([
    [0, 0, 0],
    [360, 0, 0],
    [-10, 350, -10],
    [190, 190, -170],
    [-540, 180, 180],
  ])('%d° → %d° / %d°', (x, w360, w180) => {
    expect(wrap360(x)).toBeCloseTo(w360, 12)
    expect(wrap180(x)).toBeCloseTo(w180, 12)
  })
})
