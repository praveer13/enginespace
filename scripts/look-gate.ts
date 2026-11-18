/**
 * look-gate: serves the two builds of the look gate side by side, shoots the same five screens in each, and cleans up (R-T20,
 * docs/REDESIGN.md section 6 row 1, docs/waves/WR-look.md).
 *
 *   bun scripts/look-gate.ts serve [--a-ref <ref>] [--b-ref <ref>] [--a-port 4301] [--b-port 4302]
 *       Makes a scratch worktree of each build under the system's temporary folder, links this checkout's packages into it (a hard-link
 *       copy, never a symlink), builds it, and serves its dist with `vite preview` until the command is stopped. Build A is the tag
 *       wave-r-stage1 (the new names, the way on, the lesson and the frame, under The Pass) and build B is `wave-r` (the same, under
 *       Data Book).
 *   bun scripts/look-gate.ts shoot [--a-port 4301] [--b-port 4302] [--out docs/waves/wr-look] [--only <screen>]
 *       With both builds served, shoots the five screens at 1440 x 900 and 390 x 844 in each, as PNGs of the viewport, and writes
 *       shots.json beside them: what each image holds, its size, and the SHA of the build that drew it.
 *   bun scripts/look-gate.ts clean
 *       Removes the two scratch worktrees.
 *
 * The browser is Playwright's Chromium, or the one that ES_CHROMIUM names. Nothing leaves the machine: both builds are served from
 * localhost and the page's own policy refuses the rest. The two builds are the only difference between a pair of images: each is a
 * fresh browser context (no stored state), the same route, the same keys and clicks, and the same viewport.
 *
 * `SCREENS`, `VIEWPORTS` and `shrink` are exported for tests/docs/look-gate.test.ts.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import { chromium } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'

const root = path.resolve(import.meta.dirname, '..')
const scratch = path.join(tmpdir(), 'enginespace-look-gate')

export type Build = 'a' | 'b'

export interface Viewport {
  readonly name: '1440' | '390'
  readonly width: number
  readonly height: number
  /** A phone in the hand: touch, and the mobile viewport. */
  readonly phone: boolean
}

export const VIEWPORTS: readonly Viewport[] = [
  { name: '1440', width: 1440, height: 900, phone: false },
  { name: '390', width: 390, height: 844, phone: true },
]

export interface Screen {
  readonly id: 'front' | 'front-step-3d' | 'pool' | 'lesson' | 'loop'
  readonly route: string
  /** The state the shot is taken in, in a sentence. */
  readonly state: string
  /** The page's own words for the keys and clicks, so that the same ones are made in both builds. */
  readonly doing: (page: Page) => Promise<string>
}

/** The largest a committed image may be (the task's limit), and where `shrink` starts. */
export const MAX_BYTES = 300 * 1024

/** Build A is this tag, which exists in the clone that made it; its commit is in the branch's history, so a clone without the tag uses that. */
const BUILD_A_REF = 'wave-r-stage1'
const BUILD_A_COMMIT = '094089c'
const BUILD_B_REF = 'wave-r'

