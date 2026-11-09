/*
 * verify:items (ARCHITECTURE §8.2, §10.2; ASSESSMENT §4.1 and §4.2; W1-T04). The item generator families of
 * `packages/play/items/`: each one must make the same item from the same seed everywhere, draw fair questions, and be hard to pass
 * without reading the scene.
 *
 * It loads every exported object of the folder that has a `kcs` list and a `make` function (the `Gen` of packages/play/items/types.ts,
 * as verify:kc reads them), and fails, with the file and the line where it can say them, when a family:
 *   - is not a well-formed `Gen`: an id that is not `<module>.<words>`, no version, a variant with no KC or level, a KC the variants
 *     do not cover, or two families with one id;
 *   - is not deterministic. Its source holds a banned API (the lint of A§5.1, `Math.random` first), or `make` gives another item
 *     for the same seed on a second call or after other seeds were made (state that leaks), or it throws when `Math.random`,
 *     `Date.now`, `performance.now` and `crypto.getRandomValues` are made to throw;
 *   - makes an item that is malformed: an id, a seed, a level or a fingerprint that is not the item's own; a key that is not finite;
 *     a choice with fewer than two options, a repeated id, a key that is no option, or an option with no why; params that have no
 *     canonical JSON form; a digit in a sentence, where a number belongs in a tagged `num` part (every number is a claim or carries a
 *     tag, A§4.4);
 *   - grades inconsistently: its key is not right, a wrong option is, a number off by a long way is, or the last step of its
 *     solution ends in a number other than the key;
 *   - has a band that accepts under 20 % of candidates [estimated; ASSESSMENT §4.1, kernelspace's EPLB floor], or whose `drawInBand`
 *     returns a seed that is not in band;
 *   - has a scene-blind strategy above its bound (blind.ts): a constant, a position, a length, a number echoed from the ticket, or
 *     one of the family's own, passing more than 15 % of single seeds, or for a choice of fewer than 7 options more than its own
 *     chance plus three standard errors [estimated]. That is ASSESSMENT §4.1, with the one reading it needs: a choice among k
 *     options is right at random 1 time in k, which no bound of 15 % can hold for k under 7;
 *   - moves a golden vector: `tests/fixtures/items/vectors.json` pins, for fixed seeds, each family's items by the SHA-256 of their
 *     canonical JSON, so that a change to what a seed means is a reviewed diff and a bump of the family's `version`;
 *   - leaks a solution: a sentence of a solution or of a "why" appears in the Markdown export, `public/llms.txt` or the compiled
 *     lessons, which hold no key (A§4.6, ASSESSMENT §10).
 *
 *   bun scripts/verify-items.ts [--root <dir>] [--write]
 *
 * `--root` is the tree to check: its `packages/play/items`, its golden vectors and its `content/`. `--write` rewrites the golden
 * vectors from the families, and checks nothing else.
 *
 * Exit status: 0 when no error, 1 when one is found, 2 for a usage error.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { canonicalJson } from '../packages/sim/core/json.ts'
import { BAND_FLOOR, bandAcceptance, bandedSeeds, BLIND_SAMPLE, measureBlind } from '../packages/play/items/blind.ts'
import type { BlindReport } from '../packages/play/items/blind.ts'
import { drawInBand, fixedSeeds, itemRev, MAX_DRAWS, offeredAt } from '../packages/play/items/draw.ts'
import { keyText } from '../packages/play/items/grade.ts'
import { plain } from '../packages/play/items/rich.ts'
import { ITEM_TAGS, LEVELS } from '../packages/play/items/types.ts'
import type { Gen, Item, Level, Part, Response, Rich } from '../packages/play/items/types.ts'
import { compileContent } from './content/build.ts'
import { formatDiagnostic, isRecord, problem } from './content/parse.ts'
import type { Diagnostic } from './content/parse.ts'
import { untaggedNumbers } from './content/prose.ts'
import { lintSource } from './verify-determinism.ts'

export const ITEMS_DIR = 'packages/play/items'
export const VECTORS_FILE = 'tests/fixtures/items/vectors.json'
export const VECTORS_SCHEMA = 'enginespace/item-vectors@1'

/** Seeds that `make` is called on twice to see that it is deterministic, per level and variant [estimated]. */
export const PROBE_SEEDS = 24
/** Entropy values drawn through `drawInBand` to see that it returns seeds in band [estimated]. */
export const DRAW_PROBES = 64
/** The fewest banded seeds a family may be measured on; a band that finds fewer is too tight to measure [estimated]. */
export const MIN_BANDED = 200
/** Seeds whose items are searched for in the export, per level and variant [estimated]. */
export const LEAK_SEEDS = 12
/** A sentence is searched for in the export only if it is at least this long, so that a common phrase is not taken for a leak [estimated]. */
export const LEAK_MIN_CHARS = 40
/** Errors printed for one family before the rest are counted [estimated]. */
const REPORT_CAP = 12

