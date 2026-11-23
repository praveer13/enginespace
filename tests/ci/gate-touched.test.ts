/*
 * W2b-T02 and W2b-T70: the merge gate's plan (scripts/gate/touched.ts), one test for each row of its mapping, and the parts of
 * scripts/gate/run.ts that decide a verdict or write a failure down. The plan is pure, so nothing here starts a browser.
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir, userInfo } from 'node:os'
import path from 'node:path'
import { WALKED } from '../../e2e/levels'
import {
  changedPaths,
  clean,
  failureRecords,
  failures,
  failuresHead,
  hostLines,
  keyOf,
  pickPython,
  PYTHONS,
  routesAdded,
  routesOf,
  sortFailures,
  supportImporters,
  uvEnv,
  verdict,
  writeFailures,
} from '../../scripts/gate/run'
import {
  FORGE_COMMANDS,
  GAMES,
  GRADER_COMMANDS,
  KIT_RUN,
  LAB_SPEC,
  PAGES,
  plan,
  PLANNED_GAMES,
  PROVE_SPECS,
  RELOCK_NOT_RUN,
  ROSTER_COMMAND,
  routeGrep,
  SIM,
  SMOKE_SPECS,
  TRACE_GAMES,
  UNGATED,
  walkGrep,
  type Context,
  type Step,
} from '../../scripts/gate/touched'
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

  // W2b-T70: the kit's Frame, first move, intro, run and record, the game page and the registry are the kit-run row (below); the rest keeps this one.
  for (const path of ['src/games/kit/Debrief.tsx', 'src/design/tokens.css', 'src/index.css']) {
    test(`${path} gives one level of every game, design-parts and screens, and says that the task runs every level`, () => {
      const made = on(path)
      expect(step(made, 'features', false)?.specs).toEqual(['design-parts'])
      expect(step(made, 'smoke', false)?.specs).toEqual(['screens', 'walks'])
      expect(step(made, 'smoke', true)).toBeUndefined()
      expect(made.notes.join(' ')).toContain('every level of every game')
    })
  }

  test('the rest of src/games and of packages/play, which no game owns, is held to the kit\'s checks', () => {
    for (const file of ['src/games/specials/Specials.tsx', 'src/games/replay-dock.ts', 'packages/play/keys.ts', 'packages/play/registry.ts']) expect(on(file)).toEqual(on('src/games/kit/a.ts'))
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

  // W2b-T70: packages/sim/trace/ is the sim row's now (engine-floor stands on it too); src/trace/ adds the games that embed the viewer once registered.
  test('src/trace/ gives trace-view', () => {
    for (const file of ['src/trace/a.ts']) expect(step(on(file), 'features', false)?.specs).toEqual(['trace-view'])
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

  // W2b-T70: src/pages/Today.tsx is the page row's now; a folder that no row names is the example instead.
  test('a path that no row names runs nothing, and says so', () => {
    const made = on('docs/TRACKER.md', 'README.md', 'src/elsewhere/a.ts')
    expect(made.steps).toEqual([])
    expect(made.unmapped).toEqual(['README.md', 'docs/TRACKER.md', 'src/elsewhere/a.ts'])
  })

  test('rows that meet in one step are joined, each spec once', () => {
    const made = on('content/a.md', 'src/games/pool/a.ts')
    expect(step(made, 'features', false)?.specs).toEqual(['items', 'lesson-games', 'lesson-games-scene', 'lesson-predict', 'map', 'pool', 'pool-scene', 'titles', 'today'])
    expect(step(made, 'features', false)?.why).toEqual(['content', 'game pool'])
  })
})

const ids = (made: ReturnType<typeof plan>) => made.commands.map((command) => command.id)
const GRADER_IDS = ['uv lock', 'grader unittest', 'grader selftest', 'pack-kit', 'verify:schema', 'verify:vectors', 'bestiary and fixtures']
const FORGE_IDS = ['cargo test', 'verify:labs']

describe('the lab rows (W2b-T43)', () => {
  const graderPaths = [
    'labs/grader/tests/test_x.py', 'labs/gpu/a.py', 'labs/envs/vllm/uv.lock', 'labs/references/a.json', 'course.lock.json', 'packages/schema/a.ts', 'schemas/a.json',
    'src/receipts/atlas.ts', 'packages/verify/a.ts', 'tests/verify/bestiary.test.ts', 'tests/fixtures/grader/a.json', 'tests/fixtures/references/a.json', 'tests/fixtures/receipts/a.json',
  ]
  for (const file of graderPaths) {
    test(`${file} gives the grader's seven checks and says relock was not run`, () => {
      const made = on(file)
      expect(ids(made)).toEqual(GRADER_IDS)
      expect(made.notRun).toEqual([RELOCK_NOT_RUN])
      expect(made.unmapped).toEqual([])
    })
  }

  test('the grader row\'s commands are the ones the task names, in labs.yml\'s order, and uv ones are marked', () => {
    expect(GRADER_COMMANDS.map((command) => command.argv.join(' '))).toEqual([
      'uv lock --check --project labs/grader',
      'uv run --project labs/grader python -m unittest',
      'uv run --project labs/grader enginespace selftest --no-suite',
      'bun scripts/pack-kit.ts --check',
      'bun run verify:schema',
      'bun run verify:vectors',
      'bun test tests/verify/bestiary.test.ts tests/verify/fixtures.test.ts',
    ])
    expect(GRADER_COMMANDS.filter((command) => command.uv).map((command) => command.id)).toEqual(['uv lock', 'grader unittest', 'grader selftest'])
  })

  for (const file of ['labs/forge/src/lib.rs', 'src/forge/host.ts', 'packages/sim/forge/a.ts', 'tests/fixtures/forge/a.wasm']) {
    test(`${file} gives cargo test and verify:labs with RUSTUP_AUTO_INSTALL=0`, () => {
      const made = on(file)
      expect(ids(made)).toEqual(FORGE_IDS)
      expect(made.commands.every((command) => command.env?.RUSTUP_AUTO_INSTALL === '0')).toBe(true)
      expect(made.notRun).toEqual([])
      expect(made.unmapped).toEqual([])
    })
  }

  test('a forge path and a grader path together give both rows, and the browser rows still run', () => {
    const made = on('src/receipts/a.ts', 'labs/forge/a.rs')
    expect(ids(made)).toEqual([...GRADER_IDS, ...FORGE_IDS])
    expect(step(made, 'features', false)?.specs).toEqual(['forge', 'forge-hybrid-kv', 'lab-kits', 'receipts', 'receipts-import', 'rejection-sampler'])
  })

  test('a path outside the lab rows gives no command', () => {
    expect(on('src/games/pool/a.ts', 'content/a.md', 'docs/a.md').commands).toEqual([])
    expect(on('labs/agent-kit/a.md').commands).toEqual([])
  })

  test('no path maps to a step that does not run: every script, package script and manifest a command names exists', () => {
    const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>
    for (const { argv } of [...GRADER_COMMANDS, ...FORGE_COMMANDS]) {
      if (argv[0] === 'bun' && argv[1] === 'run') expect([argv[2], argv[2] in scripts]).toEqual([argv[2], true])
      for (const arg of argv) if (/\.(ts|toml)$/.test(arg) && !arg.startsWith('--')) expect([arg, existsSync(path.join(root, arg))]).toEqual([arg, true])
    }
    expect(existsSync(path.join(root, 'labs/grader/pyproject.toml'))).toBe(true)
  })

  test('labs.yml runs each of the commands, as written (pack-kit --check is the task\'s own addition and runs here)', () => {
    const labs = read('.github/workflows/labs.yml')
    for (const { argv } of [...GRADER_COMMANDS, ...FORGE_COMMANDS].filter((command) => command.id !== 'pack-kit')) expect([argv.join(' '), labs.includes(argv.join(' '))]).toEqual([argv.join(' '), true])
  })

  test('uv runs offline, never downloads, and names an interpreter inside requires-python', () => {
    const env = uvEnv({ PATH: 'x', UV_OFFLINE: '0' }, '3.13')
    expect(env).toMatchObject({ PATH: 'x', UV_OFFLINE: '1', UV_PYTHON_DOWNLOADS: 'never', UV_PYTHON: '3.13' })
    const range = /requires-python = ">=(\d+)\.(\d+),<(\d+)\.(\d+)"/.exec(read('labs/grader/pyproject.toml'))
    expect(range).not.toBeNull()
    const [low, high] = [Number(range?.[2]), Number(range?.[4])]
    for (const version of PYTHONS) expect(Number(version.split('.')[1]) >= low && Number(version.split('.')[1]) < high).toBe(true)
    expect(PYTHONS[0]).toBe('3.13')
    expect(typeof pickPython === 'function').toBe(true)
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
  const known = JSON.parse(read('scripts/gate/known-red.json')) as {
    red: { file: string; title: string }[]
    flaky: { file: string; title: string }[]
    host: { file: string; title: string; reason: string; shownAt: string; date: string }[]
  }

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

  // W2b-T55: the host list holds the tests this build host cannot pass, each judged by measurement. It is capped at six, so that it never
  // becomes a place to park a failure, and each entry says why, at which commit it was shown to fail as first written, and when.
  test('holds at most six host entries, each with its file, title, measured reason, commit and date, in a spec that exists, and in no other list', () => {
    expect(Array.isArray(known.host)).toBe(true)
    expect(known.host.length).toBeLessThanOrEqual(6)
    const others = new Set([...known.red, ...known.flaky].map(keyOf))
    expect(new Set(known.host.map(keyOf)).size).toBe(known.host.length)
    for (const entry of known.host) {
      expect(Object.keys(entry).sort()).toEqual(['date', 'file', 'reason', 'shownAt', 'title'])
      expect(specs).toContain(entry.file.replace(/^e2e\//, '').replace(/\.spec\.ts$/, ''))
      expect(read(entry.file)).toContain(entry.title.split(' > ').at(-1)?.slice(0, 40) ?? '')
      expect(entry.title.length).toBeGreaterThan(0)
      expect(entry.reason).toMatch(/\[measured \d{4}-\d{2}-\d{2}/)
      expect(entry.shownAt).toMatch(/^[0-9a-f]{7,40}$/)
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(others.has(keyOf(entry))).toBe(false)
    }
  })
})

describe('the host list in a verdict', () => {
  const entry = { file: 'e2e/a.spec.ts', title: 'd > slow', reason: 'r [measured 2026-11-19]', shownAt: 'abc1234', date: '2026-11-19' }
  const known = { red: [{ file: 'e2e/a.spec.ts', title: 'd > red' }], flaky: [], host: [entry] }
  const fail = (title: string) => ({ file: 'e2e/a.spec.ts', title, error: 'x' })

  test('a host-listed failure is set aside, and any other failure of the same file is still refused', () => {
    const alone = sortFailures([fail('d > slow')], [], known)
    expect(alone.refused).toEqual([])
    expect(alone.hostFailed.map((test) => test.title)).toEqual(['d > slow'])
    const withOther = sortFailures([fail('d > slow'), fail('d > other'), fail('d > red')], [], known)
    expect(withOther.refused.map((test) => test.title)).toEqual(['d > other'])
    expect(withOther.known.map((test) => test.title)).toEqual(['d > red'])
    expect(sortFailures([fail('d > slow 2')], [], known).refused.map((test) => test.title)).toEqual(['d > slow 2'])
  })

  test('every entry is printed under "Not checked on this host" on every run, with what it did, even when no step ran it', () => {
    const none = hostLines(known.host, [])
    expect(none[0]).toStartWith('Not checked on this host')
    expect(none.join('\n')).toContain('e2e/a.spec.ts > d > slow')
    expect(none.join('\n')).toContain('not run by this gate')
    expect(none.join('\n')).toContain('abc1234, 2026-11-19')
    expect(hostLines(known.host, [sortFailures([fail('d > slow')], [], known)]).join('\n')).toContain('failed here this run')
    expect(hostLines(known.host, [sortFailures([], [{ file: 'e2e/a.spec.ts', title: 'd > slow' }], known)]).join('\n')).toContain('passed here this run')
    expect(hostLines([], [])).toEqual(['Not checked on this host: none (scripts/gate/known-red.json lists no test under host)'])
  })
})

describe('changedPaths reads every touched path, under its old and its new name, unquoted', () => {
  const scratch = (): { dir: string; git: (...args: string[]) => void; put: (file: string, text: string) => void; drop: (file: string) => void } => {
    const dir = mkdtempSync(path.join(tmpdir(), 'es-gate-paths-'))
    const git = (...args: string[]) => {
      const run = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' })
      if (run.status !== 0) throw new Error(`git ${args.join(' ')}: ${run.stderr}`)
    }
    const put = (file: string, text: string) => {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
      writeFileSync(path.join(dir, file), text)
    }
    const drop = (file: string) => rmSync(path.join(dir, file))
    git('init', '-q', '-b', 'main')
    return { dir, git, put, drop }
  }
  const body = Array.from({ length: 30 }, (_, i) => `line ${i} of a file that is long enough for git to pair it`).join('\n')

  test('a file moved out of a game\'s folder to a folder no pattern names still calls for the game\'s specs', () => {
    const { dir, git, put, drop } = scratch()
    try {
      put('src/games/pool/Pool.tsx', body)
      git('add', '-A')
      git('commit', '-q', '-m', 'base')
      git('tag', 'base')
      put('misc/elsewhere/Pool.tsx', body)
      drop('src/games/pool/Pool.tsx')
      git('add', '-A')
      git('commit', '-q', '-m', 'move')
      const paths = changedPaths('base', 'HEAD', dir)
      expect(paths.sort()).toEqual(['misc/elsewhere/Pool.tsx', 'src/games/pool/Pool.tsx'])
      expect(step(plan(paths, specs), 'features', false)?.specs).toContain('pool')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a deletion in a game\'s folder and a similar file added elsewhere in the same range still call for the game\'s specs', () => {
    const { dir, git, put, drop } = scratch()
    try {
      put('src/games/pool/Rack.ts', body)
      git('add', '-A')
      git('commit', '-q', '-m', 'base')
      git('tag', 'base')
      drop('src/games/pool/Rack.ts')
      git('add', '-A')
      git('commit', '-q', '-m', 'delete')
      put('docs/Rack.ts', `${body}\nlast line`)
      git('add', '-A')
      git('commit', '-q', '-m', 'add')
      const paths = changedPaths('base', 'HEAD', dir)
      expect(paths.sort()).toEqual(['docs/Rack.ts', 'src/games/pool/Rack.ts'])
      expect(step(plan(paths, specs), 'features', false)?.specs).toContain('pool')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a changed file with a non-ASCII character in its name, inside a game\'s folder, calls for the game\'s specs', () => {
    const { dir, git, put } = scratch()
    try {
      put('README.md', 'x')
      git('add', '-A')
      git('commit', '-q', '-m', 'base')
      git('tag', 'base')
      put('src/games/pool/café.ts', 'x')
      git('add', '-A')
      git('commit', '-q', '-m', 'add')
      const paths = changedPaths('base', 'HEAD', dir)
      expect(paths).toEqual(['src/games/pool/café.ts'])
      expect(step(plan(paths, specs), 'features', false)?.specs).toContain('pool')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

/* ------------------------------------------------------------------------------------------------------------------------------------ */
/* W2b-T70: the rows that closed the holes of wave 1b, the folders that every path must map to, the failure file and the verdict.        */
/* ------------------------------------------------------------------------------------------------------------------------------------ */

