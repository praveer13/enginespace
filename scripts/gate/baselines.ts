/*
 * The merge gate's check that the committed screenshot baselines are the pictures that the page draws (W2b-T03). A baseline that differed
 * from the page by just under the 1 percent tolerance passed every local run and failed in CI at 1.05 percent, and ten were found stale that
 * way (2026-11-19). So this regenerates every baseline in the checkout and counts the pixels that differ AT ALL.
 *
 *   bun scripts/gate/baselines.ts
 *
 * It runs `npx playwright test --project=smoke e2e/screenshots.spec.ts --update-snapshots=all --workers=2` (ES_CHROMIUM and ES_E2E_PORT come
 * from the environment), decodes the committed image (git show HEAD:<path>) and the regenerated one, and counts the differing pixels. A file
 * that only re-encodes with the same pixels is no difference. When any image differs it regenerates once more and reports only the images
 * that differ from the committed one in both runs, so a timing wobble is not a refusal. It always restores the committed files before it
 * exits, prints each differing image with its count and its share of the pixels, and exits 1 if any remains.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { inflateSync } from 'node:zlib'

/**
 * The top level of the git checkout that `from` (the working directory) is in. The merge script runs this from the tree under test, which is
 * not always the tree that holds the script (a script run by path from another worktree used to read that other worktree's baselines).
 */
export function repoRoot(from: string = process.cwd()): string {
  return path.resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: from, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim())
}

let root: string | undefined
/** The root of the run, found once from the working directory. */
const ROOT_OF_RUN = (): string => (root ??= repoRoot())

export interface Image {
  readonly width: number
  readonly height: number
  /** RGBA, four bytes a pixel, row by row. */
  readonly pixels: Uint8Array
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** An 8-bit RGB or RGBA, non-interlaced PNG as RGBA pixels. Anything else throws, and says what it was. */
export function decodePng(bytes: Uint8Array): Image {
  const data = Buffer.from(bytes)
  if (data.length < 8 || !data.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG: the signature is wrong')
  let width = 0
  let height = 0
  let channels = 0
  const idat: Buffer[] = []
  let at = 8
  while (at + 8 <= data.length) {
    const size = data.readUInt32BE(at)
    const type = data.toString('latin1', at + 4, at + 8)
    const body = data.subarray(at + 8, at + 8 + size)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      const depth = body[8]
      const colour = body[9]
      if (depth !== 8 || (colour !== 2 && colour !== 6)) throw new Error(`unsupported PNG: bit depth ${depth}, colour type ${colour} (only 8-bit RGB and RGBA)`)
      if (body[12] !== 0) throw new Error('unsupported PNG: interlaced')
      channels = colour === 2 ? 3 : 4
    } else if (type === 'IDAT') idat.push(body)
    else if (type === 'IEND') break
    at += 12 + size
  }
  if (!width || !height || !channels) throw new Error('not a PNG: no IHDR')
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  if (raw.length !== (stride + 1) * height) throw new Error(`PNG data is ${raw.length} bytes, and a ${width} x ${height} image holds ${(stride + 1) * height}`)
  const rows = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    const out = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? rows[out + x - channels] : 0
      const b = y > 0 ? rows[out - stride + x] : 0
      const c = y > 0 && x >= channels ? rows[out - stride + x - channels] : 0
      let add: number
      switch (filter) {
        case 0:
          add = 0
          break
        case 1:
          add = a
          break
        case 2:
          add = b
          break
        case 3:
          add = (a + b) >> 1
          break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
          break
        }
        default:
          throw new Error(`PNG row ${y} has filter ${filter}, and there are five`)
      }
      rows[out + x] = (raw[src + x] + add) & 0xff
    }
  }
  const pixels = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    for (let k = 0; k < 3; k++) pixels[i * 4 + k] = rows[i * channels + k]
    pixels[i * 4 + 3] = channels === 4 ? rows[i * 4 + 3] : 255
  }
  return { width, height, pixels }
}

/** The pixels that differ in any channel. Images of two sizes differ in every pixel of the larger. */
export function countDiff(a: Image, b: Image): number {
  if (a.width !== b.width || a.height !== b.height) return Math.max(a.width * a.height, b.width * b.height)
  let count = 0
  for (let i = 0; i < a.width * a.height; i++) {
    const j = i * 4
    if (a.pixels[j] !== b.pixels[j] || a.pixels[j + 1] !== b.pixels[j + 1] || a.pixels[j + 2] !== b.pixels[j + 2] || a.pixels[j + 3] !== b.pixels[j + 3]) count++
  }
  return count
}

