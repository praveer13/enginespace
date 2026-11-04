import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PointLight, type Group } from 'three'
import type { LoopView } from '@es/play/loop/types'
import { StationLight } from '@/design/components/StationLight'
import { BlockGrid } from '@/scene/BlockGrid'
import type { Vec3 } from '@/scene/camera-rig'
import { CameraRig } from '@/scene/CameraRig'
import { Fixtures } from '@/scene/Fixtures'
import { useHold, useKit } from '@/scene/kit'
import type { LabelSpec } from '@/scene/labels'
import { Fluorescent, HeatLamps } from '@/scene/Lights'
import { roleColor } from '@/scene/materials'
import { SceneCanvas } from '@/scene/SceneCanvas'
import { SelectionMarker } from '@/scene/SelectionMarker'
import { SheetInstances, type Sheet } from '@/scene/SheetInstances'
import { SpanInstances } from '@/scene/SpanInstances'
import { TimeTicks, TimeTrack } from '@/scene/TimeAxis'
import { changeOf, sceneLayout, TRACK_ORIGIN, type Anchor, type Change, type TicketSheet } from './scene-layout'
import { LOOP_PRESETS } from './scene-presets'
import './scene3d.css'

/*
 * Service's 3D scene (`loop`, TRACKER W0-T17; GAMES.md §3 "3D scene", §2.6 "Service"): the pass seen over the expediter's shoulder.
 * A lazy chunk of its own, loaded by the Stage that the game (and the front page) hold; built only from the scene kit's primitives,
 * with every mark placed by scene-layout.ts from the session's view, so it draws the night and decides nothing.
 *
 * Motion has one grammar: everything moves on the bell. A fire rung slides the night back down the pass (TimeTrack), extrudes the new
 * fire with its plates out of the present, sends a ticket whose table has asked for the check off its clip, brings the fired rail's
 * tickets down from the rail, and lights or darkens the line's stations. Between bells only the printer feeds: a ticket hung moves
 * from the strip to its clip and the strip steps out by one ticket, in the printer's line steps. Under reduced motion every change
 * cuts, and nothing moves without input.
 *
 * Draw calls, whatever the night: the steel (1) and the lamps' shades (1), the lamps' glowing housings (1), the paper (1), the tape
 * (1), the slabs and phases (1), the places (1), the clock's ticks (1) and the filament round the fire on the line (1). The shot under
 * the lamps leaves the shades and housings out, because it looks down through them.
 */

export interface Scene3DProps {
  view: LoopView
  /** The camera preset's id (scene-presets.ts). The game holds it, so `C`, the buttons and a swap of views keep it. */
  preset: string
  /** A waiting ticket picked in the scene: hang it, as tapping it in the controls does. */
  onHang?: (req: number) => void
}

/** The night recedes into the steel's own grey from this far beyond what the camera looks at [estimated]. */
const FOG = { near: 3, far: 15 }
/** The heat lamps hang higher over this pass than over the kit's specimen, so they burn brighter to pool the same amber [estimated]. */
const LAMP_POWER = 1.7
/** The brush's tile on this pass: finer than the kit's default, because the camera stands at the counter [estimated]. */
const STEEL_GRAIN = 0.9
/** The line's glow while it cooks: a point light in its lane colour over the present [estimated]. */
const STATION_GLOW = { intensity: 1.1, distance: 3, decay: 2 }

