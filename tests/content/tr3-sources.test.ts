/*
 * TR3's sources at the pins (content/claims/tr3.yaml): what the claims of the profiling module read, and from which version. The quotes are
 * found again inside their anchored lines by `bun scripts/claims/requote.ts content/claims/tr3.yaml` (it reads the network, so it is no part of
 * this file); this file holds the rest: each address is a file at a pinned commit or tag, or the archived guide of one version, and what the
 * sources could not give is not claimed.
 */
import { describe, expect, test } from 'bun:test'
import { lockFileSchema } from '@es/schema/lock'
import { compileContent } from '../../scripts/content/build.ts'
import { BOOK_CLAIM, citesBook } from '../../scripts/verify-claims.ts'
import { read, repo } from './support.ts'

const FILE = 'content/claims/tr3.yaml'
const result = compileContent({ root: repo })
const lock = lockFileSchema.parse(JSON.parse(read('course.lock.json')))
const entry = (key: string) => {
  const found = lock.entries.find((e) => e.key === key)
  if (found === undefined) throw new Error(`course.lock.json has no ${key}`)
  return found
}
const mine = result.claims.filter((record) => record.file === FILE).map((record) => record.claim)

/** The one address a claim of each pin may cite: the pin's file at its commit or its tag, with the lines of the quote. */
const ADDRESS: Record<string, RegExp> = {
  vllm: new RegExp(`^https://github\\.com/vllm-project/vllm/blob/${entry('vllm').commit}/[^#]+#L\\d+(?:-L\\d+)?$`),
  sglang: new RegExp(`^https://github\\.com/sgl-project/sglang/blob/${entry('sglang').commit}/[^#]+#L\\d+(?:-L\\d+)?$`),
  torch: new RegExp(`^https://github\\.com/pytorch/pytorch/blob/v${entry('torch').version}/[^#]+#L\\d+(?:-L\\d+)?$`),
  perfetto: new RegExp(`^https://github\\.com/google/perfetto/blob/${entry('perfetto').version}/[^#]+#L\\d+(?:-L\\d+)?$`),
  // A versioned guide is one page: its claims name no lines.
  nsys: /^https:\/\/archive\.docs\.nvidia\.com\/nsight-systems\/2026\.5\/UserGuide\/index\.html$/,
}

describe(`the claims of ${FILE}`, () => {
  test('are 60 to 90, each with a source, a quote and the day it was read', () => {
    expect(mine.length).toBeGreaterThanOrEqual(60)
    expect(mine.length).toBeLessThanOrEqual(90)
    for (const claim of mine) {
      expect([claim.id, claim.source !== undefined, (claim.source?.quote ?? '').length > 0]).toEqual([claim.id, true, true])
      expect([claim.id, /^\d{4}-\d{2}-\d{2}$/.test(claim.source?.accessed ?? '')]).toEqual([claim.id, true])
    }
  })

  test('begin with the thing they describe, which is also their pin', () => {
    for (const claim of mine) {
      const area = claim.id.split('.')[0]
      const pin = area === 'perfetto' || area === 'nsys' || area === 'torch' || area === 'sglang' || area === 'vllm' ? area : undefined
      expect([claim.id, pin !== undefined]).toEqual([claim.id, true])
      expect([claim.id, claim.pin]).toEqual([claim.id, pin])
    }
  })

  test("each is a file at its pin's commit or tag, or the archived guide of the pinned version, and never main, latest or stable", () => {
    for (const claim of mine) {
      const url = claim.source?.url ?? ''
      expect([claim.id, ADDRESS[claim.pin ?? '']?.test(url) ?? false]).toEqual([claim.id, true])
      expect(url).not.toMatch(/\/(?:main|master|latest|stable|HEAD)(?:\/|#|$)/)
    }
  })

  test('are read at the pins that the lock holds: vLLM and SGLang by commit, PyTorch and Perfetto by tag, Nsight Systems by its 2026.5 guide', () => {
    expect([entry('vllm').commit, entry('sglang').commit]).toEqual(['4ba787ec9959e566d3b587a796dff07673324da5', '297e54fd105e974cdf401e5b4d20253a22c16f90'])
    expect([entry('torch').version, entry('perfetto').version, entry('nsys').version]).toEqual(['2.14.0', 'v59.1', '2026.5.1'])
  })

  test('are read before they are checked, last a quarter (a year for PyTorch, whose docstrings change with a release), and state what a source says, never a run of the course', () => {
    for (const claim of mine) {
      expect([claim.id, claim.source!.accessed <= claim.verifiedAt, claim.ttlDays <= (claim.pin === 'torch' ? 365 : 90)]).toEqual([claim.id, true, true])
      // A claim states what a source says. The course ran none of the commands it quotes, so none of them is a measurement of a run.
      expect([claim.id, claim.tag === 'measured' || claim.tag === 'unverified']).toEqual([claim.id, true])
    }
  })

  test('hold what was not read as unverified, and list it: the flush time and the names that a real trace holds', () => {
    expect(mine.filter((claim) => claim.tag === 'unverified').map((claim) => claim.id)).toEqual(['vllm.profiling.flush-time', 'vllm.profiling.trace-event-names'])
  })

  test("do not write the 'Queue Dur' column: the 2026.5 guide holds no such report, so no claim names it", () => {
    for (const claim of mine) {
      const words = `${claim.id} ${claim.text} ${claim.source?.quote ?? ''} ${claim.source?.title ?? ''}`
      expect([claim.id, /Queue Dur|cuda_kern_exec_trace|server_args/.test(words)]).toEqual([claim.id, false])
    }
  })

  test('hold the profiled step, its window and the host requirements the lessons and the items rest on', () => {
    const ids = new Set(mine.map((claim) => claim.id))
    for (const id of [
      'vllm.profiling.step-annotation',
      'vllm.profiling.delay-counts-steps',
      'vllm.profiling.max-stops',
      'vllm.profiling.warmup-not-counted',
      'vllm.install.cuda13-driver',
      'nsys.paranoid-level',
      'nsys.graph-trace-node',
      'sglang.profiling.step-label-decode',
      'sglang.profiling.step-range',
      'torch.profiler.step-range',
      'perfetto.chrome-json.direct',
    ]) {
      expect([id, ids.has(id)]).toEqual([id, true])
    }
    const byId = new Map(mine.map((claim) => [claim.id, claim]))
    expect([byId.get('vllm.install.cuda13-driver')?.value, byId.get('sglang.profiling.step-range')?.value]).toEqual(['R580', 10])
  })

  test('are not the book: only the launch figure of tr2 cites it, and its address is the repository at the commit that the lock pins', () => {
    expect(mine.filter(citesBook)).toEqual([])
    const book = result.claims.filter((record) => citesBook(record.claim)).map((record) => record.claim)
    expect(book.map((claim) => claim.id)).toEqual([BOOK_CLAIM])
    expect(book[0].source?.url).toBe(`https://github.com/mlc-ai/modern-gpu-programming-for-mlsys/blob/${entry('mlc-book').commit}/appendix/benchmarking_gpu_kernels.md#L611`)
  })

  test('hold no local path, session id or address of a person', () => {
    const text = read(FILE)
    expect(text).not.toMatch(/\/home\/|\/tmp\/|@[a-z0-9-]+\.[a-z]{2,}/i)
  })
})
