import type { ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BoxGeometry, CircleGeometry, Matrix4, Quaternion, ShaderMaterial, Vector3, type InstancedMesh } from 'three'
import { PLATE_R, plateRadius } from '@es/play/loop/kitchen'
import type { KitchenView } from '@es/play/loop/types'
import { CameraRig } from '@/scene/CameraRig'
import { useHold, useKit } from '@/scene/kit'
import type { LabelSpec } from '@/scene/labels'
import { Fluorescent } from '@/scene/Lights'
import { ALWAYS_LIT, block, Kitchen, LampLights, lathe, litMask, painted, Plates, PrinterFeed, RailClips, ServiceBell, StaticSet, Steam, Tickets, useMotionLoop, useProps, type Footprint, type LampLight } from '@/scene/props'
import { roomFor } from '@/scene/props/context'
import { progress } from '@/scene/props/motion'
import type { Vec3 } from '@/scene/props/shape'
import { SceneCanvas } from '@/scene/SceneCanvas'
import { TapeLabel } from '@/design/components/TapeLabel'
import { changeOf, serviceKitchen, serviceScene, type Anchor, type Change, type ServiceKitchen, type ServiceScene } from './scene-layout'
import type { FullScene, ToolPlace } from './full/scene'
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
 * The heat lamps' amber falls on the pass alone, as the kit draws a lamp's light: under each lamp a cone of warm haze and the edgeless
 * pool where it lands on the steel, a lamp's width and gone before the next, and no light of the line's own that could wash the tile or
 * the stations beside a burning one. The steel reflects the kitchen's tubes, not the lamps' glow, so it warms under its lamps and nowhere
 * else; at T1 the steel in each pool is also warmed toward the amber (`PoolWarmth`). The room falls away beyond the line: its light, baked
 * into the tile and the floor, is full behind the line's worktops and dims up the tile to the hood and toward the far corners (scene-layout.ts),
 * the aisle between the pass and the line lies in shade, and the far wall and floor recede into a haze darker than any tile it covers.
 *
 * Draw calls at every tier: the static set's metal, glaze, tile, floor and glow (5), the contact shadows (1), the tickets (1), the clips
 * (1, and 1 more for the fired rail), the printer's paper (1), the plates (1), the bell's dome and plunger (2) and the lamps' light (1).
 * T1 adds the pools' warmth (1); T2 adds the steam (1), bloom and the final pass. The tapes are DOM, the design system's own, each on the
 * object it names, so their words read at the size ramp's smallest step or larger on any screen. The measured figures, read from
 * renderer.info by e2e/loop-scene.spec.ts against A§11.1's 100, and this chunk's size as verify:bundle counts it against the 40 KB
 * gate, are in GAMES.md §3, "Budget".
 */

export interface Scene3DProps {
  view: KitchenView
  /** The camera preset's id (scene-presets.ts). The game holds it, so `C`, the buttons and a swap of views keep it. */
  preset: string
  /** A waiting ticket picked in the scene: hang it, as tapping it in the controls does. */
  onHang?: (req: number) => void
  /** Draw the printer and the tickets it has fed. A page that holds the printer itself (the front page) leaves them out. */
  printer?: boolean
  /** The full service's tools on the pass: the mold rack and the padding's molds, the comb and the allergy card (full/scene.ts). */
  full?: FullScene
}

/**
 * The haze the room falls into, from this far beyond what the camera looks at to this far [estimated], in the shadows' own ink: darker
 * than every tile it covers, the floor's quarry tile as well as the wall's (W1b's finish review, round 1), so what recedes darkens and
 * never lightens. It begins past the line's front, so the stations keep their heat, and the wall behind them and the floor at its foot
 * darken into it.
 */
const HAZE = { near: 1, far: 3, color: 'text-1' } as const
/** The heat lamps' light over the pass, as a share of the kit's [estimated]: enough to pool amber on the steel and leave the glaze white. */
const LAMP_POWER = 0.5
/** Each lamp's pool on the pass, along it and across it, in metres [estimated]: round a plate's place, and gone before the next lamp's. */
const POOL = [0.3, 0.26] as const
/** The fewest milliseconds between two dark dips of the line: 3 a second at most (WCAG 2.3.1). */
const DIP_GAP_MS = 334

