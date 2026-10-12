/**
 * iCalendar (RFC 5545) export of passes: "add to calendar" is the one pass
 * alert that works on every phone without a push server.
 */

export interface CalendarPass {
  norad: number
  name: string
  startMs: number
  endMs: number
  /** Short description lines, e.g. directions and brightness. */
  details: string[]
}

/** UTC timestamp in iCalendar's basic format: 20261012T193000Z. */
export function icsTime(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Escape TEXT values: backslash, semicolon, comma and newline. */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Fold lines longer than 75 octets, as the RFC requires. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let cur = ''
  let curBytes = 0
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length
    if (curBytes + b > (out.length ? 74 : 75)) {
      out.push(cur)
      cur = ''
      curBytes = 0
    }
    cur += ch
    curBytes += b
  }
  out.push(cur)
  return out.join('\r\n ')
}

export function passesToIcs(passes: CalendarPass[], createdMs: number, appName: string): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${appName}//Satellite passes//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  for (const p of passes) {
    lines.push(
      'BEGIN:VEVENT',
      // Stable per pass, so re-exporting updates rather than duplicates.
      `UID:${p.norad}-${icsTime(p.startMs)}@sat-ar`,
      `DTSTAMP:${icsTime(createdMs)}`,
      `DTSTART:${icsTime(p.startMs)}`,
      `DTEND:${icsTime(p.endMs)}`,
      `SUMMARY:${icsEscape(`${p.name} pass`)}`,
      `DESCRIPTION:${icsEscape(p.details.join('\n'))}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-PT5M',
      `DESCRIPTION:${icsEscape(`${p.name} in 5 minutes`)}`,
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
