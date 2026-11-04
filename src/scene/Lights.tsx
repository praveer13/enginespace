import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, CylinderGeometry, DirectionalLight, HemisphereLight, Matrix4, MeshStandardMaterial, SphereGeometry, SpotLight, TorusGeometry, type InstancedMesh } from 'three'
import type { Vec3 } from './camera-rig'
import { useKit } from './kit'
import { roleColor } from './materials'

/*
 * The Pass's light (TRACKER W0-T15; the contract's materials): heat lamps over the present and fluorescent tubes over
 * everything.
 *
 *   HeatLamps    warm spot lights in the lamp role, each in a glowing housing: an emissive element and the hot rim of the
 *                shade's mouth, one instanced draw for all of them, which bloom catches at T2 and up. They pool on the
 *                present alone: GAMES.md §2.6's one heat lamp. The shades themselves are steel fixtures (Fixtures.tsx).
 *   Fluorescent  the tubes' cool white: a hemisphere light from the ceiling with the steel's bounce from below, and one
 *                soft key from above and behind the camera, so the marks have a lit top and shaded sides.
 *   HeatElements a heat element for each of the line's stations: a lit one burns in the lamp's glow, emissive, so bloom
 *                catches it at T2 and up; a dark one is cold deep steel. Lit and dark are two instanced draws, whatever the count.
 *
 * Intensities start from scene-tokens.ts's MATERIAL_PARAMS [estimated]; `power` scales a scene's whole rig.
 */

export interface LampSpec {
  readonly id: string
  /** The bulb's centre. */
  readonly at: Vec3
  /** Where the light falls. */
  readonly target: Vec3
}

/**
 * MATERIAL_PARAMS' starting values, tuned on the specimen [estimated]: a cone a little tighter, so each lamp pools on the
 * pass and its amber does not run down the line.
 */
const LAMP_GAIN = 2.6
const LAMP_CONE = 0.78
const BULB_RADIUS = 0.07

/** Where the housing's mouth is, from the element's centre: the rim that glows round it [estimated, the specimen's shade]. */
export interface LampRim {
  readonly radius: number
  /** How far below the element's centre the mouth is. */
  readonly drop: number
}
const DEFAULT_RIM: LampRim = { radius: 0.185, drop: 0.05 }

/** The glowing parts of one housing as one geometry: the element, and the rim of the mouth. */
function glowGeometry(rim: LampRim): BufferGeometry {
  const element = new SphereGeometry(BULB_RADIUS, 20, 12)
  const ring = new TorusGeometry(rim.radius, 0.013, 8, 48)
  ring.rotateX(Math.PI / 2)
  ring.translate(0, -rim.drop, 0)
  const parts = [element, ring]
  const total = parts.reduce((sum, part) => sum + part.getAttribute('position').count, 0)
  const position = new Float32Array(total * 3)
  const normal = new Float32Array(total * 3)
  const uv = new Float32Array(total * 2)
  const index: number[] = []
  let offset = 0
  for (const part of parts) {
    position.set(part.getAttribute('position').array as Float32Array, offset * 3)
    normal.set(part.getAttribute('normal').array as Float32Array, offset * 3)
    uv.set(part.getAttribute('uv').array as Float32Array, offset * 2)
    const own = part.getIndex()
    if (own) for (let i = 0; i < own.count; i++) index.push(own.getX(i) + offset)
    offset += part.getAttribute('position').count
    part.dispose()
  }
  const glow = new BufferGeometry()
  glow.setAttribute('position', new BufferAttribute(position, 3))
  glow.setAttribute('normal', new BufferAttribute(normal, 3))
  glow.setAttribute('uv', new BufferAttribute(uv, 2))
  glow.setIndex(index)
  return glow
}

/** `housings: false` keeps the lamps' light and leaves out their glowing elements: for a shot that looks down through them. */
export function HeatLamps({ lamps, power = 1, rim = DEFAULT_RIM, housings = true }: { lamps: readonly LampSpec[]; power?: number; rim?: LampRim; housings?: boolean }) {
  const kit = useKit()
  const params = kit.tokens.materials.heatLamp
  const lights = useMemo(
    () =>
      lamps.map((lamp) => {
        const light = new SpotLight(roleColor(kit.tokens, 'lamp'), params.intensity * LAMP_GAIN * power, params.distance, params.angle * LAMP_CONE, params.penumbra, params.decay)
        light.position.set(...lamp.at)
        light.target.position.set(...lamp.target)
        light.name = `lamp-${lamp.id}`
        return light
      }),
    [lamps, kit.tokens, params, power],
  )
  useEffect(
    () => () => {
      for (const light of lights) light.dispose()
    },
    [lights],
  )
  const bulb = useMemo(() => glowGeometry(rim), [rim])
  useEffect(() => () => bulb.dispose(), [bulb])
  const bulbs = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const instanced = bulbs.current
    if (!instanced) return
    const matrix = new Matrix4()
    lamps.forEach((lamp, i) => instanced.setMatrixAt(i, matrix.makeTranslation(...lamp.at)))
    instanced.count = lamps.length
    instanced.instanceMatrix.needsUpdate = true
    instanced.computeBoundingSphere()
    kit.invalidate()
  }, [lamps, kit])

  return (
    <>
      {lights.map((light) => (
        <group key={light.name}>
          <primitive object={light} />
          <primitive object={light.target} />
        </group>
      ))}
      <instancedMesh ref={bulbs} name="lamp-bulbs" args={[bulb, kit.materials.lamp, Math.max(1, lamps.length)]} raycast={() => null} visible={housings} />
    </>
  )
}

