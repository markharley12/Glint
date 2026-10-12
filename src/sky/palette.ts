/**
 * Colours for the sky canvas. Night mode swaps in an all-red palette:
 * red light barely affects dark adaptation, so the screen can be glanced at
 * without losing the faint stars for the next twenty minutes.
 */
import { clamp } from '../core/vec.ts'

export interface Palette {
  /** Page background behind the polar map. */
  page: string
  ground: string
  groundAr: string
  horizon: string
  grid: string
  gridLabel: string
  cardinal: string
  constellation: string
  constellationLabel: string
  starTint: boolean
  sunlit: string
  sunlitFaint: string
  eclipsed: string
  station: string
  selected: string
  track: string
  label: string
  labelHalo: string
  moonDark: string
  moonLit: string
  sun: string
  planet: string
  arrow: string
  /** Sky colour stops by solar elevation, degrees → [r, g, b]. */
  sky: [number, [number, number, number]][]
}

export const NORMAL: Palette = {
  page: '#05070c',
  ground: 'rgba(14, 18, 14, 0.94)',
  groundAr: 'rgba(0, 0, 0, 0.25)',
  horizon: 'rgba(160, 190, 150, 0.7)',
  grid: 'rgba(120, 150, 200, 0.18)',
  gridLabel: 'rgba(150, 175, 220, 0.55)',
  cardinal: '#d8e2f0',
  constellation: 'rgba(110, 140, 200, 0.32)',
  constellationLabel: 'rgba(130, 160, 215, 0.5)',
  starTint: true,
  sunlit: '#fff6dc',
  sunlitFaint: '#b8c7dc',
  eclipsed: 'rgba(110, 120, 140, 0.55)',
  station: '#ffcf4a',
  selected: '#4fd8ff',
  track: 'rgba(79, 216, 255, 0.75)',
  label: '#e9eef6',
  labelHalo: 'rgba(0, 0, 0, 0.85)',
  moonDark: 'rgba(60, 64, 72, 0.9)',
  moonLit: '#f2efe4',
  sun: '#ffe680',
  planet: '#ffe9c4',
  arrow: '#4fd8ff',
  sky: [
    [-18, [4, 6, 12]],
    [-12, [8, 13, 28]],
    [-6, [16, 32, 66]],
    [-2, [36, 62, 108]],
    [4, [62, 110, 170]],
    [20, [80, 135, 200]],
  ],
}

export const NIGHT: Palette = {
  page: '#000000',
  ground: 'rgba(12, 0, 0, 0.95)',
  groundAr: 'rgba(0, 0, 0, 0.35)',
  horizon: 'rgba(170, 30, 20, 0.7)',
  grid: 'rgba(150, 20, 10, 0.22)',
  gridLabel: 'rgba(170, 40, 30, 0.6)',
  cardinal: '#d83a2a',
  constellation: 'rgba(140, 20, 10, 0.4)',
  constellationLabel: 'rgba(150, 30, 20, 0.6)',
  starTint: false,
  sunlit: '#ff4a32',
  sunlitFaint: '#c0301f',
  eclipsed: 'rgba(110, 20, 10, 0.6)',
  station: '#ff6a3a',
  selected: '#ff8a5a',
  track: 'rgba(255, 110, 70, 0.7)',
  label: '#e03a28',
  labelHalo: 'rgba(0, 0, 0, 0.9)',
  moonDark: 'rgba(40, 6, 4, 0.9)',
  moonLit: '#d84a36',
  sun: '#ff5a3a',
  planet: '#e4503a',
  arrow: '#ff6a4a',
  sky: [
    [-18, [0, 0, 0]],
    [-6, [10, 0, 0]],
    [4, [28, 2, 0]],
  ],
}

/** Sky colour for a solar elevation, interpolated between the stops. */
export function skyColour(p: Palette, sunEl: number): string {
  const s = p.sky
  let rgb = s[0]![1]
  if (sunEl >= s[s.length - 1]![0]) rgb = s[s.length - 1]![1]
  else {
    for (let i = 1; i < s.length; i++) {
      const [e1, c1] = s[i]!
      const [e0, c0] = s[i - 1]!
      if (sunEl < e1) {
        const t = clamp((sunEl - e0) / (e1 - e0), 0, 1)
        rgb = [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t]
        break
      }
    }
  }
  return `rgb(${rgb.map((x) => Math.round(x)).join(',')})`
}

/** Spectral-class colours by B−V (after Mitchell Charity's star colour
 *  table), interpolated. */
const STAR_COLOURS: [number, [number, number, number]][] = [
  [-0.33, [155, 176, 255]],
  [-0.17, [170, 191, 255]],
  [0.0, [202, 215, 255]],
  [0.15, [228, 232, 255]],
  [0.44, [248, 247, 255]],
  [0.68, [255, 244, 234]],
  [1.15, [255, 216, 170]],
  [1.6, [255, 200, 120]],
]

const starColourCache = new Map<number, string>()

export function starColour(bv: number): string {
  const key = Math.round(clamp(bv, -0.4, 2) * 20)
  const hit = starColourCache.get(key)
  if (hit) return hit
  const b = key / 20
  let rgb = STAR_COLOURS[STAR_COLOURS.length - 1]![1]
  if (b <= STAR_COLOURS[0]![0]) rgb = STAR_COLOURS[0]![1]
  else {
    for (let i = 1; i < STAR_COLOURS.length; i++) {
      const [b1, c1] = STAR_COLOURS[i]!
      const [b0, c0] = STAR_COLOURS[i - 1]!
      if (b <= b1) {
        const t = (b - b0) / (b1 - b0)
        rgb = [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t]
        break
      }
    }
  }
  const s = `rgb(${rgb.map((x) => Math.round(x)).join(',')})`
  starColourCache.set(key, s)
  return s
}
