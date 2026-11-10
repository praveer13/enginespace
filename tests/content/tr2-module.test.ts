/*
 * W1-T15: TR2's module and lessons (docs/TRACKER.md, "TR2 content"). The task's acceptance, and this file holds each part of it to the
 * real content:
 *
 *   1. verify:content, verify:claims and verify:numbers pass: the module, its seven lessons and its claims compile with no diagnostic.
 *   2. Every lesson has a prediction, a game or an item, and an exit check that names the knowledge components it tests.
 *   3. Reading minutes fall within 20% of the declared minutes.
 *   4. The module and its lessons are in review.
 *
 * Beyond those, four things TR2 owes the rest of the course:
 *
 *   - The GPU part is announced and never faked (D-039): TR2 has none of its own, and its predictions about a real engine wait for TR3's lab.
 *   - Every number a lesson prints from the simulator or from The Loop's levels is recomputed here from `tests/content/tr2-demos.ts`, and
 *     every figure is the one `tests/content/tr2-figures.ts` draws, so when the model or a level moves a number, this file names the lesson
 *     and the figure that went stale.
 *   - The claims TR2 adds (content/claims/tr2.yaml) are read at the pins, at a tag or a commit, with the lines of their quotes.
 *   - What the lessons name but nobody has built yet is named here: the `keys` level (Q-10). The nine item families they name are built (W1-T14, W1b-T04).
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { compiledLessonSchema, compiledModuleSchema } from '@es/schema'
import type { CompiledBlock, ProseFlow, ProseInline } from '@es/schema'
import { lockFileSchema } from '@es/schema/lock'
import { familyById } from '../../packages/play/items/registry'
import { LOOP } from '../../packages/play/loop/entry'
import { SMALL_CARD } from '../../packages/sim/steploop'
import { ENGINE_DEFAULTS, sglangDecodeBuckets } from '../../packages/sim/steploop/engine-defaults'
import { compileContent, MINUTES_TOLERANCE } from '../../scripts/content/build.ts'
import { buildCases } from '../../scripts/tables/dispatch-cases'
import {
  BUDGET,
  CLOSE_PRACTICE_SEED,
  DEFAULT_SIZES,
  DISPATCH_CASES,
  DISPATCH_RAIL,
  PREDICTIONS,
  PRACTICE_SEED,
  asyncNights,
  budgetSteps,
  closePractice,
  closeRefusals,
  comb,
  combNight,
  darkFires,
  defaultGraphs,
  dispatchSizes,
  dispatchTable,
  enginePads,
  graphCounts,
  hostWork,
  kvAfterGraphs,
  modeTable,
  mrv2Nights,
  mrv2SavesPerStep,
  padRows,
  runnerRegimes,
  sizesNight,
  steadyFire,
  stepModel,
  wasted,
} from './tr2-demos.ts'
import { FIGURES } from './tr2-figures.ts'
import { read, repo } from './support.ts'

const LESSON_FILES = [
  'content/modules/tr2/lessons/l1-one-step-five-calls.md',
  'content/modules/tr2/lessons/l2-one-token-budget.md',
  'content/modules/tr2/lessons/l3-async-scheduling-closes-the-bubble.md',
  'content/modules/tr2/lessons/l4-the-mrv2-delta.md',
  'content/modules/tr2/lessons/l5-cuda-graphs-capture-replay-padding-and-modes.md',
  'content/modules/tr2/lessons/l6-dispatch-keys-which-graph-replays-this-step.md',
  'content/modules/tr2/lessons/l7-the-same-loop-elsewhere.md',
] as const
const MODULE_FILE = 'content/modules/tr2/module.md'
const CLAIMS_FILE = 'content/claims/tr2.yaml'

const result = compileContent({ root: repo })
const lessons = LESSON_FILES.map((file) => {
  const slug = path.basename(file, '.md')
  const out = result.outputs.find((o) => o.path === `src/content/generated/lessons/tr2.${slug}.json`)
  if (out === undefined) throw new Error(`the compiler wrote no lesson for ${file}`)
  return { file, slug, text: read(file), lesson: compiledLessonSchema.parse(JSON.parse(out.text)) }
})
const moduleOut = result.outputs.find((o) => o.path === 'src/content/generated/modules/tr2.json')
if (moduleOut === undefined) throw new Error('the compiler wrote no module for tr2')
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

/** The headings of a lesson, in order. */
function headings(lesson: CompiledLesson): string[] {
  return lesson.blocks.flatMap((block) => (block.type === 'prose' ? block.body.flatMap((flow) => (flow.type === 'heading' && flow.depth === 2 ? [inlineText(flow.children)] : [])) : []))
}
type CompiledLesson = (typeof lessons)[number]['lesson']

/* ------------------------------------------------------------------------------------------------------------------ */
/* The checks of W1-T15                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('check 1: TR2 compiles with no diagnostic of any kind', () => {
  test('the module, its seven lessons and the claims file are in the compiled course', () => {
    expect(module_.id).toBe('tr2')
    expect(lessons.map((l) => l.lesson.id)).toEqual(['tr2.l1', 'tr2.l2', 'tr2.l3', 'tr2.l4', 'tr2.l5', 'tr2.l6', 'tr2.l7'])
    expect(result.claims.some((record) => record.file === CLAIMS_FILE)).toBe(true)
  })

  test('nothing in the module, its lessons or its claims is reported, not even a warning', () => {
    const mine = result.diagnostics.filter((d) => d.file.startsWith('content/modules/tr2/') || d.file === CLAIMS_FILE)
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

    test(`${lesson.id}: an exit check that ends in items or a graded game, and names the KCs it tests`, () => {
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

/** The five hours and a fifth that the curriculum gives the seven lessons of the ten (curriculum/TR2 §9), in minutes [estimated]. */
const LESSON_MINUTES_PLANNED = 5.2 * 60

describe('check 3: reading minutes fall within 20% of the declared minutes', () => {
  for (const { lesson } of lessons) {
    test(`${lesson.id} says ${lesson.minutes} and the compiler reads ${lesson.readingMinutes}`, () => {
      expect(Math.abs(lesson.minutes - lesson.readingMinutes)).toBeLessThanOrEqual(MINUTES_TOLERANCE * lesson.minutes)
    })
  }

  test("the lessons add up to the curriculum's plan for them, within 10%, and the module page says what the rest of the hours are", () => {
    const minutes = lessons.reduce((sum, l) => sum + l.lesson.minutes, 0)
    expect(Math.abs(minutes - LESSON_MINUTES_PLANNED)).toBeLessThanOrEqual(0.1 * LESSON_MINUTES_PLANNED)
    // "Just under five hours" on the page is this sum.
    expect(minutes).toBeGreaterThan(4.7 * 60)
    expect(minutes).toBeLessThan(5 * 60)
    expect(moduleText).toContain('The lessons\' own clocks, which count their words and their blocks, come to just under five hours [derived]')
    expect(module_.hours).toBe(10)
    expect(module_.hours_by_lane).toEqual({ B: 10 })
  })
})

