import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BufferAttribute, CylinderGeometry, Euler, Quaternion, Vector3, type Mesh } from 'three'
import type { FloorView, LaidView } from '@es/play/engine-floor/types'
import { TapeLabel } from '@/design/components/TapeLabel'
import { CameraRig } from '@/scene/CameraRig'
import { useSceneTokens } from '@/design/scene-tokens'
import { useKit } from '@/scene/kit'
import type { LabelSpec } from '@/scene/labels'
import { Fluorescent } from '@/scene/Lights'
import { CHANNEL, cellOffset, Kitchen, StaticSet, ticketGeometry, useMotionLoop, useProps } from '@/scene/props'
import { progress } from '@/scene/props/motion'
import { merged, painted } from '@/scene/props/shape'
import type { PropSpec } from '@/scene/props/specs'
import { SceneCanvas } from '@/scene/SceneCanvas'
import { SheetInstances } from '@/scene/SheetInstances'
import type { HouseItem, HouseProp, Pose, Spot } from './scene-layout'
import type { SceneModel } from './scene-presets'
import { carGeometries, customOf, OWN } from './scene-props'
import { playOf, presetFor, routeOf, type Chit, type Hop, type Play, type Route } from './scene-route'
import type { CameraStop } from './scene-stops'
import './scene3d.css'

/*
 * Back of House's 3D scene (`engine-floor`; GAMES.md §5 "3D scene", §2.6 "Back of House"; scene kit v1): the house in cutaway, drawn from
 * src/scene/props and this game's own props made the kit's way (scene-props.ts), in the house the game's page lays out of the session's view
 * (scene-presets.ts's `sceneModelOf`, over scene-layout.ts), along the route the view's laid stages make through it (scene-route.ts), so it
 * draws the run and decides nothing. A lazy chunk of its own, loaded by the Stage the game holds.
 *
 * One moment carries the game, on the bell: pulling the stub sends the ticket along the stages the run got through that it had not stood
 * past before, one stage to the bell, each a hop through the hand-off that crosses it (through a window into the chute and out at another
 * floor's, into the dumbwaiter's car and down its shaft, onto the line's rail while its station burns, onto a spike, past the gate), and at
 * the first stage that does not hold it balks and stands. The chit of each stage it passes inks as it goes, and the camera that follows the
 * ticket (the stop a run takes from the cutaway) moves with it from hands to hands. Between runs the house is still; under reduced motion
 * every change cuts.
 *
 * The one lamp: of the house's lamps only the present's is lit: its bulb's glow round its shade's lip, by the kitchen's glow mask, and its
 * light (Glow): a cone of warm haze from the shade's mouth to the surface its hands work at, and the warm pool where it lands on the steel,
 * edgeless, wider along the counter than across it, at every tier and wide enough to read across the cutaway. Its light falls in front of
 * the ticket that hangs on the tile, so the paper stays white bond, warmed only at its top by the haze it hangs in. On the line the
 * present's station burns instead, and a station burns while the ticket cooks on it. Nothing else glows but the canopy's white tubes. The
 * room falls away past the house into a haze of deep steel.
 *
 * Draw calls at every tier: the house's set (metal, ceramic, tile, floor, glow: 5), the laid hand-offs' set (1 or 2), the contact shadows
 * (1), the ticket (1), the dumbwaiter's car (1), the line's tape (1) and the lit lamp's light (1); the rooms' furniture and the kitchen
 * round the house merge into the house's set. T2 adds bloom and the final pass. The measured figures, read from renderer.info by
 * e2e/engine-floor-scene.spec.ts against A§11.1's 100, and the chunk's size as verify:bundle counts it against the 40 KB gate, are in
 * GAMES.md §5, "Budget".
 */

export interface Scene3DProps {
  view: FloorView
  /** What the page laid out of the view: the house, the present, the tapes and the camera's presets. The route is the scene's own. */
  model: SceneModel
  /** The camera's stop (scene-stops.ts). The game holds it, so `C`, the buttons and a swap of views keep it. */
  stop: CameraStop
}

