import { createContext, useContext } from 'react'
import type { InstancedMesh } from 'three'
import type { Footprint } from './build'
import type { PropMaterials } from './materials'
import type { Palette } from './palette'

/*
 * What every prop inside a <Kitchen> reaches (scene kit v1): the props' materials, the palette, and the contact shadows' registry.
 */

export interface ShadowRegistry {
  /** Puts an owner's footprints in the draw, replacing what it had. */
  set(owner: string, footprints: readonly Footprint[]): void
  remove(owner: string): void
  /** Moves an owner's footprint `index` to (x, z), for a prop that slides: the next frame draws it there. */
  move(owner: string, index: number, x: number, z: number): void
  subscribe(listener: () => void): () => void
  version(): number
  all(): readonly { owner: string; footprint: Footprint }[]
  attach(mesh: InstancedMesh | null, place: (index: number, footprint: Footprint, x: number, z: number) => void): void
}

export function createShadowRegistry(): ShadowRegistry {
  const owners = new Map<string, readonly Footprint[]>()
  const listeners = new Set<() => void>()
  let version = 0
  let flat: { owner: string; footprint: Footprint }[] = []
  let mesh: InstancedMesh | null = null
  let place: ((index: number, footprint: Footprint, x: number, z: number) => void) | null = null
  const changed = () => {
    flat = [...owners].flatMap(([owner, footprints]) => footprints.map((footprint) => ({ owner, footprint })))
    version += 1
    for (const listener of listeners) listener()
  }
  return {
    set(owner, footprints) {
      owners.set(owner, footprints)
      changed()
    },
    remove(owner) {
      if (owners.delete(owner)) changed()
    },
    move(owner, index, x, z) {
      if (!mesh || !place) return
      let at = 0
      for (const [name, footprints] of owners) {
        if (name === owner) {
          const footprint = footprints[index]
          if (footprint) place(at + index, footprint, x, z)
          return
        }
        at += footprints.length
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    version: () => version,
    all: () => flat,
    attach(next, placer) {
      mesh = next
      place = placer
    },
  }
}

export interface PropsKit {
  readonly materials: PropMaterials
  readonly palette: Palette
  readonly shadows: ShadowRegistry
}

export const PropsContext = createContext<PropsKit | null>(null)

export function useProps(): PropsKit {
  const props = useContext(PropsContext)
  if (props === null) throw new Error('a prop renders inside <Kitchen>')
  return props
}

/** Room for this many instances, in powers of two from 16. */
export const roomFor = (count: number): number => {
  let capacity = 16
  while (capacity < count) capacity *= 2
  return capacity
}

