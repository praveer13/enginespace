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
import { changeOf, servedPlates, tastingKitchen, tastingScene, type Anchor, type Band, type Change, type Dispenser, type Marker, type Served, type Stack, type TastingScene } from './scene-layout'
import { planOf, PLATE, presetsOf, stackHeight, type Plan, type Vec3 } from './scene-plan'
import { tastingLamp } from './scene-props'
import type { Shot } from './scene-shots'

/*
 * The Tasting's 3D scene (`verifier`; GAMES.md §2.6 "The Tasting", §10 "3D scene"; scene kit v1): the pass where the chef tastes, its room and
 * its light from the kit, and the game's own pieces made the kit's way, turned and swept with its helpers: the stacks of tasting plates,
 * stacked by hand, each in a satin glaze with its part on its edge band and a gap of shade under it; the chef's wire dispensers standing
 * in an enamel foot of the target's blue, a few plates over her stack; what went out, stacked on white side plates edged in grey beside
 * her dispenser; the plates a round pulls, glazed as the stacks' are, each over its own shadow on the steel; and the heat lamps, under
 * shades of brushed steel round a dark well (scene-props.ts). Laid out by scene-layout.ts from the session's view, so it draws and
 * decides nothing. A lazy chunk of its own, loaded by the Stage that the game holds.
 *
 * One moment carries the game, on the bell (a draw of rounds): the bell strikes, the new rounds' plates drop beside the commis's stacks,
 * course after course into the run, to their places at their coins' heights, a kept one level and out toward the chef, a sent-back one
 * out the other way, tipping away from her as it lands; then what went out settles beside each of her stacks, a dish's side plates
 * rising or falling to how often it went out, so a run's first round stands one dish to the wires' top and leaves the rest bare, and a
 * thousand stand each beside her stack exactly as tall: two skylines that are one. The lamps' light is the kit's, a cone of warm haze
 * under each and an edgeless pool where it lands on the course being tasted, with no spot light, and the steel reflects the tubes and not
 * the lamps' glow, so the amber lies on that course, under the shades, and nowhere else. A change of the recipe settles what went out
 * and drops nothing. Between bells the kitchen is still; under reduced motion every change cuts.
 *
 * Draw calls at every tier: the room's metal, glaze, tile, floor and glow (5), the contact shadows (1), the tasting's glaze and wire (2),
 * the pulled plates (2, one a part), what went out (1), the bell's dome and plunger (2), the lamps' light while they burn (1) and the
 * tape (1). T2 adds bloom and the final pass. The measured figures, read from renderer.info by e2e/verifier-scene.spec.ts, and this
 * chunk's size as verify:bundle counts it, are in GAMES.md §10, "Budget".
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
 * The haze the room falls into, from this far beyond what the camera looks at to this far [estimated], in deep steel, which is also the
 * colour past the room's walls, so that a shot that sees over them sees haze. Over a run it starts just past the courses and is whole by
 * the wall, so the line behind them falls away into it and the wall over the line is haze well before the box's top edge. Over one
 * course, whose wall stands nearer the pass, it starts behind the line and is about two thirds by the wall, so the tile keeps its
 * courses and grout behind the lamps, veiled in the haze, and the hood in front of the wall ends the room. The shots nearer the pass,
 * which stand further in front of the room, take it further off, so that the room falls into it and never into a void.
 */
const haze = (near: number, far: number) => ({ near, far, color: 'surface-3' as const })
const HAZE = haze(0.3, 1.5)
const ONE_HAZE = haze(0.7, 1.9)
const NEAR_HAZE = haze(1.3, 4.6)
/**
 * The heat lamps' light, as a share of the kit's [estimated], and each lamp's pool along the pass and across it in metres: the two dishes
 * under the lamp, within the counter's depth, and gone before the next lamp's pool.
 */
