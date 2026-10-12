import { useEffect } from 'preact/hooks'
import { settings } from '../state/settings.ts'
import { observer } from '../state/observer.ts'
import { panel, toast } from '../state/view.ts'
import { ArOverlay } from './ArOverlay.tsx'
import { BottomNav } from './BottomNav.tsx'
import { InfoCard } from './InfoCard.tsx'
import { LocationPrompt } from './LocationPrompt.tsx'
import { AboutPanel } from './panels/AboutPanel.tsx'
import { PassesPanel } from './panels/PassesPanel.tsx'
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

  const p = panel.value
  return (
    <div class={`app app--${s.view}`}>
      <SkyView />
      <div class="hud">
        <TopBar />
        <StatusLine />
        {s.view === 'ar' && <ArOverlay />}
        <div class="hud__spacer" />
        <InfoCard />
        <TimeBar />
        <BottomNav />
      </div>
      {p === 'passes' && <PassesPanel />}
      {p === 'settings' && <SettingsPanel />}
      {p === 'search' && <SearchPanel />}
      {p === 'about' && <AboutPanel />}
      {toast.value && (
        <div class="toast" role="status">
          {toast.value}
        </div>
      )}
      {!observer.value && <LocationPrompt />}
    </div>
  )
}
