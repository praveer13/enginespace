import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CanvasTexture, InstancedBufferAttribute, MeshStandardMaterial, Object3D, PlaneGeometry, type BufferGeometry, type Color, type InstancedMesh, type Material } from 'three'
import type { PoolView } from '@es/play/pool/types'
import type { SceneTokens } from '@/design/scene-tokens'
import type { ColorRoleName } from '@/design/tokens'
import { CameraRig } from '@/scene/CameraRig'
import { useKit } from '@/scene/kit'
import { Fluorescent } from '@/scene/Lights'
import { roleColor } from '@/scene/materials'
import { ALWAYS_LIT, bakeOcclusion, cap, CHANNEL, Kitchen, LampLights, painted, panGeometries, RailClips, roundedRectPath, StaticSet, Tickets, tube, useMotionLoop, useProps } from '@/scene/props'
import { progress } from '@/scene/props/motion'
import { merged, type Vec3 } from '@/scene/props/shape'
import type { PropSpec } from '@/scene/props/specs'
import { SceneCanvas } from '@/scene/SceneCanvas'
import { SheetInstances } from '@/scene/SheetInstances'
import { cabinet } from './cabinet'
import { nightOf, PAN, reachInOf, TAPE, TICKET, type Night, type ReachIn } from './scene-layout'

/*
 * The Reach-In's 3D scene (`pool`; GAMES.md §2.6 "The Reach-In", §8 "3D scene"; scene kit v1): a reach-in prep cabinet in the middle of
 * service, laid out by scene-layout.ts from the session's view, so it draws the night and decides nothing. A lazy chunk of its own, which
 * the Stage on the game's page loads.
 *
 * The reach-in is this scene's own prop, made the kit's way (cabinet.ts, a `CustomSpec`): bevelled boxes and rods from shape.ts, in the
 * palette's tones, merged and baked with the room in the one static set. Its pans are one instanced draw, each in its slot for its whole
 * life: a pan never moves, and changes state where it sits (its mise, and a kit's tape). The pan's own occlusion is baked once on the pan.
 * A kit pan's tape is the kit's masking tape (SheetInstances); the pin on it, the reach-in's own torn strip and the mise are drawn from one
 * atlas, in one material. A pan's mise is food, the food of its memory role, drawn in that role's colour as the food's own: lit from above
 * with a light top and a deep side to each piece, darker between the pieces, and darker still where it climbs the pan's wall.
 *
 * One moment carries the game, when a decision hangs a ticket: it is carried over the rack to its clip on the line's rail, its twine, one
 * string per station, reaches across the reach-in to the pans it holds, and the head pan fans into the layers it serves: thin steel
 * trays, one for each layer of its station, rise out of it and splay round its back edge toward the expo, each holding its layer's mise,
 * the padding layers last and empty, and the station's glyph on a strip of tape in the top one, on the settle duration. Between decisions the kitchen
 * is still; under reduced motion every change cuts. The heat lamps hang low over the pass and burn only while the present lies there,
 * their light the kit's cone of warm haze and the edgeless pool where it lands on the steel round the waiting tickets, the paper lying in
 * it white; and the pans a dump would take ring in the lamp's amber.
 *
 * Draw calls at T1: the static set's metal, glaze, tile, floor and glow (5), the contact shadows (1), the tickets and the clips (2), the
 * pans, their mise, the kits' tapes and the marks on them (4), the lamp's rings (1), each string of twine (one per station on the focus,
 * one per landed kit), the fan's trays and their mise (2), and the lamps' light while they burn (1). T2 adds bloom and the final pass. The measured
 * figures, read from renderer.info by e2e/pool-scene.spec.ts against A§11.1's 100, are in GAMES.md §8, "Budget".
 */

export interface Scene3DProps {
  view: PoolView
  /** The camera preset's id (scene-presets.ts). The game holds it, so `C`, the buttons and a swap of views keep it. */
  preset: string
  /** The station that One station shows, by index. */
  station: number
  /** The pans chosen to be dumped, while an eviction is open. */
  chosen: readonly number[]
}

/** The most instances of a kind: the largest pool's pans [estimated over the levels' 288]. */
const MOST = 512
/**
 * The heat lamps' light over the pass, as a share of the kit's [estimated], and each lamp's pool on the pass along it and across it, in
 * metres: the steel round the waiting tickets warmed, and the paper lying in it white, as it lies over the light.
 */
