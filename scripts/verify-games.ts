/**
 * verify-games: the mechanical half of the seven-test gate for every registered game (ARCHITECTURE §6.2 and §5.9, GAMES.md §2.5,
 * D-019, D-049), run as `verify:games`.
 *
 * A game fails without:
 *   - a display name and a subtitle (D-049), a slug id, modules, KCs, sources (claims), levels and a notional-machine card
 *     (`content/cards/<card>.md`, §5.9);
 *   - a keyboard map: its own keys, none taking a common key or another's, with a label and a description for the help dialog;
 *   - a 2D view, a mirror, a debrief and controls, as the files `src/games/<id>/{View2D,Mirror,Debrief,Controls}.tsx`, and a
 *     `Game.tsx` that renders each of them. A 3D game also has `Scene3D.tsx`, which `Game.tsx` reaches only through `import()`
 *     (the scene is its own chunk, §6.10); a game without 3D has none;
 *   - an entry in the component registry (`src/games/registry.ts`) and the reverse: the two registries list the same ids;
 *   - a session that keeps the contract (GAMES.md §2.5): on each level's pinned practice seed it builds, starts unfinished, and is
 *     in band; the reference finishes, passes its own grade, and gives the same state twice; and over the first 400 seeds [estimated,
 *     the count of GAMES.md §3's prototype] at least 20% are in band [estimated floor, kernelspace's EPLB figure] (GAMES.md §2.1).
 *     The measured share is printed;
 *   - KCs and claims that exist, once the KC graph (W1-T03) and the claims files (W0-T08) exist. Until then these two checks
 *     print a note and pass, as an unbuilt gate does (scripts/verify.ts);
 *   - a card that the content compiler accepts: three parts, claims that exist, a source for each rule (W1-T07, scripts/content/cards.ts).
 *     A card file that is there and does not compile is as good as missing, and `verify:content` says what is wrong with it;
 *   - a shell of its own, when `Game.tsx` loads one on demand (Service's full service, `FullService.tsx`): that file too renders a 2D
 *     view, a mirror, controls and a debrief, each a component of the game whose file is there, and a 3D game's reaches `Scene3D` only
 *     through `import()` (W1b-T12; W1 report §9.1, A4). A game with one shell has nothing more to read;
 *   - a blind-strategy bound that holds (ASSESSMENT §4.1 and §13; W1b-T12): on every graded level the best scene-blind strategy passes a
 *     single banded seed at most 15% of the time [estimated], so that three fresh seeds in a row are out of reach by guessing. Each
 *     game's folder has the probes of its graded levels (`packages/play/<id>/blind.ts`), which play the strategies through the game's own
 *     session and grade them with its own grade. The gate prints each level's best strategy against the bound, fails a level over it,
 *     and fails a graded level that has no probe. It measures when it is given a way to, as the command line is (scripts/games/blind.ts).
 *
 * Not checked yet, and said so in the task's report: the keyboard and reduced-motion e2e walks (W0-T21 and each game's task
 * decide their spec names), and the cross-browser determinism hash (nightly, §5.10).
 *
 *   bun scripts/verify-games.ts
 *
 * The nights that the probes play take a minute or so in all, and the games' are independent, so the command line measures each game in
 * a process of its own while the other checks go on (scripts/games/blind.ts); the gate takes under a minute on a loaded laptop.
 *
 * `checkGames` is the whole gate over what it is given: the games, the component ids, a view of the files, the world's ids and, to
 * measure the blind bound, a way to measure it. The tests call it with a toy game and a tree held in memory; the command line gives it
 * this checkout and the five games' probes.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CORE_SCHEMA, load } from 'js-yaml'
import ts from 'typescript'
import { GAMES, COMMON_KEYS, keyProblems, stateHash } from '../packages/play'
import type { AnySession, GameEntry } from '../packages/play'
import { claimIdSchema, gameIdSchema, kcIdSchema, levelIdSchema, moduleIdSchema, slugSchema } from '../packages/schema/refs'
import { GAME_COMPONENTS } from '../src/games/registry'
import { compileContent } from './content/build.ts'
import { BLIND_PROBES, MIN_BLIND_SAMPLE, checkBlind, measureAside, measuredBy } from './games/blind.ts'
import type { BlindCheck, BlindMeasure } from './games/blind.ts'

export { BLIND_PROBES, MIN_BLIND_SAMPLE, checkBlind, measureAside, measuredBy }
export type { BlindCheck, BlindMeasure }

/** The share of the first seeds that a level's band must accept, at least [estimated, kernelspace's EPLB floor], and how many are tried [estimated]. */
export const BAND_FLOOR = 0.2
export const BAND_CANDIDATES = 400

