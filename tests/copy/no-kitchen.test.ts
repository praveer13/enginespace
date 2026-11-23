/*
 * R-T04: the copy guard (REDESIGN §2.7, D-063). The engine's term is the only name of anything a learner reads, so no word the brief bans
 * everywhere, and no phrase it bans in the kitchen sense, may reach a learner. src/copy/banned.ts holds the two lists and the matcher; this
 * file runs it over what a learner reads, area by area:
 *
 *   - the games' copy tables, the roster and the registry's records (titles, subtitles, role lines, level titles, keys), and the terms;
 *   - the compiled lessons and modules, the Markdown export and llms.txt, compiled in memory from content/ as the build compiles them;
 *   - the model cards and the claims' sentences;
 *   - every item family's stem, givens, options, reasons and worked steps, over the seed count of tests/seeds.ts at every level;
 *   - the predictions' sentences: why a reveal waits, and what a reading read;
 *   - the labs: each lab's title and lead, each check's label and the bug it catches, and the prose of the crates (the doc comments, the comments
 *     and the Markdown of labs/forge, and what the bestiary says of each mistake).
 *
 * It reads rendered and compiled text, never a raw source file: a JSON node is read only through the keys that render (a text node, a
 * title, an alt), and a code node or a code span is skipped, so an id or an enum value inside state (`plate`) never trips it.
 *
 * An area not yet converted has a file in tests/copy/allow/, named for the area, that names the wave R task that deletes it. Its findings
 * are counted and allowed; any finding in an area without a file fails. A file whose area this guard reads and finds clean fails too, so
 * the task that clears an area deletes its file. The rendered routes (the games' views, the pages) are the e2e scan's, and their areas'
 * files stand for it until it runs.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { GAMES } from '@es/play'
import { FAMILIES, LEVELS, offeredAt } from '@es/play/items'
import type { Item, Rich } from '@es/play/items'
import { BENCH_COPY } from '@es/play/broken-bench/copy'
import { FLOOR_COPY } from '@es/play/engine-floor/copy'
import { LOOP_COPY } from '@es/play/loop/copy'
import { FULL_COPY, MASK_CHOICES, MODE_CHOICES } from '@es/play/loop/full/copy'
import { POOL_COPY } from '@es/play/pool/copy'
import { copyOf as shiftCopy, momentLine as shiftMoment, SHIFT_PARTS } from '@es/play/shape-shifter/copy'
import { buildLevel as shiftLevel } from '@es/play/shape-shifter/levels'
import { shiftSession } from '@es/play/shape-shifter/session'
import type { ShiftAction } from '@es/play/shape-shifter/types'
import type { ShiftOp } from '@es/sim/tensor'
import { isHeld, NO_BLOCK, PLAN, UNLISTED } from '@es/play/predictions/plan'
import { COMMITS as TR1_COMMITS } from '@es/play/predictions/commit-tr1'
import { COMMITS as TR2_COMMITS } from '@es/play/predictions/commit-tr2'
import { COMMITS as TR5A_COMMITS } from '@es/play/predictions/commit-tr5a'
import { COMMITS as TR6_COMMITS } from '@es/play/predictions/commit-tr6'
import { COMMITS as TR8_COMMITS } from '@es/play/predictions/commit-tr8'
import { REFERENCES as TR1_READINGS } from '@es/play/predictions/tr1'
import { REFERENCES as TR2_READINGS } from '@es/play/predictions/tr2'
import { REFERENCES as TR5A_READINGS } from '@es/play/predictions/tr5a'
import { ROSTER } from '@es/play/roster'
import { FORGE_LABS } from '@/forge/labs'
import { VERIFIER_COPY } from '@es/play/verifier/copy'
import { BANNED_PHRASES, BANNED_WORDS, findBanned, isClean, stripCode } from '@/copy/banned'
import { PRODUCT_WORDS, PROVENANCE_WORDS, STATE_WORDS, TERMS, VERDICT_WORDS } from '@/copy/terms'
import ts from 'typescript'
import { compileContent } from '../../scripts/content/build.ts'
import { BUILD_LOG } from '../../scripts/content/pacing.ts'
import { read, root } from '../ci/support'
import { seeds } from '../seeds'

/* ------------------------------------------------------------------------------------------------------------------ */
/* The guard on its own fixtures                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the guard, on its own fixtures', () => {
  test("fails on the kitchen's phrases: 'the pass', 'table A' and 'each course takes'", () => {
    for (const text of ['Hand it to the pass.', 'table A · turn 1 of 3', 'each course takes a step', 'The Pass', 'Conversation from Table B']) {
      expect([text, isClean(text)]).toEqual([text, false])
    }
    expect(findBanned('each course takes a step').map((f) => f.rule)).toEqual(['each course'])
    expect(findBanned('Hand it to the pass.').map((f) => f.rule)).toEqual(['the pass'])
  })

  test("passes on the words that stay allowed: 'Passed', 'sliding window', 'State as a table', 'block table' and 'the course'", () => {
    for (const text of ['Passed', 'sliding window', 'State as a table', 'block table', 'the course', 'the forward pass', 'the pass rule', 'a noise floor', 'in eviction order', 'a core dump', 'a latency spike', 'Course', 'the table below']) {
      expect([text, findBanned(text)]).toEqual([text, []])
    }
  })

  test('skips code spans and fenced code, and reads whole words in any case', () => {
    expect(isClean('the state holds `plate` and `Rotation`')).toBe(true)
    expect(isClean('```\nplate = rail.fire()\n```\nThe step ran.')).toBe(true)
    expect(isClean('a plate')).toBe(false)
    expect(isClean('A PLATE')).toBe(false)
    expect(isClean('dish-by-dish')).toBe(false)
    expect(isClean('template, parallel, firewall, expose, compare, ticketing')).toBe(true)
    expect(stripCode('a `plate` b')).toBe('a         b')
  })

  test('has the brief\'s two lists, each entry once', () => {
    const brief = read('docs/REDESIGN.md')
    const words = /- \*\*Words banned everywhere\*\* \(whole word, any case\): ([^\n]*)\./.exec(brief)?.[1].split(', ') ?? []
    expect([...BANNED_WORDS]).toEqual(words)
    const rows = between(brief, '- **Phrases banned in the kitchen sense**', 'The guard cannot catch')
      .split('\n')
      .filter((line) => line.startsWith('| "'))
    expect(rows.length).toBe(BANNED_PHRASES.length)
    rows.forEach((row, index) => {
      const quoted = [...row.split('|')[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
      expect(BANNED_PHRASES[index].banned.map((p) => p.text)).toEqual(quoted)
      // Every banned phrase of the brief fails, and every allowed context of its row passes.
      for (const phrase of quoted) expect([phrase, isClean(phrase)]).toEqual([phrase, false])
      for (const context of BANNED_PHRASES[index].allowed) expect([context, isClean(context)]).toEqual([context, true])
    })
  })
})

function between(text: string, from: string, to: string): string {
  const start = text.indexOf(from)
  const end = text.indexOf(to, start)
  if (start < 0 || end < 0) throw new Error(`no "${from}" … "${to}"`)
  return text.slice(start, end)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* What a learner reads, by area                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/** One piece of text a learner reads: its area, where it comes from, and the words. */