/* ------------------------------------------------------------------------------------------------------------------ */
/* What moved                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

function useChange(view: LoopView): Change {
  const [seen, setSeen] = useState<{ view: LoopView; change: Change }>({ view, change: { key: 0, kind: 'cut' } })
  if (seen.view !== view) {
    const next = { view, change: { key: seen.change.key + 1, kind: changeOf(seen.view, view) } }
    setSeen(next)
    return next.change
  }
  return seen.change
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The paper                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Pose {
  readonly center: Vec3
  readonly size: readonly [number, number]
  readonly rotation: Vec3
}

const poseOf = (sheet: Sheet): Pose => ({ center: sheet.center, size: sheet.size, rotation: sheet.rotation ?? [0, 0, 0] })
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
const mixPose = (a: Pose, b: Pose, t: number): Pose => ({
  center: mix3(a.center, b.center, t),
  size: [mix(a.size[0], b.size[0], t), mix(a.size[1], b.size[1], t)],
  rotation: mix3(a.rotation, b.rotation, t),
})

/** The printer advances in line steps, never a glide: the design system's `steps(6, end)`. */
const feedSteps = (t: number) => (t >= 1 ? 1 : Math.floor(t * 6) / 6)

/** One sheet as drawn this frame. */
interface Shown extends Sheet {
  readonly req: number
  readonly kind: TicketSheet['kind'] | 'leaving'
}

/** A move from one pose to another, on its own curve. */
interface Move {
  readonly id: string
  readonly req: number
  readonly kind: Shown['kind']
  readonly from: Pose
  readonly to: Pose
  readonly ease: (t: number) => number
}

/** The moves a new set of sheets asks for, from what is on screen now; null when the change cuts. */
function planMoves(shown: readonly Shown[], sheets: readonly TicketSheet[], kind: Change['kind'], ease: (t: number) => number): Move[] | null {
  if (kind === 'cut') return null
  const bell = kind === 'bell'
  const before = new Map(shown.map((sheet) => [sheet.id, sheet]))
  const targets = new Set(sheets.map((sheet) => sheet.id))
  const mouth = sheets.find((sheet) => sheet.kind === 'waiting')
  const moves: Move[] = sheets.map((sheet) => {
    const was = before.get(sheet.id)
    // A fired-rail ticket comes down from its clip on the rail; a ticket new to the strip comes out of the printer's mouth.
    const origin = was ?? before.get(`t${sheet.req}`) ?? (sheet.kind === 'waiting' ? mouth : undefined)
    const from = origin && origin !== sheet ? poseOf(origin) : { ...poseOf(sheet), size: [sheet.size[0], 0.001] as const }
    const stays = was?.kind === 'waiting' && sheet.kind === 'waiting'
    return { id: sheet.id, req: sheet.req, kind: sheet.kind, from, to: poseOf(sheet), ease: !bell && stays ? feedSteps : ease }
  })
  // What left: a ticket whose table asked for the check drops off its clip, and a fired ticket read back goes back up to the rail.
  for (const [id, was] of before) {
    if (targets.has(id) || was.kind === 'leaving') continue
    const from = poseOf(was)
    const drop = was.kind === 'fired' ? 0.25 : -0.45
    moves.push({ id, req: was.req, kind: 'leaving', from, to: { ...from, center: [from.center[0], from.center[1] + drop, from.center[2] - 0.1], size: [from.size[0] * 0.6, 0.001] }, ease })
  }
  return moves
}

const frameOf = (moves: readonly Move[], t: number): Shown[] => moves.map((move) => ({ id: move.id, req: move.req, kind: move.kind, ...mixPose(move.from, move.to, move.ease(t)) }))

/**
 * The tickets: the rail's, the fired rail's and the printer's strip, as one instanced sheet of paper. A ticket keeps its sheet as it
 * moves, so the paper the visitor hangs is the paper that left the strip. Each sheet's print is a DOM label that rides on a frame
 * named after it, offset from where the sheet will come to rest by however far it still has to go.
 */
