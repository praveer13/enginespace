/*
 * W2b-T02: the merge gate's plan (scripts/gate/touched.ts), one test for each row of its mapping, and the parts of scripts/gate/run.ts that
 * decide a verdict. The plan is pure, so nothing here starts a browser.
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { WALKED } from '../../e2e/levels'
import { changedPaths, clean, failures, hostLines, keyOf, pickPython, PYTHONS, sortFailures, uvEnv } from '../../scripts/gate/run'
import { FORGE_COMMANDS, GAMES, GRADER_COMMANDS, LAB_SPEC, plan, RELOCK_NOT_RUN, SMOKE_SPECS, walkGrep, type Step } from '../../scripts/gate/touched'
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
