import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, CylinderGeometry, Matrix4, SpotLight, Vector3, type InstancedMesh } from 'three'
import { useKit } from './kit'
import { useProps, type LampLight } from './props'
import type { LampPools } from './spot-pools'

/*
 * Heat lamps as spot lights, scene kit v1's first lamps, kept for the kitchen specimen on /design: a warm spot over each lamp that casts
 * soft shadow maps from T2 where the scene asked (e2e/kitchen.spec.ts holds three at T2), its light on the brushed steel under it as the
 * steel's own sheen and streak warmed and brightened (spot-pools.ts's patch of the metal), and the soft cone under each at T2. The games draw a lamp's
 * light as the kit's cone of warm haze and its edgeless pool, with no spot light (props/Service.tsx's LampLights). This module and its
 * pools (spot-pools.ts) live outside the kit's props, so no game's scene counts them.
 */

/** The cone's top radius as a share of its foot's: it starts at the shade's mouth [estimated]. */
const CONE_TOP = 0.34
/**
 * How far the light a lamp throws on the steel leans from its amber toward the tubes' glint [estimated]: the steel brightens warm
 * under it, as a heat lamp's light looks off a counter, and never takes the lamp's full colour as a coat of paint.
 */
const POOL_GLINT = 0.2

const matrix = new Matrix4()

/** The specimen's heat lamps: a spot light each, its pool on the steel through `pools`, and the soft cone under each at T2. */
export function SpotLamps({ lamps, pools, power = 1 }: { lamps: readonly LampLight[]; pools: LampPools; power?: number }) {
  const kit = useKit()
  const { materials } = useProps()
  const params = kit.tokens.materials.propParams.lamp
  const color = kit.tokens.colors.lamp
  const glint = kit.tokens.colors.glint
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
  // Each lamp's light on the steel under it, as wide as its cone where it lands: warm, leaning toward the glint.
  useLayoutEffect(() => {
    const lamp = lamps[0]
    const warm = new Color(color).lerp(new Color(glint), POOL_GLINT).multiplyScalar(params.pool * power)
    pools.set(
      lamps.map((each) => [each.target[0], each.target[2], (each.at[1] - each.target[1]) * Math.tan(params.angle)] as const),
      lamp?.target[1] ?? 0,
      warm,
      lamp ? lamp.at[1] - lamp.target[1] : 1,
    )
    kit.invalidate()
    return () => pools.set([])
  }, [lamps, pools, params, color, glint, power, kit])
  const showCones = kit.tier >= 2
  const coneGeometry = useMemo(() => {
    // The kit's cone reads uv.x as a flat face's mark; a cone's side is never flat.
    const geometry = new CylinderGeometry(CONE_TOP, 1, 1, 36, 1, true).translate(0, -0.5, 0)
    const uv = geometry.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) uv.setX(i, 0)
    return geometry
  }, [])
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
    <group name="lamp-lights">
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
