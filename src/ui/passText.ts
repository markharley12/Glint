/** Words for a pass, shared by the info card, the passes list and the
 *  calendar export. */
import type { Pass } from '../core/passes.ts'
import { brightnessWords, compass, duration, magnitude } from './format.ts'

/** The stretch people will actually watch: the visible window if there is
 *  one, else the whole pass. */
export function watchWindow(p: Pass) {
  return p.visible ? { start: p.visible.start, max: p.visible.max, end: p.visible.end } : { start: p.rise, max: p.max, end: p.set }
}

export function passDirections(p: Pass): string {
  const w = watchWindow(p)
  return `${compass(w.start.az)} → ${compass(w.end.az)}`
}

export function passDescription(p: Pass): string[] {
  const w = watchWindow(p)
  const lines = [
    `Appears ${Math.round(w.start.el)}° ${compass(w.start.az)}, highest ${Math.round(w.max.el)}° ${compass(w.max.az)}, ` +
      `${p.visible && p.visible.end.sunlit < 0.5 ? 'fades into Earth’s shadow' : 'vanishes'} ${Math.round(w.end.el)}° ${compass(w.end.az)}`,
    `Visible for ${duration(w.end.ms - w.start.ms)}`,
  ]
  const mag = p.visible?.brightest?.mag ?? null
  if (mag !== null) lines.push(`Magnitude ${magnitude(mag)} (${brightnessWords(mag)})`)
  return lines
}
