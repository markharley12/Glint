/**
 * Pass prediction: when a satellite rises, culminates and sets for an
 * observer, and which part of each pass is actually visible to the eye.
 *
 * Search strategy. Stepping a whole day at a fixed 20 s costs ~4,300 SGP4
 * calls per satellite. Instead, while a satellite is below the horizon we
 * jump ahead by the shortest time in which it could possibly rise: the
 * geocentric angle between it and the observer has to shrink to the
 * horizon circle's radius, and that angle can change no faster than the
 * satellite's peak orbital rate plus the Earth's rotation. That bound is
 * conservative, so no pass is skipped, and a LEO satellite costs a few
 * hundred calls a day. Once a crossing is bracketed, bisection pins it to
 * 0.1 s.
 *
 * "Visible" follows Heavens-Above's convention so its tables can be used to
 * check ours: the satellite is above 10°, at least half sunlit, and the Sun
 * is at least 6° below the horizon (civil twilight over).
 */
import { gstime } from 'satellite.js'
import { EARTH_ROTATION, observerEcf, TopocentricFrame, type Observer } from './frames.ts'
import { look, type Look } from './look.ts'
import { jdFromMs, propagateJd, type Satellite } from './satellite.ts'
import { sunElevationDeg, sunEnu, sunTemeAu } from './sun.ts'

export interface PassPoint {
  ms: number
  az: number
  el: number
  range: number
  /** Apparent magnitude, when known and sunlit. */
  mag: number | null
  sunlit: number
}

export interface Pass {
  norad: number
  rise: PassPoint
  max: PassPoint
  set: PassPoint
  /** The search window began (or ended) with the satellite already up, so
   *  `rise` (or `set`) is the window edge, not a real horizon crossing. */
  startsUp: boolean
  endsUp: boolean
  /** The longest stretch that meets the visibility rules, if any. */
  visible: VisibleWindow | null
}

export interface VisibleWindow {
  start: PassPoint
  end: PassPoint
  /** Highest point within the visible stretch. */
  max: PassPoint
  /** Brightest point within the visible stretch (null if no magnitude). */
  brightest: PassPoint | null
}

export interface PassOptions {
  /** Horizon for rise and set, degrees. */
  horizon: number
  /** Drop passes whose peak is lower than this, degrees. */
  minPeak: number
  /** Visible stretch: satellite at least this high, degrees. */
  visibleMinEl: number
  /** Visible stretch: Sun no higher than this, degrees. */
  maxSunEl: number
  /** Visible stretch: at least this fraction of the Sun's disc in view. */
  minSunlit: number
}

export const DEFAULT_PASS_OPTIONS: PassOptions = {
  horizon: 0,
  minPeak: 10,
  visibleMinEl: 10,
  maxSunEl: -6,
  minSunlit: 0.5,
}

/** Step while above the horizon, ms. Short enough to resolve the visible
 *  window's edges before bisection, long enough to stay cheap. */
const IN_PASS_STEP = 10_000
/** Never step further than this, so slow (deep-space) orbits are still
 *  sampled often enough to notice they've risen. */
const MAX_STEP = 20 * 60_000
const MIN_STEP = 15_000
const BISECT_TOLERANCE = 100
/** Slack on the horizon circle, radians: covers the geodetic-vs-geocentric
 *  vertical (≤ 0.2°) and a low `horizon` setting. */
const HORIZON_MARGIN = (3 * Math.PI) / 180

function toPoint(l: Look): PassPoint {
  return { ms: l.ms, az: l.az, el: l.el, range: l.range, mag: l.mag, sunlit: l.sunlit }
}

/** Upper bound on the satellite's geocentric angular rate relative to the
 *  rotating Earth, rad/ms: perigee rate plus Earth rotation. */
export function maxAngularRate(sat: Satellite): number {
  const n = sat.satrec.no / 60_000 // rad/min → rad/ms
  const e = Math.min(sat.satrec.ecco, 0.99)
  const perigee = (n * (1 + e) ** 2) / (1 - e * e) ** 1.5
  return perigee + EARTH_ROTATION / 1000
}

/**
 * Shortest time (ms) before the satellite could rise above the horizon,
 * or 0 if it already could be near it.
 */
export function timeToPossibleRise(sat: Satellite, frame: TopocentricFrame, obsEcf: readonly number[], ms: number, rate: number): number {
  const jd = jdFromMs(ms)
  const sv = propagateJd(sat, jd)
  if (!sv) return 0
  frame.setGmst(gstime(jd))
  return riseDelay(frame.temeToEcf(sv.p), obsEcf, rate)
}

/** The geometric core of timeToPossibleRise, for a satellite whose
 *  Earth-fixed position `r` (km) is already known. */
