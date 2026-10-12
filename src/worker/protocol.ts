/**
 * Messages between the UI thread and the propagation worker.
 *
 * Requests carry an `id`; the worker answers each with a response of the
 * same id (or an error), so the client can await them as promises. Tick
 * buffers are transferred, not copied.
 */
import type { Observer } from '../core/frames.ts'
import type { MatchSigmas, PathSample } from '../core/identify.ts'
import type { Look } from '../core/look.ts'
import type { Pass, PassOptions } from '../core/passes.ts'
import type { SatelliteInfo } from '../core/satellite.ts'
import type { Vec3 } from '../core/vec.ts'
import type { DataIndex } from '../data/pack.ts'
import type { Identification } from './engine.ts'

export type Request =
  | { type: 'load'; id: number; baseUrl: string; packs: string[] | null }
  | { type: 'observer'; id: number; observer: Observer }
  | { type: 'tick'; id: number; ms: number }
  | { type: 'look'; id: number; norad: number; ms: number }
  | {
      type: 'passes'
      id: number
      norads: number[] | null
      startMs: number
      endMs: number
      options: Partial<PassOptions>
      visibleOnly: boolean
    }
  | { type: 'track'; id: number; norad: number; startMs: number; endMs: number; stepMs: number }
  | { type: 'identify'; id: number; samples: PathSample[]; limit: number; sigmas: MatchSigmas }

export interface LoadResult {
  index: DataIndex
  /** In buffer order: satellite i's state is at i × STRIDE in each tick. */
  sats: SatelliteInfo[]
  /** Element-set epochs, Unix ms, in the same order. */
  epochs: number[]
  /** Element sets satellite.js could not initialise. */
  failed: number
  /** Packs that could not be fetched, with the reason. */
  missing: { id: string; error: string }[]
}

export interface TickData {
  ms: number
  buffer: Float32Array
  computed: number
  sunEnu: Vec3
}

export interface TrackPoint {
  ms: number
  az: number
  el: number
  sunlit: number
}

export interface ResultMap {
  load: LoadResult
  observer: null
  tick: TickData
  look: Look | null
  passes: Pass[]
  track: TrackPoint[]
  identify: Identification[]
}

export type Response =
  | { [K in keyof ResultMap]: { type: K; id: number; result: ResultMap[K] } }[keyof ResultMap]
  | { type: 'error'; id: number; message: string }

/** A request without its id, as the client's callers write it. */
export type RequestBody<K extends Request['type']> = Omit<Extract<Request, { type: K }>, 'id' | 'type'>