/** A view of the repository's files, named relative to its root. */
export interface Files {
  exists(file: string): boolean
  read(file: string): string
}

/** The ids the world holds, when the files that hold them exist. An undefined set means "not built yet", and its check is skipped. */
export interface World {
  claimIds?: ReadonlySet<string>
  kcIds?: ReadonlySet<string>
  /** The ids of the cards that compile (`compileContent`): a card file whose id is not here is there and unusable. */
  cardIds?: ReadonlySet<string>
}

export interface GateInput {
  games: readonly GameEntry[]
  /** The ids in `src/games/registry.ts`. */
  componentIds: readonly string[]
  files: Files
  world: World
  candidates?: number
  floor?: number
  /**
   * Measures a game's graded levels against ASSESSMENT §4.1's blind-strategy bound (scripts/games/blind.ts): `measuredBy(probes)` in this
   * process, or the processes that the command line starts. Given, every graded level of every game is measured and one with no probe
   * fails. Left out, the bound is not measured, as the claims are not checked before their files exist: a test of another part of the gate
   * is not made to wait for a minute of nights.
   */
  blind?: BlindMeasure
}

export interface Finding {
  /** The game, or null for a problem with the registries as a whole. */
  game: string | null
  message: string
}

export interface Report {
  findings: Finding[]
  /** What was skipped, and why. */
  notes: string[]
  /** What passed, per game, for the printout. */
  lines: Map<string, string[]>
}

const SESSION_METHODS = ['level', 'inBand', 'init', 'ask', 'reduce', 'view', 'done', 'score', 'ghost', 'grade', 'debrief'] as const

/** The five files every game has, and the JSX each must be rendered by `Game.tsx`. */
const PARTS = ['View2D', 'Mirror', 'Debrief', 'Controls'] as const

const fails = (schema: { safeParse(value: unknown): { success: boolean } }, value: unknown) => !schema.safeParse(value).success
const blank = (text: unknown) => typeof text !== 'string' || text.trim() === ''

