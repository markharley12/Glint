/**
 * Loading packs into Satellites: fetch, decode, merge.
 *
 * A satellite can be in several packs (a Starlink launched last week is in
 * both "bright" — via last-30-days — and "starlink"); it is kept once, with
 * the union of its group tags.
 */
import { SatRecError, type OMMJsonObject } from 'satellite.js'
import { makeSatellite, type Satellite } from '../core/satellite.ts'
import { PACK_FORMAT, rowDecoder, type DataIndex, type DecodedRow, type PackFile } from './pack.ts'

export class DataError extends Error {
  override name = 'DataError'
}

function checkFormat(what: string, format: unknown): void {
  // A newer major format than we understand means an old cached app is
  // reading new data: refuse clearly rather than mis-decode.
  if (format !== PACK_FORMAT) throw new DataError(`${what} has format ${String(format)}; this app reads format ${PACK_FORMAT}. Reload to update.`)
}

export async function fetchIndex(baseUrl: string, init?: RequestInit): Promise<DataIndex> {
  const res = await fetch(new URL('data/index.json', baseUrl), init)
  if (!res.ok) throw new DataError(`Could not load the satellite list (HTTP ${res.status})`)
  const index = (await res.json()) as DataIndex
  checkFormat('The data index', index.format)
  return index
}

export async function fetchPack(baseUrl: string, file: string, init?: RequestInit): Promise<PackFile> {
  const res = await fetch(new URL(`data/${file}`, baseUrl), init)
  if (!res.ok) throw new DataError(`Could not load ${file} (HTTP ${res.status})`)
  const pack = (await res.json()) as PackFile
  checkFormat(file, pack.format)
  return pack
}

/** Decode a pack's rows into `into`, merging group tags of repeats. */
export function mergePack(pack: PackFile, into: Map<number, DecodedRow>): void {
  const decode = rowDecoder(pack.fields)
  for (const row of pack.rows) {
    const d = decode(row)
    const prev = into.get(d.info.norad)
    if (prev) {
      for (const g of d.info.groups) if (!prev.info.groups.includes(g)) prev.info.groups.push(g)
      // Keep the newer element set if two packs were built at different times.
      if (d.omm.EPOCH > prev.omm.EPOCH) prev.omm = d.omm
    } else {
      into.set(d.info.norad, d)
    }
  }
}

/**
 * Satellites from decoded rows. Element sets satellite.js rejects at
 * initialisation are dropped and counted rather than failing the load.
 */
export function buildSatellites(rows: Iterable<DecodedRow>): { sats: Satellite[]; failed: number } {
  const sats: Satellite[] = []
  let failed = 0
  for (const { info, omm } of rows) {
    try {
      const sat = makeSatellite(info, omm as unknown as OMMJsonObject)
      if (sat.satrec.error !== SatRecError.None) failed++
      else sats.push(sat)
    } catch {
      failed++
    }
  }
  return { sats, failed }
}
