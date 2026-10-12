import { startAr, stopAr } from '../state/ar.ts'
import { settings, updateSettings, type ViewMode } from '../state/settings.ts'
import { panel } from '../state/view.ts'
import { Icon } from './Icon.tsx'

const VIEWS: { id: ViewMode; label: string; icon: 'map' | 'sky' | 'ar' }[] = [
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'sky', label: 'Sky', icon: 'sky' },
  { id: 'ar', label: 'AR', icon: 'ar' },
]

export function setView(view: ViewMode): void {
  const prev = settings.peek().view
  if (prev === view) return
  if (prev === 'ar') stopAr()
  updateSettings({ view })
  // Straight from the tap, so iOS will show its motion-permission prompt.
  if (view === 'ar') void startAr()
}

export function BottomNav() {
  const view = settings.value.view
  return (
    <nav class="bottomnav" aria-label="Views">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          class={`bottomnav__btn ${view === v.id ? 'bottomnav__btn--on' : ''}`}
          aria-pressed={view === v.id}
          onClick={() => setView(v.id)}
        >
          <Icon name={v.icon} />
          <span>{v.label}</span>
        </button>
      ))}
      <button class="bottomnav__btn" onClick={() => (panel.value = 'passes')}>
        <Icon name="passes" />
        <span>Passes</span>
      </button>
    </nav>
  )
}
