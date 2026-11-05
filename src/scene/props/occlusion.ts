/*
 * Ambient occlusion, baked once on a static set when it is built (scene kit v1): so the corner where the counter meets the wall, the
 * inside of a hotel pan and the floor under a station darken, at every tier, for no cost per frame.
 *
 * How. The set's triangles are sampled into a grid of voxels a few centimetres across, over the props' own bounds (a wide floor or
 * wall adds no volume, only what lies near the props); then each vertex looks along a fixed fan of directions over its normal, a
 * voxel at a time, out to `radius`, and the share of the fan that meets something (nearer counts more, and a direction near the
 * normal more than one along the surface) darkens it. A vertex outside the grid is open. The grid caps its own size, so a large
 * set coarsens its voxels instead of growing the work. No random numbers: the same set bakes the same shade on every visit.
 *
 * The work is a generator that yields every few thousand vertices, so a scene can bake between frames and never hold the main
 * thread for long; `bakeOcclusion` runs it to the end at once, for a small set or a test.
 *
 * The shade is multiplied into the vertex colour, so it darkens a corner's reflections as well as its diffuse light, which is how a
 * stainless corner looks: dull where the room cannot reach it.
 */
import type { BufferGeometry } from 'three'

export interface OcclusionOptions {
  /** How far a vertex looks for what hides it, in metres [estimated]. */
  readonly radius?: number
  /** The finest voxel, in metres [estimated]. */
  readonly voxel?: number
  /** The most voxels the grid may have: past it, voxels coarsen [estimated]. */
  readonly maxVoxels?: number
  /** How dark a fully hidden vertex gets: 1 is black [estimated]. */
  readonly strength?: number
}

const DEFAULTS = { radius: 0.22, voxel: 0.018, maxVoxels: 1_000_000, strength: 0.72 } as const
/** Vertices a step shades before it yields [estimated: a few milliseconds of work on a laptop]. */
const CHUNK = 6000

/** The fan a vertex looks along: directions spread over the hemisphere about +z, denser near the normal (cosine-weighted). */
const FAN = (() => {
  const count = 10
  const out = new Float32Array(count * 3)
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < count; i++) {
    const z = Math.sqrt(1 - (i + 0.5) / count)
    const r = Math.sqrt(1 - z * z)
    out[i * 3] = Math.cos(i * golden) * r
    out[i * 3 + 1] = Math.sin(i * golden) * r
    out[i * 3 + 2] = z
  }
  return out
})()

/**
 * Bakes the shade of every vertex of every geometry, in the order given (1 open, lower hidden), yielding as it goes. `bound` says
 * which geometries set the grid's bounds: all of them unless given (a floor or a wall need not).
 */
