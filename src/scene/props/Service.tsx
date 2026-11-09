import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  InstancedBufferAttribute,
  Matrix4,
  PlaneGeometry,
  Vector3,
  type Camera,
  type InstancedMesh,
  type Material,
  type Mesh,
  type MeshPhysicalMaterial,
  type Scene,
  type ShaderMaterial,
  type WebGLRenderer,
} from 'three'
import { useKit } from '../kit'
import type { Footprint } from './build'
import { roomFor, useProps } from './context'
import { progress, useMotionLoop } from './motion'
import { bakeOcclusion } from './occlusion'
import { PLATE_SHADOWS, plateFootprints, plateProfile } from './build'
import { lathe, painted, type Vec2, type Vec3 } from './shape'
import { PLATE } from './specs'

/*
 * Service on the pass (scene kit v1): the plates that slide down it, the bell that strikes the step, the heat lamps' light and the
 * steam over a lit station. All of it moves on the bell, on DESIGN.md's durations, and holds frames only while it moves:
 *
 *   Plates      lathe-turned glazed plates, instanced; a plate slides from where it enters to its place and comes to rest on the
 *               settle curve, an exponential ease-out, and its contact shadow slides with it: a dark ring where its rim meets the
 *               steel and a soft shade past it, over the underside's own occlusion against the counter, baked once.
 *   ServiceBell the bell's chrome dome and plunger, turned in the chrome finish and mirroring the kit's room as polished metal does:
 *               a strike drops the plunger and rings the dome on the bell duration and the strike curve, with an amber flash on the
 *               dome; never more than one flash in 333 ms, so it cannot flash above 3 Hz (WCAG 2.3.1).
 *   LampLights  the heat lamps' light at every tier, with no spot light: a cone of warm haze under each lamp and the edgeless pool where
 *               it lands on the steel, brightening what lies there.
 *   Steam       a few soft puffs rising off each lit station when a fire lands, at T2 only, and never under reduced motion.
 */

/* ------------------------------------------------------------------------------------------------------------------ */
/* Plates                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A plate's place on the pass: where it comes to rest, where it slides in from, and where it slides off to when it leaves. */
export interface PlatePlace {
  readonly id: string
  readonly at: Vec3
  readonly enter?: Vec3
  readonly leave?: Vec3
}

interface PlateShown {
  at: Vector3
  from: Vector3
  start: number
  leaving: boolean
}

const matrix = new Matrix4()

