/**
 * "Next bright pass: ISS 19:42 (in 3 h)" — shown when nothing is visible
 * right now, so an empty or daylit sky still tells people when to look.
 */
import { useEffect, useState } from 'preact/hooks'
import { displayName, isStation } from '../core/names.ts'
import type { Pass } from '../core/passes.ts'
import type { SatelliteInfo } from '../core/satellite.ts'
import { clock } from '../state/clock.ts'
import { observer } from '../state/observer.ts'
import { catalog, getTracker, selected } from '../state/tracker.ts'
import { clockTime, dayLabel, magnitude, relative } from './format.ts'
import { useNow } from './hooks.ts'
import { watchWindow } from './passText.ts'

const HOURS = 36
/** Bright enough to notice without knowing where to look. */
const BRIGHT_MAG = 3
/** Standard magnitude cut for the candidates searched. */
const CANDIDATE_STD_MAG = 2.5

function candidates(sats: SatelliteInfo[]): number[] {
  return sats.filter((s) => s.dockedTo === null && (isStation(s) || (s.stdMag !== null && s.stdMag <= CANDIDATE_STD_MAG))).map((s) => s.norad)
}

export function NextPass() {
  const cat = catalog.value
  const obs = observer.value
  const epoch = clock.epoch.value
  const now = useNow(5000)
  const [pass, setPass] = useState<Pass | null>(null)
  const over = pass ? watchWindow(pass).end.ms < now : false

  useEffect(() => {
    setPass(null)
    if (cat.status !== 'ready' || !obs) return
    let live = true
    const start = clock.now()
    getTracker()
      .client.request('passes', { norads: candidates(cat.sats), startMs: start, endMs: start + HOURS * 3_600_000, options: {}, visibleOnly: true })
      .then((passes) => {
        if (!live) return
        const bright = passes.find((p) => (p.visible?.brightest?.mag ?? Infinity) <= BRIGHT_MAG)
        setPass(bright ?? null)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [cat.sats, cat.status, obs, epoch, over])

  if (!pass) return null
  const sat = cat.sats.find((s) => s.norad === pass.norad)
  if (!sat) return null
  const w = watchWindow(pass)
  const mag = pass.visible?.brightest?.mag ?? null
  const day = dayLabel(w.start.ms, now)
  return (
    <button
      class="status__next"
      onClick={() => {
        selected.value = pass.norad
        clock.set(w.start.ms - 60_000)
      }}
      data-testid="next-pass"
    >
      Next bright pass: <strong>{displayName(sat)}</strong> {day === 'Today' ? '' : `${day} `}
      {clockTime(w.start.ms)} · {relative(w.start.ms, now)} · mag {magnitude(mag)} ›
    </button>
  )
}
