/*
 * The kitchen's geometry helpers (scene kit v1): the bevel, the lathe, the sweep and the tube every prop is made of, so no prop is an
 * unbevelled box or a bare plane, and every game that authors a prop of its own makes it the same way (a reach-in, a tasting spoon, a
 * dumbwaiter's car). Everything is in metres, y up, a prop's base at y = 0 and its front toward +z.
 *
 *   roundedBox   a box with every edge rounded, its flat faces cut into segments so baked occlusion has vertices to darken.
 *   lathe        a profile turned about y: a plate, a bell, a lamp's shade, a knob. Its grain runs round, as a spun or turned part's does.
 *   sweep        a profile drawn along a path: along a straight line for a rolled edge or a rail's channel, round a rounded rectangle
 *                for a hotel pan's walls and rim or a fryer's well.
 *   tube         a round section along a polyline whose corners are bent, not mitred: rods, legs, wires, cords, grates.
 *   plate        a flat rounded rectangle, a cap for a sweep: a pan's floor, a well's oil.
 *
 * UVs are metres over `tile` (the brush's tile), along each part's own grain, so brushed steel has the same grain on a long counter as
 * on a small clip and the anisotropic highlight runs across it as it would. Pure three, no React, no DOM: a test builds every prop.
 */
import { BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, Euler, LatheGeometry, Matrix4, Quaternion, TubeGeometry, Vector2, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export type Vec3 = readonly [number, number, number]
export type Vec2 = readonly [number, number]

/**
 * The world size one tile of the brushed grain covers on the props, in metres [estimated]: fine enough that up close the brush reads
 * as a sheen across the steel, not as stripes, and the anisotropic highlight carries it.
 */
export const GRAIN_TILE = 0.12

/** The draw a part belongs to: one merged mesh per surface for a whole static set. */
export type Surface = 'metal' | 'ceramic' | 'tile' | 'floor' | 'glow'

/**
 * One piece of a prop: its geometry in the prop's own space, the surface it is drawn in, its colour (a role's, through the palette),
 * and three numbers the surface reads per vertex. For metal they are its finish, [roughness ×, grain ×, metalness ×]; for glow they
 * are [channel, strength, 0], where the channel is the station, lamp or strip whose lit state it follows.
 */
export interface Part {
  readonly geometry: BufferGeometry
  readonly surface: Surface
  readonly color: Color
  readonly finish: Vec3
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Placing                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

const euler = new Euler()
const quaternion = new Quaternion()

/** A matrix from a position, a rotation (radians about x, y and z, in that order) and a scale. */
export function matrixOf(at: Vec3, rotation: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1]): Matrix4 {
  return new Matrix4().compose(new Vector3(...at), quaternion.setFromEuler(euler.set(...rotation)), new Vector3(...scale))
}

/** Moves a geometry in place, and returns it. */
export function place<G extends BufferGeometry>(geometry: G, at: Vec3, rotation: Vec3 = [0, 0, 0]): G {
  geometry.applyMatrix4(matrixOf(at, rotation))
  return geometry
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* UVs                                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * World UVs for a box-like part: each vertex is projected on the plane its normal faces most, in metres over `tile`, with u along the
 * longer of that plane's two sides of the part, which is the way a brush runs along a sheet.
 */
export function boxUv(geometry: BufferGeometry, tile = GRAIN_TILE): BufferGeometry {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  const size = box ? [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z] : [1, 1, 1]
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const uv = new Float32Array(position.count * 2)
  for (let i = 0; i < position.count; i++) {
    const n = [Math.abs(normal.getX(i)), Math.abs(normal.getY(i)), Math.abs(normal.getZ(i))]
    const axis = n[0] > n[1] && n[0] > n[2] ? 0 : n[1] > n[2] ? 1 : 2
    const [a, b] = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1]
    const [along, across] = size[a] >= size[b] ? [a, b] : [b, a]
    uv[i * 2] = position.getComponent(i, along) / tile
    uv[i * 2 + 1] = position.getComponent(i, across) / tile
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2))
  return geometry
}

