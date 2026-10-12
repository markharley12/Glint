/**
 * The simulation clock: real time by default, or scrubbed to another time
 * and/or running faster, for "what will the sky look like at 9 pm?".
 *
 * Simulated time advances from an anchor at `rate` × real time, measured
 * with performance.now() so it is immune to the wall clock being adjusted.
 * `epoch` changes whenever time jumps (rather than flowing), which tells the
 * render loop to fetch fresh positions immediately instead of
 * extrapolating across the jump.
 */
import { computed, signal } from '@preact/signals'

interface ClockState {
  /** Simulated time at the anchor, Unix ms. */
  anchorSim: number
  /** performance.now() at the anchor. */
  anchorReal: number
  rate: number
  paused: boolean
}

export class Clock {
  private state = signal<ClockState>({ anchorSim: Date.now(), anchorReal: performance.now(), rate: 1, paused: false })
  /** Incremented on every discontinuity. */
  readonly epoch = signal(0)

  /** Current simulated time, Unix ms. Cheap; call it every frame. */
  now(): number {
    const s = this.state.peek()
    return s.paused ? s.anchorSim : s.anchorSim + (performance.now() - s.anchorReal) * s.rate
  }

  readonly rate = computed(() => this.state.value.rate)
  readonly paused = computed(() => this.state.value.paused)

  /** True when showing the present moment in real time (within 2 s). */
  readonly isLive = computed(() => {
    const s = this.state.value
    // Reading `epoch` makes this recompute after jumps; offset itself only
    // changes through set/live, which also bump the epoch.
    void this.epoch.value
    return !s.paused && s.rate === 1 && Math.abs(s.anchorSim - (Date.now() - (performance.now() - s.anchorReal))) < 2000
  })

  private reanchor(patch: Partial<ClockState>, jump: boolean): void {
    this.state.value = { ...this.state.peek(), anchorSim: this.now(), anchorReal: performance.now(), ...patch }
    if (jump) this.epoch.value++
  }

  /** Jump to a simulated time, keeping the current rate. */
  set(ms: number): void {
    this.reanchor({ anchorSim: ms }, true)
  }

  setRate(rate: number): void {
    this.reanchor({ rate, paused: false }, false)
  }

  pause(): void {
    this.reanchor({ paused: true }, false)
  }

  resume(): void {
    this.reanchor({ paused: false }, false)
  }

  /** Back to the present, in real time. */
  live(): void {
    this.reanchor({ anchorSim: Date.now(), rate: 1, paused: false }, true)
  }
}

export const clock = new Clock()
