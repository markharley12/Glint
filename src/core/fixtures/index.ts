/** Test helpers: the frozen element sets as Satellites, and Skyfield's
 *  reference values for them (see tools/reference/make_fixtures.py). */
import type { OMMJsonObject } from 'satellite.js'
import { makeSatellite, type Satellite } from '../satellite.ts'
import type { Observer } from '../frames.ts'
import elementsFile from './elements.json'
import skyfield from './skyfield.json'

export const elements = elementsFile.elements as unknown as OMMJsonObject[]

/** Standard magnitudes for the fixture objects that have one in McCants'
 *  list (copied by hand, Oct 2026), so brightness code has something to
 *  chew on. */
const STD_MAG: Record<number, number> = { 25544: -2.5, 20580: 1.5 }

export function fixtureSatellites(): Map<number, Satellite> {
  const m = new Map<number, Satellite>()
  for (const omm of elements) {
    const norad = Number(omm.NORAD_CAT_ID)
    const stdMag = STD_MAG[norad] ?? null
    m.set(
      norad,
      makeSatellite(
        {
          norad,
          name: omm.OBJECT_NAME,
          intlDes: omm.OBJECT_ID,
          type: 'payload',
          owner: '',
          launch: '',
          stdMag,
          magSource: stdMag === null ? 'none' : 'mccants',
          groups: [],
        },
        omm,
      ),
    )
  }
  return m
}

export interface ReferenceLook {
  observer: string
  norad: number
  ms: number
  iso: string
  az: number
  el: number
  range: number
  sunlit: boolean
  sunEl: number
}

export interface ReferencePass {
  observer: string
  norad: number
  rise: number
  max: number
  maxEl: number
  maxAz: number
  set: number
}

export const reference = {
  observers: skyfield.observers as Record<string, Observer>,
  looks: skyfield.looks as ReferenceLook[],
  passes: skyfield.passes as ReferencePass[],
}
