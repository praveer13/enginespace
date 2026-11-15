/*
 * W1-T34: TR8's module and lessons (docs/TRACKER.md, "TR8 content"). The task's acceptance is the checks of W1-T15, and this file holds
 * each of them to the real content:
 *
 *   1. verify:content, verify:claims and verify:numbers pass: the module, its four lessons and its claims compile with no diagnostic.
 *   2. Every lesson has a prediction, a game or an item, and an exit check that names the knowledge components it tests.
 *   3. Reading minutes fall within 20% of the declared minutes.
 *   4. The module and its lessons are in review.
 *
 * Beyond those, three things TR8 owes the rest of the course:
 *
 *   - The GPU part is announced and never faked (D-039): a Build card on the module page, and no lab or trace in a lesson.
 *   - Every number a lesson prints from the simulator is recomputed here from `tests/content/tr8-demos.ts`, which runs the benchmark
 *     generator, so when the generator moves a number, this file names the lesson and the figure that went stale.
 *   - The claims TR8 adds (content/claims/tr8.yaml) are read at the pins, at a tag or a commit, with the lines of their quotes.
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement as h } from 'react'
import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { decodeEvent, stampEvent } from '@es/ledger'
import type { WriterContext } from '@es/ledger'
import { compiledLessonSchema, compiledModuleSchema } from '@es/schema'
import type { CompiledBlock, ProseFlow, ProseInline } from '@es/schema'
import { lockFileSchema } from '@es/schema/lock'
import { BROKEN_BENCH } from '../../packages/play/broken-bench/entry'
import Attempt from '@/items/Attempt'
import { ItemBlock } from '@/items/ItemBlock'
import { answerItem, fixedSeeds, isLevel, offeredAt, plain, regradeItem, resultOf, startAttempt } from '../../packages/play/items'
import { faceById } from '../../packages/play/items/catalog'
import { itemDraft } from '../../src/items/event'
import { drawForKc, familiesAt, familyFor, levelFor } from '../../src/items/today/draw'
import { appKcsOfRef } from '../../src/items/today/kcs'
import { TRANSFER_STABILITY_DAYS } from '../../src/items/today/limits'
import { familyById } from '../../packages/play/items/registry'
import { ADHERENCE_HARD_LIMIT_US, ADHERENCE_TOLERANCE_US } from '../../packages/sim/bench'
import { BENCH_WARMUP_ROWS } from '../../packages/sim/bench/broken'
import { CORPUS_SERVER } from '../../packages/sim/bench/broken-model'
import { compileContent, MINUTES_TOLERANCE } from '../../scripts/content/build.ts'
import {
  PREDICTIONS,
  RUSH,
  beyondP99,
  coverageDemo,
  freezeDemo,
  goodputDemo,
  p99Of,
  rushDemo,
  toyLog,
  warmDemo,
  widthDemo,
} from './tr8-demos.ts'
import { read, repo } from './support.ts'

const SLOW = 120_000

const LESSON_FILES = [
  'content/modules/tr8/lessons/l1-due-time-not-send-time.md',
  'content/modules/tr8/lessons/l2-warm-up-samples-and-an-interval.md',
  'content/modules/tr8/lessons/l3-the-tools-defaults-flag-by-flag.md',
  'content/modules/tr8/lessons/l4-replay-in-time-and-the-goodput-denominator.md',
] as const
const MODULE_FILE = 'content/modules/tr8/module.md'
const CLAIMS_FILE = 'content/claims/tr8.yaml'

const result = compileContent({ root: repo })
const lessons = LESSON_FILES.map((file) => {
  const slug = path.basename(file, '.md')
  const out = result.outputs.find((o) => o.path === `src/content/generated/lessons/tr8.${slug}.json`)
  if (out === undefined) throw new Error(`the compiler wrote no lesson for ${file}`)
  return { file, slug, text: read(file), lesson: compiledLessonSchema.parse(JSON.parse(out.text)) }
})
const moduleOut = result.outputs.find((o) => o.path === 'src/content/generated/modules/tr8.json')
if (moduleOut === undefined) throw new Error('the compiler wrote no module for tr8')
const module_ = compiledModuleSchema.parse(JSON.parse(moduleOut.text))
const moduleText = read(MODULE_FILE)

/* ------------------------------------------------------------------------------------------------------------------ */
/* Reading the compiled prose                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

function inlineText(nodes: readonly ProseInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'code':
          return node.text
        case 'em':
        case 'strong':
        case 'link':
          return inlineText(node.children)
        case 'claim':
          return `{{claim:${node.id}}}`
        case 'ks':
          return `{{${node.ref}}}`
        case 'tag':
          return `[${node.tag}]`
      }
    })
    .join('')
}

function codeSpans(nodes: readonly ProseInline[]): string[] {
  return nodes.flatMap((node) => {
    switch (node.type) {
      case 'code':
        return [node.text]
      case 'em':
      case 'strong':
      case 'link':
        return codeSpans(node.children)
      default:
        return []
    }
  })
}

/** The inline nodes of a flow node, for the kinds that hold a line of prose. */
function flowInlines(flow: ProseFlow): ProseInline[] {
  switch (flow.type) {
    case 'paragraph':
    case 'heading':
      return flow.children
    case 'list':
      return flow.items.flat().flatMap(flowInlines)
    case 'table':
      return [...flow.head.flat(), ...flow.rows.flat(2)]
    case 'code':
      return []
  }
}

/** The blocks of a lesson from its `## Exit check` heading to the end: the prose after the heading, then every block that follows. */
function exitCheck(blocks: readonly CompiledBlock[]): { prose: ProseFlow[]; blocks: CompiledBlock[] } | null {
  for (let at = 0; at < blocks.length; at++) {
    const block = blocks[at]
    if (block.type !== 'prose') continue
    const heading = block.body.findIndex((flow) => flow.type === 'heading' && flow.depth === 2 && inlineText(flow.children) === 'Exit check')
    if (heading < 0) continue
    return { prose: block.body.slice(heading + 1), blocks: blocks.slice(at + 1) }
  }
  return null
}

