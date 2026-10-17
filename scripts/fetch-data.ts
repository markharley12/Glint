/**
 * Download current orbital elements and catalogue data, and write the packs
 * the app loads into public/data/.
 *
 *     npm run data                  # fetch (reusing downloads < 2 h old)
 *     npm run data -- --cache-only  # rebuild from .cache/ without the network
 *
 * Sources:
 * - CelesTrak GP groups (OMM JSON) — orbital elements.
 * - CelesTrak satcat.csv — object type, owner, launch date, radar size.
 * - Mike McCants' quicksat.mag — standard magnitudes.
 *
 * CelesTrak asks clients not to download a group more than once per update
 * (about every two hours) and blocks addresses that hammer it, so every
 * download is cached in .cache/data/ and reused while fresh, requests go one
 * at a time with a pause between, and the User-Agent says who we are. The
 * Pages workflow runs this every few hours and deploys the result; browsers
 * never contact CelesTrak (it sends no CORS headers anyway).
 */
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { unzipSync, strFromU8 } from 'fflate'
import { PACK_FORMAT, type DataIndex } from '../src/data/pack.ts'
import { buildPacks, type CelestrakOmm, type PackDefinition } from './lib/build.ts'
import { parseQuicksatMag, parseSatcat } from './lib/parse.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, '.cache', 'data')
const OUT = join(ROOT, 'public', 'data')

const USER_AGENT = 'Glint/0.1 (open-source satellite AR web app; scheduled build-time refresh; https://github.com/markharley12/Glint)'
const HOUR = 3_600_000

/** The packs, in the order the app lists them. CelesTrak group names are
 *  those on https://celestrak.org/NORAD/elements/. */
export const PACKS: PackDefinition[] = [
  {
    id: 'bright',
    title: 'Bright & notable',
    description: 'Space stations, the brightest ~150 satellites, and everything launched in the last 30 days.',
    default: true,
    groups: ['stations', 'visual', 'last-30-days'],
  },
  {
    id: 'starlink',
    title: 'Starlink',
    description: 'SpaceX’s broadband constellation — the usual answer to “what was that line of lights?”.',
    default: true,
    groups: ['starlink'],
  },
  {
    id: 'constellations',
    title: 'Other broadband constellations',
    description: 'OneWeb and Amazon Kuiper.',
    default: false,
    groups: ['oneweb', 'kuiper'],
  },
  {
    id: 'gnss',
    title: 'Navigation',
    description: 'GPS, GLONASS, Galileo and BeiDou. High and faint: binoculars at best.',
    default: false,
    groups: ['gnss'],
  },
  {
    id: 'weather',
    title: 'Weather & Earth observation',
    description: 'Weather satellites and Earth-resources imagers.',
    default: false,
    groups: ['weather', 'resource'],
  },
  {
    id: 'science',
    title: 'Science',
    description: 'Space telescopes and research satellites.',
    default: false,
    groups: ['science'],
  },
  {
    id: 'amateur',
    title: 'Amateur radio',
    description: 'Satellites carrying amateur radio transponders.',
    default: false,
    groups: ['amateur'],
  },
  {
    id: 'geo',
    title: 'Geostationary',
    description: 'Fixed in the sky above the equator, ~36,000 km up. Never visible to the eye.',
    default: false,
    groups: ['geo'],
  },
]

const SOURCES = [
  'Orbital elements and satellite catalogue: CelesTrak (celestrak.org), T. S. Kelso.',
  'Standard magnitudes: Mike McCants’ quicksat.mag (mmccants.org).',
]

const cacheOnly = process.argv.includes('--cache-only')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * When each cached file was downloaded, kept in a stamp file rather than
 * read from file times: CI restores the cache from an archive, and restored
 * files can carry the restore's time, which would make week-old data look
 * fresh and stop it ever being refreshed.
 */
const STAMPS = join(CACHE, 'downloaded.json')
let stamps: Record<string, number> | null = null

async function loadStamps(): Promise<Record<string, number>> {
  if (!stamps) {
    try {
      stamps = JSON.parse(await readFile(STAMPS, 'utf8')) as Record<string, number>
    } catch {
      stamps = {}
    }
  }
  return stamps
}

async function fresh(name: string, maxAgeMs: number): Promise<boolean> {
  const at = (await loadStamps())[name]
  return at !== undefined && Date.now() - at < maxAgeMs
}

