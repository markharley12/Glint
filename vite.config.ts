import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import type { Plugin, PluginOption } from 'vite'
import preact from '@preact/preset-vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/** Files in public/, recursively, as paths relative to it. */
function publicFiles(dir = here('public'), prefix = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = `${dir}/${name}`
    return statSync(full).isDirectory() ? publicFiles(full, `${prefix}${name}/`) : [`${prefix}${name}`]
  })
}

/**
 * Emit dist/sw.js: pwa/sw.js with this build's file list and a version
 * hash written in. Orbit data (public/data/) is left out of the precache:
 * the worker caches it at runtime by its own rules (see sw.js).
 */
function serviceWorker(): Plugin {
  return {
    name: 'sat-ar-service-worker',
    apply: 'build',
    generateBundle: {
      // After Vite has emitted index.html, so it is in the bundle to list.
      order: 'post',
      handler(_, bundle) {
        const built = Object.keys(bundle).filter((n) => !n.endsWith('.map'))
        const copied = publicFiles().filter((n) => !n.startsWith('data/'))
        const files = [...new Set(['./', ...built, ...copied])].sort()
        let source = readFileSync(here('pwa/sw.js'), 'utf8')
        const hash = createHash('sha256')
        for (const name of built) {
          const out = bundle[name]!
          hash.update(name).update(out.type === 'asset' ? out.source : out.code)
        }
        for (const name of copied) hash.update(name).update(readFileSync(here(`public/${name}`)))
        // The worker's own source too, or a change to it alone would reuse
        // the old version name.
        hash.update(source)
        const fills: [string, string][] = [
          ["const VERSION = 'dev'", `const VERSION = '${hash.digest('hex').slice(0, 12)}'`],
          ['const FILES = []', `const FILES = ${JSON.stringify(files)}`],
        ]
        for (const [from, to] of fills) {
          // Loud, rather than quietly shipping a worker that caches nothing.
          if (!source.includes(from)) throw new Error(`pwa/sw.js no longer contains: ${from}`)
          source = source.replace(from, to)
        }
        this.emitFile({ type: 'asset', fileName: 'sw.js', source })
      },
    },
  }
}

/**
 * satellite.js ships an optional WASM build whose Emscripten loader has
 * Node-only branches (`await import('node:module')`). We never load it, so
 * no chunk is emitted, but Vite warns about each Node built-in it sees.
 * Resolve those as external for that importer only, so real warnings
 * elsewhere stay visible.
 */
function quietSatelliteWasm(): Plugin {
  return {
    name: 'sat-ar-quiet-satellite-wasm',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id.startsWith('node:') && importer?.includes('satellite.js/wasm-build/')) return { id, external: true }
      return null
    },
  }
}

// Camera and motion sensors need a secure context. On a phone that means
// HTTPS: either `tailscale serve` in front of the plain dev server (trusted
// certificate, nothing to click through), or `HTTPS=1 npm run dev` for a
// self-signed certificate on the LAN. See README "Testing on a phone".
const https = process.env.HTTPS === '1'

export default defineConfig({
  plugins: [quietSatelliteWasm(), preact(), serviceWorker(), https ? (basicSsl() as PluginOption) : null],
  // Relative, so one build works at a domain root and under GitHub Pages'
  // /<repo>/ path alike.
  base: './',
  server: {
    host: true,
    allowedHosts: ['.ts.net'],
  },
  // The worker bundle is built with its own plugin list.
  worker: { format: 'es', plugins: () => [quietSatelliteWasm()] },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    // Core maths runs in plain Node; UI tests opt into jsdom with a
    // `// @vitest-environment jsdom` docblock.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    restoreMocks: true,
  },
})