const LAMP_POWER = 0.45
const POOL = [0.26, 0.2] as const
/**
 * The fan [estimated]: how far it splays in all, and how far the top tray's front lifts, in radians; the height of each tray over the one
 * under it, how deep a tray is as a share of a pan, and how far the trays rise from where they wait, under the head pan's mise, to the
 * bottom one's rest on its rim.
 */
const FAN = { spread: 1.6, tilt: 0.25, rise: 0.009, depth: 0.08, lift: 0.038 } as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* The pans and what lies on them                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Butcher's twine along `points`, round a smooth curve through them, in jute's tan (the tape's, darkened, so it reads on the mise), painted
 * for the props' glaze as a tone would be, for a colour no tone has.
 */
const twine = (points: readonly Vec3[], color: Color): BufferGeometry => painted({ geometry: tube(points, 0.0028, 5), surface: 'ceramic', color, finish: [4, 0, 0] })

/** Where cell `cell` of the atlas starts, as an instance's `aCell`: a quarter of the atlas each way. */
const cellAt = (cell: number): [number, number] => [(cell % 4) / 4, 0.75 - (cell >> 2) / 4]

/**
 * Each memory role's food [estimated]: how many pieces, their radius in px, how squashed they are, whether each is a ring, and how far its
 * role's colour goes toward ink (or, below 0, toward paper) at a piece's lit top, in its body, and in the gaps between the pieces. Dark
 * blueberries with their bloom for a held pan; pale corn kernels for a cached one; green scallion rings over the pale of their whites for
 * shared mise; a recipe kit's sauce with a few bubbles in it.
 */
const FOODS = [
  ['used', 34, 9.5, 1, 0, -0.45, 0.4, 0.82],
  ['cached', 80, 7, 0.72, 0, -0.65, -0.18, 0.55],
  ['shared', 46, 7.5, 1, 1, -0.5, 0.15, -0.6],
  ['adapter', 7, 4, 1, 1, -0.55, 0.25, 0.25],
] as const

/**
 * The atlas, 4 × 4 cells of 128 × 64 px (scene-layout.ts's CELL and FOOD), drawn once from the roles. First masking tape, torn at both
 * ends: under each station's marker glyph (a full-attention station's circle, a sliding window's square, a state station's hexagon,
 * filled, as the 2D key draws them), for the tape in the head pan's fan, and the reach-in's own strip, with its name in a marker scrawl
 * that nobody needs to read. Then a kit's pin, stroked from the 2D icon's own path on its 24-unit grid (Glyph.tsx), which lies on the
 * kit's own tape, and a dumped pan's hollow well in its role's red. Then the mise of each memory role, as food in its role's colour, each
 * piece lit, and darker at the edge, where it meets the pan's wall.
 */
function atlas(tokens: SceneTokens): CanvasTexture<OffscreenCanvas> {
  const g = new OffscreenCanvas(512, 256).getContext('2d') as OffscreenCanvasRenderingContext2D
  const { colors } = tokens
  /** A role's colour taken `t` of the way toward ink, or `-t` of the way toward paper, in linear light. */
  const shade = (role: ColorRoleName, t: number) => roleColor(tokens, role).lerp(roleColor(tokens, t < 0 ? 'paper' : 'tape-ink'), Math.abs(t)).getStyle()
  g.fillStyle = colors.tape
  for (const [x, y] of [[0, 0], [128, 0], [256, 0], [128, 64]]) {
    g.beginPath()
    for (let j = 0; j < 18; j++) g.lineTo(x + (j < 9 ? 124 - ((j * 5) % 7) : 4 + ((j * 3) % 7)), y + 4 + (j < 9 ? j : 17 - j) * 7)
    g.fill()
  }
  g.fillStyle = g.strokeStyle = colors['tape-ink']
  ;[40, 4, 6].forEach((sides, cell) => {
    g.beginPath()
    for (let k = 0; k < sides; k++) g.lineTo(64 + 128 * cell + 18 * Math.cos((2 * Math.PI * (k + cell / 2)) / sides), 32 + 18 * Math.sin((2 * Math.PI * (k + cell / 2)) / sides))
    g.fill()
  })
  // The scrawl, drawn four times as wide as its cell and squeezed into it, as the strip is four times as long as a pan's tape.
  g.setTransform(0.25, 0, 0, 1, 140, 96)
  g.lineWidth = 3
  g.beginPath()
  for (let t = 0; t < 400; t++) g.lineTo(t - 14 * Math.sin(t / 5), 9 * Math.cos(t / 5) * Math.sin(t / 23 + 1))
  g.stroke()
  g.lineWidth = 2.4
  g.setTransform(2.2, 0, 0, 2.2, 38, 70)
  g.stroke(new Path2D('M9 3.5h6l-1 6 3.5 3H6.5l3.5-3ZM12 12.5v8'))
  g.resetTransform()
  g.strokeStyle = colors['memory-evicted']
  g.lineWidth = 12
  g.strokeRect(262, 70, 116, 52)
  FOODS.forEach(([state, n, r, squash, ring, light, body, gap], f) => {
    const x = f * 128
    const base = `memory-${state}` as const
    const top = shade(base, light)
    const mid = shade(base, body)
    const deep = shade(base, 0.55)
    g.fillStyle = shade(base, gap)
    g.fillRect(x, 128, 128, 64)
    g.lineWidth = r / 2
    for (let i = 0; i < n; i++) {
      g.setTransform(1, 0, 0, squash, x + 10 + 108 * ((0.5 + i * 0.7548777) % 1), 138 + 44 * ((0.5 + i * 0.5698403) % 1))
      const shade = g.createRadialGradient(-r / 3, -r / 3, r / 9, 0, 0, r)
      shade.addColorStop(0, top)
      shade.addColorStop(0.5, mid)
      shade.addColorStop(1, deep)
      g.fillStyle = g.strokeStyle = shade
      g.beginPath()
      g.arc(0, 0, r, 0, 7)
      if (ring) g.stroke()
      else g.fill()
    }
    g.resetTransform()
    // The meniscus: where the food climbs the pan's wall, in its own shade.
    g.strokeStyle = shade(base, 0.7)
    g.lineWidth = 5
    g.strokeRect(x + 2.5, 130.5, 123, 59)
  })
  const texture = new CanvasTexture(g.canvas)
  texture.colorSpace = 'srgb'
  return texture
}

/** Each instance takes its own cell of the atlas (its `aCell`): the material always has the atlas for its map. */
const cells = (shader: { vertexShader: string }) => {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vMapUv * 0.25 + aCell;')
}

/** A geometry with room for an atlas cell per instance. */
const celled = (geometry: BufferGeometry): BufferGeometry => geometry.setAttribute('aCell', new InstancedBufferAttribute(new Float32Array(MOST * 2), 2))

/**
 * A pan's mise, at its rest below the rim: heaped a little over its middle and drawn up the pan's walls at its edge, a meniscus, with its
 * cell of the atlas laid along the pan.
 */
function miseGeometry(): BufferGeometry {
  const w = PAN.w - 0.02
  const d = PAN.d - 0.02
  const geometry = cap(roundedRectPath(w, d, 0.012, 3, 1), 0, true, 6)
  const position = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < position.count; i++) {
    const s = 2 * Math.max(Math.abs(position.getX(i) / w), Math.abs(position.getZ(i) / d))
    position.setY(i, 0.006 * (1 - s * s) + 0.006 * s ** 10)
    uv.setXY(i, position.getZ(i) / d + 0.5, position.getX(i) / w + 0.5)
  }
  geometry.computeVertexNormals()
  return celled(geometry)
}

