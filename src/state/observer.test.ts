import { describe, expect, it } from 'vitest'
import { observer } from './observer.ts'
import { settings, updateSettings } from './settings.ts'

describe('observer', () => {
  it('keeps the same object when only unrelated settings change (zoom)', () => {
    const before = settings.peek()
    updateSettings({ location: { latitude: 51.5, longitude: -0.1, height: 0, label: 'x', at: 1 } })
    const o = observer.peek()
    expect(o).not.toBeNull()
    updateSettings({ skyFovDeg: 33 })
    expect(observer.peek()).toBe(o)
    updateSettings({ location: { latitude: 52, longitude: -0.1, height: 0, label: 'x', at: 2 } })
    expect(observer.peek()).not.toBe(o)
    settings.value = before
  })
})
