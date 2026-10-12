/**
 * The natural sky: stars, constellation lines, the Sun, Moon and planets,
 * as ENU directions for an observer at an instant.
 *
 * Stars and constellation vertices are stored as J2000 unit vectors and
 * turned toward the observer by one rotation matrix per frame
 * (astronomy-engine's EQJ → HOR, which includes precession, nutation and
 * Earth rotation), so redrawing 3,000 stars costs 3,000 matrix-vector
 * products. Sun, Moon and planets come from astronomy-engine's
 * topocentric positions, which matters for the Moon: its parallax is up to
 * a degree.
 */
import { Body, Equator, Illumination, MakeTime, Observer as AeObserver, Rotation_EQJ_HOR, RotateVector, Vector } from 'astronomy-engine'
import type { Observer } from './frames.ts'
import { DEG, type Mat3, type Vec3 } from './vec.ts'
import skyData from '../data/sky.json'

export interface Star {
  /** J2000 unit vector. */
  v: Vec3
  mag: number
  /** B−V colour index. */
  bv: number
  name: string | null
}

export interface Constellation {
  id: string
  name: string
  /** J2000 unit vector for the label position. */
  label: Vec3
  /** Polylines of J2000 unit vectors. */
  lines: Vec3[][]
}

export function raDecToVector(raDeg: number, decDeg: number): Vec3 {
  const ra = raDeg * DEG
  const dec = decDeg * DEG
  const c = Math.cos(dec)
  return [c * Math.cos(ra), c * Math.sin(ra), Math.sin(dec)]
}

let stars: Star[] | null = null
let constellations: Constellation[] | null = null

/** The bright-star catalogue, brightest first. Built on first use. */
export function getStars(): Star[] {
  if (!stars) {
    const names = skyData.names as Record<string, string>
    stars = (skyData.stars as [number, number, number, number][]).map(([ra, dec, mag, bv], i) => ({
      v: raDecToVector(ra, dec),
      mag,
      bv,
      name: names[i] ?? null,
    }))
  }
  return stars
}

export function getConstellations(): Constellation[] {
  if (!constellations) {
    constellations = skyData.constellations.map((c) => ({
      id: c.id,
      name: c.name,
      label: raDecToVector(c.label[0]!, c.label[1]!),
      lines: c.lines.map((line) => line.map(([ra, dec]) => raDecToVector(ra!, dec!))),
    }))
  }
  return constellations
}

function aeObserver(o: Observer): AeObserver {
  return new AeObserver(o.latitude, o.longitude, o.height * 1000)
}

/**
 * Rotation from J2000 equatorial (EQJ) to the observer's ENU frame at
 * `ms`. astronomy-engine's horizontal frame is x = north, y = west,
 * z = up, so ENU = (−y, x, z).
 */
export function eqjToEnu(ms: number, observer: Observer): Mat3 {
  const rot = Rotation_EQJ_HOR(MakeTime(new Date(ms)), aeObserver(observer))
  const t = MakeTime(new Date(ms))
  const col = (x: number, y: number, z: number): Vec3 => {
    const h = RotateVector(rot, new Vector(x, y, z, t))
    return [-h.y, h.x, h.z]
  }
  // Columns are the images of the EQJ basis vectors.
  const cx = col(1, 0, 0)
  const cy = col(0, 1, 0)
  const cz = col(0, 0, 1)
  return [cx[0], cy[0], cz[0], cx[1], cy[1], cz[1], cx[2], cy[2], cz[2]]
}

export type BodyName = 'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn'

export interface BodyPosition {
  name: BodyName
  /** Topocentric ENU unit vector (geometric: no refraction). */
  v: Vec3
  mag: number
  /** Fraction of the disc lit (the Moon's phase), 0–1. */
  phase: number
  /** Apparent angular radius, degrees. */
  radius: number
  distanceKm: number
}

const BODIES: { name: BodyName; body: Body; radiusKm: number }[] = [
  { name: 'Sun', body: Body.Sun, radiusKm: 695_700 },
  { name: 'Moon', body: Body.Moon, radiusKm: 1_737.4 },
  { name: 'Mercury', body: Body.Mercury, radiusKm: 2_439.7 },
  { name: 'Venus', body: Body.Venus, radiusKm: 6_051.8 },
  { name: 'Mars', body: Body.Mars, radiusKm: 3_389.5 },
  { name: 'Jupiter', body: Body.Jupiter, radiusKm: 69_911 },
  { name: 'Saturn', body: Body.Saturn, radiusKm: 58_232 },
]

const KM_PER_AU = 149_597_870.7

/** Sun, Moon and naked-eye planets for the observer at `ms`. */
export function bodyPositions(ms: number, observer: Observer, toEnu: Mat3 = eqjToEnu(ms, observer)): BodyPosition[] {
  const time = MakeTime(new Date(ms))
  const obs = aeObserver(observer)
  return BODIES.map(({ name, body, radiusKm }) => {
    // J2000 (ofdate = false) so the same EQJ → ENU matrix as the stars
    // applies; aberration on, as for anything we compare with the eye.
    const eq = Equator(body, time, obs, false, true)
    const v = raDecToVector(eq.ra * 15, eq.dec)
    const enu: Vec3 = [
      toEnu[0] * v[0] + toEnu[1] * v[1] + toEnu[2] * v[2],
      toEnu[3] * v[0] + toEnu[4] * v[1] + toEnu[5] * v[2],
      toEnu[6] * v[0] + toEnu[7] * v[1] + toEnu[8] * v[2],
    ]
    const distanceKm = eq.dist * KM_PER_AU
    let mag = -26.74
    let phase = 1
    if (name !== 'Sun') {
      const ill = Illumination(body, time)
      mag = ill.mag
      phase = ill.phase_fraction
    }
    return { name, v: enu, mag, phase, radius: Math.asin(Math.min(1, radiusKm / distanceKm)) / DEG, distanceKm }
  })
}