/** The pans and everything on them, made once for a palette: one geometry each, and the atlas's material. */
function partsOf(palette: ReturnType<typeof useProps>['palette'], tokens: SceneTokens) {
  // The kit's own hotel pan, its 1/3 drawn down to a 1/9 across, and its rim at the top's level.
  const pan = merged(panGeometries('1/3', PAN.h).map((g) => painted(palette.part(g.rotateY(Math.PI / 2).scale(PAN.w / 0.176, 1, PAN.d / 0.325).translate(0, -PAN.h, 0), 'steel')))) as BufferGeometry
  // The pan's own occlusion, baked once: the foot of its walls and the corners of its floor, dull where the room cannot reach.
  const [shade] = bakeOcclusion([pan], { radius: 0.05, voxel: 0.004, strength: 0.6 })
  const tint = pan.getAttribute('color')
  for (let i = 0; i < tint.count; i++) tint.setXYZ(i, tint.getX(i) * shade[i], tint.getY(i) * shade[i], tint.getZ(i) * shade[i])
  const map = atlas(tokens)
  // The food is shaded in its own drawing, with a little gloss; everything cuts out where its cell is empty.
  const food = new MeshStandardMaterial({ map, roughness: 0.42, alphaTest: 0.5 })
  food.onBeforeCompile = cells
  const parts = {
    pan,
    mise: miseGeometry(),
    slices: miseGeometry(),
    marker: celled(new PlaneGeometry()),
    ring: tube(roundedRectPath(PAN.w + 0.008, PAN.d + 0.008, 0.016, 4, 1).points.map(([x, z]) => [x, 0, z]), 0.0026, 6, undefined, true),
  }
  return { ...parts, food, dispose: () => [...Object.values(parts), food, map].forEach((item) => item.dispose()) }
}

