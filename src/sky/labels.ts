/**
 * Greedy label placement: highest priority first, each label tried right,
 * left, above and below its point, and dropped if every spot overlaps a
 * label already placed. Good enough for a few dozen labels per frame, and
 * stable from frame to frame because priority order is stable.
 */

export interface LabelRequest {
  text: string
  x: number
  y: number
  /** Gap between the point and the text, px (the dot's radius plus a bit). */
  gap: number
  /** Higher goes first. */
  priority: number
  colour: string
}

export interface PlacedLabel {
  text: string
  /** Text anchor: left edge, vertical middle. */
  x: number
  y: number
  colour: string
}

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

export function placeLabels(
  requests: LabelRequest[],
  measure: (text: string) => number,
  bounds: { width: number; height: number },
  lineHeight = 13,
  max = Infinity,
): PlacedLabel[] {
  const placed: PlacedLabel[] = []
  const boxes: Box[] = []
  const sorted = [...requests].sort((a, b) => b.priority - a.priority)
  for (const r of sorted) {
    if (placed.length >= max) break
    const w = measure(r.text)
    const h = lineHeight
    const candidates: [number, number][] = [
      [r.x + r.gap + 2, r.y],
      [r.x - r.gap - 2 - w, r.y],
      [r.x - w / 2, r.y - r.gap - h / 2 - 1],
      [r.x - w / 2, r.y + r.gap + h / 2 + 1],
    ]
    for (const [x, y] of candidates) {
      const box = { x0: x - 1, y0: y - h / 2, x1: x + w + 1, y1: y + h / 2 }
      if (box.x0 < 0 || box.x1 > bounds.width || box.y0 < 0 || box.y1 > bounds.height) continue
      if (boxes.some((b) => overlaps(b, box))) continue
      boxes.push(box)
      placed.push({ text: r.text, x, y, colour: r.colour })
      break
    }
  }
  return placed
}
