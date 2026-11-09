/*
 * verify:kc (ARCHITECTURE §4.5, §10.2; W1-T03). The knowledge-component graph, `content/kc/graph.yaml`.
 *
 * It fails, each problem with the file and the line, when:
 *   - the graph breaks its schema (packages/schema/kc.ts): a key it does not know, an id or a description that is not one, a KC
 *     defined twice, an edge to a KC that is not in the graph, or a cycle in `requires`, which must be a DAG;
 *   - a description does not begin "You can" (kernelspace's `can` rule): it states what the learner can do;
 *   - a KC belongs to a module that content/course.yaml does not have;
 *   - a `ks:` edge names a KC that kernelspace does not have, by content/kc/kernelspace.json (scripts/kc/kernelspace.ts), or that
 *     file is not read at the commit that vendor/kernelspace/VENDOR.md pins;
 *   - `confusable` is not symmetric, or has more than three entries [estimated; kernelspace's verify-kc cap];
 *   - a KC is flagged `threshold` and fewer than four KCs lean on it, directly or through a chain [estimated];
 *   - a KC has no graded item, game level or lab check behind it and no `planned` task: it could never be earned (ASSESSMENT §3.3),
 *     because a practice level writes at most practice credit and the front page writes nothing (D-038);
 *   - `planned` names a task that docs/TRACKER.md does not have;
 *   - an item, game level or lab check names no KC, or a KC that is not in the graph (§10.2: "an item, level or check without a KC");
 *   - a lab's row of packages/sim/forge/kcs.ts names a check that the lab does not have.
 * It warns, and never fails, when a KC still says `planned` although a graded reference exists, and when a KC that four others lean on
 * is not flagged `threshold`.
 *
 *   bun scripts/verify-kc.ts [--final] [--root <dir>]
 *
 * `--final` is W1-T38's check: it fails on every `planned` placeholder that remains. Without it a placeholder stands until its task
 * lands, and removing it is the exit review's job, so that two tasks never edit neighbouring lines of the graph.
 * `--root` is the tree to check: its graph, course, tracker, kernelspace snapshot and item folder. The game registry is always this
 * checkout's, as it is for verify:games.
 *
 * What counts as a reference, and where it is read:
 *   game level   a game of packages/play/registry.ts counts for its `kcs` when one of its levels is graded. The registry names KCs
 *                for the game and not for each level, so a graded level makes the whole entry a reference.
 *   item         an exported object of packages/play/items/ with a `kcs` list and a `make` function, the Gen of A§8.2 (W1-T04),
 *                alone, in an array or in a record. Once the folder exists and holds none, the gate fails: W1-T04 wires its families.
 *   lab check    a check of a graded forge lab, for the KCs that `LAB_CHECK_KCS` (packages/sim/forge/kcs.ts) maps it to, read under
 *                `root` as the item families are. A lab is passed on seeds drawn at grade time (ASSESSMENT §4.5), so its checks are
 *                graded. W1-T38 added this source when it removed the placeholders that the labs of W1-T22 and W1-T27 answer.
 *
 * `checkKc` is the whole gate over what it is given: the graph's text, the references, and the lists it checks names against. The
 * tests call it with a graph held in memory; the command line gives it this checkout.
 *
 * Exit status: 0 when no error, 1 when one is found, 2 for a usage error.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { courseSchema } from '../packages/schema/course.ts'
import { kcGraphSchema, kcSchema } from '../packages/schema/kc.ts'
import type { Kc } from '../packages/schema/kc.ts'
import { GAMES } from '../packages/play'
import type { GameEntry } from '../packages/play'
import { formatDiagnostic, isRecord, loadYaml, locate, problem, schemaDiagnostics } from './content/parse.ts'
import type { Diagnostic } from './content/parse.ts'
import { parseSnapshot, SNAPSHOT_FILE } from './kc/kernelspace.ts'
import type { Snapshot } from './kc/kernelspace.ts'
import { readVendorMd } from './vendor-drift.ts'

export const GRAPH_FILE = 'content/kc/graph.yaml'
export const ITEMS_DIR = 'packages/play/items'

/** A threshold KC is one that at least this many KCs lean on, directly or through a chain [estimated]. */
export const THRESHOLD_DEPENDENTS = 4
/** A KC has at most this many confusable KCs [estimated; kernelspace's verify-kc cap]. */
export const CONFUSABLE_MAX = 3
/** How every description begins (kernelspace's `can` rule). */
export const VOICE = 'You can '

