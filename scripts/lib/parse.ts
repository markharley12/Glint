/** Parsers for the third-party files the data build reads. */

/** RFC 4180 CSV: quoted fields may hold commas, newlines and "" escapes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** CSV with a header row, as objects keyed by column name. */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text)
  if (!header) return []
  return rows
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}

export interface SatcatEntry {
  norad: number
  name: string
  type: 'payload' | 'rocket-body' | 'debris' | 'unknown'
  owner: string
  launch: string
  /** Radar cross-section, m², when published. */
  rcs: number | null
  decayed: boolean
}

const SATCAT_TYPES: Record<string, SatcatEntry['type']> = {
  PAY: 'payload',
  'R/B': 'rocket-body',
  DEB: 'debris',
}

/** CelesTrak's satcat.csv. */
export function parseSatcat(text: string): Map<number, SatcatEntry> {
  const out = new Map<number, SatcatEntry>()
  for (const r of parseCsvRecords(text)) {
    const norad = Number(r.NORAD_CAT_ID)
    if (!Number.isInteger(norad) || norad <= 0) continue
    const rcs = r.RCS ? Number(r.RCS) : NaN
    out.set(norad, {
      norad,
      name: r.OBJECT_NAME ?? '',
      type: SATCAT_TYPES[r.OBJECT_TYPE ?? ''] ?? 'unknown',
      owner: r.OWNER ?? '',
      launch: r.LAUNCH_DATE ?? '',
      rcs: Number.isFinite(rcs) && rcs > 0 ? rcs : null,
      decayed: (r.DECAY_DATE ?? '') !== '',
    })
  }
  return out
}

export interface McCantsEntry {
  norad: number
  /** Standard magnitude (1000 km, half phase), if listed. */
  mag: number | null
  /** McCants' own RCS column, m². */
  rcs: number | null
}

/**
 * Mike McCants' quicksat.mag: fixed-width lines like
 *
 *     25544   98 67A    ISS            -2.5              399
 *     20580   90 37B    HST             1.5 13.3 4.3 0.0  29 occ flare to -4
 *
 * Columns (0-based): NORAD 0–4, name 18–31, magnitude 32–37, RCS 50–54.
 * Many lines stop after the name: listed, but with no magnitude.
 */
export function parseQuicksatMag(text: string): Map<number, McCantsEntry> {
  const out = new Map<number, McCantsEntry>()
  const lines = text.split(/\r?\n/)
  for (const line of lines.slice(1)) {
    const norad = Number(line.slice(0, 5))
    if (!Number.isInteger(norad) || norad <= 0) continue
    const mag = Number.parseFloat(line.slice(32, 38))
    const rcs = Number.parseFloat(line.slice(50, 55))
    out.set(norad, {
      norad,
      mag: Number.isFinite(mag) ? mag : null,
      rcs: Number.isFinite(rcs) && rcs > 0 ? rcs : null,
    })
  }
  return out
}

/** Least-squares line y = a + b·x. */
export function fitLine(xs: number[], ys: number[]): { a: number; b: number; rms: number; n: number } {
  const n = xs.length
  if (n < 2) throw new Error('fitLine needs at least two points')
  let sx = 0, sy = 0, sxx = 0, sxy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]!
    sy += ys[i]!
    sxx += xs[i]! * xs[i]!
    sxy += xs[i]! * ys[i]!
  }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx)
  const a = (sy - b * sx) / n
  let ss = 0
  for (let i = 0; i < n; i++) ss += (ys[i]! - (a + b * xs[i]!)) ** 2
  return { a, b, rms: Math.sqrt(ss / n), n }
}
