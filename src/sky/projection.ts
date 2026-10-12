/**
 * Projections from sky directions (ENU vectors) to screen pixels and back.
 *
 * - PolarProjector: the sky map. Zenith at the centre, horizon on a circle,
 *   azimuthal equidistant (radius ∝ zenith distance), north up and east on
 *   the LEFT — the sky seen from below, as on a planisphere.
 * - PerspectiveProjector: a pinhole camera, for the planetarium and AR
 *   views. Its orientation is a quaternion taking camera-frame vectors to
 *   ENU; the camera frame is x right, y up, looking down −z (the WebGL and
 *   W3C device-orientation convention, which keeps the sensor maths simple).
 */
import { DEG, quat, RAD, type Quat, type Vec3 } from '../core/vec.ts'

export interface Point {
  x: number
  y: number
}

export interface Projector {
  readonly kind: 'polar' | 'perspective'
  readonly width: number
  readonly height: number
  /** Pixels per degree of sky at the centre of the view. */
  readonly pxPerDeg: number
  /** Project an ENU direction (any length). Returns false, leaving `out`
   *  untouched, if it cannot be drawn (behind a perspective camera). */
  project(v: Vec3, out: Point): boolean
  /** Unit ENU direction under a screen point, or null if there is none
   *  (outside the polar map's disc). */
  unproject(x: number, y: number): Vec3 | null
}

export class PolarProjector implements Projector {
  readonly kind = 'polar' as const
  readonly cx: number
  readonly cy: number
  /** Radius of the horizon circle, px. */
  readonly radius: number
  readonly pxPerDeg: number
  readonly width: number
  readonly height: number

  constructor(width: number, height: number, margin = 28) {
    this.width = width
    this.height = height
    this.cx = width / 2
    this.cy = height / 2
    this.radius = Math.max(10, Math.min(width, height) / 2 - margin)
    this.pxPerDeg = this.radius / 90
  }

  project(v: Vec3, out: Point): boolean {
    const h = Math.hypot(v[0], v[1])
    const zenithDist = Math.atan2(h, v[2]) * RAD // 0 at zenith, 90 at horizon
    const r = zenithDist * this.pxPerDeg
    if (h === 0) {
      out.x = this.cx
      out.y = this.cy
      return true
    }
    // East (v[0] > 0) goes left; north (v[1] > 0) goes up.
    out.x = this.cx - (r * v[0]) / h
    out.y = this.cy - (r * v[1]) / h
    return true
  }

  unproject(x: number, y: number): Vec3 | null {
    const dx = x - this.cx
    const dy = y - this.cy
    const r = Math.hypot(dx, dy)
    if (r > this.radius * 1.02) return null
    const z = (r / this.pxPerDeg) * DEG
    if (r === 0) return [0, 0, 1]
    const s = Math.sin(z)
    return [(-dx / r) * s, (-dy / r) * s, Math.cos(z)]
  }
}

export class PerspectiveProjector implements Projector {
  readonly kind = 'perspective' as const
  readonly width: number
  readonly height: number
  readonly cx: number
  readonly cy: number
  /** Focal length, px. */
  readonly f: number
  readonly pxPerDeg: number
  /** Camera → ENU. */
  readonly orientation: Quat
  /** ENU → camera. */
  private readonly inv: Quat

  /** `fovY` is the vertical field of view in degrees. */
  constructor(width: number, height: number, orientation: Quat, fovY: number) {
    this.width = width
    this.height = height
    this.cx = width / 2
    this.cy = height / 2
    this.f = height / 2 / Math.tan((fovY * DEG) / 2)
    this.pxPerDeg = this.f * DEG
    this.orientation = orientation
    this.inv = quat.conj(orientation)
  }

  /** Same camera, given the focal length directly (for a camera feed
   *  whose scale is set by the video, not by a chosen FOV). */
  static withFocal(width: number, height: number, orientation: Quat, f: number): PerspectiveProjector {
    const fovY = 2 * Math.atan(height / 2 / f) * RAD
    return new PerspectiveProjector(width, height, orientation, fovY)
  }

  /** Direction vector in the camera frame. */
  toCamera(v: Vec3): Vec3 {
    return quat.rotate(this.inv, v)
  }

  project(v: Vec3, out: Point): boolean {
    const c = quat.rotate(this.inv, v)
    // A small positive floor rather than 0: points at ~90° off-axis project
    // to near-infinite coordinates that canvas handles badly.
    if (c[2] > -1e-3 * Math.hypot(c[0], c[1], c[2])) return false
    const k = this.f / -c[2]
    out.x = this.cx + c[0] * k
    out.y = this.cy - c[1] * k
    return true
  }

  unproject(x: number, y: number): Vec3 {
    const d: Vec3 = [(x - this.cx) / this.f, -(y - this.cy) / this.f, -1]
    const n = Math.hypot(d[0], d[1], d[2])
    return quat.rotate(this.orientation, [d[0] / n, d[1] / n, d[2] / n])
  }

  /** The horizon as a screen line a·x + b·y + c = 0, with the ground where
   *  a·x + b·y + c < 0; null if the horizon plane is edge-on to the camera
   *  axis in a way that leaves no line (never, in practice). */
  horizonLine(): { a: number; b: number; c: number } {
    const n = quat.rotate(this.inv, [0, 0, 1]) // "up" in camera coordinates
    // A ray d(x, y) = ((x−cx)/f, −(y−cy)/f, −1) is above the horizon when
    // d·n > 0, which is linear in x and y.
    return {
      a: n[0] / this.f,
      b: -n[1] / this.f,
      c: (-n[0] * this.cx) / this.f + (n[1] * this.cy) / this.f - n[2],
    }
  }
}

/**
 * Camera orientation (camera → ENU) looking toward azimuth `az` and
 * elevation `el` (degrees) with the horizon level: the planetarium view.
 */
export function lookAt(az: number, el: number): Quat {
  // Base: looking north at the horizon. Camera x → east, y → up, z → south.
  const base = quat.fromMat3([1, 0, 0, 0, 0, -1, 0, 1, 0])
  const pitch = quat.fromAxisAngle([1, 0, 0], el * DEG)
  const yaw = quat.fromAxisAngle([0, 0, 1], -az * DEG)
  return quat.normalize(quat.mul(yaw, quat.mul(pitch, base)))
}

/** Azimuth and elevation (degrees) the camera looks toward. */
export function viewDirection(q: Quat): { az: number; el: number } {
  const d = quat.rotate(q, [0, 0, -1])
  const az = Math.atan2(d[0], d[1]) * RAD
  return { az: az < 0 ? az + 360 : az, el: Math.asin(Math.max(-1, Math.min(1, d[2]))) * RAD }
}
