/**
 * User settings: one signal, persisted to localStorage.
 *
 * Stored settings are merged field by field over the defaults and every
 * field is validated, so a setting added later starts at its default, and
 * a corrupt or hand-edited value falls back rather than breaking the app.
 */
import { effect, signal } from '@preact/signals'

export type ViewMode = 'map' | 'sky' | 'ar'
export type ShowFilter = 'naked-eye' | 'sunlit' | 'all'
export type LabelDensity = 'none' | 'few' | 'many'

export interface SavedLocation {
  latitude: number
  longitude: number
  /** km above the ellipsoid. */
  height: number
  /** Where it came from, for the UI: "GPS", or what the user typed. */
  label: string
  /** When it was set, Unix ms. */
  at: number
}

export interface Calibration {
  /** Added to the sensor's heading, degrees: corrects compass error and
   *  magnetic declination together. */
  yawDeg: number
  /** Added to the camera's elevation, degrees. */
  pitchDeg: number
  /** When it was last calibrated, Unix ms; null if never. */
  at: number | null
}

export interface Settings {
  view: ViewMode
  location: SavedLocation | null
  /** Use GPS when available; otherwise only the saved location. */
  useGps: boolean
  /** Enabled pack ids; null means "the index's defaults". */
  packs: string[] | null
  show: ShowFilter
  /** Faintest satellite magnitude shown by the naked-eye filter. */
  limitingMag: number
  labels: LabelDensity
  constellations: boolean
  grid: boolean
  /** Faintest star drawn. */
  starMag: number
  night: boolean
  /** Camera field of view across the long side of the video, degrees. */
  cameraFovDeg: number
  calibration: Calibration
  /** The planetarium view's field of view (vertical), degrees. */
  skyFovDeg: number
}

export const DEFAULT_SETTINGS: Settings = {
  view: 'map',
  location: null,
  // Off until the user taps "Use my location": asking for location
  // permission on page load, with no context, is how prompts get refused.
  useGps: false,
  packs: null,
  show: 'naked-eye',
  limitingMag: 5,
  labels: 'few',
  constellations: true,
  grid: true,
  starMag: 5,
  night: false,
  // A typical phone main camera is ~26 mm equivalent: 67° across the long
  // side of a 4:3 sensor.
  cameraFovDeg: 67,
  calibration: { yawDeg: 0, pitchDeg: 0, at: null },
  skyFovDeg: 70,
}

const KEY = 'sat-ar:settings:v1'

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
const num = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : fallback
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)

function parseLocation(v: unknown): SavedLocation | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const lat = num(o.latitude, -90, 90, Number.NaN)
  const lon = num(o.longitude, -180, 180, Number.NaN)
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null
  return {
    latitude: lat,
    longitude: lon,
    height: num(o.height, -1, 10, 0),
    label: typeof o.label === 'string' ? o.label.slice(0, 80) : '',
    at: num(o.at, 0, Number.MAX_SAFE_INTEGER, 0),
  }
}

/** Validate anything (parsed JSON, a URL override…) into Settings. */
export function parseSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS
  if (!raw || typeof raw !== 'object') return structuredClone(d)
  const o = raw as Record<string, unknown>
  const cal = (o.calibration && typeof o.calibration === 'object' ? o.calibration : {}) as Record<string, unknown>
  return {
    view: oneOf(o.view, ['map', 'sky', 'ar'] as const, d.view),
    location: parseLocation(o.location),
    useGps: bool(o.useGps, d.useGps),
    packs: Array.isArray(o.packs) && o.packs.every((p) => typeof p === 'string') ? o.packs : null,
    show: oneOf(o.show, ['naked-eye', 'sunlit', 'all'] as const, d.show),
    limitingMag: num(o.limitingMag, -2, 9, d.limitingMag),
    labels: oneOf(o.labels, ['none', 'few', 'many'] as const, d.labels),
    constellations: bool(o.constellations, d.constellations),
    grid: bool(o.grid, d.grid),
    starMag: num(o.starMag, 0, 6.5, d.starMag),
    night: bool(o.night, d.night),
    cameraFovDeg: num(o.cameraFovDeg, 20, 140, d.cameraFovDeg),
    calibration: {
      yawDeg: num(cal.yawDeg, -180, 180, 0),
      pitchDeg: num(cal.pitchDeg, -30, 30, 0),
      at: typeof cal.at === 'number' ? cal.at : null,
    },
    skyFovDeg: num(o.skyFovDeg, 5, 150, d.skyFovDeg),
  }
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    return parseSettings(raw ? JSON.parse(raw) : null)
  } catch {
    // Private mode, blocked storage, corrupt JSON: run on defaults.
    return structuredClone(DEFAULT_SETTINGS)
  }
}

export const settings = signal<Settings>(load())

/** Update some settings; the rest are kept. */
export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
effect(() => {
  const s = settings.value
  // Debounced: dragging a slider changes settings many times a second.
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      // Storage full or blocked: settings just won't persist.
    }
  }, 300)
})
