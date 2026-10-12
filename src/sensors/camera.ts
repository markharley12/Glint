/**
 * The rear camera feed behind the AR view, and the focal length that maps
 * it onto the screen.
 */
import { DEG } from '../core/vec.ts'

export type CameraStatus = 'idle' | 'starting' | 'active' | 'denied' | 'unavailable'

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      // Resolution matters little for an overlay; frame rate and battery do.
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
  })
  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play()
  return stream
}

export function stopCamera(stream: MediaStream | null): void {
  for (const t of stream?.getTracks() ?? []) t.stop()
}

export function cameraErrorStatus(e: unknown): CameraStatus {
  const name = e instanceof DOMException ? e.name : ''
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable'
}

/**
 * Focal length in CSS pixels of a video shown with `object-fit: cover` in
 * a `viewW` × `viewH` box. `fovLongDeg` is the camera's field of view
 * across the long side of its frame. Phones crop 4:3 sensors to 16:9 by
 * trimming the short side, so the long side keeps the sensor's full field.
 */
export function coverFocalLength(videoW: number, videoH: number, viewW: number, viewH: number, fovLongDeg: number): number {
  const long = Math.max(videoW, videoH)
  const fVideo = long / 2 / Math.tan((fovLongDeg * DEG) / 2)
  const scale = Math.max(viewW / videoW, viewH / videoH)
  return fVideo * scale
}
