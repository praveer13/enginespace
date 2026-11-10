import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { InstancedBufferAttribute, Matrix4, PlaneGeometry, Quaternion, Vector3, type BufferGeometry, type InstancedMesh } from 'three'
import { useKit } from '../kit'
import type { Footprint } from './build'
import { createShadowRegistry, PropsContext, roomFor, type PropsKit, type ShadowRegistry } from './context'
import { createPropMaterials, type MetalPatch, type PropMaterials } from './materials'
import { paletteFrom } from './palette'
import { ALWAYS_LIT } from './set'

/*
 * The kitchen (scene kit v1): what every prop inside a scene shares. `<Kitchen>` makes the props' materials for the scene's tier and
 * tokens, the palette their parts are coloured from, and the contact shadows: one instanced draw of soft rounded rectangles under
 * every prop, static or moving, at every 3D tier, so nothing floats. A prop registers its footprints; a prop that slides moves its
 * own from frame to frame without a render.
 */

const matrix = new Matrix4()
const turn = new Quaternion()
const up = new Vector3(0, 1, 0)
const where = new Vector3()
const scale = new Vector3()

/** The contact shadows: every registered footprint as one instanced quad lying on the surface under its prop. */
function ContactShadows({ registry, materials }: { registry: ShadowRegistry; materials: PropMaterials }) {
  const kit = useKit()
  const version = useSyncExternalStore(registry.subscribe, registry.version, registry.version)
  const count = registry.all().length
  const capacity = roomFor(count)
  const geometry = useMemo(() => {
    const plane: BufferGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    plane.setAttribute('aRect', new InstancedBufferAttribute(new Float32Array(capacity * 4), 4))
    plane.setAttribute('aShade', new InstancedBufferAttribute(new Float32Array(capacity), 1))
    return plane
  }, [capacity])
  useEffect(() => () => geometry.dispose(), [geometry])
  const mesh = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const instanced = mesh.current
    if (!instanced) return
    const rect = geometry.getAttribute('aRect') as InstancedBufferAttribute
    const shade = geometry.getAttribute('aShade') as InstancedBufferAttribute
    const placeOne = (index: number, footprint: Footprint, x: number, z: number) => {
      turn.setFromAxisAngle(up, footprint.yaw)
      where.set(x, footprint.center[1] + 0.0015, z)
      scale.set(2 * (footprint.size[0] / 2 + footprint.soft), 1, 2 * (footprint.size[1] / 2 + footprint.soft))
      instanced.setMatrixAt(index, matrix.compose(where, turn, scale))
      instanced.instanceMatrix.needsUpdate = true
    }
    registry.all().forEach(({ footprint }, i) => {
      placeOne(i, footprint, footprint.center[0], footprint.center[2])
      rect.setXYZW(i, footprint.size[0] / 2, footprint.size[1] / 2, Math.min(footprint.radius, footprint.size[0] / 2, footprint.size[1] / 2), footprint.soft)
      shade.setX(i, footprint.strength)
    })
    rect.needsUpdate = true
    shade.needsUpdate = true
    instanced.count = registry.all().length
    instanced.computeBoundingSphere()
    registry.attach(instanced, placeOne)
    kit.invalidate()
    return () => registry.attach(null, () => undefined)
  }, [registry, version, geometry, kit])

  return <instancedMesh ref={mesh} name="contact-shadows" args={[geometry, materials.shadow, capacity]} renderOrder={1} frustumCulled={false} raycast={() => null} />
}

/**
 * The props' shared kit: materials for this tier and these tokens, the palette, and the contact shadows under everything. `lit` is
 * the kitchen's glow mask, bit n lighting channel n (set.ts's `litMask`): every glowing part of every prop inside follows it. `metal`
 * patches the metal's shader further, for lamps of a scene's own (spot-lamps.tsx); keep it the same function from render to render.
 */
export function Kitchen({ lit = ALWAYS_LIT, metal, children }: { lit?: number; metal?: MetalPatch; children: ReactNode }) {
  const kit = useKit()
  const gl = useThree((state) => state.gl)
  const { tokens } = kit
  const base = kit.materials
  // Made again only when the colours, the tier's class (T1, or T2 and up) or the kit's own maps change.
  const tierClass = kit.tier >= 2 ? 2 : 1
  const materials = useMemo(() => createPropMaterials({ tokens, tier: tierClass, base }, gl.capabilities.getMaxAnisotropy(), metal), [tokens, tierClass, base, gl, metal])
  useEffect(() => () => materials.dispose(), [materials])
  const palette = useMemo(() => paletteFrom(tokens), [tokens])
  const [shadows] = useState(createShadowRegistry)
  useLayoutEffect(() => {
    materials.setLit(lit)
    kit.invalidate()
  }, [materials, lit, kit])
  const value = useMemo<PropsKit>(() => ({ materials, palette, shadows }), [materials, palette, shadows])
  return (
    <PropsContext.Provider value={value}>
      {children}
      <ContactShadows registry={shadows} materials={materials} />
    </PropsContext.Provider>
  )
}
