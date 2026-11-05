import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CanvasTexture, CatmullRomCurve3, Color, InstancedBufferAttribute, MeshStandardMaterial, Object3D, PlaneGeometry, TubeGeometry, Vector3, type BufferGeometry, type InstancedMesh, type Material } from 'three'
import type { PoolView } from '@es/play/pool/types'
import type { SceneTokens } from '@/design/scene-tokens'
import type { ColorRoleName } from '@/design/tokens'
import { CameraRig } from '@/scene/CameraRig'
import { useKit } from '@/scene/kit'
import { Fluorescent } from '@/scene/Lights'
import { roleColor } from '@/scene/materials'
import { ALWAYS_LIT, bakeOcclusion, block, cap, CHANNEL, Kitchen, LampLights, painted, panGeometries, RailClips, roundedRectPath, StaticSet, Tickets, tube, useMotionLoop, useProps } from '@/scene/props'
import { merged, type Vec3 } from '@/scene/props/shape'
import type { PropSpec } from '@/scene/props/specs'
import { SceneCanvas } from '@/scene/SceneCanvas'
import { SheetInstances } from '@/scene/SheetInstances'
import { cabinet } from './cabinet'
import { nightOf, PAN, reachInOf, type Night, type ReachIn } from './scene-layout'
import './scene3d.css'

/*
 * The Reach-In's 3D scene (`pool`; GAMES.md §2.6 "The Reach-In", §8 "3D scene"; scene kit v1): a reach-in prep cabinet in the middle of
 * service, laid out by scene-layout.ts from the session's view, so it draws the night and decides nothing. A lazy chunk of its own, which
 * the Stage on the game's page loads.
 *
 * The reach-in is this scene's own prop, made the kit's way (cabinet.ts, a `CustomSpec`): bevelled boxes and rods from shape.ts, in the
 * palette's tones, merged and baked with the room in the one static set. Its pans are one instanced draw, each in its slot for its whole
 * life: a pan never moves, and changes state where it sits (its mise, its tape and the marker glyph on it). The pan's own occlusion is
 * baked once on the pan.
 *
 * One moment carries the game, when a decision hangs a ticket: it is carried over the rack to its clip on the line's rail, its twine, one
 * string per station, reaches across the reach-in to the pans it holds, and the pan at the head of its order fans into the layers of its
 * station on the settle duration, its padding layers in the bare pan's role. Between decisions the kitchen is still; under reduced
 * motion every change cuts. The heat lamps over the pass burn only while the present lies there, and the pans a dump would take ring in
 * the lamp's amber.
 *
 * Draw calls at T1: the static set's metal, glaze, tile, floor and glow (5), the contact shadows (1), the tickets and the clips (2), the
 * pans, their mise and their tapes (3), the reach-in's tape (1), the lamp's rings (1), each string of twine (one per station on the
 * focus, one per landed kit) and the fan (1). T2 adds each shadow-casting lamp's pass over what casts. The measured figures, read from
 * renderer.info by e2e/pool-scene.spec.ts against A§11.1's 100, are in GAMES.md §8, "Budget".
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

/* ------------------------------------------------------------------------------------------------------------------ */
/* The pans and what lies on them                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A part in a colour and finish of its own, painted for the props' glaze: what a tone does, for a colour no tone has. */
const glazed = (geometry: BufferGeometry, color = new Color(1, 1, 1), finish: Vec3 = [3.2, 0.25, 0]): BufferGeometry => painted({ geometry, surface: 'ceramic', color, finish })

/** Butcher's twine along `points`, round a smooth curve through them, in jute's tan (the tape's, darkened, so it reads on the mise). */
const twine = (points: readonly Vec3[], color: Color): BufferGeometry =>
  glazed(new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p))), points.length * 8, 0.0028, 5), color, [4, 0, 0])

/**
 * The marker glyphs on the pans' tapes, an atlas of 4 × 2 cells (scene-layout.ts's CELL), drawn once in the tape's and the marker's roles:
 * a full-attention station's circle, a sliding window's square and a state station's hexagon, filled, as the 2D key draws them; and the
 * hash of a cached pan and a kit's pin, stroked from the 2D icons' own paths on their 24-unit grid (src/design/components/Glyph.tsx).
 */