describe('check 4: the status is review', () => {
  test('the module and its lessons', () => {
    expect([module_.status, ...lessons.map((l) => l.lesson.status)]).toEqual(['review', 'review', 'review', 'review', 'review', 'review', 'review', 'review'])
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* What TR2 teaches                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The nine item families that TR2's lessons name, and the KCs each is written to assess (content/kc/graph.yaml and curriculum/TR2 §4). W1-T14 built
 * three of them and W1b-T04 the other six, so no family is waiting for a task: the list that W1-T15 kept of the unbuilt ones is empty.
 */
const FAMILIES_NAMED: Readonly<Record<string, readonly string[]>> = {
  'tr2.step-order': ['tr2.step-calls', 'tr2.bubble'],
  'tr2.preempt-victim': ['tr2.one-budget'],
  'tr2.default-budget': ['tr2.gpu-dependent-defaults'],
  'tr2.bubble-width': ['tr2.bubble', 'tr2.async-overlap'],
  'tr2.runner-fallback': ['tr2.mrv2-delta'],
  'tr2.graph-hit': ['tr2.graph-replay'],
  'tr2.padding-waste': ['tr2.capture-padding'],
  'tr2.dispatch-key': ['tr2.dispatch-keys'],
  'tr2.kv-after-graphs': ['tr2.graph-memory'],
}

describe('what the lessons teach', () => {
  const graph = readFileSync(path.join(repo, 'content/kc/graph.yaml'), 'utf8')
  const tr2Kcs = [...graph.matchAll(/^- id: (tr2\.[a-z0-9-]+)$/gm)].map((m) => m[1])

  test("every KC of TR2 is taught by a lesson, and no lesson teaches another module's", () => {
    const taught = new Set(lessons.flatMap((l) => l.lesson.kcs))
    expect(tr2Kcs.length).toBe(11)
    expect(tr2Kcs.filter((kc) => !taught.has(kc))).toEqual([])
    expect([...taught].filter((kc) => !tr2Kcs.includes(kc))).toEqual([])
  })

  test('the lessons follow the curriculum: seven lessons, in its order, with its titles', () => {
    expect(lessons.map((l) => l.lesson.title)).toEqual([
      "One step, five calls: vLLM's busy loop at v0.33.0",
      'One token budget: chunked prefill, recompute preemption, and defaults that depend on your GPU',
      'Async scheduling closes the bubble, and costs a token',
      'The MRV2 delta: persistent state, GPU-side input prep, and why MRV1 still ships',
      'CUDA graphs: capture, replay, padding, and five modes',
      'Dispatch keys: which graph replays this step',
      'The same loop in SGLang, Mini-SGLang and TRT-LLM',
    ])
    for (const { lesson } of lessons) expect([lesson.id, lesson.games ?? []]).toEqual([lesson.id, lesson.id === 'tr2.l7' ? [] : ['loop']])
  })

  test('builds_on names kernelspace T5.L7 and T0.L6 in the first lesson, and every lesson builds on kernelspace', () => {
    expect(lessonOf('tr2.l1').lesson.builds_on).toEqual(expect.arrayContaining(['ks:T5.L7', 'ks:T0.L6']))
    for (const { lesson } of lessons) expect([lesson.id, (lesson.builds_on ?? []).some((ref) => ref.startsWith('ks:'))]).toEqual([lesson.id, true])
    expect(module_.prereqs).toEqual(['ks:T5.L7', 'ks:T0.L6', 'ks:T4.L3'])
  })

  test("builds_on lists kernelspace lessons, not KCs: a lesson is a link out, and a KC id is plain text that the lesson's header prints whole, so a long one (t5.continuous-batching) pushes the header past a phone's width", () => {
    // The KCs that a lesson leans on are the edges of content/kc/graph.yaml. With such ids in builds_on, e2e/a11y.spec.ts's reflow check failed
    // TR2's third lesson at 360 px, and the same check at 320 px, the nightly sweep's narrowest width, failed the second and the fifth
    // [measured 2026-11-08 at b5fb81a]. A fix in the lesson header's tape would let the ids back.
    for (const { lesson } of lessons) for (const ref of lesson.builds_on ?? []) expect([lesson.id, ref, /^ks:T\d+\.L\d+$/.test(ref)]).toEqual([lesson.id, ref, true])
  })

  test('every game block is a level of Service, and only the graded level is played as graded', () => {
    const levels = new Map(LOOP.levels.map((level) => [level.id, level]))
    let graded = 0
    for (const { lesson } of lessons) {
      for (const block of lesson.blocks) {
        if (block.type !== 'game') continue
        expect([lesson.id, block.id]).toEqual([lesson.id, 'loop'])
        const level = levels.get(block.level)
        expect([lesson.id, block.level, level !== undefined]).toEqual([lesson.id, block.level, true])
        if (block.mode === 'graded') {
          graded++
          expect([lesson.id, block.level, level?.graded]).toEqual([lesson.id, 'close', true])
        } else if (block.level !== 'close') {
          expect([lesson.id, block.level, level?.graded]).toEqual([lesson.id, block.level, false])
        }
      }
    }
    // The graded level is played once as graded, at the end of the sixth lesson, and the `keys` level is in no lesson: it waits (Q-10).
    expect(graded).toBe(1)
    expect(exitCheck(lessonOf('tr2.l6').lesson.blocks)?.blocks.some((block) => block.type === 'game' && block.level === 'close' && block.mode === 'graded')).toBe(true)
    for (const { lesson } of lessons) for (const block of lesson.blocks) if (block.type === 'game') expect([lesson.id, block.level === 'keys']).toEqual([lesson.id, false])
  })

  test('an item block names a family of TR2, and each of the nine is built: it assesses KCs its lesson teaches, at a level it draws at, and no family waits for a task', () => {
    const named = new Set<string>()
    for (const { lesson } of lessons) {
      for (const block of lesson.blocks) {
        if (block.type !== 'item') continue
        expect(block.family.startsWith('tr2.')).toBe(true)
        named.add(block.family)
        const gen = familyById(block.family)
        // A lesson that names a family nobody built prints "Not built yet" in its place: none does.
        expect([lesson.id, block.family, gen !== undefined]).toEqual([lesson.id, block.family, true])
        if (gen === undefined) continue
        expect(Object.keys(FAMILIES_NAMED)).toContain(block.family)
        for (const kc of gen.kcs) expect([lesson.id, block.family, lesson.kcs.includes(kc)]).toEqual([lesson.id, block.family, true])
        // The level is one the family draws at.
        expect(gen.variants.some((variant) => (variant.levels as readonly number[]).includes(block.level))).toBe(true)
      }
    }
    expect([...named].sort()).toEqual(Object.keys(FAMILIES_NAMED).sort())
    // The KCs each family is written to assess are the ones it names.
    for (const [id, kcs] of Object.entries(FAMILIES_NAMED)) expect([id, familyById(id)?.kcs]).toEqual([id, kcs])
  })

  test('an exit ticket is three items on fresh seeds at level two, and a practice item before it is at a lower level (ASSESSMENT §4.2)', () => {
    for (const { lesson } of lessons) {
      const exit = exitCheck(lesson.blocks)
      const items = exit?.blocks.flatMap((block) => (block.type === 'item' ? [block] : [])) ?? []
      expect([lesson.id, items.reduce((sum, block) => sum + block.count, 0)]).toEqual([lesson.id, 3])
      for (const block of items) expect([lesson.id, block.family, block.level]).toEqual([lesson.id, block.family, 2])
      const exitStart = lesson.blocks.indexOf(exit?.blocks[0] as CompiledBlock)
      lesson.blocks.forEach((block, at) => {
        if (block.type === 'item' && at < exitStart) expect([lesson.id, block.family, block.level < 2]).toEqual([lesson.id, block.family, true])
      })
    }
  })

  test('every KC of a lesson is reached by a game or an item of that lesson', () => {
    const gameKcs = new Set(LOOP.kcs)
    for (const { lesson } of lessons) {
      const reached = new Set<string>()
      for (const block of lesson.blocks) {
        if (block.type === 'game') for (const kc of gameKcs) reached.add(kc)
        if (block.type === 'item') for (const kc of familyById(block.family)?.kcs ?? []) reached.add(kc)
      }
      for (const kc of lesson.kcs) expect([lesson.id, kc, reached.has(kc)]).toEqual([lesson.id, kc, true])
    }
  })

  test('a prediction names a KC of its lesson, has a reference in the demos, and asks for the unit the reference gives', () => {
    const asked = new Set<string>()
    for (const { lesson } of lessons) {
      for (const block of lesson.blocks) {
        if (block.type !== 'predict') continue
        asked.add(block.id)
        for (const kc of block.kcs) expect([block.id, kc, lesson.kcs.includes(kc)]).toEqual([block.id, kc, true])
        expect([block.id, PREDICTIONS[block.id] !== undefined]).toEqual([block.id, true])
        expect(block.answer.kind).toBe('numeric')
        if (block.answer.kind === 'numeric') expect([block.id, block.answer.unit]).toEqual([block.id, PREDICTIONS[block.id].unit])
      }
    }
    expect([...asked].sort()).toEqual(Object.keys(PREDICTIONS).sort())
  })

  test('the lessons that name a GPU part say so under a heading of their own, and that part waits for the grader', () => {
    for (const { lesson, text } of lessons) {
      if (!headings(lesson).includes('What the GPU will check')) continue
      expect([lesson.id, text.includes('(D-039)')]).toEqual([lesson.id, true])
    }
    expect(lessons.filter((l) => headings(l.lesson).includes('What the GPU will check')).map((l) => l.lesson.id)).toEqual(['tr2.l3', 'tr2.l4', 'tr2.l5', 'tr2.l6', 'tr2.l7'])
  })
})

describe('the GPU part is announced and never faked (D-039)', () => {
  test('the module page names the lab that tests TR2 on a GPU, which is TR3\'s, and says that it arrives with the grader', () => {
    expect(moduleText).toContain('Its predictions about a real engine are tested in TR3\'s lab, `tr3.profile`')
    expect(moduleText).toContain('That lab arrives with the grader (W2, D-039).')
    expect(moduleText).toContain('TR2 has no GPU stage.')
  })

  test("the module page carries no lab block, because the lab is TR3's, and the lessons carry no lab and no trace", () => {
    expect(module_.blocks.filter((block) => block.type === 'lab' || block.type === 'trace')).toEqual([])
    for (const { lesson } of lessons) expect([lesson.id, lesson.blocks.filter((b) => b.type === 'lab' || b.type === 'trace').length]).toEqual([lesson.id, 0])
  })

  test('the module and the lessons are browser lessons: lane B', () => {
    expect(module_.lanes).toEqual(['B'])
    expect(module_.artifacts.map((a) => [a.id, a.lane])).toEqual([['loop', 'B']])
    for (const { lesson } of lessons) expect(lesson.lanes).toEqual(['B'])
  })

  test('the module is the course.yaml entry: the same title and hours, and the same prerequisites and artifact', () => {
    const course = read('content/course.yaml')
    expect(course).toContain('title: The step loop')
    expect(module_.title).toBe('The step loop')
    expect(module_.pins).toEqual(['vllm', 'sglang'])
    expect(module_.worlds).toEqual(['trace-room-steploop'])
    expect(course).toContain("{ id: loop, lane: B, title: 'The step-loop sim, toggled until the bubbles close' }")
    expect(module_.artifacts[0].title).toBe('The step-loop sim, toggled until the bubbles close')
  })

  test('the module says that the level for dispatch keys waits for the owner, and does not play it (Q-10)', () => {
    expect(moduleText).toContain('A level called `keys` is planned for the dispatch keys of the sixth lesson, and it is not open')
    expect(moduleText).toContain('(Q-10)')
    expect(lessonOf('tr2.l6').text).toContain('It is not open yet: it waits for the table of the pinned dispatchers\' own answers, which the owner has to produce (Q-10).')
  })

  test('the module says that only `close` is graded as built, so the two other graded bars of ASSESSMENT §9 are not in the game yet', () => {
    expect(moduleText).toContain('As built, `close` is the graded level and `graphs` is a practice level')
    expect(LOOP.levels.find((level) => level.id === 'graphs')?.graded).toBe(false)
    expect(LOOP.levels.find((level) => level.id === 'close')?.graded).toBe(true)
  })

  test('the dispatcher tables are not committed, and the lessons that rely on that say so: the port is the course\'s', () => {
    const fixture = (() => {
      try {
        return readFileSync(path.join(repo, 'tests/fixtures/dispatch/v0.33.0.json'), 'utf8')
      } catch {
        return null
      }
    })()
    // The day the owner commits the table, the sixth lesson's wording about it is stale, and this test names it.
    expect([fixture === null, lessonOf('tr2.l6').text.includes('it has not been committed (Q-10)')]).toEqual([true, true])
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The claims TR2 adds                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

describe(`the claims of ${CLAIMS_FILE}`, () => {
  const lock = lockFileSchema.parse(JSON.parse(read('course.lock.json')))
  const entry = (key: string) => {
    const found = lock.entries.find((e) => e.key === key)
    if (found === undefined) throw new Error(`course.lock.json has no ${key}`)
    return found
  }
  const mine = result.claims.filter((record) => record.file === CLAIMS_FILE).map((record) => record.claim)

  /** The one ref a source of this kind may be read at: the pin's tag for an engine, a full commit for a reading target, kernelspace and TensorRT-LLM. */
  const ENGINES: readonly RegExp[] = [
    new RegExp(`^https://github\\.com/vllm-project/vllm/blob/v${entry('vllm').version}/[^#]+#L\\d+(?:-L\\d+)?$`),
    new RegExp(`^https://github\\.com/sgl-project/sglang/blob/v${entry('sglang').version}/[^#]+#L\\d+(?:-L\\d+)?$`),
    new RegExp(`^https://github\\.com/sgl-project/mini-sglang/blob/${entry('mini-sglang').commit}/[^#]+#L\\d+(?:-L\\d+)?$`),
  ]
  const OTHERS: readonly RegExp[] = [
    /^https:\/\/github\.com\/NVIDIA\/TensorRT-LLM\/blob\/b96ba434e8a05e2ab52d2082bd8d70b1d844739b\/[^#]+#L\d+(?:-L\d+)?$/,
    /^https:\/\/github\.com\/praveer13\/kernelspace\/blob\/d478f91[0-9a-f]{33}\/[^#]+#L\d+(?:-L\d+)?$/,
  ]
  /** The two posts, which are read as pages and not at a line. */
  const POSTS: readonly RegExp[] = [/^https:\/\/vllm\.ai\/blog\/2026-03-24-mrv2$/, /^https:\/\/lmsys\.org\/blog\/2026-08-17-advanced-cuda-graph\/$/]
  const isPost = (url: string): boolean => POSTS.some((pattern) => pattern.test(url))

  test('are many, and each is measured, except the three that someone else measured on their own hardware', () => {
    expect(mine.length).toBeGreaterThanOrEqual(55)
    expect(mine.filter((claim) => claim.tag !== 'measured').map((claim) => `${claim.id} ${claim.tag}`)).toEqual([
      'vllm.mrv2.blog-gain unverified',
      'vllm.mrv2.blog-spec-tpot unverified',
      'trtllm.cudagraph.padding-gain unverified',
    ])
  })

  test("begin their ids with their engine, or with loop when kernelspace's is the source", () => {
    for (const claim of mine) {
      const prefix = claim.id.split('.')[0]
      expect([claim.id, ['vllm', 'sglang', 'mini-sglang', 'trtllm', 'loop'].includes(prefix)]).toEqual([claim.id, true])
      if (claim.pin !== undefined) expect([claim.id, claim.id.startsWith(`${claim.pin}.`)]).toEqual([claim.id, true])
    }
  })

  test("a claim that names a pin names a key of the lockfile; an engine's file is read at its pin, and TensorRT-LLM and kernelspace at a commit", () => {
    for (const claim of mine) {
      const url = claim.source?.url ?? ''
      if (claim.pin !== undefined) {
        expect(lock.entries.some((e) => e.key === claim.pin)).toBe(true)
        expect([claim.id, ENGINES.some((pattern) => pattern.test(url)) || isPost(url)]).toEqual([claim.id, true])
      } else {
        expect([claim.id, OTHERS.some((pattern) => pattern.test(url))]).toEqual([claim.id, true])
        expect([claim.id, claim.id.startsWith('trtllm.') || claim.id.startsWith('loop.')]).toEqual([claim.id, true])
      }
    }
  })

  test('never cite main, master, latest or stable', () => {
    for (const claim of mine) expect(claim.source?.url ?? '').not.toMatch(/\/(?:main|master|latest|stable|HEAD)(?:\/|#|$)/)
  })

  test('carry the day they were read, which is not after the day they were checked, and a TTL of a quarter at a pin or a year', () => {
    for (const claim of mine) {
      if (claim.source === undefined) continue
      expect([claim.id, /^\d{4}-\d{2}-\d{2}$/.test(claim.source.accessed)]).toEqual([claim.id, true])
      expect([claim.id, claim.source.accessed <= claim.verifiedAt]).toEqual([claim.id, true])
      const longLived = isPost(claim.source.url) || !claim.source.url.startsWith('https://github.com/')
      const limit = claim.pin !== undefined && !longLived && !claim.source.url.includes('/kernelspace/') ? 90 : 365
      expect([claim.id, claim.ttlDays <= limit]).toEqual([claim.id, true])
    }
  })

  test('quote the source in its own words, which are not blank and not long, and say what they claim in a sentence', () => {
    for (const claim of mine) {
      if (claim.source === undefined) continue
      expect([claim.id, claim.source.quote.trim().length > 8]).toEqual([claim.id, true])
      expect([claim.id, claim.source.quote.length <= 260]).toEqual([claim.id, true])
      expect([claim.id, /[.]\s*$/.test(claim.text)]).toEqual([claim.id, true])
      expect(claim.source.title.trim().length).toBeGreaterThan(8)
    }
  })

  test("a figure of someone else's own run says the course has not reproduced it, or has not checked it", () => {
    for (const claim of mine.filter((c) => c.tag === 'unverified')) expect([claim.id, /has not (?:reproduced|been checked)|not (?:reproduced|checked)/.test(claim.text)]).toEqual([claim.id, true])
    const lesson4 = lessonOf('tr2.l4').text
    expect(lesson4).toContain('and the course has not reproduced them')
    expect(lesson4).toContain('56% [unverified]')
    expect(lesson4).toContain('6.3% [unverified]')
    expect(lessonOf('tr2.l5').text).toContain('22% [unverified]')
  })

  test('every claim of the file is read: cited by a lesson or by the module page', () => {
    const cited = new Set<string>()
    for (const text of [...lessons.map((l) => l.text), moduleText]) for (const m of text.matchAll(/\{\{claim:([a-z0-9.-]+)\}\}/g)) cited.add(m[1])
    expect(mine.map((c) => c.id).filter((id) => !cited.has(id))).toEqual([])
  })

  test("the game's claims that a lesson cites are the game's: Service's registry lists the loop.* claims, and the lessons cite only claims that exist", () => {
    const ids = new Set(result.claims.map((record) => record.claim.id))
    for (const { lesson, text } of lessons) for (const m of text.matchAll(/\{\{claim:([a-z0-9.-]+)\}\}/g)) expect([lesson.id, m[1], ids.has(m[1])]).toEqual([lesson.id, m[1], true])
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

const promptOf = (lessonId: string, id: string): string => {
  const block = lessonOf(lessonId).lesson.blocks.find((b) => b.type === 'predict' && b.id === id)
  return block?.type === 'predict' ? block.prompt : ''
}

describe('lesson 1: one step, and what the GPU waits for', () => {
  test('the five calls are named in the order of EngineCore.step, and the wait is put in the fourth, where the engine core blocks on the copy of the sampled ids', () => {
    const text = lessonOf('tr2.l1').text
    const list = text.slice(text.indexOf('## Five calls and a wait'), text.indexOf("## The model's six phases"))
    const calls = ['`scheduler.schedule()`', '`model_executor.execute_model(scheduler_output, non_block=True)`', '`scheduler.get_grammar_bitmask(scheduler_output)`', '`model_executor.sample_tokens(grammar_output)`', '`scheduler.update_from_output(...)`']
    const at = calls.map((call) => list.indexOf(call))
    // Each call is there, and each comes after the one before it: the lesson's list is the code's order (claim vllm.step.order).
    expect([at.every((index) => index >= 0), [...at].sort((a, b) => a - b)]).toEqual([true, at])
    // The wait is in the fourth line, with the claims that it rests on: where it is in the code, and what the thread blocks on.
    const fourth = list.slice(list.indexOf('\n4. '), list.indexOf('\n5. '))
    for (const id of ['vllm.step.two-phase', 'vllm.step.sample-if-none', 'vllm.executor.uni-blocking-output', 'vllm.async-output.event-sync', 'vllm.async-output.copy-stream']) expect([id, fourth.includes(`{{claim:${id}}}`)]).toEqual([id, true])
    expect(fourth).toContain('that is the wait for the forward')
    // The second call returns when the launch is queued and does not wait for the GPU, and on one GPU the thread that makes it runs the runner.
    expect(list.slice(list.indexOf('\n2. '), list.indexOf('\n3. '))).toContain('without waiting for the GPU')
    expect(text).toContain("On one GPU it is one thread's work, because the executor that serves a single GPU runs the model runner in the thread that calls it.")
    for (const id of ['vllm.executor.uni-default', 'vllm.executor.uni-inline']) expect([id, text.includes(`{{claim:${id}}}`)]).toEqual([id, true])
  })

  test('the prediction: 700 µs before the forward, 300 µs after, a forward of 2,000 µs, nothing overlapped, a GPU busy for two thirds of the clock', () => {
    const prompt = promptOf('tr2.l1', 'tr2.l1.p1')
    for (const fact of ['700 µs [estimated]', '300 µs [estimated]', '2,000 µs [estimated]']) expect(prompt).toContain(fact)
    expect(PREDICTIONS['tr2.l1.p1'].reference()).toBeCloseTo(66.667, 3)
  })

  test('the steady step of the async level, on the two cards: its phases, the CPU work added up, the forward and the idle time', () => {
    const big = steadyFire('70b')
    const small = steadyFire('small')
    const us = (fire: typeof big, kind: string): number => fire.phases.find((phase) => phase.kind === kind)?.us ?? 0
    for (const kind of ['schedule', 'prepare', 'launch', 'sync', 'sample']) mentions('tr2.l1', kind, `| \`${kind}\` | ${fmt(us(big, kind))} | ${fmt(us(small, kind))} |`)
    mentions('tr2.l1', 'the CPU work', `| The CPU's work, added up | ${fmt(big.cpuUs)} | ${fmt(small.cpuUs)} |`)
    mentions('tr2.l1', 'the forward', `| The forward | ${fmt(big.forwardUs)} | ${fmt(small.forwardUs)} |`)
    mentions('tr2.l1', 'the idle time', `| The GPU's idle time before the step | ${fmt(big.bubbleUs)} | ${fmt(small.bubbleUs)} |`)
    // The idle time before a step is the CPU's work of the step before it, row for row, when nothing overlaps.
    expect([big.bubbleUs, small.bubbleUs]).toEqual([big.cpuUs, small.cpuUs])
    expect([big.rows, small.rows]).toEqual([12, 12])
    mentions('tr2.l1', 'the busy shares', `${fmt(big.cpuUs)} µs and ${fmt(small.cpuUs)} µs [measured]`)
    mentions('tr2.l1', 'the busy share of the big card', `busy for ${fmt((100 * big.forwardUs) / (big.forwardUs + big.cpuUs), 1)}% [derived]`)
    mentions('tr2.l1', 'the busy share of the small card', `busy for ${fmt((100 * small.forwardUs) / (small.forwardUs + small.cpuUs), 1)}% [derived]`)
  })
})

describe('lesson 2: one token budget', () => {
  const steps = budgetSteps()

  test('the prediction: a budget of 2,048 tokens, 100 decodes, a prompt of 3,000, and the first chunk takes what the decodes leave', () => {
    const prompt = promptOf('tr2.l2', 'tr2.l2.p1')
    for (const fact of ['2,048 tokens [estimated]', '100 requests [estimated]', '3,000 tokens [estimated]']) expect(prompt).toContain(fact)
    expect([BUDGET.budget, BUDGET.decoding, BUDGET.prompt]).toEqual([2048, 100, 3000])
    expect(PREDICTIONS['tr2.l2.p1'].reference()).toBe(1948)
  })

  test('the four steps: the one before the prompt, the two that carry it, and the one after', () => {
    const names = ['Before the prompt', 'The first with the prompt', 'The second with the prompt', 'After it']
    steps.forEach((step, at) => mentions('tr2.l2', names[at], `| ${names[at]} | ${fmt(step.decodeRows)} | ${fmt(step.promptTokens)} | ${fmt(step.tokens)} | ${fmt(step.forwardUs)} |`))
    expect(steps[1].promptTokens).toBe(PREDICTIONS['tr2.l2.p1'].reference())
    mentions('tr2.l2', 'the arithmetic', `take ${fmt(steps[1].decodeRows)} tokens [derived], so the prompt gets what is left, ${fmt(steps[1].promptTokens)} tokens [derived], and the ${fmt(BUDGET.prompt - steps[1].promptTokens)} [derived] that remain go in the next step`)
    mentions('tr2.l2', 'the idle budget', `leaves ${fmt(BUDGET.budget - steps[2].tokens)} tokens [derived] of its budget unused`)
    mentions('tr2.l2', 'the cost of a chunk', `${fmt(steps[1].forwardUs)} µs [measured], where a decode-only step is ${fmt(steps[0].forwardUs)} µs [measured]`)
  })

  test("the same command on two GPUs: the offline class's budget on a 4090 against the server's, and a quarter of the budget and of the sequences", () => {
    const small = ENGINE_DEFAULTS['rtx-4090'].vllm
    const large = ENGINE_DEFAULTS.h100.vllm
    mentions('tr2.l2', 'offline against server', `${fmt(small.offlineTokens)} tokens [measured] on a \`4090\` where the server has ${fmt(small.serverTokens)} [measured]`)
    expect([small.serverTokens / large.serverTokens, small.seqs / large.seqs]).toEqual([0.25, 0.25])
    mentions('tr2.l2', 'a quarter', 'a quarter of the token budget, and a quarter of the sequences [derived]')
  })
})

describe('lesson 3: async scheduling closes the bubble, and costs a token', () => {
  const big = asyncNights('70b')
  const small = asyncNights('small')

  test('the prediction: 1,000 µs before the forward, 500 µs after, a forward of 1,200 µs, async on, 300 µs left on the critical path', () => {
    const prompt = promptOf('tr2.l3', 'tr2.l3.p1')
    for (const fact of ['1,000 µs [estimated]', '500 µs [estimated]', '1,200 µs [estimated]']) expect(prompt).toContain(fact)
    expect(PREDICTIONS['tr2.l3.p1'].reference()).toBe(300)
    expect([stepModel.gapOff(1000, 500), stepModel.clockOff(1000, 500, 1200), stepModel.clockOn(1000, 500, 1200)]).toEqual([1500, 2700, 1500])
  })

  test('the night of the async level on its practice seed, on the two cards, served with overlap off and on', () => {
    expect(PRACTICE_SEED).toBe(0)
    const rows: [string, (r: typeof big.off) => string][] = [
      ['Clock, µs', (r) => fmt(r.clockUs)],
      ['Median time per output token, µs', (r) => fmt(r.tpotP50Us)],
      ['The GPU\'s idle time while the CPU worked, µs', (r) => fmt(r.bubbleUs)],
      ['Fires with a dark stretch before them', (r) => `${r.darkFires} of ${r.fires}`],
      ['Ghost tokens', (r) => fmt(r.ghostTokens)],
    ]
    for (const [name, cell] of rows) mentions('tr2.l3', name, `| ${name} | ${cell(big.off)} | ${cell(big.on)} | ${cell(small.off)} | ${cell(small.on)} |`)
  })

  test('what overlap saves on each card, and what it leaves on the small one', () => {
    const pct = (before: number, after: number): string => fmt((100 * (before - after)) / before, 1)
    mentions('tr2.l3', 'big card', `the median token is ${pct(big.off.tpotP50Us, big.on.tpotP50Us)}% faster [derived] and the night ${pct(big.off.clockUs, big.on.clockUs)}% shorter [derived]`)
    mentions('tr2.l3', 'small card', `the night is ${pct(small.off.clockUs, small.on.clockUs)}% shorter [derived] and the median token ${pct(small.off.tpotP50Us, small.on.tpotP50Us)}% faster [derived]`)
    expect(big.on.bubbleUs).toBe(0)
    // About twelve times: the forward of the big card against the CPU's work.
    const fire = steadyFire('70b')
    expect(fire.forwardUs / fire.cpuUs).toBeGreaterThan(11.5)
    expect(fire.forwardUs / fire.cpuUs).toBeLessThan(12.5)
    mentions('tr2.l3', 'about twelve times', 'about twelve times [derived]')
  })

  test('the nine fires of the small card that still have a dark stretch: all admit a ticket, seven are launched one by one, two in pieces', () => {
    const dark = darkFires('small')
    mentions('tr2.l3', 'nine of the fires', `${dark.length} of its ${small.on.fires} fires [measured] still have a dark stretch`)
    expect(dark.every((fire) => fire.admits > 0)).toBe(true)
    expect(dark.filter((fire) => fire.mode === 'NONE').length).toBe(7)
    expect(dark.filter((fire) => fire.mode === 'PIECEWISE').length).toBe(2)
    mentions('tr2.l3', 'seven by kernel', 'Seven launch kernel by kernel')
    const launch = comb().eagerLaunchUs
    const forwards = dark.map((fire) => fire.forwardUs)
    const about = Math.round(forwards.reduce((a, b) => a + b, 0) / forwards.length / 10) * 10
    mentions('tr2.l3', 'the launch and the forward', `the launch alone takes ${fmt(launch)} µs [measured] against a forward of about ${fmt(about)} µs [measured]`)
    const pieces = dark.filter((fire) => fire.mode === 'PIECEWISE').map((fire) => fire.bubbleUs)
    const short = Math.round(pieces.reduce((a, b) => a + b, 0) / pieces.length / 50) * 50
    mentions('tr2.l3', 'the pieces', `fall short by about ${fmt(short)} µs [measured]`)
    expect(launch).toBeGreaterThan(about)
  })

  test('the price: every ticket stops on EOS, so each of the 24 costs a ghost token, 4.6% of the rows the night computed', () => {
    const rowsComputed = small.on.usefulTokens + small.on.ghostTokens
    mentions('tr2.l3', 'ghosts', `${fmt(small.on.ghostTokens)} of the ${fmt(rowsComputed)} rows [derived] that the night computed, or ${fmt((100 * small.on.ghostTokens) / rowsComputed, 1)}% [derived]`)
    expect([big.on.ghostTokens, small.on.ghostTokens, big.off.ghostTokens, small.off.ghostTokens]).toEqual([24, 24, 0, 0])
  })
})

describe('lesson 4: the MRV2 delta', () => {
  test('the prediction: the three phases that differ, from the presets, take 304 µs off a step of 12 rows', () => {
    const prompt = promptOf('tr2.l4', 'tr2.l4.p1')
    for (const fact of ['12 rows [estimated]', '8 µs [estimated]', '60 µs [estimated]', '31 µs [estimated]', '2 µs, 20 µs and 15 µs [estimated]']) expect(prompt).toContain(fact)
    expect(PREDICTIONS['tr2.l4.p1'].reference()).toBe(304)
    expect(mrv2SavesPerStep(12)).toBe(304)
    mentions('tr2.l4', 'the sum', `is the sum of the three phases, ${fmt(mrv2SavesPerStep(12))} µs [derived]`)
  })

  test('the night of the mrv2 level on its practice seed: the median token on each runner, and what MRV2 saves', () => {
    const small = mrv2Nights('small')
    const big = mrv2Nights('70b')
    mentions('tr2.l4', 'small', `| Small model | ${fmt(small.v1TpotUs)} | ${fmt(small.mrv2TpotUs)} | ${fmt(small.savedUs)} |`)
    mentions('tr2.l4', 'big', `| \`70B on H100\` | ${fmt(big.v1TpotUs)} | ${fmt(big.mrv2TpotUs)} | ${fmt(big.savedUs)} |`)
    expect(big.savedUs).toBe(0)
    mentions('tr2.l4', 'the share', `The saving is ${fmt((100 * small.savedUs) / small.v1TpotUs, 1)}% [derived] of the small model's token and nothing on the big model's`)
    const fire = steadyFire('70b')
    expect(fire.forwardUs / fire.cpuUs).toBeGreaterThan(11.5)
    mentions('tr2.l4', 'twelve times', 'about twelve times [derived]')
  })

  test("the closed form on the small model's host work for 12 rows: V1 and MRV2, and the four forwards", () => {
    const v1 = hostWork('v1', 12)
    const v2 = hostWork('mrv2', 12)
    mentions('tr2.l4', 'host work', `${fmt(v1.planUs + v1.readUs)} µs [derived] on V1 and ${fmt(v2.planUs + v2.readUs)} µs [derived] on MRV2`)
    for (const row of runnerRegimes([1225, 900, 600, 300])) mentions('tr2.l4', `forward ${row.forwardUs}`, `| ${fmt(row.forwardUs)} | ${fmt(row.v1IdleUs)} | ${fmt(row.mrv2IdleUs)} | ${fmt(row.savedUs)} |`)
    const saved = runnerRegimes([600, 300]).map((row) => row.savedUs)
    expect(saved).toEqual([mrv2SavesPerStep(12), mrv2SavesPerStep(12)])
    mentions('tr2.l4', 'the regime', `takes ${fmt(mrv2SavesPerStep(12))} µs [derived] out of every step`)
  })
})

describe('lesson 5: CUDA graphs', () => {
  const c = comb()

  test('the prediction: 12 kernels on each of 28 layers at 6 µs, against a replay of 30 µs, saves 1,986 µs', () => {
    const prompt = promptOf('tr2.l5', 'tr2.l5.p1')
    for (const fact of ['12 kernels [estimated]', '28 layers [estimated]', '6 µs [estimated]', '30 µs [estimated]']) expect(prompt).toContain(fact)
    expect([c.kernelsPerLayer, c.layers, c.launchPerKernelUs, c.replayUs]).toEqual([12, 28, 6, 30])
    expect(PREDICTIONS['tr2.l5.p1'].reference()).toBe(1986)
  })

  test('the comb: 336 calls and 2,016 µs eagerly, 57 calls in pieces, 1 call as one graph, against a forward of 1,225 µs', () => {
    mentions('tr2.l5', 'the comb', `A step then makes ${fmt(c.eagerCalls)} calls [derived] and spends ${fmt(c.eagerLaunchUs)} µs [derived] of CPU time launching`)
    mentions('tr2.l5', 'the forward', `${fmt(steadyFire('small').forwardUs)} µs [measured], from the \`async\` level's practice night`)
    mentions('tr2.l5', 'the calls', `For the small model's 28 layers that is ${fmt(c.piecewiseCalls)} calls [measured], where an eager launch makes ${fmt(c.eagerCalls)} and a full graph makes 1 [measured]`)
    mentions('tr2.l5', 'the pieces', `The model counts it as ${c.layers + 1} replays and ${c.piecewiseCalls - c.layers - 1} attention launches [measured]`)
    expect([c.piecewiseCalls, c.fullLaunchUs]).toEqual([57, 30])
  })

  test("vLLM's default list has 51 sizes, and the padding of ten batches of decode rows", () => {
    expect(DEFAULT_SIZES.length).toBe(51)
    mentions('tr2.l5', 'the list', `the list has ${DEFAULT_SIZES.length} sizes [derived], up to ${DEFAULT_SIZES[DEFAULT_SIZES.length - 1]}`)
    for (const row of padRows([1, 3, 5, 9, 10, 17, 33, 100, 250, 257])) mentions('tr2.l5', `rows ${row.rows}`, `| ${row.rows} | ${row.padded} | ${row.wasted} |`)
    const rows = padRows(Array.from({ length: 255 }, (_, i) => i + 1))
    expect(Math.max(...rows.map((row) => row.wasted ?? 0))).toBe(7)
    expect(Math.max(...padRows([257, 300, 400, 500]).map((row) => row.wasted ?? 0))).toBe(15)
    mentions('tr2.l5', 'at most', 'The wasted rows are at most 7 [derived] below 256, because the sizes step by 8, and at most 15 [derived] above it')
    mentions('tr2.l5', 'in proportion', `Seven rows wasted on a batch of 9 is ${fmt((100 * 7) / 9)}% [derived] more rows than the batch has, and on a batch of 33 it is ${fmt((100 * 7) / 33)}% [derived]`)
  })

  test('the comb stage and the sizes stage on their practice seed', () => {
    const night = combNight()
    mentions('tr2.l5', 'calls', `| Calls to launch one steady fire | ${fmt(night.eagerCalls)} | ${fmt(night.graphCalls)} |`)
    mentions('tr2.l5', 'clock', `| Clock, µs | ${fmt(night.eager.clockUs)} | ${fmt(night.graphs.clockUs)} |`)
    mentions('tr2.l5', 'tpot', `| Median time per output token, µs | ${fmt(night.eager.tpotP50Us)} | ${fmt(night.graphs.tpotP50Us)} |`)
    mentions('tr2.l5', 'idle', `| The GPU's idle time while the CPU worked, µs | ${fmt(night.eager.bubbleUs)} | ${fmt(night.graphs.bubbleUs)} |`)
    const cut = (before: number, after: number): string => fmt((100 * (before - after)) / before, 1)
    mentions('tr2.l5', 'the cuts', `removes ${cut(night.eager.bubbleUs, night.graphs.bubbleUs)}% [derived] of the dark stretches, ${cut(night.eager.tpotP50Us, night.graphs.tpotP50Us)}% [derived] of the median token and ${cut(night.eager.clockUs, night.graphs.clockUs)}% [derived] of the night`)
    mentions('tr2.l5', 'what remains', `The ${fmt(night.graphs.bubbleUs)} µs [measured] that remain are the nine fires of the third lesson`)
    const sizes = sizesNight()
    mentions('tr2.l5', 'naive molds', `| vLLM's own list cut to three | ${sizes.naiveMolds.join(', ')} | ${fmt(sizes.naiveCost)} |`)
    mentions('tr2.l5', 'best molds', `| The best three | ${sizes.houseMolds.join(', ')} | ${fmt(sizes.houseCost)} |`)
    expect([sizes.batches.length, Math.min(...sizes.batches), Math.max(...sizes.batches), sizes.molds]).toEqual([40, 7, 11, 3])
    expect(sizes.uncapturedByNaive).toBe(40)
    mentions('tr2.l5', 'the histogram', `drawn from a histogram whose batches are ${Math.min(...sizes.batches)} to ${Math.max(...sizes.batches)} rows [measured]`)
  })
})

describe('lesson 6: dispatch keys, modes and memory', () => {
  test('the prediction: a rail of 12 with vLLM\'s sizes for it, in FULL_AND_PIECEWISE, captures 12 graphs', () => {
    expect(dispatchSizes()).toEqual([1, 2, 4, 8, 12, 16, 24])
    expect(DISPATCH_RAIL).toEqual({ maxNumSeqs: 12, maxBatchedTokens: 2048, maxLoras: 2 })
    expect(promptOf('tr2.l6', 'tr2.l6.p1')).toContain('1, 2, 4, 8, 12, 16 and 24 [derived]')
    expect(PREDICTIONS['tr2.l6.p1'].reference()).toBe(12)
    expect(graphCounts().map((row) => [row.mode, row.graphs])).toEqual([
      ['NONE', 0],
      ['PIECEWISE', 7],
      ['FULL', 7],
      ['FULL_DECODE_ONLY', 5],
      ['FULL_AND_PIECEWISE', 12],
    ])
  })

  test('the five batches of the table of cases, as each runner dispatches them', () => {
    const table = dispatchTable()
    expect(table.length).toBe(DISPATCH_CASES.length)
    for (const row of table) {
      const pick = (side: typeof row.v2): string => `\`${side.mode}\`, ${fmt(side.tokens)} tokens${side.adapters > 0 ? `, adapter case ${side.adapters}` : ''}`
      mentions('tr2.l6', row.name, `| ${row.name} | ${pick(row.v2)} | ${pick(row.v1)} |`)
      // The two runners agree on every one of the five rows, which the lesson says.
      expect(row.v2).toEqual(row.v1)
    }
    mentions('tr2.l6', 'agree', 'The two runners agree on all five rows.')
  })

  test('the table of cases is the port\'s: two ports agree on 6,400 cases for each runner, and the owner\'s table of the pinned code\'s answers is not there', () => {
    const cases = buildCases()
    expect([cases.v2.cases.length, cases.v1.cases.length]).toEqual([6400, 6400])
    mentions('tr2.l6', 'the cases', `on ${fmt(cases.v2.cases.length)} [measured] drawn cases for each runner`)
  })

  test('the batch of the third row is a prompt chunk of 12 tokens among 8 decodes, and the last is 11 decodes and a chunk of 20, within the rail of 12', () => {
    const [, , chunk, , last] = DISPATCH_CASES
    expect([chunk.rows, chunk.tokens, chunk.uniform]).toEqual([9, 20, false])
    expect([last.rows, last.tokens, last.uniform]).toEqual([12, 31, false])
    for (const c of DISPATCH_CASES) expect(c.rows).toBeLessThanOrEqual(DISPATCH_RAIL.maxNumSeqs)
    // The largest captured size is 24, so a batch of 31 tokens has no graph.
    expect(Math.max(...dispatchSizes())).toBe(24)
  })

  test('what runs when each mode meets each level of support', () => {
    const table = modeTable()
    const levels = ['ALWAYS', 'UNIFORM_BATCH', 'UNIFORM_SINGLE_TOKEN_DECODE', 'NEVER']
    for (const [requested, row] of Object.entries(table)) {
      const cell = (support: string): string => (row[support] === 'refused' ? 'the engine refuses' : `\`${row[support]}\``)
      mentions('tr2.l6', requested, `| \`${requested}\` | ${levels.map(cell).join(' | ')} |`)
    }
    // The cell the lesson dwells on: asking for FULL on a backend that replays uniform batches gets the pair of modes.
    expect(table.FULL.UNIFORM_SINGLE_TOKEN_DECODE).toBe('FULL_AND_PIECEWISE')
  })

  test('the graphs of each mode on the rail of 12, what a cap of 2 adapters does to them, and the default list of a server of 256', () => {
    for (const row of graphCounts()) mentions('tr2.l6', row.mode, `| \`${row.mode}\` | ${row.graphs} | ${fmt(row.mib, 1)} |`)
    const withLora = graphCounts(true).find((row) => row.mode === 'FULL_AND_PIECEWISE')!
    expect(withLora.graphs).toBe(2 * graphCounts().find((row) => row.mode === 'FULL_AND_PIECEWISE')!.graphs)
    mentions('tr2.l6', 'doubling', `doubles the graphs, from ${graphCounts().find((row) => row.mode === 'FULL_AND_PIECEWISE')!.graphs} [measured] to ${withLora.graphs} [measured] in \`FULL_AND_PIECEWISE\``)
    const all = defaultGraphs()
    mentions('tr2.l6', 'the default list', `captures ${all.graphs} graphs [measured], which the model prices at ${fmt(all.mib)} MiB [estimated]`)
  })

  test('the memory: 8 MiB and 16 KiB a graph, and the KV cache with the graphs ignored and taken off first', () => {
    const k = kvAfterGraphs()
    const small = SMALL_CARD.spec.model.kvBytesPerToken
    expect(small).toBe(114688)
    expect(promptOf('tr2.l6', 'tr2.l6.p2')).toContain('114,688 bytes [estimated]')
    mentions('tr2.l6', 'requested', `${fmt(k.requestedBytes / 1e9, 2)} GB requested [derived]`)
    mentions('tr2.l6', 'non-KV', `${fmt(k.nonKvBytes / 1e9, 1)} GB of weights and activations [estimated]`)
    mentions('tr2.l6', 'the rows', `| With the graphs ignored | ${fmt((k.requestedBytes - k.nonKvBytes) / 1e9, 1)} | ${fmt(k.kvTokensWithout)} |`)
    mentions('tr2.l6', 'with the graphs', `| With the graphs taken off first | ${fmt(k.kvBytes / 1e9, 1)} | ${fmt(k.kvTokensWith)} |`)
    mentions('tr2.l6', 'the cost', `The graphs cost ${fmt(k.kvTokensWithout - k.kvTokensWith)} tokens of KV cache [derived], or ${fmt((100 * (k.kvTokensWithout - k.kvTokensWith)) / k.kvTokensWithout, 1)}% [derived] of it`)
    // The second prediction asks for the same cost from rounded figures, and the answer is within its tolerance of the model's.
    const cost = k.kvTokensWithout - k.kvTokensWith
    expect(Math.abs(PREDICTIONS['tr2.l6.p2'].reference() - cost) / cost).toBeLessThanOrEqual(0.03)
    mentions('tr2.l6', 'the model price', 'The course\'s model prices a graph at 8 MiB plus 16 KiB for each token of its size [estimated]')
  })

  test('the close level on its practice seed: the night, the house, the room, and what the default sizes do to it', () => {
    const close = closePractice()
    expect(CLOSE_PRACTICE_SEED).toBe(16)
    expect([close.card, close.rail, close.budget]).toEqual(['small', 8, 128])
    mentions('tr2.l6', 'the night', `on a rail of ${close.rail} clips [measured] with a budget of ${close.budget} tokens [measured], and the room is ${fmt(close.graphRoomMiB, 3)} MiB [measured]`)
    mentions('tr2.l6', 'the naive night', `loses ${close.naiveDarkPercent}% [measured] of its clock to dark stretches: ${fmt(close.naiveDarkUs)} µs [measured] of ${fmt(close.naiveClockUs)} µs [measured]`)
    mentions('tr2.l6', 'the house', `\`FULL\` graphs at the sizes ${close.houseSizes.join(' and ')} [measured]. Its night takes ${fmt(close.houseClockUs)} µs [measured] with no dark stretch, and its two graphs take ${fmt(close.graphRoomMiB, 3)} MiB [derived], the whole room`)
    expect([close.houseMode, close.houseDarkUs, close.houseLevers.async, close.houseLevers.inputIds, close.houseLevers.runner]).toEqual(['FULL', 0, true, 'device', 'mrv2'])
    expect([close.naiveLevers.async, close.naiveLevers.inputIds, close.naiveLevers.runner, close.naiveLevers.graphMode]).toEqual([false, 'host', 'v1', 'NONE'])
    const refused = closeRefusals()
    expect(refused.defaultSizes).toEqual([1, 2, 4, 8, 16])
    expect(Object.values(refused.defaultSizesRefused)).toEqual([true, true, true, true])
    expect(refused.defaultModeAtHouseSizesRefused).toBe(true)
    mentions('tr2.l6', 'the default sizes', `vLLM's default sizes for that rail are ${refused.defaultSizes.slice(0, 4).join(', ')} and ${refused.defaultSizes[4]} [derived], and the engine refuses to start in each of the four modes that use graphs`)
    mentions('tr2.l6', 'the hand ids', `the night is served and has ${refused.handIdsViolations} dependency violations [measured]`)
    expect(refused.handIdsViolations).toBeGreaterThan(0)
  })
})

describe('lesson 7: the same loop in other engines', () => {
  test('the prediction: SGLang has a bucket at 12 where vLLM has none, so a batch of 10 wastes 4 rows fewer', () => {
    const sglang = sglangDecodeBuckets(256)
    expect(sglang.slice(0, 5)).toEqual([1, 2, 4, 8, 12])
    expect(DEFAULT_SIZES.slice(0, 6)).toEqual([1, 2, 4, 8, 16, 24])
    expect(promptOf('tr2.l7', 'tr2.l7.p1')).toContain('vLLM\'s default list has 8, 16 and 24, and SGLang\'s has 8, 12, 16 and 24 [derived]')
    expect(PREDICTIONS['tr2.l7.p1'].reference()).toBe(4)
    const pads = enginePads([10])[0]
    expect([wasted(10, pads.vllm), wasted(10, pads.sglang4090)]).toEqual([6, 2])
  })

  test('what each engine pads a decode batch to with its defaults, and where the batch has no graph', () => {
    const cell = (padded: number | null): string => (padded === null ? 'eager' : fmt(padded))
    for (const row of enginePads([9, 12, 13, 49, 161, 256])) {
      mentions('tr2.l7', `rows ${row.rows}`, `| ${row.rows} | ${cell(row.vllm)} | ${cell(row.sglang4090)} | ${cell(row.sglangH100)} | ${cell(row.mini)} |`)
    }
    // SGLang's list saves four rows on each batch of 9 to 12 rows, and nothing anywhere else below the 24 GB card's cap.
    const saved = enginePads(Array.from({ length: 48 }, (_, i) => i + 1)).filter((row) => wasted(row.rows, row.vllm) !== wasted(row.rows, row.sglang4090))
    expect(saved.map((row) => row.rows)).toEqual([9, 10, 11, 12])
    for (const row of saved) expect((wasted(row.rows, row.vllm) ?? 0) - (wasted(row.rows, row.sglang4090) ?? 0)).toBe(4)
    mentions('tr2.l7', 'four rows', 'save four rows [derived] on each batch of 9 to 12 rows [derived], and nothing anywhere else')
  })

  test("SGLang's 24 GB card stops its decode graphs at 48 and its 80 GB card at 256, and Mini-SGLang stops at 160, below 80 GiB", () => {
    expect([ENGINE_DEFAULTS['rtx-4090'].sglang.decodeGraphMaxBs.tpBelow4, ENGINE_DEFAULTS.h100.sglang.decodeGraphMaxBs.tpBelow4]).toEqual([48, 256])
    expect(Math.max(...sglangDecodeBuckets(48))).toBe(48)
    mentions('tr2.l7', 'above 48', 'A decode batch above 48 on a `24 GB` card should therefore run eagerly [derived], and the course has not run it.')
    mentions('tr2.l7', 'the mini cap', 'and 160 [measured] otherwise')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The figures                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the figures', () => {
  for (const [file, draw] of Object.entries(FIGURES)) {
    test(`${file} is the one the model draws, and it is drawn in the page's ink`, () => {
      const svg = read(`public/figures/tr2/${file}`)
      expect(svg).toBe(draw())
      // A figure has no colour and no typeface of its own (DESIGN.md; AGENTS.md rule 9).
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|font-family/)
      expect(svg).toContain('currentColor')
    })
  }

  test('every figure block of the lessons names one of them, and each is used, with the same words as the figure file for its alt', () => {
    const named = lessons.flatMap((l) => l.lesson.blocks.flatMap((b) => (b.type === 'figure' ? [b.src] : [])))
    expect(named.sort()).toEqual(Object.keys(FIGURES).map((file) => `figures/tr2/${file}`).sort())
    for (const { lesson } of lessons) for (const block of lesson.blocks) if (block.type === 'figure') expect(block.origin).toBe('generated')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The commit that the numbers name                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the commit that the numbers name', () => {
  /** The day and the commit that each "Read on <day> at `<commit>`" names, once each. */
  const named = [...new Set(lessons.flatMap((l) => [...l.text.matchAll(/(\d{4}-\d{2}-\d{2}) at `([0-9a-f]{7,40})`/g)].map((m) => `${m[1]} ${m[2]}`)))]
  const cited = named.map((pair) => pair.split(' ')[1])

  test('the lessons that print the course\'s own measurements name one commit, in code, and the day', () => {
    expect(named.length).toBe(1)
    for (const id of ['tr2.l1', 'tr2.l2', 'tr2.l3', 'tr2.l4', 'tr2.l5', 'tr2.l6', 'tr2.l7']) expect([id, /[Rr]ead on \d{4}-\d{2}-\d{2} at `[0-9a-f]{7,40}`/.test(lessonOf(id).text)]).toEqual([id, true])
  })

  test('it is a commit of this repository, when the history is here to say so', () => {
    // The numbers themselves are recomputed above on every run, so a model that moves them fails there and names the figure. The commit is
    // where they were read, and a lesson that cites one that this history does not have cites a commit that never existed.
    const git = (...args: string[]) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
    for (const sha of cited) {
      if (git('cat-file', '-e', `${sha}^{commit}`).status !== 0) continue // a shallow clone does not have it
      expect(git('merge-base', '--is-ancestor', sha, 'HEAD').status).toBe(0)
    }
  })
})
