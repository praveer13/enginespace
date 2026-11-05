import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Color, Euler, Matrix4, Quaternion, Vector3, type BufferGeometry, type InstancedMesh } from 'three'
import type { VerifierView } from '@es/play/verifier/types'
import { CameraRig } from '@/scene/CameraRig'
import { useKit } from '@/scene/kit'
import type { LabelSpec } from '@/scene/labels'
import { Fluorescent } from '@/scene/Lights'
import { ALWAYS_LIT, bent, CHANNEL, Kitchen, LampLights, lathe, painted, ServiceBell, StaticSet, tube, useMotionLoop, useProps, type Footprint, type Palette } from '@/scene/props'
import { roomFor } from '@/scene/props/context'
import { progress } from '@/scene/props/motion'
import { merged, type Vec2 } from '@/scene/props/shape'
import { SceneCanvas } from '@/scene/SceneCanvas'
import { SheetInstances } from '@/scene/SheetInstances'
import { changeOf, ringHeight, tastingKitchen, tastingScene, type Anchor, type Band, type Change, type Marker, type Ring, type Stack, type TastingScene } from './scene-layout'
import { planOf, PLATE, presetsOf, stackHeight, type Plan, type Vec3 } from './scene-plan'
import type { Shot } from './scene-shots'

/*
 * The Tasting's 3D scene (`verifier`; GAMES.md §2.6 "The Tasting", §10 "3D scene"; scene kit v1): the pass where the chef tastes, its room and
 * its light from the kit, and the game's own pieces made the kit's way, turned and swept with its helpers: the stacks of tasting plates,
 * stacked by hand, each in a satin glaze with its part on its edge band and a gap of shade under it; the chef's wire dispensers standing
 * in an enamel foot of the target's blue; the rings that mark what went out; and the plates a round pulls. Laid out by scene-layout.ts
 * from the session's view, so it draws and decides nothing. A lazy chunk of its own, loaded by the Stage that the game holds.
 *
 * One moment carries the game, on the bell (a draw of rounds): the bell strikes, the new rounds' plates drop beside the commis's stacks,
 * course after course into the run, to their places at their coins' heights, a kept one level and out toward the chef, a sent-back one
 * out the other way, tipping away from her as it lands; then the rings settle on the chef's dispensers to what went out, onto the tops
 * of her stacks as it becomes her tasting. The lamps' amber pools on the steel round the course being tasted.
 * A change of the recipe settles the rings and drops nothing. Between bells the kitchen is still; under reduced motion every change cuts.
 *
 * Draw calls at T1: the room's metal, glaze, tile, floor and glow (5), the contact shadows (1), the tasting's glaze and wire (2), the
 * pulled plates (1), the rings (1), the bell's dome and plunger (2) and the tape (1). T2 adds each shadow-casting
 * lamp's pass over what casts. The measured figures, read from renderer.info by e2e/verifier-scene.spec.ts, and this chunk's size as
 * verify:bundle counts it, are in GAMES.md §10, "Budget".
 */

export interface Scene3DProps {
  view: VerifierView
  /** The shots the page names (scene-shots.ts), and the one to show. The game holds it, so `C`, the buttons and a swap of views keep it. */
  shots: readonly Shot[]
  preset: string
  /** Draw each plate's part, and what went out (rules.ts's showScaffold and showMeter). */
  scaffold: boolean
  outcome: boolean
  /** A dish's tape picked: focus its weight while there is a recipe to sculpt, as a tap on its column in the 2D view does. */
  onPick?: (dish: number) => void
}

/**
 * The haze the room falls into, from this far beyond what the camera looks at to this far [estimated], in deep steel. Over the run it starts
 * just past the courses, so the line and the wall behind them fall away into it; the shots nearer the pass, which stand further in front of
 * the room, take it further off, so that the room falls into it and never into a void.
 */
