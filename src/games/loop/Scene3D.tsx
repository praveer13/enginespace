import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BoxGeometry, Matrix4, type InstancedMesh } from 'three'
import type { LoopView } from '@es/play/loop/types'
import { CameraRig } from '@/scene/CameraRig'
import { useHold, useKit } from '@/scene/kit'
import type { LabelSpec } from '@/scene/labels'
import { Fluorescent } from '@/scene/Lights'
import { ALWAYS_LIT, Kitchen, LampLights, litMask, Plates, PrinterFeed, RailClips, ServiceBell, StaticSet, Steam, Tickets } from '@/scene/props'
import { SceneCanvas } from '@/scene/SceneCanvas'
import { SheetInstances } from '@/scene/SheetInstances'
import { changeOf, serviceKitchen, serviceScene, type Anchor, type Change, type ServiceKitchen, type ServiceScene } from './scene-layout'
import { FRONT_PRESETS, LOOP_PRESETS } from './scene-presets'
import './scene3d.css'

/*
 * Service's 3D scene (`loop`; GAMES.md §2.6 "Service", §3 "3D scene"; scene kit v1): the pass in the middle of service, drawn only
 * from src/scene/props and laid out by scene-layout.ts from the session's view, so it draws the night and decides nothing. A lazy
 * chunk of its own, loaded by the Stage that the game (and the front page) hold.
 *
 * One moment carries the game, on the bell: the bell strikes; if the fire waited on the expo (no overlap), the line drops dark for
 * the bell's length, the dark stretch; then every station with a ticket burns, each by its own heat element (its burners' bowls, its
 * griddle's plate, its fryer's oil, in the lamp's amber), and the empty ones stay cold steel; one plate per live clip slides onto the
 * pass while the last fire's plates are carried out, a binned plate goes into the bin, and a finished ticket is spiked. With overlap
 * the fired rail takes a copy of each ticket and the line never goes dark. Between bells the kitchen is still; a ticket hung is carried
 * to its clip, and the printer feeds the next. Under reduced motion every change cuts.
 *
 * The heat lamps' amber falls on the pass alone: three tight cones, each warming the steel's own sheen and streak under its lamp, and
 * no light of the line's own that could wash the tile or the stations beside a burning one. The room falls away beyond the line: its
 * light, baked into the tile and the floor, is full over the line and dims toward its far corners and over the hood (scene-layout.ts),
 * and it recedes into a haze of deep steel, darker than the pale tile it fogs.
 *
 * Draw calls at T1: the static set's metal, glaze, tile, floor and glow (5), the contact shadows (1), the tickets (1), the clips (1,
 * and 1 more for the fired rail), the printer's paper (1), the plates (1), the bell's dome and plunger (2) and the tape (1). T2 adds
 * the lamps' cones and the steam (2) and each shadow-casting lamp's pass over what casts. The measured figures, read from
 * renderer.info by e2e/loop-scene.spec.ts against A§11.1's 100, and this chunk's size as verify:bundle counts it against the 40 KB
 * gate, are in GAMES.md §3, "Budget".
 */

export interface Scene3DProps {
  view: LoopView
  /** The camera preset's id (scene-presets.ts). The game holds it, so `C`, the buttons and a swap of views keep it. */
  preset: string
  /** A waiting ticket picked in the scene: hang it, as tapping it in the controls does. */
  onHang?: (req: number) => void
  /** Draw the printer and the tickets it has fed. A page that holds the printer itself (the front page) leaves them out. */
  printer?: boolean
}

/**
 * The haze the room falls into, from this far beyond what the camera looks at to this far [estimated], in deep steel: it begins at the
 * line, so the stations keep their heat, and the wall behind them and the floor at its foot darken into it, away from the pale tile.
 */
const HAZE = { near: 1, far: 3.6, color: 'surface-3' } as const
/** The heat lamps' light over the pass, as a share of the kit's [estimated]: enough to pool amber on the steel and leave the glaze white. */
const LAMP_POWER = 0.6
/** The fewest milliseconds between two dark dips of the line: 3 a second at most (WCAG 2.3.1). */
const DIP_GAP_MS = 334