function glyphs(tokens: SceneTokens): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const g = canvas.getContext('2d') as CanvasRenderingContext2D
  g.fillStyle = tokens.colors.tape
  g.fillRect(0, 0, 512, 128)
  g.fillStyle = g.strokeStyle = tokens.colors['tape-ink']
  ;[40, 4, 6].forEach((sides, cell) => {
    g.beginPath()
    for (let k = 0; k < sides; k++) g.lineTo(64 + 128 * cell + 22 * Math.cos((2 * Math.PI * (k + cell / 2)) / sides), 32 + 22 * Math.sin((2 * Math.PI * (k + cell / 2)) / sides))
    g.fill()
  })
  g.lineWidth = 2.4
  g.lineCap = g.lineJoin = 'round'
  ;['M9.5 4 7.5 20m9-16-2 16M4.5 9h15m-15 6h15', 'M9 3.5h6l-1 6 3.5 3H6.5l3.5-3ZM12 12.5v8'].forEach((d, k) => {
    g.setTransform(2.2, 0, 0, 2.2, 422 - 384 * k, 6 + 64 * k)
    g.stroke(new Path2D(d))
  })
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = 'srgb'
  return texture
}

/** The pans and everything on them, made once for a palette: one geometry each, and the tapes' material with its atlas. */
function partsOf(palette: ReturnType<typeof useProps>['palette'], tokens: SceneTokens, crepe: MeshStandardMaterial['normalMap']) {
  // The kit's own hotel pan, its 1/3 drawn down to a 1/9 across, and its rim at the top's level.
  const pan = merged(panGeometries('1/3', PAN.h).map((g) => painted(palette.part(g.rotateY(Math.PI / 2).scale(PAN.w / 0.176, 1, PAN.d / 0.325).translate(0, -PAN.h, 0), 'steel')))) as BufferGeometry
  // The pan's own occlusion, baked once: the foot of its walls and the corners of its floor, dull where the room cannot reach.
  const [shade] = bakeOcclusion([pan], { radius: 0.05, voxel: 0.004, strength: 0.6 })
  const tint = pan.getAttribute('color')
  for (let i = 0; i < tint.count; i++) tint.setXYZ(i, tint.getX(i) * shade[i], tint.getY(i) * shade[i], tint.getZ(i) * shade[i])
  const tape = new PlaneGeometry()
  tape.setAttribute('aCell', new InstancedBufferAttribute(new Float32Array(MOST * 2), 2))
  const material = new MeshStandardMaterial({ map: glyphs(tokens), normalMap: crepe, roughness: 0.8 })
  // Each tape takes its glyph's cell of the atlas, as the kit's tickets take their print's.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aCell;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vMapUv * vec2(0.25, 0.5) + aCell;\n#endif')
  }
  const parts = {
    pan,
    mise: glazed(cap(roundedRectPath(PAN.w - 0.02, PAN.d - 0.02, 0.012, 3, 1), 0, true, 3)),
    tape,
    ring: tube(roundedRectPath(PAN.w + 0.008, PAN.d + 0.008, 0.016, 4, 1).points.map(([x, z]) => [x, 0, z]), 0.0026, 6, undefined, true),
    slice: glazed(block([PAN.w - 0.016, 0.2, 0.003], 0.0012, [0, 0, 0], 0, 1)),
  }
  return { ...parts, material, dispose: () => [...Object.values(parts), material, material.map].forEach((item) => item?.dispose()) }
}

interface Place {
  readonly at: Vec3
  readonly rotation?: Vec3
  readonly scale?: Vec3
  readonly role?: ColorRoleName
  readonly cell?: number
}

/** One instanced draw: an instance at each place, turned, sized and coloured as it says, and each with its atlas cell where it has one. */
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
      if (p.role) instanced.setColorAt(i, roleColor(kit.tokens, p.role))
      if (p.cell !== undefined) geometry.getAttribute('aCell').setXY(i, (p.cell % 4) / 4, 0.5 - (p.cell >> 2) / 2)
    })
    instanced.count = places.length
    for (const attribute of [instanced.instanceMatrix, instanced.instanceColor, geometry.getAttribute('aCell')]) if (attribute) attribute.needsUpdate = true
    instanced.computeBoundingSphere()
    kit.invalidate()
  }, [places, geometry, kit])
  return <instancedMesh ref={mesh} args={[geometry, material, MOST]} />
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scene                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

const slice = new Object3D()

