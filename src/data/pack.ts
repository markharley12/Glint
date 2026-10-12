/**
 * The orbit-data files the app downloads: one small index plus one "pack"
 * per selectable set of satellites (bright & notable, Starlink, GNSS…).
 *
 * scripts/fetch-data.ts writes them; the app reads them. This module is the
 * contract between the two, so it is plain TypeScript with no runtime
 * imports — Node runs it directly when the script imports it.
 *
 * A pack stores rows of positional arrays rather than CelesTrak's OMM
 * objects: Starlink alone is 11,000 satellites, and repeating 20 key names
 * per satellite tripled the file. `fields` names the columns, so readers
 * look columns up by name and old clients keep working if columns are
 * added.
 */
import type { MagnitudeSource, ObjectType, SatelliteInfo } from '../core/satellite.ts'

export const PACK_FORMAT = 1

/** Column names, in the order the writer emits them. */
export const PACK_FIELDS = [
  'norad',
  'name',
  'intlDes',
  'epoch',
  'meanMotion',
  'eccentricity',
  'inclination',
  'raan',
  'argPericenter',
  'meanAnomaly',
  'bstar',
  'meanMotionDot',
  'meanMotionDdot',
  'elementSetNo',
  'revAtEpoch',
  'type',
  'owner',
  'launch',
  'stdMag',
  'magSource',
  'groups',
  'dockedTo',
] as const

export type PackField = (typeof PACK_FIELDS)[number]
export type PackRow = (string | number | null | string[])[]

export interface PackFile {
  format: number
  id: string
  /** ISO time the pack was built. */
  generated: string
  fields: readonly string[]
  rows: PackRow[]
}

export interface PackSummary {
  id: string
  title: string
  description: string
  /** Shown on first launch without the user choosing. */
  default: boolean
  count: number
  /** File name relative to the index. */
  file: string
  bytes: number
  /** Size gzipped, as the browser will download it from most hosts. */
  gzipBytes?: number
}

export interface DataIndex {
  format: number
  generated: string
  /** Human-readable credits for the data, shown in the app's About panel. */
  sources: string[]
  packs: PackSummary[]
}

/** A satellite's orbital elements in CelesTrak's OMM JSON shape, which is
 *  what satellite.js's json2satrec takes. */
export interface OmmElements {
  OBJECT_NAME: string
  OBJECT_ID: string
  EPOCH: string
  MEAN_MOTION: number
  ECCENTRICITY: number
  INCLINATION: number
  RA_OF_ASC_NODE: number
  ARG_OF_PERICENTER: number
  MEAN_ANOMALY: number
  EPHEMERIS_TYPE: 0
  CLASSIFICATION_TYPE: 'U'
  NORAD_CAT_ID: number
  ELEMENT_SET_NO: number
  REV_AT_EPOCH: number
  BSTAR: number
  MEAN_MOTION_DOT: number
  MEAN_MOTION_DDOT: number
}

export interface DecodedRow {
  info: SatelliteInfo
  omm: OmmElements
}

const OBJECT_TYPES: Record<string, ObjectType> = {
  payload: 'payload',
  'rocket-body': 'rocket-body',
  debris: 'debris',
}

const MAG_SOURCES: Record<string, MagnitudeSource> = { mccants: 'mccants', estimate: 'estimate', class: 'class', rcs: 'rcs' }

/**
 * Build a function that decodes rows of a pack with these `fields`. Throws
 * if a column the app cannot do without is missing; optional columns
 * default sensibly.
 */
export function rowDecoder(fields: readonly string[]): (row: PackRow) => DecodedRow {
  const at = new Map(fields.map((f, i) => [f, i]))
  const required: PackField[] = [
    'norad', 'name', 'epoch', 'meanMotion', 'eccentricity', 'inclination',
    'raan', 'argPericenter', 'meanAnomaly', 'bstar',
  ]
  for (const f of required) if (!at.has(f)) throw new Error(`Pack is missing the "${f}" column`)
  const idx = (f: PackField) => at.get(f) ?? -1
  const iNorad = idx('norad'), iName = idx('name'), iIntl = idx('intlDes'), iEpoch = idx('epoch')
  const iN = idx('meanMotion'), iE = idx('eccentricity'), iI = idx('inclination'), iRaan = idx('raan')
  const iArgp = idx('argPericenter'), iM = idx('meanAnomaly'), iBstar = idx('bstar')
  const iNdot = idx('meanMotionDot'), iNddot = idx('meanMotionDdot'), iElset = idx('elementSetNo')
  const iRev = idx('revAtEpoch'), iType = idx('type'), iOwner = idx('owner'), iLaunch = idx('launch')
  const iMag = idx('stdMag'), iMagSrc = idx('magSource'), iGroups = idx('groups'), iDocked = idx('dockedTo')

  const num = (row: PackRow, i: number, fallback = 0): number => {
    const v = i >= 0 ? row[i] : undefined
    return typeof v === 'number' ? v : fallback
  }
  const str = (row: PackRow, i: number): string => {
    const v = i >= 0 ? row[i] : undefined
    return typeof v === 'string' ? v : ''
  }

  return (row) => {
    const norad = num(row, iNorad)
    const name = str(row, iName)
    const intlDes = str(row, iIntl)
    const mag = iMag >= 0 ? row[iMag] : null
    const groups = iGroups >= 0 ? row[iGroups] : null
    const stdMag = typeof mag === 'number' ? mag : null
    return {
      info: {
        norad,
        name,
        intlDes,
        type: OBJECT_TYPES[str(row, iType)] ?? 'unknown',
        owner: str(row, iOwner),
        launch: str(row, iLaunch),
        stdMag,
        magSource: stdMag === null ? 'none' : (MAG_SOURCES[str(row, iMagSrc)] ?? 'none'),
        groups: Array.isArray(groups) ? groups : [],
        dockedTo: iDocked >= 0 && typeof row[iDocked] === 'number' ? row[iDocked] : null,
      },
      omm: {
        OBJECT_NAME: name,
        OBJECT_ID: intlDes,
        EPOCH: str(row, iEpoch),
        MEAN_MOTION: num(row, iN),
        ECCENTRICITY: num(row, iE),
        INCLINATION: num(row, iI),
        RA_OF_ASC_NODE: num(row, iRaan),
        ARG_OF_PERICENTER: num(row, iArgp),
        MEAN_ANOMALY: num(row, iM),
        EPHEMERIS_TYPE: 0,
        CLASSIFICATION_TYPE: 'U',
        NORAD_CAT_ID: norad,
        ELEMENT_SET_NO: num(row, iElset, 999),
        REV_AT_EPOCH: num(row, iRev),
        BSTAR: num(row, iBstar),
        MEAN_MOTION_DOT: num(row, iNdot),
        MEAN_MOTION_DDOT: num(row, iNddot),
      },
    }
  }
}

/** Fields of a pack row, by name, for the writer. */
export interface RowValues {
  norad: number
  name: string
  intlDes: string
  epoch: string
  meanMotion: number
  eccentricity: number
  inclination: number
  raan: number
  argPericenter: number
  meanAnomaly: number
  bstar: number
  meanMotionDot: number
  meanMotionDdot: number
  elementSetNo: number
  revAtEpoch: number
  type: ObjectType
  owner: string
  launch: string
  stdMag: number | null
  magSource: MagnitudeSource
  groups: string[]
  dockedTo: number | null
}

export function encodeRow(v: RowValues): PackRow {
  return PACK_FIELDS.map((f) => v[f])
}
