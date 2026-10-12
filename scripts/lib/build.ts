/**
 * Turns downloaded CelesTrak groups plus catalogue metadata into the packs
 * the app loads. Pure: no I/O, so the rules are unit-tested.
 */
import { encodeRow, PACK_FIELDS, PACK_FORMAT, type PackFile } from '../../src/data/pack.ts'
import type { MagnitudeSource } from '../../src/core/satellite.ts'
import { fitLine, type McCantsEntry, type SatcatEntry } from './parse.ts'

export interface PackDefinition {
  id: string
  title: string
  description: string
  default: boolean
  /** CelesTrak GP groups merged into this pack. */
  groups: string[]
}

/** One element set as CelesTrak's OMM JSON gives it. */
export interface CelestrakOmm {
  OBJECT_NAME: string
  OBJECT_ID: string
  EPOCH: string
  MEAN_MOTION: number
  ECCENTRICITY: number
  INCLINATION: number
  RA_OF_ASC_NODE: number
  ARG_OF_PERICENTER: number
  MEAN_ANOMALY: number
  NORAD_CAT_ID: number
  ELEMENT_SET_NO: number
  REV_AT_EPOCH: number
  BSTAR: number
  MEAN_MOTION_DOT: number
  MEAN_MOTION_DDOT: number
}

/**
 * Standard magnitudes by name, for families McCants lists without one.
 * Rough: these satellites' brightness depends heavily on attitude.
 * - Starlink: Mallama's measurements of visored V1.5 and V2 Mini put the
 *   1000-km magnitude around 5–7; trains days after launch are far
 *   brighter (often 2–3) while they fly low and edge-on.
 * - OneWeb: ~7.5 at 1000 km (Mallama 2022, 1200 km shells).
 */
export const CLASS_MAGNITUDES: { pattern: RegExp; mag: number }[] = [
  { pattern: /^STARLINK/i, mag: 5.5 },
  { pattern: /^ONEWEB/i, mag: 7.5 },
  { pattern: /^KUIPER/i, mag: 6.5 },
]

/** Element sets older than this are almost always lost or decaying
 *  objects, and SGP4 puts them wildly wrong. */
export const MAX_EPOCH_AGE_DAYS = 30

export interface MagnitudeModel {
  /** stdMag ≈ a + b·log10(RCS m²), fitted on McCants' list. */
  a: number
  b: number
  rms: number
  n: number
}

/** Fit standard magnitude against log radar cross-section over every
 *  McCants entry that has both. A crude proxy — radar and optical size
 *  differ — but far better than nothing for the thousands of objects
 *  McCants never observed. */
export function fitMagnitudeModel(mccants: Map<number, McCantsEntry>): MagnitudeModel {
  const xs: number[] = []
  const ys: number[] = []
  for (const e of mccants.values()) {
    if (e.mag !== null && e.rcs !== null) {
      xs.push(Math.log10(e.rcs))
      ys.push(e.mag)
    }
  }
  return fitLine(xs, ys)
}

export function standardMagnitude(
  norad: number,
  name: string,
  mccants: Map<number, McCantsEntry>,
  satcat: Map<number, SatcatEntry>,
  model: MagnitudeModel,
): { stdMag: number | null; source: MagnitudeSource } {
  const m = mccants.get(norad)
  if (m?.mag != null) return { stdMag: m.mag, source: 'mccants' }
  for (const c of CLASS_MAGNITUDES) if (c.pattern.test(name)) return { stdMag: c.mag, source: 'class' }
  const rcs = m?.rcs ?? satcat.get(norad)?.rcs ?? null
  if (rcs !== null) {
    const est = model.a + model.b * Math.log10(rcs)
    return { stdMag: Math.round(est * 10) / 10, source: 'rcs' }
  }
  return { stdMag: null, source: 'none' }
}

/** Why an element set was dropped, for the build log. */
export type Rejection = 'invalid' | 'stale' | 'decayed'