interface Text {
  readonly area: string
  readonly where: string
  readonly text: string
}

/** The keys of a compiled node that render as text. Every other key is an id, a ref, a link, a tag or a number, and is not read. */
const RENDERED_KEYS = new Set(['text', 'title', 'alt', 'description', 'body', 'breaks', 'outcomes', 'prompt', 'unit', 'caption', 'label', 'question'])

/** The rendered strings of a compiled JSON value. A code node is skipped whole: it is an identifier, spelled as its source spells it. */
function renderedStrings(value: unknown, key = ''): string[] {
  if (typeof value === 'string') return RENDERED_KEYS.has(key) ? [value] : []
  if (Array.isArray(value)) return value.flatMap((item) => renderedStrings(item, key))
  if (value === null || typeof value !== 'object') return []
  const node = value as Record<string, unknown>
  if (node.type === 'code') return []
  return Object.entries(node).flatMap(([k, v]) => renderedStrings(v, k))
}

const MODULE_OF = (file: string): string | null => /^(?:src\/content\/generated\/(?:lessons|modules)\/|public\/md\/)(tr\d[ab]?|capstone)[./]/.exec(file)?.[1] ?? null

function compiledTexts(): Text[] {
  const compiled = compileContent({ root })
  const out: Text[] = []
  for (const output of compiled.outputs) {
    const file = output.path
    const module = MODULE_OF(file)
    if (file.endsWith('.md')) out.push({ area: module ?? 'course', where: file, text: output.text })
    else if (file === 'public/llms.txt') {
      for (const line of output.text.split('\n')) out.push({ area: /md\/(tr\d[ab]?|capstone)\//.exec(line)?.[1] ?? 'course', where: file, text: line })
    } else if (file === 'public/claims.json') {
      const claims = (JSON.parse(output.text) as { claims: { id: string; text: string }[] }).claims
      for (const claim of claims) out.push({ area: 'cards', where: `claim ${claim.id}`, text: claim.text })
    } else if (file.startsWith('src/content/generated/cards/')) out.push({ area: 'cards', where: file, text: renderedStrings(JSON.parse(output.text)).join('\n') })
    else if (file.endsWith('.json')) out.push({ area: module ?? 'course', where: file, text: renderedStrings(JSON.parse(output.text)).join('\n') })
  }
  return out
}

/** Every string of a copy table, with each prompt that is a function of its seed's draw called on both kinds of draw. */
function copyStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value === 'function') return [true, false].flatMap((mixed) => copyStrings((value as (draw: { support: string; mixed: boolean }) => unknown)({ support: 'ALWAYS', mixed })))
  if (Array.isArray(value)) return value.flatMap(copyStrings)
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(copyStrings)
  return []
}

