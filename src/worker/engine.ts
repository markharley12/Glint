/**
 * The propagation engine: every satellite's place in the observer's sky at
 * a requested instant, packed into one Float32Array for cheap transfer to
 * the UI thread. It runs in a Web Worker (propagator.worker.ts), but has no
 * worker dependencies so tests drive it directly.
 *
 * Skipping. Most satellites are below the horizon at any moment, and a LEO
 * satellite on the far side of the Earth cannot rise for many minutes. Each
 * satellite carries a "not before" time from the pass finder's conservative
 * rise bound; until then a tick reports it as down without propagating it.
 * A tick that goes backwards in time, or jumps far forward, invalidates the
 * bounds and every satellite is recomputed.
 */
import { gstime } from 'satellite.js'
import { horizontalToEnu, observerEcf, refraction, TopocentricFrame, type Observer } from '../core/frames.ts'
import { angleDeg, DEFAULT_SIGMAS, faintnessPenalty, matchPath, type MatchSigmas, type PathMatch, type PathSample } from '../core/identify.ts'
import { apparentMagnitude, phaseAngle } from '../core/magnitude.ts'
import { findPasses, findVisiblePasses, maxAngularRate, riseDelay, timeToPossibleRise, type Pass, type PassOptions } from '../core/passes.ts'
import { look, type Look } from '../core/look.ts'
import { jdFromMs, propagateJd, type Satellite } from '../core/satellite.ts'
import { sunEnu, sunlitFraction, sunTemeAu } from '../core/sun.ts'
import type { Vec3 } from '../core/vec.ts'
import { Slot, STRIDE } from './layout.ts'

export { Slot, STRIDE } from './layout.ts'

/** "What's that?" only considers satellites within this angle of where the
 *  user was pointing: generous, since phone compasses can be far out. */
const IDENTIFY_RADIUS_DEG = 40
/** ...nor anything predicted fainter than this: the user saw it, and the
 *  magnitude model can be a magnitude or two out. */
const IDENTIFY_FAINTEST_MAG = 8

export interface Identification {
  norad: number
  match: PathMatch
  /** The match's score plus the faintness penalty: lower is better. */
  score: number
  /** Where it was mid-way through the observation, degrees. */
  az: number
  el: number
  mag: number | null
}

/** A tick further than this from the previous one rebuilds all bounds. */
const MAX_FORWARD_JUMP_MS = 10 * 60_000

export interface TickResult {
  ms: number
  buffer: Float32Array
  /** Satellites actually propagated (the rest were skipped as down). */
  computed: number
  sunEnu: Vec3
}

export class Engine {
  private sats: Satellite[] = []
  private byNorad = new Map<number, number>()
  private rates = new Float64Array(0)
  private notBefore = new Float64Array(0)
  private observer: Observer | null = null
  private frame: TopocentricFrame | null = null
  private obsEcf: Vec3 = [0, 0, 0]
  private lastMs = Number.NaN

  get count(): number {
    return this.sats.length
  }

  setSatellites(sats: Satellite[]): void {
    this.sats = sats
    this.byNorad = new Map(sats.map((s, i) => [s.norad, i]))
    this.rates = Float64Array.from(sats, maxAngularRate)
    this.resetBounds()
  }

  setObserver(o: Observer): void {
    this.observer = o
    this.frame = new TopocentricFrame(o)
    this.obsEcf = observerEcf(o)
    this.resetBounds()
  }

  satellite(norad: number): Satellite | undefined {
    const i = this.byNorad.get(norad)
    return i === undefined ? undefined : this.sats[i]
  }

  private resetBounds(): void {
    this.notBefore = new Float64Array(this.sats.length)
    this.lastMs = Number.NaN
  }

  private requireFrame(): TopocentricFrame {
    if (!this.frame) throw new Error('Engine: no observer set')
    return this.frame
  }