/* ------------------------------------------------------------------------------------------------------------------ */
/* The moment                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Moment {
  readonly view: LoopView
  readonly scene: ServiceScene
  /** The scene before the change, which the line shows while it is dark. */
  readonly before: ServiceScene
  readonly change: Change
  /** The line is dark: the fire waited on the expo, and the dip has not run out. */
  readonly dark: boolean
  /** The change that started the last dip, until DIP_GAP_MS have passed since: no other dip starts before then. -1 for none. */
  readonly dipAt: number
  readonly key: number
  readonly bells: number
}

/** What the kitchen shows now: on a bell with a dark stretch, the line dark for the bell's length, then the fire's light and plates. */
function useMoment(view: LoopView, scene: ServiceScene): Moment {
  const kit = useKit()
  const bellMs = kit.reducedMotion ? 0 : kit.tokens.motion.bellMs
  const [moment, setMoment] = useState<Moment>({ view, scene, before: scene, change: 'cut', dark: false, dipAt: -1, key: 0, bells: 0 })
  if (moment.view !== view) {
    const change = changeOf(moment.view, view)
    const key = moment.key + 1
    const dark = change === 'bell' && scene.bubble && bellMs > 0 && moment.dipAt < 0
    setMoment({ view, scene, before: moment.scene, change, dark, dipAt: dark ? key : moment.dipAt, key, bells: moment.bells + (change === 'bell' ? 1 : 0) })
  } else if (moment.scene !== scene) setMoment({ ...moment, scene })
  // The dip runs out after the bell's length; another may start only DIP_GAP_MS after this one did.
  const darkKey = moment.dark ? moment.key : -1
  useEffect(() => {
    if (darkKey < 0) return undefined
    const timer = window.setTimeout(() => setMoment((now) => (now.key === darkKey ? { ...now, dark: false } : now)), bellMs)
    return () => window.clearTimeout(timer)
  }, [darkKey, bellMs])
  const { dipAt } = moment
  useEffect(() => {
    if (dipAt < 0) return undefined
    const timer = window.setTimeout(() => setMoment((now) => (now.dipAt === dipAt ? { ...now, dipAt: -1 } : now)), DIP_GAP_MS)
    return () => window.clearTimeout(timer)
  }, [dipAt])
  // The frames stay on while the line is dark, so the scene is never taken for still in the middle of its moment.
  useHold(moment.dark)
  return moment
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Picks                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const placeAt = new Matrix4()

/** The tickets on the counter as boxes a pick can hit, drawn nowhere: a pick hangs the ticket, as tapping its button does. */
function Picks({ picks, onPick }: { picks: ServiceScene['picks']; onPick: (req: number) => void }) {
  const pickBox = useMemo(() => new BoxGeometry(0.1, 0.02, 0.14), [])
  useEffect(() => () => pickBox.dispose(), [pickBox])
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const instanced = mesh.current
    if (!instanced) return
    picks.forEach((pick, i) => instanced.setMatrixAt(i, placeAt.makeTranslation(...pick.center)))
    instanced.count = picks.length
    instanced.instanceMatrix.needsUpdate = true
    instanced.computeBoundingSphere()
  }, [picks])
  const pick = (event: ThreeEvent<MouseEvent>) => {
    const req = event.instanceId === undefined ? undefined : picks[event.instanceId]?.req
    if (req === undefined) return
    event.stopPropagation()
    onPick(req)
  }
  return <instancedMesh ref={mesh} name="picks" args={[pickBox, undefined, 16]} visible={false} onClick={pick} />
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The labels                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

function labelContent(anchor: Anchor): ReactNode {
  if (anchor.kind === 'ticket' || anchor.kind === 'fired' || anchor.kind === 'waiting') {
    return (
      <span className="es-loop-label__ticket">
        <span className="es-loop-label__no">{anchor.text}</span>
        {anchor.sub ? <span className="es-loop-label__sub">{anchor.sub}</span> : null}
      </span>
    )
  }
  return anchor.text
}

