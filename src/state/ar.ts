/**
 * The AR session: camera feed plus orientation sensors, started together
 * (from a tap, for iOS's sake) and stopped together.
 */
import { signal } from '@preact/signals'
import { cameraErrorStatus, startCamera, stopCamera, type CameraStatus } from '../sensors/camera.ts'
import { OrientationSource } from '../sensors/orientation.ts'

export const orientation = new OrientationSource()
export const cameraStatus = signal<CameraStatus>('idle')

let video: HTMLVideoElement | null = null
let stream: MediaStream | null = null

/** SkyView hands over its <video> element when it mounts. */
export function registerVideo(el: HTMLVideoElement | null): void {
  video = el
}

/** Start the camera and sensors. Call from a user gesture. The sensors
 *  start first: iOS's permission prompt must come straight from the tap,
 *  before any other await. */
export async function startAr(): Promise<void> {
  const sensors = orientation.start()
  if (video && cameraStatus.peek() !== 'active') {
    cameraStatus.value = 'starting'
    try {
      stream = await startCamera(video)
      cameraStatus.value = 'active'
    } catch (e) {
      cameraStatus.value = cameraErrorStatus(e)
    }
  }
  await sensors
}

export function stopAr(): void {
  orientation.stop()
  stopCamera(stream)
  stream = null
  if (video) video.srcObject = null
  cameraStatus.value = 'idle'
}
