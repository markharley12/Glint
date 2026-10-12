import { describe, expect, it } from 'vitest'
import { icsEscape, icsTime, passesToIcs } from './ics.ts'

describe('ics', () => {
  it('formats UTC times in basic format', () => {
    expect(icsTime(Date.UTC(2026, 9, 12, 19, 30, 5, 600))).toBe('20261012T193005Z')
  })

  it('escapes text values', () => {
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
  })

  const ics = passesToIcs(
    [
      {
        norad: 25544,
        name: 'ISS',
        startMs: Date.UTC(2026, 9, 12, 19, 30),
        endMs: Date.UTC(2026, 9, 12, 19, 36),
        details: ['Appears 10° WNW, highest 67° SSW, vanishes 10° ESE', 'Magnitude −3.4 (brilliant); a long line to make sure folding happens somewhere'],
      },
    ],
    Date.UTC(2026, 9, 12),
    'Glint',
  )

  it('is a well-formed calendar with one event and an alarm', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(ics).toContain('DTSTART:20261012T193000Z')
    expect(ics).toContain('UID:25544-20261012T193000Z@sat-ar')
    expect(ics).toContain('TRIGGER:-PT5M')
  })

  it('folds every line to 75 octets', () => {
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    // Unfolding restores the description.
    const unfolded = ics.replace(/\r\n /g, '')
    expect(unfolded).toContain('Magnitude −3.4 (brilliant)\\; a long line to make sure folding happens somewhere')
  })
})