async function stamp(name: string): Promise<void> {
  const s = await loadStamps()
  s[name] = Date.now()
  await writeFile(STAMPS, JSON.stringify(s, null, 1))
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

let lastRequest = 0

/**
 * The bytes at `url`, from the cache if younger than `maxAgeMs`, otherwise
 * downloaded (and cached). A failed download falls back to a stale cached
 * copy, with a warning, rather than failing the build.
 */
async function download(url: string, cacheName: string, maxAgeMs: number): Promise<Uint8Array> {
  const path = join(CACHE, cacheName)
  if (cacheOnly || (await fresh(cacheName, maxAgeMs))) {
    if (await exists(path)) return new Uint8Array(await readFile(path))
    throw new Error(`${cacheName} is not cached`)
  }
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    const wait = lastRequest + 1500 - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequest = Date.now()
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(120_000) })
      const body = new Uint8Array(await res.arrayBuffer())
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${strFromU8(body.slice(0, 200)).trim()}`)
      await mkdir(CACHE, { recursive: true })
      await writeFile(path, body)
      await stamp(cacheName)
      return body
    } catch (e) {
      lastError = e
      console.warn(`  ${cacheName}: attempt ${attempt} failed: ${(e as Error).message}`)
      if (attempt < 3) await sleep(5000 * attempt)
    }
  }
  if (await exists(path)) {
    console.warn(`  ${cacheName}: using the stale cached copy`)
    return new Uint8Array(await readFile(path))
  }
  throw lastError
}

async function fetchGroup(group: string): Promise<CelestrakOmm[]> {
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=json`
  const text = strFromU8(await download(url, `gp-${group}.json`, 2 * HOUR))
  // CelesTrak answers bad queries with 200 and a line of plain text.
  if (!text.trimStart().startsWith('[')) throw new Error(`CelesTrak: ${text.slice(0, 200).trim()}`)
  const data: unknown = JSON.parse(text)
  if (!Array.isArray(data) || data.length === 0) throw new Error('empty group')
  return data as CelestrakOmm[]
}

async function main() {
  console.log(cacheOnly ? 'Building packs from the cache only' : 'Fetching orbital data')
  const groups = new Map<string, CelestrakOmm[]>()
  const failures: string[] = []
  for (const g of [...new Set(PACKS.flatMap((p) => p.groups))]) {
    try {
      const list = await fetchGroup(g)
      groups.set(g, list)
      console.log(`  ${g}: ${list.length}`)
    } catch (e) {
      failures.push(g)
      console.warn(`  ${g}: FAILED — ${(e as Error).message}`)
    }
  }

  const satcat = parseSatcat(strFromU8(await download('https://celestrak.org/pub/satcat.csv', 'satcat.csv', 24 * HOUR)))
  console.log(`  satcat: ${satcat.size} objects`)
  const zip = unzipSync(await download('https://www.mmccants.org/programs/qsmag.zip', 'qsmag.zip', 7 * 24 * HOUR))
  const magName = Object.keys(zip).find((n) => n.toLowerCase().endsWith('.mag'))
  if (!magName) throw new Error('qsmag.zip has no .mag file')
  const mccants = parseQuicksatMag(strFromU8(zip[magName]!, true))
  console.log(`  quicksat.mag: ${mccants.size} objects`)

  const result = buildPacks({ definitions: PACKS, groups, satcat, mccants, nowMs: Date.now() })
  const missingDefault = PACKS.filter((p) => p.default && result.skipped.includes(p.id))
  if (missingDefault.length > 0) {
    throw new Error(`No data for default pack(s): ${missingDefault.map((p) => p.id).join(', ')}`)
  }

  await mkdir(OUT, { recursive: true })
  const index: DataIndex = { format: PACK_FORMAT, generated: new Date().toISOString(), sources: SOURCES, packs: [] }
  for (const { definition: d, file } of result.packs) {
    const json = JSON.stringify(file)
    // Content-addressed, so the service worker can cache packs forever and
    // only the small index.json ever needs revalidating.
    const name = `${d.id}-${createHash('sha256').update(json).digest('hex').slice(0, 10)}.json`
    await writeFile(join(OUT, name), json)
    index.packs.push({
      id: d.id,
      title: d.title,
      description: d.description,
      default: d.default,
      count: file.rows.length,
      file: name,
      bytes: Buffer.byteLength(json),
      gzipBytes: gzipSync(json, { level: 9 }).length,
    })
  }
  await writeFile(join(OUT, 'index.json'), JSON.stringify(index, null, 1))
  // Remove packs from earlier runs.
  const keep = new Set(['index.json', ...index.packs.map((p) => p.file)])
  for (const f of await readdir(OUT)) if (!keep.has(f)) await rm(join(OUT, f))

  const m = result.model
  console.log(`\nMagnitude from RCS: ${m.a.toFixed(2)} ${m.b.toFixed(2)}·log10(RCS), rms ${m.rms.toFixed(2)} over ${m.n}`)
  console.log(`Magnitude sources: ${JSON.stringify(result.magnitudeSources)}`)
  console.log(`Rejected: ${JSON.stringify(result.rejected)}`)
  for (const p of index.packs) {
    console.log(`  ${p.id.padEnd(15)} ${String(p.count).padStart(6)} sats ${(p.bytes / 1024).toFixed(0).padStart(6)} KB (${((p.gzipBytes ?? 0) / 1024).toFixed(0)} KB gzipped)`)
  }
  if (result.skipped.length) console.warn(`Skipped packs (no data): ${result.skipped.join(', ')}`)
  if (failures.length) console.warn(`Failed groups: ${failures.join(', ')}`)
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
