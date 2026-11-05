/*
 * W1-T20: TR1's module and lessons (docs/TRACKER.md, "TR1 content"). The task's acceptance is the checks of W1-T15 and that every code
 * reference is a pinned permalink, and this file holds each of them to the real content:
 *
 *   1. verify:content, verify:claims and verify:numbers pass: the module, its seven lessons and its claims compile with no diagnostic.
 *   2. Every lesson has a prediction, a game or an item, and an exit check that names the knowledge components it tests.
 *   3. Reading minutes fall within 20% of the declared minutes.
 *   4. The module and its lessons are in review.
 *   5. Every code reference is a pinned permalink: each link goes to a file at a tag or a commit that course.lock.json pins, each excerpt
 *      is introduced by a link to the same lines at the same pin, and each file path in a lesson is a link.
 *
 * Beyond those, three things TR1 owes the rest of the course:
 *
 *   - The GPU part is announced and never faked (D-039): a Build card on the module page, and no lab or trace in a lesson.
 *   - Every number a lesson prints from the lifecycle model is recomputed here from `tests/content/tr1-demos.ts`, and each path table is
 *     compared with the model's stages, one row for one stage, so that when the model moves, this file names the lesson that went stale.
 *   - The claims TR1 adds (content/claims/tr1.yaml) are read at the pins, at a tag or a commit, with the lines of their quotes. Whether
 *     each quote is in those lines is `tests/content/tr1-sources.test.ts`'s check, which needs the pinned trees.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { ProseInline } from '@es/schema'
import { ENGINE_FLOOR } from '../../packages/play/engine-floor/entry'
import { familyById } from '../../packages/play/items/registry'
import { MINUTES_TOLERANCE } from '../../scripts/content/build.ts'
import {
  FINISHED_STATUSES,
  LEVEL_OF_LESSON,
  MECHANISM_WORD,
  NANO_BLOCK_TOKENS,
  PREDICTIONS,
  SCHEDULER_LINES,
  abortBoundaries,
  abortStages,
  levelPath,
  nanoStepTokens,
  nanoTokensToCompute,
  pathOf,
  requestsSent,
  scenario,
  stagesAtSecondRank,
  tokenBoundaries,
  vllmStepTokens,
} from './tr1-demos.ts'
import { read, repo } from './support.ts'
import {
  CLAIMS_FILE,
  PIN_OF,
  codeSpans,
  excerptsOf,
  exitCheck,
  flowInlines,
  inlineText,
  lessonOf,
  lessons,
  linksIn,
  lock,
  mentions,
  moduleText,
  module_,
  pin,
  proseFlows,
  result,
  tableWithHead,
} from './tr1-support.ts'

/* ------------------------------------------------------------------------------------------------------------------ */
/* The checks of W1-T15                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('check 1: TR1 compiles with no diagnostic of any kind', () => {
  test('the module, seven lessons and the claims file are in the compiled course', () => {
    expect(module_.id).toBe('tr1')
    expect(lessons.map((l) => l.lesson.id)).toEqual(['tr1.l1', 'tr1.l2', 'tr1.l3', 'tr1.l4', 'tr1.l5', 'tr1.l6', 'tr1.l7'])
    expect(result.claims.some((record) => record.file === CLAIMS_FILE)).toBe(true)
  })

  test('nothing in the module, its lessons or its claims is reported', () => {
    const mine = result.diagnostics.filter((d) => d.file.startsWith('content/modules/tr1/') || d.file === CLAIMS_FILE)
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

    test(`${lesson.id}: an exit check that ends in items, and names the KCs it tests`, () => {
      const exit = exitCheck(lesson.blocks)
      expect(exit).not.toBeNull()
      if (exit === null) return
      const graded = exit.blocks.filter((block) => block.type === 'item' || (block.type === 'game' && block.mode === 'graded'))
      expect(graded.length).toBeGreaterThanOrEqual(1)
      // The exit check is the end of the lesson: nothing else follows it but the blocks it is made of.
      for (const block of exit.blocks) expect(['item', 'game']).toContain(block.type)
      const named = new Set(exit.prose.flatMap((flow) => flowInlines(flow).flatMap((node) => codeSpans([node]).map((span) => span.text))))
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
})

describe('check 4: the status is review', () => {
  test('the module and its lessons', () => {
    expect([module_.status, ...lessons.map((l) => l.lesson.status)]).toEqual(Array(8).fill('review'))
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* What TR1 teaches                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('what the lessons teach', () => {
  const graph = readFileSync(path.join(repo, 'content/kc/graph.yaml'), 'utf8')
  const tr1Kcs = [...graph.matchAll(/^- id: (tr1\.[a-z0-9-]+)$/gm)].map((m) => m[1])

  test("every KC of TR1 is taught by a lesson, and no lesson teaches another module's", () => {
    const taught = new Set(lessons.flatMap((l) => l.lesson.kcs))
    expect(tr1Kcs.length).toBe(8)
    expect(tr1Kcs.filter((kc) => !taught.has(kc))).toEqual([])
    expect([...taught].filter((kc) => !tr1Kcs.includes(kc))).toEqual([])
  })

  test('the lessons follow the curriculum: seven lessons, in its order', () => {
    expect(lessons.map((l) => l.lesson.title)).toEqual([
      'Five mechanisms: queue, IPC, copy, sync, compute',
      'nano-vllm in one sitting: the engine, the scheduler, the block manager and the model runner',
      'Mini-SGLang: one request through four processes',
      '"Inside vLLM" and what moved by v0.33.0',
      'vLLM at the pin, by symbol: from create_completion to sample_tokens',
      'SGLang at the pin: the overlap loop, result_queue, FutureMap, three streams and the Rust pieces',
      'Abort inside the engine: where the news goes and who frees the blocks',
    ])
  })

  test('the module page lists the lessons it has, in the same order', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7]) expect(moduleText).toContain(`${n}. `)
    expect(module_.games).toEqual(['engine-floor'])
    expect(module_.pins).toEqual(['vllm', 'sglang', 'nano-vllm', 'mini-sglang', 'inside-vllm'])
  })

  test('every game block is Back of House, names one of its levels, and a graded block names a level that grades', () => {
    for (const { lesson } of lessons) {
      for (const block of lesson.blocks) {
        if (block.type !== 'game') continue
        expect([lesson.id, block.id]).toEqual([lesson.id, 'engine-floor'])
        const level = ENGINE_FLOOR.levels.find((l) => l.id === block.level)
        expect([lesson.id, block.level, level !== undefined]).toEqual([lesson.id, block.level, true])
        if (block.mode === 'graded') expect(level?.graded).toBe(true)
        else expect(level?.graded).toBe(false)
      }
    }
  })

  test('each lesson plays the practice level of the engine it reads, and the graded map ends the last lesson', () => {
    for (const { lesson } of lessons) {
      const practice = lesson.blocks.flatMap((block) => (block.type === 'game' && block.mode === 'practice' ? [block.level] : []))
      expect([lesson.id, practice]).toEqual([lesson.id, [LEVEL_OF_LESSON[lesson.id]]])
      const graded = lesson.blocks.flatMap((block) => (block.type === 'game' && block.mode === 'graded' ? [block.level] : []))
      expect([lesson.id, graded]).toEqual([lesson.id, lesson.id === 'tr1.l7' ? ['map'] : []])
    }
    const levels = ENGINE_FLOOR.levels.map((l) => l.id)
    for (const level of Object.values(LEVEL_OF_LESSON)) expect(levels).toContain(level)
    // Every practice level of the game is played by a lesson.
    expect(levels.filter((id) => id !== 'map').sort()).toEqual(Object.values(LEVEL_OF_LESSON).sort())
  })

  test("a lesson's KCs are earned by the game, or wait for the item family that its exit check names", () => {
    const earned = new Set(ENGINE_FLOOR.kcs)
    // The three KCs that the graded map cannot earn wait for an item family (the KC graph says which task builds it).
    const WAITING_FOR_ITEMS = new Set(['tr1.phases-vs-one-budget', 'tr1.request-states', 'tr1.read-at-the-pin'])
    for (const { lesson } of lessons) {
      const hasItems = lesson.blocks.some((block) => block.type === 'item')
      for (const kc of lesson.kcs) expect([lesson.id, kc, earned.has(kc) || (WAITING_FOR_ITEMS.has(kc) && hasItems)]).toEqual([lesson.id, kc, true])
    }
  })

  test('an item block names a TR1 family; a built family assesses only KCs its lesson teaches; the five still to build are named', () => {
    const TO_BUILD = ['tr1.request-state', 'tr1.step-budget', 'tr1.what-moved', 'tr1.where-does-it-run', 'tr1.which-mechanism']
    const named = new Set<string>()
    for (const { lesson } of lessons) {
      for (const block of lesson.blocks) {
        if (block.type !== 'item') continue
        expect(block.family.startsWith('tr1.')).toBe(true)
        expect(block.level).toBe(2)
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

  test('a lesson builds on kernelspace lessons, and names no KC id, which would make its page wider than a phone', () => {
    // Measured 2026-11-05 in headless Chromium, with axe and a reflow check at 320, 360 and 1280 px, on /m/tr1 and its seven lessons: the printer
    // beside a lesson does not wrap a KC id such as `t5.engine-design-centers`, so a lesson that lists one is wider than a 360 px phone, and
    // one that lists any is wider than a 320 px one (TR8's pages show the same at 320). The ids are in the prose, where a line wraps, and in
    // the KC graph. Lessons only, so that every page of TR1 reflows.
    for (const { lesson, text } of lessons) {
      const builds = /^builds_on: \[(.*)\]$/m.exec(text)?.[1].split(',').map((ref) => ref.trim()) ?? []
      expect([lesson.id, builds.length]).toEqual([lesson.id, builds.filter((ref) => /^ks:T\d+\.L\d+$/.test(ref)).length])
      expect(builds.length).toBeGreaterThanOrEqual(2)
    }
  })

  test("the module's graded map is the proof of the module and the lesson of abort holds it", () => {
    const l7 = lessonOf('tr1.l7').lesson
    expect(l7.blocks.some((block) => block.type === 'game' && block.level === 'map' && block.mode === 'graded')).toBe(true)
    for (const { lesson } of lessons.filter((l) => l.lesson.id !== 'tr1.l7')) {
      expect(lesson.blocks.some((block) => block.type === 'game' && block.mode === 'graded')).toBe(false)
    }
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The GPU part is announced and never faked                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the GPU part is announced and never faked (D-039)', () => {
  test('the module page carries the Build card of tr1.fork with its three stages, lane F', () => {
    const labs = module_.blocks.filter((block) => block.type === 'lab')
    expect(labs).toEqual([{ type: 'lab', id: 'tr1.fork', lane: 'F', stages: ['s1', 's2', 's3'] }])
  })

  test('the module says that it arrives with the grader, and that nothing pretends to run it', () => {
    expect(moduleText).toContain('It arrives with the grader (W2, D-039)')
    expect(moduleText).toContain('does not run it')
  })

  test('the GPU hours are an estimate, and the flash-attn build for the pin is said to be unchecked', () => {
    expect(moduleText).toMatch(/about 2\.5 hours on a 4090-class GPU \[estimated\]/)
    expect(moduleText).toMatch(/flash-attn build for the pinned PyTorch and CUDA that nobody has checked yet \[unverified\]/)
  })

  test('no lesson carries a lab or a trace, so none claims a GPU run or a real trace', () => {
    for (const { lesson } of lessons) expect([lesson.id, lesson.blocks.filter((b) => b.type === 'lab' || b.type === 'trace').length]).toEqual([lesson.id, 0])
  })

  test('the lessons are browser lessons: lane B', () => {
    for (const { lesson } of lessons) expect(lesson.lanes).toEqual(['B'])
  })

  test('the hours of the module are the course file\'s, and the lessons say how they fall short of them', () => {
    expect([module_.hours, module_.hours_by_lane]).toEqual([10, { B: 7.5, F: 2.5 }])
    // The lessons' reading time is the compiler's [estimated] words and blocks; the rest of the browser hours is the learner's own time in the sources.
    const minutes = lessons.reduce((sum, l) => sum + l.lesson.minutes, 0)
    expect(minutes).toBeLessThan(7.5 * 60)
    expect(minutes).toBeGreaterThan(4 * 60)
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Every code reference is a pinned permalink                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('check 5: every code reference is a pinned permalink', () => {
  const vllm = pin('vllm')
  const sglang = pin('sglang')
  const postCommit = pin('inside-vllm').commit
  /** The refs a link may be pinned at, for each repository: the lock's tag or commit. A tag is the lock's version, which the lock says points at the commit. */
  const REFS: Readonly<Record<string, readonly string[]>> = {
    'vllm-project/vllm': [`v${vllm.version}`, vllm.commit ?? '', postCommit ?? ''],
    'sgl-project/sglang': [`v${sglang.version}`, sglang.commit ?? ''],
    'sgl-project/mini-sglang': [pin('mini-sglang').commit ?? ''],
    'GeeeekExplorer/nano-vllm': [pin('nano-vllm').commit ?? ''],
  }
  const PERMALINK = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/([^#\s]+)(?:#L(\d+)(?:-L(\d+))?)?$/

  const allLinks = [
    ...lessons.flatMap(({ lesson }) => proseFlows(lesson.blocks).flatMap((flow) => linksIn(flowInlines(flow)).map((link) => ({ where: lesson.id, ...link })))),
    ...proseFlows(module_.blocks).flatMap((flow) => linksIn(flowInlines(flow)).map((link) => ({ where: 'tr1', ...link }))),
  ]

  test('the lessons link to the engines, and a good many times', () => {
    expect(allLinks.length).toBeGreaterThan(100)
    expect(new Set(allLinks.map((link) => PERMALINK.exec(link.href)?.[1])).size).toBe(4)
  })

  test('every link is a file of one of the four repositories, at a ref that course.lock.json pins', () => {
    for (const link of allLinks) {
      const m = PERMALINK.exec(link.href)
      expect([link.where, link.href, m !== null]).toEqual([link.where, link.href, true])
      if (m === null) continue
      const [, repoName, ref] = m
      expect([link.where, link.href, (REFS[repoName] ?? []).includes(ref)]).toEqual([link.where, link.href, true])
    }
  })

  test('no link goes to a branch, a head, "latest" or a tree, and every line anchor is a range that runs forward', () => {
    for (const link of allLinks) {
      expect(link.href).not.toMatch(/\/(?:main|master|latest|stable|HEAD|tree)\//)
      const m = PERMALINK.exec(link.href)
      if (m === null || m[4] === undefined) continue
      const first = Number(m[4])
      expect(first).toBeGreaterThan(0)
      if (m[5] !== undefined) expect(Number(m[5])).toBeGreaterThan(first)
    }
  })

  test('a link that is a symbol says which line: the "Read it at" and excerpt links carry an anchor', () => {
    for (const { lesson } of lessons) {
      for (const flow of proseFlows(lesson.blocks)) {
        if (flow.type !== 'table') continue
        const headText = flow.head.map((cell) => inlineText(cell).trim())
        const at = headText.indexOf('Read it at')
        if (at < 0) continue
        for (const row of flow.rows) {
          const links = linksIn(row[at])
          expect([lesson.id, inlineText(row[0]), links.length]).toEqual([lesson.id, inlineText(row[0]), 1])
          expect([lesson.id, links[0].href, /#L\d+(?:-L\d+)?$/.test(links[0].href)]).toEqual([lesson.id, links[0].href, true])
        }
      }
    }
  })

  test('every Python block is an excerpt that names its file, its lines and its pin in its first line', () => {
    for (const { file, text } of lessons) {
      const blocks = text.split('\n').filter((line) => line.startsWith('```python')).length
      expect([file, excerptsOf(text).length]).toEqual([file, blocks])
    }
  })

  test('the paragraph before an excerpt links the same lines of the same file at the same pin', () => {
    let seen = 0
    for (const { file, text } of lessons) {
      for (const excerpt of excerptsOf(text)) {
        seen++
        const where = PIN_OF[excerpt.pin]
        expect([file, excerpt.pin, where !== undefined]).toEqual([file, excerpt.pin, true])
        const anchor = excerpt.first === excerpt.last ? `#L${excerpt.first}` : `#L${excerpt.first}-L${excerpt.last}`
        const want = `https://github.com/${where.repo}/blob/${where.ref}/${excerpt.file}${anchor}`
        expect([file, excerpt.file, excerpt.before.includes(want) ? want : `(missing) ${want}`]).toEqual([file, excerpt.file, want])
      }
    }
    expect(seen).toBe(18)
  })

  test('a file path in a lesson is a link: no code span names a source file without being, or sitting in, one', () => {
    const FILE = /^(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:py|rs|toml|json|ts)$/
    const bare: string[] = []
    for (const { lesson } of lessons) {
      for (const flow of proseFlows(lesson.blocks)) {
        for (const span of codeSpans(flowInlines(flow))) if (!span.linked && FILE.test(span.text)) bare.push(`${lesson.id}: ${span.text}`)
      }
    }
    expect(bare).toEqual([])
  })

  test("the method block of lesson 4 is the one place that shows a repository's own address, and it runs nothing", () => {
    const l4 = lessonOf('tr1.l4')
    const sh = l4.text.split('\n').filter((line) => line.startsWith('```sh')).length
    expect(sh).toBe(1)
    expect(l4.text).toContain('Nothing in this lesson runs these')
    for (const { file, text } of lessons) {
      const outside = text.replace(/```sh[\s\S]*?```/g, '')
      const bare = [...outside.matchAll(/https:\/\/github\.com\/[^\s)`]+/g)].map((m) => m[0]).filter((url) => !url.includes('/blob/'))
      expect([file, bare]).toEqual([file, []])
    }
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The path tables are the lifecycle model's stages                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('a path table is the model: one row for one stage, in order, with its mechanism and its line', () => {
  const HEAD = ['Stage', 'What happens', 'Mechanism', 'Read it at']
  const refsOf = (repoName: string) => {
    if (repoName === 'sgl-project/sglang') return [`v${pin('sglang').version}`, pin('sglang').commit]
    if (repoName === 'vllm-project/vllm') return [`v${pin('vllm').version}`, pin('vllm').commit]
    return [pin(repoName === 'sgl-project/mini-sglang' ? 'mini-sglang' : 'nano-vllm').commit]
  }

  const tableOf = (lessonId: string, expected: readonly { id: string; mechanism: string; file: string; line: number; symbol: string; repo: string }[]) => {
    const rows = tableWithHead(lessonId, HEAD)
    expect(rows.map((row) => inlineText(row[0]).trim())).toEqual(expected.map((stage) => stage.id))
    rows.forEach((row, i) => {
      const stage = expected[i]
      expect([lessonId, stage.id, inlineText(row[2]).trim()]).toEqual([lessonId, stage.id, stage.mechanism])
      const [link] = linksIn(row[3])
      const m = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/([^#]+)#L(\d+)$/.exec(link.href)
      expect([lessonId, stage.id, m !== null]).toEqual([lessonId, stage.id, true])
      if (m === null) return
      expect([lessonId, stage.id, m[1], refsOf(m[1]).includes(m[2]), m[3], Number(m[4]), link.text.trim()]).toEqual([lessonId, stage.id, stage.repo, true, stage.file, stage.line, stage.symbol])
    })
  }

  const expectedFor = (stages: readonly ReturnType<typeof pathOf>[number][]) =>
    stages.map((stage) => ({
      id: stage.id,
      mechanism: MECHANISM_WORD[stage.mechanism],
      file: stage.source.path,
      line: stage.source.line,
      // A constructor is named by its class, which is what a reader looks for.
      symbol: (([...parts]) => (parts.at(-1) === '__init__' ? parts.at(-2) : parts.at(-1)) ?? '')(stage.source.symbol.split('.')),
      repo: stage.source.repo,
    }))

  test('lesson 3: the seventeen stages of Mini-SGLang at one rank, streaming', () => {
    const path = levelPath('tr1.l3')
    expect(path.length).toBe(17)
    tableOf('tr1.l3', expectedFor(path))
  })

  test('lesson 5: the twenty-two stages of vLLM at the pin, at one rank, streaming', () => {
    const path = levelPath('tr1.l5')
    expect(path.length).toBe(22)
    tableOf('tr1.l5', expectedFor(path))
  })

  test('lesson 6: the twenty stages of SGLang at one rank, streaming, with a prefix hit', () => {
    const path = levelPath('tr1.l6')
    expect(path.length).toBe(20)
    expect(path.some((stage) => stage.id === 'sglang.prefix-hit')).toBe(true)
    tableOf('tr1.l6', expectedFor(path))
  })

  test('lesson 7: the six stages that the abort adds to vLLM at the pin', () => {
    const stages = abortStages(scenario('vllm', { abort: true }))
    expect(stages.map((stage) => stage.id)).toEqual(['vllm.disconnect', 'vllm.abort-request', 'vllm.abort-zmq', 'vllm.aborts-queue', 'vllm.process-aborts', 'vllm.finish-aborted'])
    tableOf('tr1.l7', expectedFor(stages))
  })

  test('the stage ids of the tables are code spans, and only the first column is', () => {
    for (const id of ['tr1.l3', 'tr1.l5', 'tr1.l6', 'tr1.l7']) {
      for (const row of tableWithHead(id, HEAD)) expect(row[0].every((node) => node.type === 'code')).toBe(true)
    }
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The numbers the lessons print                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the predictions', () => {
  const blocks = lessons.flatMap(({ lesson }) => lesson.blocks.flatMap((block) => (block.type === 'predict' ? [{ lesson: lesson.id, block }] : [])))

  test('every prediction block has a reference answer, with its unit and its tolerance, and no reference is left without a block', () => {
    expect(blocks.map((b) => b.block.id).sort()).toEqual(Object.keys(PREDICTIONS).sort())
    for (const { block } of blocks) {
      expect(block.answer.kind).toBe('numeric')
      if (block.answer.kind !== 'numeric') continue
      expect([block.id, block.answer.unit]).toEqual([block.id, PREDICTIONS[block.id].unit])
      expect([block.id, block.answer.rel_tol]).toEqual([block.id, block.id === 'tr1.l4.p2' ? 0.15 : 0])
    }
  })

  test('the references are the numbers the model and the rules give', () => {
    const answer = (id: string) => PREDICTIONS[id].reference()
    expect(answer('tr1.l1.p1')).toBe(0)
    expect(answer('tr1.l1.p2')).toBe(3)
    expect(answer('tr1.l2.p1')).toBe(188)
    expect(answer('tr1.l2.p2')).toBe(300)
    expect(answer('tr1.l3.p1')).toBe(3)
    expect(answer('tr1.l3.p2')).toBe(2)
    expect(answer('tr1.l4.p1')).toBe(2)
    expect(answer('tr1.l4.p2')).toBeCloseTo(3.253, 3)
    expect(answer('tr1.l5.p1')).toBe(3)
    expect(answer('tr1.l5.p2')).toBe(302)
    expect(answer('tr1.l5.p3')).toBe(6)
    expect(answer('tr1.l6.p1')).toBe(3)
    expect(answer('tr1.l6.p2')).toBe(3)
    expect(answer('tr1.l7.p1')).toBe(2)
    expect(answer('tr1.l7.p2')).toBe(1)
  })

  test('a prediction names KCs that its lesson teaches', () => {
    for (const { lesson, block } of blocks) {
      for (const kc of block.kcs) expect([lesson, block.id, kc, lessonOf(lesson).lesson.kcs.includes(kc)]).toEqual([lesson, block.id, kc, true])
    }
  })

  test('each lesson states the answer of each of its predictions, where the game has been played', () => {
    mentions('tr1.l1', 'p1', 'so a token crosses no process boundary on its way back')
    mentions('tr1.l1', 'p2', 'The line holds three stages, a launch, a copy and a sync')
    mentions('tr1.l2', 'p1', 'which is 188 tokens')
    mentions('tr1.l2', 'p2', 'The second answer is 300 tokens [derived]')
    mentions('tr1.l3', 'p1', 'That is three process boundaries [derived]')
    mentions('tr1.l3', 'p2', 'That is two stages')
    mentions('tr1.l4', 'p1', 'so a token crosses two process boundaries [derived], and at two ranks it crosses three')
    mentions('tr1.l4', 'p2', 'The second answer is 3.3 [derived]')
    mentions('tr1.l5', 'p1', "So the first prediction's answer is three.")
    mentions('tr1.l5', 'p2', "The second prediction's answer is 302 tokens [derived].")
    mentions('tr1.l5', 'p3', 'A request has twelve statuses, six of them finished.')
    mentions('tr1.l6', 'p1', 'which is three process boundaries [derived]')
    mentions('tr1.l6', 'p2', "The second prediction's answer is three.")
    mentions('tr1.l7', 'p1', "so the first prediction's answer is two [derived]")
    mentions('tr1.l7', 'p2', "So the second prediction's answer is one.")
  })
})

describe('the numbers that the lessons compute', () => {
  test('lesson 2: the prefix hit of two whole blocks leaves 188 of 700 tokens, and not the 100 that a finer cache would', () => {
    expect(NANO_BLOCK_TOKENS).toBe(256)
    expect(nanoTokensToCompute(700, 600)).toBe(188)
    // A cache with the granularity of one token would leave the 100 tokens past the shared 600.
    expect(700 - 600).toBe(100)
    // Blocks of 256: the third block of the earlier prompt is partial, and the new prompt's last block is never looked up, so 600 shared
    // tokens are 512 hit tokens: tokens 0 to 511.
    expect(Math.floor(600 / 256) * 256).toBe(512)
    // A prompt that fills its blocks exactly still has its last block computed.
    expect(nanoTokensToCompute(512, 512)).toBe(256)
    expect(nanoTokensToCompute(256, 256)).toBe(256)
    mentions('tr1.l2', 'hit', 'fill two whole blocks of 256 tokens, which are tokens 0 to 511 [derived], and 188 tokens of a third')
    mentions('tr1.l2', 'compute', 'The model computes 700 less 512 [derived], which is 188 tokens')
  })

  test('lesson 2: a step is all prefill or all decode in nano-vllm, and one pool of tokens in vLLM', () => {
    expect(nanoStepTokens(2, 300)).toBe(300)
    expect(vllmStepTokens(2, 300)).toBe(302)
    expect(nanoStepTokens(3, 0)).toBe(3)
    expect(nanoStepTokens(2, 300) - 0).toBe(300)
    // The table of the lesson: "Tokens in that step" and "Tokens the decoders get from it".
    const rows = tableWithHead('tr1.l2', ['The same queue', 'nano-vllm', 'vLLM v0.33.0'])
    const cells = (label: string) => rows.find((row) => inlineText(row[0]).trim() === label)?.slice(1).map((cell) => inlineText(cell).trim())
    expect(cells('Tokens in that step')).toEqual(['300 [derived]', '302 [derived]'])
    expect(cells('Tokens the decoders get from it')).toEqual(['0 [derived]', '2 [derived]'])
  })

  test("lesson 2: the four files add up to 559 lines, and the lesson says it is the sum of the column", () => {
    const rows = tableWithHead('tr1.l2', ['Part', 'File', 'What it owns', 'Lines [measured]'])
    const lines = rows.map((row) => Number(inlineText(row[3]).trim()))
    expect(lines).toEqual([90, 92, 120, 257])
    expect(lines.reduce((a, b) => a + b, 0)).toBe(559)
    mentions('tr1.l2', 'sum', 'Together they are 559 lines [derived], the sum of the column.')
    // The four files are about two fifths of the library's 1,385 lines [measured] (tr1-sources counts the 1,385 in the tree).
    expect(559 / 1385).toBeCloseTo(0.4036, 3)
    mentions('tr1.l2', 'whole library', 'gives 1,385 lines [measured], the model and its layers included, so the four files are about two fifths of the library [derived]')
  })

  test('lesson 3: a second rank adds two stages to Mini-SGLang, which are a hop over a socket and a collective', () => {
    expect(stagesAtSecondRank('mini-sglang')).toBe(2)
    const added = pathOf(scenario('mini-sglang', { tp: 2 })).filter((stage) => !pathOf(scenario('mini-sglang')).some((own) => own.id === stage.id))
    expect(added.map((stage) => stage.mechanism).sort()).toEqual(['collective', 'ipc'])
  })

  test('lesson 6: a second rank adds two stages to SGLang, the broadcast and the all-reduce, which the lesson names', () => {
    expect(stagesAtSecondRank('sglang')).toBe(2)
    const own = new Set(pathOf(scenario('sglang')).map((stage) => stage.id))
    expect(pathOf(scenario('sglang', { tp: 2 })).filter((stage) => !own.has(stage.id)).map((stage) => stage.id)).toEqual(['sglang.broadcast', 'sglang.all-reduce'])
    mentions('tr1.l6', 'two ranks', 'The path gains two stages, `sglang.broadcast` to the second rank and `sglang.all-reduce` between the two GPUs')
  })

  test('lessons 3 to 6: the process boundaries that a sampled token crosses, by engine and rank', () => {
    expect(tokenBoundaries(scenario('mini-sglang'))).toBe(3)
    expect(tokenBoundaries(scenario('inside-vllm'))).toBe(2)
    expect(tokenBoundaries(scenario('inside-vllm', { tp: 2 }))).toBe(3)
    expect(tokenBoundaries(scenario('vllm'))).toBe(2)
    expect(tokenBoundaries(scenario('vllm', { tp: 2 }))).toBe(3)
    expect(tokenBoundaries(scenario('sglang'))).toBe(3)
    expect(tokenBoundaries(scenario('sglang', { tp: 2 }))).toBe(3)
    expect(tokenBoundaries(scenario('nano-vllm', { streaming: false }))).toBe(0)
    // The table of lesson 6's last row.
    const rows = tableWithHead('tr1.l6', ['The question', 'vLLM v0.33.0', 'SGLang v0.5.23'])
    const last = rows.at(-1)?.map((cell) => inlineText(cell).trim())
    expect(last).toEqual(['Process boundaries a sampled token crosses, at one rank', '2 [derived]', '3 [derived]'])
  })

  test("lesson 4: the post's scheduler is more than three times the size at the pin, and each growth is the ratio of its two counts", () => {
    expect(SCHEDULER_LINES.pin / SCHEDULER_LINES.post).toBeGreaterThan(3)
    const rows = tableWithHead('tr1.l4', ['File', 'Lines at 42172ad [measured]', 'Lines at v0.33.0 [measured]', 'Growth [derived]'])
    expect(rows.length).toBe(8)
    const num = (cell: ProseInline[]) => Number(inlineText(cell).replace(/,/g, '').trim())
    for (const row of rows) {
      const [before, after, growth] = [num(row[1]), num(row[2]), inlineText(row[3]).trim()]
      const ratio = after / before
      expect([inlineText(row[0]), growth]).toEqual([inlineText(row[0]), ratio < 0.1 ? ratio.toFixed(2) : ratio.toFixed(1)])
    }
    const scheduler = rows.find((row) => inlineText(row[0]).includes('scheduler.py'))
    expect([num(scheduler?.[1] ?? []), num(scheduler?.[2] ?? [])]).toEqual([SCHEDULER_LINES.post, SCHEDULER_LINES.pin])
  })

  test('lesson 4: the post is 450 days older than the pin\'s upload', () => {
    const days = (Date.parse('2026-11-02') - Date.parse('2025-08-09')) / 86_400_000
    expect(days).toBe(450)
    mentions('tr1.l4', 'age', 'was uploaded to PyPI on 2026-11-02, which is 450 days after the commit [derived]')
  })

  test("lesson 5: the five files of the reading budget add up to 12,779 lines, and the lesson says so", () => {
    const rows = tableWithHead('tr1.l5', ['File', 'Lines [measured]', 'What to read in it'])
    const lines = rows.map((row) => Number(inlineText(row[1]).replace(/,/g, '').trim()))
    expect(lines).toEqual([1447, 2170, 2860, 3783, 2519])
    expect(lines.reduce((a, b) => a + b, 0)).toBe(12_779)
    mentions('tr1.l5', 'sum', '12,779 lines [derived]')
  })

  test('lesson 5: six of the twelve statuses are finished, and they are the ones after PREEMPTED', () => {
    expect(FINISHED_STATUSES.length).toBe(6)
    expect(new Set(FINISHED_STATUSES).size).toBe(6)
    for (const status of FINISHED_STATUSES) expect(status.startsWith('FINISHED_')).toBe(true)
    // The lesson names the six by their statuses in its list of states.
    for (const status of FINISHED_STATUSES) expect(lessonOf('tr1.l5').text).toContain(status)
  })

  test("lesson 6: SGLang's two samples are three requests, vLLM's are two, and the model has the warm-up as a stage of its own", () => {
    expect(requestsSent(scenario('sglang', { n: 2 }))).toBe(3)
    expect(requestsSent(scenario('sglang'))).toBe(1)
    expect(requestsSent(scenario('vllm', { n: 2 }))).toBe(2)
    expect(requestsSent(scenario('mini-sglang'))).toBe(1)
    expect(pathOf(scenario('sglang', { n: 2 })).some((stage) => stage.id === 'sglang.n-warmup')).toBe(true)
    const rows = tableWithHead('tr1.l6', ['The question', 'vLLM v0.33.0', 'SGLang v0.5.23'])
    const row = rows.find((r) => inlineText(r[0]).startsWith('How many requests does two samples make?'))
    expect(inlineText(row?.[1] ?? []).replace(/\{\{[^}]+\}\}/g, '').trim()).toBe('two')
    expect(inlineText(row?.[2] ?? []).replace(/\{\{[^}]+\}\}/g, '').trim()).toBe('three')
  })

  test('lesson 7: the news crosses two process boundaries in vLLM, in the post\'s engine and in SGLang, and three in Mini-SGLang', () => {
    expect(abortBoundaries(scenario('vllm', { abort: true }))).toBe(2)
    expect(abortBoundaries(scenario('inside-vllm', { abort: true }))).toBe(2)
    expect(abortBoundaries(scenario('sglang', { abort: true }))).toBe(2)
    expect(abortBoundaries(scenario('mini-sglang', { abort: true }))).toBe(3)
    const rows = tableWithHead('tr1.l7', ['Engine', 'Process boundaries from the client to the process that frees the request', 'Where the request is freed'])
    const counts = Object.fromEntries(rows.map((row) => [inlineText(row[0]).replace(/"/g, '').trim(), inlineText(row[1]).trim()]))
    expect(counts).toEqual({
      'nano-vllm': 'no abort',
      'Mini-SGLang': '3 [derived]',
      'Inside vLLM': '2 [derived]',
      vLLM: '2 [derived]',
      SGLang: '2 [derived]',
    })
  })

  test('lesson 7: nano-vllm has no abort path, and the model says so', () => {
    expect(abortStages(scenario('nano-vllm', { streaming: false })).length).toBe(0)
    // The model has no abort scenario for nano-vllm: its supports say so.
    expect(pathOf(scenario('nano-vllm', { streaming: false })).some((stage) => stage.id.endsWith('.disconnect'))).toBe(false)
  })

  test('lesson 1: the five mechanisms are what the model\'s nine come to, and lesson 1 names the nine', () => {
    expect(new Set(Object.values(MECHANISM_WORD))).toEqual(new Set(['compute', 'queue', 'IPC', 'copy', 'sync']))
    expect(Object.keys(MECHANISM_WORD).length).toBe(9)
    mentions('tr1.l1', 'nine', 'The game\'s tiles use nine words for these five')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The figures                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the figures draw in the page\'s ink and describe themselves as their blocks do', () => {
  const figures = lessons.flatMap(({ lesson }) => lesson.blocks.flatMap((block) => (block.type === 'figure' ? [{ lesson: lesson.id, block }] : [])))

  test('there is a figure for the boundaries, for Mini-SGLang, for vLLM, for the overlap loop and for the abort', () => {
    expect(figures.map((f) => f.block.src)).toEqual([
      'figures/tr1/l1-boundaries.svg',
      'figures/tr1/l3-mini-sglang.svg',
      'figures/tr1/l5-vllm-threads.svg',
      'figures/tr1/l6-overlap.svg',
      'figures/tr1/l7-abort.svg',
    ])
  })

  for (const { lesson, block } of figures) {
    test(`${block.src}: a title and a description that are the block's, no colour and no typeface of its own`, () => {
      const svg = read(`public/${block.src}`)
      const title = /<title>([\s\S]*?)<\/title>/.exec(svg)?.[1] ?? ''
      const desc = /<desc>([\s\S]*?)<\/desc>/.exec(svg)?.[1] ?? ''
      expect(title.trim().length).toBeGreaterThan(8)
      expect([lesson, block.src, desc.trim()]).toEqual([lesson, block.src, block.description.trim()])
      expect(block.alt).not.toBe(block.description)
      expect(block.origin).toBe('authored')
      // A figure is drawn in the page's ink (DESIGN.md; AGENTS.md rule 9).
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|font-family/)
      expect(svg).toContain('currentColor')
      expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/)
    })
  }
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The claims TR1 adds                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

describe(`the claims of ${CLAIMS_FILE}`, () => {
  const mine = result.claims.filter((record) => record.file === CLAIMS_FILE).map((record) => record.claim)
  const vllm = pin('vllm')
  const sglang = pin('sglang')

  /** The one ref a source of each pin may be read at: the tag for vLLM and SGLang, the commit for the rest, and for "Inside vLLM" the post or vLLM at the post's commit. */
  const URL_RULES: Readonly<Record<string, RegExp>> = {
    vllm: new RegExp(`^https://github\\.com/vllm-project/vllm/blob/v${vllm.version}/[^#]+#L\\d+(?:-L\\d+)?$`),
    sglang: new RegExp(`^https://github\\.com/sgl-project/sglang/blob/v${sglang.version}/[^#]+#L\\d+(?:-L\\d+)?$`),
    'nano-vllm': new RegExp(`^https://github\\.com/GeeeekExplorer/nano-vllm/blob/${pin('nano-vllm').commit}/[^#]+#L\\d+(?:-L\\d+)?$`),
    'mini-sglang': new RegExp(`^https://github\\.com/sgl-project/mini-sglang/blob/${pin('mini-sglang').commit}/[^#]+#L\\d+(?:-L\\d+)?$`),
    'inside-vllm': new RegExp(
      `^(?:https://github\\.com/vllm-project/vllm/blob/${pin('inside-vllm').commit}/[^#]+#L\\d+(?:-L\\d+)?|${pin('inside-vllm').url.replace(/[.]/g, '\\.')})$`,
    ),
  }

  test('are many, and every one is measured', () => {
    expect(mine.length).toBeGreaterThanOrEqual(130)
    for (const claim of mine) expect([claim.id, claim.tag]).toEqual([claim.id, 'measured'])
  })

  test('begin their ids with their pin, which names a key of the lockfile', () => {
    for (const claim of mine) {
      expect([claim.id, claim.pin !== undefined]).toEqual([claim.id, true])
      if (claim.pin === undefined) continue
      expect(lock.entries.some((e) => e.key === claim.pin)).toBe(true)
      expect([claim.id, claim.id.startsWith(`${claim.pin}.`)]).toEqual([claim.id, true])
    }
  })

  test("cite a file of that pin's tag or commit, with the lines of the quote", () => {
    for (const claim of mine) {
      const url = claim.source?.url ?? ''
      expect([claim.id, url, URL_RULES[claim.pin ?? '']?.test(url) ?? false]).toEqual([claim.id, url, true])
    }
  })

  test('the lines of a quote run forward, and span at most a hundred lines', () => {
    for (const claim of mine) {
      const m = /#L(\d+)(?:-L(\d+))?$/.exec(claim.source?.url ?? '')
      if (m === null) continue
      const [first, last] = [Number(m[1]), Number(m[2] ?? m[1])]
      expect([claim.id, last >= first && last - first < 100]).toEqual([claim.id, true])
    }
  })

  test('never cite main, master, latest or stable', () => {
    for (const claim of mine) expect(claim.source?.url ?? '').not.toMatch(/\/(?:main|master|latest|stable|HEAD)(?:\/|#|$)/)
  })

  test('carry the day they were read, which is not after the day they were checked, and a TTL of a quarter', () => {
    for (const claim of mine) {
      expect([claim.id, /^\d{4}-\d{2}-\d{2}$/.test(claim.source?.accessed ?? '')]).toEqual([claim.id, true])
      expect([claim.id, (claim.source?.accessed ?? '') <= claim.verifiedAt]).toEqual([claim.id, true])
      // The post is a page that does not move, and a year is the lock's TTL for it; the files of a pin are read each quarter.
      const post = (claim.source?.url ?? '').startsWith('https://vllm.ai/')
      expect([claim.id, claim.ttlDays]).toEqual([claim.id, post ? 365 : 90])
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

  test('every claim of the file is read: cited by a lesson or the module', () => {
    const cited = new Set<string>()
    for (const text of [...lessons.map((l) => l.text), moduleText]) {
      for (const m of text.matchAll(/\{\{claim:([a-z0-9.-]+)\}\}/g)) cited.add(m[1])
    }
    expect(mine.map((c) => c.id).filter((id) => !cited.has(id))).toEqual([])
  })

  test('no claim of the file repeats the id of one in another file', () => {
    const others = result.claims.filter((record) => record.file !== CLAIMS_FILE).map((record) => record.claim.id)
    expect(mine.map((c) => c.id).filter((id) => others.includes(id))).toEqual([])
  })

  test('the claims about an abort say the same things as the lessons: the ones the model names are in the file', () => {
    const byId = new Map(result.claims.map((record) => [record.claim.id, record.claim]))
    expect(byId.get('sglang.abort.running-request')?.text).toMatch(/one more forward pass/)
    expect(byId.get('vllm.engine-core.abort-status')?.text).toMatch(/FINISHED_ABORTED/)
    expect(byId.get('inside-vllm.abort-input-queue')?.text).toMatch(/same input queue as a new request/)
    expect(byId.get('vllm.request.states')?.text).toMatch(/six finished states/)
    expect(byId.get('inside-vllm.request-states')?.text).toMatch(/one of 9 states/)
  })
})