function Tickets({ sheets, change, onPick }: { sheets: readonly TicketSheet[]; change: Change; onPick?: (req: number) => void }) {
  const kit = useKit()
  const [state, setState] = useState<{ sheets: readonly TicketSheet[]; change: Change; moves: readonly Move[] | null; shown: readonly Shown[] }>({ sheets, change, moves: null, shown: sheets })
  if (state.sheets !== sheets || state.change !== change) {
    // New sheets: plan the moves from what is on screen, and show their first frame now, so nothing jumps ahead of its move.
    const ms = kit.reducedMotion ? 0 : change.kind === 'bell' ? kit.tokens.motion.settleMs : kit.tokens.motion.feedMs
    const moves = ms > 0 ? planMoves(state.shown, sheets, change.kind, kit.ease) : null
    setState({ sheets, change, moves, shown: moves ? frameOf(moves, 0) : sheets })
  }
  const { moves, shown } = state
  useHold(moves !== null)
  const startedAt = useRef<{ moves: readonly Move[]; at: number } | null>(null)
  const targets = useMemo(() => new Map(sheets.map((sheet) => [sheet.id, sheet])), [sheets])

  useFrame(() => {
    if (moves === null) return
    if (startedAt.current?.moves !== moves) startedAt.current = { moves, at: performance.now() }
    const ms = change.kind === 'bell' ? kit.tokens.motion.settleMs : kit.tokens.motion.feedMs
    const t = Math.min(1, (performance.now() - startedAt.current.at) / Math.max(1, ms))
    setState((current) => (current.moves !== moves ? current : t >= 1 ? { ...current, moves: null, shown: current.sheets } : { ...current, shown: frameOf(moves, t) }))
  }, -1)

  const pick = onPick
    ? (id: string) => {
        const sheet = shown.find((candidate) => candidate.id === id)
        if (sheet?.kind === 'waiting') onPick(sheet.req)
      }
    : undefined

  return (
    <>
      <SheetInstances kind="paper" sheets={shown} curl={0.1} onPick={pick} name="tickets" />
      {shown.map((sheet) => {
        const target = targets.get(sheet.id)
        if (!target || sheet.kind === 'leaving') return null
        const offset: Vec3 = [sheet.center[0] - target.center[0], sheet.center[1] - target.center[1], sheet.center[2] - target.center[2]]
        return <SheetFrame key={sheet.id} name={`sheet:${sheet.id}`} offset={offset} />
      })}
    </>
  )
}