/* ------------------------------------------------------------------------------------------------------------------ */
/* The entry                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What is wrong with the registry's record of a game. */
export function checkEntry(entry: GameEntry): string[] {
  const problems: string[] = []
  if (fails(gameIdSchema, entry.id)) problems.push(`the id "${entry.id}" must be a slug such as shape-shifter`)
  if (blank(entry.title)) problems.push('it has no display name (D-049): add the title the learner sees')
  else if (entry.title !== entry.title.trim()) problems.push('the display name has spaces at its ends')
  if (blank(entry.subtitle)) problems.push('it has no subtitle (D-049): add the engine concept that the display name stands for')
  else if (!blank(entry.title) && entry.title.trim().toLowerCase() === entry.subtitle.trim().toLowerCase()) {
    problems.push('the subtitle repeats the display name: it names the engine concept (D-049)')
  }
  if (!Array.isArray(entry.modules) || entry.modules.length === 0) problems.push('it names no module')
  else for (const module of entry.modules) if (fails(moduleIdSchema, module)) problems.push(`"${module}" is not a module id such as tr2`)
  if (typeof entry.has3d !== 'boolean') problems.push('has3d must be true or false')
  if (!Array.isArray(entry.kcs) || entry.kcs.length === 0) problems.push('it names no KC (A§4.5)')
  else for (const kc of entry.kcs) if (fails(kcIdSchema, kc)) problems.push(`"${kc}" is not a KC id such as tr2.async-overlap`)
  if (!Array.isArray(entry.claims) || entry.claims.length === 0) problems.push('it cites no claim: every game shows its sources (A§6.2)')
  else for (const claim of entry.claims) if (fails(claimIdSchema, claim)) problems.push(`"${claim}" is not a claim id such as vllm.async-scheduling.default`)
  if (blank(entry.card) || fails(slugSchema, entry.card)) problems.push('it has no notional-machine card: name the card id (content/cards/<card>.md, A§5.9)')
  if (typeof entry.session !== 'function') problems.push('it has no session loader')

  if (!Array.isArray(entry.keys) || entry.keys.length === 0) {
    problems.push('it has no keyboard map: add the game\'s own keys, which the help dialog lists beside the common ones (A§6.8)')
  } else {
    problems.push(...keyProblems(entry.keys))
  }

  if (!Array.isArray(entry.levels) || entry.levels.length === 0) problems.push('it has no level')
  else {
    const seen = new Set<string>()
    for (const level of entry.levels) {
      if (fails(levelIdSchema, level.id)) problems.push(`the level id "${level.id}" must be a slug such as first-1-fill`)
      if (seen.has(level.id)) problems.push(`the level "${level.id}" is listed twice`)
      seen.add(level.id)
      if (blank(level.title)) problems.push(`the level "${level.id}" has no title`)
      if (!Number.isInteger(level.practiceSeed) || level.practiceSeed < 0 || level.practiceSeed >= 2 ** 32) {
        problems.push(`the level "${level.id}" needs a pinned practice seed, an unsigned 32-bit integer`)
      }
    }
  }
  return problems
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The files                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * What `Game.tsx` renders and imports, read from its syntax tree: JSX tag names, static and dynamic import specifiers, and the
 * specifier that each name is imported from (a name imported by default, by name or as a namespace; a type-only import has none).
 */
export function readGameSource(
  file: string,
  text: string,
): { tags: Set<string>; staticImports: string[]; dynamicImports: string[]; defaultExport: boolean; importedFrom: Map<string, string> } {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const tags = new Set<string>()
  const staticImports: string[] = []
  const dynamicImports: string[] = []
  const importedFrom = new Map<string, string>()
  let defaultExport = false
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) tags.add(node.tagName.getText(source))
    else if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.importClause?.isTypeOnly !== true) {
      staticImports.push(node.moduleSpecifier.text)
      const clause = node.importClause
      if (clause?.name !== undefined) importedFrom.set(clause.name.text, node.moduleSpecifier.text)
      const bindings = clause?.namedBindings
      if (bindings !== undefined && ts.isNamespaceImport(bindings)) importedFrom.set(bindings.name.text, node.moduleSpecifier.text)
      else if (bindings !== undefined) for (const element of bindings.elements) if (!element.isTypeOnly) importedFrom.set(element.name.text, node.moduleSpecifier.text)
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteralLike(node.arguments[0])) {
      dynamicImports.push(node.arguments[0].text)
    } else if (ts.isExportAssignment(node) && !node.isExportEquals) {
      defaultExport = true
    } else if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    ) {
      defaultExport = true
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { tags, staticImports, dynamicImports, defaultExport, importedFrom }
}

/** What is missing from a game's files: its views, its mirror, its debrief, its controls, its card, and the wiring of Game.tsx. */
export function checkFiles(entry: GameEntry, files: Files): string[] {
  const problems: string[] = []
  const folder = `src/games/${entry.id}`
  const missing = { Game: 'the game component is missing', View2D: 'the 2D view is missing', Mirror: 'the DOM mirror is missing', Debrief: 'the debrief is missing', Controls: 'the controls are missing' }
  for (const part of ['Game', ...PARTS] as const) {
    if (!files.exists(`${folder}/${part}.tsx`)) problems.push(`${missing[part]}: ${folder}/${part}.tsx`)
  }
  const scene = `${folder}/Scene3D.tsx`
  if (entry.has3d && !files.exists(scene)) problems.push(`the 3D scene is missing: ${scene}`)
  if (!entry.has3d && files.exists(scene)) problems.push(`${scene} exists, but the entry says the game has no 3D: set has3d, or delete the scene`)
  if (!blank(entry.card) && !files.exists(`content/cards/${entry.card}.md`)) problems.push(`the notional-machine card is missing: content/cards/${entry.card}.md (A§5.9)`)

  if (files.exists(`${folder}/Game.tsx`)) {
    const game = readGameSource(`${folder}/Game.tsx`, files.read(`${folder}/Game.tsx`))
    if (!game.defaultExport) problems.push(`${folder}/Game.tsx has no default export, which the component registry loads`)
    for (const part of PARTS) {
      if (!game.tags.has(part)) problems.push(`${folder}/Game.tsx never renders <${part}>`)
    }
    if (entry.has3d && !game.tags.has('Scene3D')) problems.push(`${folder}/Game.tsx never renders <Scene3D>`)
    if (game.staticImports.some((specifier) => /(^|\/)Scene3D$/.test(specifier))) {
      problems.push(`${folder}/Game.tsx imports Scene3D statically: load it with React.lazy(() => import('./Scene3D')), so the scene is its own chunk (A§6.10)`)
    }
    for (const shell of lazyShells(entry, files)) problems.push(...checkShell(entry, shell, files))
  }
  return problems
}

