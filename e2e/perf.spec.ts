/*
 * W0-T20: the lab profile of ARCHITECTURE §11.1, the nightly check of the front page's LCP, CLS and INP.
 *
 *   npx playwright test e2e/perf.spec.ts
 *
 * The profile is the "mobile lab profile" of §11.1: Chromium with the CPU slowed 4×, a link of 1.6 Mbit/s and 150 ms of round trip,
 * on a 360 × 800 touch screen (W0-T21's default phone). It prints three numbers and holds them to §11.1's gates:
 *
 *   LCP  ≤ 2.5 s  (target 1.5 s)  cold loads of `/`, three of them, and the median is the number.
 *   CLS  ≤ 0.1    (target 0)      the same loads, which run on until the 2D pass has swapped to the 3D one, so the swap is in it.
 *   INP  ≤ 200 ms (target 100 ms) one more load, and then a player taps through the front page's four levels: the tickets, the bell
 *                                 and the overlap switch, with "Start service" and "Next" between them.
 *
 * What it measures, and what it cannot:
 *   - The site is the production build (no test hooks, so no forced tier), built here into a temporary folder, or the folder that
 *     ES_PERF_DIST names (`npm run build` makes dist/). A static server of its own answers over HTTP, gzipped as Pages answers, and
 *     the browser fetches from it through the throttle: a route that fulfilled requests in Playwright would bypass the network
 *     emulation. Each load is a fresh browser context, so the cache is cold.
 *   - The network emulation adds 150 ms to every request and limits the link to 1.6 Mbit/s. Chromium has no connection set-up on
 *     loopback, so a first visit to a real server pays up to three more round trips (DNS, TCP, TLS): lab LCP is optimistic by about
 *     that. The CPU throttle slows the page's main thread; the GPU process is not slowed.
 *   - CI runners have no GPU, so the browser draws WebGL with SwiftShader, and a browser may then report a major performance caveat,
 *     which tiers.ts reads as "software rendering" and answers with the 2D view only. The lab device is a phone with a GPU, so the
 *     probe is answered as such: the canvas probe's `failIfMajorPerformanceCaveat` is dropped, and the page takes the path of a touch
 *     device at tier 1. The scene itself is then drawn by SwiftShader, so its frame times mean nothing; the load, the swap and the
 *     main thread do.
 *   - The flags differ from the other specs' on purpose. `--use-angle=swiftshader` sends every frame's compositing through SwiftShader's GL,
 *     which is right for a screenshot of a scene and wrong for a clock: with it a tap on this page waited 170 to 200 ms for the frame
 *     to be presented, and INP read 400 to 600 ms [measured 2026-11-04 at 0a5ccf2, trace: the GPU process in SwapBuffers for up to
 *     450 ms while the main thread was idle]. With `--enable-unsafe-swiftshader` alone WebGL still has SwiftShader to fall back on, and
 *     the page is composited in software, as Lighthouse does on a runner without a GPU. The breakdown printed beside INP (input delay,
 *     handlers, presentation) says where an interaction's time went.
 *   - The player pauses 300 ms before each tap [estimated], as a person reads the screen between presses; Playwright taps faster than
 *     any hand, and a tap that arrives while the last one is still being painted measures a queue, not the page.
 *   - Lab numbers move with the machine. The run prints the host and its load, and the noise is for the reader to judge: §11.1 asks
 *     for the gates on the nightly runner, and the numbers recorded in a task are [measured] on a named machine, at a named SHA.
 *
 * In CI the spec runs only where ES_LAB_PROFILE is set (the nightly job sets it), so a pull request's e2e job does not pay for it.
 * `ES_CHROMIUM=<path to chrome>` runs it with another Chromium build than the one Playwright installed. The run also writes
 * test-results/lab-profile.json.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { test as base, expect } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'
import { build } from 'vite'
import { collect, cumulativeLayoutShift, interactionsOf, interactionToNextPaint, largestContentfulPaint, median, phasesOf } from './support/vitals'
import type { EventTiming, Inp, LargestPaint, Raw } from './support/vitals'

const root = path.resolve(import.meta.dirname, '..')

/** The mobile lab profile of ARCHITECTURE §11.1. */
const PROFILE = {
  cpuSlowdown: 4,
  /** 1.6 Mbit/s as bytes a second. */
  bytesPerSecond: (1.6 * 1_000_000) / 8,
  roundTripMs: 150,
  viewport: { width: 360, height: 800 },
  scale: 2,
} as const

