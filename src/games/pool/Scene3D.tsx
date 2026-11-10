import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BufferAttribute, CanvasTexture, InstancedBufferAttribute, MeshStandardMaterial, Object3D, PlaneGeometry, type BufferGeometry, type Color, type InstancedMesh, type Material } from 'three'
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
import { cabinet, lampBar } from './cabinet'
import { LAMP, MISE, nightOf, PAN, PASS, reachInOf, TAPE, TICKET, type Night, type ReachIn } from './scene-layout'

/*
 * The Reach-In's 3D scene (`pool`; GAMES.md §2.6 "The Reach-In", §8 "3D scene"; scene kit v1): a reach-in prep cabinet in the middle of
 * service, laid out by scene-layout.ts from the session's view, so it draws the night and decides nothing. A lazy chunk of its own, which
 * the Stage on the game's page loads.
 *
 * The reach-in is this scene's own prop, made the kit's way (cabinet.ts, a `CustomSpec`): bevelled boxes and rods from shape.ts, in the
 * palette's tones, merged and baked with the room in the one static set. Its pans are one instanced draw, each in its slot for its whole
 * life: a pan never moves, and changes state where it sits (its mise, and a kit's tape). The pan's own occlusion is baked once on the pan.
 * A kit pan's tape is the kit's masking tape (SheetInstances); the pin on it, the reach-in's own torn strip and the mise are drawn from one
 * atlas. A pan's mise is food heaped in the pan, the food of its memory role, toned from that role's colour: each piece lit round its top
 * with the tubes' glint on it and darker between the pieces, on a mound whose crown takes the room's light and whose foot is in the pan's
 * shadow.
 *
 * The room falls into a haze of shaded steel with its distance and its height, and the reach-in, the pass and their paper stay clear of it.
 *
 * One moment carries the game, when a decision hangs a ticket: it is carried over the rack to its clip on the line's rail, its twine, one
 * string per station, reaches across the reach-in to the pans it holds, and the head pan fans into the layers it serves: thin steel
 * trays, one for each layer of its station, rise out of it and splay round its back edge toward the expo, each holding its layer's mise,
 * the padding layers last and empty, and the station's glyph on a strip of tape in the top one, on the settle duration. Between decisions the kitchen
 * is still; under reduced motion every change cuts. The heat lamps hang low over the pass on short stems from a bar across it (cabinet.ts),
 * and burn only while the present lies there,
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
 * The heat lamps' light over the pass, as a share of the kit's at T1 and from T2 [estimated], and each lamp's pool on the pass along it and
 * across it, in metres: the steel round the waiting tickets warmed, and the paper lying in it white, as it lies over the light. At T1 the
 * kit adds the light once, after the tone curve, where the kit's share left the steel round the tickets cold on a phone (finish review,
 * W1b round 1), so it takes more of it there.
 */
const LAMP_POWER = [1.1, 0.45] as const
const POOL = [0.26, 0.2] as const
/**
 * The fan [estimated]: how far it splays in all, and how far the top tray's front lifts, in radians; the height of each tray over the one
 * under it, how deep a tray is as a share of a pan, and how far the trays rise from where they wait, under the head pan's mise, to the
 * bottom one's rest on its rim.
 */
const FAN = { spread: 1.6, tilt: 0.25, rise: 0.009, depth: 0.08, lift: 0.038 } as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* The haze and the paper: patches to the kit's shaders, this scene's own                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A shader as a material's `onBeforeCompile` hands it over. */
interface Shader {
  vertexShader: string
  fragmentShader: string
}

/**
 * The room's haze [estimated] (finish review, W1b round 1): the scene's fog of shaded steel, from a little in front of the camera's focus to
 * far past it (`HAZE`), lifts the room toward it and softens it with its distance, so the floor and the tile fall away into it toward the
 * back; and the air over the line gathers it with height, to `HAZE.high` of it between `from` and `to` metres up, so the tile over the
 * line, the hood and the lamps' rods fall into it too. On the steel the fog reaches only what stands past `side` of the reach-in's middle,
 * the line and its stove; the paper, the mise, the twine, the tape and the lamp's rings take none. So the reach-in, the pass and the rail
 * stay clear at every depth, and the room behind them recedes. A part is placed by its model matrix alone, so an instanced part of the
 * steel (a pan, a fan's tray, a clip) is judged in its own small frame, which keeps it clear as the reach-in it belongs to.
 */