/** The haze the room falls into past what the camera looks at, from this far to this far [estimated], in deep steel. */
const HAZE = { near: 0.3, far: 3.2, color: 'surface-3' } as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* The ticket and the dumbwaiter's car                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The present lamp's light, as the room sees it, a unit tall (the scene stretches it from the shade's mouth to the surface the hands work at,
 * stopping 0.7% short so the pool lies on that surface and not in it): a cone of warm haze in the kit's soft additive light, and its two
 * caps, the mouth's glow and the pool where the light lands, both turned to the room so they read from every stop. The haze is strongest
 * at the mouth and fades down the cone, and the pool fades from its middle to nothing at its rim (its side's top ring, the mouth's cap and
 * the pool's 40 middles are lit; the side's foot and the pool's rim are dark). Its sizes are [estimated]: the mouth about the shade's, the
 * pool a counter's depth across, and stretched along the counter as brushed steel spreads a lamp's light along its grain.
 */
const GLOW = new CylinderGeometry(0.1, 0.21, 0.993, 40).translate(0, -0.4965, 0)
const { uv, normal } = GLOW.attributes
for (let i = 0; i < 244; i++) {
  uv.setY(i, i < 41 ? 2.3 : i > 81 && i < 203 ? 3.3 : 0)
  if (i > 81) normal.setXYZ(i, 0, 0, 1)
}

/** The ticket: a kitchen's [estimated], a slip a hand wide and twice as long, the print's own shape, thick enough that its edge catches light. */
const SHEET = ticketGeometry(0.1, 0.2, 0.002)
const [u, v] = cellOffset(3)
SHEET.setAttribute('aCell', new BufferAttribute(new Float32Array(SHEET.getAttribute('position').count * 2).map((_, i) => (i % 2 ? v : u)), 2))

const euler = new Euler()
const turned = (rot: Pose['rot'], into = new Quaternion()) => into.setFromEuler(euler.set(rot[0], rot[1], rot[2]))
const a = new Vector3()
const b = new Vector3()
const q = new Quaternion()

/** Puts the ticket where a hop has it at `t` (0 to 1): along its poses by distance, turning as it goes. Returns the segment and how far. */
function sample(hop: Hop, t: number, mesh: Mesh): [number, number] {
  const lengths = hop.poses.slice(1).map((pose, k) => a.set(...hop.poses[k].at).distanceTo(b.set(...pose.at)))
  let s = t * (lengths.reduce((sum, length) => sum + length, 0) || 1)
  let k = 0
  while (k < lengths.length - 1 && s > lengths[k]) s -= lengths[k++]
  const u = lengths[k] > 0 ? Math.min(1, s / lengths[k]) : 1
  mesh.position.lerpVectors(a.set(...hop.poses[k].at), b.set(...hop.poses[k + 1].at), u)
  mesh.quaternion.slerpQuaternions(turned(hop.poses[k].rot), turned(hop.poses[k + 1].rot, q), u)
  return [k, u]
}

/** The ticket (the kit's paper, with its print) and the car, placed every frame of a play, and at rest otherwise; and the lit lamp's light. */
function Mover({ route, shaft, play, passed, onHop, lamp }: { route: Route; shaft: number | null; play: Play | null; passed: number; onHop: (k: number) => void; lamp: Spot['lamp'] }) {
  const kit = useKit()
  const { materials, palette } = useProps()
  const box = useMemo(() => merged(carGeometries().map((part) => painted(palette.part(part, 'steel')))), [palette])
  useEffect(() => () => box?.dispose(), [box])
  const ticket = useRef<Mesh>(null)
  const car = useRef<Mesh>(null)
  const shown = useRef(-1)
  // A play starts on its first drawn frame. The kit draws no frame while the canvas is scrolled away, so a run sent from the controls far
  // down the page plays when the house comes back into view, and is not over before anyone has seen it.
  const started = useRef<{ play: Play; at: number } | null>(null)
  const ease = kit.ease
  const step = useCallback(
    (now: number, drawn = true): boolean => {
      const mesh = ticket.current
      if (!mesh) return false
      let carY = route.cars[passed] ?? route.cars[0]
      let k = -1
      if (play !== null) {
        if (drawn && started.current?.play !== play) started.current = { play, at: now }
        const elapsed = started.current?.play === play ? now - started.current.at : 0
        k = play.ends.findIndex((end) => elapsed < end)
        if (k >= 0) {
          const hop = play.hops[k]
          const begin = k === 0 ? 0 : play.ends[k - 1]
          const [segment, u] = sample(hop, ease(progress(elapsed, begin, play.ends[k] - begin)), mesh)
          if (hop.car) carY = hop.car[segment] + (hop.car[segment + 1] - hop.car[segment]) * u
        }
      }
      if (k < 0) {
        const rest = route.stands[passed] ?? route.stands[0]
        mesh.position.set(...rest.at)
        turned(rest.rot, mesh.quaternion)
      }
      if (car.current) car.current.position.y = carY
      if (k !== shown.current) {
        shown.current = k
        onHop(k)
      }
      return k >= 0
    },
    [route, play, passed, ease, onHop],
  )
  const wake = useMotionLoop(step)
  useLayoutEffect(() => {
    if (step(performance.now(), false)) wake()
    kit.invalidate()
  }, [step, wake, kit])
  return (
    <>
      <mesh ref={ticket} geometry={SHEET} material={materials.ticket} raycast={() => null} />
      {box && shaft !== null ? <mesh ref={car} geometry={box} material={materials.metal} position={[shaft, route.cars[0], -0.23]} raycast={() => null} /> : null}
      {lamp ? <instancedMesh args={[GLOW, materials.cone, 3]} count={kit.tier > 1 ? 3 : 1} position={lamp.at as [number, number, number]} scale={[1.6, lamp.at[1] - lamp.target[1], 1]} renderOrder={2} /> : null}
    </>
  )
}


/* ------------------------------------------------------------------------------------------------------------------ */
/* The labels                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * A chit: a slip of ticket paper pinned where its hand-off is, its numbers each with what the run has found of it so far: ink for one it
 * passed, pencil for one it has not, red where it stopped.
 */
function chitContent(chit: Chit, passed: number, playing: boolean): ReactNode {
  return (
    <span>
      {chit.stages.map(({ n, state }) => {
        const shown: LaidView['state'] = playing && n > passed && state !== 'pending' ? 'pending' : state
        return (
          <span key={n} className="es-floor-chit__n" data-state={shown}>
            {n}
          </span>
        )
      })}
    </span>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scene                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

const isOwn = (item: HouseItem): item is HouseProp => OWN.has(item.kind)
const asSpec = (item: HouseItem): PropSpec => (isOwn(item) ? customOf(item) : item)

/** The house and what moves in it, inside the canvas, where the kit is. */
function House3D({ model, route, stop, play, passed, spot, cook, onHop }: { model: SceneModel; route: Route; stop: CameraStop; play: Play | null; passed: number; spot: string; cook: number | null; onHop: (k: number) => void }) {
  const { house, present } = model
  const items = useMemo(() => house.items.map(asSpec), [house])
  const strips = useMemo(() => model.tapes.flatMap((tape) => (tape.strip ? [{ id: tape.id, ...tape.strip }] : [])), [model.tapes])
  // The laid hand-offs' set is rebuilt only when a stage adds or takes away a spike, a gate or a shelf.
  const handKey = route.props.map((prop) => prop.id).join()
  const [hands, setHands] = useState({ key: '', specs: [] as PropSpec[] })
  if (hands.key !== handKey) setHands({ key: handKey, specs: route.props.map(asSpec) })
  const mask = (1 << CHANNEL.tube) | (present === null ? 0 : 1 << present.channel) | (cook === null ? 0 : 1 << cook)
  return (
    <>
      <CameraRig presets={model.presets} preset={presetFor(model, stop, spot)} parallax={0.05} />
      <Fluorescent power={0.85} />
      <Kitchen lit={mask}>
        <StaticSet items={items} room={house.room} name="house" />
        {hands.specs.length > 0 ? <StaticSet items={hands.specs} occlusion={{ radius: 0.06 }} name="handoffs" /> : null}
        <Mover route={route} shaft={house.shaft.x} play={play} passed={passed} onHop={onHop} lamp={present?.lamp ?? null} />
      </Kitchen>
      <SheetInstances kind="tape" sheets={strips} name="tape" />
    </>
  )
}

export default function Scene3D({ view, model, stop }: Scene3DProps) {
  const tokens = useSceneTokens()
  const { house, tapes } = model
  const route = useMemo(() => routeOf(view, house), [view, house])

  // A run that got further plays its hops on the bell; any other change is a cut.
  const bellMs = tokens.motion.reduced ? 0 : tokens.motion.bellMs
  const [seen, setSeen] = useState(view)
  const [play, setPlay] = useState<Play | null>(null)
  const [hop, setHop] = useState(-1)
  if (seen !== view) {
    setSeen(view)
    setPlay(playOf(seen, view, route, bellMs))
    setHop(-1)
  }
  const onHop = useCallback((k: number) => {
    setHop(k)
    if (k < 0) setPlay(null)
  }, [])
  const current = play !== null && hop >= 0 ? play.hops[hop] : null
  const passed = play === null ? view.reached : play.base + Math.min(Math.max(hop, 0), play.held)
  const spot = current?.spot || route.spots[passed] || ''

  // The chits first and the tapes over them, so a name is never covered.
  const labels = useMemo<LabelSpec[]>(
    () => [
      ...route.chits.map((chit) => ({ id: chit.id, at: chit.at, place: chit.place, className: 'es-floor-chit', content: chitContent(chit, passed, play !== null) })),
      ...tapes.map((tape) => ({
        id: tape.id,
        at: tape.at,
        minWidth: tape.minWidth,
        place: tape.hands || tape.strip ? undefined : ('right' as const),
        className: tape.strip ? 'es-floor-scene-strip' : tape.hands ? 'es-floor-scene-tape es-floor-scene-tape--hands' : 'es-floor-scene-tape',
        content: tape.strip ? (
          tape.text
        ) : (
          <TapeLabel size="sm" tilt="none" slot={tape.slot ?? undefined}>
            {tape.text}
          </TapeLabel>
        ),
      })),
    ],
    [tapes, route.chits, passed, play],
  )

  return (
    <SceneCanvas labels={labels} fog={HAZE} exposure={1} environmentIntensity={0.75} className="es-floor-scene">
      <House3D model={model} route={route} stop={stop} play={play} passed={passed} spot={spot} cook={current?.cook ?? null} onHop={onHop} />
    </SceneCanvas>
  )
}
