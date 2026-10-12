/** Formatting for the UI: times, directions, distances, magnitudes. */
import { wrap360 } from '../core/vec.ts'

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

/** Sixteen-point compass direction for an azimuth in degrees. */
export function compass(az: number): string {
  return POINTS[Math.round(wrap360(az) / 22.5) % 16]!
}

export function degrees(x: number, digits = 0): string {
  return `${x.toFixed(digits)}°`
}

/** Local clock time, e.g. "21:04" or "21:04:37". */
export function clockTime(ms: number, seconds = false): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: seconds ? '2-digit' : undefined,
    hour12: false,
  })
}

/** "Today", "Tomorrow", or a short weekday and date, relative to `now`. */
export function dayLabel(ms: number, now: number): string {
  const d = new Date(ms)
  const n = new Date(now)
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOfDay(d) - startOfDay(n)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** "in 5 min", "in 2 h 10 min", "3 min ago". */
export function relative(ms: number, now: number): string {
  const s = Math.round((ms - now) / 1000)
  const a = Math.abs(s)
  let text: string
  if (a < 60) text = `${a} s`
  else if (a < 3600) text = `${Math.round(a / 60)} min`
  else {
    const h = Math.floor(a / 3600)
    const m = Math.round((a % 3600) / 60)
    text = m ? `${h} h ${m} min` : `${h} h`
  }
  return s >= 0 ? `in ${text}` : `${text} ago`
}

/** Duration in minutes and seconds, e.g. "4 min 20 s". */
export function duration(ms: number): string {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  return m ? `${m} min ${s % 60} s` : `${s} s`
}

export function km(x: number): string {
  return x >= 10_000 ? `${Math.round(x / 1000).toLocaleString()} thousand km` : `${Math.round(x).toLocaleString()} km`
}

export function magnitude(m: number | null): string {
  if (m === null || Number.isNaN(m)) return '—'
  return (m < 0 ? '−' : '') + Math.abs(m).toFixed(1)
}

/** Plain-words brightness for a magnitude. */
export function brightnessWords(m: number | null): string {
  if (m === null || Number.isNaN(m)) return 'brightness unknown'
  if (m < -2) return 'brilliant'
  if (m < 0) return 'very bright'
  if (m < 2) return 'bright'
  if (m < 3.5) return 'easy to see'
  if (m < 4.5) return 'faint'
  return 'very faint'
}

/** "2 days old", "5 hours old". */
export function age(ms: number): string {
  const h = ms / 3_600_000
  if (h < 1) return 'under an hour old'
  if (h < 48) return `${Math.round(h)} hours old`
  return `${Math.round(h / 24)} days old`
}

export function latLon(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'E' : 'W'}`
}
