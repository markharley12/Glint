/**
 * Satellite trains: satellites from one launch still bunched together
 * along their orbit, which look like a line of lights crossing the sky.
 * Days to weeks after a Starlink launch this is the most common "what on
 * earth was that?" sight.
 *
 * Detection works on what is in the sky right now: same launch (the
 * international designator's "YYYY-NNN" prefix), close together, and moving
 * the same way. Single-linkage clustering, so a train strung out over 40°
 * still counts as one as long as each satellite has a neighbour nearby.
 */
import type { Pass } from './passes.ts'
import type { SatelliteInfo } from './satellite.ts'
import type { Vec3 } from './vec.ts'

/** Launches older than this have spread out along their orbits: the sky
 *  views stop looking for trains from them. */
export const TRAIN_MAX_AGE_MS = 120 * 86_400_000
/** The passes list is stricter: a train is a striking sight for a few
 *  weeks after launch, while the satellites are low and still bunched. */
export const TRAIN_PASSES_MAX_AGE_MS = 30 * 86_400_000

/** "2026-123A" → "2026-123": the launch an object came from. */
export function launchKey(intlDes: string): string | null {
  const m = /^(\d{4}-\d{3})/.exec(intlDes)
  return m ? m[1]! : null
}

/**
 * The satellite's launch if it was launched within `maxAgeMs` of `nowMs`,
 * else null. Objects without a launch date count as recent if CelesTrak
 * lists them among the last 30 days' launches.
 */
export function recentLaunch(sat: SatelliteInfo, nowMs: number, maxAgeMs: number): string | null {
  const key = launchKey(sat.intlDes)
  if (!key) return null
  const launched = sat.launch ? Date.parse(sat.launch) : Number.NaN
  const recent = Number.isFinite(launched) ? nowMs - launched < maxAgeMs : sat.groups.includes('last-30-days')
  return recent ? key : null
}

/** Recent launches that put up at least `minSize` tracked objects, as
 *  launch → NORAD numbers. */
export function launchGroups(sats: SatelliteInfo[], nowMs: number, maxAgeMs: number, minSize = DEFAULT_TRAIN_OPTIONS.minSize): Map<string, number[]> {
  const groups = new Map<string, number[]>()
  for (const s of sats) {
    const key = recentLaunch(s, nowMs, maxAgeMs)
    if (!key) continue
    let g = groups.get(key)
    if (!g) groups.set(key, (g = []))
    g.push(s.norad)
  }
  for (const [key, g] of groups) if (g.length < minSize) groups.delete(key)
  return groups
}

export interface TrainCandidate {
  /** Index of the satellite in the caller's arrays. */
  index: number
  launch: string
  /** Unit direction in the sky (ENU). */
  dir: Vec3
  /** Direction of motion across the sky: the velocity's component
   *  perpendicular to `dir`, any length. */
  motion: Vec3
}

export interface Train {
  launch: string
  /** Member indices, ordered front to back along the direction of travel. */
  members: number[]
}

export interface TrainOptions {
  /** Neighbours must be within this angle, degrees. */
  linkDeg: number
  /** Directions of motion must agree to within this angle, degrees. */
  headingDeg: number
  /** Fewest satellites that make a train. */
  minSize: number
}