/* ------------------------------------------------------------------------------------------------------------------ */
/* The lamps' amber on the steel at T1                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * What each lamp's light does to the steel in the middle of its pool at T1, channel by channel [estimated]: red up, blue down. At T1 the
 * kit's light adds to the frame after the tone curve, where the lamp's amber laid on pale steel comes out a pale grey smudge (W1b's finish
 * review, round 1), so there the steel under each pool is also warmed the way a warm light warms it: its own colour scaled toward the
 * lamp's amber, most in the pool's middle and not at all at its rim. Scaling keeps the brushed grain's light and dark in the pool.
 */
const WARM = [1.14, 0.96, 0.76] as const
const WARM_FRAGMENT = `uniform vec3 uWarm;
varying float vR;
void main() {
  float w = 1.0 - smoothstep(0.0, 1.0, vR);
  vec3 m = mix(vec3(1.0), uWarm, w * w);
  gl_FragColor = vec4(m - m.b, m.b);
}`
const WARM_VERTEX = `varying float vR;
void main() {
  vR = length(position.xz);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`
/**
 * The warmth's blend, by the values of three's constants so the three-vendor chunk is asked for nothing new: CustomBlending, its colour
 * the frame's times the disc's colour plus the disc's alpha (DstColorFactor, SrcAlphaFactor), and the frame's alpha kept (ZeroFactor,
 * OneFactor).
 */
const MULTIPLY = { blending: 5, blendSrc: 208, blendDst: 204, blendSrcAlpha: 200, blendDstAlpha: 201 } as const
const poolAt = new Matrix4()
const poolScale = new Matrix4()

/**
 * The warmth of the lamps' pools on the pass at T1: a disc a pool wide under each lamp, lying on the steel with the kit's pool and under
 * paper, that multiplies what is drawn there by `WARM` (`MULTIPLY`, so the disc lays no colour of its own). One draw, at T1 only.
 */
function PoolWarmth({ lamps, spread }: { lamps: readonly LampLight[]; spread: readonly [number, number] }) {
  const kit = useKit()
  const geometry = useMemo(() => new CircleGeometry(1, 40).rotateX(-Math.PI / 2), [])
  const material = useMemo(() => new ShaderMaterial({ uniforms: { uWarm: { value: new Vector3(...WARM) } }, vertexShader: WARM_VERTEX, fragmentShader: WARM_FRAGMENT, transparent: true, depthWrite: false, ...MULTIPLY }), [])
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const instanced = mesh.current
    if (instanced) {
      lamps.forEach(({ target: [x, y, z] }, i) => instanced.setMatrixAt(i, poolAt.makeTranslation(x, y + 0.0005, z).multiply(poolScale.makeScale(spread[0], 1, spread[1]))))
      instanced.count = lamps.length
      instanced.instanceMatrix.needsUpdate = true
    }
    kit.invalidate()
  }, [lamps, spread, kit])
  return <instancedMesh ref={mesh} name="pool-warmth" args={[geometry, material, roomFor(lamps.length)]} renderOrder={1} frustumCulled={false} raycast={() => null} />
}

