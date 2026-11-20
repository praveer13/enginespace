/*
 * The merge gate's plan (W2b-T02): the paths that a branch changes in, the browser tests that the branch calls for out. Pure: it reads
 * nothing but its arguments (scripts/gate/run.ts lists the changed paths and the specs, and runs the plan), so tests/ci/gate-touched.test.ts
 * holds every row of the mapping.
 *
 * The smoke project's subset already runs on every merge, at its pull-request width. What this adds is what that subset leaves out: the
 * `features` project's specs, and the nightly sweep's width (ES_E2E_NIGHTLY=1: every level of a game walked at 360 and 1280 px), for the
 * games and the parts that a branch touches. A step is one Playwright run, `--retries=0`; the playwright.config.ts is not edited.
 *
 * The mapping, row by row (a path that no row names runs nothing):
 *   game     src/games/<g>/, packages/play/<g>/      the game's own specs (e2e/<g>*.spec.ts), lesson-games, lesson-games-scene,
 *                                                    lesson-predict, keep-list, and the nightly walks of <g>
 *   kit      src/games/kit/, src/design/, src/pages/Game.tsx, src/games/registry.ts
 *                                                    one level of every game at 360 and 1280 px (SMOKE_LEVELS), design-parts, screens.
 *                                                    The task that made the change runs every level of every game itself and says so.
 *            (added with the same reason: the rest of src/games/ and of packages/play/ that no single game owns)
 *   content  content/, src/content/, scripts/content/ lesson-games, lesson-predict, items, map, titles, today
 *   receipts src/receipts/, packages/verify/, src/workers/    receipts, receipts-import
 *   forge    src/forge/, labs/forge/                 forge, forge-hybrid-kv, rejection-sampler, lab-kits
 *   trace    src/trace/, packages/sim/trace/         trace-view
 *   front    src/front/                              front
 *   walkers  e2e/support/walks.ts, e2e/levels.ts, e2e/walks.spec.ts    the nightly walks of every game
 *   spec     e2e/<name>.spec.ts                      that spec
 *
 * The lab rows (W2b-T43) are not browser steps but commands, and a path can be in a lab row and in a row above (src/receipts/ is both):
 *   grader   labs/grader/, labs/gpu/, labs/envs/, labs/references/, course.lock.json, packages/schema/, schemas/, src/receipts/, packages/verify/,
 *            tests/verify/, tests/fixtures/{grader,references,receipts}/
 *                                                    uv lock --check, the grader's unittest, its selftest, pack-kit --check, verify:schema,
 *                                                    verify:vectors and the bestiary and fixtures tests
 *   forge    labs/forge/, src/forge/, packages/sim/forge/, tests/fixtures/forge/
 *                                                    cargo test of the reference, and verify:labs
 * `labs/envs/relock.sh --check` needs the network: the plan lists it under `notRun`, and labs.yml on the pull request is its evidence.
 * The uv commands run with UV_OFFLINE=1, UV_PYTHON_DOWNLOADS=never and an installed interpreter that run.ts picks (the Python step of `Command.uv`).
 */
import { WALKED } from '../../e2e/levels'

/** The games, by id: the keys of the walked levels. A game that a task adds to e2e/levels.ts is in the mapping from then on. */
export const GAMES: readonly string[] = Object.keys(WALKED)

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

/** One command of a lab row, run from the repository root. */
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
  /** The lab checks, in the order they run. */
  readonly commands: readonly Command[]
  /** The checks that this gate cannot run, and where their evidence is. */
  readonly notRun: readonly string[]
  /** The changed paths that map to nothing. */
  readonly unmapped: readonly string[]
  /** Notes for the report, such as "every level of every game is the task's own to run". */
  readonly notes: readonly string[]
}

const LESSON_GAME_SPECS = ['lesson-games', 'lesson-games-scene', 'lesson-predict']
const KIT_PREFIXES = ['src/games/kit/', 'src/design/']
const KIT_FILES = ['src/pages/Game.tsx', 'src/games/registry.ts']
const WALKER_FILES = ['e2e/support/walks.ts', 'e2e/levels.ts', 'e2e/walks.spec.ts']

const GRADER_PREFIXES = [
  'labs/grader/', 'labs/gpu/', 'labs/envs/', 'labs/references/', 'packages/schema/', 'schemas/', 'src/receipts/', 'packages/verify/', 'tests/verify/',
  'tests/fixtures/grader/', 'tests/fixtures/references/', 'tests/fixtures/receipts/',
]
const GRADER_FILES = ['course.lock.json']
const FORGE_PREFIXES = ['labs/forge/', 'src/forge/', 'packages/sim/forge/', 'tests/fixtures/forge/']

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
export const RELOCK_NOT_RUN = 'labs/envs/relock.sh --check was not run: it needs the network. labs.yml on the wave\'s draft pull request is its evidence.'

const under = (file: string, ...prefixes: readonly string[]) => prefixes.some((prefix) => file.startsWith(prefix))

