/**
 * A tracked object: its orbital elements (as a satellite.js SatRec) plus the
 * catalogue facts the UI shows, and SGP4 propagation by Julian date.
 */
import { json2satrec, sgp4, type OMMJsonObject, type SatRec } from 'satellite.js'
import type { Vec3 } from './vec.ts'

export type ObjectType = 'payload' | 'rocket-body' | 'debris' | 'unknown'

/** Where a standard magnitude came from, best first: McCants' list, a
 *  per-object estimate, a per-family default, a fit on radar size. */
export type MagnitudeSource = 'mccants' | 'estimate' | 'class' | 'rcs' | 'none'

export interface SatelliteInfo {
  norad: number
  name: string
  /** International designator, e.g. "1998-067A". */
  intlDes: string
  type: ObjectType
  /** SATCAT owner code, e.g. "US", "PRC", "ISS". */
  owner: string
  /** Launch date as YYYY-MM-DD, or "" if unknown. */
  launch: string
  /** Standard magnitude: brightness at 1000 km range, half illuminated. */
  stdMag: number | null
  magSource: MagnitudeSource
  /** CelesTrak groups the object was listed in (e.g. "stations", "visual"). */
  groups: string[]
  /** For a module or spacecraft docked to a station, the station's NORAD
   *  number: it shares the station's orbit, so it is not drawn itself. */
  dockedTo: number | null
}

export interface Satellite extends SatelliteInfo {
  satrec: SatRec
  /** Element set epoch as a Julian date. */
  epochJd: number
}

/** Julian date of a Unix time in milliseconds. */
export function jdFromMs(ms: number): number {
  return ms / 86_400_000 + 2_440_587.5
}

export function msFromJd(jd: number): number {
  return (jd - 2_440_587.5) * 86_400_000
}

export function makeSatellite(info: SatelliteInfo, omm: OMMJsonObject): Satellite {
  const satrec = json2satrec(omm)
  return { ...info, satrec, epochJd: satrec.jdsatepoch }
}

export interface StateVector {
  /** TEME position, km. */
  p: Vec3
  /** TEME velocity, km/s. */
  v: Vec3
}

/**
 * SGP4 state at a Julian date, or null when the model fails (decayed,
 * eccentricity out of range…). satellite.js returns `null` for those; it
 * also sets `satrec.error`, which callers can inspect.
 */
export function propagateJd(sat: Satellite, jd: number): StateVector | null {
  const r = sgp4(sat.satrec, (jd - sat.epochJd) * 1440)
  if (!r) return null
  const { position: p, velocity: v } = r
  // NaN slips through for a few pathological element sets; treat as failure.
  if (!Number.isFinite(p.x)) return null
  return { p: [p.x, p.y, p.z], v: [v.x, v.y, v.z] }
}

/** Revolutions per day, from the SatRec's mean motion (radians/minute). */
export function revsPerDay(sat: Satellite): number {
  return (sat.satrec.no * 1440) / (2 * Math.PI)
}

/** Age of the element set at `jd`, days (negative if the epoch is later). */
export function elementAgeDays(sat: Satellite, jd: number): number {
  return jd - sat.epochJd
}
