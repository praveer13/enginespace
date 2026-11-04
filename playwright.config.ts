import { defineConfig } from '@playwright/test'

/*
 * Playwright, for the checks that need a browser (ARCHITECTURE §10.1 and §11.2; TRACKER W0-T21).
 *
 *   npm run e2e                           every spec: the `smoke` project, and then the `features` project
 *   npx playwright test --project=smoke   the pull-request subset alone: what ci.yml's e2e-smoke job runs
 *   npx playwright test e2e/front.spec.ts one spec
 *
 * Every run starts with a fresh build and `vite preview` over it, as `npm run build && npm run preview` would, and the specs of the
 * `smoke` project reach it through `baseURL`. The specs that earlier tasks wrote (front, loop, loop-scene, scene-kit, settings and
 * ledger-conformance: the `features` project) build or serve the site themselves, with the test hooks on, and do not need that server.
 *
 * Environment, all of it optional:
 *   ES_CHROMIUM       the path of a Chromium to run in place of the one that Playwright installed, for a host where that one cannot start.
 *   ES_E2E_PORT       the port of `vite preview`, 4180. The server is never reused, because a stale one from another tree would be
 *                     tested in place of this build: a port that is taken is an error, and this gives a run its own.
 *   ES_E2E_ORIGIN     the address of a server that already serves a build (`http://127.0.0.1:4173`): then nothing is built or started.
 *   ES_E2E_NIGHTLY=1  the nightly sweep (nightly.yml): axe at 320, 360 and 1280 px on every document that prepare-pages writes, and the
 *                     cross-browser determinism hash in Firefox and WebKit. It builds with prepare-pages, which needs Bun.
 * New screenshot baselines (the PNGs of e2e/screenshots.spec.ts-snapshots/, which a machine that draws a little differently can outdate):
 *   npx playwright test --project=smoke screenshots --update-snapshots
 */
const PORT = Number(process.env.ES_E2E_PORT) || 4180
const OUTSIDE = (process.env.ES_E2E_ORIGIN ?? '').replace(/\/$/, '')
const ORIGIN = OUTSIDE || `http://127.0.0.1:${PORT}`
const NIGHTLY = process.env.ES_E2E_NIGHTLY === '1'
const CI = Boolean(process.env.CI)

/**
 * The pull-request subset (A§10.1's "e2e-smoke"): what W0-T21 adds, and what a pull request must keep green. The specs that earlier
 * tasks wrote carry their own acceptance checks, each with a test build of its own: six specs and 119 tests took 7.7 minutes with two
 * workers on a 20-core laptop, under a load average of about 15 from other work [measured 2026-11-04]. They run in the nightly sweep,
 * and not on every pull request.
 */
const SMOKE = ['a11y', 'keyboard-loop', 'network', 'screenshots', 'reduced-motion'].map((name) => `**/${name}.spec.ts`)
/** W0-T20's lab profile: a measurement, which nightly.yml's lab-profile job runs on its own. */
const LAB = '**/perf.spec.ts'

