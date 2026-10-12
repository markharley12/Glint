/**
 * URL parameters, for shareable views and deterministic tests:
 *
 *   ?lat=51.48&lon=-0.0&h=46      observer (h in metres)
 *   &t=2026-10-12T19:30:00Z        simulated time (ISO 8601)
 *   &view=map|sky|ar
 *   &sat=25544                     select a satellite
 *   &paused=1                      freeze the clock (screenshots, tests)
 */
import { clock } from './clock.ts'
import { locationFromQuery, urlLocation } from './observer.ts'
import { settings, updateSettings } from './settings.ts'
import { selected } from './tracker.ts'

export function applyUrlParams(search: string): void {
  const q = new URLSearchParams(search)
  const loc = locationFromQuery(search)
  if (loc) urlLocation.value = loc

  const t = q.get('t')
  if (t) {
    const ms = Date.parse(t)
    if (Number.isFinite(ms)) clock.set(ms)
  }
  if (q.get('paused') === '1') clock.pause()

  const view = q.get('view')
  if (view === 'map' || view === 'sky' || view === 'ar') {
    if (view !== settings.peek().view) updateSettings({ view })
  }

  const sat = Number(q.get('sat'))
  if (Number.isInteger(sat) && sat > 0) selected.value = sat
}

/** A link reproducing the current view: place, time, view and selection. */
export function shareUrl(base: string, opts: { lat: number; lon: number; ms: number; view: string; sat: number | null }): string {
  const u = new URL(base)
  u.search = ''
  u.searchParams.set('lat', opts.lat.toFixed(4))
  u.searchParams.set('lon', opts.lon.toFixed(4))
  u.searchParams.set('t', new Date(Math.round(opts.ms / 1000) * 1000).toISOString())
  u.searchParams.set('view', opts.view)
  if (opts.sat !== null) u.searchParams.set('sat', String(opts.sat))
  return u.toString()
}
