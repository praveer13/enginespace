/*
 * The nightly property run (ARCHITECTURE §5.10): 200 seeds on a pull request and 10,000 in the nightly run [estimated], through one knob.
 *
 *   - tests/seeds.ts is the knob. It reads ES_PROPERTY_SEEDS, gives 200 when the variable is unset, and refuses a value that is not a
 *     whole number from 200 to a million, so a typo in a workflow fails the run and does not quietly make it a pull request's.
 *   - A§5.10 and the code agree on the two counts, and nightly.yml's `properties` job is built: it sets the knob to the nightly count,
 *     runs the suite with a time for each test that fits a property over that many seeds, and keeps the D-052 condition. No job of
 *     ci.yml or deploy.yml sets the knob, so a pull request runs its 200.
 *   - Every seeded property takes its seeds from the knob. A test file that builds its own list of 200 seeds, or loops to 200 by hand,
 *     would stay at 200 in the nightly run and say nothing, so this fails on one and says what to write instead.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { MAX_SEEDS, NIGHTLY_SEEDS, PR_SEEDS, SEED_COUNT, seedCountFrom, seeds } from '../seeds'
import { between, read, root } from './support'

describe('the knob (tests/seeds.ts)', () => {
  test('is the pull request count when the variable is unset or empty', () => {
    expect(seedCountFrom(undefined)).toBe(PR_SEEDS)
    expect(seedCountFrom('')).toBe(PR_SEEDS)
    // This run is a pull request's unless the environment says otherwise.
    expect(SEED_COUNT).toBe(seedCountFrom(process.env.ES_PROPERTY_SEEDS))
  })

  test('takes a whole number of seeds from the pull request count upwards', () => {
    expect(seedCountFrom('200')).toBe(200)
    expect(seedCountFrom('10000')).toBe(NIGHTLY_SEEDS)
    expect(seedCountFrom('123456')).toBe(123456)
  })

  test('refuses anything else, and says what the variable is', () => {
    for (const value of ['abc', '1e4', '10,000', '-5', '0', '200.5', ' 300', '0x10', '00300', 'NaN']) {
      expect(() => seedCountFrom(value), value).toThrow('ES_PROPERTY_SEEDS')
    }
  })

  test('refuses a count that is a typo of a digit too many, which would be a run that never ends', () => {
    expect(seedCountFrom(String(MAX_SEEDS))).toBe(MAX_SEEDS)
    for (const value of [String(MAX_SEEDS + 1), '100000000', '9'.repeat(30)]) expect(() => seedCountFrom(value), value).toThrow('at most 1,000,000')
  })

  test('refuses a count below the pull request count: the knob only raises it', () => {
    expect(() => seedCountFrom('199')).toThrow('only raises')
    expect(() => seedCountFrom('1')).toThrow('only raises')
  })

  test('hands out consecutive seeds from the first one asked for', () => {
    expect(seeds(1, 3)).toEqual([1, 2, 3])
    expect(seeds(0, 3)).toEqual([0, 1, 2])
    expect(seeds()).toHaveLength(SEED_COUNT)
    expect(seeds(1)[0]).toBe(1)
    expect(seeds(1).at(-1)).toBe(SEED_COUNT)
  })
})

describe('the counts against ARCHITECTURE §5.10', () => {
  test("say 200 seeds on a pull request and 10,000 nightly, which are the knob's own", () => {
    const row = /\| Properties \|[^\n]*\n/.exec(between(read('docs/ARCHITECTURE.md'), '### 5.10 Test strategy', '## 6. Games'))?.[0] ?? ''
    expect(row, "A§5.10's Properties row").not.toBe('')
    const counts = /(\d[\d,]*) seeds on PRs and (\d[\d,]*) nightly/.exec(row)
    expect(counts, 'the row says "<n> seeds on PRs and <n> nightly"').not.toBeNull()
    expect([PR_SEEDS, NIGHTLY_SEEDS]).toEqual([counts?.[1], counts?.[2]].map((count) => Number(count?.replaceAll(',', ''))))
    expect(row).toContain('| PR and nightly |')
  })
})

describe("nightly.yml's properties job", () => {
  interface Step {
    uses?: string
    run?: string
    env?: Record<string, string>
    with?: Record<string, unknown>
  }
  interface Job {
    if?: string
    env?: Record<string, string>
    steps?: Step[]
    'timeout-minutes'?: number
  }
  const properties = ((load(read('.github/workflows/nightly.yml')) as { jobs: Record<string, Job> }).jobs.properties ?? {}) as Job
  const runs = (properties.steps ?? []).flatMap((step) => (step.run === undefined ? [] : [step.run.trim()]))

  test('is built: no reserved step is left in it', () => {
    expect(runs.length).toBeGreaterThanOrEqual(2)
    expect(runs.some((run) => /pending:/.test(run))).toBe(false)
  })

  test('sets the knob to the nightly count', () => {
    expect(properties.env).toEqual({ ES_PROPERTY_SEEDS: String(NIGHTLY_SEEDS) })
    expect(seedCountFrom(properties.env?.ES_PROPERTY_SEEDS)).toBe(NIGHTLY_SEEDS)
  })

  test('installs, then runs the whole suite under Bun with a time for each test that a property over that many seeds fits in', () => {
    expect(runs[0]).toBe('npm ci')
    const suite = runs.find((run) => run.startsWith('bun test'))
    expect(suite, 'a step that runs `bun test`').toBeDefined()
    const timeout = Number(/--timeout (\d+)/.exec(suite ?? '')?.[1])
    // Bun's own five seconds are for a pull request.
    expect(timeout).toBeGreaterThan(5_000)
    // A test cannot be given longer than the job has.
    expect(timeout).toBeLessThanOrEqual((properties['timeout-minutes'] ?? 0) * 60_000)
    expect(properties.steps?.some((step) => step.uses?.startsWith('oven-sh/setup-bun@'))).toBe(true)
  })

  test('keeps the D-052 condition, so the schedule spends nothing until the owner turns the nightly on', () => {
    expect(properties.if).toBe("${{ github.event_name == 'workflow_dispatch' || vars.NIGHTLY_ENABLED == 'true' }}")
  })

  test('is the only place that sets the knob: a pull request, and a deploy, run the 200', () => {
    const workflows = readdirSync(path.join(root, '.github/workflows')).filter((file) => file.endsWith('.yml'))
    const setting = workflows.filter((file) => read(`.github/workflows/${file}`).split('\n').some((line) => /^\s*ES_PROPERTY_SEEDS:/.test(line)))
    expect(setting).toEqual(['nightly.yml'])
  })
})

/** The lines of a test file that make a list of 200 seeds, or loop over 200 of them, by hand. */
export function hardCodedSeedCounts(source: string): { line: number; text: string }[] {
  const forms = [
    // const SEEDS = Array.from({ length: 200 }, …) or Array.from({ length: 200 }, (_, seed) => …): a list of 200 on a line about seeds,
    // and a list of 200 consecutive integers (`(_, i) => i`, `(_, i) => i + 1`) under any name, which a property uses as its seeds
    (text: string) =>
      /Array\.from\(\s*\{\s*length:\s*200\s*\}/.test(text) && (/seed/i.test(text) || /\(\s*_\s*,\s*(\w+)\s*\)\s*=>\s*\1(?:\s*\+\s*1)?\s*\)/.test(text)),
    // for (let seed = 1; seed <= 200; seed++), and `< 200`
    (text: string) => /\bfor\s*\(\s*(?:let|var)\s+seed\s*=\s*\d+\s*;\s*seed\s*<=?\s*200\s*;/.test(text),
  ]
  return source.split('\n').flatMap((text, index) => (forms.some((form) => form(text)) ? [{ line: index + 1, text: text.trim() }] : []))
}

describe('every seeded property takes its seeds from the knob', () => {
  test('finds a list of 200 seeds, and a loop to 200, in whatever shape the tests have written them', () => {
    const found = (code: string) => hardCodedSeedCounts(code).length
    expect(found('const SEEDS = Array.from({ length: 200 }, (_, index) => index + 1)')).toBe(1)
    expect(found('const seeds = Array.from({length: 200}, (_, i) => i)')).toBe(1)
    expect(found('const ledgers = Array.from({ length: 200 }, (_, seed) => randomLedger(seed, 10))')).toBe(1)
    expect(found('const MANY = Array.from({ length: 200 }, (_, i) => i + 1)')).toBe(1)
    expect(found('const ids = Array.from({ length: 200 }, (_, n) => n)')).toBe(1)
    expect(found('    for (let seed = 1; seed <= 200; seed += 1) {')).toBe(1)
    expect(found('for (let seed = 0; seed < 200; seed++) expect(f(seed)).toBe(1)')).toBe(1)
    expect(found('const SEEDS = seeds(1)\nfor (const seed of SEEDS.slice(0, 40)) {}\nfor (let i = 0; i < 200; i++) draw()')).toBe(0)
    expect(found('expect(response.status).toBe(200)')).toBe(0)
    expect(found('const items = Array.from({ length: 200 }, (_, i) => `request ${i}`)')).toBe(0)
    expect(found('const sample = Array.from({ length: 200 }, () => below(rng, 100_000))')).toBe(0)
  })

  test('finds none in the tests of this tree: they read the knob', () => {
    const files = (readdirSync(path.join(root, 'tests'), { recursive: true }) as string[])
      .map((file) => file.split(path.sep).join('/'))
      .filter((file) => file.endsWith('.ts') && !file.startsWith('fixtures/') && file !== 'seeds.ts' && file !== 'ci/seeds.test.ts')
    expect(files.length).toBeGreaterThan(50)
    const problems = files.flatMap((file) =>
      hardCodedSeedCounts(readFileSync(path.join(root, 'tests', file), 'utf8')).map(({ line, text }) => `tests/${file}:${line}: ${text}`),
    )
    // A property runs 200 seeds on a pull request and 10,000 in the nightly run (A§5.10): `import { seeds } from '../seeds'` (tests/seeds.ts),
    // `const SEEDS = seeds(1)` and a title with `${SEEDS.length}` give it the count that the run asks for.
    expect(problems, "seed counts written by hand: read the knob of tests/seeds.ts, so that the nightly run's 10,000 reach them").toEqual([])
  })

  test('has the suites of W0 on the knob', () => {
    for (const file of [
      'ledger/import',
      'ledger/merge',
      'ledger/no-weight',
      'ledger/export',
      'sim/steploop',
      'sim/steploop-model',
      'sim/workload',
      'play/loop-engine',
      'play/replay',
    ]) {
      expect(read(`tests/${file}.test.ts`), file).toMatch(/from '\.\.\/seeds'/)
    }
  })
})