const HAZE = { near: 0.45, far: 3.1, color: 'surface-3' } as const
const NEAR_HAZE = { near: 1.3, far: 4.6, color: 'surface-3' } as const
/** The heat lamps' light, as a share of the kit's [estimated]: amber pooled on the steel round the course being tasted. */
const LAMP_POWER = 1.1
/** No piece of the tasting is picked: the dishes' tape is. */
const NO_PICK = () => null
/** Turns round a stack [estimated]: enough that a stack of plates reads round at a phone's size. */
const SEGMENTS = 20
/** The plates' glaze, a satin and not a mirror [estimated]: [roughness ×, clearcoat ×, 0] over the kit's ceramic, so a stack reads as plates. */
const SATIN: Vec3 = [2.6, 0.25, 0]
/** How far a plate sits off the one under it, either way [estimated]: a stack stacked by hand. */
const SLACK = 0.0035
/**
 * A drafted plate: how far it falls, where it stands out of the stack when it lands (a kept plate level, toward the chef and the pass's
 * edge; a sent-back one away from her, tipped down away from her), how far a sent-back one tips, and its drop's length [estimated]. Each
 * stands clear of its stack, and of the dispensers either side, so that it reads from over the run.
 */
const DROP = { height: 0.26, kept: [0.06, 0.105], back: [-0.1, 0.05], tip: 0.5, ms: 300, row: 70, round: 16 } as const
/** After a bell the rings wait for the plates to land [estimated]. */
const RING_DELAY = 160

/* ------------------------------------------------------------------------------------------------------------------ */
/* The plates                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * A stack of `n` plates as one turned silhouette, counter-clockwise round its section: the foot, then each plate (the gap of shade under
 * it, set in from the plate below, its lower lip in the glaze, its edge band in its part, and the rim of glaze over it), then the top
 * plate's well. Each point says whose edge band it is (-1 for the glaze) and how much light reaches it, so the gaps sit in their own shade.
 * A plate's points start after the foot's four, five a plate, which is how `paint` finds the plate a point belongs to.
 */
function stackProfile(n: number): { points: Vec2[]; band: number[]; light: number[] } {
  const r = PLATE.r
  const points: Vec2[] = [
    [0, 0.0012],
    [0.029, 0.0012],
    [0.031, 0],
    [0.036, 0],
  ]
  const band = [-1, -1, -1, -1]
  const light = [0.5, 0.5, 0.45, 0.6]
  for (let i = 0; i < n; i++) {
    const y = i * PLATE.pitch
    points.push(i === 0 ? [r - 0.008, 0.0012] : [r - 0.0075, y + 0.0004], [r - 0.0016, y + 0.0021], [r - 0.0002, y + 0.0042], [r - 0.0002, y + 0.007], [r - 0.0012, y + 0.0092])
    band.push(-1, -1, i, i, -1)
    light.push(i === 0 ? 0.62 : 0.16, 0.74, 0.96, 1, 1)
  }
  const top = (n - 1) * PLATE.pitch
  points.push([r - 0.0042, top + 0.0098], [0.046, top + 0.0062], [0.033, top + 0.0042], [0, top + 0.004])
  band.push(-1, -1, -1, -1)
  light.push(1, 0.93, 0.88, 0.9)
  return { points, band, light }
}

/**
 * Paints a turned geometry's vertices by its profile's points: a point's colour (or the glaze), times its light. With `n` plates it also
 * sets each plate a little off the one under it, by `seed`: the stack is stacked by hand.
 */
function paint(geometry: BufferGeometry, per: number, colorOf: (point: number) => Color, light: readonly number[], n = 0, seed = 0): BufferGeometry {
  const color = geometry.getAttribute('color')
  const at = geometry.getAttribute('position')
  // A low-discrepancy step a plate, so no two plates up a stack sit alike, in [-SLACK, SLACK].
  const slack = (k: number, f: number) => (((k * f) % 1) - 0.5) * 2 * SLACK
  for (let v = 0; v < color.count; v++) {
    const c = colorOf(v % per)
    const l = light[v % per]
    color.setXYZ(v, c.r * l, c.g * l, c.b * l)
    if (n > 0) {
      const k = Math.min(n - 1, ((v % per) - 4) / 5 | 0) + seed
      at.setXYZ(v, at.getX(v) + slack(k, 0.618034), at.getY(v), at.getZ(v) + slack(k, 0.414214))
    }
  }
  return geometry
}