/** The plates on the pass: dinner plates, or `scale` of one, smaller plates for a longer rail. */
export function Plates({ plates, scale = 1, name = 'plates' }: { plates: readonly PlatePlace[]; scale?: number; name?: string }) {
  const kit = useKit()
  const { materials, palette, shadows } = useProps()
  const geometry = useMemo(() => {
    const plate = painted(palette.part(lathe(plateProfile(), 40), 'ceramic'))
    // The plate's occlusion, baked once with the counter under it: the foot ring, the well's edge under the rim, and the rim's
    // underside, which the steel a finger's width below hides from the room. The counter only hides; its own shade is not kept.
    const counter = new CircleGeometry(PLATE.radius * 1.4, 32).rotateX(-Math.PI / 2)
    const [shade] = bakeOcclusion([plate, counter], { radius: 0.026, voxel: 0.004, strength: 0.55 }, [true, false])
    counter.dispose()
    const color = plate.getAttribute('color')
    for (let i = 0; i < color.count; i++) color.setXYZ(i, color.getX(i) * shade[i], color.getY(i) * shade[i], color.getZ(i) * shade[i])
    return plate
  }, [palette])
  useEffect(() => () => geometry.dispose(), [geometry])
  const capacity = roomFor(plates.length + 8)
  const mesh = useRef<InstancedMesh>(null)
  const shown = useRef(new Map<string, PlateShown>())
  const owner = `plates:${name}`
  const scratch = useMemo(() => new Vector3(), [])
  // Where each plate of the last list was to go when it leaves: a plate gone from the list slides off there.
  const leaves = useRef(new Map<string, Vec3 | undefined>())

  const { ease, reducedMotion } = kit
  const settleMs = kit.tokens.motion.settleMs
  const write = useCallback(
    (now: number): boolean => {
      const instanced = mesh.current
      if (!instanced) return false
      let moving = false
      let i = 0
      let grounded = 0
      for (const [id, plate] of shown.current) {
        const t = reducedMotion ? 1 : progress(now, plate.start, settleMs)
        if (t >= 1 && plate.leaving) {
          shown.current.delete(id)
          continue
        }
        if (t < 1) moving = true
        scratch.lerpVectors(plate.from, plate.at, ease(t))
        instanced.setMatrixAt(i, matrix.makeScale(scale, scale, scale).setPosition(scratch))
        // A plate on the pass drags its contact shadow along, both parts of it; one lifted away to the expo has none.
        if (!plate.leaving) {
          for (let part = 0; part < SHADOW_PARTS; part++) shadows.move(owner, grounded * SHADOW_PARTS + part, scratch.x, scratch.z)
          grounded += 1
        }
        i += 1
      }
      if (instanced.count !== i) {
        instanced.count = i
        shadows.set(owner, footprintsOf(shown.current, scale))
      }
      instanced.instanceMatrix.needsUpdate = true
      return moving
    },
    [ease, reducedMotion, settleMs, scratch, shadows, owner, scale],
  )
  const wake = useMotionLoop(write)

  useLayoutEffect(() => {
    const now = performance.now()
    const motion = !reducedMotion && settleMs > 0
    const next = new Map<string, PlateShown>()
    const wanted = new Set(plates.map((plate) => plate.id))
    for (const plate of plates) {
      const was = shown.current.get(plate.id)
      const at = new Vector3(...plate.at)
      if (was && !was.leaving) {
        if (was.at.distanceTo(at) > 1e-5 && motion) {
          const from = new Vector3().lerpVectors(was.from, was.at, ease(progress(now, was.start, settleMs)))
          next.set(plate.id, { at, from, start: now, leaving: false })
        } else next.set(plate.id, { ...was, at })
      } else if (plate.enter && motion) next.set(plate.id, { at, from: new Vector3(...plate.enter), start: now, leaving: false })
      else next.set(plate.id, { at, from: at.clone(), start: -Infinity, leaving: false })
    }
    // A plate that left slides off to where it was going, then goes; one already on its way keeps going.
    for (const [id, was] of shown.current) {
      if (wanted.has(id)) continue
      if (was.leaving) {
        if (motion && progress(now, was.start, settleMs) < 1) next.set(id, was)
        continue
      }
      const leave = leaves.current.get(id)
      if (!leave || !motion) continue
      const from = new Vector3().lerpVectors(was.from, was.at, ease(progress(now, was.start, settleMs)))
      next.set(id, { at: new Vector3(...leave), from, start: now, leaving: true })
    }
    leaves.current = new Map(plates.map((plate) => [plate.id, plate.leave]))
    shown.current = next
    shadows.set(owner, footprintsOf(next, scale))
    if (mesh.current) mesh.current.count = next.size
    if (write(now)) wake()
    kit.invalidate()
  }, [plates, kit, ease, reducedMotion, settleMs, shadows, owner, wake, write, scale])
  useEffect(() => () => shadows.remove(owner), [shadows, owner])

  const cast = kit.shadowLights > 0
  return <instancedMesh ref={mesh} name={name} args={[geometry, materials.ceramic, capacity]} castShadow={cast} receiveShadow={cast} frustumCulled={false} raycast={() => null} />
}

/** Each plate on the pass drags both parts of its contact shadow (build.ts's PLATE_SHADOWS). */
const SHADOW_PARTS = PLATE_SHADOWS.length

