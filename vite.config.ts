import { defineConfig } from 'vitest/config'
import type { PluginOption } from 'vite'
import preact from '@preact/preset-vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Camera and motion sensors need a secure context. On a phone that means
// HTTPS: either `tailscale serve` in front of the plain dev server (trusted
// certificate, nothing to click through), or `HTTPS=1 npm run dev` for a
// self-signed certificate on the LAN. See README "Testing on a phone".
const https = process.env.HTTPS === '1'

export default defineConfig({
  plugins: [preact(), https ? (basicSsl() as PluginOption) : null],
  // Relative, so one build works at a domain root and under GitHub Pages'
  // /<repo>/ path alike.
  base: './',
  server: {
    host: true,
    allowedHosts: ['.ts.net'],
  },
  worker: { format: 'es' },
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
