import { settings, updateSettings, DEFAULT_SETTINGS, type LabelDensity, type ShowFilter } from '../../state/settings.ts'
import { catalog } from '../../state/tracker.ts'
import { age, clockTime, dayLabel } from '../format.ts'
import { useWallClock } from '../hooks.ts'
import { LocationForm } from '../LocationForm.tsx'
import { Sheet } from '../Sheet.tsx'

const SHOW: { id: ShowFilter; label: string; hint: string }[] = [
  { id: 'naked-eye', label: 'Visible to the eye', hint: 'Sunlit, against a dark sky, and bright enough' },
  { id: 'sunlit', label: 'Sunlit', hint: 'Lit by the Sun, however faint' },
  { id: 'all', label: 'Everything above the horizon', hint: 'Including satellites in Earth’s shadow' },
]

const LABELS: { id: LabelDensity; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'few', label: 'Few' },
  { id: 'many', label: 'Many' },
]

export function SettingsPanel() {
  const s = settings.value
  const cat = catalog.value
  const packs = cat.index?.packs ?? []
  const enabled = new Set(s.packs ?? packs.filter((p) => p.default).map((p) => p.id))
  const generated = cat.index ? Date.parse(cat.index.generated) : null
  const wall = useWallClock(60_000)

  const togglePack = (id: string, on: boolean) => {
    const next = new Set(enabled)
    if (on) next.add(id)
    else next.delete(id)
    updateSettings({ packs: packs.map((p) => p.id).filter((p) => next.has(p)) })
  }

  return (
    <Sheet title="Settings" testId="settings-panel">
      <section class="group">
        <h3>Location</h3>
        <LocationForm />
      </section>

      <section class="group">
        <h3>Satellites</h3>
        {packs.length === 0 && <p class="muted">{cat.status === 'loading' ? 'Loading…' : 'No satellite data available.'}</p>}
        {packs.map((p) => (
          <label key={p.id} class="check">
            <input type="checkbox" checked={enabled.has(p.id)} onChange={(e) => togglePack(p.id, e.currentTarget.checked)} />
            <span>
              <strong>{p.title}</strong> <span class="muted">
                · {p.count.toLocaleString()} · {Math.max(1, Math.round((p.gzipBytes ?? p.bytes) / 1024))} KB
              </span>
              <br />
              <span class="muted small">{p.description}</span>
            </span>
          </label>
        ))}
      </section>

      <section class="group">
        <h3>Show</h3>
        {SHOW.map((o) => (
          <label key={o.id} class="check">
            <input type="radio" name="show" checked={s.show === o.id} onChange={() => updateSettings({ show: o.id })} />
            <span>
              {o.label}
              <br />
              <span class="muted small">{o.hint}</span>
            </span>
          </label>
        ))}
        <label class="field">
          <span>
            Faintest satellite: magnitude <strong>{s.limitingMag.toFixed(1)}</strong>
          </span>
          <input type="range" min={1} max={7} step={0.5} value={s.limitingMag} onInput={(e) => updateSettings({ limitingMag: Number(e.currentTarget.value) })} />
        </label>
        <div class="field">
          <span>Labels</span>
          <div class="row">
            {LABELS.map((l) => (
              <label key={l.id} class="seg">
                <input type="radio" name="labels" checked={s.labels === l.id} onChange={() => updateSettings({ labels: l.id })} /> {l.label}
              </label>
            ))}
          </div>
        </div>
        <label class="check">
          <input type="checkbox" checked={s.constellations} onChange={(e) => updateSettings({ constellations: e.currentTarget.checked })} />
          <span>Constellation lines</span>
        </label>
        <label class="check">
          <input type="checkbox" checked={s.grid} onChange={(e) => updateSettings({ grid: e.currentTarget.checked })} />
          <span>Altitude/azimuth grid</span>
        </label>
        <label class="field">
          <span>
            Faintest star: magnitude <strong>{s.starMag.toFixed(1)}</strong>
          </span>
          <input type="range" min={1} max={5.5} step={0.5} value={s.starMag} onInput={(e) => updateSettings({ starMag: Number(e.currentTarget.value) })} />
        </label>
        <label class="check">
          <input type="checkbox" checked={s.night} onChange={(e) => updateSettings({ night: e.currentTarget.checked })} />
          <span>
            Night mode
            <br />
            <span class="muted small">Red only, to keep your eyes dark-adapted</span>
          </span>
        </label>
      </section>

      <section class="group">
        <h3>AR camera</h3>
        <label class="field">
          <span>
            Camera field of view: <strong>{Math.round(s.cameraFovDeg)}°</strong> <span class="muted">(across the long side)</span>
          </span>
          <input type="range" min={40} max={100} step={1} value={s.cameraFovDeg} onInput={(e) => updateSettings({ cameraFovDeg: Number(e.currentTarget.value) })} />
        </label>
        <p class="muted small">
          {s.calibration.at
            ? `Calibrated ${dayLabel(s.calibration.at, wall).toLowerCase()} at ${clockTime(s.calibration.at)}: heading ${s.calibration.yawDeg >= 0 ? '+' : ''}${s.calibration.yawDeg.toFixed(1)}°, tilt ${s.calibration.pitchDeg >= 0 ? '+' : ''}${s.calibration.pitchDeg.toFixed(1)}°.`
            : 'Not calibrated: in AR, tap Calibrate and line up the Moon, a planet or a bright star.'}
        </p>
        <div class="row">
          <button class="btn btn--ghost" onClick={() => updateSettings({ calibration: DEFAULT_SETTINGS.calibration, cameraFovDeg: DEFAULT_SETTINGS.cameraFovDeg })}>
            Reset calibration
          </button>
        </div>
      </section>

      <section class="group">
        <h3>Data</h3>
        {generated !== null && (
          <p class={wall - generated > 3 * 86_400_000 ? 'warn' : ''}>
            Orbits updated {dayLabel(generated, wall).toLowerCase()} at {clockTime(generated)} ({age(wall - generated)}).
          </p>
        )}
        {cat.failed > 0 && <p class="muted small">{cat.failed} element sets could not be used.</p>}
        <ul class="small muted">
          {(cat.index?.sources ?? []).map((src) => (
            <li key={src}>{src}</li>
          ))}
        </ul>
      </section>
    </Sheet>
  )
}
