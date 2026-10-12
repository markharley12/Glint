/** Transient view state shared between the sky canvas and the panels. */
import { signal } from '@preact/signals'
import type { TrackPoint } from '../worker/protocol.ts'
import type { RenderStats } from '../sky/renderer.ts'

/** Where the planetarium view looks, degrees. */
export const lookDirection = signal({ az: 180, el: 25 })

/** The planetarium view keeps the selected satellite centred. */
export const following = signal(false)

/** The selected satellite's path across the sky around now. */
export interface TrackState {
  norad: number
  startMs: number
  endMs: number
  points: TrackPoint[]
}
export const track = signal<TrackState | null>(null)

/** Updated a few times a second from the render loop, for the status line. */
export const renderStats = signal<RenderStats & { sunEl: number }>({ up: 0, visible: 0, drawn: 0, selectedOnScreen: null, sunEl: 0 })

/** A short note shown near a tapped star or planet. */
export const tooltip = signal<{ text: string; x: number; y: number } | null>(null)

/** Which side panel is open. */
export type Panel = 'none' | 'passes' | 'settings' | 'search' | 'about'
export const panel = signal<Panel>('none')

/** A brief confirmation message ("Calibrated on Vega…"). */
export const toast = signal<string | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined
export function showToast(text: string, ms = 4000): void {
  toast.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), ms)
}
