/**
 * Write e2e/fixtures/data/: an index and one pack built from the frozen
 * element sets in src/core/fixtures/elements.json. The end-to-end tests
 * serve these in place of live data, so they behave the same on any day.
 *
 *     node scripts/make-e2e-data.ts
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodeRow, PACK_FIELDS, PACK_FORMAT, type DataIndex, type PackFile } from '../src/data/pack.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'e2e', 'fixtures', 'data')

interface Omm {
  OBJECT_NAME: string
  OBJECT_ID: string
  EPOCH: string
  MEAN_MOTION: number
  ECCENTRICITY: number
  INCLINATION: number
  RA_OF_ASC_NODE: number
  ARG_OF_PERICENTER: number
  MEAN_ANOMALY: number
  NORAD_CAT_ID: number
  ELEMENT_SET_NO: number
  REV_AT_EPOCH: number
  BSTAR: number
  MEAN_MOTION_DOT: number
  MEAN_MOTION_DDOT: number
}

// Facts for the fixture objects, as the real build would find them.
const META: Record<number, { groups: string[]; stdMag: number | null; type: 'payload' | 'rocket-body' }> = {
  25544: { groups: ['stations', 'visual'], stdMag: -2.5, type: 'payload' },
  48274: { groups: ['stations'], stdMag: -1.5, type: 'payload' },
  20580: { groups: ['visual'], stdMag: 1.5, type: 'payload' },
  44714: { groups: ['starlink'], stdMag: 5.5, type: 'payload' },
  2802: { groups: ['visual'], stdMag: 3.5, type: 'rocket-body' },
  48859: { groups: ['gnss'], stdMag: null, type: 'payload' },
  41866: { groups: ['geo'], stdMag: null, type: 'payload' },
  7276: { groups: [], stdMag: null, type: 'payload' },
}

const { elements } = JSON.parse(await readFile(join(ROOT, 'src/core/fixtures/elements.json'), 'utf8')) as { elements: Omm[] }
const generated = '2026-10-12T00:00:00.000Z'
const pack: PackFile = {
  format: PACK_FORMAT,
  id: 'bright',
  generated,
  fields: PACK_FIELDS,
  rows: elements.map((o) => {
    const m = META[o.NORAD_CAT_ID]!
    return encodeRow({
      norad: o.NORAD_CAT_ID,
      name: o.OBJECT_NAME,
      intlDes: o.OBJECT_ID,
      epoch: o.EPOCH,
      meanMotion: o.MEAN_MOTION,
      eccentricity: o.ECCENTRICITY,
      inclination: o.INCLINATION,
      raan: o.RA_OF_ASC_NODE,
      argPericenter: o.ARG_OF_PERICENTER,
      meanAnomaly: o.MEAN_ANOMALY,
      bstar: o.BSTAR,
      meanMotionDot: o.MEAN_MOTION_DOT,
      meanMotionDdot: o.MEAN_MOTION_DDOT,
      elementSetNo: o.ELEMENT_SET_NO,
      revAtEpoch: o.REV_AT_EPOCH,
      type: m.type,
      owner: o.NORAD_CAT_ID === 25544 ? 'ISS' : '',
      launch: '',
      stdMag: m.stdMag,
      magSource: m.stdMag === null ? 'none' : 'mccants',
      groups: m.groups,
    })
  }),
}
const json = JSON.stringify(pack)
const index: DataIndex = {
  format: PACK_FORMAT,
  generated,
  sources: ['Test fixture: frozen CelesTrak element sets from 2026-10-12.'],
  packs: [{ id: 'bright', title: 'Bright & notable', description: 'Fixture pack.', default: true, count: pack.rows.length, file: 'bright-fixture.json', bytes: json.length }],
}
await mkdir(OUT, { recursive: true })
await writeFile(join(OUT, 'bright-fixture.json'), json)
await writeFile(join(OUT, 'index.json'), JSON.stringify(index, null, 1))
console.log(`Wrote ${OUT}`)
