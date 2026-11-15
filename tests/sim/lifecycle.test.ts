/*
 * W1-T16's model (ARCHITECTURE §5.8; GAMES.md §5; the `lifecycle` card): the engines' request paths as data. The acceptance checks of the
 * task are stated where they are tested:
 *
 *   1. "Every stage cites its file at its commit." Here, offline: each citation names the engine's repository and the commit that
 *      course.lock.json pins for it, a relative path, a symbol, a line and a one-line quote, and a stage that appears in several scenarios
 *      always cites the same place. tests/sim/lifecycle-sources.test.ts checks the quotes themselves against the unpacked tarballs, when
 *      ES_LIFECYCLE_SOURCES names them, and its header says how the run on 2026-11-04 went.
 *   2. "Synthetic traces pass traceChecks": tests/sim/lifecycle-trace.test.ts.
 *   3. "Goldens reproduce": tests/sim/lifecycle-goldens.test.ts.
 *
 * What stands behind them, in this file: the invariants of GAMES.md §5 on every reference path of every valid scenario (connected from the
 * client to the GPU and back, every change of process by IPC or shared memory, every read after an async copy after a sync), the way each
 * factor of a scenario changes a path, the rules as functions with known-wrong paths that must fail them (the bestiary of §5.10), and the
 * scenario space itself.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { lockFileSchema } from '@es/schema/lock'
import {
  ENGINES,
  ENGINE_IDS,
  FITS,
  LIFECYCLE_CARD_ID,
  MECHANISMS,
  RULES,
  boundaryOf,
  describePlace,
  describeScenario,
  engineStages,
  entryOf,
  invalidReason,
  legal,
  pathFacts,
  referencePath,
  samePlace,
  scenarios,
  stageFits,
  walk,
} from '../../packages/sim/lifecycle'
import type { EngineId, Place, Scenario, StageDef } from '../../packages/sim/lifecycle'

const root = path.resolve(import.meta.dirname, '../..')
const lock = lockFileSchema.parse(JSON.parse(readFileSync(path.join(root, 'course.lock.json'), 'utf8')))

const PREFIX: Readonly<Record<EngineId, string>> = { 'nano-vllm': 'nano.', 'mini-sglang': 'mini.', 'inside-vllm': 'inside.', vllm: 'vllm.', sglang: 'sglang.' }
const REPO: Readonly<Record<EngineId, string>> = {
  'nano-vllm': 'GeeeekExplorer/nano-vllm',
  'mini-sglang': 'sgl-project/mini-sglang',
  'inside-vllm': 'vllm-project/vllm',
  vllm: 'vllm-project/vllm',
  sglang: 'sgl-project/sglang',
}
const ALL = scenarios()
const base = (engine: EngineId): Scenario => ({ engine, streaming: ENGINES[engine].supports.streaming.includes(true), tp: 1, abort: false, prefixHit: false, n: 1 })
const ids = (p: readonly StageDef[]): string[] => p.map((s) => s.id)
const text = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

describe('the engines and their pins', () => {
  test('are the five of GAMES.md §5, each pinned in course.lock.json by a key of its own name', () => {
    expect([...ENGINE_IDS]).toEqual(['nano-vllm', 'mini-sglang', 'inside-vllm', 'vllm', 'sglang'])
    for (const id of ENGINE_IDS) {
      const def = ENGINES[id]
      expect(def.id).toBe(id)
      const entry = lock.entries.find((one) => one.key === id)
      expect([id, entry?.commit]).toEqual([id, def.ref])
      expect([id, def.repo]).toEqual([id, REPO[id]])
      // A git pin names its repository in the lock; a package pin or a post does not, and the test above holds the commit.
      if (entry?.kind === 'git') expect([id, entry.url]).toEqual([id, `https://github.com/${def.repo}`])
    }
  })

  test('were read on a day, which is not after the day the lock checked them', () => {
    for (const id of ENGINE_IDS) {
      const entry = lock.entries.find((one) => one.key === id)
      expect([id, /^\d{4}-\d{2}-\d{2}$/.test(ENGINES[id].readOn)]).toEqual([id, true])
      expect([id, ENGINES[id].readOn <= (entry?.checkedAt ?? '')]).toEqual([id, true])
    }
  })

  test('have the card the model names, and the card says what this model is', () => {
    expect(LIFECYCLE_CARD_ID).toBe('lifecycle')
    const card = readFileSync(path.join(root, 'content/cards/lifecycle.md'), 'utf8')
    expect(card).toContain(`id: ${LIFECYCLE_CARD_ID}\n`)
    expect(card).toContain('packages/sim/lifecycle')
  })
})

describe('check 1: every stage cites its file at its commit', () => {
  test('with the engine\'s repository, the lock\'s commit, a path, a symbol, a line and a quote of one line', () => {
    let stages = 0
    for (const sc of ALL) {
      const def = ENGINES[sc.engine]
      for (const stage of referencePath(sc)) {
        stages++
        const c = stage.source
        const where = `${describeScenario(sc)}: ${stage.id}`
        expect([where, c.repo, c.ref]).toEqual([where, def.repo, def.ref])
        expect([where, /^[0-9a-f]{40}$/.test(c.ref)]).toEqual([where, true])
        expect([where, /^[A-Za-z0-9_][A-Za-z0-9_./-]*\.py$/.test(c.path) && !c.path.includes('..')]).toEqual([where, true])
        expect([where, /^[A-Za-z_][\w.]*$/.test(c.symbol)]).toEqual([where, true])
        expect([where, Number.isInteger(c.line) && c.line >= 1]).toEqual([where, true])
        expect([where, c.quote.length > 0 && c.quote.length <= 160 && !c.quote.includes('\n') && c.quote === c.quote.trim()]).toEqual([where, true])
      }
    }
    expect(stages).toBeGreaterThan(1500)
  })

  test('a stage id means one mechanism and one place in the source wherever it appears, and begins with its engine\'s prefix', () => {
    const seen = new Map<string, string>()
    for (const sc of ALL) {
      for (const stage of referencePath(sc)) {
        const c = stage.source
        expect([stage.id, stage.id.startsWith(PREFIX[sc.engine])]).toEqual([stage.id, true])
        const key = JSON.stringify([stage.mechanism, c.path, c.symbol, c.line, c.quote])
        expect([stage.id, seen.get(stage.id) ?? key]).toEqual([stage.id, key])
        seen.set(stage.id, key)
      }
    }
    // No two engines share an id.
    const owner = new Map<string, EngineId>()
    for (const sc of ALL) {
      for (const stage of referencePath(sc)) {
        expect([stage.id, owner.get(stage.id) ?? sc.engine]).toEqual([stage.id, sc.engine])
        owner.set(stage.id, sc.engine)
      }
    }
    expect(seen.size).toBeGreaterThan(100)
  })

  test('and the permalink of a stage is a pinned one', () => {
    const stage = referencePath(base('vllm'))[0]
    const { repo, ref, path: file, line } = stage.source
    expect(`https://github.com/${repo}/blob/${ref}/${file}#L${line}`).toBe(
      'https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/entrypoints/openai/completion/api_router.py#L52',
    )
  })

  test('the states that a stage names are the pinned code\'s own', () => {
    const allowed: Record<EngineId, readonly string[]> = {
      'nano-vllm': ['WAITING', 'RUNNING'],
      'mini-sglang': [],
      'inside-vllm': ['WAITING', 'RUNNING', 'FINISHED_ABORTED'],
      vllm: ['WAITING', 'RUNNING', 'FINISHED_ABORTED'],
      sglang: [],
    }
    for (const sc of ALL) {
      for (const stage of referencePath(sc)) {
        if (stage.state !== undefined) expect([stage.id, allowed[sc.engine].includes(stage.state)]).toEqual([stage.id, true])
      }
    }
    // A request is WAITING in the queue, RUNNING once scheduled, and an aborted one ends FINISHED_ABORTED.
    for (const id of ['vllm', 'inside-vllm'] as const) {
      expect(referencePath(base(id)).flatMap((s) => (s.state === undefined ? [] : [s.state]))).toEqual(['WAITING', 'RUNNING'])
      expect(referencePath({ ...base(id), abort: true }).flatMap((s) => (s.state === undefined ? [] : [s.state]))).toEqual(['WAITING', 'RUNNING', 'FINISHED_ABORTED'])
    }
  })
})

describe('the invariants of GAMES.md §5, on every reference path', () => {
  test('a path starts where the engine says a request begins, and every stage starts where the one before it ended', () => {
    for (const sc of ALL) {
      const p = referencePath(sc)
      const where = describeScenario(sc)
      expect([where, samePlace(p[0].from, entryOf(sc.engine))]).toEqual([where, true])
      p.slice(1).forEach((s, i) => expect([where, s.id, samePlace(s.from, p[i].to)]).toEqual([where, s.id, true]))
    }
  })

  test('is legal stage by stage: walk lays all of it, and every stage\'s mechanism is one that crosses its own boundary', () => {
    for (const sc of ALL) {
      const p = referencePath(sc)
      const w = walk(entryOf(sc.engine), p)
      expect([describeScenario(sc), w.firstWrong, w.rule, w.reached]).toEqual([describeScenario(sc), null, null, p.length])
      for (const s of p) expect([s.id, stageFits(s)]).toEqual([s.id, { ok: true }])
    }
  })

  test('is connected from the client to the GPU and back: it visits a GPU, and unless it is aborted it ends where it began', () => {
    for (const sc of ALL) {
      const p = referencePath(sc)
      const where = describeScenario(sc)
      expect([where, p.some((s) => s.to.device === 'gpu')]).toEqual([where, true])
      const ended = samePlace(p[p.length - 1].to, entryOf(sc.engine))
      expect([where, ended]).toEqual([where, !sc.abort])
    }
  })

  test('changes process only by IPC or shared memory on the host, and only by a collective between GPUs', () => {
    for (const sc of ALL) {
      for (const s of referencePath(sc)) {
        const gap = boundaryOf(s.from, s.to)
        if (gap === 'process') expect([s.id, s.mechanism === 'ipc' || s.mechanism === 'shm']).toEqual([s.id, true])
        if (gap === 'across-gpus') expect([s.id, s.mechanism]).toEqual([s.id, 'collective'])
        if (s.mechanism === 'ipc' || s.mechanism === 'shm') expect([s.id, gap]).toEqual([s.id, 'process'])
        if (s.mechanism === 'queue') expect([s.id, gap === 'none' || gap === 'thread']).toEqual([s.id, true])
      }
    }
  })

  test('puts a sync after every device-to-host copy before anything reads the result, with at most a queue between', () => {
    for (const sc of ALL) {
      const p = referencePath(sc)
      p.forEach((s, i) => {
        if (s.mechanism !== 'd2h') return
        const after = p.slice(i + 1)
        const at = after.findIndex((t) => t.mechanism !== 'queue')
        expect([s.id, at >= 0 ? after[at].mechanism : null]).toEqual([s.id, 'sync'])
      })
    }
  })

  test('has the queue, the copy, the sync and the process boundary that a graded scenario needs, except at one rank of nano-vllm', () => {
    for (const sc of ALL) {
      const f = pathFacts(referencePath(sc))
      const where = describeScenario(sc)
      const needs = sc.engine !== 'nano-vllm'
      const copies = f.byMechanism.h2d + f.byMechanism.d2h
      expect([where, f.byMechanism.queue >= 1 || !needs]).toEqual([where, true])
      expect([where, copies >= 1]).toEqual([where, true])
      expect([where, f.byMechanism.sync >= 1]).toEqual([where, true])
      expect([where, f.processHops >= 1 || !needs]).toEqual([where, true])
    }
    // nano-vllm at one rank is one process and one thread: calls and copies and an implicit sync, no queue worth the name (the `waiting`
    // deque is a queue in one thread) and no process boundary. At two ranks it has the shared-memory hop.
    expect(pathFacts(referencePath(base('nano-vllm'))).processHops).toBe(0)
    expect(pathFacts(referencePath({ ...base('nano-vllm'), tp: 2 })).processHops).toBe(1)
  })

  test('has no stage twice in a path, and a path of tensor parallelism visits two GPUs', () => {
    for (const sc of ALL) {
      const p = referencePath(sc)
      expect([describeScenario(sc), new Set(ids(p)).size]).toEqual([describeScenario(sc), p.length])
      expect([describeScenario(sc), pathFacts(p).gpus]).toEqual([describeScenario(sc), sc.tp])
    }
  })
})

describe('the scenario space', () => {
  test('is the product of what each engine supports, less an abort without streaming: 88 scenarios in a fixed order', () => {
    const counts = Object.fromEntries(ENGINE_IDS.map((id) => [id, scenarios(id).length]))
    expect(counts).toEqual({ 'nano-vllm': 4, 'mini-sglang': 12, 'inside-vllm': 24, vllm: 24, sglang: 24 })
    expect(ALL.length).toBe(88)
    expect(ALL.map(describeScenario)).toEqual(ALL.map(describeScenario).slice().sort((a, b) => ENGINE_IDS.indexOf(a.split(',')[0] as EngineId) - ENGINE_IDS.indexOf(b.split(',')[0] as EngineId)))
    expect(scenarios()).toEqual(ALL)
    expect(new Set(ALL.map(describeScenario)).size).toBe(88)
  })

  test('no two scenarios of an engine have the same path, so no one path answers them all', () => {
    for (const id of ENGINE_IDS) {
      const paths = scenarios(id).map((sc) => ids(referencePath(sc)).join(' '))
      expect([id, new Set(paths).size]).toEqual([id, paths.length])
    }
  })

  test('rejects what an engine cannot do, and says why', () => {
    const bad: [Scenario, RegExp][] = [
      [{ ...base('vllm'), abort: true, streaming: false }, /abort needs streaming/],
      [{ ...base('nano-vllm'), streaming: true }, /no streaming mode/],
      [{ ...base('nano-vllm'), abort: true }, /no abort path/],
      [{ ...base('nano-vllm'), n: 2 }, /n = 1/],
      [{ ...base('mini-sglang'), n: 2 }, /n = 1/],
      [{ ...base('vllm'), tp: 4 as 2 }, /degree 4/],
      [{ ...base('vllm'), engine: 'tgi' as EngineId }, /no engine "tgi"/],
    ]
    for (const [sc, why] of bad) {
      expect(invalidReason(sc)).toMatch(why)
      expect(() => referencePath(sc)).toThrow(RangeError)
    }
    for (const sc of ALL) expect(invalidReason(sc)).toBeNull()
  })

  test('has a pool of stages for each engine: every stage of its paths once, which is what a tray draws its distractors from', () => {
    for (const id of ENGINE_IDS) {
      const pool = engineStages(id)
      const used = new Set(scenarios(id).flatMap((sc) => ids(referencePath(sc))))
      expect([id, pool.map((s) => s.id).sort(text)]).toEqual([id, [...used].sort(text)])
      expect([id, new Set(ids(pool)).size]).toEqual([id, pool.length])
      // The longest path is in the pool whole, in order.
      const longest = scenarios(id).map((sc) => ids(referencePath(sc))).sort((a, b) => b.length - a.length)[0]
      expect(longest.every((x) => ids(pool).includes(x))).toBe(true)
    }
    // A distractor from the other engine is a real stage that starts somewhere else: laid after a stage of this engine it breaks a rule.
    const wrong = engineStages('sglang').find((s) => s.id === 'sglang.waiting-queue') as StageDef
    expect(legal(entryOf('vllm'), wrong)).toMatchObject({ ok: false })
  })

  test('draws every path the same way twice', () => {
    for (const sc of ALL) expect(referencePath(sc)).toEqual(referencePath({ ...sc }))
  })
})

describe('what each factor of a scenario changes', () => {
  const diff = (a: readonly StageDef[], b: readonly StageDef[]) => ({
    added: ids(b).filter((x) => !ids(a).includes(x)).sort(text),
    removed: ids(a).filter((x) => !ids(b).includes(x)).sort(text),
  })

  test('two ranks put a broadcast and a collective on the path, and move the middle of it to rank 1', () => {
    const expected: Record<EngineId, { added: string[]; removed: string[] }> = {
      'nano-vllm': { added: ['nano.broadcast', 'nano.gather', 'nano.worker-loop'], removed: [] },
      'mini-sglang': { added: ['mini.all-reduce', 'mini.to-rank1'], removed: [] },
      'inside-vllm': { added: ['inside.all-reduce', 'inside.response-mq', 'inside.rpc-broadcast', 'inside.worker-execute'], removed: ['inside.execute-model'] },
      vllm: { added: ['vllm.all-reduce', 'vllm.async-output-queue', 'vllm.response-mq', 'vllm.rpc-broadcast', 'vllm.worker-execute'], removed: ['vllm.batch-queue', 'vllm.execute-model'] },
      sglang: { added: ['sglang.all-reduce', 'sglang.broadcast'], removed: [] },
    }
    for (const id of ENGINE_IDS) {
      const one = referencePath(base(id))
      const two = referencePath({ ...base(id), tp: 2 })
      expect([id, diff(one, two)]).toEqual([id, expected[id]])
      // The GPU stages of the middle run on rank 1, and the sampling and the copy home on rank 0.
      const forward = two.find((s) => s.id.endsWith('.forward'))
      const sample = two.find((s) => s.id.endsWith('.sample'))
      expect([id, forward?.to.rank, sample?.to.rank]).toEqual([id, 1, 0])
      expect([id, one.every((s) => s.from.rank === 0 && s.to.rank === 0)]).toEqual([id, true])
    }
  })

  test('a prefix hit adds one call, and `n` of two adds the fan-out where the engine has one', () => {
    for (const id of ENGINE_IDS) {
      expect([id, diff(referencePath(base(id)), referencePath({ ...base(id), prefixHit: true }))]).toEqual([id, { added: [`${PREFIX[id]}prefix-hit`], removed: [] }])
      expect(referencePath({ ...base(id), prefixHit: true }).find((s) => s.id.endsWith('.prefix-hit'))?.mechanism).toBe('call')
    }
    expect(diff(referencePath(base('vllm')), referencePath({ ...base('vllm'), n: 2 }))).toEqual({ added: ['vllm.fan-out'], removed: [] })
    expect(diff(referencePath(base('inside-vllm')), referencePath({ ...base('inside-vllm'), n: 2 }))).toEqual({ added: ['inside.fan-out'], removed: [] })
    // SGLang warms the shared prefix with a request of its own, and sends the samples after it.
    expect(diff(referencePath(base('sglang')), referencePath({ ...base('sglang'), n: 2 }))).toEqual({ added: ['sglang.n-warmup', 'sglang.tokenize-batch'], removed: ['sglang.tokenize'] })
  })

  test('streaming ends the path with a server-sent event, and the other mode with the whole response', () => {
    for (const id of ENGINE_IDS) {
      const supports = ENGINES[id].supports.streaming
      const last = (streaming: boolean) => referencePath({ ...base(id), streaming }).at(-1)?.id
      if (supports.includes(true)) expect([id, last(true)]).toEqual([id, `${PREFIX[id]}sse-chunk`])
      expect([id, last(false)]).toEqual([id, id === 'nano-vllm' ? 'nano.detokenize' : `${PREFIX[id]}full-response`])
    }
  })

  test('an abort follows the first streamed token, ends inside the engine, and is a different path in each engine', () => {
    const tails: Record<string, string[]> = {
      vllm: ['vllm.disconnect', 'vllm.abort-request', 'vllm.abort-zmq', 'vllm.aborts-queue', 'vllm.process-aborts', 'vllm.finish-aborted'],
      'inside-vllm': ['inside.disconnect', 'inside.abort-request', 'inside.abort-zmq', 'inside.abort-input-queue', 'inside.abort-requests', 'inside.finish-aborted'],
      sglang: ['sglang.disconnect', 'sglang.abort-request', 'sglang.abort-dispatch', 'sglang.abort-release'],
      'mini-sglang': ['mini.disconnect', 'mini.abort-msg', 'mini.abort-forward', 'mini.abort-req'],
    }
    for (const [id, tail] of Object.entries(tails)) {
      const engine = id as EngineId
      const plain = referencePath({ ...base(engine), streaming: true })
      const aborted = referencePath({ ...base(engine), streaming: true, abort: true })
      expect([id, ids(aborted)]).toEqual([id, [...ids(plain), ...tail]])
      expect([id, samePlace(aborted[aborted.length - 1].to, entryOf(engine))]).toEqual([id, false])
      expect([id, aborted[plain.length].from.process]).toEqual([id, 'client'])
    }
    // The pinned vLLM drains an abort on a queue of its own before the step reads its output; the post's commit queues it behind the step.
    expect(ids(referencePath({ ...base('vllm'), abort: true })).filter((x) => x.includes('abort'))).toContain('vllm.aborts-queue')
    expect(ids(referencePath({ ...base('inside-vllm'), abort: true })).filter((x) => x.includes('abort'))).not.toContain('inside.aborts-queue')
  })

  test('the pinned vLLM has the batch queue and the sampling split that the post\'s commit lacks', () => {
    const pinned = ids(referencePath(base('vllm')))
    const post = ids(referencePath(base('inside-vllm')))
    expect(pinned).toContain('vllm.batch-queue')
    expect(post.some((x) => x.endsWith('batch-queue'))).toBe(false)
    // At the post's commit the copy to the host is `.tolist()` and waits for itself; the pinned engine copies on a stream and waits on an event.
    expect(referencePath(base('inside-vllm')).find((s) => s.id === 'inside.sync')?.source.quote).toContain('.tolist()')
    expect(referencePath(base('vllm')).find((s) => s.id === 'vllm.copy-sync')?.source.quote).toBe('self.copy_event.synchronize()')
  })
})

describe('the rules as functions', () => {
  const vllm = referencePath(base('vllm'))
  const at = (id: string): StageDef => vllm.find((s) => s.id === id) as StageDef
  const without = (...drop: string[]): StageDef[] => vllm.filter((s) => !drop.includes(s.id))

  test('legal says where a stage must start, and which bridge a stage that starts elsewhere was missing', () => {
    const entry = entryOf('vllm')
    expect(legal(entry, at('vllm.http-request'))).toEqual({ ok: true })
    const lost = legal(entry, at('vllm.input-queue'))
    expect(lost.ok).toBe(false)
    if (!lost.ok) {
      expect(lost.rule).toBe('process')
      expect(lost.detail).toContain('client · http-client')
      expect(lost.detail).toContain('engine-core · input-thread')
      expect(lost.detail).toContain(RULES.process)
    }
    expect(legal(at('vllm.zmq-add').to, at('vllm.waiting-queue'))).toMatchObject({ ok: false, rule: 'thread' })
    expect(legal(at('vllm.schedule').to, at('vllm.forward'))).toMatchObject({ ok: false, rule: 'device' })
    expect(legal(at('vllm.d2h').to, at('vllm.forward'))).toMatchObject({ ok: false, rule: 'device' })
  })

  test('walk stops at the first stage that breaks a rule, and names the rule (the bestiary)', () => {
    const entry = entryOf('vllm')
    const cases: [string[], string, string][] = [
      // The ZMQ hop to the engine core left out: the next stage starts in another process.
      [['vllm.zmq-add'], 'vllm.input-queue', 'process'],
      // The input queue left out: the engine core's main thread is not where the input thread left the request.
      [['vllm.input-queue'], 'vllm.add-request', 'thread'],
      // The copy to the GPU left out: the forward starts on the GPU, and the request is on the host.
      [['vllm.h2d'], 'vllm.forward', 'device'],
      // The sync left out: the output is read before the copy has landed.
      [['vllm.copy-sync'], 'vllm.update-from-output', 'async'],
      // Both the queue and the sync left out.
      [['vllm.batch-queue', 'vllm.copy-sync'], 'vllm.update-from-output', 'async'],
    ]
    for (const [drop, wrong, rule] of cases) {
      const w = walk(entry, without(...drop))
      const index = without(...drop).findIndex((s) => s.id === wrong)
      expect([drop, w.firstWrong, w.rule]).toEqual([drop, index, rule])
      expect([drop, w.reached]).toEqual([drop, index])
      expect(w.detail).toContain(wrong)
    }
    // A path cut short is legal as far as it goes.
    expect(walk(entry, vllm.slice(0, 5))).toEqual({ reached: 5, firstWrong: null, rule: null, detail: null })
    // A queue may stand between the copy and its sync, because it reads nothing; a call may not.
    const queued = [...vllm]
    const q = queued.findIndex((s) => s.id === 'vllm.batch-queue')
    ;[queued[q], queued[q + 1]] = [queued[q + 1], queued[q]]
    expect(walk(entry, queued).rule).toBeNull()
    const read = without('vllm.copy-sync')
    read.splice(read.findIndex((s) => s.id === 'vllm.update-from-output') + 1, 0, at('vllm.copy-sync'))
    expect(walk(entry, read)).toMatchObject({ rule: 'async', firstWrong: read.findIndex((s) => s.id === 'vllm.update-from-output') })
  })

  test('stageFits holds a stage to the boundary between its own places', () => {
    const wrong: [StageDef, string][] = [
      [{ ...at('vllm.zmq-add'), mechanism: 'queue' }, 'process'],
      [{ ...at('vllm.input-queue'), mechanism: 'ipc' }, 'thread'],
      [{ ...at('vllm.h2d'), mechanism: 'd2h' }, 'device'],
      [{ ...at('vllm.d2h'), mechanism: 'h2d' }, 'device'],
      [{ ...at('vllm.schedule'), mechanism: 'shm' }, 'process'],
      [{ ...at('vllm.copy-sync'), mechanism: 'collective' }, 'device'],
    ]
    for (const [stage, rule] of wrong) {
      const v = stageFits(stage)
      expect([stage.id, stage.mechanism, v.ok ? null : v.rule]).toEqual([stage.id, stage.mechanism, rule])
    }
  })

  test('the boundary table gives every mechanism a boundary it crosses, and every boundary a mechanism', () => {
    const crossed = new Set(Object.values(FITS).flat())
    expect([...MECHANISMS].filter((m) => !crossed.has(m))).toEqual([])
    expect(Object.values(FITS).every((list) => list.length > 0)).toBe(true)
    const host = (process: string, thread: string, rank = 0): Place => ({ process, thread, device: 'host', rank })
    const device = (process: string, rank = 0): Place => ({ process, thread: 'cuda-stream', device: 'gpu', rank })
    expect(boundaryOf(host('a', 'x'), host('a', 'x'))).toBe('none')
    expect(boundaryOf(host('a', 'x'), host('a', 'y'))).toBe('thread')
    expect(boundaryOf(host('a', 'x'), host('b', 'x'))).toBe('process')
    expect(boundaryOf(host('a', 'x'), device('a'))).toBe('to-gpu')
    expect(boundaryOf(device('a'), host('a', 'x'))).toBe('to-host')
    expect(boundaryOf(device('a'), device('a'))).toBe('on-gpu')
    expect(boundaryOf(device('a', 1), device('b', 0))).toBe('across-gpus')
    expect(describePlace(device('worker-1', 1))).toBe('the GPU of worker-1 (rank 1)')
    expect(describePlace(host('engine-core', 'main'))).toBe('engine-core · main')
  })

  test('pathFacts counts the mechanisms, the process hops and the GPUs of a path', () => {
    const f = pathFacts(vllm)
    expect(f.stages).toBe(vllm.length)
    expect(Object.values(f.byMechanism).reduce((a, b) => a + b, 0)).toBe(vllm.length)
    // The ZMQ hop in, the ZMQ hop out, and the HTTP request and the event, each a process boundary.
    expect(f.processHops).toBe(4)
    expect(f.byMechanism).toMatchObject({ queue: 6, h2d: 1, d2h: 1, sync: 1 })
    expect(f.gpus).toBe(1)
  })
})
