import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useKit } from '../kit'
import { useProps } from './context'
import type { OcclusionOptions } from './occlusion'
import type { Palette } from './palette'
import { buildSetAsync, type BuiltSet } from './set'
import type { PropSpec } from './specs'

/*
 * A static set (scene kit v1): every prop of a scene that does not move, merged into one mesh per surface, so a whole kitchen of
 * steel, glaze, tile and floor draws in five calls whatever it holds. Ambient occlusion is baked once on the merged set when it is
 * built (occlusion.ts), every prop's footprint goes into the kitchen's contact shadows, and the glowing parts light by the kitchen's
 * mask (<Kitchen lit>): a fire that lights or darkens a station changes a uniform, never a geometry.
 *
 * The set is built between frames, a few milliseconds at a time, and the scene draws nothing until it is done (kit.pending), so the
 * first frame shows the kitchen whole and a new set replaces the old one in a single frame. At T2 and up, where the scene asked for
 * shadows, the set casts and receives the heat lamps' shadow maps.
 */

export interface StaticSetProps {
  items: readonly PropSpec[]
  /** Leave occlusion out (`false`), or tune it. */
  occlusion?: OcclusionOptions | false
  name?: string
}

interface Shown {
  readonly items: readonly PropSpec[]
  readonly palette: Palette
  readonly set: BuiltSet
}

export function StaticSet({ items, occlusion, name = 'set' }: StaticSetProps) {
  const kit = useKit()
  const { materials, palette, shadows } = useProps()
  const [shown, setShown] = useState<Shown | null>(null)
  const pending = useRef(kit.pending)
  const held = useRef<(() => void) | null>(null)
  const replaced = useRef<BuiltSet | null>(null)
  useLayoutEffect(() => {
    pending.current = kit.pending
  })

  // Build the set for these items between frames, holding every frame back until it is drawn.
  useEffect(() => {
    let cancelled = false
    held.current ??= pending.current()
    buildSetAsync(items, palette, occlusion ?? {}, () => cancelled).then(
      (set) => {
        if (set) setShown({ items, palette, set })
      },
      (error: unknown) => {
        // A set that cannot be built fails the scene as a render would: the Stage's boundary shows the 2D note.
        if (cancelled) return
        setShown(() => {
          throw error
        })
      },
    )
    return () => {
      cancelled = true
    }
  }, [items, palette, occlusion])

  // Once the new set is on screen: free the old one, put the footprints in, and let frames come.
  useEffect(() => {
    if (!shown) return
    replaced.current?.dispose()
    replaced.current = shown.set
    shadows.set(name, shown.set.footprints)
    if (shown.items === items && shown.palette === palette) {
      held.current?.()
      held.current = null
    }
  }, [shown, items, palette, shadows, name])

  useEffect(
    () => () => {
      held.current?.()
      held.current = null
      replaced.current?.dispose()
      replaced.current = null
    },
    [],
  )
  useEffect(() => () => shadows.remove(name), [shadows, name])

  if (!shown) return null
  const cast = kit.shadowLights > 0
  return (
    <group name={name}>
      {shown.set.meshes.map(({ surface, geometry }) => (
        <mesh
          key={surface}
          name={`${name}-${surface}`}
          geometry={geometry}
          material={materials[surface]}
          castShadow={cast && surface !== 'floor' && surface !== 'tile'}
          receiveShadow={cast}
          raycast={() => null}
        />
      ))}
    </group>
  )
}

/**
 * One static prop on its own: its pieces merged into a mesh per surface, its occlusion baked on itself, its contact shadow in the
 * kitchen's. A scene with many props lists them in one <StaticSet> instead, which merges them all into five draws.
 */
export function Prop({ spec }: { spec: PropSpec }) {
  const items = useMemo(() => [spec], [spec])
  return <StaticSet items={items} name={`prop-${spec.id}`} />
}