export function riseDelay(r: readonly number[], obsEcf: readonly number[], rate: number): number {
  const rn = Math.hypot(r[0]!, r[1]!, r[2]!)
  const on = Math.hypot(obsEcf[0]!, obsEcf[1]!, obsEcf[2]!)
  const cosTheta = (r[0]! * obsEcf[0]! + r[1]! * obsEcf[1]! + r[2]! * obsEcf[2]!) / (rn * on)
  const theta = Math.acos(Math.max(-1, Math.min(1, cosTheta)))
  const lambda = Math.acos(Math.min(1, on / rn))
  const gap = theta - lambda - HORIZON_MARGIN
  return gap > 0 ? (0.9 * gap) / rate : 0
}

/** Bisect for the boundary where `pred` flips between `a` (pred = pa) and
 *  `b` (pred = !pa). Returns the first time at which pred = !pa, to within
 *  BISECT_TOLERANCE. */
function bisect(a: number, b: number, pred: (ms: number) => boolean): number {
  const pa = pred(a)
  while (b - a > BISECT_TOLERANCE) {
    const m = (a + b) / 2
    if (pred(m) === pa) a = m
    else b = m
  }
  return b
}

/** Golden-section search for the maximum of f on [a, b]. */
function goldenMax(a: number, b: number, f: (ms: number) => number): number {
  const g = (Math.sqrt(5) - 1) / 2
  let c = b - g * (b - a)
  let d = a + g * (b - a)
  let fc = f(c)
  let fd = f(d)
  while (b - a > BISECT_TOLERANCE) {
    if (fc > fd) {
      b = d
      d = c
      fd = fc
      c = b - g * (b - a)
      fc = f(c)
    } else {
      a = c
      c = d
      fc = fd
      d = a + g * (b - a)
      fd = f(d)
    }
  }
  return (a + b) / 2
}

/**
 * All passes of one satellite between `startMs` and `endMs` whose peak
 * reaches `minPeak`, in time order.
 */
export function findPasses(
  sat: Satellite,
  observer: Observer,
  startMs: number,
  endMs: number,
  options: Partial<PassOptions> = {},
): Pass[] {
  const opts = { ...DEFAULT_PASS_OPTIONS, ...options }
  const frame = new TopocentricFrame(observer)
  const obsEcf = observerEcf(observer)
  const rate = maxAngularRate(sat)
  const at = (ms: number): Look | null => look(sat, frame, ms)
  const elAt = (ms: number): number => at(ms)?.el ?? -90
  const above = (ms: number): boolean => elAt(ms) > opts.horizon

  const passes: Pass[] = []
  let t = startMs
  const first = at(t)
  if (!first) return passes
  let riseMs: number | null = first.el > opts.horizon ? startMs : null
  let startsUp = riseMs !== null
  let samples: Look[] = riseMs !== null ? [first] : []

  while (t < endMs) {
    let step: number
    if (riseMs === null) {
      const skip = timeToPossibleRise(sat, frame, obsEcf, t, rate)
      step = Math.min(MAX_STEP, Math.max(MIN_STEP, skip))
    } else {
      step = IN_PASS_STEP
    }
    const next = Math.min(t + step, endMs)
    const nl = at(next)
    if (!nl) break // decayed or the model failed: no further passes
    const wasUp = riseMs !== null
    const isUp = nl.el > opts.horizon
    if (!wasUp && isUp) {
      riseMs = bisect(t, next, above)
      startsUp = false
      samples = [at(riseMs)!]
    }
    if (riseMs !== null) {
      if (wasUp && !isUp) {
        const setMs = bisect(t, next, above)
        samples.push(at(setMs)!)
        const pass = buildPass(sat, at, riseMs, setMs, startsUp, false, samples, opts)
        if (pass) passes.push(pass)
        riseMs = null
        samples = []
      } else if (isUp) {
        samples.push(nl)
      }
    }
    t = next
  }
  if (riseMs !== null && samples.length > 0) {
    const pass = buildPass(sat, at, riseMs, endMs, startsUp, true, samples, opts)
    if (pass) passes.push(pass)
  }
  return passes
}

function buildPass(
  sat: Satellite,
  at: (ms: number) => Look | null,
  riseMs: number,
  setMs: number,
  startsUp: boolean,
  endsUp: boolean,
  samples: Look[],
  opts: PassOptions,
): Pass | null {
  // Coarse peak from the samples, then refine within one step either side.
  let best = samples[0]!
  for (const s of samples) if (s.el > best.el) best = s
  const lo = Math.max(riseMs, best.ms - IN_PASS_STEP)
  const hi = Math.min(setMs, best.ms + IN_PASS_STEP)
  const maxMs = goldenMax(lo, hi, (ms) => at(ms)?.el ?? -90)
  const max = at(maxMs)
  const rise = at(riseMs)
  const set = at(setMs)
  if (!max || !rise || !set) return null
  if (max.el < opts.minPeak) return null
  return {
    norad: sat.norad,
    rise: toPoint(rise),
    max: toPoint(max),
    set: toPoint(set),
    startsUp,
    endsUp,
    visible: visibleWindow(at, samples, opts),
  }
}

