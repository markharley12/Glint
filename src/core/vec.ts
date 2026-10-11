/**
 * Small, allocation-light 3-vector, 3×3 matrix and quaternion helpers.
 *
 * Conventions used throughout the app:
 * - Vectors are plain tuples. Topocentric vectors are **ENU**: x = east,
 *   y = north, z = up.
 * - Matrices are row-major tuples of nine numbers.
 * - Quaternions are `[w, x, y, z]`, unit length, and act on vectors as
 *   v' = q v q*. A quaternion "from frame A to frame B" turns a vector's
 *   A-coordinates into its B-coordinates.
 * - Angles are radians unless a name ends in `Deg`.
 */

export type Vec3 = [number, number, number]
export type Mat3 = [number, number, number, number, number, number, number, number, number]
export type Quat = [number, number, number, number]

export const DEG = Math.PI / 180
export const RAD = 180 / Math.PI

export const vec = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  norm: (a: Vec3): number => Math.hypot(a[0], a[1], a[2]),
  normalize(a: Vec3): Vec3 {
    const n = Math.hypot(a[0], a[1], a[2])
    return n > 0 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0]
  },
  /** Angle between two vectors, accurate for tiny and near-π angles alike
   *  (atan2 of |a×b| and a·b, unlike acos of the dot product). */
  angle(a: Vec3, b: Vec3): number {
    const c = vec.cross(a, b)
    return Math.atan2(Math.hypot(c[0], c[1], c[2]), vec.dot(a, b))
  },
}

export const mat3 = {
  identity: (): Mat3 => [1, 0, 0, 0, 1, 0, 0, 0, 1],
  mulVec: (m: Mat3, v: Vec3): Vec3 => [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ],
  mul(a: Mat3, b: Mat3): Mat3 {
    const r = new Array<number>(9) as Mat3
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        r[3 * i + j] = a[3 * i]! * b[j]! + a[3 * i + 1]! * b[3 + j]! + a[3 * i + 2]! * b[6 + j]!
      }
    }
    return r
  },
  transpose: (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]],
  /** The rotation matrix with these three rows. */
  fromRows: (a: Vec3, b: Vec3, c: Vec3): Mat3 => [...a, ...b, ...c],
}

export const quat = {
  identity: (): Quat => [1, 0, 0, 0],
  fromAxisAngle(axis: Vec3, angle: number): Quat {
    const [x, y, z] = vec.normalize(axis)
    const s = Math.sin(angle / 2)
    return [Math.cos(angle / 2), x * s, y * s, z * s]
  },
  /** Hamilton product: applying the result is applying `b`, then `a`. */
  mul: (a: Quat, b: Quat): Quat => [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ],
  conj: (q: Quat): Quat => [q[0], -q[1], -q[2], -q[3]],
  normalize(q: Quat): Quat {
    const n = Math.hypot(q[0], q[1], q[2], q[3])
    return n > 0 ? [q[0] / n, q[1] / n, q[2] / n, q[3] / n] : [1, 0, 0, 0]
  },
  rotate(q: Quat, v: Vec3): Vec3 {
    // v' = v + 2w(u×v) + 2u×(u×v), with u the vector part: no temporaries
    // beyond two crosses, which matters in the per-frame star loop.
    const [w, x, y, z] = q
    const tx = 2 * (y * v[2] - z * v[1])
    const ty = 2 * (z * v[0] - x * v[2])
    const tz = 2 * (x * v[1] - y * v[0])
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)]
  },
  toMat3(q: Quat): Mat3 {
    const [w, x, y, z] = q
    return [
      1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
      2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
      2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
    ]
  },
  fromMat3(m: Mat3): Quat {
    // Shepperd's method: branch on the largest diagonal term for stability.
    const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m
    const tr = m00 + m11 + m22
    let q: Quat
    if (tr > 0) {
      const s = Math.sqrt(tr + 1) * 2
      q = [0.25 * s, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s]
    } else if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1 + m00 - m11 - m22) * 2
      q = [(m21 - m12) / s, 0.25 * s, (m01 + m10) / s, (m02 + m20) / s]
    } else if (m11 > m22) {
      const s = Math.sqrt(1 + m11 - m00 - m22) * 2
      q = [(m02 - m20) / s, (m01 + m10) / s, 0.25 * s, (m12 + m21) / s]
    } else {
      const s = Math.sqrt(1 + m22 - m00 - m11) * 2
      q = [(m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, 0.25 * s]
    }
    return quat.normalize(q)
  },
  /** Spherical interpolation along the shorter arc. */
  slerp(a: Quat, b: Quat, t: number): Quat {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
    let bb = b
    if (d < 0) {
      d = -d
      bb = [-b[0], -b[1], -b[2], -b[3]]
    }
    if (d > 0.9995) {
      // Nearly parallel: lerp and renormalise avoids dividing by sin(~0).
      return quat.normalize([
        a[0] + t * (bb[0] - a[0]),
        a[1] + t * (bb[1] - a[1]),
        a[2] + t * (bb[2] - a[2]),
        a[3] + t * (bb[3] - a[3]),
      ])
    }
    const th = Math.acos(d)
    const s = Math.sin(th)
    const wa = Math.sin((1 - t) * th) / s
    const wb = Math.sin(t * th) / s
    return [wa * a[0] + wb * bb[0], wa * a[1] + wb * bb[1], wa * a[2] + wb * bb[2], wa * a[3] + wb * bb[3]]
  },
  /** Rotation angle between two orientations, in [0, π]. */
  angleBetween(a: Quat, b: Quat): number {
    const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])
    return 2 * Math.acos(Math.min(1, d))
  },
}

/** Wrap an angle in degrees into [0, 360). */
export function wrap360(deg: number): number {
  const r = deg % 360
  return r < 0 ? r + 360 : r
}

/** Wrap an angle in degrees into (-180, 180]. */
export function wrap180(deg: number): number {
  const r = wrap360(deg)
  return r > 180 ? r - 360 : r
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}