function copyTexts(): Text[] {
  const tables = { loop: { ...LOOP_COPY, ...FULL_COPY, MODE_CHOICES, MASK_CHOICES }, pool: POOL_COPY, verifier: VERIFIER_COPY, 'engine-floor': FLOOR_COPY, 'broken-bench': BENCH_COPY }
  const out: Text[] = Object.entries(tables).map(([game, table]) => ({ area: 'copy', where: `${game}/copy.ts`, text: copyStrings(table).join('\n') }))
  out.push({ area: 'copy', where: 'shape-shifter/copy.ts', text: shiftWords().join('\n') })
  for (const entry of ROSTER) out.push({ area: 'copy', where: `roster ${entry.id}`, text: [entry.title, entry.subtitle, entry.role].join('\n') })
  for (const game of GAMES.games) {
    const words = [game.title, game.subtitle, ...game.levels.map((level) => level.title), ...game.keys.map((key) => key.description)]
    out.push({ area: 'copy', where: `registry ${game.id}`, text: words.join('\n') })
  }
  const terms = [
    ...TERMS.flatMap((term) => [term.term, term.definition]),
    ...PRODUCT_WORDS.flatMap((word) => [word.word, word.means]),
    ...Object.values(STATE_WORDS).flat().flatMap((word) => [word.word, word.means]),
    ...VERDICT_WORDS.flatMap((word) => [word.word, word.means]),
    ...PROVENANCE_WORDS.flatMap((word) => [word.word, word.means]),
  ]
  out.push({ area: 'copy', where: 'src/copy/terms.ts', text: terms.join('\n') })
  return out
}

