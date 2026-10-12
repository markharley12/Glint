/** Choose where you are: GPS, or latitude/longitude typed in. */
import { useState } from 'preact/hooks'
import { locate, locationStatus, setManualLocation } from '../state/observer.ts'
import { settings, updateSettings } from '../state/settings.ts'
import { latLon } from './format.ts'
import { Icon } from './Icon.tsx'

/** Parse "51.48, -0.001" or "51.48 N 0.001 W" style input. */
export function parseLatLon(text: string): { lat: number; lon: number } | null {
  const t = text.trim().toUpperCase()
  const m = t.match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?[\s,;]+(-?\d+(?:\.\d+)?)\s*°?\s*([EW])?$/)
  if (!m) return null
  let lat = Number(m[1])
  let lon = Number(m[3])
  if (m[2] === 'S') lat = -Math.abs(lat)
  if (m[4] === 'W') lon = -Math.abs(lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

export function LocationForm({ onDone }: { onDone?: () => void }) {
  const loc = settings.value.location
  const status = locationStatus.value
  const [text, setText] = useState(loc ? `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}` : '')
  const [error, setError] = useState<string | null>(null)

  const startGps = async () => {
    updateSettings({ useGps: true })
    await locate()
    if (locationStatus.peek() === 'ok') onDone?.()
  }

  const save = (e: Event) => {
    e.preventDefault()
    const p = parseLatLon(text)
    if (!p) {
      setError('Enter latitude and longitude, e.g. 51.48, -0.01')
      return
    }
    setError(null)
    setManualLocation(p.lat, p.lon, latLon(p.lat, p.lon))
    onDone?.()
  }

  return (
    <div class="location">
      {loc && (
        <p>
          Now: <strong>{loc.label === 'GPS' ? 'GPS' : 'Entered'}</strong> · {latLon(loc.latitude, loc.longitude)}
        </p>
      )}
      <button class="btn" onClick={() => void startGps()} disabled={status === 'locating'}>
        <Icon name="locate" size={16} /> {status === 'locating' ? 'Locating…' : 'Use my location'}
      </button>
      {status === 'denied' && <p class="warn small">Location permission was refused. Enter coordinates instead, or allow location for this site in your browser settings.</p>}
      {status === 'unavailable' && <p class="warn small">Couldn’t get a location fix. Enter coordinates instead.</p>}
      <form class="location__manual" onSubmit={save}>
        <label class="field">
          <span>Or enter latitude, longitude</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="51.48, -0.01"
            value={text}
            onInput={(e) => setText(e.currentTarget.value)}
            aria-invalid={error !== null}
          />
        </label>
        <button class="btn btn--ghost" type="submit">
          Set
        </button>
      </form>
      {error && <p class="warn small">{error}</p>}
      <p class="muted small">Your location stays on this device; it is only used to work out your sky.</p>
    </div>
  )
}
