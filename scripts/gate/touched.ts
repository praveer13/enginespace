/*
 * The merge gate's plan (W2b-T02, widened by W2b-T70): the paths that a branch changes in, the browser tests and checks that the branch
 * calls for out. Pure: it reads nothing but its arguments (scripts/gate/run.ts lists the changed paths, the specs, the importers of each
 * e2e/support file and the routes that e2e/routes.ts gains, and runs the plan), so tests/ci/gate-touched.test.ts holds every row of the
 * mapping.
 *
 * The smoke project's subset already runs on every merge, at its pull-request width. What this adds is what that subset leaves out: the
 * `features` project's specs, and the nightly sweep's width (ES_E2E_NIGHTLY=1: every level of a game walked at 360 and 1280 px, and axe at
 * 320, 360 and 1280 px), for the games, pages and parts that a branch touches. A step is one Playwright run, `--retries=0`; the
 * playwright.config.ts is not edited. Every nightly-width row meets in one step, under one `-g` that joins their filters.
 *
 * The mapping, row by row. A path can be in more than one row; a path that no row names runs nothing and is printed, and a path under
 * UNGATED runs nothing for the reason written there.
 *   game      src/games/<g>/, packages/play/<g>/      the game's own specs (e2e/<g>.spec.ts and e2e/<g>-*.spec.ts, its sizes spec among
 *                                                     them), lesson-games, lesson-games-scene, lesson-predict, keep-list, and the nightly
 *                                                     walks of <g>. A game of PLANNED_GAMES has the row before it is registered, without walks.
 *   sim       packages/sim/<model>/                   the game row of each registered game that SIM names for the model, and the specs
 *                                                     it names
 *   scene     src/scene/                              scene-kit and every *-scene spec
 *   kit run   KIT_RUN: the kit's Frame, first move, intro, run and record, src/pages/Game.tsx
 *                                                     the kit row below, every game's primary spec (e2e/<g>.spec.ts, not its sizes or
 *                                                     scene spec), and the nightly walks of every game
 *   registry  src/games/registry.ts                   the kit row below and the nightly walks of every game, which open every game's page
 *                                                     through the registry. Narrowed by the gate's minutes (D-077): not the primary specs
 *   kit       the rest of src/games/kit/, src/design/, src/index.css
 *                                                     one level of every game at 360 and 1280 px (SMOKE_LEVELS), design-parts, screens.
 *                                                     The task that made the change runs every level of every game itself and says so.
 *             (added with the same reason: the rest of src/games/ and of packages/play/ that no row below owns)
 *   roster    packages/play/roster.ts                 the command `bun test tests/play/roster.test.ts`, and no browser step
 *   items     packages/play/items/, src/items/        items, today, lesson-games
 *   predict   packages/play/predictions/              lesson-predict, keep-list
 *   prove     src/prove/, packages/ledger/            settings, ledger-conformance, every prove-* spec, and PROVE_SPECS
 *   labs      src/labs/                               lab-page, lab-kits
 *   page      PAGES: src/pages/<page>, src/settings/, src/evidence/, src/progress/, src/map/, src/unbuilt/
 *                                                     the page's own specs, and a11y and screens at the nightly width for its routes
 *                                                     (the lesson page: the first lesson of each module, narrowed by D-077's minutes)
 *   changes   course.lock.json                        a11y at the nightly width for /changes (and the grader row below)
 *   routes    e2e/routes.ts, content/modules/**       a11y at the nightly width for the routes the branch adds to e2e/routes.ts, and
 *                                                     for the module and lesson pages of the files it changes under content/modules/
 *   content   content/, src/content/, scripts/content/ lesson-games, lesson-predict, items, map, titles, today
 *   shell     src/App.tsx, src/main.tsx, src/routes.tsx, src/route-change.ts, src/route-preload.ts
 *                                                     route-change, stale-chunk, titles
 *   receipts  src/receipts/, packages/verify/, src/workers/    receipts, receipts-import
 *   forge     src/forge/, labs/forge/, packages/sim/index.ts    forge, forge-hybrid-kv, rejection-sampler, lab-kits
 *   trace     src/trace/                              trace-view, and the game row of each registered game that embeds the viewer
 *                                                     (TRACE_GAMES)
 *   front     src/front/                              front
 *   walkers   e2e/support/walks.ts, e2e/levels.ts, e2e/walks.spec.ts    the nightly walks of every game
 *   support   e2e/support/<file>                      every features spec that imports it, directly or through another support file. The
 *                                                     smoke specs among its importers run in the smoke project of every merge, and are not
 *                                                     run twice (narrowed by D-077's minutes)
 *   spec      e2e/<name>.spec.ts                      that spec
 * No row runs a `*-levels.test.ts` file at the nightly seed count: that is a HEAVY run of the task that edits it.
 *
 * The check rows are not browser steps but commands, and a path can be in a check row and in a row above (src/receipts/ is both):
 *   grader   GRADER_PREFIXES, course.lock.json       uv lock --check, the grader's unittest, its selftest, pack-kit --check, verify:schema,
 *                                                    verify:vectors and the bestiary and fixtures tests
 *   forge    FORGE_PREFIXES                          cargo test of the reference, and verify:labs
 *   roster   packages/play/roster.ts                 its unit test
 * `labs/envs/relock.sh --check` needs the network: the plan lists it under `notRun`, and labs.yml on the pull request is its evidence.
 * The uv commands run with UV_OFFLINE=1, UV_PYTHON_DOWNLOADS=never and an installed interpreter that run.ts picks (the Python step of `Command.uv`).
 */
