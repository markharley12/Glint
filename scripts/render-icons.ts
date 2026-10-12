/**
 * Render pwa/icon.svg to the PNGs the web manifest and iOS need, in
 * public/. Headless Chrome (through Playwright), so the SVG renders exactly
 * as a browser draws it. The PNGs are committed; re-run only when the icon
 * changes:
 *
 *     node scripts/render-icons.ts
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const svg = await readFile(join(ROOT, 'pwa', 'icon.svg'), 'utf8')
// Maskable: launchers crop to any shape inside the central 80%, so the
// drawing shrinks to fit that safe zone over a full-bleed background.
const maskable = svg.replace(/(<rect[^>]*\/>)([\s\S]*)(<\/svg>)/, '$1<g transform="translate(51.2 51.2) scale(0.8)">$2</g>$3')

const outputs: { file: string; size: number; source: string }[] = [
  { file: 'icon-192.png', size: 192, source: svg },
  { file: 'icon-512.png', size: 512, source: svg },
  { file: 'icon-maskable-512.png', size: 512, source: maskable },
  { file: 'apple-touch-icon.png', size: 180, source: svg },
]

const browser = await chromium.launch({ channel: 'chrome' })
try {
  for (const o of outputs) {
    const page = await browser.newPage({ viewport: { width: o.size, height: o.size } })
    await page.setContent(`<html><body style="margin:0"><img src="data:image/svg+xml;base64,${Buffer.from(o.source).toString('base64')}" width="${o.size}" height="${o.size}"></body></html>`)
    await writeFile(join(ROOT, 'public', o.file), await page.screenshot({ type: 'png', omitBackground: false }))
    await page.close()
    console.log(`public/${o.file}`)
  }
} finally {
  await browser.close()
}