const settle = async (page: Page, ms = 3000): Promise<void> => {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

/** Clicks a control that may sit under another box of the page's own layout, by its accessible name; false when it is not there. */
const press = async (page: Page, name: string | RegExp, exact = false): Promise<boolean> => {
  const control = page.getByRole('button', { name, exact }).first()
  if ((await control.count()) === 0) return false
  await control.click({ force: true })
  return true
}

export const SCREENS: readonly Screen[] = [
  {
    id: 'front',
    route: '/',
    state: 'The front page at first paint, as a first visit meets it once its fonts are in and its scene has loaded.',
    doing: async (page) => {
      await settle(page, 5000)
      return 'nothing pressed'
    },
  },
  {
    id: 'front-step-3d',
    route: '/',
    state: 'The front page after one step: R1 and R2 admitted, Step pressed, with the 3D view on where the page offers it.',
    doing: async (page) => {
      await settle(page, 3000)
      const three = (await press(page, /^3D/)) ? '3D view' : '2D view (this build offers no 3D at this width)'
      await page.waitForTimeout(5000)
      for (const no of ['R1', 'R2']) await press(page, `Admit request ${no} into a batch slot`)
      await press(page, /^Step/)
      await page.waitForTimeout(2500)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(300)
      return three
    },
  },
  {
    id: 'pool',
    route: '/play/pool',
    state: 'The KV page pool at its first run: a first visit, with the first-run intro on the diagram.',
    doing: async (page) => {
      await settle(page, 3000)
      return 'nothing pressed'
    },
  },
  {
    id: 'lesson',
    route: '/m/tr5a/l1-why-one-model-needs-several-kv-caches',
    state: 'TR5a lesson 1 midway through Read: the page scrolled so that the middle of the Read section is the middle of the viewport.',
    doing: async (page) => {
      await settle(page, 2500)
      await page.evaluate(() => {
        const top = (id: string): number => (document.getElementById(id)?.getBoundingClientRect().top ?? 0) + window.scrollY
        const middle = (top('read') + top('test')) / 2
        window.scrollTo(0, Math.max(0, middle - window.innerHeight / 2))
      })
      await page.waitForTimeout(1200)
      return 'scrolled to the middle of Read'
    },
  },
  {
    id: 'loop',
    route: '/play/loop?level=first-3-gap',
    state: 'The step loop on demo level 3 ("Close a bubble") with async scheduling on, the intro skipped.',
    doing: async (page) => {
      await settle(page, 3000)
      const link = page.getByRole('button', { name: 'Skip intro', exact: true }).first()
      if ((await link.count()) > 0) await link.click({ force: true })
      // The page's own switch, by its name, so that both builds are asked the same way.
      const flip = page.getByRole('switch', { name: /async scheduling/i }).first()
      if ((await flip.count()) > 0) await flip.click({ force: true })
      else {
        await page.locator('body').click({ position: { x: 2, y: 2 } })
        await page.keyboard.press('o')
      }
      await page.waitForTimeout(2000)
      // Clicking a control below the fold scrolls the page to it in one build and not in another: both are shot from the top.
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(300)
      return 'async scheduling switched on'
    },
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The images: a viewport's PNG, and a smaller PNG of the same pixels when it is over the limit                       */
/* ------------------------------------------------------------------------------------------------------------------ */

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of bytes) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  out.set(data, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

/**
 * An indexed PNG of the same pixels, at most 256 colours, chosen by median cut over the colours at 5 bits a channel. A brushed-steel
 * texture is noise to a PNG, and a palette keeps the picture's look while its bytes drop to a third.
 */
export function shrink(rgba: Uint8ClampedArray, width: number, height: number): Buffer {
  const counts = new Map<number, number>()
  for (let i = 0; i < rgba.length; i += 4) {
    const key = ((rgba[i] ?? 0) >> 3) << 10 | ((rgba[i + 1] ?? 0) >> 3) << 5 | ((rgba[i + 2] ?? 0) >> 3)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const unpack = (key: number): [number, number, number] => [(key >> 10) & 31, (key >> 5) & 31, key & 31]
  let boxes: number[][] = [[...counts.keys()]]
  while (boxes.length < 256) {
    // Split the box with the widest range, at the median pixel of its widest channel.
    let pick = -1
    let widest = 0
    let channel = 0
    boxes.forEach((box, at) => {
      if (box.length < 2) return
      for (let c = 0; c < 3; c++) {
        let lo = 31
        let hi = 0
        for (const key of box) {
          const v = unpack(key)[c] ?? 0
          lo = Math.min(lo, v)
          hi = Math.max(hi, v)
        }
        if (hi - lo > widest) {
          widest = hi - lo
          pick = at
          channel = c
        }
      }
    })
    if (pick < 0) break
    const box = (boxes[pick] ?? []).slice().sort((p, q) => (unpack(p)[channel] ?? 0) - (unpack(q)[channel] ?? 0))
    let total = 0
    for (const key of box) total += counts.get(key) ?? 0
    let run = 0
    let cut = 1
    for (let i = 0; i < box.length - 1; i++) {
      run += counts.get(box[i] ?? 0) ?? 0
      cut = i + 1
      if (run * 2 >= total) break
    }
    boxes = [...boxes.slice(0, pick), box.slice(0, cut), box.slice(cut), ...boxes.slice(pick + 1)]
  }
  const palette = new Uint8Array(boxes.length * 3)
  const index = new Map<number, number>()
  boxes.forEach((box, at) => {
    let n = 0
    const sum = [0, 0, 0]
    for (const key of box) {
      const weight = counts.get(key) ?? 0
      n += weight
      unpack(key).forEach((v, c) => (sum[c] = (sum[c] ?? 0) + v * weight))
      index.set(key, at)
    }
    for (let c = 0; c < 3; c++) palette[at * 3 + c] = Math.min(255, Math.round(((sum[c] ?? 0) / Math.max(1, n)) * 8 + 4))
  })
  const pixels = new Uint8Array(width * height)
  for (let p = 0; p < width * height; p++) {
    const key = ((rgba[p * 4] ?? 0) >> 3) << 10 | ((rgba[p * 4 + 1] ?? 0) >> 3) << 5 | ((rgba[p * 4 + 2] ?? 0) >> 3)
    pixels[p] = index.get(key) ?? 0
  }
  // Each row takes the filter (none, sub or up) with the smallest sum of absolute bytes.
  const raw = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y++) {
    const best: { sum: number; filter: number; row: Uint8Array } = { sum: Infinity, filter: 0, row: new Uint8Array(width) }
    for (const filter of [0, 1, 2]) {
      const row = new Uint8Array(width)
      let sum = 0
      for (let x = 0; x < width; x++) {
        const here = pixels[y * width + x] ?? 0
        const left = x > 0 ? (pixels[y * width + x - 1] ?? 0) : 0
        const up = y > 0 ? (pixels[(y - 1) * width + x] ?? 0) : 0
        const value = (filter === 0 ? here : filter === 1 ? here - left : here - up) & 255
        row[x] = value
        sum += value > 127 ? 256 - value : value
      }
      if (sum < best.sum) {
        best.sum = sum
        best.filter = filter
        best.row = row
      }
    }
    raw[y * (width + 1)] = best.filter
    raw.set(best.row, y * (width + 1) + 1)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 3, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('PLTE', palette),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ])
}

/** The viewport as a PNG that is at most MAX_BYTES: the browser's own when it is, and an indexed one of the same pixels when it is not. */
async function capture(browser: Browser, page: Page): Promise<{ png: Buffer; palette: boolean }> {
  const png = await page.screenshot({ type: 'png' })
  if (png.length <= MAX_BYTES) return { png, palette: false }
  const decoder = await browser.newPage()
  try {
    const pixels = await decoder.evaluate(async (base64: string) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d')
      if (context === null) throw new Error('no 2d context')
      context.drawImage(bitmap, 0, 0)
      const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data
      let text = ''
      for (let i = 0; i < data.length; i += 0x8000) text += String.fromCharCode(...data.subarray(i, i + 0x8000))
      return { width: bitmap.width, height: bitmap.height, base64: btoa(text) }
    }, png.toString('base64'))
    const rgba = Uint8ClampedArray.from(Buffer.from(pixels.base64, 'base64'))
    return { png: shrink(rgba, pixels.width, pixels.height), palette: true }
  } finally {
    await decoder.close()
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The commands                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

function option(args: readonly string[], name: string, fallback: string): string {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? (args[at + 1] ?? fallback) : fallback
}

const git = (...args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()

const worktree = (build: Build): string => path.join(scratch, build)

/** A ref that resolves in this clone; build A's tag falls back to its commit when the clone has no tag. */
function resolvable(ref: string): string {
  if (ref !== BUILD_A_REF) return ref
  try {
    execFileSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { stdio: 'ignore' })
    return ref
  } catch {
    return BUILD_A_COMMIT
  }
}

function prepare(build: Build, ref: string): string {
  const dir = worktree(build)
  mkdirSync(scratch, { recursive: true })
  if (!existsSync(dir)) {
    git('worktree', 'add', '--detach', dir, resolvable(ref))
    // The packages are hard-linked, never symlinked; a checkout with none installs its own.
    if (existsSync(path.join(root, 'node_modules'))) execFileSync('cp', ['-al', path.join(root, 'node_modules'), path.join(dir, 'node_modules')])
    else execFileSync('npm', ['ci'], { cwd: dir, stdio: 'inherit' })
  }
  execFileSync('npm', ['run', 'build'], { cwd: dir, stdio: 'ignore' })
  return execFileSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
}

function serve(args: readonly string[]): void {
  const builds: readonly { build: Build; ref: string; port: string }[] = [
    { build: 'a', ref: option(args, 'a-ref', BUILD_A_REF), port: option(args, 'a-port', '4301') },
    { build: 'b', ref: option(args, 'b-ref', BUILD_B_REF), port: option(args, 'b-port', '4302') },
  ]
  for (const { build, ref, port } of builds) {
    const sha = prepare(build, ref)
    const child = spawn('npx', ['vite', 'preview', '--port', port, '--strictPort'], { cwd: worktree(build), stdio: 'ignore' })
    process.on('exit', () => child.kill())
    console.log(`build ${build.toUpperCase()} (${ref}, ${sha}) is at http://localhost:${port}/`)
  }
  console.log('Both are serving. Stop this command to stop them; `bun scripts/look-gate.ts clean` removes the scratch worktrees.')
  process.on('SIGINT', () => process.exit(0))
  setInterval(() => undefined, 1 << 30)
}

async function shoot(args: readonly string[]): Promise<void> {
  const ports: Record<Build, string> = { a: option(args, 'a-port', '4301'), b: option(args, 'b-port', '4302') }
  const out = path.resolve(root, option(args, 'out', 'docs/waves/wr-look'))
  mkdirSync(out, { recursive: true })
  const shas: Record<Build, string> = { a: '', b: '' }
  for (const build of ['a', 'b'] as const) {
    const dir = worktree(build)
    if (existsSync(dir)) shas[build] = execFileSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
  }
  const browser = await chromium.launch({
    executablePath: process.env.ES_CHROMIUM || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  // `--only <screen>` shoots one screen again and keeps the others' rows.
  const only = option(args, 'only', '')
  const kept: { screen?: string }[] = existsSync(path.join(out, 'shots.json')) ? (JSON.parse(readFileSync(path.join(out, 'shots.json'), 'utf8')) as { screen?: string }[]) : []
  const shots: unknown[] = only === '' ? [] : kept.filter((row) => row.screen !== only)
  try {
    for (const screen of SCREENS.filter((one) => only === '' || one.id === only)) {
      for (const viewport of VIEWPORTS) {
        for (const build of ['a', 'b'] as const) {
          const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            hasTouch: viewport.phone,
            isMobile: viewport.phone,
          })
          const page = await context.newPage()
          const errors: string[] = []
          page.on('pageerror', (error) => errors.push(error.message))
          await page.goto(`http://localhost:${ports[build]}${screen.route}`)
          const did = await screen.doing(page)
          const { png, palette } = await capture(browser, page)
          const file = `${build}-${screen.id}-${viewport.name}.png`
          writeFileSync(path.join(out, file), png)
          shots.push({ file, build, screen: screen.id, route: screen.route, viewport: `${viewport.width} x ${viewport.height}`, sha: shas[build], did, bytes: png.length, palette, errors })
          console.log(`${file}: ${png.length} B${palette ? ' (palette)' : ''}, ${did}${errors.length > 0 ? `, ERRORS ${errors.join('; ')}` : ''}`)
          await context.close()
        }
      }
    }
  } finally {
    await browser.close()
  }
  writeFileSync(path.join(out, 'shots.json'), `${JSON.stringify(shots, null, 2)}\n`)
}

function clean(): void {
  for (const build of ['a', 'b'] as const) {
    if (existsSync(worktree(build))) git('worktree', 'remove', '--force', worktree(build))
  }
  rmSync(scratch, { recursive: true, force: true })
  console.log('the scratch worktrees are removed')
}

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2)
  if (command === 'serve') serve(rest)
  else if (command === 'shoot') await shoot(rest)
  else if (command === 'clean') clean()
  else {
    console.error('usage: bun scripts/look-gate.ts serve | shoot | clean')
    process.exitCode = 2
  }
}
