/**
 * Draws the sky — background, horizon, grid, constellations, stars, Sun,
 * Moon, planets and satellites — through any Projector onto a 2D canvas,
 * and records what it drew where so taps can be resolved.
 *
 * Everything is drawn at its *apparent* elevation (geometric plus
 * refraction), the way it looks, which matters within a few degrees of the
 * horizon where refraction lifts things by up to half a degree.
 */
import { horizontalToEnu, refraction } from '../core/frames.ts'
import { displayName, isStation } from '../core/names.ts'
import type { SatelliteInfo } from '../core/satellite.ts'
import { getConstellations, getStars, type BodyPosition } from '../core/sky.ts'
import { findTrains, recentLaunch, TRAIN_MAX_AGE_MS, trainName, type TrainCandidate } from '../core/trains.ts'
import { DEG, RAD, type Mat3, type Vec3 } from '../core/vec.ts'
import type { Settings, ViewMode } from '../state/settings.ts'
import { Slot, STRIDE } from '../worker/layout.ts'
import type { TickData, TrackPoint } from '../worker/protocol.ts'
import { placeLabels, type LabelRequest } from './labels.ts'
import { skyColour, starColour, type Palette } from './palette.ts'
import { PerspectiveProjector, PolarProjector, type Point, type Projector } from './projection.ts'
import { appearance, DARK_ENOUGH_SUN_EL, satRadius, starRadius } from './visibility.ts'

export interface SkyFrame {
  ms: number
  projector: Projector
  mode: ViewMode
  palette: Palette
  settings: Settings
  /** J2000 → ENU rotation for this instant. */
  eqjToEnu: Mat3
  bodies: BodyPosition[]
  sunEl: number
  tick: TickData | null
  sats: SatelliteInfo[]
  selected: number | null
  track: TrackPoint[] | null
  /** Ring this object's predicted position (calibration). */
  highlight?: string | null
}

export type HitKind = 'sat' | 'body' | 'star'

export interface HitTarget {
  kind: HitKind
  /** NORAD number for satellites, name for bodies and stars. */
  id: number | string
  x: number
  y: number
  /** Drawn radius, px. */
  r: number
  /** Higher wins ties: bright and visible satellites over faint ones. */
  priority: number
}

export interface RenderStats {
  /** Satellites above the horizon that pass the show filter, whole sky. */
  up: number
  /** Naked-eye visible satellites, whole sky. */
  visible: number
  /** Satellites drawn on screen this frame. */
  drawn: number
  /** Where the selected satellite is, if it is up: on screen or not. */
  selectedOnScreen: boolean | null
}

/** Satellite `i`'s position relative to the observer (ENU km) at `ms`,
 *  extrapolated from the tick, or null if the tick has it below the
 *  horizon unpropagated. */
export function satellitePosition(tick: TickData, i: number, ms: number): Vec3 | null {
  const o = i * STRIDE
  const b = tick.buffer
  if (o + STRIDE > b.length || Number.isNaN(b[o]!)) return null
  const dt = (ms - tick.ms) / 1000
  return [b[o]! + b[o + Slot.VE]! * dt, b[o + Slot.N]! + b[o + Slot.VN]! * dt, b[o + Slot.U]! + b[o + Slot.VU]! * dt]
}

/** Geometric ENU direction → apparent (refracted) unit vector. */
export function apparent(v: Vec3): Vec3 {
  const h = Math.hypot(v[0], v[1])
  const r = Math.hypot(h, v[2])
  const el = Math.asin(v[2] / r) * RAD
  const elA = (el + refraction(el)) * DEG
  if (h === 0) return [0, 0, 1]
  const c = Math.cos(elA)
  return [(v[0] / h) * c, (v[1] / h) * c, Math.sin(elA)]
}

/** A satellite placed on screen this frame, between the two drawing passes. */
interface SatDrawable {
  index: number
  x: number
  y: number
  r: number
  trail: Point | null
  sunlit: number
  mag: number
  visible: boolean
  station: boolean
  selected: boolean
  /** Hidden by the show filter, but placed in case it belongs to a train:
   *  drawn only if it does. */
  trainOnly: boolean
}

/** The sky turns this fast, degrees per millisecond (sidereal rate). */
const SIDEREAL_DEG_PER_MS = 360 / 86_164_090.5
/** Redraw the cached star layer once the sky has turned this far on
 *  screen, px. */
