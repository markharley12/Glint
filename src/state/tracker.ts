/**
 * Glue between the app state and the propagation worker: loads the packs
 * the settings ask for, tells the worker where the observer is, and keeps a
 * fresh tick of satellite positions available for the render loop.
 *
 * Ticks are back-pressured: at most one is in flight, and the next is
 * requested once it returns (no sooner than MIN_TICK_INTERVAL_MS of real
 * time when running at normal speed, to spare batteries). The renderer
 * extrapolates each satellite between ticks from the velocity in the tick.
 */
import { batch, computed, effect, signal } from '@preact/signals'
import type { SatelliteInfo } from '../core/satellite.ts'
import type { DataIndex } from '../data/pack.ts'
import { EngineClient } from '../worker/client.ts'
import type { LoadResult, TickData } from '../worker/protocol.ts'
import { clock } from './clock.ts'
import { observer } from './observer.ts'
import { settings } from './settings.ts'

export type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface CatalogState {
  status: CatalogStatus
  error: string | null
  index: DataIndex | null
  sats: SatelliteInfo[]
  /** Element-set epochs, Unix ms, aligned with `sats`. */
  epochs: number[]
  missing: LoadResult['missing']
  failed: number
  /** Bumped on each successful load; ticks from older loads are dropped. */
  generation: number
}

export const catalog = signal<CatalogState>({
  status: 'idle',
  error: null,
  index: null,
  sats: [],
  epochs: [],
  missing: [],
  failed: 0,
  generation: 0,
})

/** NORAD number → index into catalog.sats (and tick buffers). */
export const indexByNorad = computed(() => new Map(catalog.value.sats.map((s, i) => [s.norad, i])))

export const selected = signal<number | null>(null)

/** Real-time floor between ticks at 1× speed. */
const MIN_TICK_INTERVAL_MS = 250

export class Tracker {
  readonly client: EngineClient
  /** The newest tick for the current catalogue, or null before the first. */
  latest: TickData | null = null
  private inFlight = false
  private lastRequestReal = 0
  private lastEpoch = -1
  private observerReady = false
  private disposers: (() => void)[] = []
  private loadSeq = 0

  constructor(client = new EngineClient()) {
    this.client = client
  }

  start(): void {
    this.disposers.push(
      effect(() => {
        const o = observer.value
        if (!o) return
        this.observerReady = false
        void this.client.request('observer', { observer: o }).then(() => {
          this.observerReady = true
          this.latest = null // positions are for the old place
        })
      }),
      effect(() => {
        const packs = settings.value.packs
        void this.load(packs)
      }),
    )
  }

  stop(): void {
    for (const d of this.disposers) d()
    this.disposers = []
    this.client.terminate()
  }

  private async load(packs: string[] | null): Promise<void> {
    const seq = ++this.loadSeq
    catalog.value = { ...catalog.peek(), status: 'loading', error: null }
    try {
      const r = await this.client.request('load', { baseUrl: document.baseURI, packs })
      if (seq !== this.loadSeq) return // superseded by a newer load
      batch(() => {
        catalog.value = {
          status: 'ready',
          error: null,
          index: r.index,
          sats: r.sats,
          epochs: r.epochs,
          missing: r.missing,
          failed: r.failed,
          generation: catalog.peek().generation + 1,
        }
        const sel = selected.peek()
        if (sel !== null && !r.sats.some((s) => s.norad === sel)) selected.value = null
      })
      this.latest = null
    } catch (e) {
      if (seq !== this.loadSeq) return
      catalog.value = { ...catalog.peek(), status: 'error', error: e instanceof Error ? e.message : String(e) }
    }
  }

  /** Call once per animation frame with the current simulated time. */
  pump(now: number): void {
    const cat = catalog.peek()
    if (cat.status !== 'ready' || !this.observerReady || this.inFlight) return
    const epoch = clock.epoch.peek()
    const jumped = epoch !== this.lastEpoch
    const real = performance.now()
    const fast = Math.abs(clock.rate.peek()) > 1
    if (!jumped && this.latest && !fast && real - this.lastRequestReal < MIN_TICK_INTERVAL_MS) return
    this.lastEpoch = epoch
    this.lastRequestReal = real
    this.inFlight = true
    const generation = cat.generation
    this.client
      .request('tick', { ms: now })
      .then((t) => {
        // Drop a tick for an older catalogue: its buffer indices don't match.
        if (generation === catalog.peek().generation) this.latest = t
      })
      .catch((e: unknown) => console.error('tick failed', e))
      .finally(() => {
        this.inFlight = false
      })
  }
}

let instance: Tracker | null = null

/** The app's tracker, created (with its worker) on first use rather than at
 *  import, so modules that import this one stay testable without a Worker. */
export function getTracker(): Tracker {
  return (instance ??= new Tracker())
}