/** Tensor views' words (not in the registry yet): each level's copy on three seeds, the parts, every moment's line and the debrief's sentences. */
function shiftWords(): string[] {
  const ids = ['views', 'stride-zero', 'three-d', 'fewest', 'grid'] as const
  const levels = ids.flatMap((id) => [0, 1000, 1001].map((seed) => shiftLevel(id, seed)))
  const words = levels.flatMap((level) => {
    const copy = shiftCopy(level)
    return [copy.title, ...Object.values(copy.goal), copy.prompt, copy.predict.ask, copy.predict.unit, copy.passRule ?? '', copy.practiceRule ?? '']
  })
  const parts = SHIFT_PARTS.flatMap((part) => [part.name, part.sentence])
  const grid = shiftLevel('grid', 0)
  const moments = [
    shiftMoment({ id: 'view-free', task: 0, turn: 0, op: 'transpose', before: [6, 1], after: [1, 6] }, shiftLevel('views', 30)),
    shiftMoment({ id: 'view-refused', task: 0, turn: 0, shape: [24] }, shiftLevel('views', 30)),
    shiftMoment({ id: 'view-refused', task: 0, turn: 0, shape: [24] }, shiftLevel('fewest', 1000)),
    shiftMoment({ id: 'copy', task: 0, turn: 0, op: 'contiguous', n: 24 }, shiftLevel('views', 30)),
    shiftMoment({ id: 'stride-zero', task: 0, turn: 0, rows: 4, m: 6 }, shiftLevel('stride-zero', 10)),
    shiftMoment({ id: 'wrong-order', task: 0, turn: 0, k: 8, n: 32 }, shiftLevel('three-d', 26)),
    shiftMoment({ id: 'masked', task: 0, turn: 0, index: [0, 0], lanes: 64, masked: 16 }, grid),
    shiftMoment({ id: 'uncovered', task: 0, turn: 0, n: 48, dim: 1, size: 20, block: 4, g: 5 }, grid),
    shiftMoment({ id: 'not-pow2', task: 0, turn: 0, x: 12 }, grid),
    shiftMoment({ id: 'too-many', task: 0, turn: 0, cap: 6, n: 240 }, grid),
  ]
  const debriefs = levels.map((level) => shiftSession.debrief(shiftSession.init(level), shiftSession.ghost(level)).sentence)
  // The sentences a run that went wrong is told: each lever of `grid`, a launch refused, a copy the reference never makes, a refused view.
  const launch = (...actions: ShiftAction[]) => actions.reduce(shiftSession.reduce, shiftSession.init(grid))
  const mistakes = [
    launch({ t: 'block', dim: 0, value: 16 }, { t: 'block', dim: 1, value: 32 }, { t: 'launch' }),
    launch({ t: 'block', dim: 0, value: 16 }, { t: 'block', dim: 1, value: 4 }, { t: 'grid', dim: 1, value: 4 }, { t: 'launch' }),
    launch({ t: 'block', dim: 0, value: 16 }, { t: 'block', dim: 1, value: 4 }, { t: 'grid', dim: 1, value: 6 }, { t: 'launch' }),
    launch({ t: 'block', dim: 0, value: 12 }, { t: 'launch' }),
    launch({ t: 'launch' }),
  ].map((run) => shiftSession.debrief(run, shiftSession.ghost(grid)).sentence)
  const three = shiftLevel('three-d', 26)
  const move = (...ops: ShiftOp[]) => ops.reduce((s, o) => shiftSession.reduce(s, { t: 'op', op: o }), shiftSession.init(three))
  const wasteful = move({ op: 'reshape', shape: [4, 2, 4] }, { op: 'permute', order: [0, 2, 1] }, { op: 'contiguous' }, { op: 'permute', order: [0, 2, 1] }, { op: 'permute', order: [1, 0, 2] }, { op: 'contiguous' })
  mistakes.push(shiftSession.debrief(wasteful, shiftSession.ghost(three)).sentence, shiftSession.debrief(move({ op: 'reshape', shape: [2, 4, 4] }), shiftSession.ghost(three)).sentence)
  return [...words, ...parts, ...moments, ...debriefs, ...mistakes]
}

/** The text of rich text: its words, without its numbers or its code. */
const richText = (parts: Rich): string => parts.map((part) => (part.t === 'text' ? part.text : ' ')).join('')

function itemWords(item: Item): string[] {
  const answer = item.answer
  return [
    richText(item.stem),
    ...item.givens.map((given) => given.label),
    ...item.worked.map((step) => richText(step.text)),
    answer.label,
    ...(answer.kind === 'numeric' ? [answer.unit] : answer.options.flatMap((option) => [richText(option.text), richText(option.why)])),
  ]
}

function itemTexts(): Text[] {
  const out: Text[] = []
  for (const gen of FAMILIES) {
    // A variant's title is printed on each line of a question set's tally (src/items/Attempt.tsx), as the family's is on its card.
    const words = new Set<string>([gen.title, ...gen.variants.map((variant) => variant.title)])
    for (const level of LEVELS) {
      if (offeredAt(gen, level).length === 0) continue
      for (const seed of seeds(1)) {
        const item = gen.make(seed, level)
        for (const w of itemWords(item)) words.add(w)
        for (const step of gen.solution(item)) words.add(richText(step.text))
      }
    }
    out.push({ area: 'items', where: `family ${gen.id}`, text: [...words].join('\n') })
  }
  return out
}