/* ------------------------------------------------------------------------------------------------------------------ */
/* References                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Something that names KCs because it assesses them: an item family, a game, or a lab check. */
export interface Reference {
  kind: 'item' | 'level' | 'check'
  /** What it is, for a message: `play:loop`, `item:gen/tr2.bubble-width`. */
  name: string
  /** Where it is written, for a message. */
  file: string
  kcs: readonly string[]
  /** Whether it can earn a KC at full weight: an item, a lab check, and a game with a graded level. */
  graded: boolean
}

/** The games of the registry as references. */
export function gameReferences(games: readonly GameEntry[]): Reference[] {
  return games.map((game) => ({
    kind: 'level',
    name: `play:${game.id}`,
    file: 'packages/play/registry.ts',
    kcs: game.kcs,
    graded: game.levels.some((level) => level.graded),
  }))
}

/** A family as the module that exports it names it: an object with a `kcs` list and a `make` function. */
const isFamily = (value: unknown): value is { id?: unknown; kcs: string[] } =>
  isRecord(value) && Array.isArray(value.kcs) && value.kcs.every((kc) => typeof kc === 'string') && typeof value.make === 'function'

/** The families in one export: the value itself, or the ones inside an array or a record of them. `name` stands in for a missing `id`. */
function familiesIn(value: unknown, name: string, depth = 0): { id: string; kcs: string[] }[] {
  if (isFamily(value)) return [{ id: typeof value.id === 'string' ? value.id : name, kcs: value.kcs }]
  if (depth >= 2) return []
  if (Array.isArray(value)) return value.flatMap((item, index) => familiesIn(item, `${name}[${index}]`, depth + 1))
  if (isRecord(value)) return Object.entries(value).flatMap(([key, item]) => familiesIn(item, key, depth + 1))
  return []
}

/** The `.ts` and `.tsx` files under a folder, sorted, as paths relative to `root` written with slashes. */
function sourcesUnder(root: string, dir: string): string[] {
  const found: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(path.join(root, current), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const next = `${current}/${entry.name}`
      if (entry.isDirectory()) walk(next)
      else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$|\.test\.tsx?$/.test(entry.name)) found.push(next)
    }
  }
  walk(dir)
  return found
}

export interface ItemSource {
  references: Reference[]
  diagnostics: Diagnostic[]
  /** Why there are none, when the folder is not there. */
  note: string | null
}

/** The item families of `packages/play/items/` under `root`, as references. */
export async function itemReferences(root: string): Promise<ItemSource> {
  if (!existsSync(path.join(root, ITEMS_DIR))) {
    return { references: [], diagnostics: [], note: `items: ${ITEMS_DIR} does not exist yet (W1-T04), so no item family names a KC` }
  }
  const diagnostics: Diagnostic[] = []
  const families = new Map<string, { id: string; kcs: string[]; file: string }>()
  for (const file of sourcesUnder(root, ITEMS_DIR)) {
    let loaded: Record<string, unknown>
    try {
      loaded = (await import(pathToFileURL(path.join(root, file)).href)) as Record<string, unknown>
    } catch (error) {
      diagnostics.push(problem('kc', 'error', 'item-import', file, 1, `cannot be imported to read the families in it: ${error instanceof Error ? error.message : String(error)}`))
      continue
    }
    for (const [name, value] of Object.entries(loaded)) {
      for (const family of familiesIn(value, name)) if (!families.has(family.id)) families.set(family.id, { ...family, file })
    }
  }
  if (families.size === 0 && diagnostics.length === 0) {
    diagnostics.push(
      problem(
        'kc',
        'error',
        'no-families',
        ITEMS_DIR,
        1,
        `the folder exists and verify:kc finds no item family in it: it reads exported objects with a kcs list and a make function (Gen, A§8.2), alone, in an array or in a record`,
      ),
    )
  }
  const references = [...families.values()].map(({ id, kcs, file }): Reference => ({ kind: 'item', name: `item:gen/${id}`, file, kcs, graded: true }))
  return { references, diagnostics, note: null }
}

