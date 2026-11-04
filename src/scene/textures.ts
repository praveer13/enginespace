/*
 * The materials' surface detail, generated in code (TRACKER W0-T15): height fields for brushed stainless, ticket paper and
 * masking tape, and the normal and roughness maps made from them. No image asset ships, so no raster needs provenance and
 * nothing is fetched (D-033). Every field tiles (it wraps at its edges) and is seeded, so the steel looks the same on every
 * visit and a test can hash it.
 *
 * Plain arrays and arithmetic, with no three in it: materials.ts wraps the maps in textures.
 */

/** A square height field, row-major, values in [0, 1]. Row 0 is v = 0, the bottom of the texture. */
export interface Field {
  readonly size: number
  readonly data: Float32Array
}

/** A 2D integer hash in [0, 1): seeded white noise. */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const wrap = (i: number, n: number) => ((i % n) + n) % n

function noise(size: number, seed: number): Float32Array {
  const data = new Float32Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data[y * size + x] = hash2(x, y, seed)
  return data
}

/** A box blur of `radius` along x (rows) or y (columns), wrapping: a running sum, so its cost does not grow with the radius. */
function blur(data: Float32Array, size: number, radius: number, axis: 'x' | 'y'): Float32Array {
  const out = new Float32Array(size * size)
  const span = 2 * radius + 1
  for (let line = 0; line < size; line++) {
    const at = (i: number) => (axis === 'x' ? line * size + wrap(i, size) : wrap(i, size) * size + line)
    let sum = 0
    for (let i = -radius; i <= radius; i++) sum += data[at(i)]
    for (let i = 0; i < size; i++) {
      out[at(i)] = sum / span
      sum += data[at(i + radius + 1)] - data[at(i - radius)]
    }
  }
  return out
}

/** Stretches values to fill [0, 1]. */
function normalize(data: Float32Array): Float32Array {
  let lo = Number.POSITIVE_INFINITY
  let hi = Number.NEGATIVE_INFINITY
  for (const value of data) {
    if (value < lo) lo = value
    if (value > hi) hi = value
  }
  const range = hi - lo || 1
  for (let i = 0; i < data.length; i++) data[i] = (data[i] - lo) / range
  return data
}

/** Smooth value noise with `cells` cells across, for slow variation (wraps). */
function valueNoise(size: number, cells: number, seed: number): Float32Array {
  const data = new Float32Array(size * size)
  const smooth = (t: number) => t * t * (3 - 2 * t)
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cells
    const y0 = Math.floor(fy)
    const ty = smooth(fy - y0)
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells
      const x0 = Math.floor(fx)
      const tx = smooth(fx - x0)
      const corner = (cx: number, cy: number) => hash2(wrap(cx, cells), wrap(cy, cells), seed)
      const top = corner(x0, y0) * (1 - tx) + corner(x0 + 1, y0) * tx
      const bottom = corner(x0, y0 + 1) * (1 - tx) + corner(x0 + 1, y0 + 1) * tx
      data[y * size + x] = top * (1 - ty) + bottom * ty
    }
  }
  return data
}

/**
 * Brushed stainless: streaks along u, the way the brush ran. White noise smeared along each row (two lengths, so the
 * streaks break up), a little across, and rows that the brush pressed harder.
 */
export function brushedField(size: number, seed: number): Field {
  const long = blur(blur(noise(size, seed), size, Math.max(2, size >> 3), 'x'), size, 1, 'y')
  const short = blur(noise(size, seed + 1), size, Math.max(1, size >> 6), 'x')
  const data = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    const pressure = 0.55 + 0.9 * hash2(0, y, seed + 2)
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      data[i] = (long[i] * 0.75 + short[i] * 0.25) * pressure
    }
  }
  return { size, data: normalize(data) }
}

/** Ticket paper: the bond's tooth, a scatter of fibres, and a slow cockle where the roll curled. */
export function paperField(size: number, seed: number): Field {
  const tooth = blur(blur(noise(size, seed), size, 1, 'x'), size, 1, 'y')
  const cockle = valueNoise(size, 4, seed + 1)
  const data = new Float32Array(size * size)
  for (let i = 0; i < data.length; i++) data[i] = tooth[i] * 0.6 + cockle[i] * 0.4
  // Fibres: short straight strands at random angles, pressed into the sheet.
  const fibres = size * 2
  for (let f = 0; f < fibres; f++) {
    const x0 = hash2(f, 1, seed + 3) * size
    const y0 = hash2(f, 2, seed + 3) * size
    const angle = hash2(f, 3, seed + 3) * Math.PI
    const length = 4 + hash2(f, 4, seed + 3) * 14
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    for (let s = 0; s < length; s++) {
      const x = wrap(Math.round(x0 + dx * s), size)
      const y = wrap(Math.round(y0 + dy * s), size)
      data[y * size + x] += 0.12
    }
  }
  return { size, data: normalize(data) }
}

/** Masking tape: the crepe's fine ridges across the strip (along u), wavering as the paper was creped, over its tooth. */
export function crepeField(size: number, seed: number): Field {
  const waver = valueNoise(size, 3, seed)
  const tooth = blur(noise(size, seed + 1), size, 1, 'y')
  const ridges = Math.max(8, size >> 3)
  const data = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const phase = (x / size) * ridges + waver[i] * 2.5
      const ridge = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2)
      data[i] = ridge * 0.7 + tooth[i] * 0.3
    }
  }
  return { size, data: normalize(data) }
}

/**
 * A tangent-space normal map (OpenGL convention, +v up) from a height field, as RGBA bytes. `strength` scales the slopes:
 * small for paper, more for the crepe.
 */
export function normalMap(field: Field, strength: number): Uint8Array {
  const { size, data } = field
  const out = new Uint8Array(size * size * 4)
  const h = (x: number, y: number) => data[wrap(y, size) * size + wrap(x, size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const du = (h(x + 1, y) - h(x - 1, y)) * strength
      const dv = (h(x, y + 1) - h(x, y - 1)) * strength
      const length = Math.hypot(du, dv, 1)
      const i = (y * size + x) * 4
      out[i] = Math.round(((-du / length) * 0.5 + 0.5) * 255)
      out[i + 1] = Math.round(((-dv / length) * 0.5 + 0.5) * 255)
      out[i + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255)
      out[i + 3] = 255
    }
  }
  return out
}

/** A roughness map as RGBA bytes, grey, so three's green channel reads it: `base` at mid height, ± `range` / 2. */
export function roughnessMap(field: Field, base: number, range: number): Uint8Array {
  const { size, data } = field
  const out = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const value = Math.round(Math.min(1, Math.max(0, base + (data[i] - 0.5) * range)) * 255)
    out[i * 4] = value
    out[i * 4 + 1] = value
    out[i * 4 + 2] = value
    out[i * 4 + 3] = 255
  }
  return out
}

/** The mean slope of a field along u and along v: how strongly it is brushed one way (a test reads it). */
export function meanSlopes(field: Field): { u: number; v: number } {
  const { size, data } = field
  let u = 0
  let v = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const here = data[y * size + x]
      u += Math.abs(data[y * size + wrap(x + 1, size)] - here)
      v += Math.abs(data[wrap(y + 1, size) * size + x] - here)
    }
  }
  return { u: u / data.length, v: v / data.length }
}
