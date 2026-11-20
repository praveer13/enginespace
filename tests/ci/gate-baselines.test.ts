/*
 * W2b-T03: scripts/gate/baselines.ts. Its PNG decoder and its comparison, on small images that this test encodes itself, with each of the
 * five filters. The regeneration (a browser run) is the merge script's, and is not started here.
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import { both, compare, countDiff, decodePng, repoRoot } from '../../scripts/gate/baselines'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (bytes: Buffer): number => {
  let c = 0xffffffff
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, 'latin1')
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), body])), 0)
  return Buffer.concat([head, body, tail])
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** An 8-bit PNG of `channels` (3 or 4) whose rows are encoded with `filters[y % filters.length]`. `rows[y]` holds the raw bytes of row y. */
function encode(width: number, rows: number[][], channels: 3 | 4, filters: number[] = [0], opts: { interlace?: number; depth?: number } = {}): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(rows.length, 4)
  header[8] = opts.depth ?? 8
  header[9] = channels === 3 ? 2 : 6
  header[12] = opts.interlace ?? 0
  const out: number[] = []
  rows.forEach((row, y) => {
    const filter = filters[y % filters.length]
    out.push(filter)
    row.forEach((value, x) => {
      const a = x >= channels ? row[x - channels] : 0
      const b = y > 0 ? rows[y - 1][x] : 0
      const c = y > 0 && x >= channels ? rows[y - 1][x - channels] : 0
      const predictor = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter]
      out.push((value - predictor) & 0xff)
    })
  })
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from(out))), chunk('IEND', Buffer.alloc(0))])
}

const rgba = (n: number, seed = 1): number[][] => Array.from({ length: 4 }, (_, y) => Array.from({ length: n * 4 }, (_, x) => (x * 37 + y * 101 + seed * 13 + ((x * y) % 7)) & 0xff))

describe('decodePng', () => {
  test('reads RGBA under each of the five filters', () => {
    const rows = rgba(5)
    for (const filter of [0, 1, 2, 3, 4]) expect(Array.from(decodePng(encode(5, rows, 4, [filter])).pixels)).toEqual(rows.flat())
  })

  test('reads RGB with every filter in turn, and gives each pixel an opaque alpha', () => {
    const rows = Array.from({ length: 5 }, (_, y) => Array.from({ length: 12 }, (_, x) => (x * 53 + y * 29 + 3) & 0xff))
    const image = decodePng(encode(4, rows, 3, [0, 1, 2, 3, 4]))
    expect([image.width, image.height]).toEqual([4, 5])
    const want: number[] = []
    for (const row of rows) for (let i = 0; i < 4; i++) want.push(row[i * 3], row[i * 3 + 1], row[i * 3 + 2], 255)
    expect(Array.from(image.pixels)).toEqual(want)
  })

  test('refuses what it does not read, and says why', () => {
    expect(() => decodePng(Buffer.from('not a png at all'))).toThrow('signature')
    expect(() => decodePng(encode(5, rgba(5), 4, [0], { interlace: 1 }))).toThrow('interlaced')
    expect(() => decodePng(encode(5, rgba(5), 4, [0], { depth: 16 }))).toThrow('bit depth 16')
  })
})

describe('countDiff and compare', () => {
  const same = encode(5, rgba(5), 4, [0])
  const reencoded = encode(5, rgba(5), 4, [4, 1, 2, 3])

  test('counts the pixels that differ in any channel, and none for the same pixels', () => {
    expect(countDiff(decodePng(same), decodePng(reencoded))).toBe(0)
    const rows = rgba(5)
    rows[0][0] ^= 1
    rows[2][19] ^= 0x80
    rows[2][18] ^= 0x80
    expect(countDiff(decodePng(same), decodePng(encode(5, rows, 4)))).toBe(2)
  })

  test('two sizes differ in every pixel of the larger', () => {
    expect(countDiff(decodePng(same), decodePng(encode(6, rgba(6), 4)))).toBe(24)
  })

  test('a file that only re-encodes is no difference; a changed pixel is, with its share', () => {
    const rows = rgba(5)
    rows[1][4] ^= 1
    const changed = encode(5, rows, 4)
    const made = compare(
      new Map([
        ['a.png', same],
        ['b.png', same],
        ['c.png', same],
      ]),
      new Map([
        ['a.png', reencoded],
        ['b.png', changed],
        ['c.png', same],
      ]),
    )
    expect(made).toEqual([{ path: 'b.png', count: 1, total: 20 }])
  })

  test('an image with no committed picture differs in all of its pixels', () => {
    expect(compare(new Map([['n.png', undefined]]), new Map([['n.png', same]]))).toEqual([{ path: 'n.png', count: 20, total: 20 }])
  })

  test('only an image that differs in both rounds is reported', () => {
    const one = [
      { path: 'a.png', count: 3, total: 10 },
      { path: 'b.png', count: 1, total: 10 },
    ]
    const two = [
      { path: 'b.png', count: 2, total: 10 },
      { path: 'c.png', count: 5, total: 10 },
    ]
    expect(both(one, two)).toEqual([{ path: 'b.png', count: 2, total: 10 }])
  })
})

describe('the root of the run', () => {
  const main = mkdtempSync(path.join(os.tmpdir(), 'es-baselines-'))
  const second = `${main}-second`
  const git = (cwd: string, ...args: string[]) => {
    const run = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' })
    if (run.status !== 0) throw new Error(run.stderr)
    return run.stdout
  }
  const script = path.resolve(import.meta.dirname, '../../scripts/gate/baselines.ts')

  test('is the git top level of the working directory, in a second worktree and in a folder inside it', () => {
    git(main, 'init', '-q', '-b', 'base')
    writeFileSync(path.join(main, 'a.txt'), 'a\n')
    git(main, 'add', '-A')
    git(main, 'commit', '-q', '-m', 'base')
    git(main, 'worktree', 'add', '-q', '-b', 'other', second)
    mkdirSync(path.join(second, 'e2e/deep'), { recursive: true })
    try {
      expect(repoRoot(second)).toBe(realpathSync(second))
      expect(repoRoot(path.join(second, 'e2e/deep'))).toBe(realpathSync(second))
      expect(repoRoot(main)).toBe(realpathSync(main))
      // The script lives in this checkout; run with the second worktree as the working directory, its root is the second worktree.
      const run = spawnSync('bun', ['-e', `import { repoRoot } from ${JSON.stringify(script)}; console.log(repoRoot())`], { cwd: second, encoding: 'utf8' })
      expect(run.stderr).toBe('')
      expect(run.stdout.trim()).toBe(realpathSync(second))
    } finally {
      rmSync(second, { recursive: true, force: true })
      rmSync(main, { recursive: true, force: true })
    }
  })

  test('on this checkout is the checkout that holds the script', () => {
    expect(repoRoot()).toBe(realpathSync(path.resolve(import.meta.dirname, '../..')))
  })
})
