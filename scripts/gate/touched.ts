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

export interface Plan {
  readonly steps: readonly Step[]
  /** The changed paths that map to nothing. */
  readonly unmapped: readonly string[]
  /** Notes for the report, such as "every level of every game is the task's own to run". */
  readonly notes: readonly string[]
}

const LESSON_GAME_SPECS = ['lesson-games', 'lesson-games-scene', 'lesson-predict']
const KIT_PREFIXES = ['src/games/kit/', 'src/design/']
const KIT_FILES = ['src/pages/Game.tsx', 'src/games/registry.ts']
const WALKER_FILES = ['e2e/support/walks.ts', 'e2e/levels.ts', 'e2e/walks.spec.ts']

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
    } else unmapped.push(file)
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
  return { steps, unmapped, notes: [...new Set(notes)] }
}
