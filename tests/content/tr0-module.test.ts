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
import { MODEL_TABLES, callRows, practiceLevel, strideZeroRun, transposedWalk, viewsRun } from './tr0-demos.ts'
import { read, repo } from './support.ts'

const LESSON_FILES = ['content/modules/tr0/lessons/l1-pytorch-in-rust-terms.md'] as const
const MODULE_FILE = 'content/modules/tr0/module.md'
const CLAIMS_FILE = 'content/claims/tr0.yaml'

const result = compileContent({ root: repo })
const lesson1 = read(LESSON_FILES[0])
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
  titles: ['PyTorch in Rust terms: storage, shape, strides, dtype, device'],
  labs: [{ id: 'tr0.forward', lane: 'L', stages: ['s1', 's2', 's3'] }],
  announces: "The lab runs on your laptop's CPU, outside the browser, and needs no GPU.",
  demosFile: 'tests/content/tr0-demos.ts',
  modelTables: MODEL_TABLES,
  toCome: {
    kcs: ['tr0.hidden-syncs', 'tr0.module-as-struct', 'tr0.decoder-forward', 'tr0.kv-cache-contract', 'tr0.triton-program-model', 'tr0.triton-masks'],
    claims: [
      // Lesson 2: views and copies in engine code, and the calls that wait for the GPU.
      'torch.views.reshape-unspecified',
      'torch.cuda.async-by-default',
      'torch.cuda.enqueued',
      'torch.cuda.item-synchronizes',
      'torch.tolist.moves-to-cpu',
      'torch.cpu.copies',
      'torch.cuda.synchronize-waits',
      'torch.cuda.non-blocking',
      'torch.cuda.timing-needs-sync',
      'torch.cuda.sync-debug-warns',
      'torch.cuda.sync-debug-partial',
      'torch.cuda.print-waits',
      // The pins that the laptop part and lesson 4 stand on.
      'torch.release.triton-pin',
      'torch.release.upload',
      'triton.release.upload',
      'triton.release.python-range',
      'transformers.release.upload',
      'python.vllm.default-3-12',
      // Lesson 4: Triton's program model and its interpreter.
      'triton.program-id-axes',
      'triton.num-programs',
      'triton.arange-power-of-two',
      'triton.arange-constexpr',
      'triton.load-other',
      'triton.interpret-knob',
      'triton.interpret-swaps-jit',
      'triton.launch-syntax',
      'triton.interpret-one-program-at-a-time',
      'triton.interpret-on-cpu',
      // Lesson 4's walk-through: the course's own kernel and the Model Runner V2 kernels that ran under the interpreter, and the one that did not.
      'vllm.mrv2.interp.temperature',
      'vllm.mrv2.interp.gumbel-sample',
      'vllm.mrv2.interp.apply-write',
      'vllm.mrv2.interp.gather-block-tables',
      'vllm.mrv2.interp.slot-mappings',
      'vllm.mrv2.interp.prepare-prefill',
      'vllm.mrv2.interp.pos-seq-lens',
      'vllm.mrv2.interp.not-run',
      'triton.course-kernel.ran',
      // Lesson 5: vLLM's Model Runner V2 Triton files, Mini-SGLang's Qwen3 and SGLang's PyO3 example.
      'vllm.mrv2.gumbel-lines',
      'vllm.mrv2.buffer-utils-lines',
      'vllm.mrv2.block-table-lines',
      'vllm.mrv2.input-batch-lines',
      'vllm.mrv2.rejection-sampler-lines',
      'vllm.mrv2.temperature-grid',
      'vllm.mrv2.temperature-mask',
      'vllm.mrv2.staged-write-tensor',
      'vllm.mrv2.apply-write-mask',
      'vllm.mrv2.block-table-grid',
      'vllm.mrv2.input-batch-kernels',
      'vllm.mrv2.rejection-kernels',
      'vllm.mrv2.interpreter-run',
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
      // Lesson 3: Qwen3's decoder in the pinned transformers, and the model's configuration and files.
      'transformers.qwen3.decoder-order',
      'transformers.qwen3.rmsnorm',
      'transformers.qwen3.qk-norm',
      'transformers.qwen3.attn-projections',
      'transformers.qwen3.attn-views',
      'transformers.qwen3.attn-contiguous',
      'transformers.qwen3.attn-scaling',
      'transformers.qwen3.mlp',
      'transformers.qwen3.rotate-half',
      'transformers.qwen3.embedding',
      'qwen3.config.layers',
      'qwen3.config.heads',
      'qwen3.config.kv-heads',
      'qwen3.config.head-dim',
      'qwen3.config.hidden-size',
      'qwen3.config.intermediate-size',
      'qwen3.config.vocab-size',
      'qwen3.config.max-positions',
      'qwen3.config.rope-theta',
      'qwen3.config.rms-eps',
      'qwen3.config.tied-embeddings',
      'qwen3.config.activation',
      'qwen3.config.stored-dtype',
      'qwen3.config.q-proj-rows',
      'qwen3.config.kv-proj-rows',
      'qwen3.config.qkv-merged-rows',
      'qwen3.config.query-group',
      'qwen3.revision.licence',
      'qwen3.weights.bytes',
      'qwen3.weights.sha256',
    ],
  },
})
