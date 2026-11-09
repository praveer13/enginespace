/*
 * W0-T21's e2e suite, held to the documents that ask for it. A Playwright spec cannot run under Bun (bunfig.toml roots `bun test` at
 * tests/, and the specs need a browser), so these tests read what the suite is made of, and fail when one piece is moved without
 * the others:
 *   - the routes that the specs visit are the eight that the tracker's acceptance check names, at the widths that A§10.1 and A§11.2
 *     give, and they are paths of the route table's own notation (verify:routes holds them to the documents of the build);
 *   - playwright.config.ts has the shape that acceptance 5 and A§10.1 describe: Chromium at 360×800 against `vite preview`, the
 *     SwiftShader flag with its measurement written beside it, and the measurement is for the Playwright that package.json pins;
 *   - ci.yml's e2e-smoke job and nightly.yml's browsers job run what they say, keep the report as an artifact, and are no longer
 *     reserved.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { PR_ROUTES, PR_WIDTHS, NIGHTLY_WIDTHS } from '../../e2e/routes'
import { BUN_FALLBACK, between, read, root, trackerTasks } from './support'

interface Step {
  name?: string
  uses?: string
  run?: string
  if?: string
  with?: Record<string, unknown>
}
interface Job {
  env?: Record<string, string>
  steps?: Step[]
}
interface Workflow {
  jobs?: Record<string, Job>
}

const job = (file: string, name: string): Job => {
  const workflow = load(read(`.github/workflows/${file}`)) as Workflow
  const found = workflow.jobs?.[name]
  if (found === undefined) throw new Error(`${file} has no job "${name}"`)
  return found
}
const runs = (steps: Step[] | undefined) =>
  (steps ?? []).flatMap((step) => (step.run === undefined || step.if === BUN_FALLBACK ? [] : [step.run.trim()]))

const task = trackerTasks().get('W0-T21') ?? ''
const config = read('playwright.config.ts')

describe('the routes (acceptance 1)', () => {
  test("are the eight that the tracker's acceptance check names, in its order", () => {
    const accept = /1\. axe finds 0 serious or critical violations on (.*?), at 360 and 1280 px\./s.exec(task)?.[1] ?? ''
    // W1-T15 took the sample lesson out of content/ (it lives in tests/fixtures/sample-course/ now), so the check's `/m/tr2/l0-sample` is
    // answered by TR2's third lesson, which has an item set, a game, a figure and cards of both kinds, as the sample did.
    const standIn: Record<string, string> = { '/m/tr2/l0-sample': '/m/tr2/l3-async-scheduling-closes-the-bubble' }
    const named = [...accept.matchAll(/`([^`]+)`/g)].map((match) => standIn[match[1]] ?? match[1])
    expect(named.length).toBe(8)
    expect(PR_ROUTES).toEqual(named)
  })

  test('are written as the route table writes them: a path from the root, no query or fragment, and each only once', () => {
    for (const route of PR_ROUTES) expect(route).toMatch(/^\/(?:[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*)?$/)
    expect(new Set(PR_ROUTES).size).toBe(PR_ROUTES.length)
  })

  test("the widths are the tracker's 360 and 1280 for a pull request, and A§10.1's 320, 360 and 1280 for the nightly sweep", () => {
    expect(PR_WIDTHS).toEqual([360, 1280])
    expect(NIGHTLY_WIDTHS).toEqual([320, 360, 1280])
    const architecture = read('docs/ARCHITECTURE.md')
    expect(between(architecture, '| `nightly.yml` |', '| `labs.yml` |')).toContain('full axe at 320, 360 and 1280 px on every route')
    expect(between(architecture, '### 11.2 Accessibility', '## 12. Security')).toContain('0 on every route at 360 and 1280 px (PR subset); 0 at 320, 360 and 1280 px on all routes (nightly)')
  })
})

describe('playwright.config.ts (acceptance 5)', () => {
  test('is Chromium at 360×800 against `vite preview`, over the specs of e2e/', () => {
    expect(config).toMatch(/viewport: \{ width: 360, height: 800 \}/)
    expect(config).toContain("browserName: 'chromium'")
    expect(config).toContain("testDir: './e2e'")
    expect(config).toContain("testMatch: '*.spec.ts'")
    expect(config).toMatch(/npx vite preview --host 127\.0\.0\.1/)
    // The server is never reused: a stale preview from another tree would be tested in place of this build.
    expect(config).toContain('reuseExistingServer: false')
  })

  test('keeps the SwiftShader flag, with what was measured about it, for the Playwright that package.json pins', () => {
    expect(config).toContain("'--use-angle=swiftshader'")
    const measured = /\[measured (\d{4}-\d{2}-\d{2})[^\]]*Playwright (\d+\.\d+\.\d+)[^\]]*\]/s.exec(config)
    expect(measured, 'a "[measured <date> ... Playwright <version> ...]" note in the config').not.toBeNull()
    const pinned = (JSON.parse(read('package.json')) as { devDependencies: Record<string, string> }).devDependencies['@playwright/test']
    // A new Playwright pins a new Chromium: its flags are measured again, and the note is rewritten, before this passes.
    expect(measured?.[2]).toBe(pinned)
    // The note says what each flag is for, including the one that Playwright adds by itself.
    expect(config).toContain('`--enable-unsafe-swiftshader` is not needed here')
    expect(config).toContain('`--use-angle=swiftshader` is what the site needs')
    expect(config).toContain("'--font-render-hinting=none'")
  })

  test('has a smoke project with the five specs of W0-T21 and the keyboard walks of W1-T36, and each of them exists', () => {
    const smoke = [...(/const SMOKE = \[(.*?)\]\.map/s.exec(config)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((match) => match[1])
    expect(smoke).toEqual(['a11y', 'keyboard-loop', 'network', 'reduced-motion', 'screenshots', 'walks'])
    for (const name of smoke) expect(existsSync(path.join(root, 'e2e', `${name}.spec.ts`))).toBe(true)
    expect(config).toContain("{ name: 'smoke', testMatch: SMOKE")
  })

  test('refuses a stray `.only` on CI, and every spec of e2e/ is in some project', () => {
    expect(config).toContain('forbidOnly: CI')
    // `features` takes every spec that is not smoke, so a spec added by a later task runs in the nightly sweep and cannot be left out.
    expect(config).toContain("{ name: 'features', testIgnore: [...SMOKE, LAB]")
    // W0-T20's lab profile has a project of its own, which never retries, so that a budget that was missed is reported once.
    expect(config).toContain("{ name: 'lab', testMatch: LAB, retries: 0")
    expect(config).toContain("const LAB = '**/perf.spec.ts'")
  })
})

