/** Details of the selected satellite: where it is now, its next visible
 *  pass, and what it is. */
import { useEffect, useMemo, useState } from 'preact/hooks'
import type { Look } from '../core/look.ts'
import { displayName } from '../core/names.ts'
import type { Pass } from '../core/passes.ts'
import { launchKey, recentLaunch, TRAIN_MAX_AGE_MS } from '../core/trains.ts'
import { clock } from '../state/clock.ts'
import { observer } from '../state/observer.ts'
import { settings } from '../state/settings.ts'
import { catalog, getTracker, indexByNorad, selected } from '../state/tracker.ts'
import { downloadPasses } from './download.ts'
import { age, brightnessWords, clockTime, compass, dayLabel, km, magnitude, relative } from './format.ts'
import { useNow } from './hooks.ts'
import { Icon } from './Icon.tsx'
import { passDescription, passDirections, watchWindow } from './passText.ts'
import { lookTowards } from './SkyView.tsx'

const TYPE_WORDS = { payload: 'Satellite', 'rocket-body': 'Rocket stage', debris: 'Debris', unknown: 'Object' } as const

/** "Launched 9 days ago with 25 others …" for recent multi-satellite launches. */
function launchWords(launchedMs: number, now: number, others: number): string {
  const days = Math.max(0, Math.floor((now - launchedMs) / 86_400_000))
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
  const hint = days <= 30 ? ': they may fly as a train, a line of lights following each other' : ''
  return `Launched ${when} with ${others} others${hint}`
}

export function InfoCard() {
  const sel = selected.value
  const cat = catalog.value
  const i = sel === null ? undefined : indexByNorad.value.get(sel)
  const info = i === undefined ? undefined : cat.sats[i]
  const now = useNow(1000)
  const epoch = clock.epoch.value
  const obs = observer.value
  const [look, setLook] = useState<Look | null>(null)
  const [passes, setPasses] = useState<Pass[] | null>(null)
  // Recently launched with others: they may still fly as a train.
  const launch = info ? recentLaunch(info, now, TRAIN_MAX_AGE_MS) : null
  const siblings = useMemo(() => (launch ? cat.sats.filter((s) => launchKey(s.intlDes) === launch).length - 1 : 0), [launch, cat.sats])

  useEffect(() => {
    if (sel === null || !obs) return
    let live = true
    void getTracker()
      .client.request('look', { norad: sel, ms: clock.now() })
      .then((l) => live && setLook(l))
    return () => {
      live = false
    }
  }, [sel, now, obs, cat.generation])

  // Passes from now: refetched on selection, place or time jumps, and once
  // the first listed pass is over.
  const firstEnd = passes?.[0] ? watchWindow(passes[0]).end.ms : Infinity
  const stale = now > firstEnd
  useEffect(() => {
    setPasses(null)
    if (sel === null || !obs) return
    let live = true
    const start = clock.now()
    void getTracker()
      .client.request('passes', { norads: [sel], startMs: start, endMs: start + 4 * 86_400_000, options: {}, visibleOnly: false })
      .then((p) => live && setPasses(p))
    return () => {
      live = false
    }
  }, [sel, obs, epoch, stale, cat.generation])

  if (sel === null || !info) return null

  const elementAge = now - (cat.epochs[i!] ?? now)
  const nextVisible = passes?.find((p) => p.visible)
  const nextAny = passes?.[0]
  const up = look && look.el > 0
  const mode = settings.value.view

  return (
    <section class="card" aria-label={`${displayName(info)} details`} data-testid="info-card">
      <header class="card__head">
        <div>
          <h2 class="card__title">{displayName(info)}</h2>
          <p class="card__sub">
            {TYPE_WORDS[info.type]}
            {info.owner && ` · ${info.owner}`}
            {info.launch && ` · launched ${info.launch.slice(0, 4)}`} · #{info.norad}
          </p>
        </div>
        <button class="icon-btn" onClick={() => (selected.value = null)} aria-label="Close">
          <Icon name="close" />
        </button>
      </header>

      {siblings >= 3 && info.launch && <p class="card__sub">{launchWords(Date.parse(info.launch), now, siblings)}</p>}
      {look && (
        <p class="card__now">
          {up ? (
            <>
              <strong>
                {Math.round(look.el)}° up in the {compass(look.az)}
              </strong>
              {' · '}
              {look.sunlit >= 0.5 ? (look.mag !== null ? `${brightnessWords(look.mag)} (mag ${magnitude(look.mag)})` : 'in sunlight') : 'in Earth’s shadow — not visible'}
            </>
          ) : (
            <>Below the horizon{nextAny && ` · rises ${relative(nextAny.rise.ms, now)}`}</>
          )}
        </p>
      )}
      {look && (
        <p class="card__facts">
          {km(look.range)} away · {km(look.altitude)} up · {(Math.hypot(...look.enuVel)).toFixed(1)} km/s
        </p>
      )}

      <div class="card__pass">
        {passes === null ? (
          <span class="muted">Finding passes…</span>
        ) : nextVisible ? (
          <>
            <div>
              <strong>
                Next visible: {dayLabel(watchWindow(nextVisible).start.ms, now)} {clockTime(watchWindow(nextVisible).start.ms)}
              </strong>{' '}
              <span class="muted">({relative(watchWindow(nextVisible).start.ms, now)})</span>
            </div>
            <div class="muted">
              {passDirections(nextVisible)} · {passDescription(nextVisible).slice(1).join(' · ')}
            </div>
          </>
        ) : (
          <span class="muted">No visible passes in the next 4 days{obs ? '' : ' (set your location)'}</span>
        )}
      </div>

      <div class="card__actions">
        {nextVisible && (
          <>
            <button class="btn" onClick={() => clock.set(watchWindow(nextVisible).start.ms - 60_000)}>
              Watch it
            </button>
            <button
              class="btn btn--ghost"
              onClick={() => downloadPasses([{ pass: nextVisible, name: displayName(info) }], `${info.norad}-pass.ics`)}
              aria-label="Add the next visible pass to your calendar"
            >
              <Icon name="calendar" size={16} /> Calendar
            </button>
          </>
        )}
        {mode === 'sky' && look && up && (
          <button class="btn btn--ghost" onClick={() => lookTowards(look.az, look.el)}>
            <Icon name="target" size={16} /> Point at it
          </button>
        )}
      </div>
      <p class={`card__meta ${elementAge > 3 * 86_400_000 ? 'warn' : ''}`}>Orbit data {age(Math.abs(elementAge))}</p>
    </section>
  )
}