function footprintsOf(shown: ReadonlyMap<string, PlateShown>, scale: number): Footprint[] {
  return [...shown.values()].filter((plate) => !plate.leaving).flatMap((plate) => plateFootprints([plate.at.x, plate.at.y, plate.at.z], scale))
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The bell                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The dome's profile and the plunger's, turned (the base is the static set's `bell-base`) [estimated]: a dome with a rolled lip, round as a
 * quarter of an ellipse nearly as tall as it is wide, so it shows the camera a curve from the tubes overhead down to the counter, and
 * narrower than the base by a finger's width all round, so the base's deep steel rings its foot; on its crown the plunger's knob.
 */
const DOME: readonly Vec2[] = [
  [0, 0.026],
  [0.0345, 0.026],
  [0.0362, 0.0266],
  [0.0365, 0.0279],
  [0.0359, 0.0337],
  [0.0343, 0.0394],
  [0.0316, 0.0447],
  [0.0258, 0.0517],
  [0.0183, 0.057],
  [0.0113, 0.0599],
  [0.0051, 0.0612],
  [0, 0.0615],
]
const PLUNGER: readonly Vec2[] = [
  [0, 0.058],
  [0.0026, 0.058],
  [0.0026, 0.0672],
  [0.0065, 0.068],
  [0.0078, 0.0715],
  [0.0065, 0.075],
  [0, 0.0758],
]
/**
 * How much brighter than brushed steel the bell's chrome mirrors the kit's room [estimated]. The room is a dim box with the tubes in it
 * (src/scene/environment.ts): brushed steel blurs it into a bright sheen, and a polished dome mirrors its dim walls sharply, which drew
 * the dome as a dark puck with an emblem (W1b's finish review of the lesson blocks, round 1). On a lit pass a chrome dome mirrors the
 * lit counter and tile round it, which the box leaves out, so it takes the room this much brighter: the tubes' streaks white, the room
 * light, and the floor a dark band at its foot, over the base's deep steel.
 */
const CHROME_ROOM = 2.4

/**
 * Points a chrome part's own material at the kit's room, mirrored at CHROME_ROOM: three takes a material's own strength of reflection
 * only when the material names its reflection map. Each part calls it before it is drawn, when the kit has put the room in the scene.
 */
function mirrorRoom(_renderer: WebGLRenderer, scene: Scene, _camera: Camera, _geometry: BufferGeometry, material: Material) {
  const chrome = material as MeshPhysicalMaterial
  // A pass that draws the scene in a material of its own leaves it alone.
  if (!chrome.isMeshPhysicalMaterial || chrome.envMap === scene.environment) return
  chrome.envMap = scene.environment
  chrome.envMapIntensity = scene.environmentIntensity * CHROME_ROOM
  chrome.needsUpdate = true
}
/** How far the plunger drops on a strike, and how far the dome swings as it rings, at most [estimated]. */
const STRIKE = { drop: 0.005, swing: 0.045, rings: 3.5 } as const
/** The fewest milliseconds between two flashes: 3 per second at most (WCAG 2.3.1). */
const FLASH_GAP_MS = 334

export function ServiceBell({ at, strike, name = 'bell' }: { at: Vec3; strike: number; name?: string }) {
  const kit = useKit()
  const { materials, palette } = useProps()
  const dome = useMemo(() => painted(palette.part(lathe(DOME, 40), 'chrome')), [palette])
  const plunger = useMemo(() => painted(palette.part(lathe(PLUNGER, 16), 'chrome')), [palette])
  useEffect(
    () => () => {
      dome.dispose()
      plunger.dispose()
    },
    [dome, plunger],
  )
  const flash = useMemo(() => materials.flashMetal(), [materials])
  const domeMesh = useRef<Mesh>(null)
  const plungerMesh = useRef<Mesh>(null)
  const run = useRef({ strike, start: -Infinity, flash: false, lastFlash: -Infinity })
  const glow = kit.tokens.materials.propParams.glow.emissiveIntensity

  const { strike: curve, reducedMotion } = kit
  const bellMs = kit.tokens.motion.bellMs
  const write = useCallback(
    (now: number): boolean => {
      const t = progress(now, run.current.start, bellMs)
      const e = curve(t)
      const ring = t >= 1 ? 0 : Math.exp(-4 * t) * Math.sin(2 * Math.PI * STRIKE.rings * t) * (1 - t)
      if (plungerMesh.current) plungerMesh.current.position.y = -STRIKE.drop * (1 - e) * (t < 1 ? 1 : 0)
      if (domeMesh.current) {
        domeMesh.current.rotation.x = STRIKE.swing * ring * 0.6
        domeMesh.current.rotation.z = STRIKE.swing * ring
      }
      const material = domeMesh.current?.material as MeshPhysicalMaterial | undefined
      if (material) material.emissiveIntensity = run.current.flash && t < 1 ? glow * 0.3 * (1 - e) : 0
      return t < 1
    },
    [bellMs, curve, glow],
  )
  const wake = useMotionLoop(write)

  useLayoutEffect(() => {
    const now = performance.now()
    if (strike !== run.current.strike && !reducedMotion && bellMs > 0) {
      const flashes = now - run.current.lastFlash >= FLASH_GAP_MS
      run.current = { strike, start: now, flash: flashes, lastFlash: flashes ? now : run.current.lastFlash }
    } else run.current = { ...run.current, strike, start: -Infinity }
    if (write(now)) wake()
    kit.invalidate()
  }, [strike, reducedMotion, bellMs, kit, wake, write])

  const cast = kit.shadowLights > 0
  return (
    <group name={name} position={[...at]}>
      <mesh ref={domeMesh} geometry={dome} material={flash} castShadow={cast} receiveShadow={cast} raycast={() => null} onBeforeRender={mirrorRoom} />
      <mesh ref={plungerMesh} geometry={plunger} material={flash} castShadow={cast} raycast={() => null} onBeforeRender={mirrorRoom} />
    </group>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The heat lamps' light                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A heat lamp's light: where it leaves the shade (its mouth) and where it lands (the surface under it). */
export interface LampLight {
  readonly id: string
  readonly at: Vec3
  readonly target: Vec3
}

/**
 * A heat lamp's light as the room sees it, a unit tall from the shade's mouth (y = 0) to the surface it lands on (y = -1) and a unit wide
 * where it lands: a cone of warm haze, strongest at the mouth, inside the shade's lip at every scene's spread, and fading down the cone;
 * and the pool where the light lands, fading from its middle to nothing at its rim, so it reads as light on the steel and never as a disc.
 * uv.y is how much light (the cone's `vAlong`): the side's top ring and the pool's 40 middles are lit; the side's foot, the pool's rim and
 * the mouth's end are dark, since the shade's own bulb glows there. uv.x is 1 on the two ends, which lie flat and glow whichever way they
 * are seen (Back of House's round-2 recipe, whose lit mouth drew a hard disc under a wider shade's lip).
 */
export const LAMP_GLOW = new CylinderGeometry(0.3, 1, 1, 40).translate(0, -0.5, 0)
const glowUv = LAMP_GLOW.getAttribute('uv')
for (let i = 0; i < glowUv.count; i++) glowUv.setXY(i, i > 81 ? 1 : 0, i < 41 ? 2.3 : i > 162 && i < 203 ? 3.3 : 0)

/**
 * The pool's half-widths where a lamp's light lands, along the counter (x) and across it (z), in metres [estimated]: a counter's depth
 * across, and longer along the counter, as brushed steel spreads a lamp's light along its grain.
 */
const SPREAD = [0.34, 0.21] as const
/** How far above the surface the pool lies [estimated]: under paper lying on it, so a ticket stays white and the light falls round it. */
const LIFT = 0.0006

/**
 * The heat lamps' light, at every tier and with no spot light: under each lamp a cone of warm haze from its shade's mouth to the surface
 * its light lands on, and the edgeless pool there, in the kit's soft additive light, which brightens what lies under it and lays no colour
 * of its own. A lamp aimed off its plumb leans its cone toward where it lands, and its pool lies flat there. At T2 and up the light goes
 * through the tone curve with the frame, so it is drawn three times over; at T1 it adds to the frame after the tone curve, so it is drawn
 * once at 0.6 of its strength [estimated]. `power` scales its strength, and `spread` its pool.
 */
export function LampLights({ lamps, power = 1, spread = SPREAD, name = 'lamp-lights' }: { lamps: readonly LampLight[]; power?: number; spread?: readonly [number, number]; name?: string }) {
  const kit = useKit()
  const { materials } = useProps()
  const copies = kit.tier > 1 ? 3 : 1
  const opacity = kit.tokens.materials.propParams.cone.opacity * power * (copies > 1 ? 1 : 0.6)
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const instanced = mesh.current
    if (instanced) {
      ;(instanced.material as ShaderMaterial).uniforms.uOpacity.value = opacity
      lamps.forEach(({ at: [x, y, z], target: [tx, ty, tz] }, i) => {
        matrix.set(spread[0], x - tx, 0, x, 0, y - ty - LIFT, 0, y, 0, z - tz, spread[1], z, 0, 0, 0, 1)
        for (let k = 0; k < copies; k++) instanced.setMatrixAt(i * copies + k, matrix)
      })
      instanced.count = lamps.length * copies
      instanced.instanceMatrix.needsUpdate = true
    }
    kit.invalidate()
  }, [lamps, opacity, spread, copies, materials, kit])
  return <instancedMesh ref={mesh} name={name} args={[LAMP_GLOW, materials.cone, roomFor(lamps.length * 3)]} renderOrder={2} frustumCulled={false} raycast={() => null} />
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Steam                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The most puffs a scene draws at once, and how many each lit station sends up when a fire lands [estimated]. */
export const STEAM = { capacity: 32, perStation: 3 } as const

/**
 * Steam over the line: when `puff` changes (a fire lands), each emitter (a lit station's top) sends up a few soft puffs that rise and
 * thin over two settle durations. T2 and up only, and never under reduced motion: a phone and a reader who asked for stillness see
 * the stations' glow alone.
 */
export function Steam({ emitters, puff, name = 'steam' }: { emitters: readonly Vec3[]; puff: number; name?: string }) {
  const kit = useKit()
  const on = kit.tier >= 2 && !kit.reducedMotion && kit.tokens.motion.settleMs > 0
  return on ? <SteamPuffs emitters={emitters} puff={puff} name={name} /> : null
}

function SteamPuffs({ emitters, puff, name }: { emitters: readonly Vec3[]; puff: number; name: string }) {
  const kit = useKit()
  const { materials } = useProps()
  const geometry = useMemo(() => {
    const quad: BufferGeometry = new PlaneGeometry(1, 1)
    const puffs = new Float32Array(STEAM.capacity * 4)
    for (let i = 0; i < STEAM.capacity; i++) puffs[i * 4 + 3] = -1
    quad.setAttribute('aPuff', new InstancedBufferAttribute(puffs, 4))
    const seeds = new Float32Array(STEAM.capacity)
    for (let i = 0; i < STEAM.capacity; i++) seeds[i] = ((i * 0.618034) % 1) * 7.3
    quad.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1))
    return quad
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  const epoch = useRef(0)
  const run = useRef({ puff, until: -Infinity, next: 0 })
  const life = kit.tokens.motion.settleMs * 2
  const mesh = useRef<InstancedMesh>(null)

  const write = useCallback(
    (now: number): boolean => {
      const material = mesh.current?.material as ShaderMaterial | undefined
      if (material) {
        material.uniforms.uNow.value = now - epoch.current
        material.uniforms.uLife.value = life
      }
      return now < run.current.until
    },
    [life],
  )
  const wake = useMotionLoop(write)

  useLayoutEffect(() => {
    const now = performance.now()
    if (epoch.current === 0) epoch.current = now
    if (puff !== run.current.puff && emitters.length > 0) {
      const attribute = geometry.getAttribute('aPuff') as InstancedBufferAttribute
      let slot = run.current.next
      emitters.forEach((at, e) => {
        for (let k = 0; k < STEAM.perStation; k++) {
          const born = now - epoch.current + k * (life / 7) + e * 23
          attribute.setXYZW(slot % STEAM.capacity, at[0] + ((k % 2) - 0.5) * 0.06, at[1], at[2] + (k - 1) * 0.03, born)
          slot += 1
        }
      })
      attribute.needsUpdate = true
      run.current = { puff, until: now + life + (STEAM.perStation * life) / 7 + emitters.length * 23, next: slot % STEAM.capacity }
    } else run.current = { ...run.current, puff }
    if (write(now)) wake()
    kit.invalidate()
  }, [puff, emitters, geometry, life, kit, wake, write])

  return <instancedMesh ref={mesh} name={name} args={[geometry, materials.steam, STEAM.capacity]} renderOrder={3} frustumCulled={false} raycast={() => null} />
}