import { WALKED } from '../../e2e/levels'

/** The games, by id: the keys of the walked levels. A game that a task adds to e2e/levels.ts is in the mapping from then on. */
export const GAMES: readonly string[] = Object.keys(WALKED)
/**
 * The games that wave 2 builds before they are registered: Trace attribution (W2-T20) and KV offload (W2-T30). Their folders get the game
 * row from their first commit, so that a game's first pieces are not gated as the kit; their walks join when e2e/levels.ts lists them.
 */
export const PLANNED_GAMES: readonly string[] = ['gap-hunt', 'switchyard']

/** The specs of playwright.config.ts's `smoke` project (tests/ci/gate-touched.test.ts holds this list to the config). Every other spec is `features`. */
export const SMOKE_SPECS: readonly string[] = ['a11y', 'first-visit', 'keep-list', 'keyboard-loop', 'network', 'reduced-motion', 'screenshots', 'screens', 'walks']
/** The lab profile's spec, a measurement and not a check: the gate never runs it. */
export const LAB_SPEC = 'perf'

export type Project = 'features' | 'smoke'

/** One Playwright run. */
export interface Step {
  readonly project: Project
  /** ES_E2E_NIGHTLY=1: the sweep's width. */
  readonly nightly: boolean
  /** Spec names without the directory or the `.spec.ts`, sorted. */
  readonly specs: readonly string[]
  /** A regular expression for `-g`, when only some tests of the specs are wanted. */
  readonly grep?: string
  /** Which rows asked for this step, for the report. */
  readonly why: readonly string[]
}

/** One command of a check row, run from the repository root. */
export interface Command {
  /** A short name for the report. */
  readonly id: string
  readonly argv: readonly string[]
  /** Environment added to the caller's. */
  readonly env?: Readonly<Record<string, string>>
  /** The command is uv's: run.ts gives it an offline environment and an installed interpreter. */
  readonly uv?: boolean
  readonly why: readonly string[]
}

export interface Plan {
  readonly steps: readonly Step[]
  /** The checks, in the order they run. */
  readonly commands: readonly Command[]
  /** The checks that this gate cannot run, and where their evidence is. */
  readonly notRun: readonly string[]
  /** The changed paths that map to nothing. */
  readonly unmapped: readonly string[]
  /** Notes for the report, such as "every level of every game is the task's own to run", and the reason of each UNGATED path. */
  readonly notes: readonly string[]
}

/** What run.ts reads from the repository for the rows that depend on more than a path. */
export interface Context {
  /** For each file of e2e/support/, the specs that import it, directly or through another support file. */
  readonly importers?: Readonly<Record<string, readonly string[]>>
  /** The routes that e2e/routes.ts holds at the head and did not at the base. */
  readonly routesAdded?: readonly string[]
}

