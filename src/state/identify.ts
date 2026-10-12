/**
 * "What's that?": the user follows a moving light with the centre of the
 * AR view for a few seconds; the render loop records where the view
 * pointed, and the worker finds the satellites whose paths match.
 */
import { signal } from '@preact/signals'
import { confidence, DEFAULT_SIGMAS, pathSpanDeg, type Confidence, type PathSample } from '../core/identify.ts'
import type { Vec3 } from '../core/vec.ts'
import type { Identification } from '../worker/engine.ts'
import { orientation } from './ar.ts'
import { clock } from './clock.ts'
import { settings } from './settings.ts'
import { getTracker } from './tracker.ts'

/** How long to follow the light. Long enough for a low satellite to move
 *  a couple of degrees, short enough to hold steady. */
export const FOLLOW_SECONDS = 5
/** Samples sent to the worker, evenly spread over the recording. */
const SAMPLES = 11
/** Below this much motion the light was effectively standing still. */
const STILL_DEG = 0.6
/** A calibration younger than this means the heading is good to a few
 *  degrees (compasses drift as the phone moves around). */
const CALIBRATION_FRESH_MS = 2 * 3_600_000

export type IdentifyState =
  | { phase: 'idle' }
  | { phase: 'following'; startedAt: number }
  | { phase: 'matching' }
  | { phase: 'done'; results: Identification[]; confidence: Confidence | null; still: boolean }
  | { phase: 'failed'; message: string }

export const identifyState = signal<IdentifyState>({ phase: 'idle' })

let samples: PathSample[] = []

export function startIdentify(): void {
  samples = []
  identifyState.value = { phase: 'following', startedAt: performance.now() }
}

export function closeIdentify(): void {
  samples = []
  identifyState.value = { phase: 'idle' }
}

/** Called by the render loop every frame with the simulated time and the
 *  direction at the centre of the view (apparent, unit ENU). */
export function recordPointing(ms: number, dir: Vec3): void {
  const s = identifyState.peek()
  if (s.phase !== 'following') return
  const last = samples[samples.length - 1]
  if (!last || ms - last.ms >= 50) samples.push({ ms, dir })
  if (performance.now() - s.startedAt >= FOLLOW_SECONDS * 1000) void finish()
}

/** `n` samples spread evenly through `all`, ends included. */
export function spread<T>(all: T[], n: number): T[] {
  if (all.length <= n) return all
  return Array.from({ length: n }, (_, k) => all[Math.round((k * (all.length - 1)) / (n - 1))]!)
}

/** How far the heading can be trusted, which sets how much an offset
 *  between the paths counts against a match. */
function headingSigma(): number {
  const cal = settings.peek().calibration.at
  if (cal !== null && Math.abs(clock.now() - cal) < CALIBRATION_FRESH_MS) return 4
  return orientation.kind.peek() === 'relative' ? 30 : DEFAULT_SIGMAS.az
}

async function finish(): Promise<void> {
  const picked = spread(samples, SAMPLES)
  samples = []
  identifyState.value = { phase: 'matching' }
  if (picked.length < 3) {
    identifyState.value = { phase: 'failed', message: 'The view didn’t update while following. Try again.' }
    return
  }
  try {
    const results = await getTracker().client.request('identify', {
      samples: picked,
      limit: 4,
      sigmas: { ...DEFAULT_SIGMAS, az: headingSigma() },
    })
    // Ignore a result that arrives after the user closed or restarted.
    if (identifyState.peek().phase !== 'matching') return
    const still = pathSpanDeg(picked) < STILL_DEG
    const best = results[0]
    identifyState.value = {
      phase: 'done',
      results,
      confidence: best ? confidence(best.score, results[1]?.score ?? null) : null,
      still,
    }
  } catch (e) {
    identifyState.value = { phase: 'failed', message: e instanceof Error ? e.message : String(e) }
  }
}
