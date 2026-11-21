/*
 * TR0's module page and its lessons, as they are published lesson by lesson. The module kit (module-kit.ts) runs every check a built module
 * owes, and names what the lessons still to be written take up. Beyond the kit, this file holds what TR0 owes the rest of the course:
 *
 *   - every number a lesson prints from the tensor model is recomputed from `tests/content/tr0-demos.ts`, with the day and the commit it was
 *     printed at beside the table that holds it;
 *   - the module page says that TR0 helps before TR1 and locks nothing, that its lessons are separate subjects, and what Prove asks; and the
 *     course still starts at TR1's first lesson;
 *   - a lesson's compiled page stays small enough to load at once.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { ContentIndex } from '@es/schema'
import { compileContent } from '../../scripts/content/build.ts'
import { findTables, moduleKit } from './module-kit.ts'
import { MODEL_TABLES, PREDICTIONS, QUERY_TOKENS, callRows, chain, courseKernelLines, gridLaunches, practiceGrid, practiceLevel, queryRun, strideZeroRun, threeDRun, transposedWalk, viewsRun } from './tr0-demos.ts'
import { applyOp, contiguousView, isContiguous } from '../../packages/sim/tensor'
import { ruleById, SYNC_RULES } from '../../packages/play/items/families/tr0/sync-rules'
import { TR0_FORWARD } from '../../src/labs/tr0-forward'
import { stateLine } from '../../src/labs/copy'
import { read, repo } from './support.ts'

const LESSON_FILES = [
  'content/modules/tr0/lessons/l1-pytorch-in-rust-terms.md',
  'content/modules/tr0/lessons/l2-views-copies-and-hidden-syncs.md',
  'content/modules/tr0/lessons/l3-nn-module-as-a-struct.md',
  'content/modules/tr0/lessons/l4-reading-triton.md',
] as const
const MODULE_FILE = 'content/modules/tr0/module.md'
const CLAIMS_FILE = 'content/claims/tr0.yaml'

/** The header row of the model table that the demos file holds for a lesson. */
const heldTable = (lesson: string): string => MODEL_TABLES.find((table) => table.lesson === lesson)?.header ?? ''

const result = compileContent({ root: repo })
const lesson1 = read(LESSON_FILES[0])
const lesson2 = read(LESSON_FILES[1])
const lesson3 = read(LESSON_FILES[2])
const lesson4 = read(LESSON_FILES[3])
const claimsText = read('content/claims/tr0.yaml')
const courseKernel = read('scripts/triton-interp/course_kernel.py')
const moduleText = read(MODULE_FILE)

/** The paragraphs of a text, each on one line, outside the front matter and the directives. */
const paragraphs = (text: string): string[] =>
  text
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/^:::[\s\S]*?^:::$/gm, '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter((p) => p.length > 0)

/** The paragraph of a text that contains `marker`. */
const paragraphWith = (text: string, marker: string): string => paragraphs(text).find((p) => p.includes(marker)) ?? ''