function predictionTexts(): Text[] {
  const whys = [...Object.entries(PLAN).flatMap(([id, plan]) => (isHeld(plan) ? [`${id}: ${plan.why}`] : [])), UNLISTED.why, NO_BLOCK.why]
  const reads = [TR1_READINGS, TR2_READINGS, TR5A_READINGS].flatMap((table) => Object.entries(table).map(([id, ref]) => `${id}: ${ref.reads}`))
  const working = [TR1_COMMITS, TR2_COMMITS, TR5A_COMMITS, TR6_COMMITS, TR8_COMMITS].flatMap((table) =>
    Object.entries(table).flatMap(([id, commit]) => [...commit.working, ...commit.sources.map((source) => source.text)].map((line) => `${id}: ${line}`)),
  )
  return [{ area: 'predictions', where: 'packages/play/predictions', text: [...whys, ...reads, ...working].join('\n') }]
}

/** The files under a folder, depth first, without a build's `target`. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)
    if (name === 'target') return []
    return statSync(file).isDirectory() ? filesUnder(file) : [file]
  })
}

/** What a Rust file says to a reader in prose: its doc comments and its comments. Code and string literals are the pinned source's spelling. */
function rustProse(source: string): string {
  const out: string[] = []
  for (const line of source.split('\n')) {
    const comment = /(?:^|\s)\/\/[/!]?\s?(.*)$/.exec(line)
    // A `//` inside a string literal (a URL) has no space before it, so only a comment of its own or one after code is read.
    if (comment !== null) out.push(comment[1])
  }
  return out.join('\n')
}

/** The string and template literals of a TypeScript source, with the line each starts on: the words a function can return or throw. */
function literalsOf(file: string): { line: number; text: string }[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const out: { line: number; text: string }[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      out.push({ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: node.text })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return out
}

/**
 * The text a component writes to a page: its JSX text, and every string or template literal that holds a space (a sentence; a literal with no
 * space is an id, a class or a route). A `className`, a `data-*` or an `import` is no text, and is not read.
 */
function componentWords(file: string, code: string = readFileSync(file, 'utf8')): { line: number; text: string }[] {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true)
  const out: { line: number; text: string }[] = []
  const at = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart()).line + 1
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(source)
      if (name === 'className' || name.startsWith('data-') || name === 'id' || name === 'key' || name === 'href' || name === 'to' || name === 'style') return
    }
    if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, ' ').trim()
      if (text !== '') out.push({ line: at(node), text })
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      if (/\s/.test(node.text.trim())) out.push({ line: at(node), text: node.text })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return out
}

/** The `.ts` and `.tsx` files of the components: the games and the front page. */
const componentFiles = (): string[] => ['src/games', 'src/front'].flatMap((dir) => filesUnder(path.join(root, dir)).filter((file) => /\.tsx?$/.test(file)))

/** The `.ts` files of a folder of the repository, one level or all the way down. */
const tsFilesUnder = (dir: string): string[] => filesUnder(path.join(root, dir)).filter((file) => file.endsWith('.ts'))

/**
 * Every string an oracle can return (packages/sim/forge): a check's label, the sentence of a verdict, a case's note, and a thrown message.
 * The oracles build these from literals, so the literals are read, each on its own: a template's fixed parts are read as the pieces they are.
 * An oracle's comments are not text a learner sees, and are not read.
 */
function oracleTexts(): Text[] {
  return tsFilesUnder('packages/sim/forge').map((file) => ({
    area: 'labs',
    where: `${path.relative(root, file)} (what the oracles return)`,
    text: literalsOf(file).map((literal) => literal.text).join('\n'),
  }))
}