interface Place {
  readonly at: Vec3
  readonly rotation?: Vec3
  readonly scale?: Vec3
  readonly cell?: number
}

/** One instanced draw: an instance at each place, turned and sized as it says, and each with its atlas cell where it has one. */
function Instances({ geometry, material, places }: { geometry: BufferGeometry; material: Material; places: readonly Place[] }) {
  const kit = useKit()
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const instanced = mesh.current
    if (!instanced) return
    const one = new Object3D()
    places.forEach((p, i) => {
      one.position.set(...p.at)
      one.rotation.set(...(p.rotation ?? [0, 0, 0]))
      one.scale.set(...(p.scale ?? [1, 1, 1]))
      one.updateMatrix()
      instanced.setMatrixAt(i, one.matrix)
      if (p.cell !== undefined) geometry.getAttribute('aCell').setXY(i, ...cellAt(p.cell))
    })
    instanced.count = places.length
    for (const attribute of [instanced.instanceMatrix, geometry.getAttribute('aCell')]) if (attribute) attribute.needsUpdate = true
    kit.invalidate()
  }, [places, geometry, kit])
  return <instancedMesh ref={mesh} args={[geometry, material, MOST]} frustumCulled={false} />
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scene                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

const slice = new Object3D()

/**
 * The kitchen and its night. The moment: when it changes (a decision moved the focus, or its pans), the focus's strings of twine grow
 * along their way from the ticket to its pans while the head pan's trays rise out of it and splay, one for each layer of its station,
 * the padding layers last, on top, and empty, on the settle duration; under reduced motion they are there at once. Until the moment
 * changes again, nothing moves.
 */
