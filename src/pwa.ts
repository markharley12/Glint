/**
 * Service worker registration (production builds only: in development it
 * would cache files out from under Vite's hot reload).
 */
import { signal } from '@preact/signals'

/** A new version is installed and waiting; reloading will activate it. */
export const updateReady = signal(false)

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        const watch = (w: ServiceWorker | null) => {
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) updateReady.value = true
          })
        }
        if (reg.waiting && navigator.serviceWorker.controller) updateReady.value = true
        reg.addEventListener('updatefound', () => watch(reg.installing))
      })
      .catch((e: unknown) => console.warn('Service worker registration failed', e))
  })
}

/** Activate the waiting worker and reload onto it. */
export function applyUpdate(): void {
  void navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg?.waiting) return window.location.reload()
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
    reg.waiting.postMessage({ type: 'skip-waiting' })
  })
}