describe('TR0 lesson 1: the numbers it prints are the model\'s', () => {
  test("the reference's run on `views` is a transpose that moves nothing and a reshape that moves every element", () => {
    const run = viewsRun()
    expect(run.map((step) => step.moved)).toEqual([0, 0, 24])
    expect(practiceLevel('views').tasks[0].moved).toBe(24)
  })

  test('the model table carries the day and the commit it was printed at, in the sentence above it', () => {
    const [table] = findTables(lesson1).filter((t) => t.header === MODEL_TABLES[0].header)
    expect(table).toBeDefined()
    expect(table.caption).toMatch(/Printed by the course's model on \d{4}-\d{2}-\d{2} at `[0-9a-f]{7}`\./)
  })

  test('the walk of the transposed tensor, and the elements a copy of it moves, are the model\'s', () => {
    const walk = transposedWalk(5)
    expect(walk).toEqual([0, 6, 12, 18, 1])
    const printed = `${walk.slice(0, 4).join(', ')}, then back to ${walk[4]} [synthetic]`
    expect(lesson1).toContain(printed)
    expect(lesson1).toContain(`no single step walks ${walk.join(', ')} [synthetic]`)
    expect(lesson1).toContain(`all ${viewsRun()[2].moved} of them [synthetic]`)
  })

  test('the table of slices, transposes and copies is what the model gives for each call', () => {
    const [table] = findTables(lesson1).filter((t) => t.header.startsWith('| Call on a contiguous `(4, 6)` tensor |'))
    expect(table).toBeDefined()
    expect(table.rows.map((row) => [...row])).toEqual(callRows())
  })

  test('`stride-zero`: `expand` gives the row a second dimension of stride 0 and moves nothing, and `contiguous()` writes every element', () => {
    const [start, expanded, copied] = strideZeroRun()
    expect(start.view.shape).toEqual([6])
    expect([expanded.view.shape, expanded.view.strides, expanded.moved]).toEqual([[4, 6], [0, 1], 0])
    expect(copied.moved).toBe(24)
    expect(lesson1).toContain('strides `(0, 1)`')
    expect(lesson1).toContain(`\`contiguous()\` wrote one: ${copied.moved} elements [synthetic]`)
  })

  test('the address examples are the address sum on the strides the lesson gives', () => {
    const address = (offset: number, strides: readonly number[], index: readonly number[]) => offset + index.reduce((sum, i, d) => sum + i * strides[d], 0)
    expect(lesson1).toContain(`address(0, (6, 1), (2, 3))  # ${address(0, [6, 1], [2, 3])}`)
    expect(lesson1).toContain(`address(0, (1, 6), (2, 3))  # ${address(0, [1, 6], [2, 3])}`)
  })

  test("the lesson's compiled page is under 40 KB, so it loads at once", () => {
    const out = result.outputs.find((o) => o.path === 'src/content/generated/lessons/tr0.l1-pytorch-in-rust-terms.json')
    expect(out).toBeDefined()
    expect(Buffer.byteLength(out?.text ?? '')).toBeLessThan(40 * 1024)
  })
})

describe("TR0 lesson 4: the grid's numbers are the model's, and the walk-through shows only kernels that ran", () => {
  test("the reference's launch on `grid`'s practice tensor is BLOCK (16, 4) on a grid of (1, 5), and the table's other two launches mask more", () => {
    const task = practiceGrid().tasks[0]
    expect([task.shape, task.block, task.grid, task.programs, task.lanes, task.least]).toEqual([[12, 20], [16, 4], [1, 5], 5, 320, 80])
    const [reference, one, square] = gridLaunches()
    expect(reference.masked).toBe(task.least)
    expect([one.masked, square.masked]).toEqual([task.onePass, task.square])
    expect(one.masked).toBeGreaterThan(reference.masked)
    expect(square.masked).toBeGreaterThan(reference.masked)
  })

  test('the model table carries the day and the commit it was printed at, in the sentence above it', () => {
    const [table] = findTables(lesson4).filter((t) => t.header === heldTable('tr0.l4'))
    expect(table).toBeDefined()
    expect(table.caption).toMatch(/Printed by the course's model on \d{4}-\d{2}-\d{2} at `[0-9a-f]{7}`\./)
  })

  test("the prose's figures on the practice tensor are the reference launch's", () => {
    const task = practiceGrid().tasks[0]
    const [rows, cols] = task.shape
    const lanes = task.block[0] * task.block[1]
    const perProgram = task.least / task.programs
    expect(cols % task.block[1]).toBe(0)
    expect(lesson4).toContain(`The ${cols} columns divide by a BLOCK of ${task.block[1]} [synthetic]`)
    // A BLOCK that fits the rows too would need more programs than the cap.
    const fit = [1, 2, 4, 8, 16, 32].filter((b) => rows % b === 0 && b > 1).at(-1) ?? 1
    expect(fit).toBe(4)
    expect((rows / fit) * (cols / task.block[1])).toBeGreaterThan(practiceGrid().cap)
    expect(lesson4).toContain(`The ${rows} rows would divide by ${fit} too, but ${rows / fit} programs down and ${cols / task.block[1]} across make ${(rows / fit) * (cols / task.block[1])} [synthetic]`)
    expect(lesson4).toContain(`The cap of six programs is the level's and not Triton's`)
    expect(practiceGrid().cap).toBe(6)
    expect(lesson4).toContain(`covers ${task.block[0]} rows where the tensor has ${rows}, and ${perProgram} of its ${lanes} lanes are masked [synthetic]`)
  })

  test("the course's own kernel in the lesson is the one in scripts/triton-interp/course_kernel.py, and the lines its run printed are the grid model's", () => {
    // The lesson's kernel is the file's, its load set on a line of its own and its two print lines left out.
    for (const line of [
      'def scale(x_ptr, y_ptr, n, factor, BLOCK: tl.constexpr):',
      'pid = tl.program_id(0)',
      'offs = pid * BLOCK + tl.arange(0, BLOCK)',
      'mask = offs < n',
      'def scale_2d(x_ptr, y_ptr, m, n, stride_m, stride_n, factor, BM: tl.constexpr, BN: tl.constexpr):',
      'offs_m = tl.program_id(0) * BM + tl.arange(0, BM)',
      'offs_n = tl.program_id(1) * BN + tl.arange(0, BN)',
      'mask = (offs_m[:, None] < m) & (offs_n[None, :] < n)',
      'ptrs = offs_m[:, None] * stride_m + offs_n[None, :] * stride_n',
    ]) {
      expect(courseKernel).toContain(line)
    }
    for (const line of ['pid = tl.program_id(0)', 'offs = pid * BLOCK + tl.arange(0, BLOCK)', 'mask = offs < n', 'ptrs = offs_m[:, None] * stride_m + offs_n[None, :] * stride_n']) {
      expect(lesson4).toContain(line)
    }
    expect(courseKernel).toContain('tl.store(y_ptr + offs, tl.load(x_ptr + offs, mask=mask) * factor, mask=mask)')
    expect(lesson4).toContain('x = tl.load(x_ptr + offs, mask=mask)\n    tl.store(y_ptr + offs, x * factor, mask=mask)')
    // The launch's sizes in the file, and the lines its run prints from them.
    expect(courseKernel).toContain('n, block = 10, 4')
    expect(courseKernel).toContain('m, k, bm, bn = 5, 6, 2, 4')
    const [one, two] = courseKernelLines(10, 4, [5, 6], [2, 4])
    expect(one).toBe('1-D: n=10 BLOCK=4 programs=3 lanes=12 masked=2')
    expect(two).toBe('2-D: shape=(5, 6) strides=(1, 5) BLOCK=(2, 4) grid=(3, 2) masked=18')
    expect(lesson4).toContain(`${one}\n${two}`)
    expect(lesson4).toContain('Tiles of `(2, 4)` on a grid of `(3, 2)` cover it, and 18 of the 48 lanes are masked [derived].')
    expect(lesson4).toContain('offsets `[8, 9, 10, 11]` and mask `[True, True, False, False]`')
    // The claim of the course's run says the same numbers.
    expect(claimsText).toContain('its last program held offsets 8, 9, 10, 11 and the mask True, True, False, False')
  })

  test('every Model Runner V2 kernel the lesson walks through is one the interpreter ran, by a claim that says so, and the rest are named as not run', () => {
    const kernels = [...lesson4.matchAll(/^- \[`(_[a-z_]+_kernel)`\]\(https:\/\/github\.com\/vllm-project\/vllm\/blob\/4ba787ec9959e566d3b587a796dff07673324da5\/[^)]+\), in `[a-z_/]+\.py`\..*\{\{claim:(vllm\.mrv2\.interp\.[a-z-]+)\}\}$/gm)]
    expect(kernels.length).toBe(7)
    for (const [, kernel, claim] of kernels) {
      const block = claimsText.split('\n- id: ').find((entry) => entry.startsWith(`${claim}\n`)) ?? ''
      expect([kernel, /^ {2}value: 'ran'$/m.test(block)]).toEqual([kernel, true])
      expect(block).toContain(`text: '${kernel},`)
    }
    expect(lesson4).toContain('{{claim:vllm.mrv2.interp.not-run}}')
    // A kernel the claims name as not run is never in the lesson.
    const notRun = claimsText.split('\n- id: ').find((entry) => entry.startsWith('vllm.mrv2.interp.not-run\n')) ?? ''
    for (const [kernel] of notRun.matchAll(/_[a-z_]+_kernel/g)) expect([kernel, lesson4.includes(kernel)]).toEqual([kernel, false])
  })

  test('says that a Triton 3.8.0 wheel off Linux is [unverified]', () => {
    expect(paragraphWith(lesson4, 'off Linux')).toContain('A Triton 3.8.0 wheel off Linux, for macOS or Windows, is one the course has not checked [unverified].')
  })

  test("the two guesses' figures: the practice tensor's least masked count, and BLOCK 128 over 1000 elements", () => {
    expect(PREDICTIONS['tr0.l4.p1'].reference()).toBe(practiceGrid().tasks[0].least)
    expect(PREDICTIONS['tr0.l4.p2'].reference()).toBe(24)
  })

  test("the lesson's compiled page is under 40 KB, so it loads at once", () => {
    const out = result.outputs.find((o) => o.path === 'src/content/generated/lessons/tr0.l4-reading-triton.json')
    expect(out).toBeDefined()
    expect(Buffer.byteLength(out?.text ?? '')).toBeLessThan(40 * 1024)
  })
})

describe("TR0 lesson 2: the three-d run's numbers are the model's, and the syncs are the rule table's", () => {
  test("the reference's run on `three-d` splits and permutes with no copy, and its one copy moves every element", () => {
    const run = threeDRun()
    expect(run.map((step) => step.moved)).toEqual([0, 0, 0, 32])
    expect(run.map((step) => step.op?.op ?? null)).toEqual([null, 'reshape', 'permute', 'contiguous'])
    expect(run[2].op).toEqual({ op: 'permute', order: [1, 0, 2] })
    expect(run[0].view.shape).toEqual([4, 8])
    // The neighbouring tokens of one head: the token dimension's stride after the permute, and the first stride after the copy.
    expect(run[2].view.strides[1]).toBe(8)
    expect(run[3].view.strides[0]).toBe(16)
    expect(lesson2).toContain(`Two neighbouring tokens of one head are \`${run[2].view.strides[1]}\` addresses apart [synthetic]`)
    expect(lesson2).toContain(`all ${run[3].moved} elements move [synthetic]`)
    expect(lesson2).toContain('is no longer contiguous')
    expect(isContiguous(run[2].view)).toBe(false)
    expect(lesson2).toContain(`each head becomes one run of \`${run[3].view.strides[0]}\` elements`)
    expect(practiceLevel('three-d').tasks[0].answer).toBe(run[2].view.strides[1])
  })

  test('the model table carries the day and the commit it was printed at, in the sentence above it', () => {
    const [table] = findTables(lesson2).filter((t) => t.header === heldTable('tr0.l2'))
    expect(table).toBeDefined()
    expect(table.caption).toMatch(/Printed by the course's model on \d{4}-\d{2}-\d{2} at `[0-9a-f]{7}`\./)
  })

  test("the guesses' figures: the token gap after the permute, and the three of four lines that wait", () => {
    expect(PREDICTIONS['tr0.l2.p1'].reference()).toBe(threeDRun()[2].view.strides[1])
    expect(PREDICTIONS['tr0.l2.p2'].reference()).toBe(3)
  })

  test("each call that the lesson lists is a row of the family's rule table, under the heading its row says, with the claims of that row", () => {
    const byLine: Readonly<Record<string, string>> = { 'n = x.item()': 'item', 'ids = x.tolist()': 'tolist', 'small = x.cpu()': 'cpu', 'torch.cuda.synchronize()': 'synchronize', 'y = x.sum()': 'sum', 'z = x @ w': 'matmul', 'v = x.view(-1)': 'view' }
    const items = lesson2.split('\n').flatMap((line) => {
      const m = /^- `([^`]+)`\. (.*)$/.exec(line)
      return m === null ? [] : [{ line: m[1], text: m[2] }]
    })
    expect(items.map((item) => item.line)).toEqual(Object.keys(byLine))
    // The first four wait and the last three do not: the lesson's two lists, each introduced by what its calls have in common.
    expect(lesson2).toContain('These lines wait, because')
    expect(lesson2).toContain('These lines do not wait, because')
    items.forEach((item, at) => {
      const rule = ruleById(byLine[item.line])
      expect([item.line, at < 4]).toEqual([item.line, rule.waits])
      const marks = [...item.text.matchAll(/\{\{claim:([a-z0-9.-]+)\}\}/g)].map((m) => m[1])
      expect([item.line, marks.length]).toEqual([item.line, 1])
      expect([item.line, marks[0], rule.claims.includes(marks[0])]).toEqual([item.line, marks[0], true])
    })
  })

  test('the loop that waits 25 times is 24 passes of one wait and one wait after it, by the rule table', () => {
    expect(lesson2).toContain('for layer in range(24):')
    expect(lesson2).toContain('So the loop waits `25` times [derived].')
    expect(24 * [ruleById('item')].filter((rule) => rule.waits).length + [ruleById('tolist')].filter((rule) => rule.waits).length).toBe(25)
  })

  test('printing a GPU tensor is said to be unverified, and no question rests on it', () => {
    expect(paragraphWith(lesson2, 'Printing a GPU tensor')).toContain('[unverified]')
    expect(SYNC_RULES.some((rule) => /print/.test(rule.line('x', 'y')))).toBe(false)
  })

  test("the lesson's compiled page is under 40 KB, so it loads at once", () => {
    const out = result.outputs.find((o) => o.path === 'src/content/generated/lessons/tr0.l2-views-copies-and-hidden-syncs.json')
    expect(out).toBeDefined()
    expect(Buffer.byteLength(out?.text ?? '')).toBeLessThan(40 * 1024)
  })
})

describe("TR0 lesson 3: every value of Qwen3 is a claim on the pinned config.json, and no block claims a run", () => {
  const values = new Map(result.claims.filter((record) => record.file === CLAIMS_FILE).map((record) => [record.claim.id, record.claim]))
  const configRows = findTables(lesson3).filter((t) => t.header.startsWith('| What it sizes |'))[0]?.rows ?? []

  test("each row of the configuration table is one claim, printed by its mark, and the claim is of the model's config.json at its pin", () => {
    expect(configRows.length).toBe(9)
    for (const [what, value] of configRows) {
      const [, id] = /^\{\{claim:([a-z0-9.-]+)\}\}$/.exec(value) ?? []
      const claim = values.get(id)
      expect([what, claim !== undefined]).toEqual([what, true])
      expect([what, claim?.pin, claim?.source?.url.includes('/config.json'), claim?.tag]).toEqual([what, 'qwen3-0.6b', true, 'measured'])
    }
    // Lesson 3 prints no number of the model's that no claim stands behind: the sizes it spells are the claims' values and nothing else.
    const printed = new Set([...lesson3.matchAll(/`(\d{3,}|1e-06)`/g)].map((m) => m[1]))
    const claimed = new Set([...values.values()].filter((claim) => claim.id.startsWith('qwen3.config.')).map((claim) => String(claim.value)))
    for (const number of printed) {
      if (['5', '6144', '911616', '12288', '6'].includes(number)) continue
      expect([number, claimed.has(number)]).toEqual([number, true])
    }
  })

  test('the sizes of the projections are the derived claims, and each is the product of the claims it names', () => {
    const heads = Number(values.get('qwen3.config.heads')?.value)
    const kvHeads = Number(values.get('qwen3.config.kv-heads')?.value)
    const size = Number(values.get('qwen3.config.head-dim')?.value)
    const hidden = Number(values.get('qwen3.config.hidden-size')?.value)
    expect([heads * size, kvHeads * size, heads / kvHeads]).toEqual([2048, 1024, 2])
    for (const [id, value] of [['qwen3.config.q-proj-rows', heads * size], ['qwen3.config.kv-proj-rows', kvHeads * size], ['qwen3.config.query-group', heads / kvHeads]] as const) {
      expect([id, Number(values.get(id)?.value)]).toEqual([id, value])
    }
    expect(lesson3).toContain('That is {{claim:qwen3.config.q-proj-rows}} rows for the query and {{claim:qwen3.config.kv-proj-rows}} for each of the other two.')
    expect(PREDICTIONS['tr0.l3.p1'].reference()).toBe(heads * size)
    // The hidden size is not heads times the head size, which is the trap of the guess.
    expect(hidden).not.toBe(heads * size)
  })

  test('the shapes at the five points are the hidden size and the vocabulary, with the strides of a contiguous tensor', () => {
    const hidden = Number(values.get('qwen3.config.hidden-size')?.value)
    const vocab = Number(values.get('qwen3.config.vocab-size')?.value)
    const lines = lesson3.split('\n').filter((line) => / leaves with /.test(line) || /^- The first layer's (attention|MLP) leaves with the same/.test(line) || /^- The final norm leaves/.test(line))
    const view = (last: number) => contiguousView([1, QUERY_TOKENS, last])
    const tuple = (xs: readonly number[]) => `(${xs.join(', ')})`
    const full = (last: number) => `shape \`${tuple(view(last).shape)}\` and strides \`${tuple(view(last).strides)}\``
    expect(lines).toEqual([
      `- The embedding leaves with ${full(hidden)}.`,
      "- The first layer's attention leaves with the same shape and strides.",
      "- The first layer's MLP leaves with the same shape and strides.",
      '- The final norm leaves with the same shape and strides.',
      `- The head leaves with ${full(vocab)}.`,
    ])
  })

  test("the query's path through the attention is the model's: two views, then a transpose that no view can undo", () => {
    const run = queryRun()
    expect(run.map((step) => step.moved)).toEqual([0, 0, 0])
    expect(run[2].view.shape).toEqual([1, 16, QUERY_TOKENS, 128])
    expect(run[2].view.strides).toEqual([12288, 128, 2048, 1])
    const back = applyOp(run[2].view, { op: 'view', shape: [1, QUERY_TOKENS, 2048] })
    expect('error' in back).toBe(true)
    const copy = chain(run[2].view, [{ op: 'reshape', shape: [1, QUERY_TOKENS, 2048] }])
    expect(copy[1].moved).toBe(QUERY_TOKENS * 2048)
    expect(lesson3).toContain('a `view` to `(1, 6, 2048)` is refused')
    expect(lesson3).toContain('Take one prompt of `6` tokens [estimated]. The `6` is arbitrary')
    const [table] = findTables(lesson3).filter((t) => t.header === heldTable('tr0.l3'))
    expect(table.caption).toMatch(/Printed by the course's model on \d{4}-\d{2}-\d{2} at `[0-9a-f]{7}`\./)
  })

  test('says that how nn.Module names its tensors is unverified, and carries the lab\'s Build row and no lab or trace block', () => {
    expect(paragraphWith(lesson3, 'How `nn.Module` builds such names')).toContain('[unverified]')
    const out = result.outputs.find((o) => o.path === 'src/content/generated/lessons/tr0.l3-nn-module-as-a-struct.json')
    const blocks = (JSON.parse(out?.text ?? '{}') as { blocks: { type: string; kind?: string; id?: string }[] }).blocks
    expect(blocks.filter((block) => block.type === 'lab' || block.type === 'trace')).toEqual([])
    expect(blocks.filter((block) => block.type === 'card' && block.kind === 'build-this').map((block) => block.id)).toEqual(['build-tr0-forward'])
    const card = read('content/cards/build-tr0-forward.md')
    expect(card).toContain('lab: tr0.forward')
    expect(card).toContain(`stages: [${TR0_FORWARD.stages.map((stage) => stage.id.split('.').pop()).join(', ')}]`)
    // The card does not say the lab was run.
    expect(card).toContain('has not yet run it on the pinned weights')
  })

  test("the lesson's compiled page is under 40 KB, so it loads at once", () => {
    const out = result.outputs.find((o) => o.path === 'src/content/generated/lessons/tr0.l3-nn-module-as-a-struct.json')
    expect(out).toBeDefined()
    expect(Buffer.byteLength(out?.text ?? '')).toBeLessThan(40 * 1024)
  })
})

describe('the TR0 module page', () => {
  test('says that TR0 helps before TR1 and locks nothing', () => {
    // The second of the two sentences the page sets under the title.
    const [first] = paragraphs(moduleText)
    expect(first.split(/(?<=\.)\s+/)[1]).toBe(
      "TR0 helps before TR1 and locks nothing: the course starts at the first lesson of TR1, and you can come here first, or come back when the engines' Python reads hard.",
    )
  })

  test('says that its lessons are separate subjects, with no table of what changed and no one relation', () => {
    expect(paragraphWith(moduleText, 'five separate subjects')).toBe(
      "TR0's five lessons are five separate subjects: a tensor's layout, the calls that wait for the GPU, a model's code, Triton's programs and an engine's own model code. So no lesson carries a table of what changed since the one before, and no one relation runs through them all.",
    )
  })

  test("the part on the laptop says which stage tests what, and its state lines are the lab page's, word for word", () => {
    const stages = TR0_FORWARD.stages
    const items = moduleText.split('\n').filter((line) => line.startsWith('- **Stage `s'))
    expect(items.length).toBe(stages.length)
    stages.forEach((stage, at) => {
      const line = items[at]
      expect(line.startsWith(`- **Stage \`${stage.id.split('.').pop()}\``)).toBe(true)
      // Every check of the stage is named on its line, and no check of another stage is.
      for (const check of stages.flatMap((one) => one.checks)) expect([stage.id, check.id, line.includes(`\`${check.id}\``)]).toEqual([stage.id, check.id, stage.checks.includes(check)])
      expect(line).toContain(`Where it stands: ${stateLine(stage.state)}.`)
    })
    // Stage 2 waits for the course's reference bank, and says what that does to the check.
    expect(stages.map((stage) => stage.state.kind)).toEqual(['not-run-weights', 'awaiting-bank', 'not-run-weights'])
    expect(items[1]).toContain("A third check, `argmax-bank`, is made by this site from your receipt")
    expect(items[1]).toContain('`argmax-bank` cannot pass')
  })

  test("says that nothing on the page is a run of the learner's machine, and the page carries no measured number", () => {
    expect(paragraphWith(moduleText, 'Nothing on this page is a run of your machine')).toContain('the course has run none of the three stages on the pinned weights')
    expect(moduleText).not.toContain('[measured]')
    expect(moduleText).not.toContain('is not published yet, so this page')
  })

  test('says what Prove asks, in words', () => {
    expect(paragraphWith(moduleText, 'Prove:')).toStartWith("Prove: Tensor views' Fewest copies, in Prove mode, on three new targets with your coding agent closed.")
  })

  test("the course still starts at TR1's first lesson, and TR0 is published beside it", () => {
    const out = result.outputs.find((o) => o.path === 'src/content/generated/index.json')
    const index = JSON.parse(out?.text ?? '{}') as ContentIndex
    expect(index.firstLesson?.module).toBe('tr1')
    expect(index.firstLesson?.route).toMatch(/^\/m\/tr1\/l1-/)
    expect(index.modules.find((module) => module.id === 'tr0')?.published).toBe(true)
  })

  test('the claims file the compiler writes is never committed', () => {
    expect(readFileSync(path.join(repo, '.gitignore'), 'utf8').split('\n')).toContain('public/claims.json')
  })
})

moduleKit({
  id: 'tr0',
  result,
  lessonFiles: LESSON_FILES,
  moduleFile: MODULE_FILE,
  claimsFile: CLAIMS_FILE,
  titles: [
    'PyTorch in Rust terms: storage, shape, strides, dtype, device',
    'Views, copies, and the syncs you cannot see',
    "nn.Module as a struct: Qwen3's forward in the pinned transformers",
    'Reading Triton: grids, programs, BLOCK and masks',
  ],
  labs: [{ id: 'tr0.forward', lane: 'L', stages: ['s1', 's2', 's3'] }],
  announces: "The lab runs on your laptop's CPU, outside the browser, and needs no GPU.",
  demosFile: 'tests/content/tr0-demos.ts',
  modelTables: MODEL_TABLES,
  toCome: {
    kcs: [],
    claims: [
      // The pins that the laptop part stands on.
      'torch.release.upload',
      'triton.release.upload',
      'transformers.release.upload',
      'python.vllm.default-3-12',
      // Triton's own documents that no written lesson reads yet: the number of programs, and arange's documented rule.
      'triton.num-programs',
      'triton.arange-power-of-two',
      // Lesson 5: vLLM's Model Runner V2 Triton files, Mini-SGLang's Qwen3 and SGLang's PyO3 example.
      'vllm.mrv2.gumbel-lines',
      'vllm.mrv2.buffer-utils-lines',
      'vllm.mrv2.block-table-lines',
      'vllm.mrv2.input-batch-lines',
      'vllm.mrv2.rejection-sampler-lines',
      'vllm.mrv2.temperature-grid',
      'vllm.mrv2.staged-write-tensor',
      'vllm.mrv2.input-batch-kernels',
      'vllm.mrv2.rejection-kernels',
      'minisgl.qwen3.lines',
      'minisgl.qwen3.attention-imported',
      'minisgl.qwen3.layer-order',
      'minisgl.qwen3.nvtx-layer',
      'minisgl.attn.merged-qkv',
      'minisgl.attn.qkv-width',
      'minisgl.attn.qkv-one-matmul',
      'minisgl.attn.forward',
      'minisgl.mlp.gate-up-merged',
      'sglang.pyo3.module',
      'sglang.pyo3.registers',
      'sglang.pyo3.tch',
      'sglang.pyo3.tensor-bridge',
      'sglang.pyo3.panic-to-error',
      'sglang.pyo3.match-prefix',
      // The model's merged projection (lesson 5 sets it beside Mini-SGLang's), and the files and licence of the checkpoint.
      'qwen3.config.qkv-merged-rows',
      'qwen3.config.stored-dtype',
      'qwen3.revision.licence',
      'qwen3.weights.bytes',
      'qwen3.weights.sha256',
    ],
  },
})
