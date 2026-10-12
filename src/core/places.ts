/**
 * Finding a place by name, from the compact city list in
 * src/data/cities.json (GeoNames, towns of 15,000 people or more), so the
 * location can be set without GPS or typing coordinates — and offline.
 */

/** The city list as stored: positional rows, places sorted by population. */
export interface PlaceData {
  /** Credit line for the About panel. */
  source: string
  /** ISO 3166 country codes, indexed by each row's country column. */
  countries: string[]
  /** First-level region names ("England", "California"), likewise. */
  regions: string[]
  /** [name, ASCII name or 0 if the same, country, region or −1,
   *   latitude × 100, longitude × 100, population in thousands] */
  rows: [string, string | 0, number, number, number, number, number][]
}

export interface Place {
  name: string
  region: string | null
  /** ISO 3166 country code. */
  country: string
  latitude: number
  longitude: number
  /** Thousands. */
  population: number
}

/**
 * The list is split into shards by the first letter of the normalised
 * name, so typing "lon" loads only the L shard (tens of kilobytes, not a
 * megabyte). A place whose ASCII name starts differently ("Łódź", "Lodz")
 * is in both shards.
 */
export function shardKey(text: string): string {
  const c = normalize(text).charAt(0)
  return /[a-z0-9]/.test(c) ? c : '_'
}

/** Lower case, accents and punctuation removed: "São Paulo" → "sao paulo". */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function place(data: PlaceData, row: PlaceData['rows'][number]): Place {
  const [name, , c, r, lat, lon, pop] = row
  return { name, region: r >= 0 ? (data.regions[r] ?? null) : null, country: data.countries[c] ?? '', latitude: lat / 100, longitude: lon / 100, population: pop }
}

/** Does `text` match `q` at the start of a word? 2 for the whole text,
 *  1 for a prefix, 0 for no match. */
function wordMatch(text: string, q: string): number {
  if (text === q) return 2
  if (text.startsWith(q)) return 1
  return text.includes(` ${q}`) ? 1 : 0
}

/**
 * Places whose name starts with the query (or has a word that does),
 * best first: exact names, then by population. "Paris, US" or "Paris
 * Texas" narrows by country code, country or region name.
 *
 * @param countryName ISO code → the country's name in the user's language
 */
export function searchPlaces(data: PlaceData, query: string, countryName: (code: string) => string, limit = 8): Place[] {
  const [head = '', ...rest] = query.split(',')
  const q = normalize(head)
  const where = normalize(rest.join(' '))
  if (q.length < 2) return []
  const scored: { row: PlaceData['rows'][number]; score: number }[] = []
  for (const row of data.rows) {
    const name = normalize(row[0])
    let m = wordMatch(name, q)
    if (!m && row[1]) m = wordMatch(normalize(row[1]), q)
    // "paris texas": the name is the first words, the rest is where.
    let extra = where
    if (!m && !where) {
      const words = q.split(' ')
      for (let k = words.length - 1; k >= 1 && !m; k--) {
        const lead = words.slice(0, k).join(' ')
        if (name === lead || name.startsWith(`${lead} `)) {
          m = 1
          extra = words.slice(k).join(' ')
        }
      }
    }
    if (!m) continue
    if (extra) {
      const code = data.countries[row[2]] ?? ''
      const region = row[3] >= 0 ? normalize(data.regions[row[3]] ?? '') : ''
      const country = normalize(countryName(code))
      if (!(code.toLowerCase() === extra || country.startsWith(extra) || region.startsWith(extra))) continue
    }
    // Rows are by population, so the first exact matches win ties.
    scored.push({ row, score: m })
    if (scored.length >= 400) break
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => place(data, s.row))
}

/** "Springfield, Illinois, United States". */
export function placeLabel(p: Place, countryName: (code: string) => string): string {
  // Skip the region when it just repeats the name (São Paulo, São Paulo).
  const region = p.region && p.region !== p.name ? p.region : null
  return [p.name, region, countryName(p.country)].filter(Boolean).join(', ')
}
