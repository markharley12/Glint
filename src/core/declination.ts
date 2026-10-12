/**
 * Magnetic declination from the World Magnetic Model: how far east of true
 * north a compass points. Phone compasses report magnetic headings, so the
 * AR view adds this before anything else. It is 13° in Sydney and −13° in
 * New York; leaving it out alone would put every label a hand-width off.
 */
import * as geomagnetismModule from 'geomagnetism'

// geomagnetism is CommonJS: bundlers expose `model` as a named export, but
// Node's ESM loader (scripts, Playwright) only offers it on `default`.
const { model } = (geomagnetismModule as { default?: typeof geomagnetismModule }).default ?? geomagnetismModule

/** Declination in degrees, east positive. Outside the model's validity
 *  (WMM2025: 2025–2030) the nearest model is used rather than failing. */
export function declination(latitude: number, longitude: number, heightKm: number, date: Date): number {
  return model(date, { allowOutOfBoundsModel: true }).point([latitude, longitude, heightKm]).decl
}