const HAZE = { near: -0.1, far: 2.6, high: 0.7 } as const
const haze = (from: string, to: string, side: string) => (shader: Shader) => {
  shader.vertexShader = shader.vertexShader.replace('#include <fog_pars_vertex>', '$&\nvarying vec3 vRoom;').replace('#include <fog_vertex>', '$&\nvRoom=(modelMatrix*vec4(transformed,1)).xyz;')
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <fog_pars_fragment>', '$&\nvarying vec3 vRoom;')
    .replace('#include <fog_fragment>', `#ifdef USE_FOG\ngl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,max(smoothstep(fogNear,fogFar,vFogDepth)*step(${side},abs(vRoom.x)),${HAZE.high}*smoothstep(${from},${to},vRoom.y)));\n#endif`)
}
/** The steel's haze, over the overshelf and past the reach-in's sides; the tile's, over the line's worktops and everywhere along the wall. */
const METAL_HAZE = haze('1.45', '2.3', '0.99')
const TILE_HAZE = haze('0.95', '2.2', '0.0')

/**
 * The paper on the rail and on the pass [estimated] (finish reviews, W1b rounds 1 and 2): a tooth of fibres in its shading, two mottles
 * coarse and strong enough to show on a ticket 50 px tall. A hung ticket's clip pinches it: its top corners pulled forward and down round
 * the ball that grips it (`pinch`, falling away over `grip`, the top 35% of the sheet), the light on it turned with them, a crease down
 * from the clip, and the ball's shadow where it grips. A hung ticket is a thick slip, its back pushed `pinch * 0.45` behind its face
 * (10 mm at the scene's scale, many times a real sheet), turned on its clip (scene-layout.ts), so its cut edge stands to the room as a lit
 * strip of thickness, its edges 1.6 times as bright as its face, where a drawn outline stood before. A ticket lying on the pass is not
 * pinched or thickened: a hung one's face looks into the room, a lying one's up. The ticket is the kit's, before its scale: 80 by 120 mm,
 * hanging from the middle of its top edge and curled 0.24 of its length (the back lies 1 mm behind the face, which the curl and the cup
 * across set: z = 0.0288 t² + 11.25 t x², t down the sheet), its face's uv over the sheet and a single uv on its back and edges.
 */
function paper(shader: Shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '$&\nvarying vec4 vPaper;')
    .replace(
      '#include <beginnormal_vertex>',
      `$&
float pinch=0.,t=-position.y/.12,back=step(position.z,.0288*t*t+11.25*t*position.x*position.x-5e-4);
#ifdef USE_INSTANCING
pinch=.012*(1.-smoothstep(.6,.85,normalize(instanceMatrix[2].xyz).y));
#endif
float grip=max(0.,1.+position.y/.042);
objectNormal.xy-=pinch*vec2(grip*grip*sign(position.x)/.04,grip*abs(position.x)/.00084)*objectNormal.z;
vPaper=vec4(uv,pinch/.012,step(abs(objectNormal.z),.5));`,
    )
    .replace('#include <begin_vertex>', '$&\ntransformed.zy+=pinch*grip*grip*abs(position.x)/.04*vec2(1,-.6);\ntransformed.z-=back*pinch*.45;')
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `$&
varying vec4 vPaper;
float tooth(vec2 p){vec2 i=floor(p),f=fract(p),k=vec2(127.1,311.7);vec4 h=fract(sin(vec4(dot(i,k),dot(i+vec2(1,0),k),dot(i+vec2(0,1),k),dot(i+1.,k)))*43758.5);f*=f*(3.-2.*f);return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);}`,
    )
    .replace(
      '#include <map_fragment>',
      `$&
vec2 pin=vPaper.xy-vec2(.5,1);
diffuseColor.rgb*=(.8+.15*tooth(vPaper.xy*vec2(5,8))+.1*tooth(vPaper.xy*vec2(13,19)))*(1.+.6*vPaper.w)*(1.-vPaper.z*(.24*(1.-smoothstep(0.,.07,abs(pin.x)))*smoothstep(-.4,0.,pin.y)+.45*(1.-smoothstep(0.,.14,length(pin*vec2(1,1.5))))));`,
    )
}

