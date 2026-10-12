/**
 * "What did I see?": a light crossed the sky a few minutes ago. Say
 * roughly when, which way it went and how bright it was, and see which
 * satellites fit.
 */
import { useState } from 'preact/hooks'
import { displayName } from '../../core/names.ts'
import { rankRecall, type RecallMatch, type RecallQuery } from '../../core/recall.ts'
import { clock } from '../../state/clock.ts'
import { observer } from '../../state/observer.ts'
import { catalog, getTracker, indexByNorad, selected } from '../../state/tracker.ts'
import { panel } from '../../state/view.ts'
import { clockTime, magnitude } from '../format.ts'
import { passDirections, watchWindow } from '../passText.ts'
import { Sheet } from '../Sheet.tsx'

/** How far off the remembered time may be. */
const SLACK_MS = 5 * 60_000
const DIRECTIONS: [string, number][] = [
  ['N', 0],
  ['NE', 45],
  ['E', 90],
  ['SE', 135],
  ['S', 180],
  ['SW', 225],
  ['W', 270],
  ['NW', 315],
]

function DirectionPicker({ label, value, onChange }: { label: string; value: number | null; onChange: (az: number | null) => void }) {
  return (
    <fieldset class="recall__field">
      <legend>{label}</legend>
      <div class="row row--wrap">
        {DIRECTIONS.map(([name, az]) => (
          <button key={name} type="button" class={`chip ${value === az ? 'chip--on' : ''}`} aria-pressed={value === az} onClick={() => onChange(value === az ? null : az)}>
            {name}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export function RecallPanel() {
  const cat = catalog.value
  const obs = observer.value
  const [minutesAgo, setMinutesAgo] = useState(3)
  const [fromAz, setFromAz] = useState<number | null>(null)
  const [toAz, setToAz] = useState<number | null>(null)
  const [brightness, setBrightness] = useState<RecallQuery['brightness']>(null)
  const [results, setResults] = useState<RecallMatch[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seenAt = clock.now() - minutesAgo * 60_000

  const search = async () => {
    setBusy(true)
    setError(null)
    try {
      const passes = await getTracker().client.request('recall', { ms: seenAt, slackMs: SLACK_MS })
      setResults(rankRecall(passes, { ms: seenAt, slackMs: SLACK_MS, fromAz, toAz, brightness }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const name = (norad: number) => {
    const i = indexByNorad.value.get(norad)
    const s = i === undefined ? undefined : cat.sats[i]
    return s ? displayName(s) : `#${norad}`
  }

  return (
    <Sheet title="What did I see?" testId="recall-panel">
      <p class="muted small">Saw a steady light moving across the sky? Say what you remember; leave out what you don’t.</p>
      <label class="field">
        <span>
          When: <strong>{minutesAgo === 0 ? 'just now' : `${minutesAgo} min ago`}</strong> <span class="muted">({clockTime(seenAt)})</span>
        </span>
        <input type="range" min={0} max={60} step={1} value={minutesAgo} onInput={(e) => setMinutesAgo(Number(e.currentTarget.value))} />
      </label>
      <DirectionPicker label="It came from" value={fromAz} onChange={setFromAz} />
      <DirectionPicker label="It went towards" value={toAz} onChange={setToAz} />
      <fieldset class="recall__field">
        <legend>How bright</legend>
        <div class="row row--wrap">
          {(
            [
              ['bright', 'Bright, like the brightest stars'],
              ['faint', 'Faint, only just visible'],
            ] as const
          ).map(([value, words]) => (
            <button key={value} type="button" class={`chip ${brightness === value ? 'chip--on' : ''}`} aria-pressed={brightness === value} onClick={() => setBrightness(brightness === value ? null : value)}>
              {words}
            </button>
          ))}
        </div>
      </fieldset>
      <div class="row">
        <button class="btn" onClick={() => void search()} disabled={busy || !obs || cat.status !== 'ready'}>
          {busy ? 'Searching…' : 'Find it'}
        </button>
      </div>
      {error && <p class="warn">{error}</p>}
      {results && results.length === 0 && (
        <p class="muted">No sunlit satellite crossed your sky then. If it blinked or had coloured lights it was probably a plane; a slow, bright, steady one could be a planet or a balloon.</p>
      )}
      {results && results.length > 0 && (
        <ol class="passes" data-testid="recall-results">
          {results.map(({ pass: p }) => {
            const w = watchWindow(p)
            return (
              <li key={`${p.norad}-${w.start.ms}`} class="pass">
                <button
                  class="pass__main"
                  onClick={() => {
                    selected.value = p.norad
                    clock.set(w.start.ms)
                    panel.value = 'none'
                  }}
                >
                  <span class="pass__when">
                    <strong>{clockTime(w.start.ms)}</strong>
                    <span class="muted">to {clockTime(w.end.ms)}</span>
                  </span>
                  <span class="pass__what">
                    <strong>{name(p.norad)}</strong>
                    <span class="muted">
                      {passDirections(p)} · up to {Math.round(w.max.el)}°
                    </span>
                  </span>
                  <span class="pass__mag" title="Magnitude: lower is brighter">
                    {magnitude(p.visible?.brightest?.mag ?? null)}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
      {results && results.length > 0 && <p class="muted small">Best match first. Tap one to rewind to it.</p>}
    </Sheet>
  )
}
