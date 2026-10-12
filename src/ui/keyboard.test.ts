// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clock } from '../state/clock.ts'
import { settings, updateSettings } from '../state/settings.ts'
import { selected } from '../state/tracker.ts'
import { following, lookDirection, panel } from '../state/view.ts'
import { handleKey } from './keyboard.ts'

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body): boolean {
  const e = new KeyboardEvent('keydown', { key, ...init })
  Object.defineProperty(e, 'target', { value: target })
  return handleKey(e)
}

describe('keyboard shortcuts', () => {
  beforeEach(() => {
    updateSettings({ view: 'sky', skyFovDeg: 70 })
    lookDirection.value = { az: 180, el: 25 }
    panel.value = 'none'
    selected.value = null
    following.value = false
    clock.live()
  })
  afterEach(() => clock.live())

  it('looks around and zooms in the Sky view', () => {
    expect(press('ArrowRight')).toBe(true)
    expect(lookDirection.value).toEqual({ az: 185, el: 25 })
    press('ArrowUp', { shiftKey: true })
    expect(lookDirection.value.el).toBe(40)
    press('+')
    expect(settings.value.skyFovDeg).toBeCloseTo(56)
  })

  it('does nothing to the view in the map', () => {
    updateSettings({ view: 'map' })
    expect(press('ArrowRight')).toBe(false)
    expect(lookDirection.value.az).toBe(180)
  })

  it('steps and pauses time', () => {
    const t = clock.now()
    press(']')
    expect(clock.now() - t).toBeGreaterThan(599_000)
    press(' ')
    expect(clock.paused.value).toBe(true)
    press('n')
    expect(clock.isLive.value).toBe(true)
  })

  it('leaves typing and browser shortcuts alone', () => {
    const input = document.createElement('input')
    expect(press('/', {}, input)).toBe(false)
    expect(press('p', { ctrlKey: true })).toBe(false)
    const button = document.createElement('button')
    expect(press(' ', {}, button)).toBe(false)
    expect(panel.value).toBe('none')
  })

  it('escapes from following, then the selection', () => {
    selected.value = 25544
    press('f')
    expect(following.value).toBe(true)
    press('Escape')
    expect(following.value).toBe(false)
    expect(selected.value).toBe(25544)
    press('Escape')
    expect(selected.value).toBeNull()
    expect(press('Escape')).toBe(false)
  })
})
