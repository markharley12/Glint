/**
 * Calibration overlay: pick a bright object, put the real one in the
 * crosshair, tap Lock. The sky drawing rings where the app currently thinks
 * the object is, so the size of the error is visible before and after.
 */
import { useEffect, useMemo } from 'preact/hooks'
import { calibrationTargets, solveCorrection } from '../core/calibration.ts'
import { getStars } from '../core/sky.ts'
import { CelestialCache } from '../sky/celestial.ts'
import { viewDirection } from '../sky/projection.ts'
import { calibrating, calibrationTarget } from '../state/calibration.ts'
import { clock } from '../state/clock.ts'
import { observer } from '../state/observer.ts'
import { settings, updateSettings } from '../state/settings.ts'
import { showToast } from '../state/view.ts'
import { useNow } from './hooks.ts'
import { arCamera } from './SkyView.tsx'

export function Calibration() {
  const now = useNow(1000)
  const obs = observer.value
  const cache = useMemo(() => new CelestialCache(), [])
  const targets = useMemo(() => {
    if (!obs) return []
    const c = cache.get(now, obs)
    return calibrationTargets(c.eqjToEnu, c.bodies, getStars(), c.sunEl).slice(0, 8)
  }, [now, obs, cache])
  const chosen = calibrationTarget.value

  useEffect(() => {
    // Default to the best target; keep the user's pick while it stays up.
    if (targets.length && (!chosen || !targets.some((t) => t.name === chosen))) calibrationTarget.value = targets[0]!.name
  }, [targets, chosen])
  useEffect(() => () => void (calibrationTarget.value = null), [])

  const lock = () => {
    const target = targets.find((t) => t.name === chosen)
    const q = arCamera.q
    if (!target || !q) return
    const aim = viewDirection(q)
    const c = solveCorrection(settings.peek().calibration, aim, target)
    updateSettings({ calibration: { ...c, at: clock.now() } })
    calibrating.value = false
    showToast(`Calibrated on ${target.name}: heading ${c.yawDeg >= 0 ? '+' : ''}${c.yawDeg.toFixed(1)}°, tilt ${c.pitchDeg >= 0 ? '+' : ''}${c.pitchDeg.toFixed(1)}°`)
  }

  return (
    <div class="calibration" data-testid="calibration">
      <div class="crosshair" aria-hidden="true" />
      <div class="calibration__panel">
        {targets.length === 0 ? (
          <p>Nothing bright enough is up to calibrate on. The Moon works by day; at night, bright stars and planets.</p>
        ) : (
          <>
            <p>
              Put the real <strong>{chosen}</strong> in the crosshair, hold still, then tap Lock. The dashed ring shows where the app thinks it is.
            </p>
            <div class="row row--wrap">
              {targets.map((t) => (
                <button key={t.name} class={`chip ${t.name === chosen ? 'chip--on' : ''}`} onClick={() => (calibrationTarget.value = t.name)}>
                  {t.name}
                </button>
              ))}
            </div>
          </>
        )}
        <div class="row">
          <button class="btn" onClick={lock} disabled={!chosen || targets.length === 0}>
            Lock
          </button>
          <button class="btn btn--ghost" onClick={() => (calibrating.value = false)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
