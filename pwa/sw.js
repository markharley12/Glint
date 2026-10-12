/*
 * The service worker: makes the app open offline and cheap to reopen.
 *
 * - App shell (HTML, JS, CSS, icons): precached on install under a cache
 *   named for this build's VERSION; served cache-first. A new build installs
 *   alongside and waits until the page says to take over (the "Update"
 *   button), so a running session never mixes old and new files.
 * - data/index.json: network-first with a timeout, falling back to the
 *   cached copy offline. It is small and says which packs are current.
 * - data/<pack>-<hash>.json: content-addressed, so cache-first forever; old
 *   packs are pruned whenever a fresh index arrives.
 * - Other assets/ files (the place-name shards): content-hashed and loaded
 *   on demand, so cached on first use into this build's shell cache.
 *
 * The build (vite.config.ts) fills in VERSION and FILES.
 */
'use strict'

const VERSION = 'dev'
const FILES = []
const SHELL = `glint-shell-${VERSION}`
const DATA = 'glint-data'
const INDEX_TIMEOUT_MS = 5000

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('glint-shell-') && key !== SHELL) await caches.delete(key)
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting()
})

/** Path of a same-origin URL relative to the worker's scope, e.g. "data/index.json". */
function scoped(url) {
  const scope = new URL(self.registration.scope)
  return url.origin === scope.origin && url.pathname.startsWith(scope.pathname) ? url.pathname.slice(scope.pathname.length) : null
}

async function indexNetworkFirst(request) {
  const cache = await caches.open(DATA)
  try {
    const response = await Promise.race([
      fetch(request, { cache: 'no-cache' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), INDEX_TIMEOUT_MS)),
    ])
    if (response.ok) {
      await cache.put(request, response.clone())
      pruneData(cache, await response.clone().json()).catch(() => undefined)
    }
    return response
  } catch (e) {
    const cached = await cache.match(request)
    if (cached) return cached
    throw e
  }
}

/** Drop cached packs the current index no longer lists. */
async function pruneData(cache, index) {
  const current = new Set((index.packs || []).map((p) => p.file))
  for (const req of await cache.keys()) {
    const path = scoped(new URL(req.url))
    if (path && path.startsWith('data/') && path !== 'data/index.json' && !current.has(path.slice(5))) await cache.delete(req)
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

async function navigation(request) {
  // Fresh HTML when online (it names the current build's assets); the
  // cached shell when not.
  try {
    return await fetch(request)
  } catch (e) {
    const cache = await caches.open(SHELL)
    const shell = (await cache.match('./')) || (await cache.match('index.html'))
    if (shell) return shell
    throw e
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  const path = scoped(url)
  if (path === null) return // other origins: let the browser handle them
  if (request.mode === 'navigate') return event.respondWith(navigation(request))
  if (path === 'data/index.json') return event.respondWith(indexNetworkFirst(request))
  if (path.startsWith('data/')) return event.respondWith(cacheFirst(request, DATA))
  if (FILES.includes(path) || path.startsWith('assets/')) return event.respondWith(cacheFirst(request, SHELL))
})
