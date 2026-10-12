/**
 * The sky canvas and its render loop, for all three views:
 * - map: the polar sky chart (works everywhere, no sensors);
 * - sky: a planetarium you drag around and pinch to zoom;
 * - ar: the camera feed with the sky drawn over it, steered by the phone's
 *   sensors.
 */
import { useEffect, useRef } from 'preact/hooks'
import { declination } from '../core/declination.ts'
import { enuToHorizontal } from '../core/frames.ts'
import { clamp, quat, type Quat } from '../core/vec.ts'
import { coverFocalLength } from '../sensors/camera.ts'
import { correct, OrientationFilter, screenAdjust } from '../sensors/orientation-math.ts'
import { screenAngle } from '../sensors/orientation.ts'
import { CelestialCache } from '../sky/celestial.ts'
import { NIGHT, NORMAL } from '../sky/palette.ts'
import { lookAt, PerspectiveProjector, PolarProjector, type Projector } from '../sky/projection.ts'
import { apparent, satellitePosition, SkyRenderer, type HitTarget } from '../sky/renderer.ts'
import { orientation, registerVideo } from '../state/ar.ts'
import { calibrating, calibrationTarget } from '../state/calibration.ts'
import { clock } from '../state/clock.ts'
import { recordPointing } from '../state/identify.ts'
import { observer } from '../state/observer.ts'
import { settings, updateSettings } from '../state/settings.ts'
import { catalog, getTracker, indexByNorad, selected } from '../state/tracker.ts'
import { following, lookDirection, renderStats, tooltip, track } from '../state/view.ts'

/** How far the track reaches either side of now. */
const TRACK_BEFORE_MS = 8 * 60_000
const TRACK_AFTER_MS = 16 * 60_000
const TRACK_STEP_MS = 10_000

/** The camera orientation the AR view is using right now; read by the
 *  calibration panel. */
export const arCamera: { q: Quat | null } = { q: null }

