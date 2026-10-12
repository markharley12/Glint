import { APP_NAME } from '../app-info.ts'
import { passesToIcs } from '../core/ics.ts'
import type { Pass } from '../core/passes.ts'
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

/** A pass and what to call it in the calendar. */
export interface NamedPass {
  pass: Pass
  name: string
}

export function downloadPasses(passes: NamedPass[], filename = 'satellite-passes.ics'): void {
  const events = passes.map(({ pass, name }) => {
    const w = watchWindow(pass)
    return { norad: pass.norad, name, startMs: w.start.ms, endMs: w.end.ms, details: passDescription(pass) }
  })
  downloadText(filename, passesToIcs(events, Date.now(), APP_NAME), 'text/calendar')
}