/** Where the graded forge labs map their checks to KCs. */
export const LABS_FILE = 'packages/sim/forge/kcs.ts'

/** The labs' checks have the item families' shape: references, problems, and why there are none when the table is not there. */
export type LabSource = ItemSource

/**
 * The checks of the graded forge labs under `root`, as references: one for each check that `LAB_CHECK_KCS` (LABS_FILE) maps to KCs, named
 * `lab:<lab>/<check>`. A row that maps a check the lab does not have fails, so a renamed check cannot leave its KCs behind.
 */
export async function labReferences(root: string): Promise<LabSource> {
  if (!existsSync(path.join(root, LABS_FILE))) {
    return { references: [], diagnostics: [], note: `labs: ${LABS_FILE} does not exist, so no lab check names a KC` }
  }
  const fail = (code: string, message: string): LabSource => ({ references: [], diagnostics: [problem('kc', 'error', code, LABS_FILE, 1, message)], note: null })
  let table: unknown
  try {
    table = ((await import(pathToFileURL(path.join(root, LABS_FILE)).href)) as Record<string, unknown>).LAB_CHECK_KCS
  } catch (error) {
    return fail('lab-import', `cannot be imported to read the labs' checks: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isRecord(table)) return fail('lab-table', 'exports no LAB_CHECK_KCS: a record of the graded labs, each with its checks and the KCs of each check')
  const references: Reference[] = []
  const diagnostics: Diagnostic[] = []
  for (const [lab, row] of Object.entries(table)) {
    const checks = isRecord(row) && Array.isArray(row.checks) ? row.checks.map((check) => (isRecord(check) ? check.id : undefined)) : []
    for (const [check, kcs] of Object.entries(isRecord(row) && isRecord(row.kcs) ? row.kcs : {})) {
      if (!checks.includes(check)) {
        diagnostics.push(problem('kc', 'error', 'lab-unknown-check', LABS_FILE, 1, `lab:${lab} maps the check "${check}" to KCs, and the lab has no such check`))
        continue
      }
      const named = Array.isArray(kcs) ? kcs.filter((kc): kc is string => typeof kc === 'string') : []
      references.push({ kind: 'check', name: `lab:${lab}/${check}`, file: LABS_FILE, kcs: named, graded: true })
    }
  }
  return { references, diagnostics, note: null }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The checks                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface KcInput {
  /** The text of content/kc/graph.yaml. */
  text: string
  references: readonly Reference[]
  /** The module ids of content/course.yaml, or null when there is none to check a KC's module against. */
  modules: ReadonlySet<string> | null
  /** The task ids of docs/TRACKER.md, or null when there is none to check `planned` against. */
  tasks: ReadonlySet<string> | null
  /** The kernelspace snapshot, or null when there is none to check `ks:` edges against. */
  kernelspace: Snapshot | null
  /** W1-T38's check: no `planned` placeholder may remain. */
  final: boolean
}

export interface KcStats {
  kcs: number
  /** KCs per module, in the order the graph meets the modules. */
  byModule: [module: string, count: number][]
  thresholds: number
  /** Pairs of KCs, each counted once. */
  confusablePairs: number
  /** The distinct kernelspace KCs that edges name. */
  kernelspaceKcs: number
  planned: number
  /** KCs with a graded reference. */
  referenced: number
}

/** How many KCs lean on each KC, directly or through a chain of `requires`. */
export function dependentCounts(kcs: readonly Kc[]): Map<string, number> {
  const leaning = new Map<string, string[]>()
  for (const kc of kcs) {
    for (const need of kc.requires) leaning.set(need, [...(leaning.get(need) ?? []), kc.id])
  }
  const counts = new Map<string, number>()
  for (const kc of kcs) {
    const seen = new Set<string>()
    const stack = [kc.id]
    for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
      for (const dependent of leaning.get(next) ?? []) {
        if (seen.has(dependent)) continue
        seen.add(dependent)
        stack.push(dependent)
      }
    }
    counts.set(kc.id, seen.size)
  }
  return counts
}

/** The module a KC belongs to: the capstone's KCs begin `cap.` (packages/schema/refs.ts). */
const moduleOf = (id: string): string => {
  const namespace = id.slice(0, id.indexOf('.'))
  return namespace === 'cap' ? 'capstone' : namespace
}

/** By file, then by line, so that a run reads like a walk through the files. */
const inOrder = (diagnostics: Diagnostic[]): Diagnostic[] => diagnostics.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line))

export function checkKc(input: KcInput): { diagnostics: Diagnostic[]; stats: KcStats | null } {
  const out: Diagnostic[] = []
  const { text } = input
  const lines = text.split('\n')
  const at = (keys: (string | number)[]): number => 1 + locate(lines, keys)
  const error = (code: string, keys: (string | number)[], message: string) => out.push(problem('kc', 'error', code, GRAPH_FILE, at(keys), message))
  const warning = (code: string, keys: (string | number)[], message: string) => out.push(problem('kc', 'warning', code, GRAPH_FILE, at(keys), message))

  const loaded = loadYaml(text, GRAPH_FILE, 1, 'kc', out)
  if (!loaded.ok) return { diagnostics: out, stats: null }
  const parsed = kcGraphSchema.safeParse(loaded.value)
  if (!parsed.success) {
    out.push(...schemaDiagnostics(parsed.error.issues, { file: GRAPH_FILE, text, firstLine: 1, gate: 'kc', subject: 'a KC', allowedKeys: Object.keys(kcSchema.shape) }))
    return { diagnostics: inOrder(out), stats: null }
  }
  const kcs = parsed.data
  const byId = new Map(kcs.map((kc, index) => [kc.id, { kc, index }]))
  const dependents = dependentCounts(kcs)
  const kernelspaceIds = input.kernelspace === null ? null : new Set(input.kernelspace.ids)

  const referencing = new Map<string, Reference[]>()
  for (const reference of input.references) {
    for (const id of reference.kcs) referencing.set(id, [...(referencing.get(id) ?? []), reference])
  }

  const usedKernelspace = new Set<string>()
  const modules = new Map<string, number>()
  let thresholds = 0
  let planned = 0
  let referenced = 0
  const pairs = new Set<string>()

  kcs.forEach((kc, index) => {
    const here = (...keys: (string | number)[]) => [index, ...keys]
    modules.set(moduleOf(kc.id), (modules.get(moduleOf(kc.id)) ?? 0) + 1)

    if (!kc.description.startsWith(VOICE)) error('description-voice', here('description'), `${kc.id}: a description says what the learner can do, so it begins "${VOICE.trim()}"`)
    if (input.modules !== null && !input.modules.has(moduleOf(kc.id))) {
      error('unknown-module', here('id'), `${kc.id}: content/course.yaml has no module "${moduleOf(kc.id)}"`)
    }

    kc.requires.forEach((need, edge) => {
      if (!need.startsWith('ks:')) return
      usedKernelspace.add(need)
      if (kernelspaceIds !== null && !kernelspaceIds.has(need.slice('ks:'.length))) {
        error('unknown-ks-kc', here('requires', edge), `${kc.id}: kernelspace has no KC "${need.slice('ks:'.length)}" at ${input.kernelspace?.commit.slice(0, 12)} (${SNAPSHOT_FILE})`)
      }
    })

    if (kc.confusable.length > CONFUSABLE_MAX) {
      error('confusable-limit', here('confusable'), `${kc.id}: ${kc.confusable.length} confusable KCs, and a KC has at most ${CONFUSABLE_MAX} [estimated]: Today interleaves inside a small set`)
    }
    kc.confusable.forEach((other, edge) => {
      if (byId.get(other)?.kc.confusable.includes(kc.id) === false) {
        error('asymmetric-confusable', here('confusable', edge), `${kc.id}: lists ${other} as confusable, and ${other} does not list ${kc.id}: the set is symmetric`)
      }
      pairs.add([kc.id, other].sort().join('|'))
    })

    const count = dependents.get(kc.id) ?? 0
    if (kc.threshold === true) {
      thresholds += 1
      if (count < THRESHOLD_DEPENDENTS) {
        error('threshold-leaf', here('threshold'), `${kc.id}: flagged threshold, and ${count} KCs lean on it, directly or through a chain: a threshold KC has at least ${THRESHOLD_DEPENDENTS} [estimated]`)
      }
    } else if (count >= THRESHOLD_DEPENDENTS) {
      warning('threshold-candidate', here(), `${kc.id}: ${count} KCs lean on it, directly or through a chain, so it qualifies as a threshold KC [estimated]: flag it, or leave it`)
    }

    const references = referencing.get(kc.id) ?? []
    const graded = references.filter((reference) => reference.graded)
    if (graded.length > 0) referenced += 1
    if (kc.planned === undefined) {
      if (graded.length === 0) {
        const practice = references.map((reference) => reference.name)
        error(
          'no-reference',
          here(),
          `${kc.id}: no graded item, game level or lab check names it${practice.length > 0 ? ` (${practice.join(', ')} names it, and has no graded level)` : ''}, and no task is planned to add one: add the reference, or say \`planned: W1-Txx\``,
        )
      }
      return
    }

    planned += 1
    if (input.tasks !== null && !input.tasks.has(kc.planned)) error('unknown-task', here('planned'), `${kc.id}: planned for ${kc.planned}, and docs/TRACKER.md has no such task`)
    if (input.final) error('planned-remaining', here('planned'), `${kc.id}: still planned for ${kc.planned}, and W1-T38 allows no placeholder: add a graded item, game level or lab check, and remove the line`)
    else if (graded.length > 0) warning('stale-planned', here('planned'), `${kc.id}: says planned for ${kc.planned}, and ${graded[0].name} already names it with a graded level: remove the line`)
  })

  // The other direction (§10.2): what assesses KCs names some, and they exist.
  for (const reference of input.references) {
    if (reference.kcs.length === 0) out.push(problem('kc', 'error', 'reference-no-kc', reference.file, 1, `${reference.name} names no KC: an item, game level or lab check assesses some (ARCHITECTURE §4.5)`))
    for (const id of reference.kcs) {
      if (!byId.has(id)) out.push(problem('kc', 'error', 'reference-unknown-kc', reference.file, 1, `${reference.name} names the KC "${id}", which is not in ${GRAPH_FILE}`))
    }
  }

  return {
    diagnostics: inOrder(out),
    stats: {
      kcs: kcs.length,
      byModule: [...modules],
      thresholds,
      confusablePairs: pairs.size,
      kernelspaceKcs: usedKernelspace.size,
      planned,
      referenced,
    },
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* This checkout                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The ids of docs/TRACKER.md's tasks (`#### [ ] W1-T14 · …`), or null when the file is not there. */
export function trackerTasks(root: string): Set<string> | null {
  const file = path.join(root, 'docs/TRACKER.md')
  if (!existsSync(file)) return null
  return new Set([...readFileSync(file, 'utf8').matchAll(/^#### \[.\] (W\d-T\d\d) · /gm)].map((match) => match[1]))
}

/** The module ids of content/course.yaml, or null when it is not there or is not a course (verify:content says what is wrong). */
export function courseModules(root: string): Set<string> | null {
  const file = path.join(root, 'content/course.yaml')
  if (!existsSync(file)) return null
  const loaded = loadYaml(readFileSync(file, 'utf8'), 'content/course.yaml', 1, 'kc', [])
  const course = loaded.ok ? courseSchema.safeParse(loaded.value) : null
  return course?.success === true ? new Set(course.data.modules.map((module) => module.id)) : null
}

export interface SnapshotRead {
  snapshot: Snapshot | null
  /** The file is not there. That is an error only when the graph has a `ks:` edge, which `main` knows once the graph is read. */
  absent: boolean
  diagnostics: Diagnostic[]
}

/** The kernelspace snapshot under `root`, and what is wrong with it: malformed, or read at another commit than the one VENDOR.md pins. */
export function readKernelspace(root: string): SnapshotRead {
  const fail = (message: string): SnapshotRead => ({ snapshot: null, absent: false, diagnostics: [problem('kc', 'error', 'ks-pin', SNAPSHOT_FILE, 1, message)] })
  const file = path.join(root, SNAPSHOT_FILE)
  if (!existsSync(file)) return { snapshot: null, absent: true, diagnostics: [] }
  const read = parseSnapshot(readFileSync(file, 'utf8'))
  if (read.snapshot === undefined) {
    return { snapshot: null, absent: false, diagnostics: read.problems.map((message) => problem('kc', 'error', 'ks-snapshot', SNAPSHOT_FILE, 1, message)) }
  }
  let pin: string | null = null
  try {
    pin = readVendorMd(root).pin
  } catch {
    // No VENDOR.md under this root: verify:vendor reports that, and there is no pin to hold the snapshot to.
  }
  if (pin !== null && read.snapshot.commit !== pin) {
    return fail(`read at ${read.snapshot.commit.slice(0, 12)}, and vendor/kernelspace/VENDOR.md pins ${pin.slice(0, 12)}: bun scripts/kc/kernelspace.ts print > ${SNAPSHOT_FILE} reads the pin`)
  }
  return { snapshot: read.snapshot, absent: false, diagnostics: [] }
}

const USAGE = 'usage: bun scripts/verify-kc.ts [--final] [--root <dir>]'
const DEFAULT_ROOT = path.resolve(import.meta.dirname, '..')

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

export async function main(argv: readonly string[]): Promise<number> {
  let root = DEFAULT_ROOT
  let final = false
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--final') final = true
    else if (argv[i] === '--root' && argv[i + 1] !== undefined) root = path.resolve(argv[++i] as string)
    else {
      console.error(USAGE)
      return 2
    }
  }

  const graphFile = path.join(root, GRAPH_FILE)
  if (!existsSync(graphFile)) {
    console.log(formatDiagnostic(problem('kc', 'error', 'missing-file', GRAPH_FILE, 1, `${GRAPH_FILE} lists the course's knowledge components (ARCHITECTURE §4.5)`)))
    console.log('verify:kc failed: 1 error in 1 file')
    return 1
  }
  const text = readFileSync(graphFile, 'utf8')

  const snapshot = readKernelspace(root)
  const items = await itemReferences(root)
  const labs = await labReferences(root)
  const result = checkKc({
    text,
    references: [...gameReferences(GAMES.games), ...items.references, ...labs.references],
    modules: courseModules(root),
    tasks: trackerTasks(root),
    kernelspace: snapshot.snapshot,
    final,
  })

  const diagnostics = [...result.diagnostics, ...snapshot.diagnostics, ...items.diagnostics, ...labs.diagnostics]
  if (snapshot.absent && (result.stats?.kernelspaceKcs ?? 0) > 0) {
    diagnostics.push(problem('kc', 'error', 'ks-snapshot', SNAPSHOT_FILE, 1, `${SNAPSHOT_FILE} does not exist, and the graph has ks: edges: bun scripts/kc/kernelspace.ts print > ${SNAPSHOT_FILE} writes it`))
  }
  for (const diagnostic of diagnostics) console.log(formatDiagnostic(diagnostic))

  const notes = [
    ...GAMES.games.filter((game) => !game.levels.some((level) => level.graded)).map((game) => `games: ${game.id} has no graded level yet, so it cannot earn its KCs`),
    ...(items.note === null ? [] : [items.note]),
    ...(labs.note === null ? [] : [labs.note]),
  ]
  for (const note of notes) console.log(`note: ${note}`)

  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
  const warnings = diagnostics.length - errors.length
  const warned = warnings > 0 ? `, ${plural(warnings, 'warning')}` : ''
  if (errors.length > 0) {
    console.log(`verify:kc failed: ${plural(errors.length, 'error')} in ${plural(new Set(errors.map((diagnostic) => diagnostic.file)).size, 'file')}${warned}`)
    return 1
  }
  const stats = result.stats
  if (stats === null) return 1
  const modules = stats.byModule.map(([module, count]) => `${module} ${count}`).join(', ')
  console.log(
    `verify:kc passed: ${plural(stats.kcs, 'KC')} (${modules}), ${plural(stats.thresholds, 'threshold')}, ${plural(stats.confusablePairs, 'confusable pair')}, ` +
      `${plural(stats.kernelspaceKcs, 'kernelspace prerequisite')}; ${stats.referenced} with a graded reference, ${stats.planned} planned${warned}`,
  )
  return 0
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2))