const LESSON_GAME_SPECS = ['lesson-games', 'lesson-games-scene', 'lesson-predict']
const KIT_PREFIXES = ['src/games/kit/', 'src/design/']
const KIT_FILES = ['src/index.css']
/** The kit's files whose defects reached a finished branch in wave 1b (the Prove foot, the held strip, the first move, the intro), and the game page. */
export const KIT_RUN: readonly string[] = [
  'src/games/kit/Frame.tsx',
  'src/games/kit/first-move.ts',
  'src/games/kit/Intro.tsx',
  'src/games/kit/useRun.ts',
  'src/games/kit/record.ts',
  'src/pages/Game.tsx',
]
/** The games' registry: a change to it is a game joining or leaving, which every game's walk meets on its own page. */
export const REGISTRY = 'src/games/registry.ts'
const WALKER_FILES = ['e2e/support/walks.ts', 'e2e/levels.ts', 'e2e/walks.spec.ts']
const SHELL_FILES = ['src/App.tsx', 'src/main.tsx', 'src/routes.tsx', 'src/route-change.ts', 'src/route-preload.ts']
const FORGE_SPECS = ['forge', 'forge-hybrid-kv', 'rejection-sampler', 'lab-kits']
const RECEIPT_SPECS = ['receipts', 'receipts-import']

/** The specs other than prove-* that hold a Prove describe. A spec that gains one joins this list in the same branch (a gate line, under an allow). */
export const PROVE_SPECS: readonly string[] = ['shape-shifter', 'verifier']

/**
 * The games that stand on each model of packages/sim, by what imports it, and the specs beside them. `*` is every game: core is under every
 * game, so a change to it runs the kit-run row's primary specs and the nightly walks of every game. A game of PLANNED_GAMES is named here
 * already, and joins when it is registered. tests/ci/gate-touched.test.ts fails for a folder of packages/sim that is not here.
 */
export const SIM: Readonly<Record<string, { readonly games: readonly string[]; readonly specs?: readonly string[] }>> = {
  bench: { games: ['broken-bench'] },
  core: { games: ['*'] },
  defend: { games: [], specs: RECEIPT_SPECS },
  forge: { games: [], specs: FORGE_SPECS },
  host: { games: ['loop', 'gap-hunt'], specs: ['trace-view'] },
  kv: { games: ['pool', 'switchyard'] },
  lifecycle: { games: ['engine-floor'] },
  physics: { games: ['loop', 'gap-hunt'], specs: ['trace-view'] },
  spec: { games: ['verifier'] },
  steploop: { games: ['loop', 'gap-hunt'], specs: ['scene-kit', 'trace-view'] },
  tensor: { games: ['shape-shifter'] },
  tiers: { games: ['switchyard'], specs: ['forge-hybrid-kv'] },
  trace: { games: ['engine-floor', 'gap-hunt'], specs: ['trace-view'] },
  workload: { games: ['broken-bench', 'loop', 'gap-hunt'], specs: ['scene-kit'] },
  yard: { games: ['switchyard'] },
}

/** The games whose page embeds the trace viewer of src/trace/. */
export const TRACE_GAMES: readonly string[] = ['gap-hunt']

/** A route's `-g` pattern, matched exactly. */
const exact = (route: string) => route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const MODULE_ROUTE = '/m/[^/\\s]+'
/** The first lesson of each module: the lesson page's routes at the nightly width, narrowed from every lesson by D-077's minutes. */
const FIRST_LESSONS = '/m/[^/\\s]+/l1-[^/\\s]+'

/**
 * The pages, each with its own specs and the routes it serves, as `-g` patterns over the routes of a11y and screens (a route stands in a
 * test's title after a space, and is followed by a colon, a comma, a space or the end). A CSS file of src/pages/ is the pages that import it.
 */