const glazeOf = (palette: Palette): Color => palette.part(null as unknown as BufferGeometry, 'ceramic').color

/** A turned piece in the plates' satin glaze, painted as `paint` does. */
const satin = (points: readonly Vec2[], segments: number, color: Color) => painted({ geometry: lathe(points, segments), surface: 'ceramic', color, finish: SATIN })

/** A round footprint for a contact shadow on the counter. */
const round = (at: Vec3, r: number, strength: number): Footprint => ({ center: at, size: [2 * r, 2 * r], radius: r, soft: 0.03, strength, yaw: 0 })

/** The dispenser's posts: two wires from its foot up behind the stack, joined over the top. */
const POST = 0.707 * (PLATE.r + 0.016)
/** The dispenser's foot: a flat enamel ring round the stack, in the target's blue, the posts standing in it. */
const FOOT: readonly Vec2[] = [
  [0.064, 0],
  [0.084, 0],
  [0.084, 0.005],
  [0.064, 0.005],
  [0.064, 0],
]

/** The static tasting: every stack and every dispenser of the course, merged by surface into one glaze draw and one wire draw. */
function buildTasting(stacks: readonly Stack[], dispensers: readonly Vec3[], rail: number, palette: Palette, colors: Readonly<Record<string, string>>) {
  const glaze = glazeOf(palette)
  const tone = new Map<Band, Color>()
  const colorOf = (band: Band) => tone.get(band) ?? tone.set(band, new Color(colors[band])).get(band) ?? glaze
  const ceramic: BufferGeometry[] = []
  const metal: BufferGeometry[] = []
  const footprints: Footprint[] = []
  for (const stack of stacks) {
    const n = stack.bands.length
    const profile = stackProfile(n)
    // Upside down, plates wait unplated: the stack is turned over where it stands, its edges painted top down so that its parts keep
    // their order from the counter up, as the stack beside it does.
    const plate = (j: number) => (stack.flipped ? n - 1 - profile.band[j] : profile.band[j])
    const geometry = paint(satin(profile.points, SEGMENTS, glaze), profile.points.length, (j) => (profile.band[j] < 0 ? glaze : colorOf(stack.bands[plate(j)])), profile.light, n, 40 + stack.at[0] * 7.3 + stack.at[2] * 3.1)
    if (stack.flipped) geometry.rotateX(Math.PI).translate(0, stackHeight(n), 0)
    ceramic.push(geometry.translate(...stack.at))
    footprints.push(round(stack.at, PLATE.r + 0.004, 0.95))
  }
  const target = colorOf('probability-target')
  for (const at of dispensers) {
    const frame = tube(bent([[-POST, 0.004, -POST], [-POST, rail, -POST], [POST, rail, -POST], [POST, 0.004, -POST]], 0.03, 4), 0.0034, 8)
    metal.push(painted(palette.part(frame, 'steel')).translate(...at))
    // Her dispenser's foot, in the target's code: the chef's tasting stands in it.
    ceramic.push(paint(painted(palette.part(lathe(FOOT, SEGMENTS + 8), 'ceramic')), FOOT.length, () => target, [0.7, 0.9, 1, 0.8, 0.7]).translate(...at))
    footprints.push(round(at, PLATE.r + 0.026, 0.55))
  }
  const glazed = merged(ceramic)
  const wired = merged(metal)
  for (const part of [...ceramic, ...metal]) part.dispose()
  return {
    ceramic: glazed,
    metal: wired,
    footprints,
    dispose() {
      glazed?.dispose()
      wired?.dispose()
    },
  }
}

