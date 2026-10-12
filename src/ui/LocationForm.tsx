/** Choose where you are: GPS, a town by name, or latitude/longitude. */
import { useEffect, useState } from 'preact/hooks'
import { placeLabel, type Place } from '../core/places.ts'
import { locate, locationStatus, setManualLocation } from '../state/observer.ts'
import { settings, updateSettings } from '../state/settings.ts'
import { latLon } from './format.ts'
import { Icon } from './Icon.tsx'
import { countryName, findPlaces } from './places.ts'

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
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [places, setPlaces] = useState<Place[]>([])

  // Suggestions as you type, unless it's coordinates.
  useEffect(() => {
    if (parseLatLon(text) || text.trim().length < 2) {
      setPlaces([])
      return
    }
    let live = true
    const timer = setTimeout(() => {
      void findPlaces(text).then((p) => live && setPlaces(p))
    }, 120)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [text])

  const startGps = async () => {
    updateSettings({ useGps: true })
    await locate()
    if (locationStatus.peek() === 'ok') onDone?.()
  }

  const choose = (p: Place) => {
    setManualLocation(p.latitude, p.longitude, `${p.name}, ${countryName(p.country)}`)
    setText('')
    setPlaces([])
    onDone?.()
  }

  const save = async (e: Event) => {
    e.preventDefault()
    const p = parseLatLon(text)
    if (p) {
      setError(null)
      setManualLocation(p.lat, p.lon, latLon(p.lat, p.lon))
      setText('')
      onDone?.()
      return
    }
    const found = places.length ? places : await findPlaces(text, 1)
    if (found[0]) {
      setError(null)
      choose(found[0])
    } else {
      setError('No town by that name. Try a bigger place nearby, or enter latitude and longitude, e.g. 51.48, -0.01')
    }
  }

  return (
    <div class="location">
      {loc && (
        <p>
          Now: <strong>{loc.label === 'GPS' ? 'your GPS position' : loc.label}</strong>
          <span class="muted"> · {latLon(loc.latitude, loc.longitude)}</span>
        </p>
      )}
      <button class="btn" onClick={() => void startGps()} disabled={status === 'locating'}>
        <Icon name="locate" size={16} /> {status === 'locating' ? 'Locating…' : 'Use my location'}
      </button>
      {status === 'denied' && <p class="warn small">Location permission was refused. Search for your town instead, or allow location for this site in your browser settings.</p>}
      {status === 'unavailable' && <p class="warn small">Couldn’t get a location fix. Search for your town instead.</p>}
      <form class="location__manual" onSubmit={(e) => void save(e)}>
        <label class="field">
          <span>Or search for a town, or enter latitude, longitude</span>
          <input
            type="search"
            autoComplete="off"
            placeholder="Town, or 51.48, -0.01"
            value={text}
            onInput={(e) => setText(e.currentTarget.value)}
            aria-invalid={error !== null}
            aria-controls="place-results"
            data-testid="location-input"
          />
        </label>
        <button class="btn btn--ghost" type="submit">
          Set
        </button>
      </form>
      {places.length > 0 && (
        <ul class="results places" id="place-results" aria-label="Matching places">
          {places.map((p) => (
            <li key={`${p.latitude},${p.longitude},${p.name}`}>
              <button type="button" onClick={() => choose(p)}>
                <strong>{p.name}</strong>
                <span class="muted">{placeLabel(p, countryName).slice(p.name.length + 2)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p class="warn small">{error}</p>}
      <p class="muted small">Your location stays on this device; it is only used to work out your sky.</p>
    </div>
  )
}
