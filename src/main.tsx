import { render } from 'preact'
import { App } from './ui/App.tsx'
import { Guard } from './ui/Guard.tsx'
import { applyUrlParams } from './state/url.ts'
import { getTracker } from './state/tracker.ts'
import { locate } from './state/observer.ts'
import { settings } from './state/settings.ts'
import { registerServiceWorker } from './pwa.ts'
import './styles.css'

applyUrlParams(window.location.search)
getTracker().start()
if (settings.peek().useGps) void locate()
render(
  <Guard>
    <App />
  </Guard>,
  document.getElementById('app')!,
)
registerServiceWorker()