const lessonOf = (id: string) => {
  const found = lessons.find((l) => l.lesson.id === id)
  if (found === undefined) throw new Error(`no lesson ${id}`)
  return found
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The checks of W1-T15                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('check 1: TR8 compiles with no diagnostic of any kind', () => {
  test('the module, four lessons and the claims file are in the compiled course', () => {
    expect(module_.id).toBe('tr8')
    expect(lessons.map((l) => l.lesson.id)).toEqual(['tr8.l1', 'tr8.l2', 'tr8.l3', 'tr8.l4'])
    expect(result.claims.some((record) => record.file === CLAIMS_FILE)).toBe(true)
  })

  test('nothing in the module, its lessons or its claims is reported', () => {
    const mine = result.diagnostics.filter((d) => d.file.startsWith('content/modules/tr8/') || d.file === CLAIMS_FILE)
    expect(mine.map((d) => `${d.file}:${d.line} ${d.severity} ${d.code}`)).toEqual([])
  })
})

describe('check 2: every lesson has a prediction, a game or an item, and an exit check', () => {
  for (const { lesson } of lessons) {
    test(`${lesson.id}: a prediction`, () => {
      const predictions = lesson.blocks.filter((block) => block.type === 'predict')
      expect(predictions.length).toBeGreaterThanOrEqual(1)
      for (const block of predictions) {
        if (block.type !== 'predict') continue
        expect(block.id.startsWith(`${lesson.id}.`)).toBe(true)
        expect(block.reveal).toBe('after-game')
      }
    })

    test(`${lesson.id}: a game or an item, to play after the prediction`, () => {
      const firstPredict = lesson.blocks.findIndex((block) => block.type === 'predict')
      const playable = lesson.blocks.findIndex((block, at) => at > firstPredict && (block.type === 'game' || block.type === 'item'))
      expect(firstPredict).toBeGreaterThanOrEqual(0)
      expect(playable).toBeGreaterThan(firstPredict)
    })

    test(`${lesson.id}: an exit check that ends in a graded game or in items, and names the KCs it tests`, () => {
      const exit = exitCheck(lesson.blocks)
      expect(exit).not.toBeNull()
      if (exit === null) return
      const graded = exit.blocks.filter((block) => block.type === 'item' || (block.type === 'game' && block.mode === 'graded'))
      expect(graded.length).toBeGreaterThanOrEqual(1)
      // The exit check is the end of the lesson: nothing else follows it but the blocks it is made of.
      for (const block of exit.blocks) expect(['item', 'game']).toContain(block.type)
      const named = new Set(exit.prose.flatMap((flow) => flowInlines(flow).flatMap((node) => codeSpans([node]))))
      for (const kc of lesson.kcs) expect([lesson.id, kc, named.has(kc)]).toEqual([lesson.id, kc, true])
    })
  }
})

describe('check 3: reading minutes fall within 20% of the declared minutes', () => {
  for (const { lesson } of lessons) {
    test(`${lesson.id} says ${lesson.minutes} and the compiler reads ${lesson.readingMinutes}`, () => {
      expect(Math.abs(lesson.minutes - lesson.readingMinutes)).toBeLessThanOrEqual(MINUTES_TOLERANCE * lesson.minutes)
    })
  }

  test('the lessons add up to the module\'s browser hours, within 10%', () => {
    const minutes = lessons.reduce((sum, l) => sum + l.lesson.minutes, 0)
    const browserMinutes = (module_.hours_by_lane?.B ?? 0) * 60
    expect(Math.abs(minutes - browserMinutes)).toBeLessThanOrEqual(0.1 * browserMinutes)
  })
})

describe('check 4: the status is review', () => {
  test('the module and its lessons', () => {
    expect([module_.status, ...lessons.map((l) => l.lesson.status)]).toEqual(['review', 'review', 'review', 'review', 'review'])
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* What TR8 teaches                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('what the lessons teach', () => {
  const graph = readFileSync(path.join(repo, 'content/kc/graph.yaml'), 'utf8')
  const tr8Kcs = [...graph.matchAll(/^- id: (tr8\.[a-z0-9-]+)$/gm)].map((m) => m[1])

  test('every KC of TR8 is taught by a lesson, and no lesson teaches another module\'s', () => {
    const taught = new Set(lessons.flatMap((l) => l.lesson.kcs))
    expect(tr8Kcs.filter((kc) => !taught.has(kc))).toEqual([])
    expect([...taught].filter((kc) => !tr8Kcs.includes(kc))).toEqual([])
  })

  test('the lessons follow the curriculum: four lessons, in its order, with its titles', () => {
    expect(lessons.map((l) => l.lesson.title)).toEqual([
      'Due time, not send time: open loop, closed loop and coordinated omission',
      'Warm-up, sample size, and an interval on p99',
      "The tools' defaults, flag by flag: vllm bench serve and sglang.bench_serving",
      "Replay a trace in time, not just in shape, and name your goodput's denominator",
    ])
  })

  test('every game block names a level of the Inspection, and a graded block names a level that grades', () => {
    for (const { lesson } of lessons) {
      for (const block of lesson.blocks) {
        if (block.type !== 'game') continue
        expect([lesson.id, block.id]).toEqual([lesson.id, 'broken-bench'])
        const level = BROKEN_BENCH.levels.find((l) => l.id === block.level)
        expect([lesson.id, block.level, level !== undefined]).toEqual([lesson.id, block.level, true])
        if (block.mode === 'graded') expect(level?.graded).toBe(true)
      }
    }
  })

  test('a KC of a lesson is earned by the game of the module or assessed by a built item family of the lesson', () => {
    const earned = new Set(BROKEN_BENCH.kcs)
    for (const { lesson } of lessons) {
      const assessed = new Set(lesson.blocks.flatMap((block) => (block.type === 'item' ? (familyById(block.family)?.kcs ?? []) : [])))
      for (const kc of lesson.kcs) expect([lesson.id, kc, earned.has(kc) || assessed.has(kc)]).toEqual([lesson.id, kc, true])
    }
  })

  test('an item block names a built TR8 family, and a family assesses only KCs its lesson teaches', () => {
    const named = new Set<string>()
    for (const { lesson } of lessons) {
      for (const block of lesson.blocks) {
        if (block.type !== 'item') continue
        expect(block.family.startsWith('tr8.')).toBe(true)
        expect([block.level, block.count]).toEqual([2, block.count])
        named.add(block.family)
        const gen = familyById(block.family)
        expect([lesson.id, block.family, gen !== undefined]).toEqual([lesson.id, block.family, true])
        for (const kc of gen?.kcs ?? []) expect([lesson.id, block.family, lesson.kcs.includes(kc)]).toEqual([lesson.id, block.family, true])
      }
    }
    expect([...named].sort()).toEqual(['tr8.goodput-denominator', 'tr8.littles-law', 'tr8.which-flag'])
  })

  test('every item block draws its items: an attempt of the block\'s count at its level, from variants the family offers there', () => {
    let drawn = 0
    for (const { lesson } of lessons) {
      for (const block of lesson.blocks) {
        if (block.type !== 'item') continue
        const gen = familyById(block.family)
        if (gen === undefined || !isLevel(block.level)) throw new Error(`${lesson.id}: ${block.family} at level ${block.level} cannot be drawn`)
        const attempt = startAttempt(gen, block.level, fixedSeeds(block.count, 0x7a8))
        expect([lesson.id, block.family, attempt.served.length]).toEqual([lesson.id, block.family, block.count])
        for (const { item } of attempt.served) {
          expect(offeredAt(gen, block.level).map((variant) => variant.id)).toContain(item.variant)
          expect(item.kcs.every((kc) => lesson.kcs.includes(kc))).toBe(true)
        }
        drawn += block.count
      }
    }
    // Lesson 3's ticket is three items of one family, and lesson 4's is two of one and one of another.
    expect(drawn).toBe(6)
  })

  test('an exit ticket is three items on fresh seeds (ASSESSMENT §4.2)', () => {
    for (const { lesson } of lessons) {
      const items = exitCheck(lesson.blocks)?.blocks.flatMap((block) => (block.type === 'item' ? [block.count] : [])) ?? []
      if (items.length > 0) expect([lesson.id, items.reduce((a, b) => a + b, 0)]).toEqual([lesson.id, 3])
    }
  })
})

describe('the item blocks, as the lessons print them (W1b-T06)', () => {
  const render = (element: ReactElement): string => renderToString(h(StaticRouter, { location: '/m/tr8' }, element)).replaceAll('<!-- -->', '')
  const escaped = (value: string): string => value.replace(/'/g, '&#x27;')
  const blocks = lessons.flatMap(({ lesson }) => lesson.blocks.flatMap((block) => (block.type === 'item' ? [{ lesson, block }] : [])))

  test('there are three, and they are lesson 3\'s ticket and the two of lesson 4\'s', () => {
    expect(blocks.map(({ lesson, block }) => [lesson.id, block.family, block.level, block.count])).toEqual([
      ['tr8.l3', 'tr8.which-flag', 2, 3],
      ['tr8.l4', 'tr8.goodput-denominator', 2, 2],
      ['tr8.l4', 'tr8.littles-law', 2, 1],
    ])
  })

  for (const { lesson, block } of blocks) {
    const gen = familyById(block.family)
    const face = faceById(block.family)
    if (gen === undefined || face === undefined || !isLevel(block.level)) throw new Error(`${block.family} cannot be drawn`)
    const level = block.level

    test(`${lesson.id}, ${block.family}: the ticket waits with the family's title and KCs, and a stub that can be pulled, and not "Not built yet"`, () => {
      const html = render(h(ItemBlock, { block, scope: lesson.id }))
      expect(html).toContain('data-phase="idle"')
      expect(html).not.toContain('Not built yet')
      expect(html).toContain(`${block.count} ${block.count === 1 ? 'item' : 'items'} on fresh numbers, drawn when you start.`)
      expect(html).toContain(escaped(face.title))
      for (const kc of new Set(face.variants.flatMap((variant) => variant.kcs))) expect(html).toContain(kc)
      expect(html).toMatch(/<button type="button" class="es-stub__pull"(?![^>]*disabled)[^>]*>/)
      expect(html).toContain('Start items')
    })

    test(`${lesson.id}, ${block.family}: the first ticket of an attempt holds a seed and the question, and no key and no solution`, () => {
      for (const entropy of [[3, 4, 5], [100, 200, 300], [0x9e3779b9, 7, 0xffffffff]]) {
        const page = render(h(Attempt, { gen, level, entropy: entropy.slice(0, block.count), scope: lesson.id, onRestart: () => undefined }))
        const first = startAttempt(gen, level, entropy.slice(0, block.count)).served[0].item
        expect(page).toContain('data-phase="asking"')
        expect(page).toContain(`data-seed="${first.seed}"`)
        expect(page).toContain(`Item 1 of ${block.count}`)
        // The stem is drawn part by part: words as words, and code in a code element.
        for (const part of first.stem) {
          if (part.t === 'text') expect(page).toContain(escaped(part.text))
          if (part.t === 'code') expect(page).toContain(`<code>${escaped(part.code)}</code>`)
        }
        for (const given of first.givens) expect(page).toContain(escaped(given.label))
        for (const step of gen.solution(first)) {
          const sentence = plain(step.text.filter((part) => part.t === 'text'))
          for (const piece of sentence.split(/(?<=\.)\s/).filter((text) => text.length > 30)) expect(page).not.toContain(escaped(piece))
        }
        if (first.answer.kind === 'choice') for (const option of first.answer.options) expect(page).not.toContain(escaped(plain(option.why)))
        expect(page).not.toContain('data-ok')
        expect(page).not.toContain('es-item__reveal')
        expect(page).not.toContain('"truth"')
      }
    })

    test(`${lesson.id}, ${block.family}: an answer is an item event that the ledger's strict codec takes, with no key, and that grades again to what it recorded`, () => {
      const context: WriterContext = { clock: { nowIso: () => '2026-11-09T09:30:00.000Z', tzOffsetMinutes: () => 0 }, newId: () => 'ev-1', dev: 'dev-a1' }
      for (const entropy of fixedSeeds(24, 0x7b10 + block.count)) {
        const served = startAttempt(gen, level, [entropy]).served[0]
        // Once right and once wrong: the key as the item holds it, and an answer that is not the key.
        for (const right of [true, false]) {
          const answer = served.item.answer
          const response =
            answer.kind === 'choice'
              ? { kind: 'choice' as const, pick: right ? answer.correct : (answer.options.find((option) => option.id !== answer.correct)?.id ?? '') }
              : { kind: 'numeric' as const, value: right ? answer.truth : answer.truth + 10_000 }
          const answered = answerItem(gen, startAttempt(gen, level, [entropy]), 0, response)
          const event = stampEvent(context, itemDraft(resultOf(answered, 0)))
          if (event.kind !== 'item') throw new Error('an item event')
          expect(event.ref).toBe(`item:gen/${gen.id}/${served.item.variant}`)
          // It grades again from its seed and its answer alone, to the verdict it recorded, on the family as it is now.
          expect(regradeItem({ ref: event.ref, seed: event.seed, rev: event.rev, answer: event.data.answer })).toMatchObject({ valid: true, ok: right, stale: false })
          expect(decodeEvent(JSON.parse(JSON.stringify(event))).ok).toBe(true)
          expect(event).toMatchObject({ ok: right, provenance: 'unseen', seed: served.seed, rev: served.item.rev })
          const text = JSON.stringify(event)
          for (const forbidden of ['truth', 'solution', 'why']) expect(text).not.toContain(`"${forbidden}"`)
        }
      }
    })
  }
})

describe('what Today serves of TR8 (W1b-T06)', () => {
  // The four KCs that a TR8 family assesses: the lessons' exit tickets name three families, and `tr8.which-flag` assesses the cap's KC as well.
  const SERVED = ['tr8.goodput-denominator', 'tr8.littles-law', 'tr8.tool-defaults', 'tr8.client-queue'] as const

  test.each(SERVED)('%s is served at level 2 from the catalog by a TR8 family, and the family draws it on a fresh seed', (kc) => {
    const able = familiesAt(kc, 2)
    expect(able.length).toBeGreaterThan(0)
    expect(able.every((face) => face.id.startsWith('tr8.'))).toBe(true)
    for (const face of able) {
      const gen = familyById(face.id)
      if (gen === undefined) throw new Error(`${face.id} has a face and no family`)
      for (const entropy of fixedSeeds(20, 0x70da)) {
        const drawn = drawForKc(gen, kc, 2, entropy)
        expect(drawn.item.kcs).toContain(kc)
        expect(drawn.item.level).toBe(2)
      }
    }
  })

  test('an item event of a TR8 family is evidence for the KCs of its variant, which is how an answer earns a card and moves the map', () => {
    expect(appKcsOfRef('item:gen/tr8.which-flag/send-rate')).toEqual(['tr8.client-queue', 'tr8.tool-defaults'])
    expect(appKcsOfRef('item:gen/tr8.which-flag/at-fault-vllm')).toEqual(['tr8.tool-defaults'])
    expect(appKcsOfRef('item:gen/tr8.which-flag/default-does')).toEqual(['tr8.tool-defaults'])
    for (const variant of ['tool-prints', 'convert', 'which-clock']) expect(appKcsOfRef(`item:gen/tr8.goodput-denominator/${variant}`)).toEqual(['tr8.goodput-denominator'])
    for (const variant of ['in-flight', 'solve-for', 'check']) expect(appKcsOfRef(`item:gen/tr8.littles-law/${variant}`)).toEqual(['tr8.littles-law'])
    expect(appKcsOfRef('item:gen/tr8.which-flag/no-such-variant')).toEqual([])
  })

  test('serves a card of each of the four, at the level its memory asks for', () => {
    for (const kc of SERVED) {
      // A new memory is served on its own (level 2); a sturdy one is carried to a changed surface (level 3) where a family offers one.
      for (const stability of [1, TRANSFER_STABILITY_DAYS + 1]) {
        const card = { kc, memory: { stability, difficulty: 5 }, reps: 0 }
        const level = levelFor(card)
        expect(level === null ? null : isLevel(level)).toBe(true)
        if (level !== null) expect(familyFor(card, level)?.id.startsWith('tr8.')).toBe(true)
      }
    }
  })
})

describe('the GPU part is announced and never faked (D-039)', () => {
  test('the module page carries the Build card of tr8.replay with its three stages, lane F', () => {
    const labs = module_.blocks.filter((block) => block.type === 'lab')
    expect(labs).toEqual([{ type: 'lab', id: 'tr8.replay', lane: 'F', stages: ['s1', 's2', 's3'] }])
  })

  test('the module says that it arrives with the grader', () => {
    expect(moduleText).toContain('It arrives with the grader (W2, D-039)')
  })

  test('no lesson carries a lab or a trace, so none claims a GPU run or a real trace', () => {
    for (const { lesson } of lessons) expect([lesson.id, lesson.blocks.filter((b) => b.type === 'lab' || b.type === 'trace').length]).toEqual([lesson.id, 0])
  })

  test('the lessons are browser lessons: lane B', () => {
    for (const { lesson } of lessons) expect(lesson.lanes).toEqual(['B'])
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The claims TR8 adds                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

describe(`the claims of ${CLAIMS_FILE}`, () => {
  const lock = lockFileSchema.parse(JSON.parse(read('course.lock.json')))
  const entry = (key: string) => {
    const found = lock.entries.find((e) => e.key === key)
    if (found === undefined) throw new Error(`course.lock.json has no ${key}`)
    return found
  }
  const mine = result.claims.filter((record) => record.file === CLAIMS_FILE).map((record) => record.claim)

  /** The one ref a source of this kind may be read at: the pin's tag for an engine, a full commit for wrk2 and kernelspace, a release tag for BurstGPT. */
  const URL_RULES: readonly { readonly name: string; readonly pattern: RegExp }[] = [
    { name: 'vLLM at the pinned tag', pattern: new RegExp(`^https://github\\.com/vllm-project/vllm/blob/v${entry('vllm').version}/[^#]+#L\\d+(?:-L\\d+)?$`) },
    { name: 'SGLang at the pinned tag', pattern: new RegExp(`^https://github\\.com/sgl-project/sglang/blob/v${entry('sglang').version}/[^#]+#L\\d+(?:-L\\d+)?$`) },
    { name: 'wrk2 at a full commit', pattern: /^https:\/\/github\.com\/giltene\/wrk2\/blob\/[0-9a-f]{40}\/[^#]+#L\d+(?:-L\d+)?$/ },
    { name: 'kernelspace at its pinned commit', pattern: /^https:\/\/github\.com\/praveer13\/kernelspace\/blob\/d478f91[0-9a-f]{33}\/[^#]+#L\d+(?:-L\d+)?$/ },
    { name: 'BurstGPT at its v2.0 tag', pattern: /^https:\/\/github\.com\/HPMLL\/BurstGPT\/blob\/v2\.0\/[^#]+#L\d+(?:-L\d+)?$/ },
  ]

  test('are many, and every one is measured or derived', () => {
    expect(mine.length).toBeGreaterThanOrEqual(20)
    for (const claim of mine) expect(['measured', 'derived']).toContain(claim.tag)
  })

  test('begin their ids with their pin, or with bench when their source is not an engine\'s', () => {
    for (const claim of mine) {
      if (claim.pin !== undefined) expect([claim.id, claim.id.startsWith(`${claim.pin}.`)]).toEqual([claim.id, true])
      else expect([claim.id, claim.id.startsWith('bench.')]).toEqual([claim.id, true])
    }
  })

  test('a claim that names a pin names a key of the lockfile, and cites a file of that pin\'s tag, with the lines of its quote', () => {
    for (const claim of mine) {
      if (claim.source === undefined) continue
      if (claim.pin === undefined) {
        // Not an engine's: wrk2, kernelspace or BurstGPT, each at a commit or a tag that does not move.
        expect([claim.id, URL_RULES.slice(2).some((rule) => rule.pattern.test(claim.source?.url ?? ''))]).toEqual([claim.id, true])
        continue
      }
      expect(lock.entries.some((e) => e.key === claim.pin)).toBe(true)
      expect([claim.id, URL_RULES.slice(0, 2).some((rule) => rule.pattern.test(claim.source?.url ?? ''))]).toEqual([claim.id, true])
    }
  })

  test('never cite main, master, latest or stable', () => {
    for (const claim of mine) expect(claim.source?.url ?? '').not.toMatch(/\/(?:main|master|latest|stable|HEAD)(?:\/|#|$)/)
  })

  test('carry the day they were read, which is not after the day they were checked, and a TTL of a quarter at a pin or a year', () => {
    for (const claim of mine) {
      if (claim.source !== undefined) {
        expect([claim.id, /^\d{4}-\d{2}-\d{2}$/.test(claim.source.accessed)]).toEqual([claim.id, true])
        expect([claim.id, claim.source.accessed <= claim.verifiedAt]).toEqual([claim.id, true])
      }
      expect([claim.id, claim.ttlDays <= (claim.pin === undefined ? 365 : 90)]).toEqual([claim.id, true])
    }
  })

  test('quote the source in its own words, which are not blank, not long and not markup, and say what they claim in a sentence', () => {
    for (const claim of mine) {
      if (claim.source === undefined) continue
      expect([claim.id, claim.source.quote.trim().length > 8]).toEqual([claim.id, true])
      expect([claim.id, claim.source.quote.length <= 260]).toEqual([claim.id, true])
      expect([claim.id, /[.]\s*$/.test(claim.text)]).toEqual([claim.id, true])
      expect(claim.source.title.trim().length).toBeGreaterThan(8)
    }
  })

  test('a derived claim carries its formula and no source; a figure of someone else\'s own run says the course has not reproduced it', () => {
    for (const claim of mine) {
      if (claim.tag === 'derived') {
        expect([claim.id, claim.derived !== undefined]).toEqual([claim.id, true])
        expect(claim.source).toBeUndefined()
      }
      if (claim.id.startsWith('bench.wrk2.stall-')) expect([claim.id, /not reproduced/.test(claim.text)]).toEqual([claim.id, true])
    }
  })

  test('every claim of the file is read: cited by a lesson, the module or the bench card, or the input of a derived claim that is', () => {
    const cited = new Set<string>()
    for (const text of [...lessons.map((l) => l.text), moduleText, read('content/cards/trace-room-bench.md')]) {
      for (const m of text.matchAll(/\{\{claim:([a-z0-9.-]+)\}\}/g)) cited.add(m[1])
    }
    // A derived claim that is cited reads its inputs.
    const byId = new Map(result.claims.map((record) => [record.claim.id, record.claim]))
    for (const id of [...cited]) for (const input of byId.get(id)?.derived?.inputs ?? []) cited.add(input)
    for (const id of [...cited]) for (const input of byId.get(id)?.derived?.inputs ?? []) cited.add(input)
    expect(mine.map((c) => c.id).filter((id) => !cited.has(id))).toEqual([])
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The numbers the lessons print                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A number with its thousands separators and `digits` decimals, as a lesson writes it. */
const fmt = (x: number, digits = 0): string => x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** Fails with the lesson and the line that went stale, where `expect(text).toContain` would print the whole lesson. */
function mentions(lessonId: string, what: string, line: string): void {
  const text = lessonOf(lessonId).text
  expect([lessonId, what, text.includes(line) ? line : `(missing) ${line}`]).toEqual([lessonId, what, line])
}

describe('lesson 1: the toy log, the pause and the cap', () => {
  const toy = toyLog()
  const MEASURED_AT = /Measured by the course's sim on 2026-11-04 at `([0-9a-f]{7,40})`, with the seed `7`\./

  test('the prediction: 200 requests due every 500 ms, answered in 100 ms but for a freeze of 2 s that gives one reply 2,100 ms after its send', () => {
    const prompt = lessonOf('tr8.l1').lesson.blocks.find((b) => b.type === 'predict')
    expect(prompt?.type === 'predict' ? prompt.prompt : '').toContain('200 requests, one due every 500 ms [estimated]')
    expect(toy.length).toBe(200)
    expect(toy.filter((r) => r.fromSentMs !== 100)).toEqual([toy[2]])
    expect(toy[2].fromSentMs).toBe(2100)
    expect(PREDICTIONS['tr8.l1.p1'].reference()).toBe(100)
  })

  test('the first eight rows of the log, and what they add up to', () => {
    for (const r of toy.slice(0, 8)) {
      mentions('tr8.l1', `row #${r.n}`, `| #${r.n} | ${fmt(r.dueMs)} | ${fmt(r.sentMs)} | ${fmt(r.replyMs)} | ${fmt(r.fromSentMs)} | ${fmt(r.fromDueMs)} |`)
    }
    const slips = toy.slice(3, 7).map((r) => r.sentMs - r.dueMs)
    mentions('tr8.l1', 'the slips', `by ${fmt(slips[0])}, ${fmt(slips[1])}, ${fmt(slips[2])} and ${fmt(slips[3])} ms [derived]`)
    mentions('tr8.l1', 'the unseen wait', `add up to ${fmt(slips.reduce((a, b) => a + b, 0))} ms [derived]`)
  })

  test('the p99 of the stopwatch and of the due times, on 200 values, and how many requests the freeze touched', () => {
    const sorted = [...toy].sort((a, b) => a.fromDueMs - b.fromDueMs)
    expect(toy.filter((r) => r.fromDueMs !== 100).length).toBe(5)
    mentions('tr8.l1', 'five touched', 'Five of the 200 requests [estimated] were touched by the freeze')
    expect(p99Of(toy.map((r) => r.fromSentMs))).toBe(100)
    expect(p99Of(toy.map((r) => r.fromDueMs))).toBe(1300)
    expect(sorted[sorted.length - 3].fromDueMs).toBe(1300)
    mentions('tr8.l1', 'the p99s', `Timed from the send, the third largest is ${fmt(p99Of(toy.map((r) => r.fromSentMs)))} ms [derived]. Timed from the due time it is ${fmt(p99Of(toy.map((r) => r.fromDueMs)))} ms [derived].`)
  })

  test('wrk2\'s pause, in the README\'s own figures: 1.4 s at 2,000 requests a second is 2,800 requests, 7.1% of the recorded 39,500', () => {
    const claim = (id: string) => result.claims.find((record) => record.claim.id === id)?.claim
    const recorded = claim('bench.wrk2.stall-recorded-count')?.value
    expect(recorded).toBe(39500)
    const due = Math.round(1.4 * 2000)
    mentions('tr8.l1', 'due during the pause', `leaves ${fmt(due)} requests due [derived]`)
    mentions('tr8.l1', 'share of the recorded', `so those are ${fmt((100 * due) / Number(recorded), 1)}% [derived] of them`)
    // The ratio of the two p99s, 1.27 s over 6.04 ms, is the claim the lesson cites as "about 210".
    expect(Math.round(Number(claim('bench.wrk2.stall-ratio')?.value))).toBe(210)
  })

  test('the cap: the open loop and the capped harness, with and without a freeze of 3 s, measured on seed 7', () => {
    const demo = freezeDemo()
    mentions('tr8.l1', 'rate', `which is ${fmt(demo.ratePerS, 1)} requests a second [measured]`)
    expect([demo.requests, demo.cap, demo.freezeS]).toEqual([1500, 24, 3])
    mentions('tr8.l1', 'open, calm', `| Open loop | no freeze | the send, which is the due time | ${fmt(demo.open.calm.dueMs)} |`)
    mentions('tr8.l1', 'open, freeze', `| Open loop | freeze | the send, which is the due time | ${fmt(demo.open.freeze.dueMs)} |`)
    mentions('tr8.l1', 'capped, calm, send', `| Capped | no freeze | the send | ${fmt(demo.capped.calm.sentMs)} |`)
    mentions('tr8.l1', 'capped, calm, due', `| Capped | no freeze | the due time | ${fmt(demo.capped.calm.dueMs)} |`)
    mentions('tr8.l1', 'capped, freeze, send', `| Capped | freeze | the send | ${fmt(demo.capped.freeze.sentMs)} |`)
    mentions('tr8.l1', 'capped, freeze, due', `| Capped | freeze | the due time | ${fmt(demo.capped.freeze.dueMs)} |`)
    // An open loop that keeps up sends on time, so its two stopwatches agree, and no send is late by the course's rule (ASSESSMENT B4).
    expect([demo.open.calm.sentMs, demo.open.freeze.sentMs]).toEqual([demo.open.calm.dueMs, demo.open.freeze.dueMs])
    expect([ADHERENCE_TOLERANCE_US, ADHERENCE_HARD_LIMIT_US]).toEqual([2000, 20000])
    expect([demo.open.calm.late, demo.open.freeze.late]).toEqual([0, 0])
    mentions('tr8.l1', 'late sends', `The capped harness sent ${fmt(demo.capped.calm.late)} of its ${fmt(demo.requests)} requests [measured] more than 2 ms [estimated] late in the calm run, and ${fmt(demo.capped.freeze.late)} [measured] in the freeze run`)
    // 99.9% of the rows within 2 ms: both capped runs are far outside it.
    expect(demo.capped.calm.late / demo.requests).toBeGreaterThan(0.001)
    mentions('tr8.l1', 'the capped stopwatch', `reported ${fmt(demo.capped.freeze.sentMs)} ms [measured]`)
    mentions('tr8.l1', 'the clump', `That is ${fmt(demo.capped.calm.sentMs)} ms from the send against ${fmt(demo.capped.calm.dueMs)} ms from the due time [measured].`)
    // "Within a fifth" of the open loop, timed from the due time.
    expect(Math.abs(demo.capped.freeze.dueMs / demo.open.freeze.dueMs - 1)).toBeLessThanOrEqual(0.2)
    mentions('tr8.l1', 'a fifth', 'it agrees with the open loop, within a fifth [derived]')
  })

  test('the measurement names a commit that exists and a seed, once', () => {
    const matches = [...lessonOf('tr8.l1').text.matchAll(new RegExp(MEASURED_AT, 'g'))]
    expect(matches.length).toBe(1)
  })

  test('the figure draws the table: a tick per due time, a bar per send as long as the request took, at 0.088 px a millisecond', () => {
    const svg = read('public/figures/tr8/l1-slip.svg')
    const scale = 0.088
    const x = (ms: number) => 24 + scale * ms
    const dueTicks = [...svg.matchAll(/M(\d+(?:\.\d+)?) 28V44/g)].map((m) => Number(m[1]))
    expect(dueTicks).toEqual(toy.slice(0, 8).map((r) => x(r.dueMs)))
    const bars = [...svg.matchAll(/<rect x="([\d.]+)" y="96" width="([\d.]+)" height="8"\/>/g)].map((m) => [Number(m[1]), Number(m[2])])
    expect(bars.length).toBe(8)
    toy.slice(0, 8).forEach((r, at) => {
      expect(bars[at][0]).toBeCloseTo(x(r.sentMs), 6)
      expect(bars[at][1]).toBeCloseTo(scale * r.fromSentMs, 6)
    })
    // A figure is drawn in the page's ink: no colour and no typeface of its own (DESIGN.md; AGENTS.md rule 9).
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|font-family/)
    expect(svg).toContain('currentColor')
  })
})

describe('lesson 2: the cold start, the p99\'s requests beyond it, and the interval', () => {
  test('the window is 128 requests on a server of 64 sequences', () => {
    expect([CORPUS_SERVER.maxNumSeqs, BENCH_WARMUP_ROWS]).toEqual([64, 128])
    mentions('tr8.l2', 'the sequences', 'The Inspection\'s server runs 64 sequences [estimated], so its W is 128 requests [derived].')
  })

  test('the cold start of 12 s and of 20 s, seed 5', () => {
    const demo = warmDemo()
    expect([demo.requests, demo.coldS, demo.slowdown, demo.longCold.coldS]).toEqual([1600, 12, 3, 20])
    const yes = (settled: boolean): string => (settled ? 'yes' : 'no')
    const cuts = ['0', '20', '128, the rule\'s window', '400']
    demo.rows.forEach((row, at) => {
      const long = demo.longCold.rows[at]
      mentions('tr8.l2', `cut ${row.cut}`, `| ${cuts[at]} | ${fmt(row.p99Ms)} | ${yes(row.settled)} | ${fmt(long.p99Ms)} | ${yes(long.settled)} |`)
    })
    const [none, twenty, rule, four] = demo.rows
    // Twenty requests do not reach the slow tail; the rule's window does; 400 buys almost nothing more.
    expect(twenty.p99Ms).toBe(none.p99Ms)
    expect(rule.p99Ms).toBeLessThan(none.p99Ms / 5)
    expect(Math.round((100 * Math.abs(four.p99Ms - rule.p99Ms)) / rule.p99Ms)).toBe(5)
    expect([none.settled, rule.settled, four.settled]).toEqual([false, true, true])
    expect([demo.longCold.rows[2].settled, demo.longCold.rows[3].settled]).toEqual([false, true])
    mentions('tr8.l2', 'the warm engine', `${fmt(rule.p99Ms)} ms [measured] is what the engine does once it is warm`)
    mentions('tr8.l2', 'the extra cut', `Leaving out 400 costs ${fmt(400 - BENCH_WARMUP_ROWS)} requests of data [derived] for a p99 that moves by 5% [derived]`)
    mentions('tr8.l2', 'the long warm-up', `the p99 after 128 requests is ${fmt(demo.longCold.rows[2].p99Ms)} ms [measured]`)
    mentions('tr8.l2', 'the temptation', `would give ${fmt(demo.longCold.rows[3].p99Ms)} ms [measured]`)
  })

  test('the prediction: 250 requests leave two beyond the p99; the table of what lies beyond', () => {
    expect(PREDICTIONS['tr8.l2.p1'].reference()).toBe(2)
    for (const n of [100, 250, 1000, 5000]) {
      const rank = Math.ceil(0.99 * n) // the nearest rank of the p99
      expect(beyondP99(n)).toBe(n - rank)
      mentions('tr8.l2', `n = ${n}`, `| ${fmt(n)} | ${fmt(rank)}th | ${n - rank} |`)
    }
    mentions('tr8.l2', 'the minimum', 'at least 1,000 measured requests [estimated], so that at least 10 lie beyond the p99 [derived]')
    expect(beyondP99(1000)).toBe(10)
  })

  test('the width of the interval at 250, 1,000 and 4,000 requests, and the square-root law', () => {
    const cells = widthDemo()
    for (const cell of cells) mentions('tr8.l2', `n = ${cell.n}`, `| ${fmt(cell.n)} | ${cell.seeds} | ${fmt(cell.medianMs)} |`)
    const [a, b, c] = cells
    const r1 = Math.round((a.medianMs / b.medianMs) * 10) / 10
    const r2 = Math.round((b.medianMs / c.medianMs) * 10) / 10
    mentions('tr8.l2', 'the ratios', `the ratios of the widths are ${fmt(a.medianMs)} ÷ ${fmt(b.medianMs)} = ${r1.toFixed(1)} and ${fmt(b.medianMs)} ÷ ${fmt(c.medianMs)} = ${r2.toFixed(1)} [derived]`)
    // Four times the requests, about half the width.
    expect(r1).toBeGreaterThan(1.6)
    expect(r2).toBeLessThan(2.1)
  })

  test('the coverage of the nominal 95% interval on a p99: 92.6% at 1,000 requests and 94.6% at 5,000', () => {
    const demo = coverageDemo()
    expect([demo.at1000.streams, demo.at5000.streams]).toEqual([100, 20])
    mentions('tr8.l2', 'coverage', `covers the true p99 ${demo.at1000.percent.toFixed(1)}% of the time at 1,000 requests and ${demo.at5000.percent.toFixed(1)}% at 5,000 [measured]`)
    mentions('tr8.l2', 'streams', 'averaged over 100 resampler seeds at 1,000 requests and over 20 at 5,000 [estimated]')
    // Short of the nominal level, and closer to it as the sample grows (the sim's own test holds the same bounds).
    expect(demo.at1000.percent).toBeLessThan(93.2)
    expect(demo.at5000.percent).toBeGreaterThan(demo.at1000.percent)
  }, SLOW)
})

describe('lesson 3: the cap and the rate', () => {
  test('the prediction: 8 permits held for 1.2 s each send 6.7 requests a second, below the 10 asked for', () => {
    const block = lessonOf('tr8.l3').lesson.blocks.find((b) => b.type === 'predict')
    const prompt = block?.type === 'predict' ? block.prompt : ''
    expect(prompt).toContain('a request rate of 10 a second [estimated] and a cap of 8 requests in flight [estimated]')
    expect(prompt).toContain('1.2 s [estimated]')
    mentions('tr8.l3', 'the flags', 'for `--request-rate 10 --max-concurrency 8`')
    expect(PREDICTIONS['tr8.l3.p1'].reference()).toBeCloseTo(6.667, 3)
    mentions('tr8.l3', 'the arithmetic', 'the run can send 8 ÷ 1.2 = 6.7 requests a second [derived]')
    // The cap, and not the rate flag, sets the load (rate 10 against cap ÷ latency).
    expect(PREDICTIONS['tr8.l3.p1'].reference()).toBeLessThan(10)
  })
})

describe('lesson 4: the rush, goodput\'s two denominators, and Little\'s law', () => {
  test('the prediction: 600 of 1,000 requests over 60 s, the last reply at 100 s, give 6 requests a second over the whole run', () => {
    const block = lessonOf('tr8.l4').lesson.blocks.find((b) => b.type === 'predict')
    const prompt = block?.type === 'predict' ? block.prompt : ''
    for (const fact of ['1,000 requests [estimated]', '60 s [estimated]', '600 [estimated]', '100 s [estimated]']) expect(prompt).toContain(fact)
    expect(PREDICTIONS['tr8.l4.p1'].reference()).toBe(6)
    expect(600 / 60).toBe(10)
  })

  test('the rush: the same 1,159 requests replayed in time and at the trace\'s mean rate, seed 7', () => {
    const demo = rushDemo()
    expect(RUSH).toEqual([
      [70, 400],
      [8, 1600],
      [70, 400],
    ])
    mentions('tr8.l4', 'the stretches', 'The trace runs 70 s [estimated] at 40% [estimated] of what the server can finish, then 8 s [estimated] at 160% [estimated], then 70 s [estimated] at 40% [estimated].')
    mentions('tr8.l4', 'the trace', `It holds ${fmt(demo.requests)} requests [measured], so ${demo.beyondP99} lie beyond its p99 [derived].`)
    expect(demo.beyondP99).toBeGreaterThanOrEqual(10)
    mentions('tr8.l4', 'the mean rate', `which is ${fmt(demo.meanSharePct)}% [measured] of the server's capacity`)
    mentions('tr8.l4', 'in time', `| in time, at the trace's own pace | ${fmt(demo.inTime.p50Ms)} | ${fmt(demo.inTime.p90Ms)} | ${fmt(demo.inTime.p99Ms)} |`)
    mentions('tr8.l4', 'steady', `| at the trace's mean rate | ${fmt(demo.steady.p50Ms)} | ${fmt(demo.steady.p90Ms)} | ${fmt(demo.steady.p99Ms)} |`)
    expect(Math.abs(demo.inTime.p50Ms / demo.steady.p50Ms - 1)).toBeLessThanOrEqual(0.07)
    expect(Math.round(demo.inTime.p99Ms / demo.steady.p99Ms)).toBe(30)
    mentions('tr8.l4', 'the medians', 'The medians agree to within 7% [derived], and the p99 differs by a factor of 30 [derived].')
  })

  test('goodput over the arrival window and over the whole run, at four loads, seed 11', () => {
    const rows = goodputDemo()
    const loads = ['0.5', '1', '2', '3']
    rows.forEach((row, at) => {
      mentions('tr8.l4', `load ${loads[at]}`, `| ${loads[at]} | ${fmt(row.rows)} | ${fmt(row.met)} | ${fmt(row.windowPerS, 2)} | ${fmt(row.wholePerS, 2)} | ${fmt(row.endS, 1)} |`)
    })
    const [half, one, two, three] = rows
    // Light load: within 4%. Overload: half, and a third, because the denominator grew by the drain tail.
    expect(half.windowPerS / half.wholePerS - 1).toBeLessThan(0.04)
    expect(one.windowPerS / one.wholePerS - 1).toBeLessThan(0.04)
    expect(Math.round((two.wholePerS / two.windowPerS) * 10) / 10).toBe(0.5)
    expect(Math.round((three.wholePerS / three.windowPerS) * 10) / 10).toBeCloseTo(0.3, 1)
    // The ratio of the two goodputs is the ratio of the run's length to the 60 s window.
    expect(Math.abs(two.windowPerS / two.wholePerS - two.endS / 60)).toBeLessThan(0.05)
    mentions('tr8.l4', 'the light loads', 'At light load the two agree to within 4% [derived].')
  })

  test('Little\'s law over the same four runs: L, throughput times mean latency, and the residual', () => {
    const rows = goodputDemo()
    const loads = ['0.5', '1', '2', '3']
    rows.forEach((row, at) => {
      const residual = row.residualPermille / 10
      mentions('tr8.l4', `load ${loads[at]}`, `| ${loads[at]} | ${fmt(row.inFlight, 1)} | ${fmt(row.lambdaW, 1)} | ${fmt(residual, residual < 10 ? 1 : 0)}% |`)
    })
    // The run at half the capacity is steady and agrees within 2%; the course allows 5% (ASSESSMENT B10).
    expect(rows[0].residualPermille).toBeLessThanOrEqual(20)
    expect(rows[2].residualPermille).toBeGreaterThan(50)
    mentions('tr8.l4', 'the steady run', 'the two sides agree to within 2% [measured]')
    expect(8 * 2).toBe(16)
  })
})

describe('the commit that the numbers name', () => {
  const cited = [...new Set(lessons.flatMap((l) => [...l.text.matchAll(/2026-11-04 at `([0-9a-f]{7,40})`/g)].map((m) => m[1])))]

  test('the lessons that print simulator numbers name one commit, in code', () => {
    expect(cited.length).toBe(1)
  })

  test('it is a commit of this repository, when the history is here to say so', () => {
    // The numbers themselves are recomputed above on every run, so a generator that moves them fails there and names the figure. The commit
    // is where they were read, and a lesson that cites one that this history does not have cites a commit that never existed.
    const git = (...args: string[]) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
    for (const sha of cited) {
      if (git('cat-file', '-e', `${sha}^{commit}`).status !== 0) continue // a shallow clone does not have it
      expect(git('merge-base', '--is-ancestor', sha, 'HEAD').status).toBe(0)
    }
  })
})