const FAMILY_ID = /^(?:tr[0-8][ab]?|capstone)\.[a-z0-9]+(?:-[a-z0-9]+)*$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/* ------------------------------------------------------------------------------------------------------------------ */
/* Loading the families                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface LoadedFamily {
  gen: Gen
  /** Relative to the root, with slashes. */
  file: string
}

const isFamily = (value: unknown): value is Gen =>
  isRecord(value) && Array.isArray(value.kcs) && value.kcs.every((kc) => typeof kc === 'string') && typeof value.make === 'function'

/** The families in one export: the value itself, or the ones inside an array or a record of them. */
function familiesIn(value: unknown, depth = 0): Gen[] {
  if (isFamily(value)) return [value]
  if (depth >= 2) return []
  if (Array.isArray(value)) return value.flatMap((entry) => familiesIn(entry, depth + 1))
  if (isRecord(value)) return Object.values(value).flatMap((entry) => familiesIn(entry, depth + 1))
  return []
}

/** The `.ts` and `.tsx` sources under a folder, sorted, as paths relative to `root`. Tests and declaration files are not sources. */
export function sourcesUnder(root: string, dir: string): string[] {
  const found: string[] = []
  const walk = (current: string): void => {
    const entries = readdirSync(path.join(root, current), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of entries) {
      const next = `${current}/${entry.name}`
      if (entry.isDirectory()) walk(next)
      else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$|\.test\.tsx?$/.test(entry.name)) found.push(next)
    }
  }
  walk(dir)
  return found
}

export interface Loaded {
  families: LoadedFamily[]
  files: string[]
  diagnostics: Diagnostic[]
}

const at = (file: string, message: string, code: string, line = 1): Diagnostic => problem('items', 'error', code, file, line, message)