/** The aisle's shade on the floor (scene-layout.ts), drawn with the contact shadows: no prop casts it, so the kitchen lays it itself. */
function AisleShade({ shade }: { shade: Footprint }) {
  const { shadows } = useProps()
  useEffect(() => {
    shadows.set('aisle', [shade])
    return () => shadows.remove('aisle')
  }, [shadows, shade])
  return null
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The moment                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Moment {
  readonly view: KitchenView
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
function useMoment(view: KitchenView, scene: ServiceScene): Moment {
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
  if (anchor.kind === 'tape') {
    return (
      <TapeLabel size="sm" tilt="none">
        {anchor.text}
      </TapeLabel>
    )
  }
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
 * Print that a shot cannot read: from under the lamps the counter's tickets and the tapes are out of shot or edge-on. From the side of the
 * pass the counts that ride beside a tool (the comb's calls, the printer's tickets) fall on the expo's tape along the counter, the line's
 * last station stands behind the pass, so its tape would sit on the counter, and the pass is drawn too small on a phone to hold the tapes
 * at the size ramp's smallest step, so they show on a wider canvas alone (`SIDE_TAPES`). The tape and the mirror carry every count.
 */
const HIDDEN: Readonly<Record<string, ReadonlySet<Anchor['kind']>>> = {
  lamps: new Set(['waiting', 'more', 'tape']),
  side: new Set(['more']),
}
/** The narrowest canvas, in CSS px, that shows the tapes from the side of the pass [estimated]: wider than a phone's. */
const SIDE_TAPES = 520

function labelsOf(anchors: readonly Anchor[], preset: string): LabelSpec[] {
  const hidden = HIDDEN[preset]
  const side = preset === 'side'
  return anchors
    .filter((anchor) => !hidden?.has(anchor.kind) && !(side && anchor.id === 'tape-line'))
    .map((anchor) => ({
      id: anchor.id,
      at: anchor.at,
      frame: anchor.frame,
      place: anchor.place,
      minWidth: side && anchor.kind === 'tape' ? SIDE_TAPES : anchor.minWidth,
      className: `es-loop-label es-loop-label--${anchor.kind}`,
      content: labelContent(anchor),
    }))
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The full service's tools                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/*
 * The tools of the full service, built the scene kit's way (its lathe and rounded block, its palette and metal, its contact shadows and
 * its motion loop): spun-steel ring molds, which stand on the mold rack, one per captured size, and on the pass in a fire's padded places;
 * and the expo's steel comb, a spine and a tooth for each layer of the model, standing as tall as the calls that layer takes. Each kind is
 * one instanced draw, on contact shadows that ./full/scene.ts lays out. A change grows or folds each instance to its new size on the bell's
 * duration and curve, from where it stood, and cuts under reduced motion: the comb folding flat into one word is the moment a drilled
 * routine fires. They live in Service's own chunk, not the kit's, so no other game's scene carries them.
 */

const toolMatrix = new Matrix4()
const toolTurn = new Quaternion()
const toolAt = new Vector3()
const toolSize = new Vector3()

/** A ring mold of radius 1 and height 1: a band of thin spun steel with a rolled top edge, turned [estimated]. */
const RING: readonly (readonly [number, number])[] = [
  [0.93, 0],
  [1, 0],
  [1, 0.86],
  [1.02, 0.95],
  [0.985, 1],
  [0.93, 0.86],
]

/**
 * Instanced tools of one kind: `ring` (a mold) or `bar` (a rounded bar: the comb's spine and teeth). `shadows` are the footprints the
 * tools stand on, which the scene lays out with them.
 */
function Tools({ kind, places, shadows: footprints, name }: { kind: 'ring' | 'bar'; places: readonly ToolPlace[]; shadows: readonly Footprint[]; name: string }) {
  const kit = useKit()
  const { materials, palette, shadows } = useProps()
  const geometry = useMemo(() => painted(palette.part(kind === 'ring' ? lathe(RING, 36) : block([1, 1, 1], 0.12, [0, 0.5, 0]), kind === 'ring' ? 'alu' : 'steel')), [palette, kind])
  useEffect(() => () => geometry.dispose(), [geometry])
  const mesh = useRef<InstancedMesh>(null)
  // Where each instance's size changes from and since when, and the sizes the last frame drew: a change starts from where each stands.
  const tween = useRef<{ from: readonly Vec3[]; start: number; drawn: readonly Vec3[] }>({ from: [], start: -Infinity, drawn: [] })
  const { ease, reducedMotion } = kit
  const bellMs = kit.tokens.motion.bellMs
  const write = useCallback(
    (now: number): boolean => {
      const instanced = mesh.current
      if (!instanced) return false
      const t = tween.current
      const done = reducedMotion ? 1 : progress(now, t.start, bellMs)
      const e = ease(done)
      t.drawn = places.map((place, i) => {
        const to = place.size
        const from = t.from[i] ?? to
        const size: Vec3 = [from[0] + (to[0] - from[0]) * e, Math.max(1e-4, from[1] + (to[1] - from[1]) * e), from[2] + (to[2] - from[2]) * e]
        instanced.setMatrixAt(i, toolMatrix.compose(toolAt.set(...place.at), toolTurn, toolSize.set(...size)))
        return size
      })
      instanced.count = places.length
      instanced.instanceMatrix.needsUpdate = true
      return done < 1
    },
    [places, ease, reducedMotion, bellMs],
  )
  const wake = useMotionLoop(write)
  useLayoutEffect(() => {
    const now = performance.now()
    tween.current = { ...tween.current, from: tween.current.drawn, start: now }
    if (write(now)) wake()
    kit.invalidate()
  }, [write, wake, kit])
  useEffect(() => shadows.set(name, footprints), [shadows, name, footprints])
  useEffect(() => () => shadows.remove(name), [shadows, name])
  return <instancedMesh ref={mesh} name={name} args={[geometry, materials.metal, roomFor(places.length)]} frustumCulled={false} raycast={() => null} />
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scene                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

function Service({ view, kitchen, scene, onHang, full }: { view: KitchenView; kitchen: ServiceKitchen; scene: ServiceScene; onHang?: (req: number) => void; full?: FullScene }) {
  const kit = useKit()
  const moment = useMoment(view, scene)
  const shown = moment.dark ? moment.before : moment.scene
  const lit = moment.dark ? kitchen.stations.map(() => false) : shown.lit
  // A cut (the first frame, a new level, an undo) moves nothing: nothing comes from anywhere, and nothing slides in.
  const cut = moment.change === 'cut'
  const card = full?.card ?? null
  const tickets = useMemo(() => {
    const all = card ? [...shown.tickets, card.ticket] : shown.tickets
    return cut ? all.map((ticket) => ({ ...ticket, from: undefined })) : all
  }, [cut, shown.tickets, card])
  const plates = useMemo(() => (cut ? shown.plates.map((plate) => ({ id: plate.id, at: plate.at })) : shown.plates), [cut, shown.plates])
  const steam = useMemo(() => kitchen.stations.flatMap((station, s) => (lit[s] ? [station.top] : [])), [kitchen.stations, lit])
  const mask = moment.dark ? ALWAYS_LIT : litMask(lit)
  return (
    <Kitchen lit={mask}>
      <StaticSet items={kitchen.items} room={kitchen.room} name="service" />
      <AisleShade shade={kitchen.aisle} />
      <LampLights lamps={kitchen.lights} power={LAMP_POWER} spread={POOL} />
      {kit.tier < 2 ? <PoolWarmth lamps={kitchen.lights} spread={POOL} /> : null}
      <RailClips at={kitchen.rail.at} clips={scene.clips} />
      {kitchen.fired ? <RailClips at={kitchen.fired.at} clips={scene.clips} name="fired-clips" /> : null}
      <Tickets tickets={tickets} />
      {kitchen.printer ? <PrinterFeed at={kitchen.printer.at} yaw={kitchen.printer.yaw} feed={scene.feed} cell={scene.feedCell} /> : null}
      <ServiceBell at={kitchen.bell} strike={view.step} />
      <Plates plates={plates} scale={plateRadius(view.slots) / PLATE_R} />
      {full ? <Tools kind="ring" places={full.molds} shadows={full.moldShadows} name="molds" /> : null}
      {full ? <Tools kind="bar" places={full.comb} shadows={full.combShadows} name="comb" /> : null}
      <Steam emitters={steam} puff={moment.dark ? -moment.bells : moment.bells} />
      {onHang && scene.picks.length > 0 ? <Picks picks={scene.picks} onPick={onHang} /> : null}
    </Kitchen>
  )
}

export default function Scene3D({ view, preset, onHang, printer = true, full }: Scene3DProps) {
  const kitchen = useMemo(() => serviceKitchen(view.slots, { printer, overlap: view.overlapAvailable }), [view.slots, printer, view.overlapAvailable])
  const scene = useMemo(() => serviceScene(view, kitchen), [view, kitchen])
  const labels = useMemo(() => labelsOf(full ? [...scene.anchors, ...full.anchors] : scene.anchors, preset), [scene.anchors, full, preset])
  return (
    <SceneCanvas labels={labels} fog={HAZE} exposure={1} environment="tubes" environmentIntensity={0.75} className="es-loop-scene">
      <CameraRig presets={printer ? LOOP_PRESETS : FRONT_PRESETS} preset={preset} parallax={0.05} />
      <Fluorescent power={0.85} />
      <Service view={view} kitchen={kitchen} scene={scene} onHang={onHang} full={full} />
    </SceneCanvas>
  )
}
