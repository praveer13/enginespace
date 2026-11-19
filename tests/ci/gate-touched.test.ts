/*
 * W2b-T02: the merge gate's plan (scripts/gate/touched.ts), one test for each row of its mapping, and the parts of scripts/gate/run.ts that
 * decide a verdict. The plan is pure, so nothing here starts a browser.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { WALKED } from '../../e2e/levels'
import { clean, failures, keyOf } from '../../scripts/gate/run'
import { GAMES, LAB_SPEC, plan, SMOKE_SPECS, walkGrep, type Step } from '../../scripts/gate/touched'
import { read, root } from './support'

const specs = readdirSync(path.join(root, 'e2e'))
  .filter((name) => name.endsWith('.spec.ts'))
  .map((name) => name.slice(0, -'.spec.ts'.length))

const on = (...paths: string[]) => plan(paths, specs)
const step = (made: ReturnType<typeof plan>, project: Step['project'], nightly: boolean) => made.steps.find((candidate) => candidate.project === project && candidate.nightly === nightly)

describe('the specs the plan names', () => {
  test('the smoke list is the config\'s, and every other spec is the features project\'s', () => {
    const config = read('playwright.config.ts')
    const listed = /const SMOKE = \[([^\]]*)\]/.exec(config)?.[1] ?? ''
    expect([...listed.matchAll(/'([^']+)'/g)].map((match) => match[1])).toEqual([...SMOKE_SPECS])
    expect(specs).toContain(LAB_SPEC)
  })

  test('every spec that a row names exists', () => {
    const everything = plan(
      ['src/games/kit/a.ts', 'content/a.yaml', 'src/receipts/a.ts', 'src/forge/a.ts', 'src/trace/a.ts', 'src/front/a.ts', ...GAMES.map((game) => `src/games/${game}/a.ts`)],
      specs,
    )
    const named = new Set(everything.steps.flatMap((made) => made.specs))
    for (const name of ['lesson-games', 'lesson-games-scene', 'lesson-predict', 'keep-list', 'design-parts', 'screens', 'walks', 'items', 'map', 'titles', 'today', 'receipts', 'receipts-import', 'forge', 'forge-hybrid-kv', 'rejection-sampler', 'lab-kits', 'trace-view', 'front'])
      expect([name, named.has(name)]).toEqual([name, true])
  })
})

describe('the mapping, one row a test', () => {
  test('src/games/<g>/ gives the game\'s specs, the lesson specs, keep-list and the game\'s nightly walks', () => {
    const made = on('src/games/engine-floor/Floor.tsx')
    expect(step(made, 'features', false)?.specs).toEqual(['engine-floor', 'engine-floor-map', 'lesson-games', 'lesson-games-scene', 'lesson-predict'])
    expect(step(made, 'smoke', false)?.specs).toEqual(['keep-list'])
    expect(step(made, 'smoke', true)).toMatchObject({ specs: ['walks'], grep: '\\((engine-floor)\\)' })
    expect(made.unmapped).toEqual([])
  })

  test('packages/play/<g>/ gives the same as the game\'s folder in src/games, and loop does not take keyboard-loop', () => {
    const made = on('packages/play/loop/full/copy.ts')
    expect(made).toEqual(on('src/games/loop/anything.ts'))
    expect(step(made, 'features', false)?.specs).toEqual(['lesson-games', 'lesson-games-scene', 'lesson-predict', 'loop', 'loop-full', 'loop-scene'])
    expect(step(made, 'smoke', true)?.grep).toBe('\\((loop)\\)')
  })

  test('two games walk together, and a game of the registry without a spec of its own still gets the lesson specs', () => {
    const made = on('src/games/pool/a.ts', 'packages/play/verifier/b.ts')
    expect(step(made, 'smoke', true)?.grep).toBe('\\((pool|verifier)\\)')
    expect(step(made, 'features', false)?.specs).toEqual(['lesson-games', 'lesson-games-scene', 'lesson-predict', 'pool', 'pool-scene', 'verifier', 'verifier-scene'])
  })

  for (const path of ['src/games/kit/Frame.tsx', 'src/design/tokens.css', 'src/pages/Game.tsx', 'src/games/registry.ts']) {
    test(`${path} gives one level of every game, design-parts and screens, and says that the task runs every level`, () => {
      const made = on(path)
      expect(step(made, 'features', false)?.specs).toEqual(['design-parts'])
      expect(step(made, 'smoke', false)?.specs).toEqual(['screens', 'walks'])
      expect(step(made, 'smoke', true)).toBeUndefined()
      expect(made.notes.join(' ')).toContain('every level of every game')
    })
  }

  test('the rest of src/games and of packages/play, which no game owns, is held to the kit\'s checks', () => {
    for (const file of ['src/games/specials/Specials.tsx', 'src/games/replay-dock.ts', 'packages/play/keys.ts', 'packages/play/items/a.ts']) expect(on(file)).toEqual(on('src/games/kit/a.ts'))
  })

  test('content/, src/content/ and scripts/content/ give the lesson specs, items, map, titles and today', () => {
    for (const file of ['content/tr1/l1.md', 'src/content/load.ts', 'scripts/content/build.ts']) {
      const made = on(file)
      expect(made.steps).toHaveLength(1)
      expect(step(made, 'features', false)?.specs).toEqual(['items', 'lesson-games', 'lesson-predict', 'map', 'titles', 'today'])
    }
  })

  test('src/receipts/, packages/verify/ and src/workers/ give receipts and receipts-import', () => {
    for (const file of ['src/receipts/keep.ts', 'packages/verify/rules.ts', 'src/workers/receipt.ts']) expect(step(on(file), 'features', false)?.specs).toEqual(['receipts', 'receipts-import'])
  })

  test('src/forge/ and labs/forge/ give forge, forge-hybrid-kv, rejection-sampler and lab-kits', () => {
    for (const file of ['src/forge/a.ts', 'labs/forge/Cargo.toml']) expect(step(on(file), 'features', false)?.specs).toEqual(['forge', 'forge-hybrid-kv', 'lab-kits', 'rejection-sampler'])
  })

  test('src/trace/ and packages/sim/trace/ give trace-view', () => {
    for (const file of ['src/trace/a.ts', 'packages/sim/trace/b.ts']) expect(step(on(file), 'features', false)?.specs).toEqual(['trace-view'])
  })

  test('src/front/ gives front', () => {
    expect(on('src/front/a.tsx').steps).toEqual([{ project: 'features', nightly: false, specs: ['front'], why: ['front'] }])
  })

  test('a walker, the levels or the walks spec gives the nightly walks of every game, and the plain walks drop out', () => {
    for (const file of ['e2e/support/walks.ts', 'e2e/levels.ts', 'e2e/walks.spec.ts']) {
      const made = on(file, 'src/games/kit/a.ts')
      expect(step(made, 'smoke', true)?.grep).toBe(walkGrep(Object.keys(WALKED)))
      expect(step(made, 'smoke', false)?.specs).toEqual(['screens'])
    }
  })

  test('a spec that changes runs, in the project that holds it, and the lab profile never does', () => {
    expect(step(on('e2e/settings.spec.ts'), 'features', false)?.specs).toEqual(['settings'])
    expect(step(on('e2e/a11y.spec.ts'), 'smoke', false)?.specs).toEqual(['a11y'])
    expect(on('e2e/perf.spec.ts').steps).toEqual([])
  })

  test('a path that no row names runs nothing, and says so', () => {
    const made = on('docs/TRACKER.md', 'README.md', 'src/pages/Today.tsx')
    expect(made.steps).toEqual([])
    expect(made.unmapped).toEqual(['README.md', 'docs/TRACKER.md', 'src/pages/Today.tsx'])
  })

  test('rows that meet in one step are joined, each spec once', () => {
    const made = on('content/a.md', 'src/games/pool/a.ts')
    expect(step(made, 'features', false)?.specs).toEqual(['items', 'lesson-games', 'lesson-games-scene', 'lesson-predict', 'map', 'pool', 'pool-scene', 'titles', 'today'])
    expect(step(made, 'features', false)?.why).toEqual(['content', 'game pool'])
  })
})

describe('the verdict', () => {
  const report = {
    suites: [
      {
        title: 'walks.spec.ts',
        file: 'walks.spec.ts',
        specs: [],
        suites: [
          {
            title: 'at 360 px',
            file: 'walks.spec.ts',
            specs: [
              { title: 'a', file: 'walks.spec.ts', tests: [{ status: 'unexpected', results: [{ error: { message: 'boom\nmore' } }] }] },
              { title: 'b', file: 'walks.spec.ts', tests: [{ status: 'expected' }] },
            ],
          },
        ],
      },
    ],
  }

  test('a test is its file and its describes and title, and a failure is read from the report', () => {
    const { failed, passed } = failures(report)
    expect(failed).toEqual([{ file: 'e2e/walks.spec.ts', title: 'at 360 px > a', error: 'boom\nmore' }])
    expect(passed).toEqual([{ file: 'e2e/walks.spec.ts', title: 'at 360 px > b' }])
    expect(keyOf(failed[0])).not.toBe(keyOf(passed[0]))
  })

  test('a log names no absolute path of the machine', () => {
    expect(clean(`${root}/e2e/a.spec.ts failed in ${root}`)).toBe('./e2e/a.spec.ts failed in .')
    expect(clean('see /tmp/pw-1234/trace.zip now')).toBe('see <tmp> now')
  })
})

describe('the known-red list', () => {
  const known = JSON.parse(read('scripts/gate/known-red.json')) as { red: { file: string; title: string }[]; flaky: { file: string; title: string }[] }

  // The base had fifteen failing tests and two flaky ones. An entry leaves a list when its fix passes five of five, so the lists only shrink: a
  // count above these is an entry that was added, which the gate never allows.
  test('holds at most the base\'s fifteen failing tests and two flaky ones, each by file and title, each once, in a spec that exists', () => {
    expect(known.red.length).toBeLessThanOrEqual(15)
    expect(known.flaky.length).toBeLessThanOrEqual(2)
    expect(new Set([...known.red, ...known.flaky].map(keyOf)).size).toBe(known.red.length + known.flaky.length)
    for (const entry of [...known.red, ...known.flaky]) expect(specs).toContain(entry.file.replace(/^e2e\//, '').replace(/\.spec\.ts$/, ''))
    for (const entry of known.flaky) expect(['e2e/keyboard-loop.spec.ts', 'e2e/walks.spec.ts']).toContain(entry.file)
  })

  test('names no path of a machine', () => {
    expect(read('scripts/gate/known-red.json')).not.toMatch(/\/home\/|\/Users\/|\/tmp\//)
  })
})