/** Runs `extra` after the shader patch a material already has, once a material. */
function patch(material: Material, key: string, extra: (shader: Shader) => void) {
  if (material.customProgramCacheKey() === key) return
  const own = material.onBeforeCompile.bind(material)
  material.onBeforeCompile = (shader, renderer) => {
    own(shader, renderer)
    extra(shader)
  }
  material.customProgramCacheKey = () => key
  material.needsUpdate = true
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The pans and what lies on them                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Butcher's twine along `points`, round a smooth curve through them, in jute's tan (the tape's, darkened, so it reads on the mise), painted
 * as a tone would be, for a colour no tone has.
 */
const twine = (points: readonly Vec3[], color: Color): BufferGeometry => painted({ geometry: tube(points, 0.0028, 5), surface: 'ceramic', color, finish: [4, 0, 0] })

/** Where cell `cell` of the atlas starts, as an instance's `aCell`: a quarter of the atlas each way. */
const cellAt = (cell: number): [number, number] => [(cell % 4) / 4, 0.75 - (cell >> 2) / 4]

/**
 * Each memory role's food [estimated]: how many pieces, their radius in px, how squashed they are, whether each is a ring, how far its
 * role's colour goes toward ink (or, below 0, toward paper) at a piece's lit top, in its body, and in the gaps between the pieces, and
 * how far a piece may be cooked toward the kit's brown, each piece its own share of it. Dark blueberries under their dusty bloom for a
 * held pan; corn kernels for a cached one, cooked to an uneven gold rather than the board's yellow (finish review, W1b round 2); green
 * scallion rings for shared mise; a recipe kit's sauce with a few bubbles in it. A whole piece carries the tubes' glint on its top.
 */
const FOODS = [
  ['used', 30, 10, 1, 0, -0.3, 0.6, 0.94, 0],
  ['cached', 46, 8.5, 0.74, 0, -0.45, 0.1, 0.85, 0.9],
  ['shared', 40, 8, 1, 1, -0.5, 0.2, 0.55, 0],
  ['adapter', 7, 4, 1, 1, -0.4, 0.38, 0.5, 0],
] as const

/**
 * The atlas, 4 × 4 cells of 128 × 64 px (scene-layout.ts's CELL and FOOD), drawn once from the roles. First masking tape, torn at both
 * ends: under each station's marker glyph (a full-attention station's circle, a sliding window's square, a state station's hexagon,
 * filled, as the 2D key draws them), for the tape in the head pan's fan, and the reach-in's own strip, with its name in a marker scrawl
 * that nobody needs to read. Then a kit's pin, stroked from the 2D icon's own path on its 24-unit grid (Glyph.tsx), which lies on the
 * kit's own tape, and a dumped pan's hollow well in its role's red. Then the mise of each memory role, as food in its role's colour, each
 * piece lit round its top, and darker at the edge, where it meets the pan's wall.
 */
function atlas(tokens: SceneTokens): CanvasTexture<OffscreenCanvas> {
  const g = new OffscreenCanvas(512, 256).getContext('2d') as OffscreenCanvasRenderingContext2D
  const { colors } = tokens
  const role = (name: ColorRoleName) => roleColor(tokens, name)
  /** A colour taken `t` of the way toward ink, or `-t` of the way toward paper, in linear light. */
  const shade = (color: Color, t: number) => color.clone().lerp(role(t < 0 ? 'paper' : 'tape-ink'), Math.abs(t)).getStyle()
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
  FOODS.forEach(([state, n, r, squash, ring, light, body, gap, toast], f) => {
    const x = f * 128
    const base = role(`memory-${state}`)
    const brown = role('memory-adapter')
    g.fillStyle = shade(base.clone().lerp(brown, toast / 2), gap)
    g.fillRect(x, 128, 128, 64)
    g.lineWidth = r / 2
    for (let i = 0; i < n; i++) {
      // Each piece cooked its own way toward the brown, so a toasted food is uneven.
      const tone = base.clone().lerp(brown, toast * ((i * 0.618) % 1))
      g.setTransform(1, 0, 0, squash, x + 10 + 108 * ((0.5 + i * 0.7548777) % 1), 138 + 44 * ((0.5 + i * 0.5698403) % 1))
      // Lit round its own top, so a pan turned end for end is lit as its neighbours are: the light that picks a side is the room's.
      const lit = g.createRadialGradient(0, 0, r / 9, 0, 0, r)
      lit.addColorStop(0, shade(tone, light))
      lit.addColorStop(0.55, shade(tone, body))
      lit.addColorStop(1, shade(tone, Math.min(0.95, body + 0.3)))
      g.fillStyle = g.strokeStyle = lit
      g.beginPath()
      g.arc(0, 0, r, 0, 7)
      if (ring) g.stroke()
      else {
        g.fill()
        g.fillStyle = shade(tone, -0.85)
        g.beginPath()
        g.arc(-r / 4, -r / 4, r / 4, 0, 7)
        g.fill()
      }
    }
    g.resetTransform()
    // The meniscus: where the food climbs the pan's wall, in its own shade, a dark rim round the fill.
    g.strokeStyle = shade(base, 0.8)
    g.lineWidth = 8
    g.strokeRect(x + 4, 132, 120, 56)
  })
  const texture = new CanvasTexture(g.canvas)
  texture.colorSpace = 'srgb'
  return texture
}

/** Each instance takes its own cell of the atlas (its `aCell`): the material always has the atlas for its map. */
const cells = (shader: Shader) => {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '$&\nattribute vec2 aCell;').replace('#include <uv_vertex>', '$&\nvMapUv = vMapUv * 0.25 + aCell;')
}

/** A geometry with room for an atlas cell per instance. */
const celled = (geometry: BufferGeometry): BufferGeometry => geometry.setAttribute('aCell', new InstancedBufferAttribute(new Float32Array(MOST * 2), 2))

/**
 * A pan's mise, at its rest below the rim: heaped over its middle into a dome, and drawn up the pan's walls at its edge, a meniscus, with
 * its cell of the atlas laid along the pan. Its slopes turn to the tubes, so the side toward them is lit and the far side shaded, and its
 * crown takes the room's light whole while its foot is in the pan's shadow, 0.4 as bright where it meets the wall [estimated]: the mound
 * and its dark rim read at the front shot's distance (finish review, W1b round 2), where a flat-topped heap drew a flat fill.
 */
function miseGeometry(): BufferGeometry {
  const w = PAN.w - 0.02
  const d = PAN.d - 0.02
  const geometry = cap(roundedRectPath(w, d, 0.012, 3, 1), 0, true, 8)
  const position = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  const light = new Float32Array(position.count * 3)
  for (let i = 0; i < position.count; i++) {
    const s = 2 * Math.max(Math.abs(position.getX(i) / w), Math.abs(position.getZ(i) / d))
    position.setY(i, MISE.heap * (1 - s * s) + 0.004 * s ** 12)
    uv.setXY(i, position.getZ(i) / d + 0.5, position.getX(i) / w + 0.5)
    light.fill(1 - 0.6 * s * s, i * 3, i * 3 + 3)
  }
  geometry.setAttribute('color', new BufferAttribute(light, 3))
  geometry.computeVertexNormals()
  return celled(geometry)
}

/** The pans and everything on them, made once for a palette: one geometry each, and the atlas's materials. */
function partsOf(palette: ReturnType<typeof useProps>['palette'], tokens: SceneTokens) {
  // The kit's own hotel pan, its 1/3 drawn down to a 1/9 across, and its rim at the top's level.
  const pan = merged(panGeometries('1/3', PAN.h).map((g) => painted(palette.part(g.rotateY(Math.PI / 2).scale(PAN.w / 0.176, 1, PAN.d / 0.325).translate(0, -PAN.h, 0), 'steel')))) as BufferGeometry
  // The pan's own occlusion, baked once: the foot of its walls and the corners of its floor, dull where the room cannot reach.
  const [shade] = bakeOcclusion([pan], { radius: 0.05, voxel: 0.004, strength: 0.6 })
  const tint = pan.getAttribute('color')
  for (let i = 0; i < tint.count; i++) tint.setXYZ(i, tint.getX(i) * shade[i], tint.getY(i) * shade[i], tint.getZ(i) * shade[i])
  const map = atlas(tokens)
  // The food is shaded in its own drawing and by its mound, glossy enough that the tubes glint on its shoulders; tape and marker are
  // matte. Everything cuts out where its cell is empty, and neither they nor the twine take the haze.
  const food = new MeshStandardMaterial({ map, vertexColors: true, roughness: 0.28, alphaTest: 0.5, fog: false })
  const marks = new MeshStandardMaterial({ map, roughness: 0.8, alphaTest: 0.5, fog: false })
  const cord = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, fog: false })
  food.onBeforeCompile = marks.onBeforeCompile = cells
  const parts = {
    pan,
    mise: miseGeometry(),
    slices: miseGeometry(),
    marker: celled(new PlaneGeometry()),
    ring: tube(roundedRectPath(PAN.w + 0.008, PAN.d + 0.008, 0.016, 4, 1).points.map(([x, z]) => [x, 0, z]), 0.0026, 6, undefined, true),
  }
  return { ...parts, food, marks, cord, dispose: () => [...Object.values(parts), food, marks, cord, map].forEach((item) => item.dispose()) }
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
  // The tile takes the haze with the steel; the paper takes its tooth and its pinch, and it, the tape and the lamp's rings take no haze.
  useLayoutEffect(() => {
    patch(materials.tile, 'es-pool-tile', TILE_HAZE)
    patch(materials.ticket, 'es-pool-ticket', paper)
    for (const material of [materials.ticket, kit.materials.tape, kit.materials.lamp]) {
      material.fog = false
      material.needsUpdate = true
    }
    kit.invalidate()
  }, [materials, kit])
  const power = LAMP_POWER[kit.tier < 2 ? 0 : 1]
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
        mise.setMatrixAt(k, place(rim - PAN.h * FAN.depth + 0.001, 0.8, 0.25, 0.8))
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
      <LampLights lamps={night.lit ? r.lamps : []} power={power} spread={POOL} />
      {/* The tickets, and the clips that grip them, larger than the kit's and curled: the moment's paper reads across the reach-in. */}
      <RailClips at={r.rail} clips={r.clips} scale={TICKET.scale} />
      <Tickets tickets={night.tickets} scale={TICKET.scale} curl={TICKET.curl} />
      <Instances geometry={parts.pan} material={materials.metal} places={pans} />
      <Instances geometry={parts.mise} material={parts.food} places={night.fills} />
      <SheetInstances kind="tape" sheets={night.sheets} />
      <Instances geometry={parts.marker} material={parts.marks} places={night.tapes} />
      <Instances geometry={parts.ring} material={kit.materials.lamp} places={night.rings} />
      {[...kits, ...geometries].map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={parts.cord} />
      ))}
      <instancedMesh ref={trays} args={[parts.pan, materials.metal, 16]} frustumCulled={false} />
      <instancedMesh ref={fanned} args={[parts.slices, parts.food, 32]} frustumCulled={false} />
    </>
  )
}

export default function Scene3D({ view, preset, station, chosen }: Scene3DProps) {
  const pages = view.pans.length
  const r = useMemo(() => reachInOf(pages, view.cap), [pages, view.cap])
  const items = useMemo((): PropSpec[] => [...r.items, { kind: 'custom', id: 'reach-in', at: [0, 0, -r.depth / 2], build: (m) => cabinet(m, r) }, { kind: 'custom', id: 'lamp-bar', at: [0, PASS.top, LAMP.z], build: lampBar }], [r])
  const night = useMemo(() => nightOf(view, r, { station: preset === 'station' ? station : null, chosen }), [view, r, preset, station, chosen])
  return (
    <SceneCanvas fog={{ near: HAZE.near, far: HAZE.far, color: 'surface-2' }} environment="tubes" environmentIntensity={0.55}>
      <CameraRig presets={r.presets} preset={preset} parallax={0.04} />
      <Fluorescent />
      <Kitchen lit={night.lit ? ALWAYS_LIT : ALWAYS_LIT & ~(1 << CHANNEL.lamp)} metal={METAL_HAZE}>
        <Reach r={r} items={items} night={night} />
      </Kitchen>
    </SceneCanvas>
  )
}