const LAMP_POWER = 0.7
const POOL = [0.3, 0.2] as const
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
 * stands in front of the commis's stack, clear of it, of her dispenser and of the dish beside, so that it reads from over the run.
 */
const DROP = { height: 0.26, kept: [0.065, 0.12], back: [-0.065, 0.12], tip: 0.5, ms: 300, row: 70, round: 16 } as const
/** After a bell what went out waits for the plates to land [estimated]. */
const SERVE_DELAY = 160

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

/** A low-discrepancy step a plate, so no two plates up a stack sit alike, in [-SLACK, SLACK]. */
const slack = (k: number, f: number) => (((k * f) % 1) - 0.5) * 2 * SLACK

/**
 * Paints a turned geometry's vertices by its profile's points: a point's colour (or the glaze), times its light. With `n` plates it also
 * sets each plate a little off the one under it, by `seed`: the stack is stacked by hand.
 */
function paint(geometry: BufferGeometry, per: number, colorOf: (point: number) => Color, light: readonly number[], n = 0, seed = 0): BufferGeometry {
  const color = geometry.getAttribute('color')
  const at = geometry.getAttribute('position')
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

const glazeOf = (palette: Palette): Color => palette.colorOf('ceramic')

/** A turned piece in the plates' satin glaze, painted as `paint` does. */
const satin = (points: readonly Vec2[], segments: number, color: Color) => painted({ geometry: lathe(points, segments), surface: 'ceramic', color, finish: SATIN })

/** A round footprint for a contact shadow on the counter. */
const round = (at: Vec3, r: number, strength: number): Footprint => ({ center: at, size: [2 * r, 2 * r], radius: r, soft: 0.03, strength, yaw: 0 })

/** The dispenser's posts: two wires from its foot up behind the stack, joined over the top. */
const POST = 0.707 * (PLATE.r + 0.016)
/** The dispenser's foot: a flat enamel ring round the stack, in the target's blue, the posts standing in it, short of the stacks beside. */
const FOOT: readonly Vec2[] = [
  [0.059, 0],
  [0.072, 0],
  [0.072, 0.005],
  [0.059, 0.005],
  [0.059, 0],
]

/** The static tasting: every stack and every dispenser of the course, merged by surface into one glaze draw and one wire draw. */
function buildTasting(stacks: readonly Stack[], dispensers: readonly Dispenser[], palette: Palette, colors: Readonly<Record<string, string>>) {
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
  for (const { at, top } of dispensers) {
    const frame = tube(bent([[-POST, 0.004, -POST], [-POST, top, -POST], [POST, top, -POST], [POST, 0.004, -POST]], 0.03, 4), 0.0034, 8)
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

function TastingSet({ stacks, dispensers }: { stacks: readonly Stack[]; dispensers: readonly Dispenser[] }) {
  const kit = useKit()
  const { materials, palette, shadows } = useProps()
  const colors = kit.tokens.colors
  // Built again only when what stands changes (the layout keeps its lists while it does not): a draw moves nothing here.
  const built = useMemo(() => buildTasting(stacks, dispensers, palette, colors), [stacks, dispensers, palette, colors])
  useEffect(() => () => built.dispose(), [built])
  useLayoutEffect(() => {
    shadows.set('tasting', built.footprints)
    kit.invalidate()
    return () => shadows.remove('tasting')
  }, [built, shadows, kit])
  return (
    <group name="tasting">
      {/* The glaze's draw and the wire's. */}
      {[built.ceramic, built.metal].map((geometry, i) => geometry && <mesh key={i} geometry={geometry} material={i ? materials.metal : materials.ceramic} raycast={NO_PICK} />)}
    </group>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The moving pieces: the pulled plates and what went out                                                             */
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
  /** Its part's draw (PULLED), and its place in it. */
  readonly part: number
  readonly index: number
}

/** A stack of what went out on its way, in plates, from the height it stood at to the one it settles at. */
interface Settling {
  readonly served: Served
  readonly from: number
  readonly to: number
  readonly start: number
}

/** The parts a pulled plate's edge band can be: one the two stacks share, or the commis's extra (a graded run's plain stacks are his). */
const PULLED: readonly Band[] = ['probability-overlap', 'probability-draft']

/**
 * What moves on the bell, in one loop that holds the frames only while something moves: the plates the latest rounds pulled, each a
 * tasting plate glazed as its stack's are with its part on its edge band, over its own shadow on the steel (fainter and wider the higher
 * it was pulled from); and what went out, beside each of her stacks: side plates in the same white glaze, edged in the observed code's
 * grey, stacked by hand as hers are, as many as went out of the dish there with the top one at the very height, so that settled the
 * stack stands exactly as tall as hers. It rises or falls from the height it stood at; a stack new to the course rises from the counter.
 */
function Moving({ markers, served, change }: { markers: readonly Marker[]; served: readonly Served[]; change: Change }) {
  const kit = useKit()
  const { materials, palette, shadows } = useProps()
  const colors = kit.tokens.colors
  const parts = useMemo(() => {
    const profile = stackProfile(1)
    const glaze = glazeOf(palette)
    return [...PULLED, 'cat-white-edge' as const].map((band, part) => {
      const edge = new Color(colors[band])
      const plate = paint(satin(profile.points, part < 2 ? 32 : SEGMENTS, glaze), profile.points.length, (j) => (profile.band[j] < 0 ? glaze : edge), profile.light)
      return part < 2 ? plate : plate.scale(PLATE.out / PLATE.r, 1, PLATE.out / PLATE.r)
    })
  }, [palette, colors])
  useEffect(() => () => parts.forEach((part) => part.dispose()), [parts])
  // The pulled plates' draws, one a part, then the side plates of what went out.
  const meshes = useRef<(InstancedMesh | null)[]>([])
  const drops = useRef<Dropping[]>([])
  const settles = useRef(new Map<string, Settling>())
  const seen = useRef(-1)
  const { ease, reducedMotion } = kit
  const settleMs = kit.tokens.motion.settleMs
  const heightAt = useCallback((s: Settling, now: number) => s.from + (s.to - s.from) * ease(reducedMotion ? 1 : progress(now, s.start, settleMs)), [ease, reducedMotion, settleMs])

  const write = useCallback(
    (now: number): boolean => {
      let moving = false
      for (const { marker, start, delay, part, index } of drops.current) {
        const t = reducedMotion ? 1 : progress(now, start, DROP.ms, delay)
        if (t < 1) moving = true
        meshes.current[part]?.setMatrixAt(index, now < start + delay ? matrix.compose(at.set(...marker.at), turn, none) : pose(marker, t, ease))
      }
      let k = 0
      for (const s of settles.current.values()) {
        if (!reducedMotion && progress(now, s.start, settleMs) < 1) moving = true
        const h = heightAt(s, now)
        const [x, y, z] = s.served.at
        const seed = 40 + x * 7.3 + z * 3.1
        // None under half a plate; past that a plate a plate, the top one at the very height.
        for (let i = 0; i < (h < 0.5 ? 0 : Math.ceil(h - 1e-3)); i++)
          meshes.current[2]?.setMatrixAt(k++, matrix.compose(at.set(x + slack(i + seed, 0.618034), y + Math.max(0, Math.min(i, h - 1)) * PLATE.pitch, z + slack(i + seed, 0.414214)), turn.identity(), one))
      }
      if (meshes.current[2]) meshes.current[2].count = k
      for (const mesh of meshes.current) if (mesh) mesh.instanceMatrix.needsUpdate = true
      return moving
    },
    [ease, reducedMotion, settleMs, heightAt],
  )
  const wake = useMotionLoop(write)

  useLayoutEffect(() => {
    const now = performance.now()
    // The rounds this bell drew drop their plates, course after course into the run; any other change leaves them where they are.
    const drop = change === 'bell' && !reducedMotion
    const first = markers.reduce((min, m) => (m.round > seen.current ? Math.min(min, m.round) : min), Infinity)
    const counts = [0, 0]
    drops.current = markers.map((marker) => {
      const part = marker.band === PULLED[0] ? 0 : 1
      return { marker, start: drop && marker.round > seen.current ? now : -Infinity, delay: marker.row * DROP.row + (marker.round - first) * DROP.round, part, index: counts[part]++ }
    })
    seen.current = markers.reduce((max, m) => Math.max(max, m.round), -1)
    const next = new Map<string, Settling>()
    for (const stack of served) {
      if (stack.out === null) continue
      const to = servedPlates(stack)
      const was = settles.current.get(stack.id)
      next.set(stack.id, { served: stack, to, from: change === 'cut' ? to : was ? heightAt(was, now) : 0, start: now + (change === 'bell' ? SERVE_DELAY : 0) })
    }
    settles.current = next
    meshes.current.forEach((mesh, part) => {
      if (mesh && part < 2) mesh.count = counts[part]
    })
    // Each pulled plate's shadow on the steel under where it lands, and each stack of what went out over its own.
    shadows.set('pulled', [
      ...markers.map((m) => {
        const [x, z] = m.kept ? DROP.kept : DROP.back
        return round([m.at[0] + x, m.at[1], m.at[2] + z], PLATE.r + m.plate * 0.0015, 0.3 - m.plate * 0.004)
      }),
      ...[...next.values()].filter((s) => Math.max(s.from, s.to) >= 0.5).map((s) => round(s.served.at, PLATE.out + 0.004, 0.95)),
    ])
    if (write(now)) wake()
    kit.invalidate()
    return () => shadows.remove('pulled')
  }, [markers, served, change, reducedMotion, heightAt, kit, shadows, wake, write])

  // Room for every stack of what went out up to her dispenser's top.
  const room = served.reduce((n, s) => n + Math.ceil(s.cap), 0)
  return (
    <group name="moving">
      {parts.map((geometry, part) => (
        <instancedMesh
          key={part}
          ref={(mesh) => {
            meshes.current[part] = mesh
          }}
          args={[geometry, materials.ceramic, roomFor(part < 2 ? markers.length : room)]}
          frustumCulled={false}
          raycast={NO_PICK}
        />
      ))}
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
  const kitchen = useMemo(() => {
    const room = tastingKitchen(plan, scene.lamps)
    return { ...room, items: room.items.map(tastingLamp) }
  }, [plan, scene.lamps])
  // The line is cold and its hood's tubes are off, so nothing white burns at the frame's top edge over the run; the lamps burn while the present has a place.
  const lit = (scene.lit ? ALWAYS_LIT : ALWAYS_LIT & ~(1 << CHANNEL.lamp)) & ~(1 << CHANNEL.tube)
  return (
    <Kitchen lit={lit}>
      <StaticSet items={kitchen.items} room={kitchen.room} name="room" />
      <LampLights lamps={scene.lit ? kitchen.lights : []} power={LAMP_POWER} spread={POOL} />
      <ServiceBell at={kitchen.bell} strike={strikes} />
      <TastingSet stacks={scene.stacks} dispensers={scene.dispensers} />
      <Moving markers={scene.markers} served={scene.served} change={change} />
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
    <SceneCanvas labels={labels} background="surface-3" fog={preset !== 'run' ? NEAR_HAZE : plan.rows > 1 ? HAZE : ONE_HAZE} environment="tubes" environmentIntensity={0.75} className="es-vf-scene">
      <CameraRig presets={presets} preset={preset} parallax={0.05} />
      <Fluorescent power={0.85} />
      <Tasting plan={plan} scene={scene} change={change} strikes={strikes} onPick={onPick} />
    </SceneCanvas>
  )
}