/** The game whose folder holds a path, if the path is inside one game's folder. */
export function gameOf(file: string): string | undefined {
  for (const game of GAMES) if (under(file, `src/games/${game}/`, `packages/play/${game}/`)) return game
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

export function plan(changed: readonly string[], specs: readonly string[]): Plan {
  /** The specs each project runs, by width; and the games walked at the nightly width. */
  const features = new Set<string>()
  const smoke = new Set<string>()
  const nightlyGames = new Set<string>()
  const why = new Map<string, Set<string>>()
  const notes: string[] = []
  const unmapped: string[] = []
  const have = new Set(specs)

  const want = (row: string, names: readonly string[]) => {
    for (const name of names) {
      if (!have.has(name) || name === LAB_SPEC) continue
      ;(SMOKE_SPECS.includes(name) ? smoke : features).add(name)
      why.set(name, (why.get(name) ?? new Set()).add(row))
    }
  }
  const walks = (row: string, games: readonly string[]) => {
    for (const game of games) nightlyGames.add(game)
    if (games.length > 0) why.set('nightly walks', (why.get('nightly walks') ?? new Set()).add(row))
  }

  const graderWhy = new Set<string>()
  const forgeWhy = new Set<string>()
  for (const file of [...changed].sort()) {
    if (under(file, ...GRADER_PREFIXES) || GRADER_FILES.includes(file)) graderWhy.add(file)
    if (under(file, ...FORGE_PREFIXES)) forgeWhy.add(file)
  }
  const inLabRow = (file: string) => graderWhy.has(file) || forgeWhy.has(file)

  for (const file of [...changed].sort()) {
    const game = gameOf(file)
    if (game !== undefined) {
      want(`game ${game}`, [...gameSpecs(game, specs), ...LESSON_GAME_SPECS, 'keep-list'])
      walks(`game ${game}`, [game])
    } else if (under(file, ...KIT_PREFIXES) || KIT_FILES.includes(file) || under(file, 'src/games/', 'packages/play/')) {
      // The kit row. The last two clauses are the rest of src/games/ and of packages/play/ (specials, the replay dock, the registry and the keys,
      // the items and the predictions): none of them belongs to one game, so each is held to what the kit is.
      want('kit', ['design-parts', 'screens', 'walks'])
      notes.push('A change to the kit, the design or the game page: the task runs every level of every game itself, at 360 and 1280 px, and reports it.')
    } else if (under(file, 'content/', 'src/content/', 'scripts/content/')) {
      want('content', [...LESSON_GAME_SPECS.filter((name) => name !== 'lesson-games-scene'), 'items', 'map', 'titles', 'today'])
    } else if (under(file, 'src/receipts/', 'packages/verify/', 'src/workers/')) {
      want('receipts', ['receipts', 'receipts-import'])
    } else if (under(file, 'src/forge/', 'labs/forge/')) {
      want('forge', ['forge', 'forge-hybrid-kv', 'rejection-sampler', 'lab-kits'])
    } else if (under(file, 'src/trace/', 'packages/sim/trace/')) {
      want('trace', ['trace-view'])
    } else if (under(file, 'src/front/')) {
      want('front', ['front'])
    } else if (WALKER_FILES.includes(file)) {
      want('walkers', ['walks'])
      walks('walkers', GAMES)
    } else if (/^e2e\/[^/]+\.spec\.ts$/.test(file) && have.has(file.slice('e2e/'.length, -'.spec.ts'.length))) {
      want('spec', [file.slice('e2e/'.length, -'.spec.ts'.length)])
    } else if (!inLabRow(file)) unmapped.push(file)
  }

  const steps: Step[] = []
  const reasons = (names: Iterable<string>) => [...new Set([...names].flatMap((name) => [...(why.get(name) ?? [])]))].sort()
  if (features.size > 0) steps.push({ project: 'features', nightly: false, specs: [...features].sort(), why: reasons(features) })
  // At the nightly width every level is walked, and that includes the level the pull-request width walks: the plain walks are then redundant.
  const everyGameNightly = GAMES.every((game) => nightlyGames.has(game))
  if (everyGameNightly) smoke.delete('walks')
  if (smoke.size > 0) steps.push({ project: 'smoke', nightly: false, specs: [...smoke].sort(), why: reasons(smoke) })
  if (nightlyGames.size > 0) {
    steps.push({ project: 'smoke', nightly: true, specs: ['walks'], grep: walkGrep([...nightlyGames]), why: reasons(['nightly walks']) })
  }
  const commands: Command[] = []
  const notRun: string[] = []
  const sample = (paths: ReadonlySet<string>) => [...paths].slice(0, 3).join(', ') + (paths.size > 3 ? `, and ${paths.size - 3} more` : '')
  if (graderWhy.size > 0) {
    for (const command of GRADER_COMMANDS) commands.push({ ...command, why: [`grader: ${sample(graderWhy)}`] })
    notRun.push(RELOCK_NOT_RUN)
  }
  if (forgeWhy.size > 0) for (const command of FORGE_COMMANDS) commands.push({ ...command, why: [`forge: ${sample(forgeWhy)}`] })
  return { steps, commands, notRun, unmapped, notes: [...new Set(notes)] }
}