/** Scales a geometry's own UVs (0 to 1 each way) to metres over `tile`. */
function scaleUv(geometry: BufferGeometry, u: number, v: number, tile = GRAIN_TILE): BufferGeometry {
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * u) / tile, (uv.getY(i) * v) / tile)
  return geometry
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The shapes                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** How many flat segments a face of this length gets, so occlusion baked at its vertices has room to fall off [estimated]. */
const flatSegments = (length: number) => Math.max(1, Math.min(8, Math.ceil(length / 0.3)))

/**
 * A box of `size` (x, y, z) about its centre with every edge rounded to `radius`: `segments` steps round each edge, and the flat
 * middle of each face cut in proportion to its length. The rounded box of three's addons, written here with a flat middle that
 * occlusion can darken and no addon to load.
 */
export function roundedBox(size: Vec3, radius: number, segments = 2): BufferGeometry {
  const half = size.map((s) => s / 2)
  const r = Math.max(0.0005, Math.min(radius, ...half))
  const flats = size.map((s) => flatSegments(s - 2 * r))
  const counts = flats.map((f) => 2 * segments + f)
  const box = new BoxGeometry(1, 1, 1, counts[0], counts[1], counts[2])
  const position = box.getAttribute('position')
  const normal = box.getAttribute('normal')
  const inner = half.map((h) => h - r)
  const p = new Vector3()
  const core = new Vector3()
  // A unit-box coordinate in [-0.5, 0.5] to a coordinate on the axis: `segments` steps across each rounded band, the flats between.
  const along = (c: number, axis: number) => {
    const steps = counts[axis]
    const k = Math.round((c + 0.5) * steps)
    if (k <= segments) return -half[axis] + (r * k) / segments
    if (k >= steps - segments) return half[axis] - (r * (steps - k)) / segments
    return -inner[axis] + (2 * inner[axis] * (k - segments)) / flats[axis]
  }
  for (let i = 0; i < position.count; i++) {
    p.set(along(position.getX(i), 0), along(position.getY(i), 1), along(position.getZ(i), 2))
    core.set(Math.max(-inner[0], Math.min(inner[0], p.x)), Math.max(-inner[1], Math.min(inner[1], p.y)), Math.max(-inner[2], Math.min(inner[2], p.z)))
    const out = p.sub(core)
    if (out.lengthSq() < 1e-12) out.set(normal.getX(i), normal.getY(i), normal.getZ(i))
    out.normalize()
    normal.setXYZ(i, out.x, out.y, out.z)
    position.setXYZ(i, core.x + out.x * r, core.y + out.y * r, core.z + out.z * r)
  }
  return boxUv(box)
}

/** A rounded box standing on y = 0 at `at` (its base's centre), turned `yaw` about y. */
export function block(size: Vec3, radius: number, at: Vec3 = [0, 0, 0], yaw = 0, segments = 2): BufferGeometry {
  return place(roundedBox(size, radius, segments), [at[0], at[1] + size[1] / 2, at[2]], [0, yaw, 0])
}

/**
 * A profile of (radius, height) points turned about y. Its points run counter-clockwise round the solid's section (radius to the
 * right, height up): out along the bottom, up the outside, in along the top, so each face's normal points out of the solid; a
 * shell's inside runs down. Each point's neighbours set its normal, so a run of close points rounds an edge and a doubled point
 * keeps it sharp. The grain runs round, as a spun part's does.
 */
export function lathe(profile: readonly Vec2[], segments = 40, tile = GRAIN_TILE): BufferGeometry {
  const points = profile.map(([r, y]) => new Vector2(Math.max(0, r), y))
  const geometry = new LatheGeometry(points, segments)
  // three's lathe leaves its last point's normal unnormalised.
  const normal = geometry.getAttribute('normal')
  const n = new Vector3()
  for (let i = 0; i < normal.count; i++) {
    n.set(normal.getX(i), normal.getY(i), normal.getZ(i)).normalize()
    normal.setXYZ(i, n.x, n.y, n.z)
  }
  let length = 0
  let mean = 0
  for (let i = 1; i < points.length; i++) {
    const step = points[i].distanceTo(points[i - 1])
    length += step
    mean += ((points[i].x + points[i - 1].x) / 2) * step
  }
  mean = length > 0 ? mean / length : 0
  return scaleUv(geometry, 2 * Math.PI * Math.max(mean, 0.005), Math.max(length, 0.001), tile)
}