export const DEFAULT_TRAIN_OPTIONS: TrainOptions = { linkDeg: 7, headingDeg: 25, minSize: 4 }

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export function findTrains(candidates: TrainCandidate[], options: Partial<TrainOptions> = {}): Train[] {
  const opts = { ...DEFAULT_TRAIN_OPTIONS, ...options }
  const cosLink = Math.cos((opts.linkDeg * Math.PI) / 180)
  const cosHeading = Math.cos((opts.headingDeg * Math.PI) / 180)
  const byLaunch = new Map<string, TrainCandidate[]>()
  for (const c of candidates) {
    let list = byLaunch.get(c.launch)
    if (!list) byLaunch.set(c.launch, (list = []))
    list.push(c)
  }

  const trains: Train[] = []
  for (const [launch, list] of byLaunch) {
    if (list.length < opts.minSize) continue
    const unit = list.map((c) => {
      const n = Math.hypot(c.motion[0], c.motion[1], c.motion[2]) || 1
      return [c.motion[0] / n, c.motion[1] / n, c.motion[2] / n] as Vec3
    })
    // Union-find over pairs that are close and heading the same way.
    const parent = list.map((_, i) => i)
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)))
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (dot(list[i]!.dir, list[j]!.dir) < cosLink) continue
        if (dot(unit[i]!, unit[j]!) < cosHeading) continue
        parent[find(i)] = find(j)
      }
    }
    const groups = new Map<number, number[]>()
    list.forEach((_, i) => {
      const r = find(i)
      let g = groups.get(r)
      if (!g) groups.set(r, (g = []))
      g.push(i)
    })
    for (const g of groups.values()) {
      if (g.length < opts.minSize) continue
      // Order along the mean direction of motion: the leader first.
      const m: Vec3 = [0, 0, 0]
      for (const i of g) for (let k = 0; k < 3; k++) m[k]! += unit[i]![k]!
      const sorted = [...g].sort((a, b) => dot(list[b]!.dir, m) - dot(list[a]!.dir, m))
      trains.push({ launch, members: sorted.map((i) => list[i]!.index) })
    }
  }
  return trains
}

/** Words for a train: "Starlink train" when its members are Starlinks,
 *  otherwise the launch. */
export function trainName(names: string[], launch: string): string {
  const prefix = names[0]?.split(/[-\s]/)[0] ?? ''
  if (prefix && names.every((n) => n.startsWith(prefix))) {
    return `${prefix.charAt(0)}${prefix.slice(1).toLowerCase()} train`
  }
  return `Launch ${launch}`
}

/** The part of a pass people watch: the visible stretch, else all of it. */
function watched(p: Pass) {
  return p.visible ?? { start: p.rise, end: p.set, max: p.max, brightest: null }
}

export interface TrainPass {
  launch: string
  /** Members' passes in the order they appear. */
  members: Pass[]
  /** One pass standing for the whole train: the middle member's pass,
   *  stretched to run from the first member appearing to the last one
   *  vanishing, with the brightest member's brightness. */
  pass: Pass
}

/**
 * Group passes of satellites from one launch that follow each other across
 * the sky into train passes. Members of a train cross the same path a few
 * seconds to a few minutes apart, so a chain of same-launch passes each
 * appearing within `gapMs` of the one before is one train.
 */
export function groupTrainPasses(
  passes: Pass[],
  launchOf: (norad: number) => string | null,
  options: { gapMs?: number; minSize?: number } = {},
): TrainPass[] {
  const gapMs = options.gapMs ?? 3 * 60_000
  const minSize = options.minSize ?? 3
  const byLaunch = new Map<string, Pass[]>()
  for (const p of passes) {
    const launch = launchOf(p.norad)
    if (!launch) continue
    let list = byLaunch.get(launch)
    if (!list) byLaunch.set(launch, (list = []))
    list.push(p)
  }
  const out: TrainPass[] = []
  const flush = (launch: string, members: Pass[]) => {
    if (members.length < minSize) return
    const first = watched(members[0]!)
    let end = watched(members[0]!).end
    let brightest: Pass['max'] | null = null
    for (const m of members) {
      const w = watched(m)
      if (w.end.ms > end.ms) end = w.end
      const b = w.brightest
      if (b?.mag != null && (brightest?.mag == null || b.mag < brightest.mag)) brightest = b
    }
    const middle = members[Math.floor(members.length / 2)]!
    const mw = watched(middle)
    const visible = middle.visible ? { start: first.start, end, max: mw.max, brightest } : null
    out.push({ launch, members, pass: { ...middle, visible } })
  }
  for (const [launch, list] of byLaunch) {
    list.sort((a, b) => watched(a).start.ms - watched(b).start.ms)
    let run: Pass[] = []
    for (const p of list) {
      const prev = run[run.length - 1]
      if (prev && watched(p).start.ms - watched(prev).start.ms > gapMs) {
        flush(launch, run)
        run = []
      }
      run.push(p)
    }
    flush(launch, run)
  }
  return out.sort((a, b) => watched(a.pass).start.ms - watched(b.pass).start.ms)
}
