import { useEffect, useMemo } from 'react'
import { DirectionalLight, HemisphereLight } from 'three'
import type { Vec3 } from './camera-rig'
import { useKit } from './kit'

/*
 * Data Book's light in 3D (REDESIGN §2.8: "lit by one directional light and a hemisphere"): a cool white sky over the ground's grey and
 * one key, here from above, in front and to the left, so a slab has a lit top, a lit front and a shaded right side. No spot, no lamp, no
 * shadow map: the depth is the contact shadows' and the baked occlusion's (flat-materials.ts), which hold at every tier. The scene that
 * uses it asks for no environment map, so nothing here reflects anything. Power [estimated], set by eye so the paper's top reads close to
 * its 2D colour in Side.
 */

/** Where the key light comes from, toward the plate's middle [estimated]. */
const KEY_FROM: Vec3 = [-3, 9, 6]

/** The key's share of the hemisphere's strength [estimated]. */
const KEY = 0.9

export function FlatLights({ power = 2.1, from = KEY_FROM }: { power?: number; from?: Vec3 }) {
  const kit = useKit()
  const { skyColor, groundColor, intensity } = kit.tokens.materials.fluorescent
  const sky = useMemo(() => new HemisphereLight(skyColor, groundColor, intensity * power), [skyColor, groundColor, intensity, power])
  const key = useMemo(() => {
    const light = new DirectionalLight(skyColor, intensity * KEY * power)
    light.position.set(...from)
    return light
  }, [skyColor, intensity, power, from])
  useEffect(
    () => () => {
      sky.dispose()
      key.dispose()
    },
    [sky, key],
  )
  return (
    <>
      <primitive object={sky} />
      <primitive object={key} />
      <primitive object={key.target} />
    </>
  )
}
