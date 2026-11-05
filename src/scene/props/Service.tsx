import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BufferGeometry, Color, CylinderGeometry, InstancedBufferAttribute, Matrix4, PlaneGeometry, SpotLight, Vector3, type InstancedMesh, type Mesh, type MeshPhysicalMaterial, type ShaderMaterial } from 'three'
import { useKit } from '../kit'
import type { Footprint } from './build'
import { roomFor, useProps } from './context'
import { progress, useMotionLoop } from './motion'
import { bakeOcclusion } from './occlusion'
import { plateProfile } from './build'
import { lathe, painted, type Vec2, type Vec3 } from './shape'
import { PLATE } from './specs'

/*
 * Service on the pass (scene kit v1): the plates that slide down it, the bell that strikes the step, the heat lamps' light and the
 * steam over a lit station. All of it moves on the bell, on DESIGN.md's durations, and holds frames only while it moves:
 *
 *   Plates      lathe-turned glazed plates, instanced; a plate slides from where it enters to its place and comes to rest on the
 *               settle curve, an exponential ease-out, and its contact shadow slides with it.
 *   ServiceBell the bell's chrome dome and plunger: a strike drops the plunger and rings the dome on the bell duration and the strike
 *               curve, with an amber flash on the dome; never more than one flash in 333 ms, so it cannot flash above 3 Hz (WCAG
 *               2.3.1).
 *   LampLights  the heat lamps' warm spots, casting soft shadow maps from T2 where the scene asked, and the soft cone of light under
 *               each at T2.
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

export function Plates({ plates, name = 'plates' }: { plates: readonly PlatePlace[]; name?: string }) {
  const kit = useKit()
  const { materials, palette, shadows } = useProps()
  const geometry = useMemo(() => {
    const plate = painted(palette.part(lathe(plateProfile(), 40), 'ceramic'))
    // The plate's own occlusion: the foot ring and the well's edge, baked once.
    const [shade] = bakeOcclusion([plate], { radius: 0.015, voxel: 0.004, strength: 0.22 })
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
        instanced.setMatrixAt(i, matrix.makeTranslation(scratch.x, scratch.y, scratch.z))
        // A plate on the pass drags its contact shadow along; one lifted away to the expo has none.
        if (!plate.leaving) shadows.move(owner, grounded++, scratch.x, scratch.z)
        i += 1
      }
      if (instanced.count !== i) {
        instanced.count = i
        shadows.set(owner, footprintsOf(shown.current))
      }
      instanced.instanceMatrix.needsUpdate = true
      return moving
    },
    [ease, reducedMotion, settleMs, scratch, shadows, owner],
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
    shadows.set(owner, footprintsOf(next))
    if (mesh.current) mesh.current.count = next.size
    if (write(now)) wake()
    kit.invalidate()
  }, [plates, kit, ease, reducedMotion, settleMs, shadows, owner, wake, write])
  useEffect(() => () => shadows.remove(owner), [shadows, owner])

  const cast = kit.shadowLights > 0
  return <instancedMesh ref={mesh} name={name} args={[geometry, materials.ceramic, capacity]} castShadow={cast} receiveShadow={cast} frustumCulled={false} raycast={() => null} />
}

function footprintsOf(shown: ReadonlyMap<string, PlateShown>): Footprint[] {
  return [...shown.values()].filter((plate) => !plate.leaving).map((plate) => ({ center: [plate.at.x, plate.at.y, plate.at.z], size: [PLATE.radius * 1.7, PLATE.radius * 1.7], radius: PLATE.radius * 0.85, soft: 0.03, strength: 0.85, yaw: 0 }))
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The bell                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The dome's profile and the plunger's, turned: the base is the static set's (`bell-base`). */
const DOME: readonly Vec2[] = [
  [0, 0.026],
  [0.0418, 0.026],
  [0.0432, 0.0272],
  [0.0428, 0.031],
  [0.04, 0.039],
  [0.034, 0.049],
  [0.025, 0.0565],
  [0.014, 0.0612],
  [0.004, 0.063],
  [0, 0.063],
]
const PLUNGER: readonly Vec2[] = [
  [0, 0.06],
  [0.0026, 0.06],
  [0.0026, 0.07],
  [0.0058, 0.0712],
  [0.0068, 0.0745],
  [0.0058, 0.0778],
  [0, 0.079],
]
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
      <mesh ref={domeMesh} geometry={dome} material={flash} castShadow={cast} receiveShadow={cast} raycast={() => null} />
      <mesh ref={plungerMesh} geometry={plunger} material={materials.metal} castShadow={cast} raycast={() => null} />
    </group>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The heat lamps' light                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A heat lamp's light: where it leaves the shade (the bulb's face) and where it falls. */
export interface LampLight {
  readonly id: string
  readonly at: Vec3
  readonly target: Vec3
}

/** The cone's top radius as a share of its foot's: it starts at the shade's mouth [estimated]. */
const CONE_TOP = 0.34

export function LampLights({ lamps, power = 1, cones = true, name = 'lamp-lights' }: { lamps: readonly LampLight[]; power?: number; cones?: boolean; name?: string }) {
  const kit = useKit()
  const { materials } = useProps()
  const params = kit.tokens.materials.propParams.lamp
  const color = kit.tokens.colors.lamp
  const shadowLights = kit.shadowLights
  const lights = useMemo(
    () =>
      lamps.map((lamp, i) => {
        const light = new SpotLight(new Color(color), params.intensity * power, params.distance, params.angle, params.penumbra, params.decay)
        light.name = `lamp-light-${lamp.id}`
        light.position.set(...lamp.at)
        light.target.position.set(...lamp.target)
        light.castShadow = i < shadowLights
        if (light.castShadow) {
          light.shadow.mapSize.set(params.shadowMap, params.shadowMap)
          light.shadow.radius = params.shadowRadius
          light.shadow.bias = -0.0004
          light.shadow.normalBias = 0.012
          light.shadow.camera.near = 0.03
          light.shadow.camera.far = params.distance
        }
        return light
      }),
    [lamps, color, params, power, shadowLights],
  )
  useEffect(
    () => () => {
      for (const light of lights) light.dispose()
    },
    [lights],
  )
  const showCones = cones && kit.tier >= 2
  const coneGeometry = useMemo(() => new CylinderGeometry(CONE_TOP, 1, 1, 36, 1, true).translate(0, -0.5, 0), [])
  useEffect(() => () => coneGeometry.dispose(), [coneGeometry])
  const coneMesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const instanced = coneMesh.current
    if (!instanced) return
    const from = new Vector3()
    const to = new Vector3()
    lamps.forEach((lamp, i) => {
      from.set(...lamp.at)
      to.set(...lamp.target)
      const height = from.distanceTo(to)
      const radius = height * Math.tan(params.angle * 0.8)
      instanced.setMatrixAt(i, matrix.makeScale(radius, height, radius).setPosition(from))
    })
    instanced.count = lamps.length
    instanced.instanceMatrix.needsUpdate = true
    instanced.computeBoundingSphere()
    kit.invalidate()
  }, [lamps, params, kit, showCones])

  return (
    <group name={name}>
      {lights.map((light) => (
        <group key={light.name}>
          <primitive object={light} />
          <primitive object={light.target} />
        </group>
      ))}
      {showCones ? <instancedMesh ref={coneMesh} name="lamp-cones" args={[coneGeometry, materials.cone, Math.max(1, lamps.length)]} renderOrder={2} raycast={() => null} /> : null}
    </group>
  )
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