/** Imports every source of the items folder, and collects the families the exports hold, each once, in the order the files are met. */
export async function loadFamilies(root: string): Promise<Loaded> {
  const diagnostics: Diagnostic[] = []
  if (!existsSync(path.join(root, ITEMS_DIR))) {
    return { families: [], files: [], diagnostics: [at(ITEMS_DIR, `${ITEMS_DIR} does not exist: the item framework is not built in this tree`, 'no-folder')] }
  }
  const files = sourcesUnder(root, ITEMS_DIR)
  const families: LoadedFamily[] = []
  const seen = new Map<Gen, string>()
  for (const file of files) {
    let loaded: Record<string, unknown>
    try {
      loaded = (await import(pathToFileURL(path.join(root, file)).href)) as Record<string, unknown>
    } catch (error) {
      diagnostics.push(at(file, `cannot be imported to read the families in it: ${error instanceof Error ? error.message : String(error)}`, 'import'))
      continue
    }
    for (const value of Object.values(loaded)) {
      for (const gen of familiesIn(value)) {
        if (seen.has(gen)) continue
        seen.set(gen, file)
        families.push({ gen, file })
      }
    }
  }
  // A family is re-exported by an index, which a sorted walk may meet first. A message points at the file that names its id.
  const texts = new Map(files.map((file) => [file, readFileSync(path.join(root, file), 'utf8')]))
  for (const family of families) {
    const id = String(family.gen.id)
    const home = files.find((file) => ['\'', '"', '`'].some((quote) => (texts.get(file) ?? '').includes(`${quote}${id}${quote}`)))
    if (home !== undefined) family.file = home
  }
  if (families.length === 0 && diagnostics.length === 0) {
    diagnostics.push(at(ITEMS_DIR, `no item family in the folder: a family is an exported object with a kcs list and a make function (Gen, A§8.2)`, 'no-families'))
  }
  return { families, files, diagnostics }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Small helpers                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Runs `fn` with the sources of entropy and time made to throw, and puts them back. Pure code reads none of them. */
export function withoutEntropy<T>(fn: () => T): T {
  type Slot = { holder: Record<string, unknown>; key: string; original: unknown }
  const slots: Slot[] = []
  const poison = (holder: unknown, key: string, label: string): void => {
    if (typeof holder !== 'object' && typeof holder !== 'function') return
    if (holder === null) return
    const target = holder as Record<string, unknown>
    const original = target[key]
    if (typeof original !== 'function') return
    try {
      Object.defineProperty(target, key, {
        configurable: true,
        writable: true,
        value: () => {
          throw new Error(`${label} was called: a family draws only from its seed`)
        },
      })
      slots.push({ holder: target, key, original })
    } catch {
      // A global that cannot be replaced cannot be poisoned: the static lint still reads the source for it.
    }
  }
  poison(Math, 'random', 'Math.random')
  poison(Date, 'now', 'Date.now')
  poison((globalThis as { performance?: unknown }).performance, 'now', 'performance.now')
  poison((globalThis as { crypto?: unknown }).crypto, 'getRandomValues', 'crypto.getRandomValues')
  try {
    return fn()
  } finally {
    for (const { holder, key, original } of slots.reverse()) Object.defineProperty(holder, key, { configurable: true, writable: true, value: original })
  }
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** What a family offers: each level some variant is offered at, and for each the variants. */
function levelsOf(gen: Gen): Level[] {
  return LEVELS.filter((level) => Array.isArray(gen.variants) && offeredAt(gen, level).length > 0)
}

/** Every text part of a piece of Rich text, with where it was found, for the number lint. */
function textParts(parts: Rich, where: string): { text: string; where: string }[] {
  return parts.flatMap((part): { text: string; where: string }[] => (part.t === 'text' ? [{ text: part.text, where }] : []))
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The checks of one family                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What a family's `make` must give: found by a walk over the item, so that a malformed one is named before it is graded. */
export function itemProblems(gen: Gen, item: Item, expected: { seed: number; level: Level; variant?: string }): string[] {
  const out: string[] = []
  const bad = (text: string): void => void out.push(text)
  const isParts = (value: unknown): value is Rich => Array.isArray(value) && value.length > 0 && value.every(isPart)
  if (item.family !== gen.id) bad(`family is "${item.family}", and the family is "${gen.id}"`)
  if (item.version !== gen.version) bad(`version is ${item.version}, and the family's is ${gen.version}`)
  if (item.seed !== expected.seed) bad(`seed is ${item.seed}, and it was made from ${expected.seed}`)
  if (item.level !== expected.level) bad(`level is ${item.level}, and it was made at ${expected.level}`)
  if (expected.variant !== undefined && item.variant !== expected.variant) bad(`variant is "${item.variant}", and "${expected.variant}" was asked for`)
  const spec = gen.variants.find((variant) => variant.id === item.variant)
  if (spec === undefined) bad(`variant "${item.variant}" is not one of the family's`)
  else {
    if (!spec.levels.includes(item.level)) bad(`variant ${spec.id} is made at level ${item.level}, which it does not list`)
    if (item.kcs.join() !== spec.kcs.join()) bad(`kcs are [${item.kcs.join(', ')}], and the variant ${spec.id} lists [${spec.kcs.join(', ')}]`)
  }
  try {
    if (item.rev !== itemRev(item)) bad(`rev is ${item.rev}, and the item's fingerprint is ${itemRev(item)}`)
    canonicalJson(item)
  } catch (error) {
    bad(`has no canonical JSON form: ${message(error)}`)
  }
  if (!isParts(item.stem)) bad('stem is empty or holds a part that is not text, a number or code')
  const labels = new Set<string>()
  for (const given of item.givens) {
    if (typeof given.label !== 'string' || given.label === '') bad('a given has no label')
    else if (labels.has(given.label)) bad(`the given "${given.label}" appears twice`)
    labels.add(given.label)
    if (!isPart(given.value)) bad(`the given "${given.label}" has no value`)
  }
  const answer = item.answer
  if (answer.kind === 'numeric') {
    if (!Number.isFinite(answer.truth)) bad('the key is not a finite number')
    if (typeof answer.unit !== 'string' || answer.unit === '') bad('the answer has no unit')
    if (typeof answer.label !== 'string' || answer.label === '') bad('the answer slip has no label')
  } else if (answer.kind === 'choice') {
    const ids = new Set<string>()
    if (answer.options.length < 2) bad('a choice has fewer than two options')
    for (const option of answer.options) {
      if (!SLUG.test(option.id)) bad(`option id "${option.id}" is not a slug`)
      if (ids.has(option.id)) bad(`option id "${option.id}" appears twice`)
      ids.add(option.id)
      if (!isParts(option.text)) bad(`option "${option.id}" has no text`)
      if (!isParts(option.why)) bad(`option "${option.id}" has no why: every option says why it is right or wrong`)
    }
    if (!ids.has(answer.correct)) bad(`the key "${answer.correct}" is not one of the options`)
  } else bad(`the answer is of the kind "${String((answer as { kind?: unknown }).kind)}", which is neither numeric nor choice`)
  return out
}

function isPart(value: unknown): value is Part {
  if (!isRecord(value)) return false
  if (value.t === 'text') return typeof value.text === 'string' && value.text !== ''
  if (value.t === 'code') return typeof value.code === 'string' && value.code !== ''
  if (value.t === 'num') {
    return typeof value.value === 'number' && Number.isFinite(value.value) && typeof value.tag === 'string' && (ITEM_TAGS as readonly string[]).includes(value.tag)
  }
  return false
}

/** Every sentence a learner reads on an item or its reveal, as text parts, for the number lint. */
function sentencesOf(gen: Gen, item: Item): { text: string; where: string }[] {
  const out = [...textParts(item.stem, 'the stem')]
  for (const given of item.givens) if (given.value.t === 'text') out.push({ text: given.value.text, where: `the given "${given.label}"` })
  for (const step of item.worked) out.push(...textParts(step.text, 'a worked step'))
  for (const step of gen.solution(item)) out.push(...textParts(step.text, 'a solution step'))
  if (item.answer.kind === 'choice') {
    for (const option of item.answer.options) out.push(...textParts(option.text, `option ${option.id}`), ...textParts(option.why, `the why of option ${option.id}`))
  }
  return out
}

/** The responses that must be graded wrong: every option but the key, or a number far from it. */
function wrongResponses(item: Item): Response[] {
  const answer = item.answer
  if (answer.kind === 'choice') return answer.options.filter((option) => option.id !== answer.correct).map((option): Response => ({ kind: 'choice', pick: option.id }))
  const far = Math.abs(answer.truth) * 3 + 1000
  return [
    { kind: 'numeric', value: answer.truth + far },
    { kind: 'numeric', value: answer.truth - far },
    { kind: 'numeric', value: Number.NaN },
  ]
}

const keyResponse = (item: Item): Response =>
  item.answer.kind === 'choice' ? { kind: 'choice', pick: item.answer.correct } : { kind: 'numeric', value: item.answer.truth }

/** Everything that is checked on single items: shape, determinism, tagged numbers and grading. */
export function checkItems(gen: Gen, file: string): Diagnostic[] {
  // One diagnostic per distinct problem: a bad family makes the same mistake on every seed, and says it once.
  const found = new Map<string, Diagnostic>()
  const note = (code: string, text: string): void => {
    const key = `${code}:${text}`
    if (!found.has(key)) found.set(key, at(file, `${gen.id}: ${text}`, code))
  }

  for (const level of levelsOf(gen)) {
    const seeds = fixedSeeds(PROBE_SEEDS, 0xde7e + level)
    // Other seeds are made between the two calls, so that state left behind by a call would show.
    const others = fixedSeeds(3, 0x07e4 + level)
    for (const spec of offeredAt(gen, level)) {
      const where = `${spec.id} at level ${level}`
      for (const seed of seeds) {
        let first: Item
        let second: Item
        try {
          first = withoutEntropy(() => gen.make(seed, level, spec.id))
          for (const other of others) withoutEntropy(() => gen.make(other, level, spec.id))
          second = withoutEntropy(() => gen.make(seed, level, spec.id))
        } catch (caught) {
          note('make-throws', `make(${seed}, ${level}, "${spec.id}") throws: ${message(caught)}`)
          break
        }
        let same: boolean
        try {
          same = canonicalJson(first) === canonicalJson(second)
        } catch (caught) {
          note('item-shape', `${where}, seed ${seed}: the item has no canonical JSON form: ${message(caught)}`)
          break
        }
        if (!same) {
          note('non-deterministic', `${where}: make(${seed}) gave different items on two calls: a family draws only from its seed (A§5.1)`)
          break
        }
        try {
          for (const text of itemProblems(gen, first, { seed, level, variant: spec.id })) note('item-shape', `${where}, seed ${seed}: ${text}`)
        } catch (caught) {
          note('item-shape', `${where}, seed ${seed}: the item cannot be read as an Item: ${message(caught)}`)
          break
        }
        try {
          withoutEntropy(() => {
            for (const { text, where: place } of sentencesOf(gen, first)) {
              for (const finding of untaggedNumbers(text)) {
                const digits = finding.numbers.map((n) => `"${n}"`).join(', ')
                note('untagged-number', `${where}: ${place} holds the digits ${digits} in "${finding.sentence}": a number is a tagged num part (A§4.4)`)
              }
            }
            const right = gen.grade(first, keyResponse(first))
            if (!right.ok || right.score !== 1) note('grade-key', `${where}, seed ${seed}: the key is graded ${right.ok ? 'right but not 1' : 'wrong'}`)
            for (const wrong of wrongResponses(first)) {
              const graded = gen.grade(first, wrong)
              if (graded.ok || graded.score !== 0) note('grade-wrong', `${where}, seed ${seed}: ${JSON.stringify(wrong)} is graded right`)
            }
            const steps = gen.solution(first)
            if (steps.length === 0) note('solution-empty', `${where}, seed ${seed}: the solution has no steps`)
            if (JSON.stringify(gen.solution(first)) !== JSON.stringify(steps)) note('non-deterministic', `${where}, seed ${seed}: solution gave different steps on two calls`)
            if (first.answer.kind === 'numeric') {
              const last = [...steps].reverse().find((step) => step.result !== undefined)?.result
              if (last !== undefined && last.unit === first.answer.unit && Math.abs(last.value - first.answer.truth) > 1e-9 * Math.max(1, Math.abs(first.answer.truth))) {
                note('solution-key', `${where}, seed ${seed}: the solution ends in ${plain([last])}, and the key is ${keyText(first)}`)
              }
            }
          })
        } catch (caught) {
          note('grade-throws', `${where}, seed ${seed}: grading or the solution throws: ${message(caught)}`)
        }
      }
    }
  }
  return [...found.values()]
}

/** The family's own shape: an id, a version, a title, KCs, and variants that cover them. */
export function checkShape(gen: Gen, file: string): Diagnostic[] {
  const out: Diagnostic[] = []
  const bad = (code: string, text: string): void => void out.push(at(file, `${String(gen.id)}: ${text}`, code))
  if (typeof gen.id !== 'string' || !FAMILY_ID.test(gen.id)) bad('family-id', `the id must be a module and words joined by hyphens, such as tr2.bubble-width`)
  if (!Number.isInteger(gen.version) || gen.version < 1) bad('family-version', 'the version must be a whole number from 1')
  if (typeof gen.title !== 'string' || gen.title.trim() === '') bad('family-title', 'the title is empty')
  for (const method of ['make', 'band', 'grade', 'solution'] as const) {
    if (typeof gen[method] !== 'function') bad('family-method', `${method} is not a function (Gen needs make, band, grade and solution)`)
  }
  if (!Array.isArray(gen.variants) || gen.variants.length === 0) bad('family-variants', 'the family has no variants')
  else {
    const ids = new Set<string>()
    const covered = new Set<string>()
    for (const variant of gen.variants) {
      if (typeof variant.id !== 'string' || !SLUG.test(variant.id)) bad('family-variants', `variant id "${String(variant.id)}" is not a slug`)
      if (ids.has(variant.id)) bad('family-variants', `variant "${variant.id}" appears twice`)
      ids.add(variant.id)
      if (!Array.isArray(variant.kcs) || variant.kcs.length === 0) bad('family-variants', `variant "${variant.id}" names no KC`)
      else for (const kc of variant.kcs) covered.add(kc)
      if (!Array.isArray(variant.levels) || variant.levels.length === 0 || !variant.levels.every((level) => (LEVELS as readonly number[]).includes(level))) {
        bad('family-variants', `variant "${variant.id}" must list levels from 0 to 3`)
      }
    }
    for (const kc of gen.kcs) if (!covered.has(kc)) bad('family-kcs', `the KC ${kc} is listed, and no variant assesses it`)
    for (const kc of covered) if (!gen.kcs.includes(kc)) bad('family-kcs', `a variant assesses ${kc}, and the family's kcs do not list it`)
  }
  if (!Array.isArray(gen.kcs) || gen.kcs.length === 0) bad('family-kcs', 'the family names no KC')
  return out
}

export interface BandRow {
  level: Level
  accepted: number
  tried: number
  rate: number
}

/** The band: its acceptance at each level, and `drawInBand` returning seeds that are in band. */
export function checkBand(gen: Gen, file: string): { diagnostics: Diagnostic[]; rows: BandRow[] } {
  const diagnostics: Diagnostic[] = []
  const rows: BandRow[] = []
  for (const level of levelsOf(gen)) {
    try {
      const acceptance = withoutEntropy(() => bandAcceptance(gen, level))
      rows.push({ level, ...acceptance })
      if (acceptance.rate < BAND_FLOOR) {
        diagnostics.push(
          at(file, `${gen.id}: the band accepts ${(acceptance.rate * 100).toFixed(1)}% of ${acceptance.tried} candidates at level ${level}, under the floor of ${BAND_FLOOR * 100}% [estimated] (ASSESSMENT §4.1): loosen it, or draw the answer first`, 'band-floor'),
        )
      }
      for (const entropy of fixedSeeds(DRAW_PROBES, 0xd7a0 + level)) {
        const draw = withoutEntropy(() => drawInBand(gen, level, entropy))
        if (!withoutEntropy(() => gen.band(draw.seed, level))) {
          diagnostics.push(at(file, `${gen.id}: drawInBand returned seed ${draw.seed} at level ${level}, which the band refuses`, 'out-of-band'))
          break
        }
        if (draw.tries > MAX_DRAWS) break
      }
    } catch (caught) {
      diagnostics.push(at(file, `${gen.id}: the band throws at level ${level}: ${message(caught)}`, 'band-throws'))
    }
  }
  return { diagnostics, rows }
}

/** The blind-strategy bound at each level (blind.ts), measured on fixed banded seeds. */
export function checkBlind(gen: Gen, file: string): { diagnostics: Diagnostic[]; reports: BlindReport[] } {
  const diagnostics: Diagnostic[] = []
  const reports: BlindReport[] = []
  for (const level of levelsOf(gen)) {
    try {
      const seeds = withoutEntropy(() => bandedSeeds(gen, level))
      if (seeds.length < MIN_BANDED) {
        diagnostics.push(at(file, `${gen.id}: only ${seeds.length} banded seeds were found at level ${level}, and a blind strategy cannot be measured on fewer than ${MIN_BANDED} [estimated]: the band is too tight`, 'blind-sample'))
        continue
      }
      const report = withoutEntropy(() => measureBlind(gen, level, seeds))
      reports.push(report)
      for (const row of report.over) {
        diagnostics.push(
          at(
            file,
            `${gen.id}: at level ${level}, ${row.variant}: ${row.describe} passes ${(row.rate * 100).toFixed(1)}% of ${row.n} single seeds, over the bound of ${(row.bound * 100).toFixed(1)}% [estimated] (ASSESSMENT §4.1): make the key depend on the scene`,
            'blind-strategy',
          ),
        )
      }
    } catch (caught) {
      diagnostics.push(at(file, `${gen.id}: the blind-strategy measure throws at level ${level}: ${message(caught)}`, 'blind-throws'))
    }
  }
  return { diagnostics, reports }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Golden vectors                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface VectorCase {
  seed: number
  level: Level
  variant: string
  rev: string
  /** The SHA-256 of the item's canonical JSON: what the nightly cross-browser run compares (A§5.10). */
  sha256: string
}

export interface VectorFile {
  schema: string
  families: Record<string, { version: number; cases: VectorCase[] }>
}

/** The seeds the vectors are taken at, per level, in order. They never change. */
export const VECTOR_SEEDS: readonly number[] = [0, 1, 2, 3, 0x9e3779b9, 0xffffffff]

/** One family's vectors: its items at the fixed seeds, at every level it offers. */
export function vectorsOf(gen: Gen): { version: number; cases: VectorCase[] } {
  const cases: VectorCase[] = []
  for (const level of levelsOf(gen)) {
    for (const seed of VECTOR_SEEDS) {
      const item = withoutEntropy(() => gen.make(seed, level))
      cases.push({ seed, level, variant: item.variant, rev: item.rev, sha256: sha256(canonicalJson(item)) })
    }
  }
  return { version: gen.version, cases }
}

export function renderVectors(families: readonly Gen[]): string {
  const body: VectorFile = { schema: VECTORS_SCHEMA, families: {} }
  for (const gen of [...families].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) body.families[gen.id] = vectorsOf(gen)
  return `${JSON.stringify(body, null, 2)}\n`
}

/** The family's vectors against the committed ones. */
export function checkVectors(gen: Gen, committed: VectorFile | null, file: string): Diagnostic[] {
  const rewrite = 'rewrite them with `bun scripts/verify-items.ts --write` and review the diff'
  if (committed === null) return [at(VECTORS_FILE, `${gen.id}: ${VECTORS_FILE} is missing: ${rewrite}`, 'vectors-missing')]
  const pinned = committed.families[gen.id]
  if (pinned === undefined) return [at(VECTORS_FILE, `${gen.id}: no golden vectors for the family: ${rewrite}`, 'vectors-missing')]
  const now = vectorsOf(gen)
  const out: Diagnostic[] = []
  if (pinned.version !== now.version) {
    out.push(at(file, `${gen.id}: version is ${now.version}, and the golden vectors are of version ${pinned.version}: ${rewrite}`, 'vectors-version'))
  }
  const moved = now.cases.filter((made, index) => {
    const before = pinned.cases[index]
    return before === undefined || before.seed !== made.seed || before.level !== made.level || before.sha256 !== made.sha256
  })
  if (moved.length > 0 || pinned.cases.length !== now.cases.length) {
    const first = moved[0]
    out.push(
      at(
        file,
        `${gen.id}: ${moved.length} of ${now.cases.length} golden vectors moved${first === undefined ? '' : ` (first: seed ${first.seed}, level ${first.level})`}: a change that moves what a seed means needs the family's version bumped, and then ${rewrite}`,
        'vectors-moved',
      ),
    )
  }
  return out
}

/** Reads the committed vectors, or null when there are none. */
export function readVectors(root: string): { file: VectorFile | null; diagnostics: Diagnostic[] } {
  const full = path.join(root, VECTORS_FILE)
  if (!existsSync(full)) return { file: null, diagnostics: [] }
  try {
    const parsed: unknown = JSON.parse(readFileSync(full, 'utf8'))
    if (!isRecord(parsed) || parsed.schema !== VECTORS_SCHEMA || !isRecord(parsed.families)) {
      return { file: null, diagnostics: [at(VECTORS_FILE, `is not an ${VECTORS_SCHEMA} file`, 'vectors-file')] }
    }
    return { file: parsed as unknown as VectorFile, diagnostics: [] }
  } catch (caught) {
    return { file: null, diagnostics: [at(VECTORS_FILE, `cannot be read: ${message(caught)}`, 'vectors-file')] }
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Leaks                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The sentences of the solutions and the whys of a family, at fixed seeds: what must never appear in the export. */
export function leakSentences(gen: Gen): Map<string, string> {
  const found = new Map<string, string>()
  const keep = (text: string, what: string): void => {
    if (text.length >= LEAK_MIN_CHARS && !found.has(text)) found.set(text, what)
  }
  for (const level of levelsOf(gen)) {
    for (const spec of offeredAt(gen, level)) {
      for (const seed of fixedSeeds(LEAK_SEEDS, 0x1ea4 + level)) {
        const item = withoutEntropy(() => gen.make(seed, level, spec.id))
        for (const step of gen.solution(item)) keep(plain(step.text), `a solution step of ${spec.id}`)
        if (item.answer.kind === 'choice') for (const option of item.answer.options) keep(plain(option.why), `the why of an option of ${spec.id}`)
      }
    }
  }
  return found
}

/** Where a text holds a sentence of a solution or a why. */
export function leaksIn(outputs: readonly { path: string; text: string }[], sentences: ReadonlyMap<string, string>): { file: string; sentence: string; what: string }[] {
  const exported = outputs.filter((output) => output.path.startsWith('public/md/') || output.path === 'public/llms.txt' || output.path.startsWith('src/content/generated/'))
  const out: { file: string; sentence: string; what: string }[] = []
  for (const output of exported) {
    // The export wraps and tags prose, so a sentence is looked for with its spaces made one, as it would be read.
    const text = output.text.replace(/\s+/g, ' ')
    for (const [sentence, what] of sentences) if (text.includes(sentence.replace(/\s+/g, ' '))) out.push({ file: output.path, sentence, what })
  }
  return out
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The whole gate                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface FamilyReport {
  id: string
  version: number
  variants: string[]
  levels: Level[]
  band: BandRow[]
  blind: BlindReport[]
}

export interface ItemsResult {
  diagnostics: Diagnostic[]
  families: FamilyReport[]
  /** Anything to say that is not a problem: the export was not read, for one. */
  notes: string[]
}

/** The whole gate over a tree. */
export async function checkTree(root: string): Promise<ItemsResult> {
  const loaded = await loadFamilies(root)
  const diagnostics: Diagnostic[] = [...loaded.diagnostics]
  const notes: string[] = []
  const reports: FamilyReport[] = []

  // The source of the folder is linted whole: a family may draw from a helper that is not itself a family.
  for (const file of loaded.files) {
    for (const finding of lintSource(file, readFileSync(path.join(root, file), 'utf8'))) {
      diagnostics.push(at(file, `${finding.message} (A§5.1: a family draws only from its seed)`, 'nondeterministic-api', finding.line))
    }
  }

  const ids = new Map<string, string>()
  const vectors = readVectors(root)
  diagnostics.push(...vectors.diagnostics)
  for (const { gen, file } of loaded.families) {
    if (typeof gen.id === 'string' && ids.has(gen.id)) diagnostics.push(at(file, `${gen.id}: this id is the family of ${ids.get(gen.id)} too`, 'family-id'))
    ids.set(String(gen.id), file)
    const shape = checkShape(gen, file)
    diagnostics.push(...shape)
    if (shape.length > 0) continue
    const single = checkItems(gen, file)
    diagnostics.push(...single.slice(0, REPORT_CAP))
    if (single.length > REPORT_CAP) diagnostics.push(at(file, `${gen.id}: ${single.length - REPORT_CAP} more problems on single items were left out`, 'item-shape'))
    // A family whose items cannot be made cannot be measured.
    if (single.some((d) => d.code === 'make-throws' || d.code === 'non-deterministic')) continue
    const band = checkBand(gen, file)
    diagnostics.push(...band.diagnostics)
    const blind = checkBlind(gen, file)
    diagnostics.push(...blind.diagnostics)
    if (vectors.diagnostics.length === 0) diagnostics.push(...checkVectors(gen, vectors.file, file))
    reports.push({ id: gen.id, version: gen.version, variants: gen.variants.map((variant) => variant.id), levels: levelsOf(gen), band: band.rows, blind: blind.reports })
  }

  // The export holds no key and no solution.
  if (loaded.families.length > 0 && existsSync(path.join(root, 'content/course.yaml'))) {
    const compiled = compileContent({ root })
    if (compiled.diagnostics.some((d) => d.severity === 'error')) {
      notes.push('the content has errors, so the export was not read for leaks: run verify:content')
    } else {
      const sentences = new Map<string, string>()
      for (const { gen } of loaded.families) for (const [sentence, what] of leakSentences(gen)) if (!sentences.has(sentence)) sentences.set(sentence, `${what} of ${gen.id}`)
      for (const leak of leaksIn(compiled.outputs, sentences)) {
        diagnostics.push(at(leak.file, `holds "${leak.sentence.slice(0, 80)}${leak.sentence.length > 80 ? '…' : ''}", ${leak.what}: the export, the index and the compiled lessons hold no key and no solution (A§4.6)`, 'leak'))
      }
    }
  } else if (loaded.families.length > 0) notes.push('there is no content/ in this tree, so the export was not read for leaks')
  return { diagnostics, families: reports, notes }
}

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`
const percent = (rate: number): string => `${(rate * 100).toFixed(1)}%`

/** The lines of the report, for a person. */
export function summaryLines(result: ItemsResult): string[] {
  const lines: string[] = []
  for (const family of result.families) {
    lines.push(`${family.id} v${family.version}: ${plural(family.variants.length, 'variant')} (${family.variants.join(', ')}), levels ${family.levels.join(' ')}`)
    for (const level of family.levels) {
      const band = family.band.find((row) => row.level === level)
      const blind = family.blind.find((row) => row.level === level)
      const worst = blind?.best.reduce((a, b) => (b.rate - b.bound > a.rate - a.bound ? b : a))
      lines.push(
        `  level ${level}: band ${band === undefined ? 'n/a' : `${percent(band.rate)} of ${band.tried}`}, ${blind === undefined ? 'blind n/a' : `${blind.samples} banded seeds, best blind strategy ${worst === undefined ? 'n/a' : `${percent(worst.rate)} of a bound of ${percent(worst.bound)} (${worst.variant}: ${worst.strategy})`}`}`,
      )
    }
  }
  for (const note of result.notes) lines.push(`note: ${note}`)
  return lines
}

export async function main(argv: readonly string[]): Promise<number> {
  let root = path.resolve(import.meta.dirname, '..')
  let write = false
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root' && argv[i + 1] !== undefined) {
      root = path.resolve(argv[i + 1])
      i += 1
    } else if (argv[i] === '--write') write = true
    else {
      console.error('usage: bun scripts/verify-items.ts [--root <dir>] [--write]')
      return 2
    }
  }
  if (write) {
    const loaded = await loadFamilies(root)
    for (const diagnostic of loaded.diagnostics) console.log(formatDiagnostic(diagnostic))
    if (loaded.diagnostics.length > 0) return 1
    const file = path.join(root, VECTORS_FILE)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, renderVectors(loaded.families.map((entry) => entry.gen)))
    console.log(`verify:items: wrote ${VECTORS_FILE} for ${plural(loaded.families.length, 'family')}`)
    return 0
  }
  const result = await checkTree(root)
  const order = [...result.diagnostics].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line))
  for (const diagnostic of order) console.log(formatDiagnostic(diagnostic))
  for (const line of summaryLines(result)) console.log(line)
  const errors = order.filter((diagnostic) => diagnostic.severity === 'error')
  if (errors.length > 0) {
    const files = new Set(errors.map((diagnostic) => diagnostic.file)).size
    console.log(`verify:items failed: ${plural(errors.length, 'error')} in ${plural(files, 'file')}`)
    return 1
  }
  const variants = result.families.reduce((sum, family) => sum + family.variants.length, 0)
  console.log(`verify:items passed: ${plural(result.families.length, 'family')}, ${plural(variants, 'variant')}; each measured on ${BLIND_SAMPLE} banded seeds per level [estimated]`)
  return 0
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2))