const LAYER_MAX_DRIFT_PX = 0.25

/** The slow-changing background (sky colour, grid, constellations, stars),
 *  drawn once into its own canvas and reused while the view holds still. */
interface SkyLayer {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  key: string
  ms: number
  hits: HitTarget[]
}

/** Trail length behind each satellite: this many seconds of motion, but
 *  no longer than TRAIL_MAX_PX on screen. */
const TRAIL_S = 15
const TRAIL_MAX_PX = 34

const mul = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
]

export class SkyRenderer {
  private ctx: CanvasRenderingContext2D
  hits: HitTarget[] = []
  stats: RenderStats = { up: 0, visible: 0, drawn: 0, selectedOnScreen: null }
  private p: Point = { x: 0, y: 0 }
  private q: Point = { x: 0, y: 0 }
  private launchCache: { sats: SatelliteInfo[]; day: number; keys: (string | null)[] } | null = null
  private layer: SkyLayer | null = null
  /** Times the star layer was redrawn, for tests and tuning. */
  layerDraws = 0

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx
  }

  render(f: SkyFrame): void {
    const { ctx } = this
    const { projector: pr } = f
    this.hits = []
    this.stats = { up: 0, visible: 0, drawn: 0, selectedOnScreen: null }
    ctx.clearRect(0, 0, pr.width, pr.height)

    this.drawSkyLayer(f)
    ctx.save()
    this.clipToSky(pr)
    const labels: LabelRequest[] = []
    this.drawBodies(f, labels)
    if (f.track) this.drawTrack(f)
    this.drawSatellites(f, labels)
    if (f.highlight) this.drawHighlight(f, f.highlight)
    if (pr instanceof PerspectiveProjector) this.drawGround(f, pr)
    ctx.restore()

    if (pr instanceof PolarProjector) this.drawPolarRim(f, pr)
    else this.drawCardinals(f)
    this.drawLabels(f, labels)
    if (pr instanceof PerspectiveProjector && f.selected !== null && this.stats.selectedOnScreen === false) {
      this.drawOffscreenArrow(f, pr)
    }
  }

  private clipToSky(pr: Projector): void {
    if (!(pr instanceof PolarProjector)) return
    const { ctx } = this
    ctx.beginPath()
    ctx.arc(pr.cx, pr.cy, pr.radius, 0, 2 * Math.PI)
    ctx.clip()
  }

  /** Background, grid, constellations and stars. In AR the view moves
   *  every frame, so they are drawn directly; otherwise into a cached layer
   *  that is redrawn only when the view, the settings or the sky's
   *  brightness change, or the sky has turned a fraction of a pixel. */
  private drawSkyLayer(f: SkyFrame): void {
    const pr = f.projector
    const draw = () => {
      this.drawBackground(f)
      this.ctx.save()
      this.clipToSky(pr)
      if (f.settings.grid) this.drawGrid(f)
      if (f.settings.constellations && f.mode !== 'ar') this.drawConstellations(f)
      this.drawStars(f)
      this.ctx.restore()
    }
    if (f.mode === 'ar') {
      draw()
      return
    }
    const main = this.ctx
    const dpr = main.getTransform().a || 1
    const s = f.settings
    const view = pr instanceof PerspectiveProjector ? `${pr.orientation.join(',')}:${pr.f}` : 'polar'
    const key = [pr.width, pr.height, dpr, view, f.palette.page, s.grid, s.constellations, s.starMag, Math.round(f.sunEl * 4)].join('|')
    const maxAgeMs = LAYER_MAX_DRIFT_PX / (pr.pxPerDeg * SIDEREAL_DEG_PER_MS)
    let layer = this.layer
    if (layer && layer.key === key && Math.abs(f.ms - layer.ms) < maxAgeMs) {
      this.hits.push(...layer.hits)
    } else {
      if (!layer) {
        const canvas = document.createElement('canvas')
        layer = this.layer = { canvas, ctx: canvas.getContext('2d')!, key: '', ms: 0, hits: [] }
      }
      const w = Math.round(pr.width * dpr)
      const h = Math.round(pr.height * dpr)
      if (layer.canvas.width !== w || layer.canvas.height !== h) {
        layer.canvas.width = w
        layer.canvas.height = h
      }
      layer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      layer.ctx.clearRect(0, 0, pr.width, pr.height)
      const before = this.hits.length
      this.ctx = layer.ctx
      try {
        draw()
      } finally {
        this.ctx = main
      }
      layer.hits = this.hits.slice(before)
      layer.key = key
      layer.ms = f.ms
      this.layerDraws++
    }
    main.drawImage(layer.canvas, 0, 0, pr.width, pr.height)
  }

  // --- background, ground and grid -----------------------------------------

  private drawBackground(f: SkyFrame): void {
    const { ctx } = this
    const pr = f.projector
    if (f.mode === 'ar') return // the camera feed is the background
    const sky = skyColour(f.palette, f.sunEl)
    if (pr instanceof PolarProjector) {
      ctx.fillStyle = f.palette.page
      ctx.fillRect(0, 0, pr.width, pr.height)
      ctx.beginPath()
      ctx.arc(pr.cx, pr.cy, pr.radius, 0, 2 * Math.PI)
      ctx.fillStyle = sky
      ctx.fill()
    } else {
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, pr.width, pr.height)
    }
  }

  /** Below-horizon fill for the perspective views: the screen rectangle
   *  clipped to the ground side of the horizon line. Drawn over the sky
   *  objects so that anything below the horizon is hidden by the ground. */
  private drawGround(f: SkyFrame, pr: PerspectiveProjector): void {
    const { a, b, c } = pr.horizonLine()
    const g = (x: number, y: number) => a * x + b * y + c
    const corners: [number, number][] = [
      [0, 0],
      [pr.width, 0],
      [pr.width, pr.height],
      [0, pr.height],
    ]
    // Sutherland–Hodgman against the one half-plane g < 0.
    const poly: [number, number][] = []
    for (let i = 0; i < 4; i++) {
      const [x0, y0] = corners[i]!
      const [x1, y1] = corners[(i + 1) % 4]!
      const g0 = g(x0, y0)
      const g1 = g(x1, y1)
      if (g0 < 0) poly.push([x0, y0])
      if (g0 < 0 !== g1 < 0) {
        const t = g0 / (g0 - g1)
        poly.push([x0 + t * (x1 - x0), y0 + t * (y1 - y0)])
      }
    }
    if (poly.length < 3) return
    const { ctx } = this
    ctx.beginPath()
    ctx.moveTo(poly[0]![0], poly[0]![1])
    for (const [x, y] of poly.slice(1)) ctx.lineTo(x, y)
    ctx.closePath()
    ctx.fillStyle = f.mode === 'ar' ? f.palette.groundAr : f.palette.ground
    ctx.fill()
    // The horizon itself: the edge of that polygon that lies on g = 0.
    ctx.beginPath()
    let started = false
    for (const [x, y] of poly) {
      if (Math.abs(g(x, y)) < 1e-6) {
        if (!started) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
        started = true
      }
    }
    ctx.strokeStyle = f.palette.horizon
    ctx.lineWidth = 1.2
    ctx.stroke()
  }

  /** Stroke a path through sky directions, breaking it wherever a point
   *  can't be projected or consecutive points jump implausibly far. */
  private strokeSkyPath(pr: Projector, pts: Vec3[], close = false): void {
    const { ctx, p } = this
    const maxJump = Math.max(pr.width, pr.height) * 0.5
    let prevOk = false
    let px = 0
    let py = 0
    ctx.beginPath()
    const n = close ? pts.length + 1 : pts.length
    for (let i = 0; i < n; i++) {
      const ok = pr.project(pts[i % pts.length]!, p)
      if (ok && prevOk && Math.hypot(p.x - px, p.y - py) < maxJump) ctx.lineTo(p.x, p.y)
      else if (ok) ctx.moveTo(p.x, p.y)
      prevOk = ok
      px = p.x
      py = p.y
    }
    ctx.stroke()
  }

  private drawGrid(f: SkyFrame): void {
    const { ctx } = this
    const pr = f.projector
    ctx.strokeStyle = f.palette.grid
    ctx.lineWidth = 1
    // Altitude circles every 30° (every 15° when zoomed in).
    const altStep = pr.pxPerDeg > 12 ? 15 : 30
    for (let el = altStep; el < 90; el += altStep) {
      const pts: Vec3[] = []
      for (let az = 0; az < 360; az += 2) pts.push(horizontalToEnu(az, el))
      this.strokeSkyPath(pr, pts, true)
    }
    // Azimuth lines every 30°, horizon to near the zenith.
    for (let az = 0; az < 360; az += 30) {
      const pts: Vec3[] = []
      for (let el = 0; el <= 88; el += 2) pts.push(horizontalToEnu(az, el))
      this.strokeSkyPath(pr, pts)
    }
    // The horizon itself in the polar map is the rim; in perspective views
    // drawGround draws it.
  }

  private drawPolarRim(f: SkyFrame, pr: PolarProjector): void {
    const { ctx } = this
    ctx.beginPath()
    ctx.arc(pr.cx, pr.cy, pr.radius, 0, 2 * Math.PI)
    ctx.strokeStyle = f.palette.horizon
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = f.palette.cardinal
    for (const [label, az] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]] as const) {
      const v = horizontalToEnu(az, 0)
      pr.project(v, this.p)
      // Push the letter just outside the rim.
      const dx = this.p.x - pr.cx
      const dy = this.p.y - pr.cy
      const k = (pr.radius + 14) / pr.radius
      ctx.fillText(label, pr.cx + dx * k, pr.cy + dy * k)
    }
  }

  private drawCardinals(f: SkyFrame): void {
    const { ctx, p } = this
    const pr = f.projector
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const [label, az] of [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]] as const) {
      if (!pr.project(horizontalToEnu(az, 0), p)) continue
      if (p.x < 0 || p.x > pr.width || p.y < 0 || p.y > pr.height) continue
      ctx.fillStyle = label.length === 1 ? f.palette.cardinal : f.palette.gridLabel
      ctx.fillText(label, p.x, p.y - 10)
    }
  }

  // --- the natural sky ---------------------------------------------------------

  private drawConstellations(f: SkyFrame): void {
    const { ctx, p } = this
    const pr = f.projector
    ctx.strokeStyle = f.palette.constellation
    ctx.lineWidth = 1
    for (const c of getConstellations()) {
      for (const line of c.lines) this.strokeSkyPath(pr, line.map((v) => apparent(mul(f.eqjToEnu, v))))
    }
    // Names only when zoomed in enough not to clutter the view.
    if (pr.pxPerDeg < 6) return
    ctx.font = '11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = f.palette.constellationLabel
    for (const c of getConstellations()) {
      const v = mul(f.eqjToEnu, c.label)
      if (v[2] < 0) continue
      if (pr.project(apparent(v), p)) ctx.fillText(c.name.toUpperCase(), p.x, p.y)
    }
  }

  private drawStars(f: SkyFrame): void {
    const { ctx, p } = this
    const pr = f.projector
    const limit = f.mode === 'ar' ? Math.min(f.settings.starMag, 3.5) : f.settings.starMag
    // Brighter skies drown faint stars: hide them as the Sun comes up.
    const skyLimit = f.sunEl > -6 ? Math.min(limit, 1 + (-f.sunEl / 6) * 2) : f.sunEl > -12 ? Math.min(limit, 3 + ((-f.sunEl - 6) / 6) * 2) : limit
    // Stars grow a little when zoomed in, as in a real eyepiece.
    const scale = Math.min(1.6, Math.max(0.8, Math.sqrt(pr.pxPerDeg / 8)))
    // One path per colour and opacity: a fill per star was the cost.
    const batches = new Map<string, { colour: string; alpha: number; dots: number[] }>()
    for (const s of getStars()) {
      if (s.mag > skyLimit) break // sorted brightest first
      const v = mul(f.eqjToEnu, s.v)
      if (v[2] < -0.01) continue
      if (!pr.project(apparent(v), p)) continue
      if (p.x < -4 || p.y < -4 || p.x > pr.width + 4 || p.y > pr.height + 4) continue
      const r = starRadius(s.mag, scale)
      const colour = f.palette.starTint ? starColour(s.bv) : f.palette.sunlitFaint
      const alpha = s.mag > 4 ? 0.6 : 1
      const key = `${colour}|${alpha}`
      let b = batches.get(key)
      if (!b) batches.set(key, (b = { colour, alpha, dots: [] }))
      b.dots.push(p.x, p.y, r)
      const mag = s.mag.toFixed(1).replace('-', '−')
      this.hits.push({ kind: 'star', id: `${s.name ?? 'Star'} · mag ${mag}`, x: p.x, y: p.y, r, priority: 1 - s.mag / 10 })
    }
    for (const { colour, alpha, dots } of batches.values()) {
      ctx.beginPath()
      for (let k = 0; k < dots.length; k += 3) {
        ctx.moveTo(dots[k]! + dots[k + 2]!, dots[k + 1]!)
        ctx.arc(dots[k]!, dots[k + 1]!, dots[k + 2]!, 0, 2 * Math.PI)
      }
      ctx.fillStyle = colour
      ctx.globalAlpha = alpha
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  private drawBodies(f: SkyFrame, labels: LabelRequest[]): void {
    const { ctx, p, q } = this
    const pr = f.projector
    const sun = f.bodies.find((b) => b.name === 'Sun')
    for (const b of f.bodies) {
      if (b.v[2] < -0.02) continue
      if (!pr.project(apparent(b.v), p)) continue
      const r = Math.max(b.name === 'Sun' || b.name === 'Moon' ? 6 : 2.4, b.radius * pr.pxPerDeg)
      if (b.name === 'Moon' && sun) {
        // Bright limb toward the Sun: find the on-screen direction by
        // projecting a point a little way from the Moon toward the Sun.
        const step = 0.02
        const towardSun = apparent([b.v[0] + sun.v[0] * step, b.v[1] + sun.v[1] * step, b.v[2] + sun.v[2] * step])
        const angle = pr.project(towardSun, q) ? Math.atan2(q.y - p.y, q.x - p.x) : 0
        this.drawMoon(f, p.x, p.y, r, b.phase, angle)
      } else {
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, 2 * Math.PI)
        ctx.fillStyle = b.name === 'Sun' ? f.palette.sun : f.palette.planet
        ctx.fill()
      }
      this.hits.push({ kind: 'body', id: b.name, x: p.x, y: p.y, r, priority: 5 })
      labels.push({ text: b.name, x: p.x, y: p.y, gap: r + 2, priority: 50, colour: f.palette.planet })
    }
  }

  private drawMoon(f: SkyFrame, x: number, y: number, r: number, phase: number, angle: number): void {
    const { ctx } = this
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, 2 * Math.PI)
    ctx.fillStyle = f.palette.moonDark
    ctx.fill()
    // Lit half toward +x (the Sun), closed by the terminator: an ellipse
    // whose half-width is |2k − 1|·r, bulging toward the dark side when
    // gibbous and toward the lit side when crescent.
    ctx.beginPath()
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false)
    ctx.ellipse(0, 0, Math.abs(2 * phase - 1) * r, r, 0, Math.PI / 2, -Math.PI / 2, phase < 0.5)
    ctx.closePath()
    ctx.fillStyle = f.palette.moonLit
    ctx.fill()
    ctx.restore()
  }

  /** A dashed ring where a named body or star should be. */
  private drawHighlight(f: SkyFrame, name: string): void {
    const body = f.bodies.find((b) => b.name === name)
    const star = body ? undefined : getStars().find((s) => s.name === name)
    const v = body ? body.v : star ? mul(f.eqjToEnu, star.v) : null
    if (!v || !f.projector.project(apparent(v), this.p)) return
    const { ctx, p } = this
    ctx.save()
    ctx.setLineDash([5, 4])
    ctx.lineWidth = 2
    ctx.strokeStyle = f.palette.selected
    ctx.beginPath()
    ctx.arc(p.x, p.y, 20, 0, 2 * Math.PI)
    ctx.stroke()
    ctx.restore()
  }

  // --- satellites --------------------------------------------------------------

  private drawTrack(f: SkyFrame): void {
    const { ctx, p } = this
    const pr = f.projector
    const track = f.track!
    ctx.lineWidth = 1.5
    ctx.strokeStyle = f.palette.track
    // Segments are solid where the satellite is sunlit, dashed in shadow.
    let i = 0
    while (i < track.length - 1) {
      const lit = track[i]!.sunlit >= 0.5
      const seg: Vec3[] = []
      let j = i
      while (j < track.length && track[j]!.sunlit >= 0.5 === lit) {
        const t = track[j]!
        if (t.el > -1) seg.push(apparent(horizontalToEnu(t.az, t.el)))
        j++
      }
      // Overlap by one point so segments join.
      if (j < track.length) {
        const t = track[j]!
        if (t.el > -1) seg.push(apparent(horizontalToEnu(t.az, t.el)))
      }
      ctx.setLineDash(lit ? [] : [4, 4])
      if (seg.length > 1) this.strokeSkyPath(pr, seg)
      i = j
    }
    ctx.setLineDash([])
    // Minute ticks along the track, so the speed reads at a glance.
    ctx.fillStyle = f.palette.track
    for (const t of track) {
      if (t.el < 0 || Math.round(t.ms / 1000) % 60 !== 0) continue
      if (pr.project(apparent(horizontalToEnu(t.az, t.el)), p)) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 1.8, 0, 2 * Math.PI)
        ctx.fill()
      }
    }
  }

  /** Launch key per satellite if it launched recently enough to still be
   *  in a train, else null. Cached per catalogue and day. */
  private recentLaunches(f: SkyFrame): (string | null)[] {
    const day = Math.floor(f.ms / 86_400_000)
    if (this.launchCache && this.launchCache.sats === f.sats && this.launchCache.day === day) return this.launchCache.keys
    const keys = f.sats.map((s) => recentLaunch(s, f.ms, TRAIN_MAX_AGE_MS))
    this.launchCache = { sats: f.sats, day, keys }
    return keys
  }

  private drawSatellites(f: SkyFrame, labels: LabelRequest[]): void {
    const { tick, sats, settings } = f
    if (!tick) return
    const { ctx, p } = this
    const pr = f.projector
    const buf = tick.buffer
    const dt = (f.ms - tick.ms) / 1000
    const many = settings.labels === 'many'
    const labelsOn = settings.labels !== 'none'
    const n = Math.min(sats.length, buf.length / STRIDE)
    const launches = this.recentLaunches(f)

    // Pass 1: where everything goes.
    const drawn: SatDrawable[] = []
    const candidates: TrainCandidate[] = []
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE
      const x0 = buf[o]!
      if (Number.isNaN(x0)) continue
      const sat = sats[i]!
      const isSelected = sat.norad === f.selected
      // Docked modules sit on their station; it stands for them.
      if (sat.dockedTo !== null && !isSelected) continue
      const ve = buf[o + Slot.VE]!
      const vn = buf[o + Slot.VN]!
      const vu = buf[o + Slot.VU]!
      const e = x0 + ve * dt
      const nn = buf[o + Slot.N]! + vn * dt
      const u = buf[o + Slot.U]! + vu * dt
      const range = Math.hypot(e, nn, u)
      // Cheap reject well below the horizon before any trig.
      if (u / range < -0.015) continue
      const v = apparent([e, nn, u])
      if (v[2] < 0) continue
      const sunlit = buf[o + Slot.SUNLIT]!
      const mag = buf[o + Slot.MAG]!
      const look = appearance(settings.show, sunlit, mag, f.sunEl, settings.limitingMag)
      if (look.shown) this.stats.up++
      if (look.visible) this.stats.visible++
      const launch = launches[i]
      // A train is seen as a whole line of lights even when its members are
      // individually below the magnitude filter, so lit members of recent
      // launches stay in the running.
      const trainOnly = !look.shown && !isSelected
      if (trainOnly && !(launch && sunlit >= 0.5 && f.sunEl <= DARK_ENOUGH_SUN_EL)) continue
      if (!pr.project(v, p)) {
        if (isSelected) this.stats.selectedOnScreen = false
        continue
      }
      const onScreen = p.x >= -10 && p.y >= -10 && p.x <= pr.width + 10 && p.y <= pr.height + 10
      if (isSelected) this.stats.selectedOnScreen = onScreen
      if (!onScreen) continue

      const station = isStation(sat)
      const r = satRadius(mag) + (station ? 0.6 : 0)
      // A short trail behind each satellite: shows which way it is going and
      // tells satellites apart from stars at a glance.
      let trail: Point | null = null
      const back = apparent([e - ve * TRAIL_S, nn - vn * TRAIL_S, u - vu * TRAIL_S])
      if (pr.project(back, this.q)) {
        const tx = this.q.x - p.x
        const ty = this.q.y - p.y
        const len = Math.hypot(tx, ty)
        if (len > 2) {
          const k = Math.min(1, TRAIL_MAX_PX / len)
          trail = { x: p.x + tx * k, y: p.y + ty * k }
        }
      }
      drawn.push({ index: i, x: p.x, y: p.y, r, trail, sunlit, mag, visible: look.visible, station, selected: isSelected, trainOnly })
      if (launch) {
        // Motion across the sky: velocity minus its line-of-sight part.
        const along = (ve * v[0] + vn * v[1] + vu * v[2])
        candidates.push({ index: drawn.length - 1, launch, dir: v, motion: [ve - along * v[0], vn - along * v[1], vu - along * v[2]] })
      }
    }

    // Trains: one line and one label each, drawn under the dots.
    const trains = findTrains(candidates)
    const inTrain = new Set<number>()
    const inTrainIndex = new Set<number>()
    for (const t of trains) {
      ctx.beginPath()
      t.members.forEach((m, k) => {
        const d = drawn[m]!
        inTrain.add(m)
        inTrainIndex.add(d.index)
        if (k === 0) ctx.moveTo(d.x, d.y)
        else ctx.lineTo(d.x, d.y)
      })
      ctx.strokeStyle = f.palette.train
      ctx.globalAlpha = 0.6
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke()
      ctx.globalAlpha = 1
      const lead = drawn[t.members[0]!]!
      const names = t.members.map((m) => sats[drawn[m]!.index]!.name)
      const brightest = Math.min(...t.members.map((m) => drawn[m]!.mag).filter((x) => !Number.isNaN(x)), 99)
      if (labelsOn) {
        labels.push({
          text: `${trainName(names, t.launch)} ×${t.members.length}`,
          x: lead.x,
          y: lead.y,
          gap: lead.r + 2,
          priority: 200 + (10 - brightest),
          colour: f.palette.train,
        })
      }
    }

    // Pass 2: trails, halos and dots, batched into one path per style —
    // with hundreds of satellites up, a fill per dot dominated the frame.
    const shown = drawn.filter((d, k) => !d.trainOnly || inTrain.has(k))
    const fillOf = (d: SatDrawable) =>
      d.selected
        ? f.palette.selected
        : d.station
          ? f.palette.station
          : d.visible
            ? f.palette.sunlit
            : d.sunlit >= 0.5
              ? f.palette.sunlitFaint
              : f.palette.eclipsed
    // Trails, grouped by colour and (rounded) width.
    const trails = new Map<string, SatDrawable[]>()
    for (const d of shown) {
      if (!d.trail) continue
      const colour = d.visible || d.station ? f.palette.sunlit : f.palette.sunlitFaint
      const key = `${colour}|${Math.round(Math.max(1.2, d.r * 0.9) * 2) / 2}`
      let g = trails.get(key)
      if (!g) trails.set(key, (g = []))
      g.push(d)
    }
    ctx.globalAlpha = 0.55
    ctx.lineCap = 'butt'
    for (const [key, group] of trails) {
      const [colour, width] = key.split('|')
      ctx.beginPath()
      for (const d of group) {
        ctx.moveTo(d.x, d.y)
        ctx.lineTo(d.trail!.x, d.trail!.y)
      }
      ctx.strokeStyle = colour!
      ctx.lineWidth = Number(width)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    // A dark halo separates each dot from stars and constellation lines.
    ctx.beginPath()
    for (const d of shown) {
      ctx.moveTo(d.x + d.r + 1.6, d.y)
      ctx.arc(d.x, d.y, d.r + 1.6, 0, 2 * Math.PI)
    }
    ctx.fillStyle = f.palette.labelHalo
    ctx.fill()
    // Dots, faint styles first so stations and the selection end on top.
    const order = [f.palette.eclipsed, f.palette.sunlitFaint, f.palette.sunlit, f.palette.station, f.palette.selected]
    for (const colour of order) {
      ctx.beginPath()
      let any = false
      for (const d of shown) {
        if (fillOf(d) !== colour) continue
        ctx.moveTo(d.x + d.r, d.y)
        ctx.arc(d.x, d.y, d.r, 0, 2 * Math.PI)
        any = true
      }
      if (!any) continue
      ctx.fillStyle = colour
      ctx.fill()
    }

    // Hits and labels.
    let selectedDrawn: SatDrawable | null = null
    for (const d of shown) {
      const sat = sats[d.index]!
      this.stats.drawn++
      const brightness = Number.isNaN(d.mag) ? 0 : 10 - d.mag
      this.hits.push({ kind: 'sat', id: sat.norad, x: d.x, y: d.y, r: d.r, priority: (d.visible ? 20 : 0) + brightness + (d.station ? 30 : 0) })
      if (d.selected) selectedDrawn = d
      // Train members are covered by their train's label, unless selected.
      if (labelsOn && (d.station || d.visible || many || d.selected) && (!inTrainIndex.has(d.index) || d.selected)) {
        labels.push({
          text: displayName(sat),
          x: d.x,
          y: d.y,
          gap: d.r + 1,
          priority: (d.selected ? 1000 : 0) + (d.station ? 100 : 0) + brightness,
          colour: d.selected ? f.palette.selected : d.station ? f.palette.station : f.palette.label,
        })
      }
    }
    if (selectedDrawn) {
      const d: SatDrawable = selectedDrawn
      ctx.beginPath()
      ctx.arc(d.x, d.y, 9, 0, 2 * Math.PI)
      ctx.strokeStyle = f.palette.selected
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }

  private drawLabels(f: SkyFrame, requests: LabelRequest[]): void {
    const { ctx } = this
    const pr = f.projector
    ctx.font = '12px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const max = f.settings.labels === 'many' ? 60 : f.settings.labels === 'few' ? 14 : 1
    const placed = placeLabels(requests, (t) => ctx.measureText(t).width, pr, 13, max)
    ctx.lineWidth = 3
    ctx.strokeStyle = f.palette.labelHalo
    ctx.lineJoin = 'round'
    for (const l of placed) {
      ctx.strokeText(l.text, l.x, l.y)
      ctx.fillStyle = l.colour
      ctx.fillText(l.text, l.x, l.y)
    }
  }

  /** An arrow at the screen edge pointing the way to turn to find the
   *  selected satellite. */
  private drawOffscreenArrow(f: SkyFrame, pr: PerspectiveProjector): void {
    const tick = f.tick
    if (!tick) return
    const i = f.sats.findIndex((s) => s.norad === f.selected)
    if (i < 0) return
    const v = satellitePosition(tick, i, f.ms)
    if (!v) return
    const c = pr.toCamera(v)
    // Direction on screen (y down); behind the camera the x/y components
    // still say which way to turn.
    let dx = c[0]
    let dy = -c[1]
    const len = Math.hypot(dx, dy) || 1
    dx /= len
    dy /= len
    const margin = 34
    const hw = pr.width / 2 - margin
    const hh = pr.height / 2 - margin
    const t = Math.min(Math.abs(dx) > 1e-9 ? hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-9 ? hh / Math.abs(dy) : Infinity)
    const x = pr.cx + dx * t
    const y = pr.cy + dy * t
    const { ctx } = this
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(Math.atan2(dy, dx))
    ctx.beginPath()
    ctx.moveTo(16, 0)
    ctx.lineTo(-8, -11)
    ctx.lineTo(-3, 0)
    ctx.lineTo(-8, 11)
    ctx.closePath()
    ctx.fillStyle = f.palette.arrow
    ctx.fill()
    ctx.restore()
    const name = displayName(f.sats[i]!)
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 3
    ctx.strokeStyle = f.palette.labelHalo
    const ty = y + (dy > 0 ? -22 : 22)
    ctx.strokeText(name, x, ty)
    ctx.fillStyle = f.palette.arrow
    ctx.fillText(name, x, ty)
  }

  /** The best target within `tolerance` px of a tap, satellites first. */
  hitTest(x: number, y: number, tolerance: number): HitTarget | null {
    let best: HitTarget | null = null
    let bestScore = Infinity
    for (const h of this.hits) {
      const d = Math.hypot(h.x - x, h.y - y) - h.r
      if (d > tolerance) continue
      // Distance matters most; priority breaks near-ties. Satellites get a
      // head start because they are what people tap for.
      const score = d - h.priority * 0.3 - (h.kind === 'sat' ? 6 : 0)
      if (score < bestScore) {
        bestScore = score
        best = h
      }
    }
    return best
  }
}
