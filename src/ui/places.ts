/** Loading the place-name shards on demand, and country names in the
 *  user's language. */
import { searchPlaces, shardKey, type Place, type PlaceData } from '../core/places.ts'

// One lazily loaded chunk per shard; the service worker caches each on
// first use instead of precaching all 1.4 MB.
const shards = import.meta.glob<PlaceData>('../data/places/*.json', { import: 'default' })
const loading = new Map<string, Promise<PlaceData | null>>()

function shard(key: string): Promise<PlaceData | null> {
  let p = loading.get(key)
  if (!p) {
    const load = shards[`../data/places/${key}.json`]
    p = load ? load().catch(() => null) : Promise.resolve(null)
    loading.set(key, p)
    // A failed load (offline, say) may work next time.
    void p.then((d) => d === null && loading.delete(key))
  }
  return p
}

let regionNames: Intl.DisplayNames | null = null
try {
  regionNames = new Intl.DisplayNames(undefined, { type: 'region' })
} catch {
  // Very old browsers: show the ISO code instead.
}

export function countryName(code: string): string {
  try {
    return regionNames?.of(code) ?? code
  } catch {
    return code
  }
}

export async function findPlaces(query: string, limit = 8): Promise<Place[]> {
  const data = await shard(shardKey(query))
  return data ? searchPlaces(data, query, countryName, limit) : []
}
