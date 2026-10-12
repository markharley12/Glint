import { APP_NAME } from '../app-info.ts'
import { passesToIcs } from '../core/ics.ts'
import { displayName } from '../core/names.ts'
import type { Pass } from '../core/passes.ts'
import type { SatelliteInfo } from '../core/satellite.ts'
import { passDescription, watchWindow } from './passText.ts'

/** Offer `text` to the user as a downloaded file. */
export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function downloadPasses(passes: Pass[], sats: Map<number, SatelliteInfo>, filename = 'satellite-passes.ics'): void {
  const events = passes.flatMap((p) => {
    const sat = sats.get(p.norad)
    if (!sat) return []
    const w = watchWindow(p)
    return [{ norad: p.norad, name: displayName(sat), startMs: w.start.ms, endMs: w.end.ms, details: passDescription(p) }]
  })
  downloadText(filename, passesToIcs(events, Date.now(), APP_NAME), 'text/calendar')
}
