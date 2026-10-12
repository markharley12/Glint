/**
 * Device orientation maths, free of browser APIs so it can be tested.
 *
 * Frames:
 * - Earth: ENU (x east, y north, z up), as the W3C DeviceOrientation spec
 *   and the Generic Sensor API both define it.
 * - Device: x to the right of the screen, y to its top, z out of the
 *   screen toward the user, in the device's natural (portrait) orientation.
 * - Screen: the device frame turned so x/y match the screen as currently
 *   displayed (portrait or landscape).
 *
 * The rear camera looks down −z, which is also the PerspectiveProjector's
 * camera convention, so a screen → Earth quaternion IS the camera
 * orientation the AR view needs. No extra axis swap.
 */
import { DEG, quat, type Quat } from '../core/vec.ts'

const X: [number, number, number] = [1, 0, 0]
const Y: [number, number, number] = [0, 1, 0]
const Z: [number, number, number] = [0, 0, 1]

/**
 * Device → Earth quaternion from DeviceOrientationEvent angles (degrees).
 * The spec's rotation is intrinsic Z-X'-Y'': R = Rz(α)·Rx(β)·Ry(γ).
 */
export function quatFromEuler(alpha: number, beta: number, gamma: number): Quat {
  return quat.mul(quat.mul(quat.fromAxisAngle(Z, alpha * DEG), quat.fromAxisAngle(X, beta * DEG)), quat.fromAxisAngle(Y, gamma * DEG))
}

/**
 * Screen → Earth from device → Earth, given `screen.orientation.angle`
 * (degrees; 90 when the device is turned counter-clockwise into
 * landscape). Screen coordinates are the device's rotated by −angle about z.
 */
export function screenAdjust(deviceToEarth: Quat, screenAngle: number): Quat {
  return quat.mul(deviceToEarth, quat.fromAxisAngle(Z, -screenAngle * DEG))
}

/**
 * Apply heading and pitch corrections to a camera (screen → Earth)
 * orientation.
 * - `yawDeg` turns the view clockwise as seen from above: magnetic
 *   declination (east positive) plus any calibration offset. A camera the
 *   sensors say faces azimuth A is taken to face A + yaw.
 * - `pitchDeg` tilts the camera up about its own horizontal axis.
 */
export function correct(q: Quat, yawDeg: number, pitchDeg: number): Quat {
  let r = quat.mul(quat.fromAxisAngle(Z, -yawDeg * DEG), q)
  if (pitchDeg) r = quat.mul(r, quat.fromAxisAngle(X, pitchDeg * DEG))
  return quat.normalize(r)
}

/** Compass heading (degrees clockwise from north) of a device → Earth
 *  orientation in the spec's sense: 360° − α. */
export function headingFromAlpha(alpha: number): number {
  return (((360 - alpha) % 360) + 360) % 360
}

/** Signed smallest difference a − b between two angles, degrees. */
export function angleDiff(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180
}

/**
 * Adaptive smoothing for a stream of orientations ("one-euro" style): heavy
 * smoothing when the phone is held still, so labels don't shimmer with
 * sensor noise, and little when it moves fast, so they don't lag.
 */
export class OrientationFilter {
  private q: Quat | null = null
  private t = 0
  /** Time constant when still, seconds. */
  private readonly slow: number
  /** Time constant at and above `fastRate`, seconds. */
  private readonly fast: number
  /** Angular speed (rad/s) treated as fast. */
  private readonly fastRate: number

  constructor(slow = 0.25, fast = 0.025, fastRate = 1.5) {
    this.slow = slow
    this.fast = fast
    this.fastRate = fastRate
  }

  reset(): void {
    this.q = null
  }

  /** Feed a raw sample taken at `tSec`; returns the smoothed orientation. */
  update(sample: Quat, tSec: number): Quat {
    if (!this.q) {
      this.q = sample
      this.t = tSec
      return sample
    }
    const dt = Math.max(1e-3, Math.min(0.5, tSec - this.t))
    this.t = tSec
    const rate = quat.angleBetween(this.q, sample) / dt
    const k = Math.min(1, rate / this.fastRate)
    const tau = this.slow + (this.fast - this.slow) * k
    const a = 1 - Math.exp(-dt / tau)
    this.q = quat.slerp(this.q, sample, a)
    return this.q
  }
}

/**
 * Tracks the offset between iOS's gyro-based (relative) alpha and the
 * compass, so orientation can use the smooth gyro and still point north.
 * The offset follows the compass with a time constant of a few seconds,
 * which hides compass jitter but lets gyro drift be corrected.
 */
export class HeadingOffset {
  private offset: number | null = null
  private t = 0
  private readonly tau: number

  constructor(tau = 3) {
    this.tau = tau
  }

  get value(): number | null {
    return this.offset
  }

  /**
   * @param alpha the event's relative alpha, degrees
   * @param compassHeading webkitCompassHeading, degrees clockwise from
   *   magnetic north; Apple defines it as the spec's absolute alpha, i.e.
   *   heading = 360 − α_absolute
   */
  update(alpha: number, compassHeading: number, tSec: number): number {
    const target = angleDiff(360 - compassHeading, alpha)
    if (this.offset === null) {
      this.offset = target
    } else {
      const dt = Math.max(0, Math.min(1, tSec - this.t))
      const a = 1 - Math.exp(-dt / this.tau)
      this.offset = this.offset + a * angleDiff(target, this.offset)
    }
    this.t = tSec
    return this.offset
  }
}