export function SkyView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const mode = settings.value.view

  useEffect(() => {
    registerVideo(videoRef.current)
    return () => registerVideo(null)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d', { alpha: true })!
    const renderer = new SkyRenderer(ctx)
    const celestial = new CelestialCache()
    const filter = new OrientationFilter()
    const tracker = getTracker()
    let width = 0
    let height = 0
    let dpr = 1
    let raf = 0
    let lastStats = 0
    let lastSampleT = -1
    let filtered: Quat | null = null
    let trackRequest = 0
    let decl = { key: '', value: 0 }

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 3)
      width = Math.max(1, r.width)
      height = Math.max(1, r.height)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const declinationFor = (lat: number, lon: number, h: number, ms: number) => {
      // The field changes by arcminutes per year: once per place is plenty.
      const key = `${lat.toFixed(2)},${lon.toFixed(2)}`
      if (decl.key !== key) decl = { key, value: declination(lat, lon, h, new Date(ms)) }
      return decl.value
    }

    const projectorFor = (now: number): Projector => {
      const s = settings.peek()
      if (s.view === 'map') return new PolarProjector(width, height)
      if (s.view === 'sky') {
        const { az, el } = lookDirection.peek()
        return new PerspectiveProjector(width, height, lookAt(az, el), s.skyFovDeg)
      }
      // AR: sensor orientation, corrected for screen rotation, true north
      // and calibration.
      const sample = orientation.latest
      if (sample && sample.t !== lastSampleT) {
        lastSampleT = sample.t
        filtered = filter.update(screenAdjust(sample.q, screenAngle()), sample.t)
      }
      const o = observer.peek()
      let q: Quat
      if (filtered && o) {
        const d = declinationFor(o.latitude, o.longitude, o.height, now)
        q = correct(filtered, d + s.calibration.yawDeg, s.calibration.pitchDeg)
      } else {
        const { az, el } = lookDirection.peek()
        q = lookAt(az, el)
      }
      arCamera.q = q
      const v = videoRef.current
      const f =
        v && v.videoWidth > 0
          ? coverFocalLength(v.videoWidth, v.videoHeight, width, height, s.cameraFovDeg)
          : height / 2 / Math.tan(((s.cameraFovDeg * 0.75) / 2) * (Math.PI / 180))
      return PerspectiveProjector.withFocal(width, height, q, f)
    }

    const maybeRequestTrack = (now: number) => {
      const sel = selected.peek()
      const t = track.peek()
      if (sel === null) {
        if (t) track.value = null
        return
      }
      const fresh = t && t.norad === sel && now > t.startMs + 2 * 60_000 && now < t.endMs - 4 * 60_000
      if (fresh) return
      const reqId = ++trackRequest
      const startMs = now - TRACK_BEFORE_MS
      const endMs = now + TRACK_AFTER_MS
      // Mark as pending so we don't re-request every frame.
      track.value = { norad: sel, startMs: now - 3 * 60_000, endMs: now + 7 * 60_000, points: t?.norad === sel ? t.points : [] }
      void tracker.client
        .request('track', { norad: sel, startMs, endMs, stepMs: TRACK_STEP_MS })
        .then((points) => {
          if (reqId === trackRequest) track.value = { norad: sel, startMs, endMs, points }
        })
        .catch(() => undefined)
    }

    /** In the Sky view, keep the followed satellite centred. */
    const follow = (now: number) => {
      if (!following.peek()) return
      const sel = selected.peek()
      const tick = tracker.latest
      const i = sel === null ? undefined : indexByNorad.peek().get(sel)
      if (i === undefined || settings.peek().view !== 'sky') {
        following.value = false
        return
      }
      const v = tick && satellitePosition(tick, i, now)
      if (!v) return // below the horizon, or not computed yet: hold still
      const { az, el } = enuToHorizontal(apparent(v))
      lookDirection.value = { az, el: clamp(el, -20, 90) }
    }

    const frame = () => {
      raf = requestAnimationFrame(frame)
      const now = clock.now()
      tracker.pump(now)
      follow(now)
      const o = observer.peek()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (!o) {
        ctx.clearRect(0, 0, width, height)
        return
      }
      if (catalog.peek().status === 'ready') maybeRequestTrack(now)
      const s = settings.peek()
      const sky = celestial.get(now, o)
      const projector = projectorFor(now)
      if (s.view === 'ar' && arCamera.q) recordPointing(now, quat.rotate(arCamera.q, [0, 0, -1]))
      const t = track.peek()
      renderer.render({
        ms: now,
        projector,
        mode: s.view,
        palette: s.night ? NIGHT : NORMAL,
        settings: s,
        eqjToEnu: sky.eqjToEnu,
        bodies: sky.bodies,
        sunEl: sky.sunEl,
        tick: tracker.latest,
        sats: catalog.peek().sats,
        selected: selected.peek(),
        track: t && t.norad === selected.peek() ? t.points : null,
        highlight: calibrating.peek() ? calibrationTarget.peek() : null,
      })
      const real = performance.now()
      if (real - lastStats > 400) {
        lastStats = real
        renderStats.value = { ...renderer.stats, sunEl: sky.sunEl }
      }
    }

    const onVisibility = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) raf = requestAnimationFrame(frame)
    }
    document.addEventListener('visibilitychange', onVisibility)
    raf = requestAnimationFrame(frame)

    // --- interaction -----------------------------------------------------------
    const pointers = new Map<number, { x: number; y: number; x0: number; y0: number }>()
    let pinchStart: { dist: number; fov: number } | null = null
    let moved = false

    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      const p = local(e)
      pointers.set(e.pointerId, { ...p, x0: p.x, y0: p.y })
      moved = false
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinchStart = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), fov: settings.peek().skyFovDeg }
      }
    }

    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId)
      if (!prev) return
      const p = local(e)
      const dx = p.x - prev.x
      const dy = p.y - prev.y
      prev.x = p.x
      prev.y = p.y
      if (Math.hypot(p.x - prev.x0, p.y - prev.y0) > 6) moved = true
      const s = settings.peek()
      if (s.view !== 'sky') return
      if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()]
        const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y)
        updateSettings({ skyFovDeg: clamp((pinchStart.fov * pinchStart.dist) / Math.max(dist, 1), 5, 150) })
        return
      }
      if (pointers.size !== 1) return
      if (moved) following.value = false
      // "Grab the sky": dragging right turns the view left.
      const pxPerDeg = height / 2 / Math.tan((s.skyFovDeg * Math.PI) / 360) * (Math.PI / 180)
      const { az, el } = lookDirection.peek()
      lookDirection.value = {
        az: (((az - dx / pxPerDeg / Math.max(0.2, Math.cos((el * Math.PI) / 180))) % 360) + 360) % 360,
        el: clamp(el + dy / pxPerDeg, -20, 90),
      }
    }

    const onUp = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId)
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinchStart = null
      if (!p || moved || pointers.size > 0) return
      const hit = renderer.hitTest(p.x, p.y, e.pointerType === 'mouse' ? 12 : 24)
      onTap(hit, p.x, p.y)
    }

    const onWheel = (e: WheelEvent) => {
      if (settings.peek().view !== 'sky') return
      e.preventDefault()
      updateSettings({ skyFovDeg: clamp(settings.peek().skyFovDeg * Math.exp(e.deltaY * 0.001), 5, 150) })
    }

    const onTap = (hit: HitTarget | null, x: number, y: number) => {
      if (!hit) {
        selected.value = null
        tooltip.value = null
        return
      }
      if (hit.kind === 'sat') {
        selected.value = hit.id as number
        tooltip.value = null
      } else {
        tooltip.value = { text: String(hit.id), x, y }
        setTimeout(() => {
          if (tooltip.peek()?.text === String(hit.id)) tooltip.value = null
        }, 2500)
      }
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [])

  const tt = tooltip.value
  return (
    <div class={`sky sky--${mode}`}>
      <video ref={videoRef} class="sky__video" hidden={mode !== 'ar'} playsInline muted aria-hidden="true" />
      <canvas
        ref={canvasRef}
        class="sky__canvas"
        role="img"
        aria-label={mode === 'map' ? 'Sky chart of satellites overhead' : 'View of the sky with satellites'}
        data-testid="sky-canvas"
      />
      {tt && (
        <div class="tooltip" style={{ left: `${tt.x}px`, top: `${tt.y}px` }}>
          {tt.text}
        </div>
      )}
    </div>
  )
}

/** Point the planetarium at a direction (e.g. a selected satellite). */
export function lookTowards(az: number, el: number): void {
  lookDirection.value = { az, el: clamp(el, -20, 90) }
}
