import { describe, expect, it } from 'vitest'
import { fitLine, parseCsv, parseQuicksatMag, parseSatcat } from './parse.ts'

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, embedded commas and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ])
  })

  it('keeps a final line without a newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('parseSatcat', () => {
  const csv = [
    'OBJECT_NAME,OBJECT_ID,NORAD_CAT_ID,OBJECT_TYPE,OPS_STATUS_CODE,OWNER,LAUNCH_DATE,LAUNCH_SITE,DECAY_DATE,PERIOD,INCLINATION,APOGEE,PERIGEE,RCS,DATA_STATUS_CODE,ORBIT_CENTER,ORBIT_TYPE',
    'ISS (ZARYA),1998-067A,25544,PAY,+,ISS,1998-11-20,TYMSC,,92.97,51.63,425,416,399.0524,,EA,ORB',
    'SL-1 R/B,1957-001A,1,R/B,D,CIS,1957-10-04,TYMSC,1957-12-01,96.19,65.10,938,214,20.4200,,EA,IMP',
    'STARLINK-1008,2019-074B,44714,PAY,P,US,2019-11-11,AFETR,,91.92,53.15,371,367,,,EA,ORB',
  ].join('\n')

  it('reads type, owner, launch, RCS and decay', () => {
    const m = parseSatcat(csv)
    expect(m.get(25544)).toEqual({ norad: 25544, name: 'ISS (ZARYA)', type: 'payload', owner: 'ISS', launch: '1998-11-20', rcs: 399.0524, decayed: false })
    expect(m.get(1)?.type).toBe('rocket-body')
    expect(m.get(1)?.decayed).toBe(true)
    expect(m.get(44714)?.rcs).toBeNull()
  })
})

describe('parseQuicksatMag', () => {
  // Real lines from quicksat.mag (Sep 2026), including the header.
  const text = [
    '00001 d Desig...  Name.......... Mag.  Sz1 Sz2 Sz3 RCS Comments 69900',
    '00005   58 2B     Vanguard 1      9.5  0.2 0.0 0.0 .11',
    '00127   61 15M    Trans 4A RkDbM                   .36',
    '20580   90 37B    HST             1.5 13.3 4.3 0.0  29 occ flare to -4',
    '25544   98 67A    ISS            -2.5              399',
    '44714   19 74B    Starlink 1008',
  ].join('\n')

  it('reads magnitude and RCS from their columns', () => {
    const m = parseQuicksatMag(text)
    expect(m.get(5)).toEqual({ norad: 5, mag: 9.5, rcs: 0.11 })
    expect(m.get(20580)).toEqual({ norad: 20580, mag: 1.5, rcs: 29 })
    expect(m.get(25544)).toEqual({ norad: 25544, mag: -2.5, rcs: 399 })
  })

  it('lists objects without a magnitude as null', () => {
    const m = parseQuicksatMag(text)
    expect(m.get(127)).toEqual({ norad: 127, mag: null, rcs: 0.36 })
    expect(m.get(44714)).toEqual({ norad: 44714, mag: null, rcs: null })
  })

  it('skips the header', () => {
    expect(parseQuicksatMag(text).has(1)).toBe(false)
  })
})

describe('fitLine', () => {
  it('recovers an exact line', () => {
    const f = fitLine([0, 1, 2, 3], [1, 3, 5, 7])
    expect(f.a).toBeCloseTo(1, 12)
    expect(f.b).toBeCloseTo(2, 12)
    expect(f.rms).toBeCloseTo(0, 12)
  })
})
