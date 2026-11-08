import type { BufferGeometry } from 'three'
import { buildProp, type Footprint } from './build'
import { occlusionSteps, type OcclusionOptions } from './occlusion'
import { CHANNEL, type Palette } from './palette'
import { merged, painted, type Surface, type Vec3 } from './shape'
import type { PropSpec } from './specs'

/*
 * A static set's geometry (scene kit v1): every prop built, painted, merged by surface, and shaded once by its baked occlusion and, where
 * the scene lights its room, by the room's light. The work is a generator that yields between props, between surfaces and every few
 * thousand vertices of the bake, so StaticSet.tsx builds a whole kitchen between frames; `buildSet` runs it at once.
 */

/** The channels lit unless a scene says otherwise: the lamps' bulbs, the pass's heat strip and the hood's tubes. */
export const ALWAYS_LIT = (1 << CHANNEL.lamp) | (1 << CHANNEL.strip) | (1 << CHANNEL.tube)

/** A mask that lights these stations, and the lamps, strip and tubes. */
export function litMask(stations: readonly boolean[]): number {
  return stations.reduce((mask, on, i) => (on ? mask | (1 << i) : mask), ALWAYS_LIT)
}

export interface BuiltSet {
  readonly meshes: readonly { readonly surface: Surface; readonly geometry: BufferGeometry }[]
  readonly footprints: readonly Footprint[]
  /** Vertices, for a budget's test. */
  readonly vertices: number
  dispose(): void
}

const ORDER: readonly Surface[] = ['metal', 'ceramic', 'tile', 'floor', 'glow']

/**
 * The room's light, baked into its tile and its floor [estimated]: full over the line, where the tubes and the hood's lights fall, and
 * dimming toward `dim` of it to either side past `half` of the line's width, above the height `above` and back past the depth `beyond`,
 * over `reach` metres across, up and back. A room lit so has depth: its far corners and the wall over the hood fall away from the line.
 * Where its light falls away, `veil` of what it no longer lights is the haze's deep steel, so that a pale wall and a dark floor alike
 * lose their contrast into the haze rather than only darkening; none leaves the dark alone. A set without it is lit evenly.
 */
export interface RoomLight {
  /** The middle of the lit line, across the room (x). */
  readonly x: number
  readonly half: number
  readonly above: number
  readonly beyond: number
  readonly reach: Vec3
  readonly dim: number
  readonly veil?: number
}

/** The share of the room's light at a point: 1 where the room is lit, easing down to `dim`. */
export function roomShade(room: RoomLight, x: number, y: number, z: number): number {
  const across = Math.max(0, Math.abs(x - room.x) - room.half) / room.reach[0]
  const up = Math.max(0, y - room.above) / room.reach[1]
  const back = Math.max(0, room.beyond - z) / room.reach[2]
  const q = Math.min(1, Math.hypot(across, up, back))
  return 1 - (1 - room.dim) * q * q * (3 - 2 * q)
}

/** The set's meshes, step by step: built, painted, merged by surface, then shaded by its baked occlusion (not the glowing parts). */
export function* buildSteps(items: readonly PropSpec[], palette: Palette, occlusion: OcclusionOptions | false = {}, room: RoomLight | null = null): Generator<void, BuiltSet> {
  const bySurface = new Map<Surface, BufferGeometry[]>()
  const footprints: Footprint[] = []
  for (const spec of items) {
    const built = buildProp(spec, palette)
    footprints.push(...built.footprints)
    for (const part of built.parts) {
      const list = bySurface.get(part.surface) ?? []
      list.push(painted(part))
      bySurface.set(part.surface, list)
    }
    yield
  }
  const meshes: { surface: Surface; geometry: BufferGeometry }[] = []
  for (const surface of ORDER) {
    const list = bySurface.get(surface)
    if (!list) continue
    const geometry = merged(list)
    for (const part of list) part.dispose()
    if (geometry) meshes.push({ surface, geometry })
    yield
  }
  if (occlusion !== false && meshes.length > 0) {
    // The floor and the wall are shaded where props stand near them, and widen nothing: the grid spans the props.
    const shades = yield* occlusionSteps(
      meshes.map((mesh) => mesh.geometry),
      occlusion,
      meshes.map((mesh) => mesh.surface !== 'floor' && mesh.surface !== 'tile'),
    )
    meshes.forEach(({ surface, geometry }, i) => {
      if (surface === 'glow') return
      const color = geometry.getAttribute('color')
      const shade = shades[i]
      for (let v = 0; v < color.count; v++) color.setXYZ(v, color.getX(v) * shade[v], color.getY(v) * shade[v], color.getZ(v) * shade[v])
      color.needsUpdate = true
    })
  }
  // The room's light on its tile and its floor, falling away into the haze.
  if (room) {
    for (const { surface, geometry } of meshes) {
      if (surface !== 'tile' && surface !== 'floor') continue
      const color = geometry.getAttribute('color')
      const at = geometry.getAttribute('position')
      const haze = palette.part(geometry, 'deep').color.clone().multiplyScalar(room.veil ?? 0)
      for (let v = 0; v < color.count; v++) {
        const shade = roomShade(room, at.getX(v), at.getY(v), at.getZ(v))
        color.setXYZ(v, color.getX(v) * shade + haze.r * (1 - shade), color.getY(v) * shade + haze.g * (1 - shade), color.getZ(v) * shade + haze.b * (1 - shade))
      }
      color.needsUpdate = true
    }
  }
  const vertices = meshes.reduce((sum, mesh) => sum + mesh.geometry.getAttribute('position').count, 0)
  return {
    meshes,
    footprints,
    vertices,
    dispose() {
      for (const mesh of meshes) mesh.geometry.dispose()
    },
  }
}

/** The set built and baked at once. */
export function buildSet(items: readonly PropSpec[], palette: Palette, occlusion: OcclusionOptions | false = {}, room: RoomLight | null = null): BuiltSet {
  const steps = buildSteps(items, palette, occlusion, room)
  for (;;) {
    const next = steps.next()
    if (next.done) return next.value
  }
}

/** Yields the main thread for a moment: a timer, never an animation frame, so a still scene requests none. */
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/**
 * Runs the steps between tasks, each slice at most `sliceMs` long [estimated], until done or `cancelled()`. Resolves with the set,
 * or null when cancelled.
 */
export async function buildSetAsync(items: readonly PropSpec[], palette: Palette, occlusion: OcclusionOptions | false, room: RoomLight | null, cancelled: () => boolean, sliceMs = 8): Promise<BuiltSet | null> {
  const steps = buildSteps(items, palette, occlusion, room)
  let slice = performance.now()
  for (;;) {
    const next = steps.next()
    if (next.done) {
      if (!cancelled()) return next.value
      next.value.dispose()
      return null
    }
    if (performance.now() - slice > sliceMs) {
      await pause()
      if (cancelled()) return null
      slice = performance.now()
    }
  }
}
