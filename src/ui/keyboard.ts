/**
 * Keyboard shortcuts, for desktop use. Ignored while typing in a field or
 * with Ctrl, Alt or Meta held, so browser shortcuts keep working. Escape
 * inside an open panel is the panel's own business (Sheet closes itself).
 */
import { clamp, wrap360 } from '../core/vec.ts'
import { calibrating } from '../state/calibration.ts'
import { clock } from '../state/clock.ts'
import { closeIdentify, identifyState, startIdentify } from '../state/identify.ts'
import { settings, updateSettings } from '../state/settings.ts'
import { selected } from '../state/tracker.ts'
import { following, lookDirection, panel } from '../state/view.ts'
import { setView } from './BottomNav.tsx'

export const SHORTCUTS: [keys: string, what: string][] = [
  ['← → ↑ ↓', 'Look around in the Sky view (Shift: bigger steps)'],
  ['+ −', 'Zoom in and out in the Sky view'],
  ['1 2 3', 'Map, Sky and AR views'],
  ['Space', 'Pause or resume time'],
  ['[ ]', 'Back or forward 10 minutes'],
  ['{ }', 'Back or forward an hour'],
  ['N', 'Back to now'],
  ['F', 'Follow the selected satellite in the Sky view'],
  ['W', 'What’s that? (AR view)'],
  ['/', 'Find a satellite'],
  ['P', 'Visible passes'],
  ['Esc', 'Close, stop following, or clear the selection'],
]

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** Handle one key press; returns whether it was a shortcut. */
export function handleKey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return false
  // Space on a focused button presses it; leave that alone.
  if (e.key === ' ' && e.target instanceof HTMLElement && e.target.closest('button, a, [role="button"]')) return false
  const s = settings.peek()
  const sky = s.view === 'sky'
  const turn = (dAz: number, dEl: number) => {
    if (!sky) return false
    following.value = false
    const step = (e.shiftKey ? 15 : 5) * (s.skyFovDeg / 70)
    const { az, el } = lookDirection.peek()
    lookDirection.value = { az: wrap360(az + dAz * step), el: clamp(el + dEl * step, -20, 90) }
    return true
  }
  const zoom = (factor: number) => {
    if (!sky) return false
    updateSettings({ skyFovDeg: clamp(s.skyFovDeg * factor, 5, 150) })
    return true
  }
  // Inside an open panel only Escape matters, and the panel handles it.
  if (panel.peek() !== 'none') return false

  switch (e.key) {
    case 'ArrowLeft':
      return turn(-1, 0)
    case 'ArrowRight':
      return turn(1, 0)
    case 'ArrowUp':
      return turn(0, 1)
    case 'ArrowDown':
      return turn(0, -1)
    case '+':
    case '=':
      return zoom(1 / 1.25)
    case '-':
    case '_':
      return zoom(1.25)
    case '1':
      setView('map')
      return true
    case '2':
      setView('sky')
      return true
    case '3':
      setView('ar')
      return true
    case ' ':
      if (clock.paused.peek()) clock.resume()
      else clock.pause()
      return true
    case '[':
      clock.set(clock.now() - 600_000)
      return true
    case ']':
      clock.set(clock.now() + 600_000)
      return true
    case '{':
      clock.set(clock.now() - 3_600_000)
      return true
    case '}':
      clock.set(clock.now() + 3_600_000)
      return true
    case 'n':
    case 'N':
      clock.live()
      return true
    case 'f':
    case 'F':
      if (!sky || selected.peek() === null) return false
      following.value = !following.peek()
      return true
    case 'w':
    case 'W':
      if (s.view !== 'ar') return false
      startIdentify()
      return true
    case '/':
      panel.value = 'search'
      return true
    case 'p':
    case 'P':
      panel.value = 'passes'
      return true
    case 'Escape':
      if (identifyState.peek().phase !== 'idle') closeIdentify()
      else if (calibrating.peek()) calibrating.value = false
      else if (following.peek()) following.value = false
      else if (selected.peek() !== null) selected.value = null
      else return false
      return true
  }
  return false
}

export function installKeyboard(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (handleKey(e)) e.preventDefault()
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