/** A 2D path's points and its outward normals, for a sweep: (x, z) in the plane of the path. */
export interface Path2 {
  readonly points: readonly Vec2[]
  readonly normals: readonly Vec2[]
  readonly closed: boolean
}

/** A straight path along x, from -length/2 to length/2, facing +z: a counter's front edge, a rail's channel. */
export function straightPath(length: number, steps = 1): Path2 {
  const points: Vec2[] = []
  for (let i = 0; i <= steps; i++) points.push([-length / 2 + (length * i) / steps, 0])
  return { points, normals: points.map(() => [0, 1] as const), closed: false }
}

/**
 * A rounded rectangle `w` by `d` about the origin in the xz plane, corners of `radius`, counter-clockwise seen from above, its
 * straight sides cut every `spacing` metres so occlusion baked on a sweep along them has vertices to shade. A sweep may push its
 * profile in from the path by less than `radius`, never more: past the corner's centre an inset corner turns inside out.
 */
export function roundedRectPath(w: number, d: number, radius: number, cornerSteps = 6, spacing = 0.08): Path2 {
  const r = Math.max(0.0005, Math.min(radius, w / 2, d / 2))
  const hx = w / 2 - r
  const hz = d / 2 - r
  const corners: Vec2[] = [
    [hx, hz],
    [hx, -hz],
    [-hx, -hz],
    [-hx, hz],
  ]
  const points: Vec2[] = []
  const normals: Vec2[] = []
  corners.forEach(([cx, cz], k) => {
    for (let i = 0; i <= cornerSteps; i++) {
      // Each corner turns a quarter, starting from the face before it.
      const angle = Math.PI / 2 - (k * Math.PI) / 2 - (i / cornerSteps) * (Math.PI / 2)
      const nx = Math.cos(angle)
      const nz = Math.sin(angle)
      points.push([cx + nx * r, cz + nz * r])
      normals.push([nx, nz])
    }
    // The straight side to the next corner, cut into lengths of at most `spacing`.
    const [x0, z0] = points[points.length - 1]
    const normal = normals[normals.length - 1]
    const [nx, nz] = corners[(k + 1) % 4]
    const angle = Math.PI / 2 - (((k + 1) % 4) * Math.PI) / 2
    const x1 = nx + Math.cos(angle) * r
    const z1 = nz + Math.sin(angle) * r
    const cuts = Math.max(0, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / spacing) - 1)
    for (let c = 1; c <= cuts; c++) {
      const t = c / (cuts + 1)
      points.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t])
      normals.push(normal)
    }
  })
  return { points, normals, closed: true }
}

/**
 * Sweeps a profile along a path: each profile point is (outward, up), placed at a path point pushed out along its normal and up y.
 * As for a lathe, the profile runs counter-clockwise round its section (outward to the right, up up), so faces point out of it; a
 * path runs counter-clockwise seen from above. u runs along the path and v along the profile, in metres over `tile`, so the grain
 * follows the path. A closed path wraps.
 */
export function sweep(path: Path2, profile: readonly Vec2[], tile = GRAIN_TILE): BufferGeometry {
  const n = path.points.length
  const m = profile.length
  const rows = path.closed ? n + 1 : n
  const position = new Float32Array(rows * m * 3)
  const uv = new Float32Array(rows * m * 2)
  let u = 0
  for (let i = 0; i < rows; i++) {
    const k = i % n
    const [px, pz] = path.points[k]
    const [nx, nz] = path.normals[k]
    if (i > 0) {
      const [qx, qz] = path.points[(i - 1) % n]
      u += Math.hypot(px - qx, pz - qz)
    }
    let v = 0
    for (let j = 0; j < m; j++) {
      const [out, up] = profile[j]
      if (j > 0) v += Math.hypot(out - profile[j - 1][0], up - profile[j - 1][1])
      const at = (i * m + j) * 3
      position[at] = px + nx * out
      position[at + 1] = up
      position[at + 2] = pz + nz * out
      uv[(i * m + j) * 2] = u / tile
      uv[(i * m + j) * 2 + 1] = v / tile
    }
  }
  const index: number[] = []
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j
      const b = (i + 1) * m + j
      index.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('uv', new BufferAttribute(uv, 2))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  if (path.closed) seamNormals(geometry, m, rows)
  return geometry
}

