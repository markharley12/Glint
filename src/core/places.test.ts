import { describe, expect, it } from 'vitest'
import { normalize, placeLabel, searchPlaces, type PlaceData } from './places.ts'

const data: PlaceData = {
  source: 'test',
  countries: ['US', 'FR', 'BR', 'GB'],
  regions: ['Texas', 'Île-de-France', 'São Paulo', 'England', 'Illinois'],
  rows: [
    ['São Paulo', 'Sao Paulo', 2, 2, -2355, -4664, 10021],
    ['Paris', 0, 1, 1, 4885, 235, 2138],
    ['London', 0, 3, 3, 5151, -13, 8961],
    ['Springfield', 0, 0, 4, 3980, -8964, 114],
    ['Paris', 0, 0, 0, 3366, -9555, 25],
    ['East London', 0, 3, 3, 5150, 5, 20],
  ],
}
const names: Record<string, string> = { US: 'United States', FR: 'France', BR: 'Brazil', GB: 'United Kingdom' }
const country = (c: string) => names[c] ?? c
const find = (q: string) => searchPlaces(data, q, country).map((p) => placeLabel(p, country))

describe('normalize', () => {
  it('drops accents, case and punctuation', () => {
    expect(normalize('São Paulo')).toBe('sao paulo')
    expect(normalize("  St. John's ")).toBe('st john s')
  })
})

describe('searchPlaces', () => {
  it('matches the start of a name or a word in it, biggest first', () => {
    expect(find('lon')).toEqual(['London, England, United Kingdom', 'East London, England, United Kingdom'])
    expect(find('sao')).toEqual(['São Paulo, Brazil'])
    expect(find('são p')).toEqual(['São Paulo, Brazil'])
  })

  it('narrows by country or region after a comma or space', () => {
    expect(find('paris')).toEqual(['Paris, Île-de-France, France', 'Paris, Texas, United States'])
    expect(find('paris, us')).toEqual(['Paris, Texas, United States'])
    expect(find('paris texas')).toEqual(['Paris, Texas, United States'])
    expect(find('springfield, ill')).toEqual(['Springfield, Illinois, United States'])
  })

  it('needs two letters and returns coordinates', () => {
    expect(find('p')).toEqual([])
    const [p] = searchPlaces(data, 'london', country)
    expect(p).toMatchObject({ latitude: 51.51, longitude: -0.13, country: 'GB' })
  })
})
