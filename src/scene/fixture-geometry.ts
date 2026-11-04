/*
 * The steel of a scene's fixtures (the pass, the rail, the lane beds, the lamps' housings and stems) as one merged geometry,
 * so all of it is a single draw call in the stainless material. Each part carries its tone of steel as vertex colours from
 * the roles (bright `surface-1`, shaded `surface-2`, deep `surface-3`), and UVs measured in the world, so the brushed grain
 * has the same density on a long lane bed as on a small clip, and runs along each face's longer side, as a brush would.
 */
import { BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, type Color } from 'three'
import type { Vec3 } from './camera-rig'
import { STEEL_TILE } from './materials'

export type SteelTone = 'bright' | 'shaded' | 'deep'

export type FixturePart =
  | { readonly kind: 'box'; readonly center: Vec3; readonly size: Vec3; readonly tone: SteelTone }
  /** A lamp's housing: an open-mouthed shade, its mouth at `center`, rising `height`. */
  | { readonly kind: 'shade'; readonly center: Vec3; readonly mouth: number; readonly crown: number; readonly height: number; readonly tone: SteelTone }
  /** A vertical rod: a stem, a post. */
  | { readonly kind: 'rod'; readonly base: Vec3; readonly height: number; readonly radius: number; readonly tone: SteelTone }

/** Box faces in BoxGeometry's order (+x, -x, +y, -y, +z, -z): the two world axes each face spans. */
const FACE_AXES: ReadonlyArray<[number, number]> = [
  [2, 1],
  [2, 1],
  [0, 2],
  [0, 2],
  [0, 1],
  [0, 1],
]

function boxPart(center: Vec3, size: Vec3, tile: number): BufferGeometry {
  const geometry = new BoxGeometry(size[0], size[1], size[2])
  geometry.translate(center[0], center[1], center[2])
  const position = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  for (let face = 0; face < 6; face++) {
    const [a, b] = FACE_AXES[face]
    // The grain runs along the face's longer side.
    const [along, across] = size[a] >= size[b] ? [a, b] : [b, a]
    for (let corner = 0; corner < 4; corner++) {
      const i = face * 4 + corner
      uv.setXY(i, position.getComponent(i, along) / tile, position.getComponent(i, across) / tile)
    }
  }
  return geometry
}

function shadePart(center: Vec3, mouth: number, crown: number, height: number, tile: number): BufferGeometry {
  // Open at the mouth (below), capped at the crown (above).
  const geometry = new CylinderGeometry(crown, mouth, height, 28, 1, false)
  geometry.translate(center[0], center[1] + height / 2, center[2])
  scaleUv(geometry, (Math.PI * (mouth + crown)) / tile, height / tile)
  return geometry
}

function rodPart(base: Vec3, height: number, radius: number, tile: number): BufferGeometry {
  const geometry = new CylinderGeometry(radius, radius, height, 10, 1, true)
  geometry.translate(base[0], base[1] + height / 2, base[2])
  scaleUv(geometry, (Math.PI * 2 * radius) / tile, height / tile)
  return geometry
}

function scaleUv(geometry: BufferGeometry, u: number, v: number) {
  const uv = geometry.getAttribute('uv')
  // A cylinder's v runs along its height: the brush runs along it.
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * v, uv.getX(i) * u)
}

/** Merges indexed geometries that share position, normal, uv and color attributes. */
function merge(parts: readonly BufferGeometry[]): BufferGeometry {
  const total = parts.reduce((sum, part) => sum + part.getAttribute('position').count, 0)
  const indices = parts.reduce((sum, part) => sum + (part.getIndex()?.count ?? 0), 0)
  const position = new Float32Array(total * 3)
  const normal = new Float32Array(total * 3)
  const uv = new Float32Array(total * 2)
  const color = new Float32Array(total * 3)
  const index = new Uint32Array(indices)
  let vertex = 0
  let at = 0
  for (const part of parts) {
    const count = part.getAttribute('position').count
    position.set(part.getAttribute('position').array as Float32Array, vertex * 3)
    normal.set(part.getAttribute('normal').array as Float32Array, vertex * 3)
    uv.set(part.getAttribute('uv').array as Float32Array, vertex * 2)
    color.set(part.getAttribute('color').array as Float32Array, vertex * 3)
    const own = part.getIndex()
    if (own) {
      for (let i = 0; i < own.count; i++) index[at + i] = own.getX(i) + vertex
      at += own.count
    }
    vertex += count
  }
  const merged = new BufferGeometry()
  merged.setAttribute('position', new BufferAttribute(position, 3))
  merged.setAttribute('normal', new BufferAttribute(normal, 3))
  merged.setAttribute('uv', new BufferAttribute(uv, 2))
  merged.setAttribute('color', new BufferAttribute(color, 3))
  merged.setIndex(new BufferAttribute(index, 1))
  merged.computeBoundingSphere()
  return merged
}

/**
 * The fixtures as one geometry, each part tinted by its tone's role colour. `tile` is the world size one tile of the brushed grain
 * covers: a scene that brings its steel close to the camera passes a smaller one, so the brush strokes stay fine up close.
 */
export function buildFixtures(parts: readonly FixturePart[], toneColor: (tone: SteelTone) => Color, tile: number = STEEL_TILE): BufferGeometry {
  const geometries = parts.map((part) => {
    const geometry =
      part.kind === 'box'
        ? boxPart(part.center, part.size, tile)
        : part.kind === 'shade'
          ? shadePart(part.center, part.mouth, part.crown, part.height, tile)
          : rodPart(part.base, part.height, part.radius, tile)
    const { r, g, b } = toneColor(part.tone)
    const count = geometry.getAttribute('position').count
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) colors.set([r, g, b], i * 3)
    geometry.setAttribute('color', new BufferAttribute(colors, 3))
    return geometry
  })
  const merged = merge(geometries)
  for (const geometry of geometries) geometry.dispose()
  return merged
}
