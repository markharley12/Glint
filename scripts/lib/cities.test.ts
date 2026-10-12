import { describe, expect, it } from 'vitest'
import { parseAdmin1, parseCities, shardPlaces } from './cities.ts'

const row = (id: number, name: string, ascii: string, lat: number, lon: number, cc: string, a1: string, pop: number) =>
  [id, name, ascii, '', lat, lon, 'P', 'PPL', cc, '', a1, '', '', '', pop, '', 10, 'Europe/London', '2024-01-01'].join('\t')

describe('parseCities', () => {
  const admin1 = parseAdmin1('GB.ENG\tEngland\tEngland\t6269131\nBR.27\tSão Paulo\tSao Paulo\t3448433\n')
  const text = [
    row(1, 'Greenwich', 'Greenwich', 51.47785, -0.01176, 'GB', 'ENG', 280000),
    row(2, 'São Paulo', 'Sao Paulo', -23.5475, -46.63611, 'BR', '27', 10021295),
    row(3, 'Tiny', 'Tiny', 1, 2, 'GB', 'ENG', 900),
    'garbage',
  ].join('\n')
  const data = parseCities(text, admin1, 15000, 'GeoNames')

  it('keeps towns above the size limit, biggest first, compactly', () => {
    expect(data.countries).toEqual(['BR', 'GB'])
    expect(data.regions).toEqual(['São Paulo', 'England'])
    expect(data.rows).toEqual([
      ['São Paulo', 'Sao Paulo', 0, 0, -2355, -4664, 10021],
      ['Greenwich', 0, 1, 1, 5148, -1, 280],
    ])
  })
})

describe('shardPlaces', () => {
  it('splits by first letter, with places under both spellings', () => {
    const shards = shardPlaces({
      source: 's',
      countries: ['PL', 'GB'],
      regions: ['Łódź Voivodeship', 'England'],
      rows: [
        ['Łódź', 'Lodz', 0, 0, 5177, 1947, 672],
        ['London', 0, 1, 1, 5151, -13, 8961],
        ['Bath', 0, 1, 1, 5138, -236, 94],
      ],
    })
    expect([...shards.keys()].sort()).toEqual(['_', 'b', 'l'])
    expect(shards.get('l')).toEqual({
      source: 's',
      countries: ['PL', 'GB'],
      regions: ['Łódź Voivodeship', 'England'],
      rows: [
        ['Łódź', 'Lodz', 0, 0, 5177, 1947, 672],
        ['London', 0, 1, 1, 5151, -13, 8961],
      ],
    })
    expect(shards.get('b')).toEqual({ source: 's', countries: ['GB'], regions: ['England'], rows: [['Bath', 0, 0, 0, 5138, -236, 94]] })
  })
})
