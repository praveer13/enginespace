/*
 * W1-T30: TR6's module and lessons (docs/TRACKER.md, "TR6 content and the mask-overlap timeline"). The task's acceptance is the checks of
 * W1-T15, and this file holds each of them to the real content:
 *
 *   1. verify:content, verify:claims and verify:numbers pass: the module, its five lessons and its claims compile with no diagnostic.
 *   2. Every lesson has a prediction, a game or an item, and an exit check that names the knowledge components it tests.
 *   3. Reading minutes fall within 20% of the declared minutes.
 *   4. The module and its lessons are in review.
 *
 * Beyond those, three things TR6 owes the rest of the course:
 *
 *   - The GPU part is announced and never faked (D-039): a Build card on the module page, and no lab or trace in a lesson.
 *   - Every number a lesson prints from a model is recomputed here from `tests/content/tr6-demos.ts`, which runs the course's own models (the
 *     speculation sampler, The Tasting's exact arithmetic, the step loop and the item families), so that when a model moves a number this file
 *     names the lesson and the figure that went stale. The figure of lesson 5 is rebuilt from the step loop and held to its file.
 *   - The claims TR6 adds (content/claims/tr6.yaml) are read at the pins, at a tag or a commit, with the lines of their quotes.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { compiledLessonSchema, compiledModuleSchema } from '@es/schema'
import type { CompiledBlock, ProseFlow, ProseInline } from '@es/schema'
import { lockFileSchema } from '@es/schema/lock'
import { LOOP } from '../../packages/play/loop/entry'
import { familyById } from '../../packages/play/items/registry'
import { VERIFIER } from '../../packages/play/verifier/entry'
import { compileContent, MINUTES_TOLERANCE } from '../../scripts/content/build.ts'
import { CRITICAL } from '../../packages/sim/spec'
import { FIGURE_PATH, maskTimelineSvg, PANELS } from './tr6-figure.ts'
import {
  detections,
  economicsRows,
  fixed,
  formulaGap,
  kept,
  labFalseFailPer10k,
  leakRows,
  leakShownByTwoSeeds,
  MASK_SCENE,
  noiseExample,
  paddingExample,
  pairFacts,
  poolExample,
  PREDICTIONS,
  referenceDetection,
  ROUND_ALPHAS,
  ROUND_GAMMAS,
  RUNNER_ROWS,
  runnerCells,
  rulesTableExact,
  timeline,
  tokensExact,
} from './tr6-demos.ts'
import { read, repo } from './support.ts'

// The checks that run the lab's chi-square on hundreds of cases take a few seconds (20,000 rounds on two seeds each).
setDefaultTimeout(120_000)

const LESSON_FILES = [
  'content/modules/tr6/lessons/l1-where-speculation-lives-in-the-step.md',
  'content/modules/tr6/lessons/l2-the-rejection-sampler-exactly.md',
  'content/modules/tr6/lessons/l3-testing-exactness.md',
  'content/modules/tr6/lessons/l4-proposers.md',
  'content/modules/tr6/lessons/l5-the-grammar-mask.md',
] as const
const MODULE_FILE = 'content/modules/tr6/module.md'
const CLAIMS_FILE = 'content/claims/tr6.yaml'

const result = compileContent({ root: repo })
const lessons = LESSON_FILES.map((file) => {
  const slug = path.basename(file, '.md')
  const out = result.outputs.find((o) => o.path === `src/content/generated/lessons/tr6.${slug}.json`)
  if (out === undefined) throw new Error(`the compiler wrote no lesson for ${file}`)
  return { file, slug, text: read(file), lesson: compiledLessonSchema.parse(JSON.parse(out.text)) }
})
const moduleOut = result.outputs.find((o) => o.path === 'src/content/generated/modules/tr6.json')
if (moduleOut === undefined) throw new Error('the compiler wrote no module for tr6')
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

describe('check 1: TR6 compiles with no diagnostic of any kind', () => {
  test('the module, five lessons and the claims file are in the compiled course', () => {
    expect(module_.id).toBe('tr6')
    expect(lessons.map((l) => l.lesson.id)).toEqual(['tr6.l1', 'tr6.l2', 'tr6.l3', 'tr6.l4', 'tr6.l5'])
    expect(result.claims.some((record) => record.file === CLAIMS_FILE)).toBe(true)
  })

  test('nothing in the module, its lessons or its claims is reported', () => {
    const mine = result.diagnostics.filter((d) => d.file.startsWith('content/modules/tr6/') || d.file === CLAIMS_FILE)
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

  test('the lessons and the rest of the browser part add up to the module\'s browser hours, within 10%, and the GPU lab to its other lane', () => {
    // Curriculum TR6 §3: The Verifier, practice then graded, 60 min; the forge lab, 75 min; the mask-overlap timeline, 30 min; the GPU lab, 120 min [estimated].
    const rest = 60 + 75 + 30
    const minutes = lessons.reduce((sum, l) => sum + l.lesson.minutes, 0) + rest
    const browserMinutes = (module_.hours_by_lane?.B ?? 0) * 60
    expect(Math.abs(minutes - browserMinutes)).toBeLessThanOrEqual(0.1 * browserMinutes)
    expect((module_.hours_by_lane?.F ?? 0) * 60).toBe(120)
  })
})

describe('check 4: the status is review', () => {
  test('the module and its lessons', () => {
    expect([module_.status, ...lessons.map((l) => l.lesson.status)]).toEqual(['review', 'review', 'review', 'review', 'review', 'review'])
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* What TR6 teaches                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('what the lessons teach', () => {
  const graph = readFileSync(path.join(repo, 'content/kc/graph.yaml'), 'utf8')
  const tr6Kcs = [...graph.matchAll(/^- id: (tr6\.[a-z0-9-]+)$/gm)].map((m) => m[1])
  const games = { verifier: VERIFIER, loop: LOOP } as const

  test('every KC of TR6 is taught by a lesson, and no lesson teaches another module\'s', () => {
    const taught = new Set(lessons.flatMap((l) => l.lesson.kcs))
    expect(tr6Kcs.filter((kc) => !taught.has(kc))).toEqual([])
    expect([...taught].filter((kc) => !tr6Kcs.includes(kc))).toEqual([])
  })

  test('the lessons follow the curriculum: five lessons, in its order, with its titles', () => {
    expect(lessons.map((l) => l.lesson.title)).toEqual([
      'Where speculation lives in the step: draft, verify, the bonus token, the padded shape',
      'The rejection sampler, exactly',
      'Testing exactness: chi-square, power, and a real bug',
      'Proposers: n-gram, suffix, draft model, EAGLE-3 and MTP, and what moved at v0.33.0',
      "The grammar mask's four phases, and its overlap with the forward (DP4's minimal recap inside)",
    ])
    expect(lessons.map((l) => l.lesson.minutes)).toEqual([35, 50, 40, 35, 40])
  })

  test('every game block names a level of The Tasting or of Service, and a graded block names a level that grades', () => {
    for (const { lesson } of lessons) {
      for (const block of lesson.blocks) {
        if (block.type !== 'game') continue
        expect([lesson.id, Object.keys(games).includes(block.id)]).toEqual([lesson.id, true])
        const entry = games[block.id as keyof typeof games]
        const level = entry.levels.find((l) => l.id === block.level)
        expect([lesson.id, block.level, level !== undefined]).toEqual([lesson.id, block.level, true])
        if (block.mode === 'graded') expect(level?.graded).toBe(true)
      }
    }
  })

  test('the module names the two games that its lessons play, and every practice level of The Tasting is played in a lesson', () => {
    const used = new Set(lessons.flatMap((l) => l.lesson.blocks.flatMap((block) => (block.type === 'game' ? [block.id] : []))))
    expect([...used].sort()).toEqual([...module_.games].sort())
    const practiced = new Set(
      lessons.flatMap((l) => l.lesson.blocks.flatMap((block) => (block.type === 'game' && block.id === 'verifier' && block.mode === 'practice' ? [block.level] : []))),
    )
    for (const level of VERIFIER.levels.filter((l) => !l.graded)) expect([level.id, practiced.has(level.id)]).toEqual([level.id, true])
    // The mask lane of Service is a practice level: its graded task is the item family below (the replay of `loop/mask` waits for W1-T14's graded mode).
    expect(LOOP.levels.find((l) => l.id === 'mask')?.graded).toBe(false)
  })

  test('a KC of a lesson is earned by a game that the module names or assessed by an item family of the lesson', () => {
    const earnedByGames = new Set(VERIFIER.kcs)
    for (const { lesson } of lessons) {
      const assessed = new Set(
        lesson.blocks.flatMap((block) => {
          if (block.type !== 'item') return []
          return familyById(block.family)?.kcs ?? []
        }),
      )
      for (const kc of lesson.kcs) expect([lesson.id, kc, earnedByGames.has(kc) || assessed.has(kc)]).toEqual([lesson.id, kc, true])
    }
  })

  test('an item block names a TR6 family that is built, and assesses only KCs its lesson teaches', () => {
    const named = new Set<string>()
    for (const { lesson } of lessons) {
      for (const block of lesson.blocks) {
        if (block.type !== 'item') continue
        expect(block.family.startsWith('tr6.')).toBe(true)
        expect(block.level).toBe(2)
        named.add(block.family)
        const gen = familyById(block.family)
        expect([lesson.id, block.family, gen !== undefined]).toEqual([lesson.id, block.family, true])
        for (const kc of gen?.kcs ?? []) expect([lesson.id, block.family, lesson.kcs.includes(kc)]).toEqual([lesson.id, block.family, true])
      }
    }
    expect([...named].sort()).toEqual(['tr6.exactness-test', 'tr6.mask-fits', 'tr6.mask-phases', 'tr6.verify-shape', 'tr6.which-runner'])
  })

  test('an exit ticket is three items on fresh seeds (ASSESSMENT §4.2)', () => {
    for (const { lesson } of lessons) {
      const items = exitCheck(lesson.blocks)?.blocks.flatMap((block) => (block.type === 'item' ? [block.count] : [])) ?? []
      if (items.length > 0) expect([lesson.id, items.reduce((a, b) => a + b, 0)]).toEqual([lesson.id, 3])
    }
    // The second lesson's ticket is the graded `exact` level of The Tasting, on three fresh pairs.
    const exit = exitCheck(lessonOf('tr6.l2').lesson.blocks)
    expect(exit?.blocks).toEqual([{ type: 'game', id: 'verifier', level: 'exact', mode: 'graded' }])
  })

  test('the mask-overlap task is the graded item family of lesson 5, two of its three items', () => {
    const items = exitCheck(lessonOf('tr6.l5').lesson.blocks)?.blocks.flatMap((block) => (block.type === 'item' ? [[block.family, block.count]] : [])) ?? []
    expect(items).toEqual([
      ['tr6.mask-phases', 1],
      ['tr6.mask-fits', 2],
    ])
  })
})

describe('the GPU part is announced and never faked (D-039)', () => {
  test('the module page carries the Build cards of the two labs: the browser lab, and tr6.proposer with its three stages, lane F', () => {
    const labs = module_.blocks.filter((block) => block.type === 'lab')
    expect(labs).toEqual([
      { type: 'lab', id: 'rejection-sampler', lane: 'B', stages: ['s1', 's2', 's3', 's4'] },
      { type: 'lab', id: 'tr6.proposer', lane: 'F', stages: ['s1', 's2', 's3'] },
    ])
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

  test('the module compares like with like: the runner and the async setting of a speedup are recorded', () => {
    expect(moduleText).toContain('the plain run uses the same runner and the same async setting as the speculative run, and the receipt records both')
    expect(moduleText).toContain('{{claim:vllm.spec.custom-class-mrv1}}')
    expect(moduleText).toContain('{{claim:vllm.async-scheduling.mrv1-limits}}')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The claims TR6 adds                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

describe(`the claims of ${CLAIMS_FILE}`, () => {
  const lock = lockFileSchema.parse(JSON.parse(read('course.lock.json')))
  const entry = (key: string) => {
    const found = lock.entries.find((e) => e.key === key)
    if (found === undefined) throw new Error(`course.lock.json has no ${key}`)
    return found
  }
  const mine = result.claims.filter((record) => record.file === CLAIMS_FILE).map((record) => record.claim)

  /** The one ref a source of this kind may be read at: the pin's tag for an engine, a full commit for kernelspace, a versioned page for a paper. */
  const ENGINE_RULES: readonly { readonly name: string; readonly pattern: RegExp }[] = [
    { name: 'vLLM at the pinned tag', pattern: new RegExp(`^https://github\\.com/vllm-project/vllm/blob/v${entry('vllm').version}/[^#]+#L\\d+(?:-L\\d+)?$`) },
    { name: 'SGLang at the pinned tag', pattern: new RegExp(`^https://github\\.com/sgl-project/sglang/blob/v${entry('sglang').version}/[^#]+#L\\d+(?:-L\\d+)?$`) },
  ]
  const OTHER_RULES: readonly { readonly name: string; readonly pattern: RegExp }[] = [
    { name: 'kernelspace at its pinned commit', pattern: /^https:\/\/github\.com\/praveer13\/kernelspace\/blob\/d478f91[0-9a-f]{33}\/[^#]+#L\d+(?:-L\d+)?$/ },
    { name: 'an arXiv abstract page', pattern: /^https:\/\/arxiv\.org\/abs\/\d{4}\.\d{5}$/ },
    { name: 'an arXiv HTML page at a version', pattern: /^https:\/\/arxiv\.org\/html\/\d{4}\.\d{5}v\d$/ },
  ]

  test('are many, and every one is measured or derived', () => {
    expect(mine.length).toBeGreaterThanOrEqual(30)
    for (const claim of mine) expect(['measured', 'derived']).toContain(claim.tag)
  })

  test('begin with their pin, or with the world they belong to when their source is not an engine\'s', () => {
    for (const claim of mine) {
      if (claim.pin !== undefined) expect([claim.id, claim.id.startsWith(`${claim.pin}.`)]).toEqual([claim.id, true])
      else expect([claim.id, /^(?:spec|mask)\./.test(claim.id)]).toEqual([claim.id, true])
    }
  })

  test('a claim that names a pin names a key of the lockfile, and cites a file of that pin\'s tag, with the lines of its quote', () => {
    for (const claim of mine) {
      if (claim.source === undefined) continue
      if (claim.pin === undefined) {
        // Not an engine's: a paper at its arXiv page, or kernelspace at the commit that the course pins, neither of which moves.
        expect([claim.id, OTHER_RULES.some((rule) => rule.pattern.test(claim.source?.url ?? ''))]).toEqual([claim.id, true])
        continue
      }
      expect(lock.entries.some((e) => e.key === claim.pin)).toBe(true)
      expect([claim.id, ENGINE_RULES.some((rule) => rule.pattern.test(claim.source?.url ?? ''))]).toEqual([claim.id, true])
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

  test('every claim of the file is read: cited by a lesson or by the module page', () => {
    const cited = new Set<string>()
    for (const text of [...lessons.map((l) => l.text), moduleText]) {
      for (const m of text.matchAll(/\{\{claim:([a-z0-9.-]+)\}\}/g)) cited.add(m[1])
    }
    expect(mine.map((c) => c.id).filter((id) => !cited.has(id))).toEqual([])
  })

  test('every claim a lesson cites exists, in this file or in another', () => {
    const known = new Set(result.claims.map((record) => record.claim.id))
    for (const { lesson, text } of lessons) {
      for (const m of text.matchAll(/\{\{claim:([a-z0-9.-]+)\}\}/g)) expect([lesson.id, m[1], known.has(m[1])]).toEqual([lesson.id, m[1], true])
    }
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The numbers the lessons print                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Fails with the lesson and the line that went stale, where `expect(text).toContain` would print the whole lesson. */
function mentions(lessonId: string, what: string, line: string): void {
  const text = lessonOf(lessonId).text
  expect([lessonId, what, text.includes(line) ? line : `(missing) ${line}`]).toEqual([lessonId, what, line])
}

/** The prediction block of a lesson, by id. */
function predictOf(lessonId: string, id: string) {
  const block = lessonOf(lessonId).lesson.blocks.find((b) => b.type === 'predict' && b.id === id)
  if (block === undefined || block.type !== 'predict') throw new Error(`${lessonId} has no prediction ${id}`)
  return block
}

describe('the predictions: each names the unit of the reference that the course\'s models compute', () => {
  test('the five predictions are the ones of PREDICTIONS, in the unit they name', () => {
    const ids = lessons.flatMap((l) => l.lesson.blocks.flatMap((b) => (b.type === 'predict' ? [b.id] : [])))
    expect(ids).toEqual(Object.keys(PREDICTIONS))
    for (const id of ids) {
      const reference = PREDICTIONS[id]
      const block = predictOf(id.slice(0, 6), id)
      expect([id, block.answer.kind]).toEqual([id, reference.kind])
      if (reference.kind === 'numeric' && block.answer.kind === 'numeric') expect([id, block.answer.unit]).toEqual([id, reference.unit])
      if (reference.kind === 'choice' && block.answer.kind === 'choice') {
        expect(block.answer.options.map((o) => o.id)).toEqual([...reference.options])
        expect(reference.options).toContain(reference.reference())
      }
    }
  })
})

describe('lesson 1: the round, the padded shape and the economics of a draft', () => {
  test('the step of sixty-four decodes presents 320 tokens where plain decoding presents 64', () => {
    mentions('tr6.l1', 'the scheduler cost', 'A step of 64 decodes [estimated] with 4 drafts each [estimated] presents 320 tokens [derived] where plain decoding presents 64 [derived]')
    expect([64 * (1 + 4), 64]).toEqual([320, 64])
  })

  test('five requests with three drafts present 20 tokens, replay the graph captured at 24, and compute 4 that nobody asked for', () => {
    const { tokens, padded, wasted } = paddingExample()
    expect([tokens, padded, wasted]).toEqual([20, 24, 4])
    mentions('tr6.l1', 'the request', 'Five requests [estimated] with three drafts each [estimated] present 20 tokens [derived].')
    mentions('tr6.l1', 'the padded size', 'so the step replays the graph captured at 24 tokens [derived] and computes 4 tokens [derived] that nobody asked for.')
  })

  test('the prediction: alpha 0.8 and three drafts give 1 + 0.8 + 0.64 + 0.512 = 2.952 tokens', () => {
    expect(PREDICTIONS['tr6.l1.p1'].reference()).toBeCloseTo(2.952, 9)
    expect(predictOf('tr6.l1', 'tr6.l1.p1').prompt).toContain('0.8 [estimated]')
    mentions('tr6.l1', 'the sum', 'With α = 0.8 [estimated] and γ = 3 [estimated] the sum is 1 + 0.8 + 0.64 + 0.512 = 2.952 [derived].')
    expect(fixed(tokensExact(800, 3), 3)).toBe('2.952')
  })

  test('the table of tokens a round emits, for three acceptances and four draft lengths', () => {
    for (const alpha of ROUND_ALPHAS) {
      const cells = ROUND_GAMMAS.map((gamma) => fixed(tokensExact(alpha, gamma), 2))
      mentions('tr6.l1', `alpha ${alpha}`, `| ${alpha / 1000} | ${cells.join(' | ')} |`)
    }
  })

  test('the ceiling at alpha 0.5 is 2 tokens, and eight drafts come within 0.01 of it', () => {
    const eight = tokensExact(500, 8)
    expect(2 - Number(eight.num) / Number(eight.den)).toBeLessThan(0.01)
    const six = tokensExact(500, 6)
    expect(2 - Number(six.num) / Number(six.den)).toBeGreaterThan(0.01)
    mentions('tr6.l1', 'the ceiling', 'at α = 0.5 [estimated] it is 2 tokens [derived], and eight drafts [estimated] already come within 0.01 tokens [derived] of it')
  })

  test('the economics table: tokens, cost and speedup for each draft length, and the best length is four', () => {
    const rows = economicsRows()
    for (const row of rows) mentions('tr6.l1', `gamma ${row.gamma}`, `| ${row.gamma} | ${fixed(row.tokens, 2)} | ${fixed(row.cost, 1)} | ${fixed(row.speedup, 2)} |`)
    const best = rows.reduce((top, row) => (row.speedup.num * top.speedup.den > top.speedup.num * row.speedup.den ? row : top), rows[0])
    expect(best.gamma).toBe(4)
    mentions('tr6.l1', 'the best length', 'The best draft here is four tokens')
    // The fifth draft adds 0.17 tokens and a tenth of a target step.
    const added = Number(rows[4].tokens.num) / Number(rows[4].tokens.den) - Number(rows[3].tokens.num) / Number(rows[3].tokens.den)
    expect(added.toFixed(2)).toBe('0.17')
    mentions('tr6.l1', 'the fifth draft', 'it adds 0.17 tokens [derived] and 0.1 of a target step [derived]')
  })
})

describe('lesson 2: the rule on a pair of three tokens, and what each wrong rule puts out', () => {
  const { alpha, overlap, residual } = pairFacts()

  test('the prediction: p = 0.6, 0.3, 0.1 and q = 0.2, 0.3, 0.5 keep a draft with probability 0.6', () => {
    expect(PREDICTIONS['tr6.l2.p1'].reference()).toBeCloseTo(0.6, 12)
    expect(predictOf('tr6.l2', 'tr6.l2.p1').prompt).toContain('0.6, 0.3 and 0.1 [estimated]')
    expect(predictOf('tr6.l2', 'tr6.l2.p1').prompt).toContain('0.2, 0.3 and 0.5 [estimated]')
  })

  test('the proof table: p, q, min(p, q) and the residual, in tenths', () => {
    const p = [5, 3, 2]
    const q = [2, 5, 3]
    const names = ['a', 'b', 'c']
    names.forEach((name, at) => {
      const tenths = (x: number): string => `${Math.floor(x / 10)}.${x % 10}`
      mentions('tr6.l2', `token ${name}`, `| \`${name}\` | ${tenths(p[at])} | ${tenths(q[at])} | ${tenths(overlap[at])} | ${tenths(residual[at])} |`)
    })
    expect(overlap).toEqual([2, 3, 2])
    expect(residual).toEqual([3, 0, 0])
  })

  test('the overlap is 0.7, a rejection 0.3, and the output is p again', () => {
    expect(alpha).toBeCloseTo(0.7, 12)
    mentions('tr6.l2', 'the rejection', '1 − (0.2 + 0.3 + 0.2) = 0.3 [derived]')
    mentions('tr6.l2', 'the acceptance', 'it is the chance that a draft is accepted: 0.7 [derived]')
    const out = kept()
    expect(out.map((x) => Math.round(x * 10))).toEqual([2, 3, 2])
    mentions('tr6.l2', 'the output', '`a` comes out 0.2 + 0.3 = 0.5 [derived] of the time, `b` 0.3 [derived] and `c` 0.2 [derived], which is p.')
  })

  test('the table of rules that look right: each token\'s share and the distance from p', () => {
    const titles: Record<string, string> = {
      exact: 'The exact rule',
      'resample-from-p': 'Re-plate from p',
      'resample-from-q': 'Re-plate from q',
      'p-without-draft': 'Re-plate from p with the rejected token taken out',
      'residual-off-by-one': 'Walk the residual one token along',
      'accept-if-p-over-q': 'Accept when p > q, with no coin',
      'accept-everything': 'Accept every draft',
    }
    const rows = rulesTableExact()
    expect(rows.map((r) => r.id)).toEqual(Object.keys(titles))
    for (const row of rows) mentions('tr6.l2', row.id, `| ${titles[row.id]} | ${row.out.map((x) => fixed(x, 3)).join(' | ')} | ${fixed(row.tv, 3)} |`)
    // The exact rule is the only one at distance zero.
    expect(rows.filter((r) => r.tv.num === 0n).map((r) => r.id)).toEqual(['exact'])
  })
})

describe('lesson 3: the pooling rule, the level of the lab, the noise of a sample and what each check sees', () => {
  const MEASURED_AT = /measured by the course's sim on 2026-11-05 at `([0-9a-f]{7,40})`/

  test('the example of the pooling rule: nine tokens, 1,000 draws, four pooled, one ruled out, five bins and four degrees of freedom', () => {
    const { df, bins, pooledTokens, pooledExpected, ruledOut } = poolExample()
    expect([df, bins, pooledTokens, pooledExpected, ruledOut]).toEqual([4, 5, 4, 10, 1])
    mentions('tr6.l3', 'the weights', 'whose weights, in a thousand, are 450, 300, 200, 40, 4, 3, 2, 1 and 0 [estimated]')
    mentions('tr6.l3', 'the pool', 'pooled into one bin that expects 10 [derived]')
    mentions('tr6.l3', 'the degrees of freedom', '5 bins [derived] and 4 degrees of freedom [derived]')
  })

  test('the lab\'s level: two seeds at 1e-4 fail an exact sampler about 2 times in 10,000, and the critical value of five degrees of freedom is 25.7', () => {
    const { seeds, per10k, df5Critical, df5Threshold } = labFalseFailPer10k()
    expect(seeds).toBe(2)
    expect(Math.round(per10k)).toBe(2)
    expect(CRITICAL['1e-4'][5]).toBe(25745)
    expect(df5Critical.toFixed(1)).toBe('25.7')
    expect(df5Threshold.toFixed(1)).toBe('36.6')
    mentions('tr6.l3', 'the false fail', 'about 2 in 10,000 attempts [derived]')
    mentions('tr6.l3', 'the critical value', 'The lab rejects above 25.7 [derived]')
    mentions('tr6.l3', 'the ten-sigma threshold', '5 + 10·√10 = 36.6 [derived]')
  })

  test('the noise of a token of 0.25 over 20,000 draws is 3,062 parts per million, 200 times a bias of one coin in 65,536, and 805 million draws bring them level', () => {
    const { sePpm, biasPpm, ratio, millions, labMultiple } = noiseExample()
    expect([Math.round(sePpm), Math.round(biasPpm), Math.round(ratio / 10) * 10, Math.round(millions), Math.round(labMultiple)]).toEqual([3062, 15, 200, 805, 40265])
    mentions('tr6.l3', 'the noise', 'that is 0.003062, or 3,062 parts per million [derived]')
    mentions('tr6.l3', 'the bias', 'which is 15 parts per million [derived]')
    mentions('tr6.l3', 'the ratio', 'so the bias is about 200 times [derived] smaller than the noise')
    mentions('tr6.l3', 'the draws', 'which is 805 million draws [derived], 40,265 times [derived] the lab\'s 20,000 draws [estimated] a seed')
    const prompt = predictOf('tr6.l3', 'tr6.l3.p1').prompt
    expect(prompt).toContain('3,062 parts per million [derived]')
    expect(prompt).toContain('one part in 65,536 [estimated]')
    expect(PREDICTIONS['tr6.l3.p1'].reference()).toBeCloseTo(805.306368, 6)
  })

  test('the table of what each check finds in each member of the bestiary, 50 trials each', () => {
    const titles: Record<string, string> = {
      'accept-if-p-over-q': 'Accept when p > q, with no coin',
      'resample-from-p': 'Re-plate from p',
      'resample-from-q': 'Re-plate from q',
      'residual-off-by-one': 'A residual off by one',
      'boundary-inclusive': 'The boundary-inclusive comparison',
      'fly-lossy': 'A FLy-style lossy rule',
    }
    const control = referenceDetection(50)
    expect([control.chi, control.enumeration]).toEqual([0, 0])
    mentions('tr6.l3', 'the control', '| The exact sampler | 0 | 0 |')
    const rows = detections(50)
    for (const row of rows) {
      expect(row.trials).toBe(50)
      mentions('tr6.l3', row.id, `| ${titles[row.id]} | ${row.chi} | ${row.enumeration} |`)
    }
    // The chi-square check finds every wrong sampler, and the enumeration of the accept step finds the two with a bug in it.
    expect(rows.map((r) => r.chi)).toEqual([50, 50, 50, 50, 50, 50])
    expect(rows.map((r) => r.enumeration)).toEqual([50, 0, 0, 0, 50, 0])
  })

  test('the boundary-inclusive member on three bands: the chi-square check sees it only through a leak', () => {
    const rows = leakRows(100)
    const { dense, sparse, fine } = rows
    mentions('tr6.l3', 'the dense band', `| Six tokens on a grid of 1/64, The Tasting's band | ${dense.leakable} | ${dense.chi} | ${dense.enumeration} |`)
    mentions('tr6.l3', 'the sparse band', `| Sixteen tokens, with the target possible on three to six | ${sparse.leakable} | ${sparse.chi} | ${sparse.enumeration} |`)
    mentions('tr6.l3', 'the fine band', `| Sixty-four tokens, with weights down to 1/65,536 | ${fine.leakable} | ${fine.chi} | ${fine.enumeration} |`)
    // The three bands in the lab's own words agree with this run: the dense band is about one trial in nine (docs: labs/forge/README.md, 1,163 of 10,000).
    expect([dense.leakable, dense.chi, sparse.chi, fine.chi]).toEqual([25, 9, 100, 1])
    // Every rejection is in a trial with a token to leak, and the enumeration flags every trial without one.
    const rejections = dense.chi + sparse.chi + fine.chi
    const without = 3 * 100 - (dense.leakable + sparse.leakable + fine.leakable)
    expect([dense.chiWithoutLeak, sparse.chiWithoutLeak, fine.chiWithoutLeak]).toEqual([0, 0, 0])
    expect(dense.enumerationWithoutLeak + sparse.enumerationWithoutLeak + fine.enumerationWithoutLeak).toBe(without)
    mentions('tr6.l3', 'the rejections', `Every one of the ${rejections} rejections [derived] is in a trial that has such a token. In the ${without} trials [derived] that have none, the chi-square check rejects 0 [measured] and the enumeration flags ${without} [measured].`)
    mentions('tr6.l3', 'a quarter', 'In The Tasting\'s band a quarter of the trials [measured] do')
    expect(dense.leakable).toBe(25)
  })

  test('a leak that comes once in 65,536 rounds shows on two seeds of 20,000 about 46 times in 100', () => {
    const { expected, shown } = leakShownByTwoSeeds()
    expect([expected.toFixed(2), Math.round(shown * 100)]).toEqual(['0.61', 46])
    mentions('tr6.l3', 'the share shown', 'two seeds show a given leak only about 46 times in 100 [derived], which is why 9 of those 25 [measured] were rejected')
    mentions('tr6.l3', 'the sparse band', 'at least ten tokens [derived] that the target rules out, so 20,000 rounds leak about three times [derived] on each seed')
    expect((10 * 20_000) / 65_536).toBeCloseTo(3.05, 2)
  })

  test('the measurement names a commit that exists, once, with its day', () => {
    const matches = [...lessonOf('tr6.l3').text.matchAll(new RegExp(MEASURED_AT, 'g'))]
    expect(matches.length).toBe(1)
  })
})

describe('lesson 4: what the proposers need, what moved, and which runner serves a configuration', () => {
  test('the prediction: a custom proposer runs on MRV1 with async scheduling off', () => {
    expect(PREDICTIONS['tr6.l4.p1'].reference()).toBe('mrv1-off')
    expect(predictOf('tr6.l4', 'tr6.l4.p1').prompt).toContain('custom_class')
  })

  test('the table of configurations, each worked from the rules by the family that the exit ticket draws', () => {
    for (const row of RUNNER_ROWS) {
      const [runner, async] = runnerCells(row.config)
      mentions('tr6.l4', row.text, `| ${row.text} | ${runner} | ${async} |`)
    }
    // Four things the table rests on, each as the family encodes it.
    expect(runnerCells(RUNNER_ROWS[2].config)).toEqual(['MRV1', 'off, with one warning'])
    expect(runnerCells(RUNNER_ROWS[3].config)[0]).toBe('the engine refuses to start')
    expect(runnerCells(RUNNER_ROWS[5].config)).toEqual(['MRV1', 'on'])
  })

  test('the reading list at the pin names five files, and each is cited', () => {
    const text = lessonOf('tr6.l4').text
    for (const file of ['vllm/v1/spec_decode/eagle.py', 'vllm/v1/spec_decode/llm_base_proposer.py', 'vllm/v1/spec_decode/draft_model.py', 'vllm/config/speculative.py']) {
      expect([file, text.includes(`\`${file}\``)]).toEqual([file, true])
    }
    for (const id of ['vllm.spec.eagle-passes-hidden', 'vllm.spec.hidden-states-to-draft', 'vllm.spec.draft-model-no-hidden', 'vllm.spec.eagle3-aux-default', 'vllm.spec.use-eagle-covers-mtp', 'vllm.spec.mtp-names-deprecated']) {
      expect([id, text.includes(`{{claim:${id}}}`)]).toEqual([id, true])
    }
  })

  test('the highest-churn extension point is named, and never cited at main', () => {
    mentions('tr6.l4', 'the churn', 'The hook and the fallback list are the facts on this page most likely to change before the next pin.')
    expect(lessonOf('tr6.l4').text).not.toMatch(/\/blob\/main\//)
  })
})

describe('lesson 5: the mask against the forward', () => {
  const light = 20
  const heavy = 60

  test('the scene: a plan of 100, a read of 60, a forward of 500 and twelve requests', () => {
    expect(MASK_SCENE).toEqual({ plan: 100, read: 60, forward: 500, requests: 12 })
    mentions('tr6.l5', 'the scene', 'The plan is 100 µs [estimated], the read 60 µs [estimated] and the forward 500 µs [estimated], and the step holds 12 structured requests [estimated] with no drafts, so 12 rows [derived].')
    mentions('tr6.l5', 'the grammars', 'A light grammar costs 20 µs a row [estimated], so its fill takes 240 µs [derived], and a heavy one costs 60 µs a row [estimated], so its fill takes 720 µs [derived].')
  })

  test('the prediction: the plain step with the fill overlapped, at 60 µs a row, idles for 380 µs', () => {
    expect(PREDICTIONS['tr6.l5.p1'].reference()).toBe(380)
    const prompt = predictOf('tr6.l5', 'tr6.l5.p1').prompt
    expect(prompt).toContain('a plan of 100 µs [estimated], a read of 60 µs [estimated] and a forward of 500 µs [estimated]')
    expect(prompt).toContain('12 structured requests [estimated]')
    expect(prompt).toContain('60 µs [estimated] a row')
  })

  test('the table: the GPU\'s gap with no grammar, a light one and a heavy one, in each of the three cases, as the step loop measures it', () => {
    const cases = [
      ['Overlapped', 'overlap'],
      ['Serial', 'serial'],
      ['Async scheduling', 'async'],
    ] as const
    for (const [name, mode] of cases) {
      const a = timeline(mode, light)
      const b = timeline(mode, heavy)
      expect(a.freeUs).toBe(b.freeUs)
      mentions('tr6.l5', name, `| ${name} | ${a.freeUs} | ${a.gapUs} | ${b.gapUs} |`)
    }
  })

  test('the formulas of the three cases are the sim\'s to the µs, with and without drafts', () => {
    for (const mode of ['overlap', 'serial', 'async'] as const) {
      for (const rowUs of [light, heavy]) {
        for (const drafts of [0, 4]) expect([mode, rowUs, drafts, formulaGap(mode, rowUs, drafts)]).toEqual([mode, rowUs, drafts, timeline(mode, rowUs, drafts).gapUs])
      }
    }
  })

  test('the worked cells', () => {
    mentions('tr6.l5', 'overlapped, light', 'Overlapped and light is `100 + 60 + max(0, 240 − 500)` = 160 µs [derived]')
    mentions('tr6.l5', 'overlapped, heavy', 'Overlapped and heavy is `100 + 60 + (720 − 500)` = 380 µs [derived], and the 220 µs [derived] by which the fill outlasts the forward')
    mentions('tr6.l5', 'serial', '160 + 240 = 400 µs [derived] and 160 + 720 = 880 µs [derived]')
    mentions('tr6.l5', 'async', 'the chain of 400 µs [derived] still fits under it, so the gap stays 0 [derived]')
    mentions('tr6.l5', 'async, heavy', 'The heavy chain is 880 µs [derived], and 880 − 500 = 380 µs [derived] is what does not fit.')
    // Once the fill outlasts the forward, the overlapped and the async gaps are one number.
    expect(timeline('overlap', heavy).gapUs).toBe(timeline('async', heavy).gapUs)
    mentions('tr6.l5', 'the tie', 'overlapped and async give the same gap, `P + R + M − F`, which is 380 µs [measured] in both')
  })

  test('speculation lengthens the card: four drafts make 60 rows and a fill of 1,200 µs, and the overlapped gap goes from 160 to 860 µs', () => {
    const plain = timeline('overlap', light)
    const spec = timeline('overlap', light, 4)
    expect([plain.gapUs, spec.fillUs, spec.gapUs, timeline('async', light, 4).gapUs]).toEqual([160, 1200, 860, 860])
    mentions('tr6.l5', 'the rows', 'A request that drafts 4 tokens [estimated] needs 5 rows [derived] where a plain one needs 1.')
    mentions('tr6.l5', 'the fill', 'now fill 12 × 5 × 20 = 1,200 µs [derived]')
    mentions('tr6.l5', 'the gap', '`100 + 60 + (1,200 − 500)` = 860 µs [derived], and the step loop measures 860 µs [measured], against 160 µs [measured] for the same grammar without drafts')
  })

  test('the figure is the step loop\'s own picture: rebuilt here, it is the file byte for byte, and it is drawn in the page\'s ink', () => {
    const svg = read(FIGURE_PATH)
    expect(svg).toBe(maskTimelineSvg())
    // A figure is drawn in the page's ink: no colour and no typeface of its own (DESIGN.md; AGENTS.md rule 9).
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|font-family/)
    expect(svg).toContain('currentColor')
    expect(svg).toContain('<title>')
    expect(svg).toContain('<desc>')
    // Its four panels are the cases of the table, and its description names their gaps.
    expect(PANELS.map((p) => [p.mode, p.rowUs])).toEqual([
      ['overlap', 20],
      ['overlap', 60],
      ['serial', 20],
      ['async', 20],
    ])
    for (const gap of [160, 380, 400, 0]) expect(svg).toContain(`GPU idle ${gap} µs`)
    const figure = lessonOf('tr6.l5').lesson.blocks.find((b) => b.type === 'figure')
    expect(figure?.type === 'figure' ? [figure.src, figure.origin] : null).toEqual(['figures/tr6/l5-mask-timeline.svg', 'generated'])
  })
})

describe('the commit that the numbers name', () => {
  const cited = [...new Set(lessons.flatMap((l) => [...l.text.matchAll(/2026-11-05 at `([0-9a-f]{7,40})`/g)].map((m) => m[1])))]

  test('the lessons that print simulator numbers name one commit, in code', () => {
    expect(cited.length).toBe(1)
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