/**
 * The kitchen and its night. The moment: when it changes (a decision moved the focus, or its pans), the focus's strings of twine grow
 * along their way from the ticket to its pans while the slices rise out of the head pan and fan, its padding layers in the bare pan's
 * role, on the settle duration; under reduced motion they are there at once. Until the moment changes again, nothing moves.
 */
function Reach({ r, items, night }: { r: ReachIn; items: readonly PropSpec[]; night: Night }) {
  const kit = useKit()
  const { materials, palette } = useProps()
  const parts = useMemo(() => partsOf(palette, kit.tokens, kit.materials.tape.normalMap), [palette, kit.tokens, kit.materials])
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
  const fanned = useRef<InstancedMesh>(null)
  // When the moment began: the loop's first frame after it changed, so the page reads no clock of its own (-1 until then).
  const start = useRef(-1)
  const write = (now: number) => {
    if (start.current < 0) start.current = now
    const ms = kit.reducedMotion ? 0 : kit.tokens.motion.settleMs
    const t = ms > 0 ? Math.min(1, (now - start.current) / ms) : 1
    const e = kit.ease(t)
    for (const geometry of geometries) geometry.setDrawRange(0, ((geometry.index?.count ?? 0) * e) | 0)
    const mesh = fanned.current
    const n = fan ? fan.layers + fan.pads : 0
    for (let k = 0; fan && mesh && k < n; k++) {
      // Rising out of the pan and fanning, the first layer in front.
      slice.position.set(fan.at[0], fan.at[1], fan.at[2] + PAN.d / 2 - 0.026 - k * 0.0035)
      slice.rotation.set(0, 0, (k - (n - 1) / 2) * 0.2 * e)
      slice.scale.set(1, e, 1)
      slice.updateMatrix()
      mesh.setMatrixAt(k, slice.matrix)
      mesh.setColorAt(k, roleColor(kit.tokens, k < fan.layers ? fan.role : 'memory-free').multiplyScalar(k % 2 ? 0.84 : 1))
    }
    if (mesh) {
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    return t < 1
  }
  const wake = useMotionLoop(write)
  useLayoutEffect(() => {
    start.current = -1
    if (write(-1)) wake()
    kit.invalidate()
    // The moment starts again when its strings or its fan do, and on nothing else.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometries, fan])
  const cast = kit.shadowLights > 0
  return (
    <>
      <StaticSet items={items} room={r.light} name="reach-in" />
      {/* The heat lamps' light over the pass, as a share of the kit's [estimated]: on only while the present lies there. */}
      <LampLights lamps={r.lamps} power={night.lit ? 0.6 : 0} cones={false} />
      <RailClips at={r.rail} clips={r.clips} />
      <Tickets tickets={night.tickets} />
      <Instances geometry={parts.pan} material={materials.metal} places={pans} />
      <Instances geometry={parts.mise} material={materials.ceramic} places={night.fills} />
      <Instances geometry={parts.tape} material={parts.material} places={night.tapes} />
      <Instances geometry={parts.ring} material={kit.materials.lamp} places={night.rings} />
      <SheetInstances kind="tape" sheets={night.words} />
      {[...kits, ...geometries].map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={materials.ceramic} castShadow={cast} />
      ))}
      <instancedMesh ref={fanned} args={[parts.slice, materials.ceramic, 16]} castShadow={cast} frustumCulled={false} />
    </>
  )
}

export default function Scene3D({ view, preset, station, chosen }: Scene3DProps) {
  const pages = view.pans.length
  const r = useMemo(() => reachInOf(pages, view.cap), [pages, view.cap])
  const items = useMemo((): PropSpec[] => [...r.items, { kind: 'custom', id: 'reach-in', at: [0, 0, -r.depth / 2], build: (m) => cabinet(m, r) }], [r])
  const night = useMemo(() => nightOf(view, r, { station: preset === 'station' ? station : null, chosen }), [view, r, preset, station, chosen])
  return (
    <SceneCanvas labels={night.labels} fog={{ near: 1.4, far: 4.4, color: 'surface-3' }} exposure={1} environmentIntensity={0.75} shadows className="es-pool-scene">
      <CameraRig presets={r.presets} preset={preset} parallax={0.04} />
      <Fluorescent power={0.85} />
      <Kitchen lit={night.lit ? ALWAYS_LIT : ALWAYS_LIT & ~(1 << CHANNEL.lamp)}>
        <Reach r={r} items={items} night={night} />
      </Kitchen>
    </SceneCanvas>
  )
}