export const PAGES: readonly { readonly paths: readonly string[]; readonly specs: readonly string[]; readonly routes: readonly string[] }[] = [
  { paths: ['src/pages/Front.tsx'], specs: ['front', 'first-visit'], routes: [exact('/')] },
  { paths: ['src/pages/Map.tsx'], specs: ['map'], routes: [exact('/map')] },
  { paths: ['src/pages/Module.tsx', 'src/pages/module.css'], specs: ['map'], routes: [MODULE_ROUTE] },
  { paths: ['src/pages/Lesson.tsx'], specs: ['lesson-games', 'lesson-predict'], routes: [FIRST_LESSONS] },
  { paths: ['src/pages/PlayIndex.tsx'], specs: [], routes: [exact('/play')] },
  { paths: ['src/pages/Lab.tsx'], specs: ['lab-page', 'lab-kits'], routes: ['/labs/[^\\s:,]+'] },
  { paths: ['src/pages/TraceRoom.tsx'], specs: ['trace-view'], routes: ['/trace-room(?:/[^\\s:,]+)?'] },
  { paths: ['src/pages/Receipts.tsx'], specs: RECEIPT_SPECS, routes: [exact('/receipts')] },
  { paths: ['src/pages/Today.tsx'], specs: ['today'], routes: [exact('/today')] },
  { paths: ['src/pages/Evidence.tsx', 'src/evidence/'], specs: ['settings'], routes: [exact('/evidence')] },
  { paths: ['src/pages/Design.tsx'], specs: ['design-parts'], routes: [exact('/design')] },
  { paths: ['src/pages/Settings.tsx', 'src/settings/'], specs: ['settings'], routes: [exact('/settings')] },
  { paths: ['src/pages/About.tsx'], specs: ['route-change'], routes: [exact('/about')] },
  { paths: ['src/pages/Changes.tsx'], specs: [], routes: [exact('/changes')] },
  { paths: ['src/pages/NotFound.tsx'], specs: ['route-change', 'titles'], routes: [] },
  {
    paths: ['src/pages/panels.css'],
    specs: ['receipts', 'settings', 'today', 'route-change', 'lab-page'],
    routes: [exact('/receipts'), exact('/settings'), exact('/evidence'), exact('/about'), exact('/today'), exact('/changes'), MODULE_ROUTE],
  },
  { paths: ['src/progress/'], specs: ['map', 'today'], routes: [exact('/map'), MODULE_ROUTE, exact('/evidence')] },
  { paths: ['src/map/'], specs: ['map'], routes: [exact('/map'), MODULE_ROUTE] },
  { paths: ['src/unbuilt/'], specs: ['lab-page', 'trace-view'], routes: ['/labs/[^\\s:,]+', '/trace-room(?:/[^\\s:,]+)?'] },
]

/** The paths that no row runs, each with its reason. tests/ci/gate-touched.test.ts holds every folder of src/, packages/ and e2e/support/ to a row or to this list. */
export const UNGATED: Readonly<Record<string, string>> = {
  'src/copy/': 'word lists: the unit suite\'s copy tests and the smoke project\'s screens spec, which read them, run on every merge',
  'src/types/': 'type declarations: the typecheck of every merge is their check',
  'e2e/support/site.ts': 'every spec imports it: the smoke project runs on every merge, and the whole features project is the nightly sweep\'s',
  'e2e/support/serve-pages.ts': 'the Pages server of an ES_E2E_PAGES run, which no merge step makes',
  'e2e/support/vitals.ts': 'the lab profile\'s (e2e/perf.spec.ts), a measurement that the gate never runs',
}

const GRADER_PREFIXES = [
  'labs/grader/', 'labs/gpu/', 'labs/envs/', 'labs/references/', 'packages/schema/', 'schemas/', 'src/receipts/', 'packages/verify/', 'tests/verify/',
  'tests/fixtures/grader/', 'tests/fixtures/references/', 'tests/fixtures/receipts/',
  // What the labs map's P2 found unmapped: the models and scripts that the grader's Python port and its vectors are held to.
  'packages/sim/workload/', 'packages/sim/bench/', 'packages/sim/trace/', 'packages/sim/core/', 'packages/sim/tensor/', 'scripts/vectors.ts',
  'scripts/export-schemas.ts', 'tests/fixtures/sim/', 'scripts/triton-interp/',
]
const GRADER_FILES = ['course.lock.json']
const FORGE_PREFIXES = [
  'labs/forge/', 'src/forge/', 'packages/sim/forge/', 'tests/fixtures/forge/',
  // P2: the models the forge's oracles stand on, and the scripts that build and check the labs.
  'packages/sim/tiers/', 'packages/sim/kv/', 'packages/sim/spec/', 'scripts/labs/', 'scripts/verify-labs.ts', 'scripts/pack-labs.ts',
]

