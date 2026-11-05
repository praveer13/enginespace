/*
 * Back of House's route through its house (GAMES.md §5 "3D scene", §2.6 "Back of House"): what each laid stage adds to the house (a spike
 * for a queue, the "Heard!" gate for a sync, a shelf under a window for shared memory), the chit each hand-off carries with its
 * stage numbers, and the ticket's way. After each stage the ticket stands somewhere (on its hands' rail, on a spike, on the line's rail),
 * and each stage is a hop from the last stand to the next through the hand-off that crosses it: onto a window's sill and through it into
 * the chute behind the partition, along it and out through the other floor's window, into the dumbwaiter's car at one landing and out at
 * another, onto the line's rail while its station burns. A run plays the hops it added, one stage to the bell (Scene3D.tsx).
 *
 * The house is the page's (scene-layout.ts); this moves with every stage laid and is the scene's, in the 3D chunk, so it takes no value
 * from the page's modules, only their types. No three here: it is tested under Bun. Every length is [estimated], on the house's measures.
 */
import { entryOf } from '@es/sim/lifecycle'
import type { Place } from '@es/sim/lifecycle'
import type { FloorView, LaidView } from '@es/play/engine-floor/types'
import { placeKey } from '@es/play/engine-floor/words'
import type { Vec3 } from '@/scene/props/specs'
import type { House, HouseItem, Pose, Spot } from './scene-layout'
import type { SceneModel } from './scene-presets'
import type { CameraStop } from './scene-stops'

/** A laid hand-off's chit: where it points, the side it sits on, and its stages in order with what the last run found of each. */
export interface Chit {
  readonly id: string
  readonly at: Vec3
  readonly place: 'above' | 'left' | 'right'
  readonly stages: { readonly n: number; readonly state: LaidView['state'] }[]
}

/** One stage's way: the poses from the last stand to the next, and what rides with it. */
export interface Hop {
  readonly stage: number
  readonly poses: readonly Pose[]
  /** The dumbwaiter's car, on a copy: its height at each pose, the ticket inside it from the second pose to the last but one. */
  readonly car: readonly number[] | null
  /** The station that burns while this stage cooks on the line (a launch), or null. */
  readonly cook: number | null
  /** The storey the ticket ends on, where a camera that follows it goes; -1 for a balk, which goes nowhere. */
  readonly storey: number
  /** How far the ticket travels, in metres. */
  readonly length: number
}

