/** AR-only controls and messages: starting the camera and sensors, what is
 *  wrong if they don't start, and calibration. */
import { cameraStatus, orientation, startAr } from '../state/ar.ts'
import { calibrating } from '../state/calibration.ts'
import { settings } from '../state/settings.ts'
import { Calibration } from './Calibration.tsx'

export function ArOverlay() {
  const cam = cameraStatus.value
  const ori = orientation.status.value
  const kind = orientation.kind.value
  const accuracy = orientation.accuracy.value
  const notStarted = cam === 'idle' && ori === 'idle'
  const messages: string[] = []
  if (cam === 'denied') messages.push('Camera permission was refused, so the sky is drawn on black. Allow the camera for this site to see through it.')
  if (cam === 'unavailable') messages.push('No camera available. The sky is drawn on black.')
  if (ori === 'denied') messages.push('Motion sensors were refused. Use the Sky view instead, or allow motion access and try again.')
  if (ori === 'unavailable') messages.push('This device has no orientation sensors. The Sky view works without them.')
  if (kind === 'relative' && !settings.value.calibration.at) messages.push('This browser gives no compass heading: calibrate on a bright star to fix north.')
  if (accuracy !== null && accuracy > 20) messages.push(`Compass accuracy is poor (±${Math.round(accuracy)}°). Wave the phone in a figure of eight, or calibrate.`)

  if (calibrating.value) return <Calibration />

  return (
    <div class="ar-overlay">
      {notStarted ? (
        <button class="btn btn--big" onClick={() => void startAr()} data-testid="start-ar">
          Start camera and sensors
        </button>
      ) : (
        <>
          {messages.map((m) => (
            <p key={m} class="ar-overlay__msg">
              {m}
            </p>
          ))}
          {ori === 'active' && (
            <button class="chip" onClick={() => (calibrating.value = true)}>
              {settings.value.calibration.at ? 'Recalibrate' : 'Calibrate'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
