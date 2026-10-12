import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BrowserContext } from '@playwright/test'

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'data')

/** Serve the frozen fixture data (scripts/make-e2e-data.ts) for every
 *  data/ request, so tests don't depend on what public/data holds today. */
export async function serveFixtureData(context: BrowserContext): Promise<void> {
  await context.route('**/data/*.json', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!
    try {
      const body = await readFile(join(DATA, name === 'index.json' ? 'index.json' : 'bright-fixture.json'), 'utf8')
      await route.fulfill({ status: 200, contentType: 'application/json', body })
    } catch {
      await route.fulfill({ status: 404, body: 'not found' })
    }
  })
}

/** Cape Town, 2026-10-11: the ISS rises at 17:33:23 UTC on a bright
 *  (−3.0) pass peaking at 41° at 17:36:36. */
export const CAPE_TOWN = { lat: -33.92, lon: 18.42 }
export const ISS_PASS_PEAK = '2026-10-11T17:36:30Z'

export function appUrl(params: Record<string, string | number>): string {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
  return `./?${q.toString()}`
}
