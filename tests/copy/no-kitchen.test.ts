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
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { GAMES } from '@es/play'
import { FAMILIES, LEVELS, offeredAt } from '@es/play/items'
import type { Item, Rich } from '@es/play/items'
import { BENCH_COPY } from '@es/play/broken-bench/copy'
import { FLOOR_COPY } from '@es/play/engine-floor/copy'
import { LOOP_COPY } from '@es/play/loop/copy'
import { FULL_COPY, MASK_CHOICES, MODE_CHOICES } from '@es/play/loop/full/copy'
import { POOL_COPY } from '@es/play/pool/copy'
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
import { compileContent } from '../../scripts/content/build.ts'
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
    const words = new Set<string>([gen.title])
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

function labTexts(): Text[] {
  const out: Text[] = []
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

/* ------------------------------------------------------------------------------------------------------------------ */
/* The allow files                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

const ALLOW_DIR = path.join(root, 'tests/copy/allow')

interface Allow {
  readonly area: string
  readonly task: string
  readonly covers: string
}

const allows: Allow[] = readdirSync(ALLOW_DIR)
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
    expect(readdirSync(ALLOW_DIR).filter((file) => !file.endsWith('.json'))).toEqual([])
    const tracker = read('docs/TRACKER.md')
    for (const allow of allows) {
      expect([allow.area, /^R-T\d\d$/.test(allow.task), tracker.includes(`#### [ ] ${allow.task} · `)]).toEqual([allow.area, true, true])
      expect([allow.area, allow.covers.length > 20]).toEqual([allow.area, true])
    }
    // The copy tables, the roster, the registry and the terms are this task's own, and are clean: no file allows them.
    expect(allows.map((allow) => allow.area)).not.toContain('copy')
    expect(allows.map((allow) => allow.area)).not.toContain('course')
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
