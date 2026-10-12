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

export function isStation(s: Pick<SatelliteInfo, 'groups'>): boolean {
  return s.groups.includes('stations')
}

/** Case-insensitive match on name, display name, NORAD number or
 *  international designator. */
export function matchesQuery(s: SatelliteInfo, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  if (/^\d+$/.test(q)) return String(s.norad) === q || s.intlDes.startsWith(q)
  return s.name.toLowerCase().includes(q) || displayName(s).toLowerCase().includes(q) || s.intlDes.toLowerCase().startsWith(q)
}