/** §11.1's gates: the nightly job fails above them. Its targets are printed and never fail. */
const GATES = { lcpMs: 2500, cls: 0.1, inpMs: 200 } as const
const TARGETS = { lcpMs: 1500, cls: 0, inpMs: 100 } as const

/** Cold loads that make the LCP and CLS of a run; the median of the LCPs is the number [estimated]. */
const LOADS = 3
/** The pause before each tap of the player, in ms [estimated]: a person reads the screen between presses. */
const THINK_MS = 300
/** How long the swap to 3D may take under the profile before the run gives up on it, in ms [estimated]. */
const SWAP_TIMEOUT_MS = 60_000

base.skip(Boolean(process.env.CI) && !process.env.ES_LAB_PROFILE, 'the lab profile is the nightly check: the nightly workflow sets ES_LAB_PROFILE')

base.use({
  launchOptions: {
    executablePath: process.env.ES_CHROMIUM || undefined,
    args: ['--enable-unsafe-swiftshader'],
  },
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The site, served as Pages serves it                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
}
const COMPRESSED = new Set(['.js', '.css', '.html', '.json', '.svg', '.txt'])

interface Site {
  origin: string
  close(): Promise<void>
}

/** A static server for `dist` on a free port: text files gzipped, `Cache-Control` as Pages sends it, an unknown path answered with index.html. */
async function serve(dist: string): Promise<Site> {
  const bodies = new Map<string, Buffer>()
  const server = createServer((request, response) => {
    const requested = path.join(dist, decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname))
    const file = path.relative(dist, requested).startsWith('..') || !existsSync(requested) || statSync(requested).isDirectory() ? path.join(dist, 'index.html') : requested
    const extension = path.extname(file)
    let body = bodies.get(file)
    if (body === undefined) {
      const raw = readFileSync(file)
      body = COMPRESSED.has(extension) ? gzipSync(raw) : raw
      bodies.set(file, body)
    }
    response.writeHead(200, {
      'content-type': TYPES[extension] ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'max-age=600',
      vary: 'Accept-Encoding',
      ...(COMPRESSED.has(extension) ? { 'content-encoding': 'gzip' } : {}),
    })
    response.end(body)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('the lab server has no port')
  return { origin: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolve) => server.close(() => resolve())) }
}

let site: Site
let dist = ''
let built = false

base.beforeAll(async () => {
  base.setTimeout(180_000)
  if (process.env.ES_PERF_DIST) {
    dist = path.resolve(process.env.ES_PERF_DIST)
    if (!existsSync(path.join(dist, 'index.html'))) throw new Error(`ES_PERF_DIST=${dist} has no index.html: run npm run build first`)
  } else {
    dist = mkdtempSync(path.join(os.tmpdir(), 'es-perf-'))
    built = true
    // The production bundle: another spec in this worker may have set the test hooks, which force a tier and add code.
    const hooks = process.env.VITE_ES_TEST_HOOKS
    delete process.env.VITE_ES_TEST_HOOKS
    try {
      await build({ root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'error', build: { outDir: dist, emptyOutDir: true } })
    } finally {
      if (hooks !== undefined) process.env.VITE_ES_TEST_HOOKS = hooks
    }
  }
  site = await serve(dist)
})

base.afterAll(async () => {
  await site?.close()
  if (built && dist) rmSync(dist, { recursive: true, force: true })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The lab device                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Runs in the page: the canvas probe for "a GPU" (tiers.ts) is answered as a phone's GPU would answer it. */
function phoneWithAGpu(): void {
  const original = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, type: string, attributes?: unknown) => unknown
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, attributes?: unknown) {
    const asked = attributes as WebGLContextAttributes | undefined
    return original.call(this, type, asked?.failIfMajorPerformanceCaveat ? { ...asked, failIfMajorPerformanceCaveat: false } : asked)
  } as typeof HTMLCanvasElement.prototype.getContext
}