/*
 * The flags of the browser, and what each is for. Both were measured, so that nobody has to guess.
 *
 * [measured 2026-11-04 on the repository at 0a5ccf2 and this task's changes, with Playwright 1.63.0 driving Chrome for Testing
 * 149.0.7827.55, as chromium_headless_shell-1228 (what `headless: true` launches) and as chromium-1228 (the full browser, which
 * Playwright runs in the new headless mode). Not measured: the Chromium that Playwright 1.63.0 itself pins, revision 1243 (Chrome for
 * Testing 153.0.8010.12), which the machine did not have. e2e/screenshots.spec.ts asks of whatever Chromium runs it the two questions
 * below, asserts what the specs rely on, and prints the build and the renderer, so the first run on a runner shows if this still holds.]
 *
 * SwiftShader (A§10.1: "newer Chromium builds may need `--use-angle=swiftshader --enable-unsafe-swiftshader`").
 *   - `--enable-unsafe-swiftshader` is not needed here. Playwright 1.63.0 puts it on every Chromium command line itself
 *     (playwright-core's coreBundle.js, `_innerDefaultArgs`; it shows on the launched process with DEBUG=pw:browser).
 *   - WebGL2 exists with no flag at all, in both headless modes: SwiftShader backs it. The probe was `getContext('webgl2')` in
 *     about:blank, with and without `failIfMajorPerformanceCaveat: true`, under no flag, each flag alone, and both.
 *   - `--use-angle=swiftshader` is what the site needs, for what it tells the page. The headless shell answers a context request that
 *     has `failIfMajorPerformanceCaveat: true` with null under no flag, and the site reads that as "software rendering" and keeps the
 *     pass in 2D (src/scene/tiers.ts, tier 0), so no 3D pass would be drawn. With the flag the request succeeds and `/` swaps to
 *     the 3D pass after its largest paint, as it does on a laptop. (The full browser answers yes under every variant.) The flag also
 *     puts a machine that has a GPU on SwiftShader, so that a run on a laptop and a run on a runner draw alike.
 *
 * Font hinting (A§10.1: screenshots "using self-hosted fonts on a fixed runner image").
 *   - `--font-render-hinting=none` keeps glyph shapes the same from one machine to the next. The 2D pass of `/` at 360 px, drawn by the
 *     headless shell and by the full browser from one build, differed by 4,414 of 288,000 pixels (1.5%) with each browser's own
 *     hinting, and by 463 (0.16%) with the flag; at 1280 px, by 14,703 of 1,024,000 (1.4%) and by 944 (0.09%). The differences were
 *     the edges of the letters, and they are why the tolerance of e2e/screenshots.spec.ts is a share of the pixels and not none.
 */
const FLAGS = ['--use-angle=swiftshader', '--font-render-hinting=none']

/** One browser, one window: a phone's 360 px, which is the narrowest that PRODUCT.md promises to serve. The specs widen it where they must. */
const use = {
  baseURL: ORIGIN,
  viewport: { width: 360, height: 800 },
  // The screenshots compare pixels, so nothing of the machine's own preferences may reach them.
  colorScheme: 'light' as const,
  locale: 'en-US',
  timezoneId: 'UTC',
  // A run on a runner records a trace only for the retry of a failure, to keep the cost of tracing off the tests that pass.
  trace: (CI ? 'on-first-retry' : 'retain-on-failure') as 'on-first-retry' | 'retain-on-failure',
}

const chromium = {
  ...use,
  browserName: 'chromium' as const,
  launchOptions: { executablePath: process.env.ES_CHROMIUM || undefined, args: FLAGS },
}

export default defineConfig({
  testDir: './e2e',
  testMatch: '*.spec.ts',
  // A `.only` left in a spec by accident would silently skip the rest of the suite.
  forbidOnly: CI,
  // One more try on a runner, where the 3D scene shares four slow cores with the browser. A real failure fails twice.
  retries: CI ? 1 : 0,
  // SwiftShader draws on the CPU, so more workers than cores only make every frame slower.
  workers: CI ? 2 : undefined,
  // A frame of the 3D scene takes most of a second in software, and a test may wait for a few [estimated].
  timeout: 90_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  // A baseline is a Linux Chromium rendering with the site's own faces, so its name carries neither a platform nor a project.
  snapshotPathTemplate: '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{ext}',
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  projects: [
    { name: 'smoke', testMatch: SMOKE, use: chromium },
    // Every other spec: the ones that earlier tasks wrote, and whatever a later task adds.
    { name: 'features', testIgnore: [...SMOKE, LAB], use: chromium },
    // The lab profile is a number to be read and not a flake to be retried: a failure is a budget that was exceeded, and a second try
    // would only double a long job. It skips itself on a runner unless ES_LAB_PROFILE is set, which the lab-profile job does.
    { name: 'lab', testMatch: LAB, retries: 0, use: chromium },
    // The cross-browser determinism hash (A§5.10): the same seed and the same actions give the same state hash in every engine.
    ...(NIGHTLY
      ? (['firefox', 'webkit'] as const).map((browserName) => ({
          name: browserName,
          testMatch: '**/loop.spec.ts',
          grep: /same state hash/,
          use: { ...use, browserName },
        }))
      : []),
  ],
  webServer: OUTSIDE
    ? undefined
    : {
        // A fresh build, so that no spec tests an old one. The nightly sweep lists the documents that prepare-pages writes.
        command: `npm run build && ${NIGHTLY ? 'bun scripts/prepare-pages.ts && ' : ''}npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
        url: `${ORIGIN}/`,
        reuseExistingServer: false,
        timeout: 300_000,
      },
})
