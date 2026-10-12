import { useEffect, useState } from 'preact/hooks'
import { clock } from '../state/clock.ts'

/** The simulated time, re-read every `intervalMs` and at once on jumps. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => clock.now())
  const epoch = clock.epoch.value
  useEffect(() => {
    setNow(clock.now())
    const id = setInterval(() => setNow(clock.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, epoch])
  return now
}

/** Wall-clock time (not simulated), re-read every `intervalMs`. Kept in
 *  state so rendering stays pure. */
export function useWallClock(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
