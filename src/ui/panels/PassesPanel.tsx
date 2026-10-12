/**
 * Upcoming visible passes of the bright and notable satellites: the
 * "what can I see tonight?" list.
 */
import { useEffect, useState } from 'preact/hooks'
import { displayName, isStation } from '../../core/names.ts'
import type { Pass } from '../../core/passes.ts'
import type { SatelliteInfo } from '../../core/satellite.ts'
import { clock } from '../../state/clock.ts'
import { observer } from '../../state/observer.ts'
import { catalog, getTracker, selected } from '../../state/tracker.ts'
import { panel } from '../../state/view.ts'
import { downloadPasses } from '../download.ts'
import { clockTime, dayLabel, duration, magnitude } from '../format.ts'
import { Icon } from '../Icon.tsx'
import { passDirections, watchWindow } from '../passText.ts'
import { Sheet } from '../Sheet.tsx'

const HOURS = 48

type Scope = 'bright' | 'stations' | 'all-bright'

/** Which satellites to search: computing passes for all of Starlink would
 *  take a phone several seconds and list hundreds of faint passes. */
function candidates(sats: SatelliteInfo[], scope: Scope): number[] {
  return sats
    .filter((s) => {
      if (scope === 'stations') return isStation(s)
      const listed = s.groups.includes('visual') || isStation(s)
      return scope === 'bright' ? listed : listed || (s.stdMag !== null && s.stdMag <= 4.5 && s.groups.includes('last-30-days'))
    })
    .map((s) => s.norad)
}

export function PassesPanel() {
  const cat = catalog.value
  const obs = observer.value
  const epoch = clock.epoch.value
  const [scope, setScope] = useState<Scope>('bright')
  const [passes, setPasses] = useState<Pass[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [maxMag, setMaxMag] = useState(3.5)

  useEffect(() => {
    if (cat.status !== 'ready' || !obs) return
    let live = true
    setPasses(null)
    setError(null)
    const start = clock.now()
    getTracker()
      .client.request('passes', {
        norads: candidates(cat.sats, scope === 'bright' ? 'all-bright' : scope),
        startMs: start,
        endMs: start + HOURS * 3_600_000,
        options: {},
        visibleOnly: true,
      })
      .then((p) => live && setPasses(p))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [cat.sats, cat.status, obs, scope, epoch])

  const byNorad = new Map(cat.sats.map((s) => [s.norad, s]))
  const shown = (passes ?? []).filter((p) => {
    const mag = p.visible?.brightest?.mag
    return mag === null || mag === undefined ? maxMag >= 5 : mag <= maxMag
  })
  const now = clock.now()

  return (
    <Sheet title="Visible passes" testId="passes-panel">
      <div class="row">
        <label class="seg">
          <input type="radio" name="scope" checked={scope === 'bright'} onChange={() => setScope('bright')} /> Bright satellites
        </label>
        <label class="seg">
          <input type="radio" name="scope" checked={scope === 'stations'} onChange={() => setScope('stations')} /> Space stations
        </label>
      </div>
      <label class="field">
        <span>
          Brighter than magnitude <strong>{maxMag.toFixed(1)}</strong>{' '}
          <span class="muted">({maxMag <= 1 ? 'only the brightest' : maxMag <= 3.5 ? 'easy from a town' : 'needs a dark sky'})</span>
        </span>
        <input type="range" min={-2} max={5} step={0.5} value={maxMag} onInput={(e) => setMaxMag(Number(e.currentTarget.value))} />
      </label>

      {!obs && <p class="muted">Set your location to see passes.</p>}
      {error && <p class="warn">Couldn’t compute passes: {error}</p>}
      {obs && passes === null && !error && <p class="muted">Working out the next {HOURS} hours…</p>}
      {passes !== null && shown.length === 0 && <p class="muted">No passes this bright in the next {HOURS} hours. Try a fainter limit.</p>}

      <ol class="passes" data-testid="passes-list">
        {shown.map((p) => {
          const sat = byNorad.get(p.norad)
          if (!sat) return null
          const w = watchWindow(p)
          const mag = p.visible?.brightest?.mag ?? null
          return (
            <li key={`${p.norad}-${w.start.ms}`} class="pass">
              <button
                class="pass__main"
                onClick={() => {
                  selected.value = p.norad
                  clock.set(w.start.ms - 60_000)
                  panel.value = 'none'
                }}
              >
                <span class="pass__when">
                  <strong>{clockTime(w.start.ms)}</strong>
                  <span class="muted">{dayLabel(w.start.ms, now)}</span>
                </span>
                <span class="pass__what">
                  <strong>{displayName(sat)}</strong>
                  <span class="muted">
                    {passDirections(p)} · up to {Math.round(w.max.el)}° · {duration(w.end.ms - w.start.ms)}
                  </span>
                </span>
                <span class="pass__mag" title="Magnitude: lower is brighter">
                  {magnitude(mag)}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {shown.length > 0 && (
        <button class="btn btn--ghost" onClick={() => downloadPasses(shown, byNorad)}>
          <Icon name="calendar" size={16} /> Add all {shown.length} to calendar
        </button>
      )}
      <p class="muted small">Times are when each satellite climbs above 10° in sunlight against a dark sky. Tap a pass to jump there.</p>
    </Sheet>
  )
}
