/**
 * Observer, horizontal coordinates and the TEME → topocentric ENU transform.
 *
 * SGP4 outputs positions in TEME, a true-equator, mean-equinox frame. The
 * standard route to Earth-fixed coordinates is a rotation about the pole by
 * GMST (the "pseudo Earth-fixed" frame); polar motion (< 0.5″, a few metres)
 * and UT1−UTC (< 0.9 s of Earth rotation) are ignored, both far below what a
 * phone sensor can resolve. tools/reference/ checks the whole chain against
 * Skyfield, which does the full IERS treatment.
 */
import { DEG, RAD, type Mat3, type Vec3, wrap360 } from './vec.ts'

/** Where the user stands. Degrees, and kilometres above the WGS84 ellipsoid. */
export interface Observer {
  latitude: number
  longitude: number
  height: number
}

/** Horizontal coordinates in degrees: azimuth from north through east. */
export interface Horizontal {
  az: number
  el: number
}

const WGS84_A = 6378.137
const WGS84_F = 1 / 298.257223563
const WGS84_E2 = WGS84_F * (2 - WGS84_F)
/** Earth's rotation rate, rad/s (IERS). */
export const EARTH_ROTATION = 7.292115e-5

/** Observer position in Earth-fixed (ECF) km. */
export function observerEcf(o: Observer): Vec3 {
  const lat = o.latitude * DEG
  const lon = o.longitude * DEG
  const sinLat = Math.sin(lat)
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat)
  const r = (n + o.height) * Math.cos(lat)
  return [r * Math.cos(lon), r * Math.sin(lon), (n * (1 - WGS84_E2) + o.height) * sinLat]
}

/** Rows are the east, north and up unit vectors in ECF, so multiplying an
 *  ECF difference vector by this matrix gives its ENU components. */
export function ecfToEnuMatrix(o: Observer): Mat3 {
  const lat = o.latitude * DEG
  const lon = o.longitude * DEG
  const sl = Math.sin(lat)
  const cl = Math.cos(lat)
  const so = Math.sin(lon)
  const co = Math.cos(lon)
  return [-so, co, 0, -sl * co, -sl * so, cl, cl * co, cl * so, sl]
}

export function horizontalToEnu(az: number, el: number): Vec3 {
  const a = az * DEG
  const e = el * DEG
  const ce = Math.cos(e)
  return [ce * Math.sin(a), ce * Math.cos(a), Math.sin(e)]
}

/** Any (not necessarily unit) ENU vector to azimuth/elevation in degrees. */
export function enuToHorizontal(v: Vec3): Horizontal {
  const h = Math.hypot(v[0], v[1])
  return { az: wrap360(Math.atan2(v[0], v[1]) * RAD), el: Math.atan2(v[2], h) * RAD }
}

/**
 * A precomputed observer frame for fast, allocation-free conversion of many
 * TEME state vectors per tick. Construct once per observer, call `setTime`
 * once per tick, then `toEnu` per satellite.
 */
export class TopocentricFrame {
  readonly observer: Observer
  readonly ecf: Vec3
  readonly enu: Mat3
  private cg = 1
  private sg = 0

  constructor(observer: Observer) {
    this.observer = observer
    this.ecf = observerEcf(observer)
    this.enu = ecfToEnuMatrix(observer)
  }

  /** Set Greenwich mean sidereal time, radians (satellite.js `gstime`). */
  setGmst(gmst: number): void {
    this.cg = Math.cos(gmst)
    this.sg = Math.sin(gmst)
  }

  /**
   * TEME position (km) and velocity (km/s) to the observer's ENU position
   * (km) and ENU velocity (km/s), written into `out` at `offset`:
   * [e, n, u, ve, vn, vu]. The velocity is relative to the rotating Earth,
   * i.e. how the satellite moves across *this observer's* sky.
   */
  toEnu(p: Vec3, v: Vec3 | null, out: Float32Array | Float64Array | number[], offset = 0): void {
    const { cg, sg, ecf, enu: m } = this
    // TEME → ECF: rotate by −GMST about z.
    const x = p[0] * cg + p[1] * sg
    const y = -p[0] * sg + p[1] * cg
    const z = p[2]
    const dx = x - ecf[0]
    const dy = y - ecf[1]
    const dz = z - ecf[2]
    out[offset] = m[0] * dx + m[1] * dy + m[2] * dz
    out[offset + 1] = m[3] * dx + m[4] * dy + m[5] * dz
    out[offset + 2] = m[6] * dx + m[7] * dy + m[8] * dz
    if (!v) return
    // Velocity in the rotating frame: R(v) − ω × r_ecf.
    const vx = v[0] * cg + v[1] * sg + EARTH_ROTATION * y
    const vy = -v[0] * sg + v[1] * cg - EARTH_ROTATION * x
    const vz = v[2]
    out[offset + 3] = m[0] * vx + m[1] * vy + m[2] * vz
    out[offset + 4] = m[3] * vx + m[4] * vy + m[5] * vz
    out[offset + 5] = m[6] * vx + m[7] * vy + m[8] * vz
  }

  /** TEME vector to ECF (no translation), for directions such as the Sun's. */
  temeToEcf(p: Vec3): Vec3 {
    return [p[0] * this.cg + p[1] * this.sg, -p[0] * this.sg + p[1] * this.cg, p[2]]
  }
}

/**
 * Atmospheric refraction: how much higher an object appears than its
 * geometric elevation, degrees. Sæmundsson's formula (the inverse of
 * Bennett's), for 10 °C and 1010 hPa; it is good to ~0.1′ above 15° and
 * ~1′ near the horizon, where 0.5° of lift is a visible fraction of a phone
 * screen. Below −1° the value is held so the curve stays continuous.
 */
export function refraction(geometricElDeg: number): number {
  const h = Math.max(geometricElDeg, -1)
  const arcmin = 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * DEG)
  return Math.max(arcmin, 0) / 60
}

/** Great-circle separation between two horizontal positions, degrees. */
export function separation(a: Horizontal, b: Horizontal): number {
  const va = horizontalToEnu(a.az, a.el)
  const vb = horizontalToEnu(b.az, b.el)
  const c: Vec3 = [va[1] * vb[2] - va[2] * vb[1], va[2] * vb[0] - va[0] * vb[2], va[0] * vb[1] - va[1] * vb[0]]
  return Math.atan2(Math.hypot(...c), va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]) * RAD
}