/** The file that a relative specifier names, as `files` has it (`./full/FullMirror` from `src/games/loop` is `src/games/loop/full/FullMirror.tsx`), or null. */
function resolveFrom(dir: string, specifier: string, files: Files): string | null {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null
  const base = path.posix.join(dir, specifier)
  return [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`].find((candidate) => files.exists(candidate)) ?? null
}

/**
 * The parts of a game that `Game.tsx` loads on demand and that mount a shell of their own: Service's full service (`FullService.tsx`),
 * which has the TR2 and TR6 levels, a session of its own rules, and views of its own. `Game.tsx` shows them only once a learner opens one
 * of those levels, so a gate that reads `Game.tsx` alone passes a full service with no mirror (W1 report §9.1, A4).
 */
export function lazyShells(entry: GameEntry, files: Files): string[] {
  const folder = `src/games/${entry.id}`
  if (!files.exists(`${folder}/Game.tsx`)) return []
  const found: string[] = []
  for (const specifier of readGameSource(`${folder}/Game.tsx`, files.read(`${folder}/Game.tsx`)).dynamicImports) {
    const file = resolveFrom(folder, specifier, files)
    if (file === null || found.includes(file)) continue
    // The text is looked at before the syntax tree is: most of what Game.tsx loads is a scene or a debrief, and a scene is long.
    const text = files.read(file)
    if (text.includes('<GameShell') && readGameSource(file, text).tags.has('GameShell')) found.push(file)
  }
  return found
}

/**
 * The view of a shell's file for each of the game's parts: the component it renders that is named for the part (`FullMirror` for the
 * mirror, as `Mirror` is `Game.tsx`'s), or undefined for a part it never renders.
 */
function viewsOf(source: ReturnType<typeof readGameSource>): Map<(typeof PARTS)[number], string | undefined> {
  return new Map(PARTS.map((part) => [part, [...source.tags].find((tag) => tag === part || tag.endsWith(part))]))
}

/** What a shell of its own, loaded by `Game.tsx`, is missing: the four views of a game, as components of the game whose files are there, and the 3D scene. */
export function checkShell(entry: GameEntry, file: string, files: Files): string[] {
  const problems: string[] = []
  const source = readGameSource(file, files.read(file))
  if (!source.defaultExport) problems.push(`${file} has no default export, which Game.tsx loads with React.lazy`)
  for (const [part, tag] of viewsOf(source)) {
    if (tag === undefined) {
      problems.push(`${file} never renders a ${part} of its own: a component whose name ends in ${part}`)
      continue
    }
    const from = source.importedFrom.get(tag)
    if (from !== undefined && from.startsWith('.') && resolveFrom(path.posix.dirname(file), from, files) === null) {
      problems.push(`${file} renders <${tag}>, and its file is missing: ${from}`)
    }
  }
  if (entry.has3d && !source.tags.has('Scene3D')) problems.push(`${file} never renders <Scene3D>`)
  if (source.staticImports.some((specifier) => /(^|\/)Scene3D$/.test(specifier))) {
    problems.push(`${file} imports Scene3D statically: load it with React.lazy(() => import('./Scene3D')), so the scene is its own chunk (A§6.10)`)
  }
  return problems
}

/** One line for the printout per shell: the components that stand for the game's four views in it. */
function shellLine(file: string, files: Files): string {
  const views = [...viewsOf(readGameSource(file, files.read(file)))].map(([part, tag]) => `${part} ${tag ?? 'none'}`)
  return `its own shell, ${path.posix.basename(file)}, renders ${views.join(', ')}`
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The session                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface SessionCheck {
  problems: string[]
  /** One line per level, for the printout. */
  lines: string[]
}

/** Runs the session's contract on each level (GAMES.md §2.1, §2.5). Never throws: whatever a method throws is a finding. */
export function checkSession(entry: GameEntry, session: AnySession, candidates = BAND_CANDIDATES, floor = BAND_FLOOR): SessionCheck {
  const problems: string[] = []
  const lines: string[] = []
  const missing = SESSION_METHODS.filter((method) => typeof session[method] !== 'function')
  if (missing.length > 0) return { problems: [`the session lacks ${missing.join(', ')} (GAMES.md §2.5)`], lines }

  for (const entryLevel of entry.levels) {
    const id = entryLevel.id
    const fail = (message: string) => problems.push(`level ${id}: ${message}`)
    try {
      const seed = entryLevel.practiceSeed
      if (!session.inBand(id, seed)) {
        fail(`the pinned practice seed ${seed} is not in band (GAMES.md §2.1)`)
        continue
      }
      const level = session.level(id, seed)
      const start = session.init(level)
      if (session.done(start)) fail('a fresh run is already over')
      if (stateHash(start) !== stateHash(session.init(session.level(id, seed)))) fail('the same seed gives two different starts: the session is not deterministic (D-017)')

      const ghost = session.ghost(level)
      if (!session.done(ghost)) fail('the reference does not finish the level')
      if (stateHash(ghost) !== stateHash(session.ghost(session.level(id, seed)))) fail('the reference gives two different runs on one seed: the session is not deterministic (D-017)')
      const grade = session.grade(ghost, ghost)
      if (typeof grade?.score !== 'number' || !(grade.score >= 0 && grade.score <= 1) || typeof grade.ok !== 'boolean') fail('grade must return a score in [0, 1] and an ok')
      else if (!grade.ok) fail('the reference does not pass its own level (GAMES.md §2.1)')
      if (blank(session.debrief(ghost, ghost)?.sentence)) fail('the debrief has no sentence')

      let inBand = 0
      for (let candidate = 0; candidate < candidates; candidate++) if (session.inBand(id, candidate)) inBand += 1
      const share = inBand / candidates
      if (share < floor) fail(`only ${(share * 100).toFixed(0)}% of the first ${candidates} seeds are in band, under the ${(floor * 100).toFixed(0)}% floor [estimated] (GAMES.md §2.1)`)
      lines.push(`${id}: practice seed ${seed} in band; ${(share * 100).toFixed(0)}% of the first ${candidates} seeds in band (floor ${(floor * 100).toFixed(0)}%)`)
    } catch (error) {
      fail(`the session threw: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { problems, lines }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The gate                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

export async function checkGames(input: GateInput): Promise<Report> {
  const { games, componentIds, files, world } = input
  const findings: Finding[] = []
  const notes: string[] = []
  const lines = new Map<string, string[]>()
  const add = (game: string | null, messages: readonly string[]) => findings.push(...messages.map((message) => ({ game, message })))

  const seen = new Set<string>()
  for (const game of games) {
    if (seen.has(game.id)) add(null, [`two games are registered as "${game.id}"`])
    seen.add(game.id)
  }
  for (const id of componentIds) if (!seen.has(id)) add(null, [`src/games/registry.ts has a component for "${id}", which packages/play/registry.ts does not list`])

  if (world.claimIds === undefined) notes.push('claims: content/claims has no files yet (W0-T08 builds the claims registry), so claim ids are not checked')
  if (world.kcIds === undefined) notes.push('KCs: content/kc/graph.yaml does not exist yet (W1-T03 builds the KC graph), so KC ids are not checked')

  for (const entry of games) {
    const out: string[] = []
    lines.set(entry.id, out)
    add(entry.id, checkEntry(entry))
    if (!componentIds.includes(entry.id)) add(entry.id, ['it has no component in src/games/registry.ts'])
    add(entry.id, checkFiles(entry, files))
    for (const shell of lazyShells(entry, files)) out.push(shellLine(shell, files))
    // A card that is missing was reported by checkFiles. One that is there and does not compile is not a card yet.
    if (world.cardIds && !blank(entry.card) && files.exists(`content/cards/${entry.card}.md`) && !world.cardIds.has(entry.card)) {
      add(entry.id, [`the notional-machine card content/cards/${entry.card}.md does not compile: it needs three parts, claims that exist and a source for each rule (A§5.9). Run verify:content for the lines`])
    }
    if (world.kcIds) for (const kc of entry.kcs ?? []) if (!world.kcIds.has(kc)) add(entry.id, [`the KC "${kc}" is not in content/kc/graph.yaml`])
    if (world.claimIds) for (const claim of entry.claims ?? []) if (!world.claimIds.has(claim)) add(entry.id, [`the claim "${claim}" is not in content/claims`])

    if (typeof entry.session === 'function') {
      try {
        const session = await entry.session()
        const checked = checkSession(entry, session, input.candidates, input.floor)
        add(entry.id, checked.problems)
        out.push(...checked.lines)
        if (input.blind !== undefined) {
          const blind = await input.blind(entry, session)
          add(entry.id, blind.problems)
          out.push(...blind.lines)
        }
      } catch (error) {
        add(entry.id, [`its session did not load: ${error instanceof Error ? error.message : String(error)}`])
      }
    }
    out.unshift(`${entry.title ?? '(no display name)'} · ${entry.subtitle ?? '(no subtitle)'}`)
    out.push(`keys: ${COMMON_KEYS.length} common + ${entry.keys?.length ?? 0} of its own`)
  }
  return { findings, notes, lines }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* This checkout                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The files of a checkout. */
export function filesAt(root: string): Files {
  return { exists: (file) => existsSync(path.join(root, file)), read: (file) => readFileSync(path.join(root, file), 'utf8') }
}

/** The ids in YAML files that are lists of `{id}` records, or undefined when none of the files exist. */
function idsIn(root: string, files: string[]): Set<string> | undefined {
  const present = files.filter((file) => existsSync(path.join(root, file)))
  if (present.length === 0) return undefined
  const ids = new Set<string>()
  for (const file of present) {
    const parsed = load(readFileSync(path.join(root, file), 'utf8'), { schema: CORE_SCHEMA })
    if (Array.isArray(parsed)) for (const item of parsed) if (typeof item?.id === 'string') ids.add(item.id)
  }
  return ids
}

/**
 * The claim, KC and card ids of a checkout. A claims file or the KC graph that does not exist yet leaves its set undefined. The
 * cards are the ones the content compiler accepts, so the gate and `verify:content` agree on what a card is.
 */
export function worldAt(root: string): World {
  const claimsDir = path.join(root, 'content/claims')
  // The folders too: W1-T01 sorted the engines' claims into vllm/, sglang/ and worlds/, as the content compiler reads them (`content/claims/**.yaml`).
  const claimFiles = existsSync(claimsDir)
    ? (readdirSync(claimsDir, { recursive: true }) as string[])
        .filter((name) => /\.ya?ml$/.test(name))
        .sort()
        .map((name) => `content/claims/${name}`)
    : []
  const cardIds = existsSync(path.join(root, 'content/cards')) ? compileContent({ root }).cards : undefined
  return { claimIds: idsIn(root, claimFiles), kcIds: idsIn(root, ['content/kc/graph.yaml']), cardIds }
}

/**
 * The gate over this checkout. `blind` measures the blind-strategy bound of every graded level through the games' probes, which plays
 * their nights: the command line asks for it, and a test of another part of the gate that runs `main` on a copy of the tree does not.
 */
export async function main(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), options: { blind?: boolean } = {}): Promise<number> {
  const games = GAMES.games
  // The nights that the probes play are the slow part, and the games' are independent: each game's starts now, in a process of its own,
  // and the checks below go on beside them.
  const aside = new Map(options.blind === true ? games.filter((game) => game.levels.some((level) => level.graded)).map((game) => [game.id, measureAside(game)] as const) : [])
  const report = await checkGames({
    games,
    componentIds: Object.keys(GAME_COMPONENTS),
    files: filesAt(root),
    world: worldAt(root),
    ...(options.blind === true ? { blind: (entry: GameEntry, session: AnySession) => aside.get(entry.id) ?? checkBlind(entry, session, undefined) } : {}),
  })
  console.log(`verify-games: ${games.length} game${games.length === 1 ? '' : 's'} registered, ${Object.keys(GAME_COMPONENTS).length} component${Object.keys(GAME_COMPONENTS).length === 1 ? '' : 's'}`)
  for (const game of games) {
    console.log(`  ${game.id}`)
    for (const line of report.lines.get(game.id) ?? []) console.log(`    ${line}`)
  }
  if (games.length === 0) console.log('  none yet: the first, loop (Service), arrives with W0-T16')
  for (const note of report.notes) console.log(`  note: ${note}`)
  for (const finding of report.findings) console.error(`verify-games: ${finding.game === null ? '' : `${finding.game}: `}${finding.message}`)
  if (report.findings.length > 0) {
    console.error(`verify-games: ${report.findings.length} problem${report.findings.length === 1 ? '' : 's'}`)
    return 1
  }
  console.log('verify-games: ok')
  return 0
}

if (import.meta.main) process.exitCode = await main(undefined, { blind: true })