function labTexts(): Text[] {
  const out: Text[] = oracleTexts()
  for (const lab of Object.values(FORGE_LABS)) {
    out.push({ area: 'labs', where: `lab ${lab.id}`, text: [lab.title, lab.lead, lab.editNote ?? ''].join('\n') })
    out.push({ area: 'labs', where: `checks of ${lab.id}`, text: lab.checks.flatMap((check) => [check.label, check.catches]).join('\n') })
  }
  const forge = path.join(root, 'labs/forge')
  for (const file of filesUnder(forge)) {
    const rel = path.relative(root, file)
    if (file.endsWith('.rs')) out.push({ area: 'labs', where: rel, text: rustProse(readFileSync(file, 'utf8')) })
    else if (file.endsWith('.md')) out.push({ area: 'labs', where: rel, text: readFileSync(file, 'utf8') })
    else if (file.endsWith('bestiary.json')) {
      const members = (JSON.parse(readFileSync(file, 'utf8')) as { members: { mistake: string }[] }).members
      out.push({ area: 'labs', where: rel, text: members.map((member) => member.mistake).join('\n') })
    }
  }
  return out
}

/** The packages whose strings reach a learner: a receipt's verdict reasons, a card's label, a host preset's note (D-063). */
const BUILD_LOG_FREE = ['packages/verify', 'packages/sim/host', 'packages/sim/steploop', 'packages/sim/forge']