export function validateOmm(o: CelestrakOmm, nowMs: number, satcat: Map<number, SatcatEntry>): Rejection | null {
  const nums = [
    o.MEAN_MOTION, o.ECCENTRICITY, o.INCLINATION, o.RA_OF_ASC_NODE,
    o.ARG_OF_PERICENTER, o.MEAN_ANOMALY, o.BSTAR, o.NORAD_CAT_ID,
  ]
  if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return 'invalid'
  if (o.MEAN_MOTION <= 0 || o.ECCENTRICITY < 0 || o.ECCENTRICITY >= 1) return 'invalid'
  if (typeof o.OBJECT_NAME !== 'string' || typeof o.EPOCH !== 'string') return 'invalid'
  // CelesTrak's EPOCH has no zone suffix; it is UTC.
  const epochMs = Date.parse(o.EPOCH.endsWith('Z') ? o.EPOCH : `${o.EPOCH}Z`)
  if (!Number.isFinite(epochMs)) return 'invalid'
  if ((nowMs - epochMs) / 86_400_000 > MAX_EPOCH_AGE_DAYS) return 'stale'
  if (satcat.get(o.NORAD_CAT_ID)?.decayed) return 'decayed'
  return null
}

export interface BuildInput {
  definitions: PackDefinition[]
  /** Downloaded groups; a group missing here was not available. */
  groups: Map<string, CelestrakOmm[]>
  satcat: Map<number, SatcatEntry>
  mccants: Map<number, McCantsEntry>
  nowMs: number
}

export interface BuildResult {
  packs: { definition: PackDefinition; file: PackFile }[]
  model: MagnitudeModel
  rejected: Record<Rejection, number>
  magnitudeSources: Record<MagnitudeSource, number>
  /** Packs skipped because none of their groups downloaded. */
  skipped: string[]
}

export function buildPacks(input: BuildInput): BuildResult {
  const { definitions, groups, satcat, mccants, nowMs } = input
  const model = fitMagnitudeModel(mccants)
  const rejected: Record<Rejection, number> = { invalid: 0, stale: 0, decayed: 0 }
  const magnitudeSources: Record<MagnitudeSource, number> = { mccants: 0, rcs: 0, class: 0, none: 0 }

  // Every group each object appears in, across all downloads, so a
  // satellite in both "stations" and "visual" carries both tags.
  const tags = new Map<number, Set<string>>()
  for (const [g, list] of groups) {
    for (const o of list) {
      let s = tags.get(o.NORAD_CAT_ID)
      if (!s) tags.set(o.NORAD_CAT_ID, (s = new Set()))
      s.add(g)
    }
  }

  const generated = new Date(nowMs).toISOString()
  const packs: BuildResult['packs'] = []
  const skipped: string[] = []
  const counted = new Set<number>()
  for (const def of definitions) {
    const available = def.groups.filter((g) => groups.has(g))
    if (available.length === 0) {
      skipped.push(def.id)
      continue
    }
    const seen = new Set<number>()
    const rows = []
    for (const g of available) {
      for (const o of groups.get(g)!) {
        if (seen.has(o.NORAD_CAT_ID)) continue
        seen.add(o.NORAD_CAT_ID)
        const why = validateOmm(o, nowMs, satcat)
        if (why) {
          if (!counted.has(o.NORAD_CAT_ID)) rejected[why]++
          counted.add(o.NORAD_CAT_ID)
          continue
        }
        const cat = satcat.get(o.NORAD_CAT_ID)
        const { stdMag, source } = standardMagnitude(o.NORAD_CAT_ID, o.OBJECT_NAME, mccants, satcat, model)
        if (!counted.has(o.NORAD_CAT_ID)) magnitudeSources[source]++
        counted.add(o.NORAD_CAT_ID)
        rows.push(
          encodeRow({
            norad: o.NORAD_CAT_ID,
            name: o.OBJECT_NAME.trim(),
            intlDes: o.OBJECT_ID,
            epoch: o.EPOCH,
            meanMotion: o.MEAN_MOTION,
            eccentricity: o.ECCENTRICITY,
            inclination: o.INCLINATION,
            raan: o.RA_OF_ASC_NODE,
            argPericenter: o.ARG_OF_PERICENTER,
            meanAnomaly: o.MEAN_ANOMALY,
            bstar: o.BSTAR,
            meanMotionDot: o.MEAN_MOTION_DOT,
            meanMotionDdot: o.MEAN_MOTION_DDOT,
            elementSetNo: o.ELEMENT_SET_NO,
            revAtEpoch: o.REV_AT_EPOCH,
            type: cat?.type ?? 'unknown',
            owner: cat?.owner ?? '',
            launch: cat?.launch ?? '',
            stdMag,
            magSource: source,
            groups: [...(tags.get(o.NORAD_CAT_ID) ?? [])].sort(),
          }),
        )
      }
    }
    packs.push({ definition: def, file: { format: PACK_FORMAT, id: def.id, generated, fields: PACK_FIELDS, rows } })
  }
  return { packs, model, rejected, magnitudeSources, skipped }
}