/** A closed sweep's first and last rows sit on one seam: they share their normals, so the seam is not lit as an edge. */
function seamNormals(geometry: BufferGeometry, m: number, rows: number) {
  const normal = geometry.getAttribute('normal')
  const v = new Vector3()
  for (let j = 0; j < m; j++) {
    const a = j
    const b = (rows - 1) * m + j
    v.set(normal.getX(a) + normal.getX(b), normal.getY(a) + normal.getY(b), normal.getZ(a) + normal.getZ(b)).normalize()
    normal.setXYZ(a, v.x, v.y, v.z)
    normal.setXYZ(b, v.x, v.y, v.z)
  }
}

/**
 * A sheet-metal channel's section, open upward, `width` across and `height` tall in sheet `sheet` thick, counter-clockwise so a
 * sweep of it faces out on every side: a trough, a gutter, a runner.
 */
export function uSection(width: number, height: number, sheet: number, floor = 0): Vec2[] {
  return [
    [0, floor],
    [width, floor],
    [width, floor + height],
    [width - sheet, floor + height],
    [width - sheet, floor + sheet],
    [sheet, floor + sheet],
    [sheet, floor + height],
    [0, floor + height],
    [0, floor],
  ]
}

/**
 * A flat cap over a closed path, at height `y`, facing up (or down): a fan from the path's centre, with rings so occlusion has
 * vertices inside it. A pan's floor, a well's oil, a shelf's top.
 */
export function cap(path: Path2, y: number, up = true, rings = 3, tile = GRAIN_TILE): BufferGeometry {
  const n = path.points.length
  const position: number[] = [0, y, 0]
  const uvs: number[] = [0, 0]
  for (let ring = 1; ring <= rings; ring++) {
    const share = ring / rings
    for (const [x, z] of path.points) {
      position.push(x * share, y, z * share)
      uvs.push((x * share) / tile, (z * share) / tile)
    }
  }
  const index: number[] = []
  const at = (ring: number, k: number) => 1 + (ring - 1) * n + (k % n)
  for (let k = 0; k < n; k++) index.push(0, at(1, k), at(1, k + 1))
  for (let ring = 1; ring < rings; ring++) {
    for (let k = 0; k < n; k++) {
      const a = at(ring, k)
      const b = at(ring, k + 1)
      const c = at(ring + 1, k)
      const d = at(ring + 1, k + 1)
      index.push(a, c, b, b, c, d)
    }
  }
  if (!up) for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]]
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  const normals = new Float32Array(position.length)
  for (let i = 1; i < normals.length; i += 3) normals[i] = up ? 1 : -1
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  geometry.setIndex(index)
  return geometry
}

/**
 * Points along a polyline with each inner corner bent round `radius` in `steps`, for a tube: a leg's foot, a cord's droop, a grate's
 * bars, a basket's handle.
 */
export function bent(points: readonly Vec3[], radius: number, steps = 5): Vec3[] {
  if (points.length < 3 || radius <= 0) return [...points]
  const out: Vec3[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const p = new Vector3(...points[i])
    const a = new Vector3(...points[i - 1]).sub(p)
    const b = new Vector3(...points[i + 1]).sub(p)
    const r = Math.min(radius, a.length() / 2, b.length() / 2)
    a.normalize()
    b.normalize()
    const from = p.clone().addScaledVector(a, r)
    const to = p.clone().addScaledVector(b, r)
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      // A quadratic Bézier from `from` through the corner to `to`: close enough to an arc at these radii.
      const q = from.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(p, 2 * t * (1 - t)).addScaledVector(to, t * t)
      out.push([q.x, q.y, q.z])
    }
  }
  out.push(points[points.length - 1])
  return out
}