describe('the workflows', () => {
  const smoke = job('ci.yml', 'e2e-smoke')
  const sweep = job('nightly.yml', 'browsers')

  test('no step is reserved for W0-T21 any more', () => {
    for (const file of ['ci.yml', 'nightly.yml', 'deploy.yml', 'labs.yml']) expect(read(`.github/workflows/${file}`)).not.toContain('pending: W0-T21')
  })

  test("ci.yml's e2e-smoke job installs Chromium, runs the smoke project, and keeps the report whatever the result", () => {
    expect(runs(smoke.steps)).toEqual(['npm ci', "npx playwright install --with-deps chromium", 'npx playwright test --project=smoke --shard="$SHARD/4"'])
    expect(smoke.steps?.find((step) => step.name === 'Run the smoke specs')?.env).toEqual({ SHARD: '${{ matrix.shard }}' })
    const upload = smoke.steps?.find((step) => step.uses?.startsWith('actions/upload-artifact@'))
    expect(upload?.if).toBe('${{ !cancelled() }}')
    expect(String(upload?.with?.path)).toContain('playwright-report')
    expect(String(upload?.with?.path)).toContain('test-results')
  })

  test("ci.yml's e2e-smoke job runs four shards that cover the smoke project once, test by test, and keeps each shard's report", () => {
    const matrix = (smoke as { strategy?: { 'fail-fast'?: boolean; matrix?: { shard?: number[] } } }).strategy
    expect(matrix?.matrix?.shard).toEqual([1, 2, 3, 4])
    expect(matrix?.['fail-fast']).toBe(false)
    const upload = smoke.steps?.find((step) => step.uses?.startsWith('actions/upload-artifact@'))
    expect(String(upload?.with?.name)).toBe('e2e-smoke-${{ matrix.shard }}')
    // Five spec files over four shards would split unevenly by file; the smoke project spreads its tests one by one instead.
    expect(config).toContain("{ name: 'smoke', testMatch: SMOKE, fullyParallel: true")
  })

  test("nightly.yml's browsers job sets the sweep, builds with Bun on the path, and runs every project in the three browsers", () => {
    expect(sweep.env).toEqual({ ES_E2E_NIGHTLY: '1' })
    expect(sweep.steps?.some((step) => step.uses?.startsWith('oven-sh/setup-bun@'))).toBe(true)
    expect(runs(sweep.steps)).toEqual(['npm ci', 'npx playwright install --with-deps chromium firefox webkit', 'npx playwright test'])
    expect(sweep.steps?.some((step) => step.uses?.startsWith('actions/upload-artifact@'))).toBe(true)
    // What the sweep sets is what the config reads.
    expect(config).toContain("process.env.ES_E2E_NIGHTLY === '1'")
    expect(config).toContain("(['firefox', 'webkit'] as const)")
  })
})
