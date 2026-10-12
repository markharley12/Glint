/**
 * Upcoming visible passes of the bright and notable satellites: the
 * "what can I see tonight?" list.
 */
import { useEffect, useState } from 'preact/hooks'
import { displayName, isStation } from '../../core/names.ts'
import type { Pass } from '../../core/passes.ts'
import type { SatelliteInfo } from '../../core/satellite.ts'
import { groupTrainPasses, launchGroups, TRAIN_PASSES_MAX_AGE_MS, trainName } from '../../core/trains.ts'
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

type Scope = 'bright' | 'stations' | 'trains'

/** One row of the list: a satellite's pass, or a whole train's. */
interface Entry {
  pass: Pass
  name: string
  /** Satellites in the train; 1 for a single satellite. */
  count: number
}

/** Which satellites to search: computing passes for all of Starlink would
 *  take a phone several seconds and list hundreds of faint passes. */
function candidates(sats: SatelliteInfo[], scope: Scope, nowMs: number): number[] {
  if (scope === 'trains') return [...launchGroups(sats, nowMs, TRAIN_PASSES_MAX_AGE_MS).values()].flat()
  return sats
    .filter((s) => {
      if (s.dockedTo !== null) return false // same passes as its station
      if (scope === 'stations') return isStation(s)
      return s.groups.includes('visual') || isStation(s) || (s.stdMag !== null && s.stdMag <= 4.5 && s.groups.includes('last-30-days'))
    })
    .map((s) => s.norad)
}

function entries(passes: Pass[], scope: Scope, byNorad: Map<number, SatelliteInfo>, launches: Map<number, string>): Entry[] {
  if (scope !== 'trains') {
    return passes.flatMap((pass) => {
      const sat = byNorad.get(pass.norad)
      return sat ? [{ pass, name: displayName(sat), count: 1 }] : []
    })
  }
  return groupTrainPasses(passes, (norad) => launches.get(norad) ?? null).map((t) => {
    const names = t.members.map((p) => byNorad.get(p.norad)?.name ?? '')
    return { pass: t.pass, name: `${trainName(names, t.launch)} ×${t.members.length}`, count: t.members.length }
  })
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
        norads: candidates(cat.sats, scope, start),
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

  const now = clock.now()
  const byNorad = new Map(cat.sats.map((s) => [s.norad, s]))
  const launches = new Map<number, string>()
  if (scope === 'trains') {
    for (const [launch, norads] of launchGroups(cat.sats, now, TRAIN_PASSES_MAX_AGE_MS)) for (const n of norads) launches.set(n, launch)
  }
  const all = entries(passes ?? [], scope, byNorad, launches)
  const bright = (e: Entry) => {
    const mag = e.pass.visible?.brightest?.mag
    return mag === null || mag === undefined ? maxMag >= 5 : mag <= maxMag
  }
  const shown = all.filter(bright)
  const hidden = all.length - shown.length

  return (
    <Sheet title="Visible passes" testId="passes-panel">
      <div class="row row--wrap">
        <label class="seg">
          <input type="radio" name="scope" checked={scope === 'bright'} onChange={() => setScope('bright')} /> Bright satellites
        </label>
        <label class="seg">
          <input type="radio" name="scope" checked={scope === 'stations'} onChange={() => setScope('stations')} /> Space stations
        </label>
        <label class="seg">
          <input type="radio" name="scope" checked={scope === 'trains'} onChange={() => setScope('trains')} /> Trains
        </label>
      </div>
      <label class="field">
        <span>
          Brighter than magnitude <strong>{maxMag.toFixed(1)}</strong>{' '}
          <span class="muted">({maxMag <= 1 ? 'only the brightest' : maxMag <= 3.5 ? 'easy from a town' : 'needs a dark sky'})</span>
        </span>
        <input type="range" min={-2} max={6} step={0.5} value={maxMag} onInput={(e) => setMaxMag(Number(e.currentTarget.value))} />
      </label>

      {!obs && <p class="muted">Set your location to see passes.</p>}
      {error && <p class="warn">Couldn’t compute passes: {error}</p>}
      {obs && passes === null && !error && <p class="muted">Working out the next {HOURS} hours…</p>}
      {passes !== null && all.length === 0 && (
        <p class="muted">
          {scope === 'trains'
            ? `No satellite trains from this month’s launches pass in the dark in the next ${HOURS} hours.`
            : `No visible passes in the next ${HOURS} hours.`}
        </p>
      )}

      <ol class="passes" data-testid="passes-list">
        {shown.map(({ pass: p, name, count }) => {
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
                  <strong>{name}</strong>
                  <span class="muted">
                    {passDirections(p)} · up to {Math.round(w.max.el)}° · {duration(w.end.ms - w.start.ms)}
                  </span>
                </span>
                <span class="pass__mag" title={count > 1 ? 'Magnitude of the brightest: lower is brighter' : 'Magnitude: lower is brighter'}>
                  {magnitude(mag)}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {hidden > 0 && (
        <p class="muted small">
          {hidden} fainter {hidden === 1 ? 'pass' : 'passes'} hidden.{' '}
          <button class="link" onClick={() => setMaxMag(6)}>
            Show all
          </button>
        </p>
      )}
      {shown.length > 0 && (
        <button class="btn btn--ghost" onClick={() => downloadPasses(shown)}>
          <Icon name="calendar" size={16} /> Add {shown.length === 1 ? 'it' : `all ${shown.length}`} to calendar
        </button>
      )}
      <p class="muted small">
        {scope === 'trains'
          ? 'Satellites from one launch following each other in a line, for a few weeks after launch. Times are when the first climbs above 10° in sunlight against a dark sky. '
          : 'Times are when each satellite climbs above 10° in sunlight against a dark sky. '}
        Tap a pass to jump there.
      </p>
    </Sheet>
  )
}