export interface Route {
  /** What the laid stages add to the house: their spikes, gates and shelves, each once. */
  readonly props: readonly HouseItem[]
  readonly chits: readonly Chit[]
  /** The stand before any stage and after each, the storey of each, and the car's height at each. */
  readonly stands: readonly Pose[]
  readonly storeys: readonly number[]
  readonly cars: readonly number[]
  /** The hop of each laid stage, from the stand before it. */
  readonly hops: readonly Hop[]
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000
const v3 = (x: number, y: number, z: number): Vec3 => [r3(x), r3(y), r3(z)]
const lean = (n: number, amount: number): number => (((n * 37) % 11) / 11 - 0.5) * amount
const lift = (pose: Pose, dy: number): Pose => ({ at: v3(pose.at[0], pose.at[1] + dy, pose.at[2] + dy), rot: pose.rot })
const upright = (x: number, y: number, z: number): Pose => ({ at: v3(x, y, z), rot: [0, 0, 0] })

/** The route of a view's laid path through its house: what each stage lays, its chit, and the ticket's way through it. */
export function routeOf(view: FloorView, house: House): Route {
  // The house is planned over every place a laid stage names, so each has its spot.
  const spotOf = (place: Place) => house.spots.get(placeKey(place)) as Spot
  const yOf = (storey: number) => house.storeys[storey].y
  const shaft = house.shaft?.x ?? 0
  const windows = house.windows ?? 0
  // A window's sill, in front of its opening, and the chute behind the partition at the same height.
  const sill = (storey: number, behind: number): Pose => upright(windows + 0.07 - behind, yOf(storey) + 0.222, -0.1)
  const landing = (storey: number) => house.shaft?.landings[storey] ?? house.carRest
  const props = new Map<string, HouseItem>()
  const chits = new Map<string, Chit>()
  const entry = spotOf(entryOf(view.scenario.engine))
  const stands = [entry.stand]
  const storeys = [entry.storey]
  const cars: number[] = [house.carRest]
  const hops: Hop[] = []
  view.laid.forEach((stage, i) => {
    const a = spotOf(stage.from)
    const b = spotOf(stage.to)
    const y = a.y
    let key = `${stage.mechanism}-${a.key}-${b.key}`
    let chit = a.gpu ? v3((a.x + b.x) / 2, y + 0.08, 0.2) : v3(a.x + 0.31, y + 0.2, a.stand.at[2] + 0.013)
    let place: Chit['place'] = a.gpu ? 'above' : 'right'
    let prop: HouseItem | null = null
    let via: Pose[] = a.key === b.key ? [lift(b.stand, 0.02)] : []
    let after = b.stand
    let car: number[] | null = null
    switch (stage.mechanism) {
      case 'queue': {
        // A spike beside the hands, or between the two pairs of hands it joins; the ticket waits on it.
        const x = a.key === b.key ? a.x + 0.36 : (a.x + b.x) / 2
        const turn = lean(Math.round(x * 10), 0.6)
        key = `spike-${a.storey}-${r3(x)}`
        chit = v3(x, y + 0.22, 0)
        place = 'above'
        prop = { kind: 'spike', id: key, at: v3(x, y, 0) }
        after = { at: v3(x - 0.06 * Math.sin(turn), y + 0.03, -0.06 * Math.cos(turn)), rot: [-Math.PI / 2, 0, turn] }
        via = [lift(after, 0.06)]
        break
      }
      case 'sync': {
        // "Heard!": the gate beside the hands that wait; the ticket stops at it, then goes back on its rail.
        const x = a.x - 0.36
        key = `gate-${a.key}`
        chit = v3(x, y + 0.26, 0)
        place = 'above'
        prop = { kind: 'gate', id: key, at: v3(x, y, 0) }
        via = [upright(x + 0.07, y + 0.17, 0.05)]
        break
      }
      case 'ipc':
      case 'shm': {
        // Onto its storey's window sill, through the window into the chute, along it, and out through the other storey's window; shared
        // memory leaves a shelf under the window it leaves by, which both floors reach.
        const lo = Math.min(a.storey, b.storey)
        const hi = Math.max(a.storey, b.storey)
        key = `${stage.mechanism}-${lo}-${hi}`
        chit = v3(windows - 0.06, (yOf(lo) + yOf(hi)) / 2 + 0.26, 0.12)
        place = 'left'
        if (stage.mechanism === 'shm') prop = { kind: 'shelf', id: key, at: v3(windows + 0.08, yOf(a.storey) + 0.06, -0.1) }
        via = [sill(a.storey, 0), sill(a.storey, 0.24), sill(b.storey, 0.24), sill(b.storey, 0)]
        break
      }
      case 'h2d':
      case 'd2h': {
        // Into the dumbwaiter's car at one landing, and out at the other.
        const host = stage.mechanism === 'h2d' ? a : b
        key = `copy-${host.storey}`
        chit = v3(shaft + 0.22, landing(host.storey) + 0.24, -0.04)
        place = 'right'
        via = [upright(shaft, landing(a.storey) + 0.2, -0.23), upright(shaft, landing(b.storey) + 0.2, -0.23)]
        car = [cars[i], landing(a.storey), landing(b.storey), landing(b.storey)]
        break
      }
    }
    if (prop) props.set(prop.id, prop)
    const group = chits.get(key) ?? { id: key, at: chit, place, stages: [] }
    group.stages.push({ n: stage.index + 1, state: stage.state })
    chits.set(key, group)
    const poses = [stands[i], ...via, after]
    const length = poses.slice(1).reduce((sum, pose, k) => sum + Math.hypot(...pose.at.map((v, axis) => v - poses[k].at[axis])), 0)
    hops.push({ stage: i, poses, car, cook: stage.mechanism === 'launch' ? b.channel : null, storey: b.storey, length })
    stands.push(after)
    storeys.push(b.storey)
    cars.push(car?.[3] ?? cars[i])
  })
  return { props: [...props.values()], chits: [...chits.values()], stands, storeys, cars, hops }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The run as the scene plays it                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A hop's time [estimated]: a beat of the bell, and more for the way it travels, at most three beats. */
export const hopMs = (bellMs: number, length: number): number => Math.min(bellMs * 3, bellMs + 220 * length)
/** How far a balk goes toward the hand-off that did not hold, as a share of the way to its first pose [estimated]. */
export const BALK = 0.3

/** What a run plays: the hops it added, from where the ticket stood, and a balk where it stopped. */
export interface Play {
  /** How far the ticket had got before the run, and how many of the hops are stages it passes (the rest is a balk). */
  readonly base: number
  readonly held: number
  readonly hops: readonly Hop[]
  /** When each hop ends, from the play's start, in ms. */
  readonly ends: readonly number[]
}

/** A balk: from the ticket's stand, a short way toward the hand-off that did not hold, and back. It goes to no storey. */
export function balkOf(hop: Hop): Hop {
  const [from, next = from] = hop.poses
  const nudge: Pose = { at: v3(...(from.at.map((v, k) => v + (next.at[k] - v) * BALK) as unknown as Vec3)), rot: from.rot }
  return { stage: hop.stage, poses: [from, nudge, from], car: null, cook: null, storey: -1, length: 0.2 }
}

/**
 * The play a new view asks for, one stage to the bell: when a run got the ticket further, the hops it added from where the ticket stood,
 * and a balk at the stage that stopped it. Any other change plays nothing, and the scene cuts to it; so does every change under reduced
 * motion, where the bell's duration is 0.
 */
export function playOf(before: FloorView, view: FloorView, route: Route, bellMs: number): Play | null {
  if (bellMs <= 0 || view.runs <= before.runs || view.level !== before.level) return null
  const held = route.hops.slice(before.reached, view.reached)
  const stop = view.stop === null ? undefined : route.hops[view.stop.at]
  const hops = stop === undefined ? held : [...held, balkOf(stop)]
  if (hops.length === 0) return null
  let t = 0
  return { base: before.reached, held: held.length, hops, ends: hops.map((hop) => (t += hopMs(bellMs, hop.length))) }
}

/** The camera rig's preset for a stop: the ticket's storey for the follow, and the cutaway for a floor the house no longer has. */
export function presetFor({ house, presets }: Pick<SceneModel, 'house' | 'presets'>, stop: CameraStop, storey: number): string {
  if (stop === 'follow') return `follow:${Math.min(Math.max(storey, 0), house.storeys.length - 1)}`
  return presets.some((preset) => preset.id === stop) ? stop : 'cutaway'
}