  tick(ms: number): TickResult {
    const frame = this.requireFrame()
    if (!(ms >= this.lastMs && ms - this.lastMs <= MAX_FORWARD_JUMP_MS)) this.notBefore.fill(0)
    this.lastMs = ms

    const jd = jdFromMs(ms)
    frame.setGmst(gstime(jd))
    const sunAu = sunTemeAu(jd)
    const sun = sunEnu(frame, sunAu)
    const n = this.sats.length
    const buf = new Float32Array(n * STRIDE)
    const tmp = [0, 0, 0, 0, 0, 0]
    let computed = 0
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE
      if (ms < this.notBefore[i]!) {
        buf[o] = Number.NaN
        continue
      }
      computed++
      const sat = this.sats[i]!
      const sv = propagateJd(sat, jd)
      if (!sv) {
        buf[o] = Number.NaN
        // Failed (usually decayed): don't retry for an hour.
        this.notBefore[i] = ms + 3_600_000
        continue
      }
      frame.toEnu(sv.p, sv.v, tmp)
      if (tmp[2]! < 0) {
        // Below the horizon plane. If it cannot come up for a while, say so
        // and skip it until then.
        const delay = riseDelay(frame.temeToEcf(sv.p), this.obsEcf, this.rates[i]!)
        if (delay > 0) {
          this.notBefore[i] = ms + delay
          buf[o] = Number.NaN
          continue
        }
      }
      for (let k = 0; k < 6; k++) buf[o + k] = tmp[k]!
      const lit = sunlitFraction(sunAu, sv.p)
      buf[o + Slot.SUNLIT] = lit
      if (lit > 0 && sat.stdMag !== null) {
        const pos: Vec3 = [tmp[0]!, tmp[1]!, tmp[2]!]
        const range = Math.hypot(pos[0], pos[1], pos[2])
        buf[o + Slot.MAG] = apparentMagnitude(sat.stdMag, range, phaseAngle(pos, sun)) - 2.5 * Math.log10(lit)
      } else {
        buf[o + Slot.MAG] = Number.NaN
      }
    }
    return { ms, buffer: buf, computed, sunEnu: sun }
  }

  look(norad: number, ms: number): Look | null {
    const sat = this.satellite(norad)
    return sat ? look(sat, this.requireFrame(), ms) : null
  }

  passes(norads: number[] | null, startMs: number, endMs: number, options: Partial<PassOptions> = {}, visibleOnly = false): Pass[] {
    if (!this.observer) throw new Error('Engine: no observer set')
    const list = norads ? norads.map((n) => this.satellite(n)).filter((s): s is Satellite => !!s) : this.sats
    const out: Pass[] = []
    for (const sat of list) {
      if (visibleOnly) out.push(...findVisiblePasses(sat, this.observer, startMs, endMs, options))
      else out.push(...findPasses(sat, this.observer, startMs, endMs, options))
    }
    return out.sort((a, b) => (a.visible?.start.ms ?? a.rise.ms) - (b.visible?.start.ms ?? b.rise.ms))
  }

  /** Sky positions of one satellite from `startMs` to `endMs`, every
   *  `stepMs`, for drawing its path. Points below the horizon are kept (el
   *  < 0) so the caller can clip the path where it crosses. */
  track(norad: number, startMs: number, endMs: number, stepMs: number): { ms: number; az: number; el: number; sunlit: number }[] {
    const sat = this.satellite(norad)
    if (!sat) return []
    const frame = this.requireFrame()
    const out = []
    for (let t = startMs; t <= endMs; t += stepMs) {
      const l = look(sat, frame, t)
      if (l) out.push({ ms: t, az: l.az, el: l.el, sunlit: l.sunlit })
    }
    return out
  }

  /**
   * The lit satellites whose paths best match `samples`, the directions the
   * user pointed while following something across the sky, best first.
   */
  identify(samples: PathSample[], limit = 5, sigmas: MatchSigmas = DEFAULT_SIGMAS): Identification[] {
    const frame = this.requireFrame()
    if (samples.length < 2) return []
    const mid = samples[Math.floor(samples.length / 2)]!
    const observed = samples.map((s) => s.dir)
    // What the eye sees: refracted directions.
    const apparent = (l: Look): Vec3 => horizontalToEnu(l.az, l.el + refraction(l.el))
    const out: Identification[] = []
    for (const sat of this.sats) {
      if (sat.dockedTo !== null) continue // its station stands for it
      const l = look(sat, frame, mid.ms)
      if (!l || l.el < 0 || l.sunlit < 0.5) continue
      if (l.mag !== null && l.mag > IDENTIFY_FAINTEST_MAG) continue
      if (angleDeg(apparent(l), mid.dir) > IDENTIFY_RADIUS_DEG) continue
      const predicted: Vec3[] = []
      for (const s of samples) {
        const ls = look(sat, frame, s.ms)
        if (!ls) break
        predicted.push(apparent(ls))
      }
      if (predicted.length !== samples.length) continue
      const match = matchPath(observed, predicted, sigmas)
      out.push({ norad: sat.norad, match, score: match.score + faintnessPenalty(l.mag), az: l.az, el: l.el, mag: l.mag })
    }
    return out.sort((a, b) => a.score - b.score).slice(0, limit)
  }

  /**
   * Visible passes overlapping [ms − slackMs, ms + slackMs], for "what was
   * that?" after the fact. Visibility is loosened to what someone might
   * actually have noticed: from 5° up, and in bright twilight (Sun −3°).
   */
  recall(ms: number, slackMs: number): Pass[] {
    if (!this.observer) throw new Error('Engine: no observer set')
    const frame = this.requireFrame()
    const from = ms - slackMs
    const to = ms + slackMs
    // A LEO pass lasts under a quarter of an hour, so one that overlaps the
    // window rose no earlier than this before it.
    const margin = 15 * 60_000
    const step = 60_000
    const opts: Partial<PassOptions> = { maxSunEl: -3, visibleMinEl: 5, minPeak: 5 }
    const out: Pass[] = []
    const tmp = [0, 0, 0, 0, 0, 0]
    for (let i = 0; i < this.sats.length; i++) {
      const sat = this.sats[i]!
      if (sat.dockedTo !== null) continue
      // Most satellites can't come up in time at all: one propagation says so.
      if (timeToPossibleRise(sat, frame, this.obsEcf, from, this.rates[i]!) > to - from) continue
      // Then a coarse look, minute by minute: up, lit and not hopelessly faint
      // at some point in the window?
      let seen = false
      for (let t = from; t <= to + step / 2 && !seen; t += step) {
        const jd = jdFromMs(Math.min(t, to))
        const sv = propagateJd(sat, jd)
        if (!sv) break
        frame.setGmst(gstime(jd))
        frame.toEnu(sv.p, sv.v, tmp)
        if (tmp[2]! <= 0) continue
        const l = look(sat, frame, Math.min(t, to))
        seen = !!l && l.sunlit >= 0.5 && l.sunEl <= -3 && (l.mag === null || l.mag <= IDENTIFY_FAINTEST_MAG)
      }
      if (!seen) continue
      for (const p of findPasses(sat, this.observer, from - margin, to + margin, opts)) {
        if (p.visible && p.visible.end.ms >= from && p.visible.start.ms <= to) out.push(p)
      }
    }
    return out
  }

}
