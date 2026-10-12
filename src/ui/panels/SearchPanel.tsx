import { useState } from 'preact/hooks'
import { displayName, isStation, matchesQuery } from '../../core/names.ts'
import type { SatelliteInfo } from '../../core/satellite.ts'
import { visibleNow } from '../../sky/up-now.ts'
import { clock } from '../../state/clock.ts'
import { settings } from '../../state/settings.ts'
import { catalog, getTracker, selected } from '../../state/tracker.ts'
import { panel, renderStats } from '../../state/view.ts'
import { compass, magnitude } from '../format.ts'
import { useNow } from '../hooks.ts'
import { Sheet } from '../Sheet.tsx'

const MAX_RESULTS = 60

function Result({ sat, detail }: { sat: SatelliteInfo; detail: string }) {
  return (
    <li>
      <button
        onClick={() => {
          selected.value = sat.norad
          panel.value = 'none'
        }}
      >
        <strong>{displayName(sat)}</strong>
        <span class="muted">{detail}</span>
      </button>
    </li>
  )
}

const ids = (s: SatelliteInfo) => `${displayName(s) !== s.name ? `${s.name} · ` : ''}#${s.norad} · ${s.intlDes}`

export function SearchPanel() {
  const [q, setQ] = useState('')
  const sats = catalog.value.sats
  const query = q.trim()
  const results = query ? sats.filter((s) => matchesQuery(s, q)).slice(0, MAX_RESULTS) : sats.filter(isStation)
  // Re-read every couple of seconds while the panel is open.
  useNow(2000)
  const tick = getTracker().latest
  const up = !query && tick ? visibleNow(tick, sats, clock.now(), renderStats.value.sunEl, settings.value.limitingMag) : []

  return (
    <Sheet title="Find a satellite" testId="search-panel">
      <input
        class="search"
        type="search"
        placeholder="Name, NORAD number or launch (e.g. ISS, 25544, 2024-)"
        value={q}
        onInput={(e) => setQ(e.currentTarget.value)}
        autoFocus
        aria-label="Search satellites"
      />
      {!query && (
        <p class="small">
          Saw something earlier?{' '}
          <button class="link" onClick={() => (panel.value = 'recall')}>
            Work out what it was
          </button>
        </p>
      )}
      {up.length > 0 && (
        <>
          <h3 class="results__head">Visible now</h3>
          <ul class="results" data-testid="visible-now">
            {up.map((u) => (
              <Result key={u.sat.norad} sat={u.sat} detail={`${Math.round(u.el)}° up in the ${compass(u.az)} · mag ${magnitude(u.mag)}`} />
            ))}
          </ul>
        </>
      )}
      {!query && <h3 class="results__head">Space stations</h3>}
      <ul class="results">
        {results.map((s) => (
          <Result key={s.norad} sat={s} detail={ids(s)} />
        ))}
      </ul>
      {query && results.length === 0 && <p class="muted">Nothing matches “{q}” in the loaded satellites. More sets can be switched on in Settings.</p>}
    </Sheet>
  )
}