/** The grader row's commands, in the order labs.yml runs them. */
export const GRADER_COMMANDS: readonly Omit<Command, 'why'>[] = [
  { id: 'uv lock', argv: ['uv', 'lock', '--check', '--project', 'labs/grader'], uv: true },
  { id: 'grader unittest', argv: ['uv', 'run', '--project', 'labs/grader', 'python', '-m', 'unittest'], uv: true },
  { id: 'grader selftest', argv: ['uv', 'run', '--project', 'labs/grader', 'enginespace', 'selftest', '--no-suite'], uv: true },
  { id: 'pack-kit', argv: ['bun', 'scripts/pack-kit.ts', '--check'] },
  { id: 'verify:schema', argv: ['bun', 'run', 'verify:schema'] },
  { id: 'verify:vectors', argv: ['bun', 'run', 'verify:vectors'] },
  { id: 'bestiary and fixtures', argv: ['bun', 'test', 'tests/verify/bestiary.test.ts', 'tests/verify/fixtures.test.ts'] },
]
/** The forge row's commands. */
export const FORGE_COMMANDS: readonly Omit<Command, 'why'>[] = [
  { id: 'cargo test', argv: ['cargo', 'test', '--manifest-path', 'labs/forge/Cargo.toml', '--workspace', '--features', 'reference'], env: { RUSTUP_AUTO_INSTALL: '0' } },
  { id: 'verify:labs', argv: ['bun', 'run', 'verify:labs'], env: { RUSTUP_AUTO_INSTALL: '0' } },
]
/** The roster row's command: the roster is data that the games' cards and the course read, and its unit test holds it. */
export const ROSTER_COMMAND: Omit<Command, 'why'> = { id: 'roster', argv: ['bun', 'test', 'tests/play/roster.test.ts'] }
export const ROSTER_FILE = 'packages/play/roster.ts'
export const RELOCK_NOT_RUN = 'labs/envs/relock.sh --check was not run: it needs the network. labs.yml on the wave\'s draft pull request is its evidence.'

const under = (file: string, ...prefixes: readonly string[]) => prefixes.some((prefix) => file.startsWith(prefix))

/** The game whose folder holds a path, if the path is inside one game's folder (a registered game's, or a planned one's). */
export function gameOf(file: string): string | undefined {
  for (const game of [...GAMES, ...PLANNED_GAMES]) if (under(file, `src/games/${game}/`, `packages/play/${game}/`)) return game
  return undefined
}

/** The specs of one game: `<g>.spec.ts` and `<g>-*.spec.ts`, so that `loop` has loop, loop-full and loop-scene and not keyboard-loop. */
export function gameSpecs(game: string, specs: readonly string[]): string[] {
  return specs.filter((name) => name === game || name.startsWith(`${game}-`))
}

/** The `-g` expression of the walks of some games: every walk's title names its game as "(<id>)". */
export function walkGrep(games: readonly string[]): string {
  return `\\((${[...games].sort().join('|')})\\)`
}

/** The `-g` expression of some routes' tests in a11y and screens: the route after a space, then a colon, a comma, a space or the end. */
export function routeGrep(routes: readonly string[]): string {
  return `(?:^|\\s)(?:${[...new Set(routes)].sort().join('|')})(?:[:,]|\\s|$)`
}

/** The routes of the files a branch changes under content/modules/: a lesson's page, or else its module's. */
export function moduleRoutes(file: string): string[] {
  const lesson = /^content\/modules\/([^/]+)\/lessons\/([^/]+)\.md$/.exec(file)
  if (lesson) return [exact(`/m/${lesson[1]}/${lesson[2]}`)]
  const module = /^content\/modules\/([^/]+)\//.exec(file)
  return module ? [exact(`/m/${module[1]}`)] : []
}

