/**
 * Where the user is. Sources, in order of precedence:
 * 1. `?lat=…&lon=…` in the URL (shared links, tests);
 * 2. GPS, when allowed and the setting is on;
 * 3. the last saved location, used at once on start-up so the sky appears
 *    before GPS answers.
 */
import { computed, signal } from '@preact/signals'
import type { Observer } from '../core/frames.ts'
import { settings, updateSettings, type SavedLocation } from './settings.ts'

function formatLatLon(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`
}

export type LocationStatus = 'idle' | 'locating' | 'ok' | 'denied' | 'unavailable'

export const locationStatus = signal<LocationStatus>('idle')

/** A location fixed by the URL; it wins over everything for this visit. */
export const urlLocation = signal<SavedLocation | null>(null)

export const observer = computed<Observer | null>(() => {
  const loc = urlLocation.value ?? settings.value.location
  return loc ? { latitude: loc.latitude, longitude: loc.longitude, height: loc.height } : null
})

export const locationLabel = computed(() => (urlLocation.value ?? settings.value.location)?.label ?? '')

/** Distance in km between two lat/lon points (haversine, spherical). */
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const r = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * r
  const dLon = (b.longitude - a.longitude) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function setManualLocation(latitude: number, longitude: number, label: string, heightKm = 0): void {
  updateSettings({ location: { latitude, longitude, height: heightKm, label, at: Date.now() }, useGps: false })
}

/** Ask the browser for a GPS fix and save it. Resolves when done either way. */
export function locate(): Promise<void> {
  if (!('geolocation' in navigator)) {
    locationStatus.value = 'unavailable'
    return Promise.resolve()
  }
  locationStatus.value = 'locating'
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, altitude } = pos.coords
        const prev = settings.peek().location
        // Small moves (GPS jitter) aren't worth re-running everything for.
        if (!prev || prev.label !== 'GPS' || distanceKm(prev, { latitude, longitude }) > 0.5) {
          updateSettings({
            location: { latitude, longitude, height: altitude != null ? altitude / 1000 : 0, label: 'GPS', at: Date.now() },
          })
        }
        locationStatus.value = 'ok'
        resolve()
      },
      (err) => {
        locationStatus.value = err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'
        resolve()
      },
      // A fix from the last 10 minutes is as good as a new one for the sky.
      { enableHighAccuracy: false, timeout: 20_000, maximumAge: 600_000 },
    )
  })
}

/** Read `lat`, `lon` (and optional `h`, metres) from a query string. */
export function locationFromQuery(search: string): SavedLocation | null {
  const q = new URLSearchParams(search)
  const lat = Number(q.get('lat'))
  const lon = Number(q.get('lon'))
  if (!q.has('lat') || !q.has('lon') || !Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  const h = Number(q.get('h') ?? 0)
  return { latitude: lat, longitude: lon, height: Number.isFinite(h) ? h / 1000 : 0, label: formatLatLon(lat, lon), at: Date.now() }
}