export interface Difference {
  readonly path: string
  readonly count: number
  readonly total: number
}

/** The pictures, by path, whose bytes differ and whose pixels differ. A path with no committed picture differs in all of its pixels. */
export function compare(committed: ReadonlyMap<string, Uint8Array | undefined>, regenerated: ReadonlyMap<string, Uint8Array>): Difference[] {
  const out: Difference[] = []
  for (const [file, now] of regenerated) {
    const was = committed.get(file)
    const after = decodePng(now)
    if (was === undefined) {
      out.push({ path: file, count: after.width * after.height, total: after.width * after.height })
      continue
    }
    if (Buffer.compare(Buffer.from(was), Buffer.from(now)) === 0) continue
    const before = decodePng(was)
    const count = countDiff(before, after)
    if (count > 0) out.push({ path: file, count, total: Math.max(before.width * before.height, after.width * after.height) })
  }
  return out.sort((x, y) => (x.path < y.path ? -1 : 1))
}

/** The images that differ in both rounds, with the second round's count. */
export function both(first: readonly Difference[], second: readonly Difference[]): Difference[] {
  const named = new Set(first.map((difference) => difference.path))
  return second.filter((difference) => named.has(difference.path))
}

const SNAPSHOTS = ':(glob)e2e/**/*-snapshots/*.png'
const git = (args: string[]): Buffer => execFileSync('git', args, { cwd: ROOT_OF_RUN(), maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] })
const lines = (args: string[]): string[] => git(args).toString('utf8').split('\n').filter(Boolean)

function regenerate(): { code: number | null; tail: string } {
  const run = spawnSync('npx', ['playwright', 'test', '--project=smoke', 'e2e/screenshots.spec.ts', '--update-snapshots=all', '--workers=2'], { cwd: ROOT_OF_RUN(), encoding: 'utf8', maxBuffer: 1 << 28 })
  const tail = `${run.stderr ?? ''}${run.stdout ?? ''}`.split('\n').filter(Boolean).slice(-15).join('\n')
  return { code: run.status, tail }
}

/** What the last regeneration changed: the modified baselines, and the ones that had no committed picture. */
function round(before: ReadonlySet<string>): Difference[] {
  const modified = lines(['diff', '--name-only', '--', SNAPSHOTS])
  const fresh = lines(['ls-files', '--others', '--exclude-standard', '--', SNAPSHOTS]).filter((file) => !before.has(file))
  const committed = new Map<string, Uint8Array | undefined>()
  const regenerated = new Map<string, Uint8Array>()
  for (const file of modified) {
    committed.set(file, git(['show', `HEAD:${file}`]))
    regenerated.set(file, readFileSync(path.join(ROOT_OF_RUN(), file)))
  }
  for (const file of fresh) {
    committed.set(file, undefined)
    regenerated.set(file, readFileSync(path.join(ROOT_OF_RUN(), file)))
  }
  return compare(committed, regenerated)
}

export function main(): number {
  const before = new Set(lines(['ls-files', '--others', '--exclude-standard', '--', SNAPSHOTS]))
  const restore = () => {
    git(['checkout', '--', SNAPSHOTS])
    for (const file of lines(['ls-files', '--others', '--exclude-standard', '--', SNAPSHOTS])) if (!before.has(file) && existsSync(path.join(ROOT_OF_RUN(), file))) rmSync(path.join(ROOT_OF_RUN(), file))
  }
  try {
    const first = regenerate()
    if (first.code !== 0) {
      console.log(`the screenshots spec did not run clean (exit ${first.code}):\n${first.tail}`)
      return 1
    }
    let differing = round(before)
    if (differing.length > 0) {
      restore()
      const second = regenerate()
      if (second.code !== 0) {
        console.log(`the screenshots spec did not run clean on the second round (exit ${second.code}):\n${second.tail}`)
        return 1
      }
      differing = both(differing, round(before))
    }
    for (const difference of differing) console.log(`${difference.path}: ${difference.count} of ${difference.total} pixels differ (${((100 * difference.count) / difference.total).toFixed(3)} percent)`)
    if (differing.length > 0) console.log(`# ${differing.length} baseline(s) differ from the page in two regenerations: regenerate them, read the old and the new picture of each, and list each`)
    else console.log('every committed baseline is the picture that the page draws')
    return differing.length > 0 ? 1 : 0
  } finally {
    restore()
  }
}

if (import.meta.main) process.exit(main())