/** A tube of `radius` along points, their curve passing through each (bend corners first with `bent`), with closed ends left open. */
export function tube(points: readonly Vec3[], radius: number, radial = 10, tile = GRAIN_TILE, closed = false): BufferGeometry {
  const curve = new CatmullRomCurve3(
    points.map((p) => new Vector3(...p)),
    closed,
    'centripetal',
  )
  const length = curve.getLength()
  const geometry = new TubeGeometry(curve, Math.max(2, Math.ceil(points.length * 1.6)), radius, radial, closed)
  return scaleUv(geometry, length, 2 * Math.PI * radius, tile)
}

/** A rod: a straight tube from `a` to `b` with rounded ends, a post, a stem, a bar. */
export function rod(a: Vec3, b: Vec3, radius: number, radial = 12): BufferGeometry {
  const from = new Vector3(...a)
  const to = new Vector3(...b)
  const half = from.distanceTo(to) / 2
  const end = Math.min(radius, half)
  const profile: Vec2[] = []
  for (let i = 0; i <= 3; i++) {
    const t = (i / 3) * (Math.PI / 2)
    profile.push([radius * Math.sin(t), -half + end * (1 - Math.cos(t))])
  }
  for (let i = 0; i <= 3; i++) {
    const t = (i / 3) * (Math.PI / 2)
    profile.push([radius * Math.cos(t), half - end + end * Math.sin(t)])
  }
  const geometry = lathe(profile, radial)
  geometry.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), to.clone().sub(from).normalize()))
  const middle = from.add(to).multiplyScalar(0.5)
  geometry.translate(middle.x, middle.y, middle.z)
  return geometry
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Merging                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A geometry with exactly position, normal, uv and an index, so any two of them merge. */
export function normalized(geometry: BufferGeometry): BufferGeometry {
  let g = geometry
  if (!g.getAttribute('normal')) g.computeVertexNormals()
  if (!g.getAttribute('uv')) g.setAttribute('uv', new BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2))
  if (!g.index) {
    const count = g.getAttribute('position').count
    const index = new Uint32Array(count)
    for (let i = 0; i < count; i++) index[i] = i
    g.setIndex(new BufferAttribute(index, 1))
  }
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'aFinish'].includes(name)) g.deleteAttribute(name)
  for (const name of ['position', 'normal', 'uv']) {
    const attribute = g.getAttribute(name)
    if (!(attribute.array instanceof Float32Array) || 'isInterleavedBufferAttribute' in attribute) {
      g.setAttribute(name, new BufferAttribute(Float32Array.from(attribute.array as ArrayLike<number>), attribute.itemSize))
    }
  }
  g.morphAttributes = {}
  g = g.index && !(g.index.array instanceof Uint32Array) ? withIndex32(g) : g
  return g
}

function withIndex32(geometry: BufferGeometry): BufferGeometry {
  const index = geometry.index
  if (index) geometry.setIndex(new BufferAttribute(Uint32Array.from(index.array as ArrayLike<number>), 1))
  return geometry
}

/** Paints a part's colour and its per-vertex numbers onto its geometry, as the attributes `color` and `aFinish`. */
export function painted(part: Part): BufferGeometry {
  const geometry = normalized(part.geometry)
  const count = geometry.getAttribute('position').count
  const color = new Float32Array(count * 3)
  const finish = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    color.set([part.color.r, part.color.g, part.color.b], i * 3)
    finish.set(part.finish, i * 3)
  }
  geometry.setAttribute('color', new BufferAttribute(color, 3))
  geometry.setAttribute('aFinish', new BufferAttribute(finish, 3))
  return geometry
}

/** Many painted geometries as one: what a whole static set's surface draws in a single call. */
export function merged(geometries: readonly BufferGeometry[]): BufferGeometry | null {
  if (geometries.length === 0) return null
  const out = geometries.length === 1 ? geometries[0].clone() : mergeGeometries([...geometries], false)
  if (!out) return null
  out.computeBoundingSphere()
  out.computeBoundingBox()
  return out
}
