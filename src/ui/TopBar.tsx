import { APP_NAME } from '../app-info.ts'
import { updateReady, applyUpdate } from '../pwa.ts'
import { panel } from '../state/view.ts'
import { Icon } from './Icon.tsx'

export function TopBar() {
  return (
    <header class="topbar">
      <button class="topbar__brand" onClick={() => (panel.value = 'about')} aria-label={`About ${APP_NAME}`}>
        <Icon name="logo" />
        <span>{APP_NAME}</span>
      </button>
      <div class="topbar__actions">
        {updateReady.value && (
          <button class="chip chip--accent" onClick={applyUpdate}>
            Update
          </button>
        )}
        <button class="icon-btn" onClick={() => (panel.value = 'search')} aria-label="Find a satellite">
          <Icon name="search" />
        </button>
        <button class="icon-btn" onClick={() => (panel.value = 'settings')} aria-label="Settings">
          <Icon name="settings" />
        </button>
      </div>
    </header>
  )
}
