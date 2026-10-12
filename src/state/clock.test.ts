import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Clock } from './clock.ts'

describe('Clock', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 12, 20), toFake: ['Date', 'performance'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs in real time and is live by default', () => {
    const c = new Clock()
    const t0 = c.now()
    vi.advanceTimersByTime(5000)
    expect(c.now() - t0).toBeCloseTo(5000, -1)
    expect(c.isLive.value).toBe(true)
  })

  it('jumps, runs fast, pauses, and returns to live', () => {
    const c = new Clock()
    const target = Date.UTC(2026, 9, 13, 3)
    const epoch = c.epoch.value
    c.set(target)
    expect(c.epoch.value).toBe(epoch + 1)
    expect(c.isLive.value).toBe(false)
    expect(c.now()).toBeCloseTo(target, -1)

    c.setRate(60)
    vi.advanceTimersByTime(1000)
    expect(c.now() - target).toBeCloseTo(60_000, -2)

    c.pause()
    const frozen = c.now()
    vi.advanceTimersByTime(10_000)
    expect(c.now()).toBe(frozen)

    c.live()
    expect(c.isLive.value).toBe(true)
    expect(Math.abs(c.now() - Date.now())).toBeLessThan(50)
  })

  it('changing speed does not jump the time', () => {
    const c = new Clock()
    vi.advanceTimersByTime(1000)
    const before = c.now()
    const epoch = c.epoch.value
    c.setRate(10)
    expect(c.now()).toBeCloseTo(before, -1)
    expect(c.epoch.value).toBe(epoch)
  })
})