/** A fresh browser context (so, a cold cache) with the lab profile on its page. */
async function labPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: PROFILE.viewport, deviceScaleFactor: PROFILE.scale, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
  await context.addInitScript(phoneWithAGpu)
  await context.addInitScript(collect)
  const page = await context.newPage()
  const session = await context.newCDPSession(page)
  await session.send('Network.enable')
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: PROFILE.roundTripMs,
    downloadThroughput: PROFILE.bytesPerSecond,
    uploadThroughput: PROFILE.bytesPerSecond,
  })
  await session.send('Emulation.setCPUThrottlingRate', { rate: PROFILE.cpuSlowdown })
  return { context, page }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* What a load and a play-through measure                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Transfer {
  requests: number
  /** Encoded body bytes, document included. */
  bytes: number
  js: number
  css: number
  fonts: number
}

interface Load {
  lcp: LargestPaint | null
  cls: number
  /** When the 3D pass was drawn and settled, in ms from the navigation's start, or null when it never was. */
  swappedAt: number | null
  view: string | null
  tier: string | null
  /** What came over the link before the largest paint, and the rest of the load. */
  beforeLcp: Transfer
  afterLcp: Transfer
}

async function swapTo3d(page: Page): Promise<number | null> {
  try {
    const handle = await page.waitForFunction(
      () => {
        const stage = document.querySelector('[data-stage="front"]')
        return stage?.getAttribute('data-stage-phase') === 'live' && stage.getAttribute('data-settled') === 'true' ? performance.now() : false
      },
      undefined,
      { timeout: SWAP_TIMEOUT_MS, polling: 250 },
    )
    return (await handle.jsonValue()) as number
  } catch {
    return null
  }
}

async function transfers(page: Page, lcp: number): Promise<{ before: Transfer; after: Transfer }> {
  const entries = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    const resources = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map((entry) => ({ name: new URL(entry.name).pathname, bytes: entry.encodedBodySize, end: entry.responseEnd }))
    return [{ name: '/', bytes: navigation.encodedBodySize, end: navigation.responseEnd }, ...resources]
  })
  const sum = (from: typeof entries): Transfer => ({
    requests: from.length,
    bytes: from.reduce((total, entry) => total + entry.bytes, 0),
    js: from.filter((entry) => entry.name.endsWith('.js')).reduce((total, entry) => total + entry.bytes, 0),
    css: from.filter((entry) => entry.name.endsWith('.css')).reduce((total, entry) => total + entry.bytes, 0),
    fonts: from.filter((entry) => entry.name.endsWith('.woff2')).reduce((total, entry) => total + entry.bytes, 0),
  })
  return { before: sum(entries.filter((entry) => entry.end <= lcp)), after: sum(entries.filter((entry) => entry.end > lcp)) }
}

/** One cold load of `/` under the profile, run on until the 3D pass has replaced the 2D one and settled, and a second longer. */
async function coldLoad(browser: Browser): Promise<Load> {
  const { context, page } = await labPage(browser)
  try {
    await page.goto(`${site.origin}/`, { waitUntil: 'load' })
    const swappedAt = await swapTo3d(page)
    await page.waitForTimeout(1000)
    const raw = (await page.evaluate(() => window.__vitals?.())) as Raw
    const lcp = largestContentfulPaint(raw.lcp)
    const service = page.locator('section.es-front-service')
    const { before, after } = await transfers(page, lcp?.startTime ?? 0)
    return {
      lcp,
      cls: cumulativeLayoutShift(raw.shifts),
      swappedAt,
      view: await service.getAttribute('data-view'),
      tier: await page.locator('[data-stage="front"]').getAttribute('data-tier'),
      beforeLcp: before,
      afterLcp: after,
    }
  } finally {
    await context.close()
  }
}

/**
 * Taps through the front page's four levels like a player: "Start service", then the waiting tickets, the bell, the overlap switch
 * once it is there, the debrief stub and "Next". Returns how many taps it made. The levels end by themselves: nothing here is timed.
 */