export function* occlusionSteps(geometries: readonly BufferGeometry[], options: OcclusionOptions = {}, bound: readonly boolean[] = []): Generator<void, Float32Array[]> {
  const { radius, voxel: finest, maxVoxels, strength } = { ...DEFAULTS, ...options }
  let lo = [Infinity, Infinity, Infinity]
  let hi = [-Infinity, -Infinity, -Infinity]
  geometries.forEach((geometry, g) => {
    if (bound.length > 0 && !bound[g]) return
    const p = geometry.getAttribute('position').array
    for (let i = 0; i < p.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        if (p[i + a] < lo[a]) lo[a] = p[i + a]
        if (p[i + a] > hi[a]) hi[a] = p[i + a]
      }
    }
  })
  if (!Number.isFinite(lo[0])) return geometries.map((geometry) => new Float32Array(geometry.getAttribute('position').count).fill(1))
  lo = lo.map((v) => v - radius)
  hi = hi.map((v) => v + radius)
  const extent = hi.map((v, a) => v - lo[a])
  const size = Math.max(finest, Math.cbrt((extent[0] * extent[1] * extent[2]) / maxVoxels))
  const [nx, ny, nz] = extent.map((e) => Math.max(1, Math.ceil(e / size)))
  const solid = new Uint8Array(nx * ny * nz)
  const inv = 1 / size

  // Every triangle into the grid, sampled at under a voxel's spacing; a triangle wholly outside it is skipped.
  for (const geometry of geometries) {
    const p = geometry.getAttribute('position').array
    const index = geometry.index?.array
    const triangles = index ? index.length / 3 : p.length / 9
    for (let t = 0; t < triangles; t++) {
      const a = (index ? index[t * 3] : t * 3) * 3
      const b = (index ? index[t * 3 + 1] : t * 3 + 1) * 3
      const c = (index ? index[t * 3 + 2] : t * 3 + 2) * 3
      let outside = false
      for (let axis = 0; axis < 3 && !outside; axis++) {
        const min = Math.min(p[a + axis], p[b + axis], p[c + axis])
        const max = Math.max(p[a + axis], p[b + axis], p[c + axis])
        outside = max < lo[axis] || min > hi[axis]
      }
      if (outside) continue
      const longest = Math.max(
        Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]),
        Math.hypot(p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]),
        Math.hypot(p[c] - p[b], p[c + 1] - p[b + 1], p[c + 2] - p[b + 2]),
      )
      const n = Math.max(1, Math.ceil(longest / (size * 0.7)))
      for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= n - i; j++) {
          const u = i / n
          const v = j / n
          const w = 1 - u - v
          const x = Math.floor((p[a] * w + p[b] * u + p[c] * v - lo[0]) * inv)
          const y = Math.floor((p[a + 1] * w + p[b + 1] * u + p[c + 1] * v - lo[1]) * inv)
          const z = Math.floor((p[a + 2] * w + p[b + 2] * u + p[c + 2] * v - lo[2]) * inv)
          if (x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz) solid[(z * ny + y) * nx + x] = 1
        }
      }
    }
    yield
  }

  // Each vertex looks along the fan, from just off its own surface.
  const steps = Math.max(2, Math.ceil(radius / size))
  const fan = FAN.length / 3
  const shades: Float32Array[] = []
  let done = 0
  for (const geometry of geometries) {
    const p = geometry.getAttribute('position').array
    const nrm = geometry.getAttribute('normal').array
    const count = p.length / 3
    const shade = new Float32Array(count).fill(1)
    for (let v = 0; v < count; v++) {
      // In voxel units from the grid's corner.
      let ux = nrm[v * 3]
      let uy = nrm[v * 3 + 1]
      let uz = nrm[v * 3 + 2]
      const length = Math.hypot(ux, uy, uz) || 1
      ux /= length
      uy /= length
      uz /= length
      const ox = (p[v * 3] - lo[0]) * inv + ux * 1.6
      const oy = (p[v * 3 + 1] - lo[1]) * inv + uy * 1.6
      const oz = (p[v * 3 + 2] - lo[2]) * inv + uz * 1.6
      if (ox < 0 || oy < 0 || oz < 0 || ox >= nx || oy >= ny || oz >= nz) continue
      // A basis about the normal.
      const ax = Math.abs(ux) < 0.9 ? 1 : 0
      const ay = 1 - ax
      let tx = -uz * ay
      let ty = uz * ax
      let tz = ux * ay - uy * ax
      const tl = Math.hypot(tx, ty, tz) || 1
      tx /= tl
      ty /= tl
      tz /= tl
      const bx = uy * tz - uz * ty
      const by = uz * tx - ux * tz
      const bz = ux * ty - uy * tx
      let hidden = 0
      for (let k = 0; k < fan; k++) {
        const fx = FAN[k * 3]
        const fy = FAN[k * 3 + 1]
        const fz = FAN[k * 3 + 2]
        const dx = tx * fx + bx * fy + ux * fz
        const dy = ty * fx + by * fy + uy * fz
        const dz = tz * fx + bz * fy + uz * fz
        for (let s = 0; s < steps; s++) {
          const x = Math.floor(ox + dx * s)
          const y = Math.floor(oy + dy * s)
          const z = Math.floor(oz + dz * s)
          if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) break
          if (solid[(z * ny + y) * nx + x] === 1) {
            hidden += 1 - s / steps
            break
          }
        }
      }
      shade[v] = 1 - strength * (hidden / fan)
      done += 1
      if (done % CHUNK === 0) yield
    }
    shades.push(shade)
  }
  return shades
}

/** The shade of every vertex of every geometry, baked at once. */
export function bakeOcclusion(geometries: readonly BufferGeometry[], options: OcclusionOptions = {}, bound: readonly boolean[] = []): Float32Array[] {
  const steps = occlusionSteps(geometries, options, bound)
  for (;;) {
    const next = steps.next()
    if (next.done) return next.value
  }
}