function isVisible(l: Look | null, opts: PassOptions): boolean {
  return l !== null && l.el >= opts.visibleMinEl && l.sunlit >= opts.minSunlit && l.sunEl <= opts.maxSunEl
}

function visibleWindow(at: (ms: number) => Look | null, samples: Look[], opts: PassOptions): VisibleWindow | null {
  // Longest run of visible samples, then refine both edges by bisection.
  let bestStart = -1
  let bestLen = 0
  let runStart = -1
  for (let i = 0; i <= samples.length; i++) {
    const vis = i < samples.length && isVisible(samples[i]!, opts)
    if (vis && runStart < 0) runStart = i
    if (!vis && runStart >= 0) {
      if (i - runStart > bestLen) {
        bestLen = i - runStart
        bestStart = runStart
      }
      runStart = -1
    }
  }
  if (bestLen === 0) return null
  const pred = (ms: number) => isVisible(at(ms), opts)
  const first = samples[bestStart]!
  const last = samples[bestStart + bestLen - 1]!
  const before = samples[bestStart - 1]
  const after = samples[bestStart + bestLen]
  const startMs = before ? bisect(before.ms, first.ms, pred) : first.ms
  // bisect returns the first *non-visible* time going forward, so step back
  // by its tolerance to stay inside the window.
  const endMs = after ? bisect(last.ms, after.ms, pred) - BISECT_TOLERANCE : last.ms
  const start = at(startMs)
  const end = at(endMs)
  if (!start || !end) return null

  const inside = samples.slice(bestStart, bestStart + bestLen)
  let top = inside[0]!
  for (const s of inside) if (s.el > top.el) top = s
  const topMs = goldenMax(Math.max(startMs, top.ms - IN_PASS_STEP), Math.min(endMs, top.ms + IN_PASS_STEP), (ms) => at(ms)?.el ?? -90)
  const maxLook = at(topMs) ?? top

  let brightest: Look | null = null
  for (const s of [start, ...inside, maxLook, end]) {
    if (s.mag !== null && (brightest === null || brightest.mag === null || s.mag < brightest.mag)) brightest = s
  }
  return {
    start: toPoint(start),
    end: toPoint(end),
    max: toPoint(maxLook),
    brightest: brightest ? toPoint(brightest) : null,
  }
}

/** Sun-elevation sampling step for darkIntervals. The Sun's elevation
 *  changes by at most ~2.5° in this time, so only a dip below the limit
 *  shallower than that (a polar summer night grazing it) can be missed. */
const DARK_STEP = 10 * 60_000

/**
 * The stretches of [startMs, endMs] when the Sun is at or below `maxSunEl`
 * degrees for the observer, edges to within a second.
 */
export function darkIntervals(observer: Observer, startMs: number, endMs: number, maxSunEl: number): [number, number][] {
  const frame = new TopocentricFrame(observer)
  const dark = (ms: number): boolean => {
    const jd = jdFromMs(ms)
    frame.setGmst(gstime(jd))
    return sunElevationDeg(sunEnu(frame, sunTemeAu(jd))) <= maxSunEl
  }
  const out: [number, number][] = []
  let open: number | null = dark(startMs) ? startMs : null
  for (let t = startMs; t < endMs; ) {
    const next = Math.min(t + DARK_STEP, endMs)
    const d = dark(next)
    if (open === null && d) open = bisect(t, next, dark)
    else if (open !== null && !d) {
      out.push([open, bisect(t, next, dark)])
      open = null
    }
    t = next
  }
  if (open !== null) out.push([open, endMs])
  return out
}

/** Longest LEO pass, ms: dark intervals are widened by this much so that
 *  passes running into or out of twilight are found whole. */
const PASS_MARGIN = 30 * 60_000

/**
 * The passes with a visible stretch. Only searches while the sky is dark
 * (plus a margin), which halves the work of findPasses at mid-latitudes.
 */
export function findVisiblePasses(
  sat: Satellite,
  observer: Observer,
  startMs: number,
  endMs: number,
  options: Partial<PassOptions> = {},
): Pass[] {
  const opts = { ...DEFAULT_PASS_OPTIONS, ...options }
  const windows: [number, number][] = []
  for (const [a, b] of darkIntervals(observer, startMs, endMs, opts.maxSunEl)) {
    const lo = Math.max(startMs, a - PASS_MARGIN)
    const hi = Math.min(endMs, b + PASS_MARGIN)
    const last = windows[windows.length - 1]
    if (last && lo <= last[1]) last[1] = hi
    else windows.push([lo, hi])
  }
  return windows.flatMap(([a, b]) => findPasses(sat, observer, a, b, opts).filter((p) => p.visible))
}
