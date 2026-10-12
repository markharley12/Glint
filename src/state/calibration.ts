import { signal } from '@preact/signals'

/** The calibration overlay is open. */
export const calibrating = signal(false)

/** The object chosen to calibrate on; the renderer rings its predicted
 *  position so the user can see how far off the sensors are. */
export const calibrationTarget = signal<string | null>(null)