const repoFiles = (): Record<string, string> => {
  const files: Record<string, string> = {}
  for (const name of readdirSync(path.join(root, 'e2e'))) if (name.endsWith('.spec.ts')) files[`e2e/${name}`] = read(`e2e/${name}`)
  for (const name of readdirSync(path.join(root, 'e2e/support'))) files[`e2e/support/${name}`] = read(`e2e/support/${name}`)
  return files
}
const context: Context = { importers: supportImporters(repoFiles()), routesAdded: [] }
const at = (paths: string[], extra: Context = {}, names: readonly string[] = specs) => plan(paths, names, { ...context, ...extra })
const tracked = (...prefixes: string[]): string[] => {
  const run = spawnSync('git', ['-c', 'core.quotePath=false', 'ls-files', '--', ...prefixes], { cwd: root, encoding: 'utf8' })
  return run.stdout.split('\n').filter(Boolean)
}
const nightly = (made: ReturnType<typeof plan>) => step(made, 'smoke', true)

describe('the rows of W2b-T70', () => {
  test('src/scene/ gives scene-kit and every *-scene spec, and nothing else', () => {
    const made = on('src/scene/SceneCanvas.tsx')
    expect(made.steps).toEqual([{ project: 'features', nightly: false, specs: ['lesson-games-scene', 'loop-scene', 'pool-scene', 'scene-kit', 'verifier-scene'], why: ['scene'] }])
    expect(step(plan(['src/scene/a.ts'], [...specs, 'gap-hunt-scene']), 'features', false)?.specs).toContain('gap-hunt-scene')
  })

  for (const file of KIT_RUN) {
    test(`${file} gives the kit row, every game's primary spec and the nightly walks of every game`, () => {
      const made = on(file)
      expect(step(made, 'features', false)?.specs).toEqual(['design-parts', ...GAMES.filter((game) => specs.includes(game))].sort())
      expect(step(made, 'smoke', false)?.specs).toEqual(['screens'])
      expect(nightly(made)).toMatchObject({ specs: ['walks'], grep: walkGrep(GAMES) })
      expect(made.notes).toEqual([])
    })
  }

  test('a <game>-sizes spec is run by its game\'s row and not by the kit-run row', () => {
    const names = [...specs, 'pool-sizes']
    expect(step(plan(['src/games/pool/a.ts'], names), 'features', false)?.specs).toContain('pool-sizes')
    expect(step(plan(['src/games/kit/Frame.tsx'], names), 'features', false)?.specs).not.toContain('pool-sizes')
    expect(step(plan(['src/games/kit/Frame.tsx'], names), 'features', false)?.specs).toContain('pool')
  })

  test('packages/play/roster.ts runs tests/play/roster.test.ts and no browser step', () => {
    const made = on('packages/play/roster.ts')
    expect(made.steps).toEqual([])
    expect(made.commands.map((command) => command.argv.join(' '))).toEqual(['bun test tests/play/roster.test.ts'])
    expect(made.unmapped).toEqual([])
    expect(existsSync(path.join(root, ROSTER_COMMAND.argv[2]))).toBe(true)
  })

  test('src/prove/ and packages/ledger/ give settings, ledger-conformance, every prove-* spec and the specs that hold a Prove describe', () => {
    for (const file of ['src/prove/window.ts', 'packages/ledger/codec.ts']) {
      expect(step(on(file), 'features', false)?.specs).toEqual(['ledger-conformance', 'settings', ...PROVE_SPECS].sort())
      expect(step(plan([file], [...specs, 'prove-mode']), 'features', false)?.specs).toContain('prove-mode')
    }
  })

  test('PROVE_SPECS is every spec but prove-* that holds a Prove describe', () => {
    const holding = specs.filter((name) => !name.startsWith('prove-') && /describe\(\s*['"`]Prove\b/.test(read(`e2e/${name}.spec.ts`)))
    expect([...PROVE_SPECS].sort()).toEqual(holding.sort())
  })

  test('packages/play/items/ and src/items/ give items, today and lesson-games', () => {
    for (const file of ['packages/play/items/catalog.ts', 'src/items/Attempt.tsx']) expect(on(file).steps).toEqual([{ project: 'features', nightly: false, specs: ['items', 'lesson-games', 'today'], why: ['items'] }])
  })

  test('packages/play/predictions/ gives lesson-predict and keep-list', () => {
    const made = on('packages/play/predictions/plan.ts')
    expect(step(made, 'features', false)?.specs).toEqual(['lesson-predict'])
    expect(step(made, 'smoke', false)?.specs).toEqual(['keep-list'])
    expect(nightly(made)).toBeUndefined()
  })

  test('src/labs/ gives lab-page and lab-kits', () => {
    expect(on('src/labs/copy.ts').steps).toEqual([{ project: 'features', nightly: false, specs: ['lab-kits', 'lab-page'], why: ['labs'] }])
  })

  test('a page gives its own specs, and a11y and screens at the nightly width for its routes only', () => {
    const made = on('src/pages/Today.tsx')
    expect(step(made, 'features', false)?.specs).toEqual(['today'])
    expect(nightly(made)).toMatchObject({ specs: ['a11y', 'screens'], grep: routeGrep(['/today']) })
    for (const file of ['src/settings/store.ts', 'src/evidence/rows.ts', 'src/progress/derive.ts', 'src/map/Stop.tsx', 'src/pages/Changes.tsx']) {
      const page = on(file)
      expect([file, nightly(page)?.specs]).toEqual([file, ['a11y', 'screens']])
      expect(page.unmapped).toEqual([])
    }
    expect(step(on('src/settings/store.ts'), 'features', false)?.specs).toEqual(['settings'])
    expect(step(on('src/map/Stop.tsx'), 'features', false)?.specs).toEqual(['map'])
  })

  test('every file of src/pages/ is a page of the table or the kit-run row, and every spec a page names exists', () => {
    for (const file of readdirSync(path.join(root, 'src/pages')).map((name) => `src/pages/${name}`)) {
      const named = PAGES.some((page) => page.paths.includes(file)) || KIT_RUN.includes(file)
      expect([file, named]).toEqual([file, true])
    }
    for (const page of PAGES) for (const name of page.specs) expect([page.paths[0], name, specs.includes(name)]).toEqual([page.paths[0], name, true])
  })

  test('a route\'s -g pattern takes the tests of that route in a11y and screens, and no other route\'s', () => {
    const grep = new RegExp(routeGrep(['/changes', '/m/[^/\\s]+']))
    const titles = {
      take: [
        'a11y.spec.ts at 320 px /changes: axe finds no serious or critical violation, and the headings are an outline',
        'a11y.spec.ts at 1280 px /m/tr2, with its 3D pass drawn: axe finds no serious or critical violation',
        'a11y.spec.ts R-T48: target sizes /m/tr2 at 360 px: targets are 24 px or more',
        'screens.spec.ts every route holds the checks of REDESIGN 5.2 /m/tr0',
      ],
      leave: [
        'a11y.spec.ts at 320 px /m/tr2/l3-async-scheduling-closes-the-bubble: axe finds no serious or critical violation',
        'a11y.spec.ts at 320 px /map: axe finds no serious or critical violation',
        'a11y.spec.ts R-T48: a lesson of each opener opener A (/m/tr5a/l1-x) at 390 x 844: a ring at every stop',
        'walks.spec.ts at 360 px KV page pool (pool), "One KV group" (one-group): the keys alone play it',
      ],
    }
    for (const title of titles.take) expect([title, grep.test(title)]).toEqual([title, true])
    for (const title of titles.leave) expect([title, grep.test(title)]).toEqual([title, false])
    expect(new RegExp(routeGrep(['/'])).test('a11y.spec.ts at 360 px /: axe finds no serious')).toBe(true)
    expect(new RegExp(routeGrep(['/'])).test('a11y.spec.ts at 360 px /map: axe finds no serious')).toBe(false)
  })

  test('the first data row: course.lock.json gives the grader\'s checks and a11y at the nightly width for /changes, and no screens', () => {
    const made = on('course.lock.json')
    expect(ids(made)).toEqual(GRADER_IDS)
    expect(nightly(made)).toMatchObject({ specs: ['a11y'], grep: routeGrep(['/changes']), why: ['changes'] })
    expect(made.unmapped).toEqual([])
  })

  test('the second data row: e2e/routes.ts gives a11y at the nightly width for the routes the branch adds, and content/modules/ for the pages of its files', () => {
    const added = at(['e2e/routes.ts'], { routesAdded: ['/m/tr3', '/m/tr3/l1-a.b'] })
    expect(nightly(added)).toMatchObject({ specs: ['a11y'], grep: routeGrep(['/m/tr3', '/m/tr3/l1-a\\.b']), why: ['routes'] })
    expect(at(['e2e/routes.ts']).steps).toEqual([])
    expect(at(['e2e/routes.ts']).unmapped).toEqual([])
    const lesson = on('content/modules/tr0/lessons/l3-nn-module-as-a-struct.md', 'content/modules/tr2/module.md')
    expect(nightly(lesson)).toMatchObject({ specs: ['a11y'], grep: routeGrep(['/m/tr0/l3-nn-module-as-a-struct', '/m/tr2']) })
    expect(step(lesson, 'features', false)?.specs).toEqual(['items', 'lesson-games', 'lesson-predict', 'map', 'titles', 'today'])
    expect(nightly(on('content/claims/tr0.yaml'))).toBeUndefined()
  })

  test('routesAdded reads the routes that e2e/routes.ts gains between two commits', () => {
    expect(routesOf("export const A = ['/', '/m/tr0', 'x']\nconst B = ['/play/pool?level=a']")).toEqual(['/', '/m/tr0', '/play/pool?level=a'])
    const dir = mkdtempSync(path.join(tmpdir(), 'es-gate-routes-'))
    const git = (...args: string[]) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' })
    try {
      git('init', '-q', '-b', 'main')
      mkdirSync(path.join(dir, 'e2e'))
      writeFileSync(path.join(dir, 'e2e/routes.ts'), "export const R = ['/', '/m/tr0']\n")
      git('add', '-A')
      git('commit', '-q', '-m', 'base')
      writeFileSync(path.join(dir, 'e2e/routes.ts'), "export const R = ['/', '/m/tr0', '/m/tr3']\n")
      git('commit', '-q', '-am', 'add')
      expect(routesAdded('HEAD~1', 'HEAD', dir)).toEqual(['/m/tr3'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('the shell gives route-change, stale-chunk and titles', () => {
    for (const file of ['src/App.tsx', 'src/main.tsx', 'src/routes.tsx', 'src/route-change.ts', 'src/route-preload.ts'])
      expect(on(file).steps).toEqual([{ project: 'features', nightly: false, specs: ['route-change', 'stale-chunk', 'titles'], why: ['shell'] }])
  })

  test('every folder of packages/sim is in the table, and each names registered or planned games and specs that exist', () => {
    const folders = readdirSync(path.join(root, 'packages/sim'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    for (const folder of folders) expect([folder, folder in SIM]).toEqual([folder, true])
    for (const [model, entry] of Object.entries(SIM)) {
      for (const game of entry.games) expect([model, game, game === '*' || GAMES.includes(game) || PLANNED_GAMES.includes(game)]).toEqual([model, game, true])
      for (const name of entry.specs ?? []) expect([model, name, specs.includes(name)]).toEqual([model, name, true])
    }
    for (const game of TRACE_GAMES) expect(GAMES.includes(game) || PLANNED_GAMES.includes(game)).toBe(true)
  })

  test('a model gives the rows of the games that stand on it: kv the pool, tiers forge-hybrid-kv, trace engine-floor and trace-view, core every game', () => {
    const kv = on('packages/sim/kv/pages.ts')
    expect(step(kv, 'features', false)?.specs).toEqual(on('src/games/pool/a.ts').steps[0].specs)
    expect(nightly(kv)?.grep).toBe(walkGrep(['pool']))
    expect(ids(kv)).toEqual(FORGE_IDS)
    expect(step(on('packages/sim/tiers/a.ts'), 'features', false)?.specs).toEqual(['forge-hybrid-kv'])
    const trace = on('packages/sim/trace/b.ts')
    expect(step(trace, 'features', false)?.specs).toEqual([...step(on('src/games/engine-floor/a.ts'), 'features', false)?.specs ?? [], 'trace-view'].sort())
    expect(ids(trace)).toEqual(GRADER_IDS)
    expect(nightly(on('packages/sim/core/rng.ts'))?.grep).toBe(walkGrep(GAMES))
    expect(on('packages/sim/index.ts').steps).toEqual(on('src/forge/a.ts').steps)
  })

  test('a planned game\'s folders get its game row before it is registered, without walks', () => {
    const made = plan(['src/games/switchyard/View2D.tsx'], [...specs, 'switchyard-sizes'])
    expect(step(made, 'features', false)?.specs).toEqual(['lesson-games', 'lesson-games-scene', 'lesson-predict', 'switchyard-sizes'])
    expect(nightly(made)).toBeUndefined()
    expect(made.notes).toEqual([])
  })

  test('the labs map\'s lab paths give the grader\'s or the forge\'s checks', () => {
    for (const file of ['packages/sim/workload/a.ts', 'packages/sim/bench/a.ts', 'packages/sim/core/a.ts', 'packages/sim/tensor/a.ts', 'scripts/vectors.ts', 'scripts/export-schemas.ts', 'tests/fixtures/sim/a.json', 'scripts/triton-interp/a.py'])
      expect([file, ids(on(file))]).toEqual([file, GRADER_IDS])
    for (const file of ['packages/sim/tiers/a.ts', 'packages/sim/kv/a.ts', 'packages/sim/spec/a.ts', 'scripts/labs/zip.ts', 'scripts/verify-labs.ts', 'scripts/pack-labs.ts'])
      expect([file, ids(on(file))]).toEqual([file, FORGE_IDS])
  })

  test('a support file gives the specs that import it, through other support files too; walks.ts is also the walkers row', () => {
    expect(step(at(['e2e/support/pixels.ts']), 'features', false)?.specs).toEqual(['loop-scene', 'pool-scene', 'verifier-scene'])
    expect(step(at(['e2e/support/pixels.ts']), 'smoke', false)?.specs).toEqual(['screenshots'])
    expect(context.importers?.['e2e/support/copy-scan.ts']).toContain('a11y')
    const walks = at(['e2e/support/walks.ts'])
    expect(nightly(walks)?.grep).toBe(walkGrep(GAMES))
    expect(step(walks, 'features', false)?.specs).toContain('shape-shifter')
    const site = at(['e2e/support/site.ts'])
    expect(site.steps).toEqual([])
    expect(site.unmapped).toEqual([])
    expect(site.notes.join(' ')).toContain('no row, by design')
  })

  test('the rows that meet at the nightly width are one step, under one -g', () => {
    const made = on('src/games/pool/a.ts', 'src/pages/Today.tsx')
    expect(made.steps.filter((candidate) => candidate.nightly)).toHaveLength(1)
    expect(nightly(made)).toMatchObject({ specs: ['a11y', 'screens', 'walks'], grep: `${walkGrep(['pool'])}|${routeGrep(['/today'])}` })
  })

  test('no row runs a levels file, or anything at the nightly seed count', () => {
    const everything = at([...tracked('src', 'packages', 'e2e', 'content', 'labs', 'scripts'), 'course.lock.json'])
    for (const command of everything.commands) {
      expect([command.id, command.argv.some((arg) => arg.includes('-levels.test'))]).toEqual([command.id, false])
      expect([command.id, Object.keys(command.env ?? {}).some((key) => key.startsWith('ES_PROPERTY'))]).toEqual([command.id, false])
    }
  })
})

describe('every folder has a row or a stated reason', () => {
  test('every tracked file under src/, packages/ and e2e/support/ maps to a row, or is under UNGATED with its reason', () => {
    const files = tracked('src', 'packages', 'e2e/support')
    expect(files.length).toBeGreaterThan(300)
    const folders = new Map<string, string[]>()
    for (const file of files) {
      const unmapped = at([file]).unmapped
      if (unmapped.length > 0) folders.set(path.dirname(file), [...(folders.get(path.dirname(file)) ?? []), file])
    }
    expect([...folders.keys()]).toEqual([])
  })

  test('a folder with no row and no reason fails that test: it is unmapped', () => {
    expect(at(['src/newfolder/a.ts']).unmapped).toEqual(['src/newfolder/a.ts'])
    expect(at(['packages/newpackage/a.ts']).unmapped).toEqual(['packages/newpackage/a.ts'])
    expect(at(['packages/sim/newmodel/a.ts']).unmapped).toEqual(['packages/sim/newmodel/a.ts'])
  })

  test('each UNGATED entry names a path that exists, with a reason', () => {
    for (const [prefix, reason] of Object.entries(UNGATED)) {
      expect([prefix, existsSync(path.join(root, prefix))]).toEqual([prefix, true])
      expect(reason.length).toBeGreaterThan(20)
    }
  })

  test('the plan of a branch that changes documents only is what it was before W2b-T70', () => {
    expect(on('docs/TRACKER.md', 'AGENTS.md', 'README.md', 'docs/waves/W2m1b-report.md')).toEqual({
      steps: [],
      commands: [],
      notRun: [],
      unmapped: ['AGENTS.md', 'README.md', 'docs/TRACKER.md', 'docs/waves/W2m1b-report.md'],
      notes: [],
    })
  })
})

/** A report that Playwright's JSON reporter wrote for a spec with one failing test (two attempts, with stdout and stderr) and one passing. */
const RECORDED = JSON.parse(String.raw`{"suites":[{"title":"walks.spec.ts","file":"walks.spec.ts","column":0,"line":0,"specs":[],"suites":[{"title":"at 360 px","file":"walks.spec.ts","line":2,"column":6,"specs":[{"title":"a","ok":false,"tags":[],"tests":[{"timeout":30000,"annotations":[],"expectedStatus":"passed","projectId":"","projectName":"","results":[{"workerIndex":0,"parallelIndex":0,"status":"failed","duration":5,"error":{"message":"Error: the debrief shows\n\n\u001b[2mexpect(\u001b[22m\u001b[31mreceived\u001b[39m\u001b[2m).\u001b[22mtoBe\u001b[2m(\u001b[22m\u001b[32mexpected\u001b[39m\u001b[2m) // Object.is equality\u001b[22m\n\nExpected: \u001b[32m3\u001b[39m\nReceived: \u001b[31m2\u001b[39m","stack":"Error: the debrief shows\n\n\u001b[2mexpect(\u001b[22m\u001b[31mreceived\u001b[39m\u001b[2m).\u001b[22mtoBe\u001b[2m(\u001b[22m\u001b[32mexpected\u001b[39m\u001b[2m) // Object.is equality\u001b[22m\n\nExpected: \u001b[32m3\u001b[39m\nReceived: \u001b[31m2\u001b[39m\n    at @ROOT@/e2e/walks.spec.ts:6:40","location":{"file":"@ROOT@/e2e/walks.spec.ts","column":40,"line":6},"snippet":"  4 |     console.log('focus was on the Start button before the first key')\n  5 |     console.error('the walk stopped at stop 3 of 7')\n> 6 |     expect(1 + 1, 'the debrief shows').toBe(3)\n    |                                        ^\n  7 |   })\n  8 |   test('b', async () => {\n  9 |     expect(2).toBe(2)"},"errors":[{"location":{"file":"@ROOT@/e2e/walks.spec.ts","column":40,"line":6},"message":"Error: the debrief shows\n\n\u001b[2mexpect(\u001b[22m\u001b[31mreceived\u001b[39m\u001b[2m).\u001b[22mtoBe\u001b[2m(\u001b[22m\u001b[32mexpected\u001b[39m\u001b[2m) // Object.is equality\u001b[22m\n\nExpected: \u001b[32m3\u001b[39m\nReceived: \u001b[31m2\u001b[39m\n\n  4 |     console.log('focus was on the Start button before the first key')\n  5 |     console.error('the walk stopped at stop 3 of 7')\n> 6 |     expect(1 + 1, 'the debrief shows').toBe(3)\n    |                                        ^\n  7 |   })\n  8 |   test('b', async () => {\n  9 |     expect(2).toBe(2)\n    at @ROOT@/e2e/walks.spec.ts:6:40"}],"stdout":[{"text":"focus was on the Start button before the first key\n"}],"stderr":[{"text":"the walk stopped at stop 3 of 7\n"}],"retry":0,"startTime":"2026-11-23T04:32:41.914Z","annotations":[],"attachments":[{"name":"error-context","contentType":"text/markdown","path":"@ROOT@/test-results/walks-at-360-px-a/error-context.md"}],"errorLocation":{"file":"@ROOT@/e2e/walks.spec.ts","column":40,"line":6}},{"workerIndex":1,"parallelIndex":0,"status":"failed","duration":4,"error":{"message":"Error: the debrief shows\n\n\u001b[2mexpect(\u001b[22m\u001b[31mreceived\u001b[39m\u001b[2m).\u001b[22mtoBe\u001b[2m(\u001b[22m\u001b[32mexpected\u001b[39m\u001b[2m) // Object.is equality\u001b[22m\n\nExpected: \u001b[32m3\u001b[39m\nReceived: \u001b[31m2\u001b[39m","stack":"Error: the debrief shows\n\n\u001b[2mexpect(\u001b[22m\u001b[31mreceived\u001b[39m\u001b[2m).\u001b[22mtoBe\u001b[2m(\u001b[22m\u001b[32mexpected\u001b[39m\u001b[2m) // Object.is equality\u001b[22m\n\nExpected: \u001b[32m3\u001b[39m\nReceived: \u001b[31m2\u001b[39m\n    at @ROOT@/e2e/walks.spec.ts:6:40","location":{"file":"@ROOT@/e2e/walks.spec.ts","column":40,"line":6},"snippet":"  4 |     console.log('focus was on the Start button before the first key')\n  5 |     console.error('the walk stopped at stop 3 of 7')\n> 6 |     expect(1 + 1, 'the debrief shows').toBe(3)\n    |                                        ^\n  7 |   })\n  8 |   test('b', async () => {\n  9 |     expect(2).toBe(2)"},"errors":[{"location":{"file":"@ROOT@/e2e/walks.spec.ts","column":40,"line":6},"message":"Error: the debrief shows\n\n\u001b[2mexpect(\u001b[22m\u001b[31mreceived\u001b[39m\u001b[2m).\u001b[22mtoBe\u001b[2m(\u001b[22m\u001b[32mexpected\u001b[39m\u001b[2m) // Object.is equality\u001b[22m\n\nExpected: \u001b[32m3\u001b[39m\nReceived: \u001b[31m2\u001b[39m\n\n  4 |     console.log('focus was on the Start button before the first key')\n  5 |     console.error('the walk stopped at stop 3 of 7')\n> 6 |     expect(1 + 1, 'the debrief shows').toBe(3)\n    |                                        ^\n  7 |   })\n  8 |   test('b', async () => {\n  9 |     expect(2).toBe(2)\n    at @ROOT@/e2e/walks.spec.ts:6:40"}],"stdout":[{"text":"focus was on the Start button before the first key\n"}],"stderr":[{"text":"the walk stopped at stop 3 of 7\n"}],"retry":1,"startTime":"2026-11-23T04:32:42.343Z","annotations":[],"attachments":[{"name":"error-context","contentType":"text/markdown","path":"@ROOT@/test-results/walks-at-360-px-a-retry1/error-context.md"}],"errorLocation":{"file":"@ROOT@/e2e/walks.spec.ts","column":40,"line":6}}],"status":"unexpected"}],"id":"3fdb7982bf0ca9bf76dd-70af8a19b4b15cd4972b","file":"walks.spec.ts","line":3,"column":3},{"title":"b","ok":true,"tags":[],"tests":[{"timeout":30000,"annotations":[],"expectedStatus":"passed","projectId":"","projectName":"","results":[{"workerIndex":2,"parallelIndex":0,"status":"passed","duration":3,"errors":[],"stdout":[],"stderr":[],"retry":0,"startTime":"2026-11-23T04:32:42.748Z","annotations":[],"attachments":[]}],"status":"expected"}],"id":"3fdb7982bf0ca9bf76dd-c1f048f1ee2281b74a7a","file":"walks.spec.ts","line":8,"column":3}]}]}],"errors":[],"stats":{"startTime":"2026-11-23T04:32:41.499Z","duration":1285.3629999999998,"expected":1,"skipped":0,"unexpected":1,"flaky":0}}
`.split('@ROOT@').join(root)) as Parameters<typeof failures>[0]

describe('the verdict reads a recorded report as it did before W2b-T70', () => {
  const known = (red: { file: string; title: string }[], host: { file: string; title: string; reason: string; shownAt: string; date: string }[] = []) => ({ red, flaky: [], host })
  const result = (k: ReturnType<typeof known>) => {
    const { failed, passed } = failures(RECORDED)
    return { crash: undefined, ...sortFailures(failed, passed, k) }
  }

  test('a failure in no list fails the gate; red or host listed, it does not; a step that could not run or a failed check does', () => {
    expect(failures(RECORDED).failed.map((test) => [test.file, test.title])).toEqual([['e2e/walks.spec.ts', 'at 360 px > a']])
    expect(verdict([result(known([]))], 0)).toBe(1)
    expect(verdict([result(known([{ file: 'e2e/walks.spec.ts', title: 'at 360 px > a' }]))], 0)).toBe(0)
    expect(verdict([result(known([], [{ file: 'e2e/walks.spec.ts', title: 'at 360 px > a', reason: 'r [measured 2026-11-22]', shownAt: 'abc1234', date: '2026-11-22' }]))], 0)).toBe(0)
    expect(verdict([{ crash: 'no test result', refused: [] }], 0)).toBe(1)
    expect(verdict([], 1)).toBe(1)
    expect(verdict([], 0)).toBe(0)
  })
})

describe('the failures file', () => {
  test('holds each failed test whole: every attempt, its error and stack, stdout, stderr and attachments, and no ANSI colour', () => {
    const records = failureRecords(RECORDED)
    expect(records).toHaveLength(1)
    const [record] = records
    expect(record).toStartWith('FAILED e2e/walks.spec.ts > at 360 px > a')
    expect(record).toContain('attempt 1 of 2 (retry 0)')
    expect(record).toContain('attempt 2 of 2 (retry 1)')
    expect(record).toContain('Expected: 3')
    expect(record).toContain('focus was on the Start button before the first key')
    expect(record).toContain('the walk stopped at stop 3 of 7')
    expect(record).toContain('attachment: error-context ./test-results/walks-at-360-px-a/error-context.md')
    expect(record).not.toContain('\u001b[')
  })

  test('holds neither the home path nor the login name, and the log prints its first 20 lines', () => {
    const user = userInfo().username
    const dir = mkdtempSync(path.join(tmpdir(), 'es-gate-failures-'))
    const file = path.join(dir, 'failures.txt')
    try {
      const noisy = [
        `FAILED e2e/a.spec.ts > t`,
        `error: at ${root}/e2e/a.spec.ts:3:1 and ${homedir()}/.cache/ms-playwright/chromium/chrome`,
        `stderr: user ${user} could not write /tmp/es-gate-x/report.json; ${user}:${user} owns ${homedir()}`,
        ...Array.from({ length: 30 }, (_, i) => `stdout line ${i}`),
      ].join('\n')
      writeFailures(file, [noisy, ...failureRecords(RECORDED)])
      const text = readFileSync(file, 'utf8')
      expect(text).not.toContain(homedir())
      if (user.length > 1) expect(new RegExp(`(?<![A-Za-z0-9_])${user}(?![A-Za-z0-9_])`).test(text)).toBe(false)
      expect(text).not.toContain(root)
      expect(text).toContain('./e2e/a.spec.ts:3:1')
      expect(failuresHead(file)).toHaveLength(20)
      expect(failuresHead(file)[0]).toBe('FAILED e2e/a.spec.ts > t')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
