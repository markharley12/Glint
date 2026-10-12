/**
 * GeoNames' city dump (cities15000.txt, tab-separated) to the app's
 * compact PlaceData. Pure, so the rules are tested.
 */
import { shardKey, type PlaceData } from '../../src/core/places.ts'

/** "GB.ENG" → "England", from admin1CodesASCII.txt. */
export function parseAdmin1(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of text.split('\n')) {
    const [code, name] = line.split('\t')
    if (code && name) out.set(code, name)
  }
  return out
}

export function parseCities(text: string, admin1: Map<string, string>, minPopulation: number, source: string): PlaceData {
  const parsed: { name: string; ascii: string; cc: string; region: string | null; lat: number; lon: number; pop: number }[] = []
  for (const line of text.split('\n')) {
    const f = line.split('\t')
    if (f.length < 15) continue
    const pop = Number(f[14])
    if (!(pop >= minPopulation)) continue
    const cc = f[8]!
    parsed.push({
      name: f[1]!,
      ascii: f[2]!,
      cc,
      region: admin1.get(`${cc}.${f[10]}`) ?? null,
      lat: Number(f[4]),
      lon: Number(f[5]),
      pop,
    })
  }
  parsed.sort((a, b) => b.pop - a.pop)
  const countries: string[] = []
  const regions: string[] = []
  const indexOf = (list: string[], map: Map<string, number>, v: string) => {
    let i = map.get(v)
    if (i === undefined) {
      i = list.length
      list.push(v)
      map.set(v, i)
    }
    return i
  }
  const cMap = new Map<string, number>()
  const rMap = new Map<string, number>()
  const rows: PlaceData['rows'] = parsed.map((p) => [
    p.name,
    p.ascii === p.name ? 0 : p.ascii,
    indexOf(countries, cMap, p.cc),
    p.region === null ? -1 : indexOf(regions, rMap, p.region),
    // Two decimals is about a kilometre: plenty for a sky.
    Math.round(p.lat * 100),
    Math.round(p.lon * 100),
    Math.round(p.pop / 1000),
  ])
  return { source, countries, regions, rows }
}

/** Split by shardKey, each shard with just the countries and regions its
 *  rows use, re-indexed. Rows keep their population order. */
export function shardPlaces(data: PlaceData): Map<string, PlaceData> {
  const shards = new Map<string, { data: PlaceData; c: Map<number, number>; r: Map<number, number> }>()
  for (const row of data.rows) {
    const keys = new Set([shardKey(row[0]), ...(row[1] ? [shardKey(row[1])] : [])])
    for (const key of keys) {
      let s = shards.get(key)
      if (!s) shards.set(key, (s = { data: { source: data.source, countries: [], regions: [], rows: [] }, c: new Map(), r: new Map() }))
      const remap = (i: number, from: string[], to: string[], map: Map<number, number>) => {
        if (i < 0) return -1
        let j = map.get(i)
        if (j === undefined) {
          j = to.length
          to.push(from[i]!)
          map.set(i, j)
        }
        return j
      }
      const [name, ascii, c, r, lat, lon, pop] = row
      s.data.rows.push([name, ascii, remap(c, data.countries, s.data.countries, s.c), remap(r, data.regions, s.data.regions, s.r), lat, lon, pop])
    }
  }
  return new Map([...shards].map(([k, s]) => [k, s.data]))
}