/**
 * Print that a shot cannot read: from under the lamps the counter's tickets and the tapes are out of shot or edge-on. A tape whose print
 * is hidden is not drawn either, so no blank strip of tape lies in the shot.
 */
const HIDDEN: Readonly<Record<string, ReadonlySet<Anchor['kind']>>> = {
  lamps: new Set(['waiting', 'more', 'tape']),
}

function labelsOf(anchors: readonly Anchor[], preset: string): LabelSpec[] {
  const hidden = HIDDEN[preset]
  return anchors
    .filter((anchor) => !hidden?.has(anchor.kind))
    .map((anchor) => ({
      id: anchor.id,
      at: anchor.at,
      frame: anchor.frame,
      place: anchor.place,
      minWidth: anchor.minWidth,
      className: `es-loop-label es-loop-label--${anchor.kind}`,
      content: labelContent(anchor),
    }))
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scene                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

function Service({ view, kitchen, scene, preset, onHang }: { view: LoopView; kitchen: ServiceKitchen; scene: ServiceScene; preset: string; onHang?: (req: number) => void }) {
  const moment = useMoment(view, scene)
  const shown = moment.dark ? moment.before : moment.scene
  const lit = moment.dark ? kitchen.stations.map(() => false) : shown.lit
  // A cut (the first frame, a new level, an undo) moves nothing: nothing comes from anywhere, and nothing slides in.
  const cut = moment.change === 'cut'
  const tickets = useMemo(() => (cut ? shown.tickets.map((ticket) => ({ ...ticket, from: undefined })) : shown.tickets), [cut, shown.tickets])
  const plates = useMemo(() => (cut ? shown.plates.map((plate) => ({ id: plate.id, at: plate.at })) : shown.plates), [cut, shown.plates])
  const steam = useMemo(() => kitchen.stations.flatMap((station, s) => (lit[s] ? [station.top] : [])), [kitchen.stations, lit])
  const mask = moment.dark ? ALWAYS_LIT : litMask(lit)
  return (
    <Kitchen lit={mask}>
      <StaticSet items={kitchen.items} room={kitchen.room} name="service" />
      {/* The lamps' light lands on the pass as pools on the steel; no cone hangs in the air over the line to tint it. */}
      <LampLights lamps={kitchen.lights} power={LAMP_POWER} cones={false} />
      <RailClips at={kitchen.rail.at} clips={scene.clips} />
      {kitchen.fired ? <RailClips at={kitchen.fired.at} clips={scene.clips} name="fired-clips" /> : null}
      <Tickets tickets={tickets} />
      {kitchen.printer ? <PrinterFeed at={kitchen.printer.at} yaw={kitchen.printer.yaw} feed={scene.feed} cell={scene.feedCell} /> : null}
      <ServiceBell at={kitchen.bell} strike={view.step} />
      <Plates plates={plates} />
      <Steam emitters={steam} puff={moment.dark ? -moment.bells : moment.bells} />
      {HIDDEN[preset]?.has('tape') ? null : <SheetInstances kind="tape" sheets={kitchen.tapes} name="tape" />}
      {onHang && scene.picks.length > 0 ? <Picks picks={scene.picks} onPick={onHang} /> : null}
    </Kitchen>
  )
}

export default function Scene3D({ view, preset, onHang, printer = true }: Scene3DProps) {
  const kitchen = useMemo(() => serviceKitchen(view.slots, { printer, overlap: view.overlapAvailable }), [view.slots, printer, view.overlapAvailable])
  const scene = useMemo(() => serviceScene(view, kitchen), [view, kitchen])
  const labels = useMemo(() => labelsOf(scene.anchors, preset), [scene.anchors, preset])
  return (
    <SceneCanvas labels={labels} fog={HAZE} exposure={1} environmentIntensity={0.75} shadows className="es-loop-scene">
      <CameraRig presets={printer ? LOOP_PRESETS : FRONT_PRESETS} preset={preset} parallax={0.05} />
      <Fluorescent power={0.85} />
      <Service view={view} kitchen={kitchen} scene={scene} preset={preset} onHang={onHang} />
    </SceneCanvas>
  )
}