/** Every literal of those packages that is a sentence: a literal with no space is an id (a table of stages and the tasks that planned them), not prose. */
function sentencesOf(dir: string): { where: string; text: string }[] {
  return tsFilesUnder(dir).flatMap((file) =>
    literalsOf(file)
      .filter((literal) => /\s/.test(literal.text))
      .map((literal) => ({ where: `${path.relative(root, file)}:${literal.line}`, text: literal.text })),
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The allow files                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

const ALLOW_DIR = path.join(root, 'tests/copy/allow')

interface Allow {
  readonly area: string
  readonly task: string
  readonly covers: string
}

/** The directory is gone once the last area is clean: git keeps no empty folder, so a missing one is an empty list. */
const allowFiles = (): string[] => (existsSync(ALLOW_DIR) ? readdirSync(ALLOW_DIR) : [])

const allows: Allow[] = allowFiles()
  .filter((file) => file.endsWith('.json'))
  .map((file) => ({ file, body: JSON.parse(readFileSync(path.join(ALLOW_DIR, file), 'utf8')) as Allow }))
  .map(({ file, body }) => {
    if (`${body.area}.json` !== file) throw new Error(`tests/copy/allow/${file} names the area "${body.area}"`)
    return body
  })

/** The areas this guard reads itself. Any other area's file stands for the e2e scan of rendered routes. */
const READ_AREAS = ['labs', 'copy', 'course', 'cards', 'items', 'predictions', 'tr0', 'tr1', 'tr2', 'tr3', 'tr4', 'tr5a', 'tr5b', 'tr6', 'tr7', 'tr8', 'capstone']

describe('the allow files', () => {
  test('are one JSON file per area, each naming a wave R task of the tracker that deletes it and what it covers', () => {
    expect(allowFiles().filter((file) => !file.endsWith('.json'))).toEqual([])
    const tracker = read('docs/TRACKER.md')
    for (const allow of allows) {
      expect([allow.area, /^R-T\d\d$/.test(allow.task), tracker.includes(`#### [ ] ${allow.task} · `)]).toEqual([allow.area, true, true])
      expect([allow.area, allow.covers.length > 20]).toEqual([allow.area, true])
    }
    // The copy tables, the roster, the registry and the terms are this task's own, and are clean: no file allows them.
    expect(allows.map((allow) => allow.area)).not.toContain('copy')
    expect(allows.map((allow) => allow.area)).not.toContain('course')
  })

  test('are all gone at the end of wave R: every area is clean, so tests/copy/allow/ holds no file (R-T50)', () => {
    expect(allowFiles()).toEqual([])
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The sweep                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('what a learner reads', () => {
  const texts = [...copyTexts(), ...compiledTexts(), ...itemTexts(), ...predictionTexts(), ...labTexts()]
  const findings = texts.flatMap((t) => findBanned(t.text).map((f) => ({ area: t.area, where: t.where, rule: f.rule, match: f.match })))
  const allowed = new Set(allows.map((allow) => allow.area))

  test('reads every area it names, with text in each', () => {
    const areas = new Set(texts.map((t) => t.area))
    for (const area of ['labs', 'copy', 'course', 'cards', 'items', 'predictions', 'tr1', 'tr2', 'tr5a', 'tr6', 'tr8']) expect([area, areas.has(area)]).toEqual([area, true])
    for (const area of areas) expect([area, READ_AREAS.includes(area)]).toEqual([area, true])
  })

  test('holds no banned word or phrase outside an area that a file in tests/copy/allow/ still allows', () => {
    const loose = findings.filter((f) => !allowed.has(f.area)).map((f) => `${f.area} · ${f.where}: "${f.match}" (${f.rule})`)
    expect([...new Set(loose)]).toEqual([])
  })

  test('has no allow file left for an area it reads and finds clean: the task that clears an area deletes its file', () => {
    const dirty = new Set(findings.map((f) => f.area))
    const stale = allows.filter((allow) => READ_AREAS.includes(allow.area) && !dirty.has(allow.area)).map((allow) => `tests/copy/allow/${allow.area}.json (${allow.task})`)
    expect(stale).toEqual([])
  })

  test('reads every string the oracles can return, and it fails on the sentences that the oracles had before wave R closed', () => {
    const read = oracleTexts().map((t) => t.text).join('\n')
    expect(read).toContain('the module answered')
    expect(findBanned(read)).toEqual([])
    // The sentences as they stood, from the three oracles that held kitchen words: each one is found by the same reader.
    for (const old of [
      'p is less than q, so p of the q coins keep the plate',
      'the first plate is sent back for sure, whatever follows it: a round never keeps a dish that p rules out',
      'The dish furthest from its share is token 5',
      '2000 touches on 3 pans, every reply and every order as the model has them',
      'the module did not start for the night',
    ]) {
      expect([old, isClean(old)]).toEqual([old, false])
    }
  })

  test('keeps the practice lab in the labels\' words: no "the rotation", "a rotation", "dumped", "the dump" or "dumps its" in a verdict, a label or the page, but the one gloss', () => {
    // The wire reply "miss dump 2" is the crate's protocol and stays: it has none of the three phrases. The page's gloss of the crate's name is
    // the single allowed sentence: "The crate calls the free queue the rotation".
    const LAB_WORDS = /(?<![\p{L}\p{N}])(?:the rotation|a rotation|a full rotation|dumped|dumps its|the dump)(?![\p{L}\p{N}])/giu
    const found = (text: string): string[] => text.replace(/calls the free queue the rotation/gi, '').match(LAB_WORDS) ?? []
    const pageTexts = Object.values(FORGE_LABS).flatMap((lab) => [lab.title, lab.lead, lab.editNote ?? '', ...lab.checks.flatMap((check) => [check.label, check.catches])])
    const read = [...oracleTexts().map((t) => t.text), ...pageTexts]
    expect(read.flatMap(found)).toEqual([])
    // The gloss is there once, and is the only use.
    expect(pageTexts.filter((text) => /calls the free queue the rotation/i.test(text))).toHaveLength(1)
    // The five sentences as they stood: each is found by the same reader.
    for (const old of [
      'a full rotation dumps its front',
      'the rotation stays full',
      'a dumped key is gone, so touching it again is a miss',
      'the front is dumped, and the rotation stays full',
      'the dump goes by the last touch, not by arrival',
    ]) {
      expect([old, found(old).length > 0]).toEqual([old, true])
    }
  })

  test('holds no kitchen word in the message of an error that the code throws or a session refuses with, in the app, the games and the sims', () => {
    // Such a message reaches no page today (a button is disabled before the action can be sent), but a test prints it, and the next page that
    // shows it must not have to find the words first. The list is the guard's own, and two forms it missed: "a rotation" and "dumped".
    const EXTRA = /(?<![\p{L}\p{N}])(?:a rotation|the rotation|dumped)(?![\p{L}\p{N}])/giu
    const found: string[] = []
    for (const dir of ['src', 'packages']) {
      for (const file of filesUnder(path.join(root, dir)).filter((name) => /\.tsx?$/.test(name))) {
        const code = readFileSync(file, 'utf8')
        if (!/throw new|need\(/.test(code)) continue
        const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true)
        const messages: ts.Expression[] = []
        const visit = (node: ts.Node): void => {
          if (ts.isNewExpression(node) && /Error$/.test(node.expression.getText(source)) && node.arguments?.[0] !== undefined) messages.push(node.arguments[0])
          if (ts.isCallExpression(node) && node.expression.getText(source) === 'need' && node.arguments[1] !== undefined) messages.push(node.arguments[1])
          ts.forEachChild(node, visit)
        }
        visit(source)
        for (const message of messages) {
          const text = message.getText(source)
          const hits = [...findBanned(text).map((f) => f.match), ...(text.match(EXTRA) ?? [])]
          if (hits.length > 0) found.push(`${path.relative(root, file)}:${source.getLineAndCharacterOfPosition(message.getStart()).line + 1}: ${hits.join(', ')}`)
        }
      }
    }
    expect(found).toEqual([])
    // The two forms it missed are found.
    for (const old of ['it cannot be dumped', 'a rotation holds 1 to 4096 keys']) expect([old, (old.match(EXTRA) ?? []).length > 0]).toEqual([old, true])
  })

  test('holds no variant title that a learner could read as the kitchen: the guard reads every family variant', () => {
    const titles = FAMILIES.flatMap((gen) => gen.variants.map((variant) => ({ where: `${gen.id}/${variant.id}`, title: variant.title })))
    expect(titles.length).toBeGreaterThan(60)
    expect(titles.filter((entry) => !isClean(entry.title))).toEqual([])
    expect(isClean('The padding a night wastes')).toBe(false)
  })

  test('has no build-log id in a sentence that a learner can reach from the verifier, the host card, the step loop or the oracles (D-063)', () => {
    const sentences = BUILD_LOG_FREE.flatMap(sentencesOf)
    expect(sentences.length).toBeGreaterThan(100)
    expect(sentences.filter((sentence) => BUILD_LOG.test(sentence.text) || /§\d/.test(sentence.text)).map((sentence) => `${sentence.where}: ${sentence.text}`)).toEqual([])
    for (const old of ['W2-T26 builds it', 'A token is single-use (D-027)', 'arrives with the kit (W2-T10)', "W2-T22 fits them to the owner's traces", 'the cost card (D-044, proposed)']) {
      expect([old, BUILD_LOG.test(old)]).toEqual([old, true])
    }
  })

  test('holds no banned word or phrase in the text of a component of src/games or src/front: its JSX text and its sentences, with no allowance', () => {
    const words = componentFiles().flatMap((file) => componentWords(file).map((literal) => ({ where: `${path.relative(root, file)}:${literal.line}`, text: literal.text })))
    expect(words.length).toBeGreaterThan(500)
    expect(words.flatMap((word) => findBanned(word.text).map((found) => `${word.where}: "${found.match}" (${found.rule}) in "${word.text.slice(0, 80)}"`))).toEqual([])
  })

  test('would have caught the page pool\'s 3D note: the sentence it had is read, and found', () => {
    const old = 'Nothing is on the line yet. Once a request is admitted, its block table shows as threads from its tile to its pages.'
    expect(findBanned(old).map((found) => found.rule)).toEqual(['on the line'])
    // The component's own line, as it stood, is read through the same reader and fails.
    const line = `export const Note = ({ n }: { n: number }) => <p>{n === 0 ? '${old}' : 'Select a request.'}</p>`
    const found = componentWords('Note.tsx', line).flatMap((word) => findBanned(word.text).map((hit) => hit.rule))
    expect(found).toEqual(['on the line'])
    expect(componentWords('Note.tsx', '<p>Nothing is on the line yet.</p>').flatMap((word) => findBanned(word.text).map((hit) => hit.rule))).toEqual(['on the line'])
  })

  test('is a sweep that would see a kitchen word in each kind of text, if one came back', () => {
    // Each kind of source is read through the same matcher, so a word planted in a copy of one fails where the real one passes.
    expect(isClean(copyStrings({ title: 'Fill the rail' }).join('\n'))).toBe(false)
    expect(isClean(renderedStrings({ type: 'paragraph', children: [{ type: 'text', text: 'The plate goes out.' }] }).join('\n'))).toBe(false)
    expect(isClean(renderedStrings({ type: 'paragraph', children: [{ type: 'code', text: 'plate' }] }).join('\n'))).toBe(true)
    expect(isClean(renderedStrings({ id: 'kitchen', kind: 'plate', title: 'A step' }).join('\n'))).toBe(true)
    expect(isClean(richText([{ t: 'text', text: 'the chef' }]))).toBe(false)
    expect(isClean(richText([{ t: 'code', code: 'chef' }]))).toBe(true)
  })
})
