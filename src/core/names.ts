/**
 * Friendlier names for display. CelesTrak's names are catalogue names
 * ("ISS (ZARYA)", "CSS (TIANHE)"); the few objects everyone knows by
 * another name get it, and everything else keeps its catalogue name.
 */
import type { SatelliteInfo } from './satellite.ts'

const KNOWN: Record<number, string> = {
  25544: 'ISS',
  48274: 'Tiangong',
  20580: 'Hubble',
}

export function displayName(s: Pick<SatelliteInfo, 'norad' | 'name'>): string {
  return KNOWN[s.norad] ?? s.name
}

/** Station cores, by NORAD number. */
const STATIONS = new Set([25544, 48274])

/**
 * A crewed space station: the known ones, or a bright payload in
 * CelesTrak's "stations" group with nothing it is docked to. (That group
 * also holds docked modules, visiting spacecraft, and cubesats freshly
 * deployed from the ISS, none of which should be shown as stations.)
 */
export function isStation(s: Pick<SatelliteInfo, 'norad' | 'groups' | 'type' | 'stdMag' | 'dockedTo'>): boolean {
  if (STATIONS.has(s.norad)) return true
  return s.groups.includes('stations') && s.type === 'payload' && s.dockedTo === null && s.stdMag !== null && s.stdMag <= 0
}

/** Case-insensitive match on name, display name, NORAD number or
 *  international designator. */
export function matchesQuery(s: SatelliteInfo, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  if (/^\d+$/.test(q)) return String(s.norad) === q || s.intlDes.startsWith(q)
  return s.name.toLowerCase().includes(q) || displayName(s).toLowerCase().includes(q) || s.intlDes.toLowerCase().startsWith(q)
}