/** A label frame that carries a moving sheet's print: at rest it is the identity, so the print sits where its anchor says. */
function SheetFrame({ name, offset }: { name: string; offset: Vec3 }) {
  const kit = useKit()
  const group = useRef<Group>(null)
  useEffect(() => (group.current ? kit.registerFrame(name, group.current) : undefined), [kit, name])
  return <group ref={group} position={offset} />
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The stations                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The line's stations glow while the line cooks at the expo's clock and go dark in a bubble: a light in the line's lane colour over
 * where the line meets the pass, brought up or down on the bell (cut under reduced motion). The light stays in the scene at zero, so a
 * change never recompiles a material.
 */
function Stations({ lit, at, change }: { lit: boolean; at: Vec3; change: Change }) {
  const kit = useKit()
  const light = useMemo(() => new PointLight(roleColor(kit.tokens, 'lane-gpu'), 0, STATION_GLOW.distance, STATION_GLOW.decay), [kit.tokens])
  useEffect(() => () => light.dispose(), [light])
  const goal = lit ? STATION_GLOW.intensity : 0
  const ms = kit.reducedMotion ? 0 : kit.tokens.motion.bellMs
  // A new goal on the bell ramps the light to it; anything else (a cut, reduced motion, the first frame) sets it at once.
  const [ramp, setRamp] = useState<{ goal: number; change: Change; ramping: boolean }>({ goal, change, ramping: false })
  if (ramp.goal !== goal || ramp.change !== change) {
    setRamp({ goal, change, ramping: ramp.goal !== goal && change.kind === 'bell' && ms > 0 })
  }
  useHold(ramp.ramping)
  const from = useRef<{ at: number; intensity: number } | null>(null)
  useLayoutEffect(() => {
    from.current = null
    if (ramp.ramping) return
    light.intensity = ramp.goal
    kit.invalidate()
  }, [ramp, light, kit])
  useFrame(() => {
    if (!ramp.ramping) return
    from.current ??= { at: performance.now(), intensity: light.intensity }
    const t = Math.min(1, (performance.now() - from.current.at) / ms)
    light.intensity = mix(from.current.intensity, ramp.goal, kit.ease(t))
    if (t >= 1) setRamp((current) => (current === ramp ? { ...current, ramping: false } : current))
  }, -1)
  return <primitive object={light} position={at} />
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The labels                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

function labelContent(anchor: Anchor, lit: boolean): ReactNode {
  switch (anchor.kind) {
    case 'ticket':
      return (
        <span className="es-loop-label__ticket">
          <span className="es-loop-label__no">{anchor.text}</span>
          {anchor.sub ? <span className="es-loop-label__sub">{anchor.sub}</span> : null}
        </span>
      )
    case 'station':
      return <StationLight lit={lit} label="the line" size="sm" className="es-loop-label__station" />
    default:
      return anchor.text
  }
}

/**
 * Print that a shot cannot read: a ticket seen edge-on from the side or from above is a line, and its print a smudge. The clock's
 * caption sits at the present for the shots that look down the night, and at its far end for the side shot, where the present is the
 * frame's edge and the pass beyond it is out of shot.
 */
const HIDDEN: Readonly<Record<string, ReadonlySet<Anchor['kind']>>> = {
  shoulder: new Set(['axis-far']),
  side: new Set(['ticket', 'fired', 'waiting', 'more', 'empty', 'tape', 'station', 'axis']),
  lamps: new Set(['ticket', 'fired', 'waiting', 'more', 'empty', 'axis-far', 'station']),
}

function labelsOf(anchors: readonly Anchor[], lit: boolean, preset: string): LabelSpec[] {
  const hidden = HIDDEN[preset]
  return anchors.filter((anchor) => !hidden?.has(anchor.kind)).map((anchor) => ({
    id: anchor.id,
    at: anchor.at,
    frame: anchor.frame,
    place: anchor.place,
    minWidth: anchor.minWidth,
    className: `es-loop-label es-loop-label--${anchor.kind}`,
    content: labelContent(anchor, lit),
  }))
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scene                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

export default function Scene3D({ view, preset, onHang }: Scene3DProps) {
  const layout = useMemo(() => sceneLayout(view), [view])
  const change = useChange(view)
  const labels = useMemo(() => labelsOf(layout.anchors, layout.stations.lit, preset), [layout.anchors, layout.stations.lit, preset])
  const axisX = layout.lanes.gpuLeft + layout.lanes.gpuWidth + 0.16

  return (
    <SceneCanvas labels={labels} fog={FOG} exposure={1} environmentIntensity={0.85} className="es-loop-scene">
      <CameraRig presets={LOOP_PRESETS} preset={preset} />
      <Fluorescent />
      <HeatLamps lamps={layout.lamps} power={LAMP_POWER} housings={preset !== 'lamps'} />
      <Stations lit={layout.stations.lit} at={layout.stations.at} change={change} />
      <Fixtures parts={layout.fixtures} grain={STEEL_GRAIN} />
      {preset === 'lamps' ? null : <Fixtures parts={layout.overhead} grain={STEEL_GRAIN} />}
      <Tickets sheets={layout.tickets} change={change} onPick={onHang} />
      <SheetInstances kind="tape" sheets={layout.tapes} name="tape" />
      <group position={TRACK_ORIGIN}>
        <TimeTrack now={layout.window.now} unitsPerTime={layout.unitsPerTime}>
          <SpanInstances spans={layout.spans} name="spans" />
          <BlockGrid cells={layout.places} name="places" />
          <TimeTicks window={layout.window} x={axisX} maxTicks={6} />
          <SelectionMarker box={layout.onLine} />
        </TimeTrack>
      </group>
    </SceneCanvas>
  )
}
