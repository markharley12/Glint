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
import type { Vec3 } from './vec.ts'

/** "2026-123A" → "2026-123": the launch an object came from. */
export function launchKey(intlDes: string): string | null {
  const m = /^(\d{4}-\d{3})/.exec(intlDes)
  return m ? m[1]! : null
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
