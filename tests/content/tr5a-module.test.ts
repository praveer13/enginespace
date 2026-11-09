/*
 * W1-T25: TR5a's module and lessons (docs/TRACKER.md, "TR5a content"). The task's acceptance is the checks of W1-T15, and this file holds
 * each of them to the real content:
 *
 *   1. verify:content, verify:claims and verify:numbers pass: the module, its four lessons and its claims compile with no diagnostic.
 *   2. Every lesson has a prediction, a game or an item, and an exit check that names the knowledge components it tests.
 *   3. Reading minutes fall within 20% of the declared minutes.
 *   4. The module and its lessons are in review.
 *
 * Beyond those, four things TR5a owes the rest of the course:
 *
 *   - It has no GPU part, and says so (D-039 places the GPU parts of TR1, TR6 and TR8; ASSESSMENT §9 says TR5a has none). The connector side of the
 *     manager is TR5b's, and the module says it is not built yet.
 *   - It says, in the module and in the fourth lesson, that adapter pages in one pool are S-LoRA's design and that the engines at the pins use slots
 *     (D-042), and it measures the pool against slots.
 *   - Every number a lesson prints from the model or from The Reach-In is recomputed here from `tests/content/tr5a-demos.ts`, and every figure is
 *     the one `tests/content/tr5a-figures.ts` draws, so a model that moves a number names the lesson and the figure that went stale.
 *   - The claims TR5a adds (content/claims/tr5a.yaml) are read at the pins, at a tag or a commit, with the lines of their quotes.
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { compiledLessonSchema, compiledModuleSchema } from '@es/schema'
import type { CompiledBlock, ProseFlow, ProseInline } from '@es/schema'
import { lockFileSchema } from '@es/schema/lock'
import { familyById } from '../../packages/play/items/registry'
import { POOL } from '../../packages/play/pool/entry'
import { buildLevel } from '../../packages/play/pool/levels'
import { HYBRID_KV_CHECKS, HYBRID_KV_KCS } from '../../packages/sim/forge/hybrid-kv'
import { compileContent, MINUTES_TOLERANCE } from '../../scripts/content/build.ts'
import {
  HIT_A,
  HIT_B,
  LENGTHS,
  MODELS,
  PREDICTIONS,
  acceptedEdges,
  adapterRows,
  alignmentOf,
  bandedSeeds,
  groupCount,
  hitLoop,
  inflation,
  layoutAt,
  layoutOf,
  lengthRow,
  modelHit,
  permilleOf,
  plannerGroupSize,
  requestsFit,
  savedPercent,
  shelfDemo,
  shelfSweep,
  slidingAt,
  slotIdlePercent,
  stateHit,
  stateRow,
  warningHundredths,
  wrongHits,
} from './tr5a-demos.ts'
import { FIGURES } from './tr5a-figures.ts'
import { read, repo } from './support.ts'

const SLOW = 120_000

const LESSON_FILES = [
  'content/modules/tr5a/lessons/l1-why-one-model-needs-several-kv-caches.md',
  'content/modules/tr5a/lessons/l2-one-pool-one-page-size.md',
  'content/modules/tr5a/lessons/l3-a-prefix-hit-must-hold-in-every-group.md',
  'content/modules/tr5a/lessons/l4-adapters-as-pages-and-upstreams-slots.md',
] as const
const MODULE_FILE = 'content/modules/tr5a/module.md'
const CLAIMS_FILE = 'content/claims/tr5a.yaml'

const result = compileContent({ root: repo })
const lessons = LESSON_FILES.map((file) => {
  const slug = path.basename(file, '.md')
  const out = result.outputs.find((o) => o.path === `src/content/generated/lessons/tr5a.${slug}.json`)
  if (out === undefined) throw new Error(`the compiler wrote no lesson for ${file}`)
  return { file, slug, text: read(file), lesson: compiledLessonSchema.parse(JSON.parse(out.text)) }
})
const moduleOut = result.outputs.find((o) => o.path === 'src/content/generated/modules/tr5a.json')
if (moduleOut === undefined) throw new Error('the compiler wrote no module for tr5a')
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

/** The prompt of a lesson's prediction. */
function promptOf(id: string): string {
  const lessonId = id.slice(0, id.lastIndexOf('.'))
  const block = lessonOf(lessonId).lesson.blocks.find((b) => b.type === 'predict' && b.id === id)
  if (block === undefined || block.type !== 'predict') throw new Error(`no prediction ${id}`)
  return block.prompt
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The checks of W1-T15                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('check 1: TR5a compiles with no diagnostic of any kind', () => {
  test('the module, four lessons and the claims file are in the compiled course', () => {
    expect(module_.id).toBe('tr5a')
    expect(lessons.map((l) => l.lesson.id)).toEqual(['tr5a.l1', 'tr5a.l2', 'tr5a.l3', 'tr5a.l4'])
    expect(result.claims.some((record) => record.file === CLAIMS_FILE)).toBe(true)
  })

  test('nothing in the module, its lessons or its claims is reported', () => {
    const mine = result.diagnostics.filter((d) => d.file.startsWith('content/modules/tr5a/') || d.file === CLAIMS_FILE)
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
        // Every prediction is one the model computes at the reveal.
        expect([block.id, PREDICTIONS[block.id] !== undefined]).toEqual([block.id, true])
        if (block.answer.kind === 'numeric') expect([block.id, block.answer.unit]).toEqual([block.id, PREDICTIONS[block.id].unit])
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

  test("the lessons, which carry the game levels, the lab's stages and the exit items, add up to the module's browser hours, within 10%", () => {
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
/* What TR5a teaches                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('what the lessons teach', () => {
  const graph = readFileSync(path.join(repo, 'content/kc/graph.yaml'), 'utf8')
  const tr5aKcs = [...graph.matchAll(/^- id: (tr5a\.[a-z0-9-]+)$/gm)].map((m) => m[1])

  test("every KC of TR5a is taught by a lesson, and no lesson teaches another module's", () => {
    const taught = new Set(lessons.flatMap((l) => l.lesson.kcs))
    expect(tr5aKcs.length).toBe(8)
    expect(tr5aKcs.filter((kc) => !taught.has(kc))).toEqual([])
    expect([...taught].filter((kc) => !tr5aKcs.includes(kc))).toEqual([])
  })

  test('the lessons follow the curriculum: four lessons, in its order, with its titles', () => {
    expect(lessons.map((l) => l.lesson.title)).toEqual([
      'Why one model needs several KV caches',
      "One pool, one page size: vLLM's hybrid manager and its five cases",
      'A prefix hit must hold in every group',
      "Adapters as pages: S-LoRA's design, and upstream's slots",
    ])
  })

  test('every game block names a level of The Reach-In, a graded block a level that grades, and all seven levels are played', () => {
    const used = new Set<string>()
    for (const { lesson } of lessons) {
      for (const block of lesson.blocks) {
        if (block.type !== 'game') continue
        expect([lesson.id, block.id]).toEqual([lesson.id, 'pool'])
        const level = POOL.levels.find((l) => l.id === block.level)
        expect([lesson.id, block.level, level !== undefined]).toEqual([lesson.id, block.level, true])
        if (block.mode === 'graded') expect([block.level, level?.graded]).toEqual([block.level, true])
        used.add(block.level)
      }
    }
    expect([...used].sort()).toEqual(POOL.levels.map((l) => l.id).sort())
  })

  test('each graded level is played in practice first, in the lesson that teaches it, and the three graded levels close lessons 3 and 4', () => {
    const modes = (id: string) => lessonOf(id).lesson.blocks.flatMap((b) => (b.type === 'game' ? [`${b.level}/${b.mode}`] : []))
    expect(modes('tr5a.l1')).toEqual(['one-group/practice', 'two-kinds/practice'])
    expect(modes('tr5a.l2')).toEqual(['same-size/practice', 'state/practice'])
    expect(modes('tr5a.l3')).toEqual(['evict/practice', 'evict/graded'])
    expect(modes('tr5a.l4')).toEqual(['adapters/practice', 'adapters/graded', 'manager/graded'])
  })

  test('the KCs a lesson promises are earned by something that exists: a graded level, a stage of the lab, or the family that waits to be built', () => {
    const byGame = new Set(POOL.kcs)
    const stageKcs = (stage: string): readonly string[] => {
      const check = HYBRID_KV_CHECKS[Number(stage.slice(1)) - 1]
      return HYBRID_KV_KCS[check.id] ?? []
    }
    for (const { lesson } of lessons) {
      const stages = lesson.blocks.flatMap((b) => (b.type === 'lab' ? b.stages : []))
      const byLab = new Set(stages.flatMap(stageKcs))
      const hasItems = lesson.blocks.some((b) => b.type === 'item')
      // The one KC with no level and no stage: its item family is the module's own, and a lesson's exit ticket draws it.
      const WAITING_FOR_ITEMS = new Set(['tr5a.slots-vs-pages'])
      for (const kc of lesson.kcs) {
        const earned = byGame.has(kc) || byLab.has(kc) || (WAITING_FOR_ITEMS.has(kc) && hasItems)
        expect([lesson.id, kc, earned]).toEqual([lesson.id, kc, true])
      }
    }
  })

  test("the lab's six stages are each in one lesson, and a stage that assesses KCs sits in a lesson that teaches one of them", () => {
    const seen: string[] = []
    for (const { lesson } of lessons) {
      for (const block of lesson.blocks) {
        if (block.type !== 'lab') continue
        expect([lesson.id, block.id, block.lane]).toEqual([lesson.id, 'hybrid-kv', 'B'])
        for (const stage of block.stages) {
          seen.push(stage)
          const check = HYBRID_KV_CHECKS[Number(stage.slice(1)) - 1]
          const assessed = (HYBRID_KV_KCS[check.id] ?? []).filter((kc) => kc.startsWith('tr5a.'))
          if (assessed.length > 0) expect([lesson.id, stage, assessed.some((kc) => lesson.kcs.includes(kc))]).toEqual([lesson.id, stage, true])
        }
      }
    }
    expect(seen.sort()).toEqual(['s1', 's2', 's3', 's4', 's5', 's6'])
    expect(HYBRID_KV_CHECKS.map((c) => c.stage)).toEqual([1, 2, 3, 4, 5, 6])
  })

  test('an item block names a TR5a family and a level it can be drawn at; a built family assesses only KCs its lesson teaches; the four still to build are named', () => {
    const TO_BUILD = ['tr5a.blocks-held', 'tr5a.hit-length', 'tr5a.pages-for-adapter', 'tr5a.slots-vs-pages']
    const named = new Set<string>()
    for (const { lesson } of lessons) {
      for (const block of lesson.blocks) {
        if (block.type !== 'item') continue
        expect(block.family.startsWith('tr5a.')).toBe(true)
        expect([block.level]).toEqual([block.family === 'tr5a.blocks-held' && lesson.id === 'tr5a.l2' ? 3 : 2])
        named.add(block.family)
        const gen = familyById(block.family)
        if (gen === undefined) expect(TO_BUILD).toContain(block.family)
        else for (const kc of gen.kcs) expect([lesson.id, block.family, lesson.kcs.includes(kc)]).toEqual([lesson.id, block.family, true])
      }
    }
    expect([...named].sort()).toEqual(TO_BUILD)
  })

  test('an exit ticket is three items on fresh seeds (ASSESSMENT §4.2)', () => {
    for (const { lesson } of lessons) {
      const items = exitCheck(lesson.blocks)?.blocks.flatMap((block) => (block.type === 'item' ? [block.count] : [])) ?? []
      expect([lesson.id, items.reduce((a, b) => a + b, 0)]).toEqual([lesson.id, 3])
    }
  })

  test('the Pool is called by its display name and its three vocabularies, with the engine word first', () => {
    // GAMES.md §2.6: the kitchen word beside the engine term, once, where the game first appears in a lesson.
    expect(lessonOf('tr5a.l1').text).toContain('a group is a **station**, a page is a **hotel pan** in the reach-in, a request is a **ticket**')
    expect(lessonOf('tr5a.l3').text).toContain('the free queue is **the rotation**, evicting a page is **dumping a pan**, and a prefix hit is **shared mise**')
    expect(lessonOf('tr5a.l4').text).toContain('an adapter is a **recipe kit**')
    expect(POOL.title).toBe('The Reach-In')
  })
})

describe('the module says what it is, and what it is not (D-039, D-042)', () => {
  test('it has no GPU part: lane B throughout, no trace, and the lab is a forge lab with six stages', () => {
    expect(module_.lanes).toEqual(['B'])
    expect(module_.hours_by_lane).toEqual({ B: 6 })
    expect(module_.artifacts.map((a) => [a.id, a.lane])).toEqual([['hybrid-kv', 'B']])
    const labs = module_.blocks.filter((block) => block.type === 'lab')
    expect(labs).toEqual([{ type: 'lab', id: 'hybrid-kv', lane: 'B', stages: ['s1', 's2', 's3', 's4', 's5', 's6'] }])
    for (const { lesson } of lessons) {
      expect([lesson.id, lesson.lanes]).toEqual([lesson.id, ['B']])
      expect([lesson.id, lesson.blocks.filter((b) => b.type === 'trace').length]).toEqual([lesson.id, 0])
      for (const block of lesson.blocks) if (block.type === 'lab') expect(block.lane).toBe('B')
    }
    expect(moduleText).toContain('TR5a has no GPU part')
  })

  test('it says that the engines are read and not run, and that the connector side is TR5b, which is not built yet', () => {
    expect(moduleText).toContain('The pinned engines are read in their source and are not run.')
    expect(moduleText).toContain('Both are TR5b\'s. That module is not built yet, and it arrives with the GPU modules in the second part of the course.')
  })

  test("the module page and the fourth lesson say what the pins do with adapters: vLLM's slots, its CPU LRU and its admission cap, and SGLang's fixed-slot pool", () => {
    for (const text of [moduleText, lessonOf('tr5a.l4').text]) {
      for (const id of ['vllm.lora.slot-count', 'vllm.lora.cpu-cache', 'vllm.lora.cpu-lru', 'vllm.lora.admission-cap', 'sglang.lora.pool']) expect([id, text.includes(`{{claim:${id}}}`)]).toEqual([id, true])
      expect(text).toContain('`max_loras` GPU slots')
      expect(text).toContain('`LoRAMemoryPool`')
    }
    expect(lessonOf('tr5a.l4').text).toContain("One pool for both is S-LoRA's design, from a paper, and it is the design you build in the lab.")
  })

  test('the module is the course.yaml entry: the same title and hours, and the same prerequisites and artifacts', () => {
    const course = read('content/course.yaml')
    expect(course).toContain('title: Hybrid KV groups, and adapter pages in one pool')
    expect(module_.title).toBe('Hybrid KV groups, and adapter pages in one pool')
    expect(module_.hours).toBe(6)
    expect(module_.prereqs).toEqual(['ks:T5.L5', 'ks:T5.L6', 'ks:T6.L9'])
    expect(module_.worlds).toEqual(['kv'])
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The claims TR5a adds                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

describe(`the claims of ${CLAIMS_FILE}`, () => {
  const lock = lockFileSchema.parse(JSON.parse(read('course.lock.json')))
  const entry = (key: string) => {
    const found = lock.entries.find((e) => e.key === key)
    if (found === undefined) throw new Error(`course.lock.json has no ${key}`)
    return found
  }
  const mine = result.claims.filter((record) => record.file === CLAIMS_FILE).map((record) => record.claim)

  /** The one ref a source of this kind may be read at: the pin's tag for an engine, a full commit for kernelspace, a version of the paper. */
  const ENGINES: readonly { readonly name: string; readonly pattern: RegExp }[] = [
    { name: 'vLLM at the pinned tag', pattern: new RegExp(`^https://github\\.com/vllm-project/vllm/blob/v${entry('vllm').version}/[^#]+#L\\d+(?:-L\\d+)?$`) },
    { name: 'SGLang at the pinned tag', pattern: new RegExp(`^https://github\\.com/sgl-project/sglang/blob/v${entry('sglang').version}/[^#]+#L\\d+(?:-L\\d+)?$`) },
  ]
  const OTHERS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
    { name: 'S-LoRA at its v3', pattern: /^https:\/\/arxiv\.org\/html\/2311\.03285v3(?:#S\d(?:\.SS\d)?)?$/ },
    { name: 'kernelspace at its pinned commit', pattern: /^https:\/\/github\.com\/praveer13\/kernelspace\/blob\/d478f91[0-9a-f]{33}\/[^#]+#L\d+(?:-L\d+)?$/ },
  ]

  test('are many, and every one is measured', () => {
    expect(mine.length).toBeGreaterThanOrEqual(25)
    for (const claim of mine) expect([claim.id, claim.tag]).toEqual([claim.id, 'measured'])
  })

  test("begin their ids with their pin, or with kv when their source is not an engine's", () => {
    for (const claim of mine) {
      if (claim.pin !== undefined) expect([claim.id, claim.id.startsWith(`${claim.pin}.`)]).toEqual([claim.id, true])
      else expect([claim.id, claim.id.startsWith('kv.')]).toEqual([claim.id, true])
    }
  })

  test("a claim that names a pin names a key of the lockfile, and cites a file of that pin's tag, with the lines of its quote", () => {
    for (const claim of mine) {
      const url = claim.source?.url ?? ''
      if (claim.pin === undefined) {
        expect([claim.id, OTHERS.some((rule) => rule.pattern.test(url))]).toEqual([claim.id, true])
        continue
      }
      expect(lock.entries.some((e) => e.key === claim.pin)).toBe(true)
      expect([claim.id, ENGINES.some((rule) => rule.pattern.test(url))]).toEqual([claim.id, true])
      expect([claim.id, url.includes(`/blob/v${entry(claim.pin).version}/`)]).toEqual([claim.id, true])
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

  test("a figure of someone else's own run says the course has not reproduced it", () => {
    const headline = mine.find((c) => c.id === 'kv.slora.headline-results')
    expect(headline?.text).toContain('the course has not reproduced it')
  })

  test('every claim of the file is read: cited by a lesson or the module', () => {
    const cited = new Set<string>()
    for (const text of [...lessons.map((l) => l.text), moduleText]) {
      for (const m of text.matchAll(/\{\{claim:([a-z0-9.-]+)\}\}/g)) cited.add(m[1])
    }
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

describe('lesson 1: what each kind of group holds', () => {
  test('the prediction: a request of 4,096 tokens holds 260 pages in the design document\'s model', () => {
    const prompt = promptOf('tr5a.l1.p1')
    for (const fact of ['4,096 tokens [estimated]', '16 tokens in a block [estimated]', 'a 32-token window [estimated]']) expect(prompt).toContain(fact)
    expect(PREDICTIONS['tr5a.l1.p1'].reference()).toBe(260)
  })

  test('the lengths: 112, 1,024 and 4,096 tokens, and what three full groups would hold', () => {
    for (const tokens of LENGTHS) {
      const row = lengthRow(tokens)
      mentions('tr5a.l1', `${tokens} tokens`, `| ${fmt(tokens)} | ${row.full} | ${row.sliding} | ${row.total} | ${row.allFull} |`)
    }
    // The document's example: 7 + 2 + 2 = 11, where three full-attention groups would hold 21.
    const doc = lengthRow(112)
    expect([doc.full, doc.sliding, doc.total, doc.allFull]).toEqual([7, 2, 11, 21])
    mentions('tr5a.l1', 'the example', 'so the request holds 7 + 2 + 2 = 11 pages, where three full-attention groups would hold 21 [derived]')
    const saved = LENGTHS.map((t) => savedPercent(lengthRow(t)))
    mentions('tr5a.l1', 'the saving', `the saving grows with the request: ${saved[0]}%, ${saved[1]}% and ${saved[2]}% of the pages [derived]`)
    expect(saved[0] < saved[1] && saved[1] <= saved[2]).toBe(true)
  })

  test('a window is not a block count: 2 pages at 111 and 112 tokens, 3 at 110 and at 113, and 14 pages for the request at 113', () => {
    expect([110, 111, 112, 113].map(slidingAt)).toEqual([3, 2, 2, 3])
    expect(lengthRow(113).total).toBe(14)
    mentions('tr5a.l1', 'one token more', 'at 113 tokens each sliding group holds 3 pages and the request 14, not 11 [derived]')
  })

  test('a pool buys requests: 1,560 pages hold 6 requests of 4,096 tokens, and 2 if all three groups were full', () => {
    expect(requestsFit(1560, 4096)).toEqual({ hybrid: 6, allFull: 2 })
    mentions('tr5a.l1', 'the pool', 'a pool of 1,560 pages [estimated] holds 6 requests of 4,096 tokens in this model, and only 2 if all three groups were full attention [derived]')
  })

  test('the state model: 128 pages in the attention group and 2 in each of 3 state groups, 134 in all, where 4 full groups would hold 512', () => {
    const row = stateRow(4096)
    expect([row.full, row.state, row.groups - 1, row.total, row.allFull]).toEqual([128, 2, 3, 134, 512])
    mentions('tr5a.l1', 'the state model', 'a request of 4,096 tokens holds 128 pages in the attention group, whose block has grown to 32 tokens, and 2 in each of 3 state groups, 134 in all, where 4 full groups would hold 512 [derived]')
  })

  test('the figure draws the document\'s request: the kept blocks, and the pages that hold them', () => {
    const svg = read('public/figures/tr5a/l1-block-tables.svg')
    const kept = [...svg.matchAll(/<text x="[\d.]+" y="[\d.]+">p(\d+)<\/text>/g)].map((m) => Number(m[1]))
    expect(kept).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    // Seven filled squares in the full row, and two in each sliding row; five struck through in each of those.
    expect((svg.match(/<rect /g) ?? []).length).toBe(21)
    expect((svg.match(/L\d+ \d+/g) ?? []).length).toBe(10)
  })
})

describe('lesson 2: how the layers become groups of one page size', () => {
  test('the first prediction: 12 sliding and 13 full layers make 2 groups', () => {
    const prompt = promptOf('tr5a.l2.p1')
    expect(prompt).toContain('12 sliding-window layers and 13 full-attention layers [estimated]')
    expect(PREDICTIONS['tr5a.l2.p1'].reference()).toBe(2)
    expect(groupCount(13, 12)).toBe(2)
  })

  test('the second prediction: the attention block grows from 16 tokens to 32, and the state fits it exactly', () => {
    const prompt = promptOf('tr5a.l2.p2')
    for (const fact of ['1,024 bytes a token each [estimated]', '32,768 bytes each [estimated]', '16 tokens [estimated]']) expect(prompt).toContain(fact)
    const grown = inflation()
    expect([grown.baseTokens, grown.blockTokens]).toEqual([16, 32])
    expect(PREDICTIONS['tr5a.l2.p2'].reference()).toBe(32)
    expect(16 * 1024).toBe(16384)
    expect(grown.blockTokens * 1024).toBe(32768)
    mentions('tr5a.l2', 'the block', 'A layer\'s block of 16 tokens is 16,384 bytes [derived], half of its state, so the block grows to 32 tokens [derived] and the state fits it exactly.')
  })

  test("Gemma-3-27b: the group size is 10, 7 groups, 8 padding layers in 70 slots, spread as four groups of 9 and two of 8", () => {
    const l = layoutOf(10, 52)
    expect([l.groupSize, l.groups, l.padding, l.slots]).toEqual([10, 7, 8, 70])
    expect(plannerGroupSize(10, 52)).toBe(10)
    mentions('tr5a.l2', 'the groups', 'which is 10 here [derived]. That is one full group and 6 sliding groups [derived], and 6 groups of 10 layers hold 60 slots for 52 sliding layers, so 8 of them are padding.')
    mentions('tr5a.l2', 'the spread', 'so four groups have 9 layers and 1 of padding, and two have 8 layers and 2 of padding [derived]')
    // 52 layers over 6 groups: four of 9 and two of 8, as `layers[i::6]` gives.
    expect([0, 1, 2, 3, 4, 5].map((i) => Math.ceil((52 - i) / 6))).toEqual([9, 9, 9, 9, 8, 8])
  })

  test("the waste: 8 of 70 slots is 11.4%, vLLM's bound is 8 of 52 layers, 15.4%, and a request of 4,096 tokens wastes 3.2 pages' worth of 280, 1.1%", () => {
    const l = layoutOf(10, 52)
    expect(l.wastePermille).toBe(114)
    expect(permilleOf(l.padding, l.slots)).toBe(114)
    expect(warningHundredths(8, 52)).toBe(1538)
    mentions('tr5a.l2', 'the two shares', 'the course says 8 of 70 slots, 11.4% [derived], and the warning\'s bound is 8 of 52 layers, 15.4% [derived]')
    // The `same-size` model, with its synthetic window of 64 tokens: pages held at 4,096 tokens, and the padding in them in tenths of a page.
    const pages = { full: 256, sliding: 4 }
    const spec = layoutOf(10, 52)
    expect(spec.groups).toBe(7)
    const padded = [1, 1, 1, 1, 2, 2].reduce((sum, pad) => sum + (pages.sliding * pad) / spec.groupSize, 0)
    expect(padded).toBeCloseTo(3.2, 10)
    const held = pages.full + 6 * pages.sliding
    expect(held).toBe(280)
    expect(Math.round((1000 * padded) / held) / 10).toBe(1.1)
    mentions('tr5a.l2', 'a long request', "with a window of 64 tokens [estimated], holds 256 pages in the full group, which has no padding, and 4 in each sliding group, so the padding is 3.2 pages' worth of the request's 280 pages, 1.1% [derived]")
  })

  test('the 1.5 rule: 13 and 12 layers take a size of 13 (2 groups, 1 padding layer, 26 slots), where a size of 12 would take 3 groups, 11 and 36', () => {
    expect(plannerGroupSize(13, 12)).toBe(13)
    const l = layoutOf(13, 12)
    expect([l.groups, l.padding, l.slots]).toEqual([2, 1, 26])
    const alt = layoutAt(13, 12, 12)
    expect([alt.groups, alt.padding, alt.slots]).toEqual([3, 11, 36])
    mentions('tr5a.l2', 'the smallest-count rule', 'which is 3 groups and 11 padding layers in 36 slots, and the 1.5 rule takes 13, which is 2 groups and 1 padding layer in 26 slots [derived]')
    mentions('tr5a.l2', 'the sizes', 'The full layers make one group of 13 [derived]. The sliding layers make another, with 1 layer of padding, which is 2 groups and 26 slots for 25 layers [derived].')
  })

  test("the document's counterexample: 20 and 30 layers take a size of 20 (3 groups, 10 padding layers, 60 slots), where a size of 10 pads nothing", () => {
    expect(plannerGroupSize(20, 30)).toBe(20)
    const l = layoutOf(20, 30)
    expect([l.groups, l.padding, l.slots, l.wastePermille]).toEqual([3, 10, 60, 167])
    expect(layoutAt(20, 30, 10).padding).toBe(0)
    expect(layoutAt(20, 30, 10).groups).toBe(5)
  })

  test('the table of three models', () => {
    const rows = MODELS.map(([full, sliding]) => ({ full, sliding, ...layoutOf(full, sliding) }))
    const names = ['gpt-oss-20b with its drafter', 'Gemma-3-27b', "the document's counterexample"]
    rows.forEach((r, i) => {
      const share = (Math.round(r.wastePermille) / 10).toFixed(1)
      mentions('tr5a.l2', names[i], `| ${names[i]} | ${r.full} and ${r.sliding} | ${r.groupSize}, ${r.groups} | ${r.padding}, ${share}% |`)
    })
  })

  test('the isomorphism card says that the counterexample wastes 16.7% of its slots', () => {
    mentions('tr5a.l2', 'the card', 'that is 16.7% of the slots [derived]')
    expect(layoutOf(20, 30).wastePermille).toBe(167)
  })

  test('the figure is the document\'s memory layout: eleven rows of ten pieces, in three groups of 7, 2 and 2', () => {
    const svg = read('public/figures/tr5a/l2-one-block-many-pieces.svg')
    const groups = [...svg.matchAll(/<g fill="currentColor" fill-opacity="([\d.]+)">([\s\S]*?)<\/g>/g)].map((m) => (m[2].match(/<rect /g) ?? []).length)
    expect(groups).toEqual([70, 20, 20])
  })
})

describe('lesson 3: the hit that every group accepts', () => {
  test('the first prediction: the sliding groups hold blocks 6 to 8 and 7 to 9, and the hit is the edge 9, 144 tokens', () => {
    const prompt = promptOf('tr5a.l3.p1')
    for (const fact of ['16 tokens in a block [estimated]', 'a 32-token window [estimated]', 'a prompt of 176 tokens [estimated]', 'the blocks numbered 0 to 9 [estimated]', 'The first sliding group holds the blocks 6 to 8, and the second holds the blocks 7 to 9 [estimated]'])
      expect(prompt).toContain(fact)
    expect(PREDICTIONS['tr5a.l3.p1'].reference()).toBe(144)
    expect(modelHit(HIT_A)).toBe(144)
    expect(acceptedEdges(HIT_A)).toEqual({ full: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], sw0: [8, 9], sw1: [9, 10] })
    mentions('tr5a.l3', 'the first cache', 'the full group accepts the edges 1 to 10, the first sliding group 8 and 9, and the second 9 and 10, so the hit is the edge 9, which is 144 tokens [derived]')
  })

  test('the second cache: a gap in the first sliding group, so that the groups share no edge and the hit is 0, though the union is 160 and the shortest of the longest is 128', () => {
    expect(acceptedEdges(HIT_B)).toEqual({ full: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], sw0: [8], sw1: [9, 10] })
    expect(hitLoop(HIT_B).tokens).toBe(0)
    expect(modelHit(HIT_B)).toBe(0)
    expect(wrongHits(HIT_B)).toEqual({ union: 160, shortest: 128 })
    mentions('tr5a.l3', 'the gap', 'and holds blocks 6, 7 and 9 [estimated]. It accepts only the edge 8, the second accepts 9 and 10, and no edge is common to all three, so the hit is 0 tokens [derived], though the full group holds 160 tokens and each sliding group holds blocks.')
    mentions('tr5a.l3', 'the wrong answers', 'The union of the groups\' longest hits is 160 tokens, which the first sliding group cannot serve, and the shortest of the groups\' longest hits is 128 tokens, which the second cannot serve [derived].')
  })

  test('the loop ends in two passes on the first cache, and every prefix of the alignment is the least common multiple of the block sizes', () => {
    expect(hitLoop(HIT_A).passes).toEqual([9, 9])
    expect(alignmentOf('two-kinds')).toBe(16)
    expect(alignmentOf('state')).toBe(32)
  })

  test('the second prediction: the full group holds blocks 0 to 7 and each state group the states of blocks 2 and 5, so the hit is the edge 6, 192 tokens', () => {
    const prompt = promptOf('tr5a.l3.p2')
    for (const fact of ['32 tokens in a block [estimated]', 'a prompt of 330 tokens [estimated]', 'the blocks numbered 0 to 7 [estimated]', 'only the blocks 2 and 5 [estimated]']) expect(prompt).toContain(fact)
    const hit = stateHit()
    expect(hit.edges).toEqual([3, 6])
    expect([hit.blocks, hit.tokens, hit.model]).toEqual([6, 192, 192])
    expect(PREDICTIONS['tr5a.l3.p2'].reference()).toBe(192)
    mentions('tr5a.l3', 'the state groups', 'so the three state groups accept the edges 3 and 6 [derived]. The full group accepts every edge up to 8, so the hit is the edge 6, which is 192 tokens [derived].')
  })

  test('the figure draws both caches: the cached blocks, the edges each group accepts, and the one edge that all three accept', () => {
    const svg = read('public/figures/tr5a/l3-intersection.svg')
    const cachedSquares = (svg.match(/<g fill="currentColor" fill-opacity="0\.16">([\s\S]*?)<\/g>/)?.[1].match(/<rect /g) ?? []).length
    const gaps = (svg.match(/<g stroke-width="1" stroke-dasharray="3 3">([\s\S]*?)<\/g>/)?.[1].match(/<rect /g) ?? []).length
    const cachedBlocks = (c: typeof HIT_A) => c.full.length + c.sw0.length + c.sw1.length
    expect(cachedSquares).toBe(cachedBlocks(HIT_A) + cachedBlocks(HIT_B))
    expect(cachedSquares + gaps).toBe(2 * 3 * 11)
    const triangles = (svg.match(/Z/g) ?? []).length
    const edges = (c: typeof HIT_A) => Object.values(acceptedEdges(c)).reduce((sum, e) => sum + e.length, 0)
    expect(triangles).toBe(edges(HIT_A) + edges(HIT_B))
    // One vertical line, for the first cache's edge 9, and the second's note says there is none.
    expect((svg.match(/V\d+/g) ?? []).length).toBe(1)
    expect(svg).toContain('edge 9')
    expect(svg).toContain('no edge that all three accept')
  })
})

describe('lesson 4: adapters as pages, and as slots', () => {
  test('the prediction: an adapter of rank 16 takes 7 pages of 163,840 bytes', () => {
    const prompt = promptOf('tr5a.l4.p1')
    for (const fact of ["163,840 bytes each [estimated]", '65,536 bytes for each unit of its rank [estimated]', 'rank 16 [estimated]']) expect(prompt).toContain(fact)
    expect(PREDICTIONS['tr5a.l4.p1'].reference()).toBe(7)
    mentions('tr5a.l4', 'the weights', 'which makes 65,536 bytes for each unit of rank [derived]')
    expect(10 * 16 * 1024).toBe(163840)
    mentions('tr5a.l4', 'the page', 'has pages of 10 layers × 16 tokens × 1,024 bytes, which is 163,840 bytes [derived]')
  })

  test('the table: ranks 8, 16 and 64 take 4, 7 and 26 pages, and leave a fifth, 8.6% and 1.5% of their pages empty', () => {
    const rows = adapterRows()
    expect(rows.map((r) => r.pages)).toEqual([4, 7, 26])
    for (const r of rows) {
      const share = Math.round(r.idlePermille) / 10
      mentions('tr5a.l4', `rank ${r.rank}`, `| ${r.rank} | ${fmt(r.bytes)} | ${r.pages} | ${fmt(r.idleBytes)} | ${share % 1 === 0 ? share : share.toFixed(1)}% |`)
    }
  })

  test("the second prediction: a rank-8 adapter in a slot sized for rank 64 leaves 87.5% idle, an eighth in use", () => {
    const prompt = promptOf('tr5a.l4.p2')
    for (const fact of ['`max_lora_rank` to 64 [estimated]', 'rank 64', 'rank 8 [estimated]']) expect(prompt).toContain(fact)
    expect(PREDICTIONS['tr5a.l4.p2'].reference()).toBe(87.5)
    expect(slotIdlePercent(8, 64)).toBe(87.5)
    mentions('tr5a.l4', 'the idle slot', "uses an eighth of it, and the slot's other 87.5% [derived] is idle")
  })

  test('the pool and the shelf, on the level\'s practice seed: four ways to keep the kits, played by the house', () => {
    const seed = POOL.levels.find((l) => l.id === 'adapters')?.practiceSeed
    expect(seed).toBe(0)
    mentions('tr5a.l4', 'the seed', "with the level's practice seed `0`")
    const demo = shelfDemo(0)
    expect(demo.kits).toEqual([
      { rank: 8, pages: 4 },
      { rank: 64, pages: 26 },
    ])
    expect(demo.stallWeight).toBe(24)
    mentions('tr5a.l4', 'the biggest adapter', 'It is as wide as the biggest adapter, which is 26 pages here [derived]')
    mentions('tr5a.l4', 'the weight', 'plus 24 for each step that a request stalled for its adapter [estimated]')
    const rows: readonly [string, typeof demo.pages][] = [
      ['pages in the pool', demo.pages],
      ['one slot, outside it', demo.oneSlot],
      ['two slots, outside it', demo.twoSlots],
      ['two slots, paid for first', demo.twoSlotsPaid],
    ]
    for (const [name, night] of rows) mentions('tr5a.l4', name, `| ${name} | ${fmt(night.pans)} | ${fmt(night.recomputed)} | ${night.stalls} | ${fmt(night.cost)} |`)
    // Two slots as wide as the biggest kit come out of the reach-in: 160 pans less 52.
    expect(demo.pages.pans - 2 * 26).toBe(demo.twoSlotsPaid.pans)
    // Every night is served, and a slot costs no pans on the shelf.
    for (const [, night] of rows) expect(night.unserved).toBe(0)
    expect(demo.oneSlot.stalls).toBeGreaterThan(demo.twoSlots.stalls)
    mentions('tr5a.l4', 'too few slots', 'a request for the other adapter stalls while an adapter is swapped in, 9 steps against 2 [measured]')
    expect([demo.oneSlot.stalls, demo.twoSlots.stalls]).toEqual([9, 2])
  })

  test('over the first eight banded seeds: the totals, who costs less, and the paid pair 36% over pages', () => {
    const sweep = shelfSweep(8)
    expect(sweep.seeds).toEqual(bandedSeeds(8))
    mentions('tr5a.l4', 'the totals', `the prices of the eight nights add up to ${fmt(sweep.total.pages)} for pages, ${fmt(sweep.total.oneSlot)} for one slot, ${fmt(sweep.total.twoSlots)} for two free slots and ${fmt(sweep.total.twoSlotsPaid)} for two slots that are paid for first [measured]`)
    mentions('tr5a.l4', 'who is cheaper', `One slot costs less than pages on ${sweep.oneSlotCheaper} of the eight nights, two free slots on ${sweep.twoSlotsCheaper}, and the paid pair on ${sweep.twoSlotsPaidCheaper} [measured]`)
    const over = Math.round((100 * (sweep.total.twoSlotsPaid - sweep.total.pages)) / sweep.total.pages)
    mentions('tr5a.l4', 'the paid pair', `costs ${over}% more than pages over the eight [derived]`)
    expect(over).toBe(36)
  }, SLOW)

  test("the figure draws a slot as wide as the largest adapter: each row's solid squares are the pages the adapter takes", () => {
    const svg = read('public/figures/tr5a/l4-slot-width.svg')
    const rows = adapterRows()
    const solid = (svg.match(/<g fill="currentColor" fill-opacity="0\.16">([\s\S]*?)<\/g>/)?.[1].match(/<rect /g) ?? []).length
    const dashed = (svg.match(/<g stroke-width="1" stroke-dasharray="2 2">([\s\S]*?)<\/g>/)?.[1].match(/<rect /g) ?? []).length
    expect(solid).toBe(rows.reduce((sum, r) => sum + r.pages, 0))
    expect(solid + dashed).toBe(3 * rows[rows.length - 1].pages)
    expect(svg).toContain('a slot sized for the largest rank, 26 pages wide')
  })
})

describe('the module says what is graded, and the levels it names are those of the pool', () => {
  test('the graded `manager` level draws its model from its seed: half the seeds are lesson 2\'s page-size models', () => {
    const presets = Array.from({ length: 400 }, (_, seed) => buildLevel('manager', seed).preset)
    const share = presets.filter((p) => p === 'same-size' || p === 'state').length / presets.length
    expect(Math.abs(share - 0.5)).toBeLessThan(0.08)
    mentions('tr5a.l2', 'half the seeds', 'on half the seeds that model is one of this lesson\'s two page-size cases')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The figures                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the figures', () => {
  for (const [file, draw] of Object.entries(FIGURES)) {
    test(`${file} is the one the model draws, and it is drawn in the page's ink`, () => {
      const svg = read(`public/${file}`)
      expect(svg).toBe(draw())
      // A figure has no colour and no typeface of its own (DESIGN.md; AGENTS.md rule 9).
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|font-family/)
      expect(svg).toContain('currentColor')
    })
  }

  test('every figure block of the lessons names one of them, and each is used', () => {
    const named = lessons.flatMap((l) => l.lesson.blocks.flatMap((b) => (b.type === 'figure' ? [b.src] : [])))
    expect(named.sort()).toEqual(Object.keys(FIGURES).sort())
    for (const { lesson } of lessons) for (const block of lesson.blocks) if (block.type === 'figure') expect(block.origin).toBe('generated')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The commit that the numbers name                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the commit that the numbers name', () => {
  const cited = [...new Set(lessons.flatMap((l) => [...l.text.matchAll(/2026-11-05 at `([0-9a-f]{7,40})`/g)].map((m) => m[1])))]

  test('the lesson that prints the course\'s own measurements names one commit, in code, and the day', () => {
    expect(cited.length).toBe(1)
    expect(lessonOf('tr5a.l4').text).toContain("Measured by the course's sim on 2026-11-05 at `")
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
