/**
 * Build src/data/places/*.json, the offline place-name list for setting a
 * location: every town of 15,000 people or more from GeoNames, sharded by
 * first letter (see shardKey). Towns don't
 * move, so the output is committed and this only needs re-running rarely.
 *
 *     npm run cities
 *
 * Source: GeoNames (geonames.org), cities15000 and admin1 codes,
 * CC BY 4.0.
 */
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strFromU8, unzipSync } from 'fflate'
import { parseAdmin1, parseCities, shardPlaces } from './lib/cities.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, '.cache', 'geonames')
const OUT = join(ROOT, 'src', 'data', 'places')
const BASE = 'https://download.geonames.org/export/dump'
const MIN_POPULATION = 15_000

async function cached(name: string): Promise<Uint8Array> {
  const path = join(CACHE, name)
  try {
    await stat(path)
    return new Uint8Array(await readFile(path))
  } catch {
    const res = await fetch(`${BASE}/${name}`, { signal: AbortSignal.timeout(120_000) })
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
    const body = new Uint8Array(await res.arrayBuffer())
    await mkdir(CACHE, { recursive: true })
    await writeFile(path, body)
    return body
  }
}

const zip = unzipSync(await cached('cities15000.zip'))
const text = strFromU8(zip['cities15000.txt']!)
const admin1 = parseAdmin1(strFromU8(await cached('admin1CodesASCII.txt')))
const data = parseCities(text, admin1, MIN_POPULATION, 'Place names: GeoNames (geonames.org), CC BY 4.0.')
await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })
let bytes = 0
let largest = 0
const shards = shardPlaces(data)
for (const [key, shard] of shards) {
  const json = JSON.stringify(shard)
  bytes += json.length
  largest = Math.max(largest, json.length)
  await writeFile(join(OUT, `${key}.json`), json)
}
console.log(
  `${data.rows.length} places in ${shards.size} shards: ${(bytes / 1024).toFixed(0)} KB, largest ${(largest / 1024).toFixed(0)} KB`,
)
