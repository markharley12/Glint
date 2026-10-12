/** Simulated-time display and controls: step, return to now, speed up. */
import { clock } from '../state/clock.ts'
import { clockTime, dayLabel, relative } from './format.ts'
import { useNow, useWallClock } from './hooks.ts'
import { Icon } from './Icon.tsx'

const RATES = [1, 10, 60, 300]

export function TimeBar() {
  const now = useNow(500)
  const live = clock.isLive.value
  const rate = clock.rate.value
  const paused = clock.paused.value
  const real = useWallClock(500)
  // One short line: "Live", an offset within today, or the day.
  const day = dayLabel(now, real)
  const sub = live ? 'Live' : day !== 'Today' ? day : relative(now, real).replace(/^in /, '+')
  const nextRate = RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1

  return (
    <div class="timebar" role="group" aria-label="Time">
      <button class="time-btn" onClick={() => clock.set(clock.now() - 3_600_000)} aria-label="Back one hour">
        −1h
      </button>
      <button class="time-btn" onClick={() => clock.set(clock.now() - 600_000)} aria-label="Back ten minutes">
        −10m
      </button>
      <button
        class={`timebar__now ${live ? 'timebar__now--live' : ''}`}
        onClick={() => clock.live()}
        aria-label={live ? 'Showing the sky now' : 'Return to now'}
        data-testid="time"
      >
        <span class="timebar__clock">{clockTime(now, true)}</span>
        <span class="timebar__sub">{sub}</span>
      </button>
      <button class="time-btn" onClick={() => clock.set(clock.now() + 600_000)} aria-label="Forward ten minutes">
        +10m
      </button>
      <button class="time-btn" onClick={() => clock.set(clock.now() + 3_600_000)} aria-label="Forward one hour">
        +1h
      </button>
      <button
        class="time-btn"
        onClick={() => (paused ? clock.resume() : clock.pause())}
        aria-label={paused ? 'Resume time' : 'Pause time'}
      >
        <Icon name={paused ? 'play' : 'pause'} size={16} />
      </button>
      <button class={`time-btn ${rate !== 1 ? 'time-btn--on' : ''}`} onClick={() => clock.setRate(nextRate)} aria-label={`Speed ${rate}×; tap for ${nextRate}×`}>
        {rate}×
      </button>
    </div>
  )
}