export function plan(changed: readonly string[], specs: readonly string[], context: Context = {}): Plan {
  /** The specs each project runs at its own width; and what the nightly width runs: walked games, and routes for a11y and screens. */
  const features = new Set<string>()
  const smoke = new Set<string>()
  const nightlyGames = new Set<string>()
  const a11yRoutes = new Set<string>()
  const screensRoutes = new Set<string>()
  const why = new Map<string, Set<string>>()
  const notes: string[] = []
  const unmapped: string[] = []
  const have = new Set(specs)
  const commands: Command[] = []

  const because = (key: string, row: string) => why.set(key, (why.get(key) ?? new Set()).add(row))
  const want = (row: string, names: readonly string[]) => {
    for (const name of names) {
      if (!have.has(name) || name === LAB_SPEC) continue
      ;(SMOKE_SPECS.includes(name) ? smoke : features).add(name)
      because(name, row)
    }
  }
  const walks = (row: string, games: readonly string[]) => {
    const walked = games.filter((game) => GAMES.includes(game))
    for (const game of walked) nightlyGames.add(game)
    if (walked.length > 0) because('nightly walks', row)
  }
  const audit = (row: string, routes: readonly string[], withScreens: boolean) => {
    for (const route of routes) {
      a11yRoutes.add(route)
      if (withScreens) screensRoutes.add(route)
    }
    if (routes.length > 0) because('nightly routes', row)
  }
  const gameRow = (row: string, game: string) => {
    want(row, [...gameSpecs(game, specs), ...LESSON_GAME_SPECS, 'keep-list'])
    walks(row, [game])
  }
  const kitRow = () => {
    want('kit', ['design-parts', 'screens', 'walks'])
    notes.push('A change to the kit or the design: the task runs every level of every game itself, at 360 and 1280 px, and reports it.')
  }
  const kitRun = (row: string, primary = true) => {
    want(row, ['design-parts', 'screens', 'walks', ...(primary ? GAMES.filter((game) => have.has(game)) : [])])
    walks(row, GAMES)
  }

  const graderWhy = new Set<string>()
  const forgeWhy = new Set<string>()
  for (const file of [...changed].sort()) {
    if (under(file, ...GRADER_PREFIXES) || GRADER_FILES.includes(file)) graderWhy.add(file)
    if (under(file, ...FORGE_PREFIXES)) forgeWhy.add(file)
  }
  const inCheckRow = (file: string) => graderWhy.has(file) || forgeWhy.has(file)

  /** The browser rows of one path; false when none names it. */
  const rows = (file: string): boolean => {
    const game = gameOf(file)
    if (game !== undefined) {
      gameRow(`game ${game}`, game)
      return true
    }
    const sim = /^packages\/sim\/([^/]+)\//.exec(file)
    if (sim && sim[1] in SIM) {
      const entry = SIM[sim[1]]
      // A planned game joins when it is registered: until then nothing of it stands on the model in the browser.
      for (const name of entry.games) {
        if (name === '*') kitRun(`sim ${sim[1]}`)
        else if (GAMES.includes(name)) gameRow(`sim ${sim[1]}`, name)
      }
      want(`sim ${sim[1]}`, entry.specs ?? [])
      return true
    }
    if (file === 'packages/sim/index.ts') {
      want('forge', FORGE_SPECS)
      return true
    }
    if (under(file, 'src/scene/')) {
      want('scene', ['scene-kit', ...specs.filter((name) => name.endsWith('-scene'))])
      return true
    }
    if (KIT_RUN.includes(file)) {
      kitRun('kit run')
      return true
    }
    if (file === REGISTRY) {
      kitRun('registry', false)
      return true
    }
    if (file === ROSTER_FILE) {
      commands.push({ ...ROSTER_COMMAND, why: [`roster: ${file}`] })
      return true
    }
    if (under(file, 'packages/play/items/', 'src/items/')) {
      want('items', ['items', 'today', 'lesson-games'])
      return true
    }
    if (under(file, 'packages/play/predictions/')) {
      want('predict', ['lesson-predict', 'keep-list'])
      return true
    }
    if (under(file, ...KIT_PREFIXES) || KIT_FILES.includes(file) || under(file, 'src/games/', 'packages/play/')) {
      // The kit row. The last clause is the rest of src/games/ and of packages/play/ (specials, the replay dock, the keys, the blind
      // probes, the play registry): none of them belongs to one game, so each is held to what the kit is.
      kitRow()
      return true
    }
    if (under(file, 'src/prove/', 'packages/ledger/')) {
      want('prove', ['settings', 'ledger-conformance', ...specs.filter((name) => name.startsWith('prove-')), ...PROVE_SPECS])
      return true
    }
    if (under(file, 'src/labs/')) {
      want('labs', ['lab-page', 'lab-kits'])
      return true
    }
    const page = PAGES.find((entry) => entry.paths.some((prefix) => (prefix.endsWith('/') ? file.startsWith(prefix) : file === prefix)))
    if (page !== undefined) {
      want(`page ${page.paths[0]}`, page.specs)
      audit(`page ${page.paths[0]}`, page.routes, true)
      return true
    }
    let hit = false
    if (file === 'course.lock.json') {
      audit('changes', [exact('/changes')], false)
      hit = true
    }
    if (file === 'e2e/routes.ts') {
      audit('routes', (context.routesAdded ?? []).map(exact), false)
      hit = true
    }
    if (under(file, 'content/modules/')) audit('routes', moduleRoutes(file), false)
    if (under(file, 'content/', 'src/content/', 'scripts/content/')) {
      want('content', [...LESSON_GAME_SPECS.filter((name) => name !== 'lesson-games-scene'), 'items', 'map', 'titles', 'today'])
      return true
    }
    if (SHELL_FILES.includes(file)) {
      want('shell', ['route-change', 'stale-chunk', 'titles'])
      return true
    }
    if (under(file, 'src/receipts/', 'packages/verify/', 'src/workers/')) {
      want('receipts', RECEIPT_SPECS)
      return true
    }
    if (under(file, 'src/forge/', 'labs/forge/')) {
      want('forge', FORGE_SPECS)
      return true
    }
    if (under(file, 'src/trace/')) {
      want('trace', ['trace-view'])
      for (const name of TRACE_GAMES.filter((game) => GAMES.includes(game))) gameRow('trace', name)
      return true
    }
    if (under(file, 'src/front/')) {
      want('front', ['front'])
      return true
    }
    if (WALKER_FILES.includes(file)) {
      want('walkers', ['walks'])
      walks('walkers', GAMES)
      hit = true
    }
    if (under(file, 'e2e/support/') && !(file in UNGATED)) {
      const users = (context.importers?.[file] ?? []).filter((name) => !SMOKE_SPECS.includes(name))
      want(`support ${file.slice('e2e/support/'.length)}`, users)
      hit = true
    }
    if (/^e2e\/[^/]+\.spec\.ts$/.test(file) && have.has(file.slice('e2e/'.length, -'.spec.ts'.length))) {
      want('spec', [file.slice('e2e/'.length, -'.spec.ts'.length)])
      hit = true
    }
    return hit
  }

  for (const file of [...changed].sort()) {
    if (rows(file)) continue
    const reason = Object.entries(UNGATED).find(([prefix]) => (prefix.endsWith('/') ? file.startsWith(prefix) : file === prefix))
    if (reason !== undefined) notes.push(`${file}: no row, by design: ${reason[1]}.`)
    else if (!inCheckRow(file)) unmapped.push(file)
  }

  const steps: Step[] = []
  const reasons = (names: Iterable<string>) => [...new Set([...names].flatMap((name) => [...(why.get(name) ?? [])]))].sort()
  if (features.size > 0) steps.push({ project: 'features', nightly: false, specs: [...features].sort(), why: reasons(features) })
  // At the nightly width every level is walked, and that includes the level the pull-request width walks: the plain walks are then redundant.
  const everyGameNightly = GAMES.every((game) => nightlyGames.has(game))
  if (everyGameNightly) smoke.delete('walks')
  if (smoke.size > 0) steps.push({ project: 'smoke', nightly: false, specs: [...smoke].sort(), why: reasons(smoke) })
  if (nightlyGames.size > 0 || a11yRoutes.size > 0) {
    const nightlySpecs = [...(nightlyGames.size > 0 ? ['walks'] : []), ...(a11yRoutes.size > 0 ? ['a11y'] : []), ...(screensRoutes.size > 0 ? ['screens'] : [])].sort()
    const filters = [...(nightlyGames.size > 0 ? [walkGrep([...nightlyGames])] : []), ...(a11yRoutes.size > 0 ? [routeGrep([...a11yRoutes])] : [])]
    steps.push({ project: 'smoke', nightly: true, specs: nightlySpecs, grep: filters.join('|'), why: reasons(['nightly walks', 'nightly routes']) })
  }
  const sample = (paths: ReadonlySet<string>) => [...paths].slice(0, 3).join(', ') + (paths.size > 3 ? `, and ${paths.size - 3} more` : '')
  const checks: Command[] = []
  const notRun: string[] = []
  if (graderWhy.size > 0) {
    for (const command of GRADER_COMMANDS) checks.push({ ...command, why: [`grader: ${sample(graderWhy)}`] })
    notRun.push(RELOCK_NOT_RUN)
  }
  if (forgeWhy.size > 0) for (const command of FORGE_COMMANDS) checks.push({ ...command, why: [`forge: ${sample(forgeWhy)}`] })
  return { steps, commands: [...checks, ...commands], notRun, unmapped, notes: [...new Set(notes)] }
}