/** Where the tubes' soft key comes from: above, and behind the camera's left shoulder [estimated]. */
const TUBES_FROM: Vec3 = [-3, 9, 7]

export function Fluorescent({ power = 1, from = TUBES_FROM }: { power?: number; from?: Vec3 }) {
  const kit = useKit()
  const { fluorescent } = kit.tokens.materials
  const hemisphere = useMemo(
    () => new HemisphereLight(roleColor(kit.tokens, 'light-fluorescent'), roleColor(kit.tokens, 'surface-0'), fluorescent.intensity * power),
    [kit.tokens, fluorescent.intensity, power],
  )
  const tubes = useMemo(() => {
    const light = new DirectionalLight(roleColor(kit.tokens, 'light-fluorescent'), fluorescent.intensity * 0.9 * power)
    light.position.set(...from)
    return light
  }, [kit.tokens, fluorescent.intensity, power, from])
  useEffect(
    () => () => {
      hemisphere.dispose()
      tubes.dispose()
    },
    [hemisphere, tubes],
  )
  return (
    <>
      <primitive object={hemisphere} />
      <primitive object={tubes} />
      <primitive object={tubes.target} />
    </>
  )
}

/** One station's heat element: a tube lying across the scene (x), its centre, its length and its diameter, and whether it burns. */
export interface ElementSpec {
  readonly id: string
  readonly at: Vec3
  readonly length: number
  readonly diameter: number
  readonly lit: boolean
}

function placeTubes(mesh: InstancedMesh | null, elements: readonly ElementSpec[]) {
  if (!mesh) return
  const matrix = new Matrix4()
  elements.forEach((element, i) => {
    matrix.makeScale(element.length, element.diameter, element.diameter)
    matrix.setPosition(...element.at)
    mesh.setMatrixAt(i, matrix)
  })
  mesh.count = elements.length
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
}

/**
 * Heat elements, one for each of the line's stations: a tube burning in the heat lamp's own glow when its station is lit (the kit's
 * lamp material, emissive, so bloom catches it at T2 and up) and cold deep steel when it is dark. Heat is the world's one active
 * light, so a lit station takes the lamp's amber and no code colour. The state is also a place in the row, and every count about it
 * is DOM (GAMES.md §2.6, rule 7), so the glow is never the only carrier. Lit and dark are two instanced draws, whatever the count.
 */
export function HeatElements({ elements, name = 'elements' }: { elements: readonly ElementSpec[]; name?: string }) {
  const kit = useKit()
  // A unit tube along x: one long, one across.
  const geometry = useMemo(() => new CylinderGeometry(0.5, 0.5, 1, 18, 1).rotateZ(Math.PI / 2), [])
  const cold = useMemo(() => new MeshStandardMaterial({ name: `${name}-cold`, color: roleColor(kit.tokens, 'surface-3'), roughness: 0.4, metalness: 0.6 }), [kit.tokens, name])
  useEffect(
    () => () => {
      geometry.dispose()
      cold.dispose()
    },
    [geometry, cold],
  )
  const litMesh = useRef<InstancedMesh>(null)
  const darkMesh = useRef<InstancedMesh>(null)
  const lit = useMemo(() => elements.filter((element) => element.lit), [elements])
  const unlit = useMemo(() => elements.filter((element) => !element.lit), [elements])
  useLayoutEffect(() => {
    placeTubes(litMesh.current, lit)
    placeTubes(darkMesh.current, unlit)
    kit.invalidate()
  }, [lit, unlit, kit])
  const capacity = Math.max(1, elements.length)
  return (
    <>
      <instancedMesh ref={litMesh} name={`${name}-lit`} args={[geometry, kit.materials.lamp, capacity]} raycast={() => null} />
      <instancedMesh ref={darkMesh} name={`${name}-dark`} args={[geometry, cold, capacity]} raycast={() => null} />
    </>
  )
}