function Reach({ r, items, night }: { r: ReachIn; items: readonly PropSpec[]; night: Night }) {
  const kit = useKit()
  const { materials, palette } = useProps()
  const parts = useMemo(() => partsOf(palette, kit.tokens), [palette, kit.tokens])
  useEffect(() => parts.dispose, [parts])
  const tan = useMemo(() => roleColor(kit.tokens, 'tape').multiplyScalar(0.55), [kit.tokens])
  const pans = useMemo(() => r.pans.map((at) => ({ at })), [r])
  const kits = useMemo(() => night.kits.map((points) => twine(points, tan)), [night.kits, tan])
  useEffect(() => () => kits.forEach((geometry) => geometry.dispose()), [kits])
  // The strings and the fan of the moment being shown: a view that leaves the moment as it was (a pan chosen in the list) keeps them.
  const [shown, setShown] = useState({ key: night.moment, strings: night.twine, fan: night.fan })
  if (shown.key !== night.moment) setShown({ key: night.moment, strings: night.twine, fan: night.fan })
  const { strings, fan } = shown
  const geometries = useMemo(() => strings.map((points) => twine(points, tan)), [strings, tan])
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries])
  const trays = useRef<InstancedMesh>(null)
  const fanned = useRef<InstancedMesh>(null)
  // When the moment began: the loop's first frame after it changed, so the page reads no clock of its own (-1 until then).
  const start = useRef(-1)
  const write = (now: number) => {
    if (start.current < 0) start.current = now
    const t = progress(now, start.current, kit.reducedMotion ? 0 : kit.tokens.motion.settleMs)
    const e = kit.ease(t)
    for (const geometry of geometries) geometry.setDrawRange(0, ((geometry.index?.count ?? 0) * e) | 0)
    const tray = trays.current
    const mise = fanned.current
    const n = fan ? fan.layers + fan.pads : 0
    const cell = parts.slices.getAttribute('aCell')
    for (let k = 0; fan && tray && mise && k < n; k++) {
      // Tray k rises out of the pan to rest on the one under it, turned about the pan's back edge a little further than it, its front
      // lifted a little higher, so the trays splay toward the expo as a hand of cards does, each tray's rim over the one under it; the
      // bottom one rests on the pan's rim. Its layer's mise lies thin on its floor, and a padding layer's tray is empty. On the top tray,
      // over its floor or its mise, the head pan's tape, its long side across the tray.
      const share = k / (n - 1 || 1)
      const turn = (share - 0.5) * FAN.spread * e
      const tilt = share * FAN.tilt * e
      const rim = fan.at[1] - 0.012 + (FAN.lift + k * FAN.rise) * e
      const place = (y: number, x: number, h: number, z: number) => {
        slice.position.set(fan.at[0] + (PAN.d / 2) * Math.sin(turn), y + (PAN.d / 2) * Math.cos(turn) * Math.sin(tilt), fan.at[2] - (PAN.d / 2) * (1 - Math.cos(turn) * Math.cos(tilt)))
        slice.scale.set(x, h, z)
        slice.updateMatrix()
        return slice.matrix
      }
      slice.rotation.set(-tilt, turn, 0)
      tray.setMatrixAt(k, place(rim, 0.92, FAN.depth, 0.92))
      if (k < fan.layers) {
        mise.setMatrixAt(k, place(rim - PAN.h * FAN.depth + 0.001, 0.8, 0.35, 0.8))
        cell.setXY(k, ...cellAt(fan.cell))
      }
      if (k === n - 1) {
        slice.rotation.y += Math.PI / 2
        mise.setMatrixAt(fan.layers, place(rim - PAN.h * FAN.depth + 0.0035, TAPE.d / (PAN.w - 0.02), 0.05, TAPE.w / (PAN.d - 0.02)))
        cell.setXY(fan.layers, ...cellAt(fan.glyph))
      }
    }
    if (tray && mise) {
      tray.count = n
      mise.count = fan ? fan.layers + 1 : 0
      tray.instanceMatrix.needsUpdate = mise.instanceMatrix.needsUpdate = cell.needsUpdate = true
    }
    return t < 1
  }
  const wake = useMotionLoop(write)
  useLayoutEffect(() => {
    start.current = -1
    if (write(-1)) wake()
    kit.invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the moment starts again when its strings or its fan do, and on nothing else
  }, [geometries, fan])
  return (
    <>
      <StaticSet items={items} room={r.light} />
      {/* The heat lamps' light, low over the pass: on only while the present lies there. */}
      <LampLights lamps={night.lit ? r.lamps : []} power={LAMP_POWER} spread={POOL} />
      {/* The tickets, and the clips that grip them, larger than the kit's and curled: the moment's paper reads across the reach-in. */}
      <RailClips at={r.rail} clips={r.clips} scale={TICKET.scale} />
      <Tickets tickets={night.tickets} scale={TICKET.scale} curl={TICKET.curl} />
      <Instances geometry={parts.pan} material={materials.metal} places={pans} />
      <Instances geometry={parts.mise} material={parts.food} places={night.fills} />
      <SheetInstances kind="tape" sheets={night.sheets} />
      <Instances geometry={parts.marker} material={parts.food} places={night.tapes} />
      <Instances geometry={parts.ring} material={kit.materials.lamp} places={night.rings} />
      {[...kits, ...geometries].map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={materials.ceramic} />
      ))}
      <instancedMesh ref={trays} args={[parts.pan, materials.metal, 16]} frustumCulled={false} />
      <instancedMesh ref={fanned} args={[parts.slices, parts.food, 32]} frustumCulled={false} />
    </>
  )
}

export default function Scene3D({ view, preset, station, chosen }: Scene3DProps) {
  const pages = view.pans.length
  const r = useMemo(() => reachInOf(pages, view.cap), [pages, view.cap])
  const items = useMemo((): PropSpec[] => [...r.items, { kind: 'custom', id: 'reach-in', at: [0, 0, -r.depth / 2], build: (m) => cabinet(m, r) }], [r])
  const night = useMemo(() => nightOf(view, r, { station: preset === 'station' ? station : null, chosen }), [view, r, preset, station, chosen])
  return (
    <SceneCanvas fog={{ near: 0.45, far: 2.2, color: 'surface-3' }} environment="tubes" environmentIntensity={0.55}>
      <CameraRig presets={r.presets} preset={preset} parallax={0.04} />
      <Fluorescent />
      <Kitchen lit={night.lit ? ALWAYS_LIT : ALWAYS_LIT & ~(1 << CHANNEL.lamp)}>
        <Reach r={r} items={items} night={night} />
      </Kitchen>
    </SceneCanvas>
  )
}
