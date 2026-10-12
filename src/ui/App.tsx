import { useEffect } from 'preact/hooks'
import { calibrating } from '../state/calibration.ts'
import { identifyState } from '../state/identify.ts'
import { settings } from '../state/settings.ts'
import { observer } from '../state/observer.ts'
import { panel, toast } from '../state/view.ts'
import { ArOverlay } from './ArOverlay.tsx'
import { BottomNav } from './BottomNav.tsx'
import { Guard } from './Guard.tsx'
import { InfoCard } from './InfoCard.tsx'
import { installKeyboard } from './keyboard.ts'
import { LocationPrompt } from './LocationPrompt.tsx'
import { AboutPanel } from './panels/AboutPanel.tsx'
import { PassesPanel } from './panels/PassesPanel.tsx'
import { RecallPanel } from './panels/RecallPanel.tsx'
import { SearchPanel } from './panels/SearchPanel.tsx'
import { SettingsPanel } from './panels/SettingsPanel.tsx'
import { SkyView } from './SkyView.tsx'
import { StatusLine } from './StatusLine.tsx'
import { TimeBar } from './TimeBar.tsx'
import { TopBar } from './TopBar.tsx'

export function App() {
  const s = settings.value
  useEffect(() => {
    document.documentElement.classList.toggle('night', s.night)
  }, [s.night])

  useEffect(() => installKeyboard(), [])

  const p = panel.value
  // Calibrating or identifying takes over the AR view: just the sky and
  // its own panel.
  const focused = s.view === 'ar' && (calibrating.value || identifyState.value.phase !== 'idle')
  return (
    <div class={`app app--${s.view}`}>
      <SkyView />
      <div class="hud">
        <TopBar />
        <StatusLine />
        {s.view === 'ar' && <ArOverlay />}
        <div class="hud__spacer" />
        {!focused && (
          <>
            <InfoCard />
            <TimeBar />
            <BottomNav />
          </>
        )}
      </div>
      {/* A broken panel closes rather than taking the app down. */}
      <Guard onReset={() => (panel.value = 'none')}>
        {p === 'passes' && <PassesPanel />}
        {p === 'settings' && <SettingsPanel />}
        {p === 'search' && <SearchPanel />}
        {p === 'about' && <AboutPanel />}
        {p === 'recall' && <RecallPanel />}
      </Guard>
      {toast.value && (
        <div class="toast" role="status">
          {toast.value}
        </div>
      )}
      {!observer.value && <LocationPrompt />}
    </div>
  )
}