async function playThrough(page: Page): Promise<number> {
  const service = page.locator('section.es-front-service')
  const tickets = page.locator('[data-loop-controls] ul button:not([disabled])')
  const bell = page.getByRole('button', { name: /Ring the bell/ })
  const overlap = page.locator('[data-loop-controls]').getByRole('switch')
  const debrief = page.getByRole('button', { name: 'See the debrief' }).first()
  const next = page.getByRole('button', { name: /^Next:/ })
  let taps = 0
  const tap = async (target: ReturnType<Page['locator']>) => {
    await page.waitForTimeout(THINK_MS)
    await target.tap()
    taps += 1
  }
  await tap(page.getByRole('button', { name: 'Start service' }))
  for (let turn = 0; turn < 400; turn++) {
    if ((await next.count()) > 0) await tap(next.first())
    else if ((await debrief.count()) > 0) {
      await tap(debrief)
      // The last level has no next: opening its debrief ends the play. The debrief is a lazy chunk, so "Next" can be a moment away.
      if ((await service.getAttribute('data-level')) === 'first-4-par') return taps
      await next.first().waitFor({ state: 'visible', timeout: 30_000 })
    } else if ((await overlap.count()) > 0 && (await overlap.getAttribute('aria-checked')) === 'false' && (await overlap.isEnabled())) await tap(overlap)
    else if ((await tickets.count()) > 0) await tap(tickets.first())
    else if (await bell.isEnabled()) await tap(bell)
    else break
  }
  throw new Error(`the player did not reach the end of the last level in 400 turns (${taps} taps)`)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The record                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

interface PlayResult extends Inp {
  taps: number
  level: string | null
  swapped: boolean
  /** The ten longest interactions, each with where its time went. */
  longest: { name: string; target: string; latency: number; inputDelay: number; processing: number; presentation: number }[]
}

const results: { loads: Load[]; inp: PlayResult | null; version: string } = { loads: [], inp: null, version: '' }

const checkout = (): string => {
  try {
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
    return `${git('rev-parse', '--short=7', 'HEAD')}${git('status', '--porcelain', '--untracked-files=no') === '' ? '' : '+uncommitted changes'}`
  } catch {
    return 'not a git checkout'
  }
}

const ms = (value: number): string => `${Math.round(value).toLocaleString('en-US')} ms`
const kb = (bytes: number): string => `${(bytes / 1000).toFixed(1)} KB`
const phaseLine = (event: EventTiming): string => {
  const { inputDelay, processing, presentation } = phasesOf(event)
  return `${Math.round(inputDelay)} ms of input delay, ${Math.round(processing)} ms of handlers, ${Math.round(presentation)} ms to present`
}
const verdict = (value: number, gate: number, target: number): string => `${value > gate ? 'OVER THE GATE' : value > target ? 'over the target' : 'within the target'}`

const startedAt = { load: os.loadavg()[0] }

base.afterAll(() => {
  const lines: string[] = []
  const cpu = os.cpus()
  lines.push(
    `lab profile (ARCHITECTURE §11.1): Chromium ${results.version}, CPU ${PROFILE.cpuSlowdown}× slower, ${(PROFILE.bytesPerSecond * 8) / 1e6} Mbit/s, ${PROFILE.roundTripMs} ms RTT, ${PROFILE.viewport.width} × ${PROFILE.viewport.height} at ${PROFILE.scale}× with touch, gzip over HTTP`,
    `  host: ${cpu[0]?.model ?? 'unknown cpu'}, ${cpu.length} threads, load ${startedAt.load.toFixed(1)} at the start and ${os.loadavg()[0].toFixed(1)} at the end; checkout ${checkout()}${built ? ', built by this run' : `, built in ${dist}`}`,
  )
  const loads = results.loads
  if (loads.length > 0) {
    const lcps = loads.flatMap((load) => (load.lcp === null ? [] : [load.lcp.startTime]))
    const last = loads.at(-1)
    if (lcps.length > 0) {
      const lcp = median(lcps)
      lines.push(`  LCP  ${ms(lcp).padStart(9)}  median of ${lcps.map((value) => Math.round(value).toLocaleString('en-US')).join(', ')}; the element is ${last?.lcp?.element}; ${verdict(lcp, GATES.lcpMs, TARGETS.lcpMs)} (gate ${ms(GATES.lcpMs)}, target ${ms(TARGETS.lcpMs)})`)
    }
    const cls = Math.max(...loads.map((load) => load.cls))
    lines.push(
      `  CLS  ${cls.toFixed(4).padStart(9)}  worst of ${loads.map((load) => load.cls.toFixed(4)).join(', ')}, with the swap to 3D at ${loads.map((load) => (load.swappedAt === null ? 'never' : ms(load.swappedAt))).join(', ')}; ${verdict(cls, GATES.cls, TARGETS.cls)} (gate ${GATES.cls}, target ${TARGETS.cls})`,
    )
    if (last) {
      lines.push(
        `  first paint: ${last.beforeLcp.requests} requests and ${kb(last.beforeLcp.bytes)} came over the link before the largest paint (JS ${kb(last.beforeLcp.js)}, CSS ${kb(last.beforeLcp.css)}, fonts ${kb(last.beforeLcp.fonts)}, the rest is the document); after it, ${last.afterLcp.requests} requests and ${kb(last.afterLcp.bytes)} (JS ${kb(last.afterLcp.js)}); the pass is ${last.view} at tier ${last.tier}`,
      )
    }
  }
  const inp = results.inp
  if (inp) {
    lines.push(
      `  INP  ${(inp.ms === null ? 'under 16 ms' : ms(inp.ms)).padStart(9)}  ${inp.interactions} interactions from ${inp.taps} taps over four levels${inp.worst ? `; the longest is ${inp.worst.event.name} on ${inp.worst.event.target || 'an element that has since left the page'}, ${phaseLine(inp.worst.event)}` : ''}; ${inp.ms === null ? 'within the target' : verdict(inp.ms, GATES.inpMs, TARGETS.inpMs)} (gate ${ms(GATES.inpMs)}, target ${ms(TARGETS.inpMs)})`,
    )
  }
  console.log(lines.join('\n'))
  const out = path.join(root, 'test-results')
  mkdirSync(out, { recursive: true })
  writeFileSync(path.join(out, 'lab-profile.json'), `${JSON.stringify({ profile: PROFILE, gates: GATES, targets: TARGETS, checkout: checkout(), host: cpu[0]?.model, threads: cpu.length, ...results }, null, 2)}\n`)
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The checks                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

base.describe('the front page under the mobile lab profile', () => {
  base.beforeEach(({ browser }) => {
    results.version = browser.version()
  })

  base('LCP and CLS on cold loads of `/`, with the swap to 3D in them', async ({ browser }) => {
    base.setTimeout(LOADS * (SWAP_TIMEOUT_MS + 30_000))
    for (let run = 0; run < LOADS; run++) results.loads.push(await coldLoad(browser))

    const lcps = results.loads.flatMap((load) => (load.lcp === null ? [] : [load.lcp.startTime]))
    expect(lcps.length, 'every load paints something').toBe(LOADS)
    // The page promises that its heading or its poster is the largest paint, never the canvas (W0-T18).
    for (const load of results.loads) expect(load.lcp?.element, 'the largest paint').not.toMatch(/^canvas/)
    // CLS is "the 2D-to-3D swap included": the loads must have swapped.
    for (const load of results.loads) expect(load.swappedAt, `the pass swapped to 3D within ${SWAP_TIMEOUT_MS / 1000} s, so the swap is in the CLS`).not.toBeNull()
    expect(median(lcps), 'LCP, the median of the loads').toBeLessThanOrEqual(GATES.lcpMs)
    expect(Math.max(...results.loads.map((load) => load.cls)), 'CLS, the worst of the loads').toBeLessThanOrEqual(GATES.cls)
  })

  base('INP of the lever presses of the four levels', async ({ browser }) => {
    base.setTimeout(SWAP_TIMEOUT_MS + 300_000)
    const { context, page } = await labPage(browser)
    try {
      await page.goto(`${site.origin}/`, { waitUntil: 'load' })
      const swapped = (await swapTo3d(page)) !== null
      await page.waitForTimeout(1000)
      const taps = await playThrough(page)
      await page.waitForTimeout(500)
      const raw = (await page.evaluate(() => window.__vitals?.())) as Raw
      const inp = interactionToNextPaint(raw.events, raw.interactionCount)
      const longest = interactionsOf(raw.events)
        .slice(0, 10)
        .map(({ event, latency }) => ({ name: event.name, target: event.target, latency, ...phasesOf(event) }))
      results.inp = { ...inp, taps, swapped, level: await page.locator('section.es-front-service').getAttribute('data-level'), longest }
      expect(swapped, 'the levers were pressed with the 3D pass live').toBe(true)
      expect(inp.interactions, 'the browser counted the taps as interactions').toBeGreaterThan(taps / 2)
      expect(inp.ms ?? 0, 'INP').toBeLessThanOrEqual(GATES.inpMs)
    } finally {
      await context.close()
    }
  })
})
