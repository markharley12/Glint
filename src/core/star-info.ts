/**
 * Plain-language description of a star from what the catalogue already holds
 * (magnitude, B−V colour, position, rank): no extra data to ship.
 */

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/** Surface temperature from B−V (Ballesteros 2012), kelvin. */
export function starTemperature(bv: number): number {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))
}

export function starColourName(bv: number): string {
  if (bv < 0) return 'blue'
  if (bv < 0.3) return 'blue-white'
  if (bv < 0.6) return 'white'
  if (bv < 0.8) return 'yellow-white'
  if (bv < 1.1) return 'orange'
  return 'red-orange'
}

function ordinal(n: number): string {
  const r = n % 100
  if (r >= 11 && r <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

export interface StarFacts {
  name: string | null
  mag: number
  bv: number
  /** 1 = brightest in the catalogue. */
  rank: number
  az: number
  el: number
  constellation?: { name: string; exact: boolean } | null
}

export function describeStar(s: StarFacts): string {
  const mag = s.mag.toFixed(1).replace('-', '−')
  const c = s.constellation
  const where = c ? `${c.exact ? 'in' : 'near'} ${c.name}` : ''
  const lines = [s.name ?? (c ? `Star ${where}` : 'Star')]
  if (s.name && where) lines.push(`Star ${where}`)
  const rank = s.rank <= 100 ? `${ordinal(s.rank)} brightest star in the sky · ` : ''
  lines.push(`${rank}magnitude ${mag}`)
  const k = Math.round(starTemperature(s.bv) / 100) * 100
  lines.push(`${starColourName(s.bv)}, about ${k.toLocaleString('en-GB')} K`)
  if (s.mag > 5.5) lines.push('Faint: needs a dark sky')
  else if (s.mag > 4) lines.push('Fairly faint: easy away from city lights')
  const dir = COMPASS[Math.round(s.az / 45) % 8]!
  lines.push(`${Math.round(s.el)}° up, ${dir} (${Math.round(s.az)}°)`)
  return lines.join('\n')
}
