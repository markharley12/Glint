import { useState } from 'preact/hooks'
import { displayName, isStation, matchesQuery } from '../../core/names.ts'
import { catalog, selected } from '../../state/tracker.ts'
import { panel } from '../../state/view.ts'
import { Sheet } from '../Sheet.tsx'

const MAX_RESULTS = 60

export function SearchPanel() {
  const [q, setQ] = useState('')
  const sats = catalog.value.sats
  const results = q.trim() ? sats.filter((s) => matchesQuery(s, q)).slice(0, MAX_RESULTS) : sats.filter(isStation)

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
      {!q.trim() && <p class="muted small">Space stations:</p>}
      <ul class="results">
        {results.map((s) => (
          <li key={s.norad}>
            <button
              onClick={() => {
                selected.value = s.norad
                panel.value = 'none'
              }}
            >
              <strong>{displayName(s)}</strong>
              <span class="muted">
                {displayName(s) !== s.name ? `${s.name} · ` : ''}#{s.norad} · {s.intlDes}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {q.trim() && results.length === 0 && <p class="muted">Nothing matches “{q}” in the loaded satellites. More sets can be switched on in Settings.</p>}
    </Sheet>
  )
}
