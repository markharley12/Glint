/**
 * Where the phone is pointing, from whichever sensor API the browser has.
 *
 * Best first:
 * 1. AbsoluteOrientationSensor (Generic Sensor API; Chrome on Android): a
 *    fused quaternion relative to magnetic north, no gimbal lock.
 * 2. `deviceorientationabsolute` events (Chrome, Firefox on Android).
 * 3. iOS Safari: `deviceorientation` after DeviceOrientationEvent.
 *    requestPermission() (which must be called from a tap), using the gyro's
 *    relative alpha for smoothness and webkitCompassHeading to anchor it to
 *    north (see HeadingOffset).
 * 4. Plain `deviceorientation` with `absolute: false`: orientation works
 *    but north is arbitrary, so only calibration can fix the heading.
 *
 * The output is a device → Earth quaternion relative to MAGNETIC north; the
 * AR view applies screen orientation, declination and calibration.
 */
import { signal } from '@preact/signals'
import type { Quat } from '../core/vec.ts'
import { HeadingOffset, quatFromEuler } from './orientation-math.ts'

export type OrientationKind = 'sensor' | 'absolute-event' | 'ios-compass' | 'relative'
export type OrientationStatus = 'idle' | 'starting' | 'active' | 'denied' | 'unavailable'

export interface OrientationSample {
  /** Device → Earth (ENU, magnetic north). */
  q: Quat
  /** performance.now() / 1000. */
  t: number
}

// Minimal typings for APIs the DOM lib lacks.
interface SensorLike extends EventTarget {
  start(): void
  stop(): void
  quaternion?: number[]
}
type SensorCtor = new (opts: { frequency: number; referenceFrame: 'device' | 'screen' }) => SensorLike
interface IosOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number
  webkitCompassAccuracy?: number
}
type PermissionFn = () => Promise<'granted' | 'denied'>

export class OrientationSource {
  readonly status = signal<OrientationStatus>('idle')
  readonly kind = signal<OrientationKind | null>(null)
  /** iOS's compass accuracy in degrees (±), when it reports one. */
  readonly accuracy = signal<number | null>(null)
  latest: OrientationSample | null = null

  private cleanup: (() => void) | null = null
  private heading = new HeadingOffset()

  /** Start listening. Call from a user gesture: iOS only shows its
   *  permission prompt in response to one. */
  async start(): Promise<void> {
    this.stop()
    this.status.value = 'starting'
    if (await this.tryGenericSensor()) return
    if (!(await this.requestIosPermission())) {
      this.status.value = 'denied'
      return
    }
    this.listenToEvents()
  }

  stop(): void {
    this.cleanup?.()
    this.cleanup = null
    this.latest = null
    this.heading = new HeadingOffset()
    this.status.value = 'idle'
    this.kind.value = null
  }

  private publish(q: Quat): void {
    this.latest = { q, t: performance.now() / 1000 }
    if (this.status.peek() !== 'active') this.status.value = 'active'
  }

  private async tryGenericSensor(): Promise<boolean> {
    const Ctor = (globalThis as unknown as { AbsoluteOrientationSensor?: SensorCtor }).AbsoluteOrientationSensor
    if (!Ctor) return false
    try {
      // Chrome wants all three granted; querying is what triggers its
      // (usually silent) grant on Android.
      const names = ['accelerometer', 'gyroscope', 'magnetometer'] as const
      const states = await Promise.all(names.map((name) => navigator.permissions.query({ name: name as PermissionName }).catch(() => null)))
      if (states.some((s) => s?.state === 'denied')) return false
    } catch {
      // Permissions API unsupported for these names: try the sensor anyway.
    }
    return new Promise<boolean>((resolve) => {
      let settled = false
      let sensor: SensorLike
      try {
        sensor = new Ctor({ frequency: 60, referenceFrame: 'device' })
      } catch {
        resolve(false)
        return
      }
      const onReading = () => {
        const q = sensor.quaternion
        if (!q || q.length !== 4) return
        // The sensor's quaternion is [x, y, z, w]; ours is [w, x, y, z].
        this.publish([q[3]!, q[0]!, q[1]!, q[2]!])
        if (!settled) {
          settled = true
          this.kind.value = 'sensor'
          resolve(true)
        }
      }
      const onError = () => {
        sensor.stop()
        if (!settled) {
          settled = true
          resolve(false)
        }
      }
      sensor.addEventListener('reading', onReading)
      sensor.addEventListener('error', onError)
      this.cleanup = () => {
        sensor.removeEventListener('reading', onReading)
        sensor.removeEventListener('error', onError)
        sensor.stop()
      }
      sensor.start()
      // No reading within two seconds: fall back to events.
      setTimeout(() => {
        if (!settled) {
          settled = true
          this.cleanup?.()
          this.cleanup = null
          resolve(false)
        }
      }, 2000)
    })
  }

  private async requestIosPermission(): Promise<boolean> {
    const req = (DeviceOrientationEvent as unknown as { requestPermission?: PermissionFn }).requestPermission
    if (typeof req !== 'function') return true // not iOS: nothing to ask
    try {
      return (await req()) === 'granted'
    } catch {
      return false
    }
  }

  private listenToEvents(): void {
    let gotAbsolute = false
    const onAbsolute = (e: DeviceOrientationEvent) => {
      if (e.alpha === null || e.beta === null || e.gamma === null) return
      gotAbsolute = true
      this.kind.value = 'absolute-event'
      this.publish(quatFromEuler(e.alpha, e.beta, e.gamma))
    }
    const onRelative = (ev: DeviceOrientationEvent) => {
      if (gotAbsolute) return // the absolute stream is better; ignore this one
      const e = ev as IosOrientationEvent
      if (e.alpha === null || e.beta === null || e.gamma === null) return
      if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) {
        const offset = this.heading.update(e.alpha, e.webkitCompassHeading, performance.now() / 1000)
        this.kind.value = 'ios-compass'
        this.accuracy.value = typeof e.webkitCompassAccuracy === 'number' && e.webkitCompassAccuracy >= 0 ? e.webkitCompassAccuracy : null
        this.publish(quatFromEuler(e.alpha + offset, e.beta, e.gamma))
      } else {
        this.kind.value = e.absolute ? 'absolute-event' : 'relative'
        this.publish(quatFromEuler(e.alpha, e.beta, e.gamma))
      }
    }
    window.addEventListener('deviceorientationabsolute', onAbsolute as EventListener)
    window.addEventListener('deviceorientation', onRelative)
    const timer = setTimeout(() => {
      if (!this.latest) this.status.value = 'unavailable'
    }, 2500)
    this.cleanup = () => {
      clearTimeout(timer)
      window.removeEventListener('deviceorientationabsolute', onAbsolute as EventListener)
      window.removeEventListener('deviceorientation', onRelative)
    }
  }
}

/** The screen's rotation from the device's natural orientation, degrees. */
export function screenAngle(): number {
  const a = screen.orientation?.angle
  if (typeof a === 'number') return a
  // Old iOS: window.orientation, where −90 means 270.
  const legacy = (window as unknown as { orientation?: number }).orientation
  return typeof legacy === 'number' ? (legacy + 360) % 360 : 0
}