function TastingSet({ stacks, dispensers, rail }: { stacks: readonly Stack[]; dispensers: readonly Vec3[]; rail: number }) {
  const kit = useKit()
  const { materials, palette, shadows } = useProps()
  const colors = kit.tokens.colors
  // Built again only when what stands changes (the layout keeps its lists while it does not): a draw moves nothing here.
  const built = useMemo(() => buildTasting(stacks, dispensers, rail, palette, colors), [stacks, dispensers, rail, palette, colors])
  useEffect(() => () => built.dispose(), [built])
  useLayoutEffect(() => {
    shadows.set('tasting', built.footprints)
    kit.invalidate()
    return () => shadows.remove('tasting')
  }, [built, shadows, kit])
  const cast = kit.shadowLights > 0
  return (
    <group name="tasting">
      {built.ceramic ? <mesh name="tasting-glaze" geometry={built.ceramic} material={materials.ceramic} castShadow={cast} receiveShadow={cast} raycast={NO_PICK} /> : null}
      {built.metal ? <mesh name="tasting-wire" geometry={built.metal} material={materials.metal} castShadow={cast} receiveShadow={cast} raycast={NO_PICK} /> : null}
    </group>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The moving pieces: the pulled plates and the rings                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

const matrix = new Matrix4()
const at = new Vector3()
const turn = new Quaternion()
const euler = new Euler()
const one = new Vector3(1, 1, 1)
const none = new Vector3(0, 0, 0)

/**
 * Where a pulled plate is `t` of the way through its drop: falling beside its stack to its place at its coin's height, level; then a
 * sent-back plate tips away from the chef, lifted by as much as its low edge drops, so that it clears what is under it.
 */
function pose(m: Marker, t: number, ease: (t: number) => number): Matrix4 {
  const [x, z] = m.kept ? DROP.kept : DROP.back
  const fall = ease(Math.min(1, t / 0.7))
  const tip = m.kept ? 0 : ease(Math.max(0, (t - 0.7) / 0.3))
  at.set(m.at[0] + x, m.at[1] + m.plate * PLATE.pitch + DROP.height * (1 - fall) + tip * Math.sin(DROP.tip) * PLATE.r, m.at[2] + z)
  return matrix.compose(at, turn.setFromEuler(euler.set(0, 0, tip * DROP.tip)), one)
}

interface Dropping {
  readonly marker: Marker
  readonly start: number
  readonly delay: number
}

interface Settling {
  readonly ring: Ring
  readonly from: number
  readonly to: number
  readonly start: number
}

/**
 * What moves on the bell, in one loop that holds the frames only while something moves: the plates the latest rounds pulled (each tinted
 * whole in its band's colour), and the rings on the dispensers, each settling from where it stood to what went out (a ring new to the
 * course comes down from the dispenser's top).
 */
function Moving({ markers, rings, frame, change }: { markers: readonly Marker[]; rings: readonly Ring[]; frame: number; change: Change }) {
  const kit = useKit()
  const { materials, palette } = useProps()
  const colors = kit.tokens.colors
  const parts = useMemo(() => {
    const profile = stackProfile(1)
    const white = new Color(colors['probability-observed'])
    const grey = new Color(colors['cat-white-edge'])
    const turned = (points: Vec2[], colorOf: (j: number) => Color, light: readonly number[]) => paint(painted(palette.part(lathe(points, 32), 'ceramic')), points.length, colorOf, light)
    const plate = (points: Vec2[], color: Color, light: readonly number[]) => paint(satin(points, 32, color), points.length, () => color, light)
    // A white enamel ring round the plates' edges, its lower lip in the edge's grey: what went out, hollow over the chef's tasting.
    const hoop: Vec2[] = [
      [0.064, -0.004],
      [0.077, -0.004],
      [0.077, 0.0042],
      [0.064, 0.0042],
      [0.064, -0.004],
    ]
    return [
      // A pulled plate, glazed whole in its part, which each one tints: its part reads from over the run, as its tilt reads kept or not.
      plate(profile.points, new Color(1, 1, 1), profile.light),
      turned(hoop, (j) => (j < 2 || j > 3 ? grey : white), [0.85, 0.85, 1, 0.95, 0.85]),
    ] as const
  }, [palette, colors])
  useEffect(() => () => parts.forEach((part) => part.dispose()), [parts])
  const plates = useRef<InstancedMesh>(null)
  const hoops = useRef<InstancedMesh>(null)
  const drops = useRef<Dropping[]>([])
  const settles = useRef(new Map<string, Settling>())
  const seen = useRef(-1)
  const { ease, reducedMotion } = kit
  const settleMs = kit.tokens.motion.settleMs
  const heightAt = useCallback((s: Settling, now: number) => s.from + (s.to - s.from) * ease(reducedMotion ? 1 : progress(now, s.start, settleMs)), [ease, reducedMotion, settleMs])

  const write = useCallback(
    (now: number): boolean => {
      let moving = false
      drops.current.forEach(({ marker, start, delay }, i) => {
        const t = reducedMotion ? 1 : progress(now, start, DROP.ms, delay)
        if (t < 1) moving = true
        const m = now < start + delay ? matrix.compose(at.set(...marker.at), turn, none) : pose(marker, t, ease)
        plates.current?.setMatrixAt(i, m)
      })
      let i = 0
      for (const s of settles.current.values()) {
        if (!reducedMotion && progress(now, s.start, settleMs) < 1) moving = true
        hoops.current?.setMatrixAt(i++, matrix.compose(at.set(s.ring.at[0], s.ring.at[1] + heightAt(s, now), s.ring.at[2]), turn.identity(), one))
      }
      for (const mesh of [plates.current, hoops.current]) if (mesh) mesh.instanceMatrix.needsUpdate = true
      return moving
    },
    [ease, reducedMotion, settleMs, heightAt],
  )
  const wake = useMotionLoop(write)

  useLayoutEffect(() => {
    const now = performance.now()
    // The rounds this bell drew drop their plates, course after course into the run; any other change leaves them where they are.
    const drop = change === 'bell' && !reducedMotion
    const first = markers.reduce((min, m) => (m.round > seen.current ? Math.min(min, m.round) : min), Number.POSITIVE_INFINITY)
    drops.current = markers.map((marker) => ({ marker, start: drop && marker.round > seen.current ? now : Number.NEGATIVE_INFINITY, delay: marker.row * DROP.row + (marker.round - first) * DROP.round }))
    seen.current = markers.reduce((max, m) => Math.max(max, m.round), -1)
    const next = new Map<string, Settling>()
    for (const ring of rings) {
      if (ring.out === null) continue
      const to = ringHeight(ring.out, frame)
      const was = settles.current.get(ring.id)
      next.set(ring.id, { ring, to, from: change === 'cut' ? to : was ? heightAt(was, now) : frame - 0.012, start: now + (change === 'bell' ? RING_DELAY : 0) })
    }
    settles.current = next
    const tint = new Color()
    const mesh = plates.current
    if (mesh) {
      markers.forEach((marker, i) => mesh.setColorAt(i, tint.set(colors[marker.band])))
      mesh.count = markers.length
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    if (hoops.current) hoops.current.count = next.size
    if (write(now)) wake()
    kit.invalidate()
  }, [markers, rings, frame, change, reducedMotion, colors, heightAt, kit, wake, write])

  const cast = kit.shadowLights > 0
  return (
    <group name="moving">
      <instancedMesh ref={plates} name="pulled-plates" args={[parts[0], materials.ceramic, roomFor(markers.length)]} castShadow={cast} receiveShadow={cast} frustumCulled={false} raycast={NO_PICK} />
      <instancedMesh ref={hoops} name="rings" args={[parts[1], materials.ceramic, roomFor(rings.length)]} castShadow={cast} frustumCulled={false} raycast={NO_PICK} />
    </group>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Labels                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The counts are for the shots that face the course; low along it they would only crowd, and stand over the stacks, so the walk keeps the
 * dishes' tape on the pass's edge alone. The courses' names are the run's: front on, one course stands in front of the next and their
 * names would stand on one another. Every name is marker on the design system's masking tape (`es-tape`), and every count is on a paper
 * tag (verifier.css).
 */
const labelsOf = (anchors: readonly Anchor[], preset: string): LabelSpec[] =>
  anchors
    .filter(({ kind }) => (preset === 'walk' ? kind === 'tape' : preset === 'run' || kind !== 'row'))
    .map(({ id, at, kind, text }) => ({ id, at, className: `es-vf-label es-vf-label--${kind}${kind === 'count' ? '' : ' es-tape'}`, content: text }))

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scene                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The change a new view brings, and the bell's strikes: a bell for every draw of rounds. */
function useChange(view: VerifierView): { change: Change; strikes: number } {
  const [state, setState] = useState({ view, change: 'cut' as Change, strikes: 0 })
  if (state.view !== view) {
    const change = changeOf(state.view, view)
    setState({ view, change, strikes: state.strikes + (change === 'bell' ? 1 : 0) })
  }
  return state
}

function Tasting({ plan, scene, change, strikes, onPick }: { plan: Plan; scene: TastingScene; change: Change; strikes: number; onPick?: (dish: number) => void }) {
  // The room stands still: it is built again only for another plan, or lamps that hang elsewhere (the layout keeps each list one object).
  const kitchen = useMemo(() => tastingKitchen(plan, scene.lamps), [plan, scene.lamps])
  const lit = scene.lit ? ALWAYS_LIT : ALWAYS_LIT & ~(1 << CHANNEL.lamp)
  return (
    <Kitchen lit={lit}>
      <StaticSet items={kitchen.items} room={kitchen.room} name="room" />
      <LampLights lamps={scene.lit ? kitchen.lights : []} power={LAMP_POWER} cones={false} />
      <ServiceBell at={kitchen.bell} strike={strikes} />
      <TastingSet stacks={scene.stacks} dispensers={scene.dispensers} rail={scene.frame} />
      <Moving markers={scene.markers} rings={scene.rings} frame={scene.frame} change={change} />
      {/* A dish's tape on the pass's edge, picked, hands focus to the dish's weight while there is a recipe to sculpt. */}
      <SheetInstances kind="tape" sheets={scene.tapes} name="tape" onPick={onPick && ((id) => id.startsWith('col-') && onPick(Number(id.slice(4))))} />
    </Kitchen>
  )
}

export default function Scene3D({ view, shots, preset, scaffold, outcome, onPick }: Scene3DProps) {
  const kind = view.level === 'gamma' ? 'gamma' : 'rows'
  const plan = useMemo(() => planOf(kind, view.rows.length), [kind, view.rows.length])
  const presets = useMemo(() => presetsOf(plan, shots), [plan, shots])
  const { change, strikes } = useChange(view)
  const scene = useMemo(() => tastingScene(view, plan, { scaffold, outcome }), [view, plan, scaffold, outcome])
  const labels = useMemo(() => labelsOf(scene.anchors, preset), [scene.anchors, preset])
  return (
    <SceneCanvas labels={labels} fog={preset === 'run' ? HAZE : NEAR_HAZE} environmentIntensity={0.75} shadows className="es-vf-scene">
      <CameraRig presets={presets} preset={preset} parallax={0.05} />
      <Fluorescent power={0.85} />
      <Tasting plan={plan} scene={scene} change={change} strikes={strikes} onPick={onPick} />
    </SceneCanvas>
  )
}
