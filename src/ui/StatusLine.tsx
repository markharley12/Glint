/** One line under the top bar: where, how many satellites are up, and
 *  any problem worth knowing about (stale data, daylight, errors). */
import { twilight } from '../core/twilight.ts'
import { DARK_ENOUGH_SUN_EL } from '../sky/visibility.ts'
import { clock } from '../state/clock.ts'
import { locationLabel, locationStatus, observer } from '../state/observer.ts'
import { settings } from '../state/settings.ts'
import { catalog } from '../state/tracker.ts'
import { renderStats } from '../state/view.ts'
import { age } from './format.ts'

/** Orbital elements older than this make positions visibly wrong for
 *  low satellites (Starlinks manoeuvre; drag grows). */
const STALE_DATA_MS = 3 * 86_400_000

export function StatusLine() {
  const cat = catalog.value
  const stats = renderStats.value
  const s = settings.value
  const parts: string[] = []
  const warnings: string[] = []

  if (observer.value) parts.push(locationLabel.value === 'GPS' ? 'Your location' : locationLabel.value || 'Saved location')
  if (locationStatus.value === 'locating') parts.push('locating…')

  if (cat.status === 'loading') parts.push('loading satellites…')
  else if (cat.status === 'error') warnings.push(cat.error ?? 'Could not load satellites')
  else if (cat.status === 'ready') {
    const dark = stats.sunEl <= DARK_ENOUGH_SUN_EL
    if (s.show === 'naked-eye') {
      parts.push(dark ? `${stats.visible} visible` : 'daylight')
    } else {
      parts.push(`${stats.up} up, ${stats.visible} visible`)
    }
    const generated = cat.index ? Date.parse(cat.index.generated) : Number.NaN
    // Data age against the simulated time: browsing next week's sky with
    // today's elements is as inaccurate as browsing today's with old ones.
    const dataAge = clock.now() - generated
    if (Math.abs(dataAge) > STALE_DATA_MS) warnings.push(`Orbit data is ${age(Math.abs(dataAge))}: positions may be off`)
    if (cat.missing.length) warnings.push(`Couldn’t load: ${cat.missing.map((m) => m.id).join(', ')}`)
    if (!dark && s.show === 'naked-eye' && observer.value) {
      warnings.push(
        twilight(stats.sunEl) === 'day'
          ? 'Satellites show up after sunset and before dawn — try the time controls'
          : 'Still too bright: satellites appear as the sky darkens',
      )
    }
  }

  return (
    <div class="status" role="status" aria-live="polite">
      <span>{parts.join(' · ')}</span>
      {warnings.slice(0, 1).map((w) => (
        <span key={w} class="status__warn">
          {w}
        </span>
      ))}
    </div>
  )
}
