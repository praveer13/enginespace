/*
 * W1-T22: the oracle of the `hybrid-kv` lab (packages/sim/forge/{kv-wire,kv-plan,hybrid-kv}.ts): the wire, the plan that judges a module
 * with `kvJudge`, and the six checks with their scripts and streams.
 *
 * The plan is tested against modules written here in TypeScript (tests/forge/kv-module.ts speaks the wire for any `KvModel`): the
 * reference, which every check must pass, and the TypeScript bestiary of tests/sim/kv-bestiary.ts, each of which must fail the checks that
 * its mistake belongs to. The Rust crate is the other voice: its wasm builds are run through the host in tests/forge/hybrid-kv-wasm.test.ts
 * and by verify:labs, and tests/forge/hybrid-kv-crate.test.ts holds its harness to this package.
 */
import { describe, expect, test } from 'bun:test'
import {
  BATCH,
  digestEvent,
  hash32,
  HYBRID_KV_CHECKS,
  HYBRID_KV_KCS,
  HYBRID_KV_SCRIPTS,
  HYBRID_KV_SPECS,
  HYBRID_KV_STREAMS,
  isProblem,
  kvAdapterCatalog,
  kvConsumerView,
  kvReference,
  kvOps,
  kvPreset,
  parseWireAdapters,
  parseWireCache,
  parseWireEvents,
  parseWireOp,
  parseWirePages,
  parseWireQueue,
  parseWireReply,
  parseWireRequests,
  parseWireSpec,
  scriptOps,
  tokenDigest,
  WIRE_MAX_POOL,
  WIRE_QUERIES,
  wireEvents,
  wireOp,
  wireReply,
  wireSpec,
  wireState,
  wireTokens,
} from '../../packages/sim'
import type { CheckPlan, KvOp, PlannedCheck } from '../../packages/sim'
import { drive, kvModule } from '../forge/kv-module'
import { BESTIARY } from './kv-bestiary'

const check = (id: string): PlannedCheck => {
  const found = HYBRID_KV_CHECKS.find((candidate) => candidate.id === id)
  if (found === undefined) throw new Error(`no check ${id}`)
  return found
}

/** Every command a plan sends to the reference, in order. */
function allCommands(plan: CheckPlan): string[] {
  const module = kvModule(kvReference)
  const sent: string[] = []
  for (let batch = plan.next(); batch !== null; batch = plan.next()) {
    sent.push(...batch)
    const wrong = plan.judge(batch.map((command) => module(command)))
    if (wrong !== null) throw new Error(wrong)
  }
  return sent
}

/** Seeds spread over the u32 range, the way the property tests spread theirs. */
const seeds = (n: number): number[] => Array.from({ length: n }, (_, i) => ((i + 1) * 2_654_435_761) >>> 0)

describe('the wire: commands', () => {
  test('a spec survives `init`: the lab\'s four pools, and a spec with a window, padding and state pages', () => {
    for (const spec of Object.values(HYBRID_KV_SPECS)) {
      const read = parseWireSpec(wireSpec(spec))
      if (isProblem(read)) throw new Error(read.problem)
      // `stateBytes` is for the record and the wire leaves it out.
      const withoutBytes = { ...spec, groups: spec.groups.map((group) => Object.fromEntries(Object.entries(group).filter(([key]) => key !== 'stateBytes'))) }
      expect(read.value).toEqual(withoutBytes)
    }
    expect(wireSpec(HYBRID_KV_SPECS['one-group'])).toBe('init 20 131072 1024 1 - full0:full:8:0:16:-:-')
  })

  test('a spec that is not one is refused, with the reason', () => {
    const bad = (line: string): string => {
      const read = parseWireSpec(line)
      return isProblem(read) ? read.problem : 'read'
    }
    expect(bad('init 20 131072 1024 1')).toContain('init takes')
    expect(bad('init 0 131072 1024 1 - full0:full:8:0:16:-:-')).toContain('the pool holds 1 to 128 pages')
    expect(bad(`init ${WIRE_MAX_POOL + 1} 131072 1024 1 - full0:full:8:0:16:-:-`)).toContain('out of range')
    expect(bad('init 20 131072 1024 2 - full0:full:8:0:16:-:-')).toContain('caching is 0 or 1')
    expect(bad('init 20 131072 1024 1 - full0:flat:8:0:16:-:-')).toContain('full, sliding or state')
    expect(bad('init 20 131072 1024 1 - full0:full:8:0:16')).toContain('a group is')
  })

  test('token runs: three or more consecutive ids are written as first+count, and read back', () => {
    expect(wireTokens([0, 1, 2, 3, 4])).toBe('0+5')
    expect(wireTokens([5, 6, 9])).toBe('5,6,9')
    expect(wireTokens([7, 1, 2, 3, 40])).toBe('7,1+3,40')
    expect(wireTokens([4294967293, 4294967294, 4294967295])).toBe('4294967293+3')
    for (const tokens of [[0], [3, 4], [10, 11, 12, 13, 14, 15, 30, 31, 32], [5, 4, 3]]) {
      const op = parseWireOp(`append 1 ${wireTokens(tokens)}`)
      expect(op).toEqual({ op: 'append', req: 1, tokens })
    }
  })

  test('every operation survives its command, on a hundred operations of a stream', () => {
    const ops = kvOps(7, HYBRID_KV_SPECS['two-kinds'], 400, { adapters: kvAdapterCatalog(HYBRID_KV_SPECS['two-kinds']) })
    expect(new Set(ops.map((op) => op.op)).size).toBeGreaterThanOrEqual(5)
    for (const op of ops) expect(parseWireOp(wireOp(op))).toEqual(op)
  })

  test('a line that is not an operation is a RangeError that quotes it', () => {
    for (const line of ['', 'admit 1 - ', 'admit x - 0+3', 'admit 1 - 0+0', 'admit 1 - 1+2+3', 'append 1', 'finish', 'load 1', 'unload', 'reset now', 'dump 1', 'admit 1 - 4294967296']) {
      expect(() => parseWireOp(line), line).toThrow(RangeError)
    }
    expect(() => parseWireOp('dump 1')).toThrow('not an operation: "dump 1"')
  })

  test('the commands of a script are the operations of its lines', () => {
    for (const scripts of Object.values(HYBRID_KV_SCRIPTS)) {
      for (const script of scripts) {
        const ops = scriptOps(script)
        expect(ops).toHaveLength(script.lines.length)
        // A line may use a run that `wireOp` writes in another way, so the operation is the same and the text may not be.
        for (const [i, op] of ops.entries()) expect(parseWireOp(wireOp(op)), script.lines[i]).toEqual(op)
      }
    }
  })
})

describe('the wire: replies and state', () => {
  const spec = HYBRID_KV_SPECS['two-kinds']

  test('a reply survives the wire, and a reply of the wrong shape is a problem', () => {
    const admit: KvOp = { op: 'admit', req: 1, prompt: [1, 2, 3] }
    const finish: KvOp = { op: 'finish', req: 1 }
    expect(wireReply({ ok: true, free: 12, hit: 32 })).toBe('ok 12 hit 32')
    expect(wireReply({ ok: true, free: 12 })).toBe('ok 12')
    expect(wireReply({ ok: false, reason: 'no-pages', free: 3 })).toBe('refused no-pages 3')
    expect(parseWireReply(admit, 'ok 12 hit 32')).toEqual({ value: { ok: true, free: 12, hit: 32 } })
    expect(parseWireReply(finish, 'ok 12')).toEqual({ value: { ok: true, free: 12 } })
    expect(parseWireReply(finish, 'refused busy 3')).toEqual({ value: { ok: false, reason: 'busy', free: 3 } })
    for (const [op, text] of [
      [admit, 'ok 12'],
      [finish, 'ok 12 hit 0'],
      [finish, 'ok'],
      [finish, 'ok -1'],
      [finish, 'refused 3'],
      [finish, 'refused nope 3'],
      [finish, 'true'],
      [finish, ''],
    ] as const) {
      expect(isProblem(parseWireReply(op, text)), text).toBe(true)
    }
    const refused = parseWireReply(finish, 'err not initialized')
    expect(isProblem(refused) && refused.problem).toContain('the module refused the command: err not initialized')
  })

  test('a state survives the wire: the pages, the queue, the requests, the adapters and the cache, over a stream with adapters', () => {
    const adapters = kvAdapterCatalog(spec).map((a) => ({ id: a.id, pages: a.pages }))
    const model = kvReference(spec)
    let looked = 0
    for (const op of kvOps(11, spec, 300, { adapters })) {
      model.apply(op)
      const state = model.state()
      const text = wireState(state)
      const pages = parseWirePages(text.pages, spec.poolPages)
      const queue = parseWireQueue(text.queue)
      const requests = parseWireRequests(text.requests, spec.groups.length)
      const loaded = parseWireAdapters(text.adapters)
      const cache = parseWireCache(text.cache)
      expect(pages).toEqual({ value: state.pages })
      expect(queue).toEqual({ value: state.queue })
      expect(requests).toEqual({ value: state.requests })
      expect(loaded).toEqual({ value: state.adapters })
      expect(cache).toEqual({ value: state.cache })
      for (const reply of Object.values(text)) expect(reply.length).toBeLessThan(4096)
      looked += 1
    }
    expect(looked).toBe(300)
  })

  test('the replies to the queries fit in the 4,096 bytes that the host reads, for the largest pool of the lab\'s pools and for 128 pages', () => {
    for (const pool of [...Object.values(HYBRID_KV_SPECS), kvPreset('same-size', WIRE_MAX_POOL)]) {
      const model = kvReference(pool)
      let longest = 0
      for (const op of kvOps(3, pool, 500, { adapters: kvAdapterCatalog(pool).map((a) => ({ id: a.id, pages: a.pages })) })) {
        model.apply(op)
        const text = wireState(model.state())
        longest = Math.max(longest, ...Object.values(text).map((reply) => new TextEncoder().encode(reply).length))
      }
      expect(longest, `${pool.poolPages} pages`).toBeLessThan(4096)
    }
  })

  test('the events survive the wire, with the tokens of a stored run as a count and a digest', () => {
    const model = kvReference(spec)
    let events = 0
    for (const op of kvOps(5, spec, 200, {})) {
      model.apply(op)
    }
    for (const [, batch] of model.events()) {
      const text = wireEvents(batch)
      const read = parseWireEvents(text, spec)
      expect(read).toEqual({ value: batch.map(digestEvent) })
      events += batch.length
    }
    expect(events).toBeGreaterThan(100)
    expect(tokenDigest([])).toBe(0x811c9dc5)
    expect(tokenDigest([1, 2, 3])).not.toBe(tokenDigest([1, 2, 4]))
    expect(tokenDigest([1, 2, 3])).not.toBe(tokenDigest([3, 2, 1]))
    // The consumer's view of the stream is the cache.
    expect(kvConsumerView(model.events()).map(({ group, hash }) => ({ group, hash }))).toEqual(model.state().cache.map(({ group, hash }) => ({ group, hash })))
  })

  test('events and state that cannot be read are problems', () => {
    const bad = (text: string): string => {
      const read = parseWireEvents(text, spec)
      return isProblem(read) ? read.problem : 'read'
    }
    expect(bad('X')).toContain('is not S:')
    expect(bad('R:9:5')).toContain('the group of an event')
    expect(bad('R:0:x')).toContain('a removed hash')
    expect(bad('S:0:-:-:1,2:32:zzzzzzzz')).toContain('8 hex digits')
    expect(bad('S:0:-:-:1,2:32')).toContain('is not S:')
    expect(isProblem(parseWirePages('f;f', 20))).toBe(true)
    expect(isProblem(parseWirePages(Array(20).fill('x').join(';'), 20))).toBe(true)
    expect(isProblem(parseWireRequests('1:-:5:0,1', 3))).toBe(true)
    expect(isProblem(parseWireCache('0:1'))).toBe(true)
    expect(isProblem(parseWireAdapters('1:2'))).toBe(true)
    expect(isProblem(parseWireQueue('1,,2'))).toBe(true)
  })
})

describe('the six checks of the lab', () => {
  test('are the stages s1 to s6 of TR5a, in grading order, all seeded', () => {
    expect(HYBRID_KV_CHECKS.map((c) => [c.id, c.stage, c.seeded])).toEqual([
      ['one_group', 1, true],
      ['sliding', 2, true],
      ['state', 3, true],
      ['hit_all_groups', 4, true],
      ['adapter_pages', 5, true],
      ['gauntlet', 6, true],
    ])
    for (const c of HYBRID_KV_CHECKS) {
      expect(c.label.length).toBeGreaterThan(0)
      expect(c.catches.length).toBeGreaterThan(0)
      expect(c.defaultSeed).toBeGreaterThan(0)
    }
    expect(new Set(HYBRID_KV_CHECKS.map((c) => c.defaultSeed)).size).toBe(6)
  })

  // 103 plans driven in-process. On a loaded machine this runs past bun's 5 s limit [measured 2026-11-04 over wave-1 d287a14, with W1-T19's
  // files: 5.3 s alone at a load average of 38, and a timeout in a full run at 25 to 29 and in the merge gate at 36 to 43], so the test names
  // its own limit, as the other long tests of the suite do.
  test('a right module passes every check, on fresh seeds', () => {
    for (const c of HYBRID_KV_CHECKS) {
      for (const seed of seeds(c.id === 'gauntlet' ? 3 : 20)) {
        const run = drive(c.plan(seed), kvModule(kvReference))
        expect(run.ok, `${c.id} on seed ${seed}: ${run.message}`).toBe(true)
      }
    }
  }, 60_000)

  test('send batches of at most BATCH commands, and start every pool with init and the five state queries', () => {
    for (const c of HYBRID_KV_CHECKS) {
      const plan = c.plan(c.defaultSeed)
      const module = kvModule(kvReference)
      let starts = 0
      for (let batch = plan.next(); batch !== null; batch = plan.next()) {
        expect(batch.length).toBeLessThanOrEqual(BATCH)
        expect(batch.length).toBeGreaterThan(0)
        if (batch[0].startsWith('init ')) {
          starts += 1
          expect(batch.slice(1, 6)).toEqual(['pages', 'queue', 'requests', 'adapters', 'cache'])
        }
        expect(plan.judge(batch.map((command) => module(command)))).toBeNull()
      }
      expect(starts, c.id).toBeGreaterThanOrEqual(2)
    }
  })

  test('send a command for each operation and then each query, in the order of WIRE_QUERIES', () => {
    const commands = allCommands(check('one_group').plan(1))
    const first = commands.indexOf('pages', 6)
    expect(commands.slice(first - 1, first + 6)).toEqual([expect.stringMatching(/^admit 1 /), ...WIRE_QUERIES])
  })

  test('the scripts and the streams: how many operations, and what they are made of', () => {
    for (const key of ['one_group', 'sliding', 'state', 'hit_all_groups', 'adapter_pages'] as const) {
      const scripted = HYBRID_KV_SCRIPTS[key].reduce((n, script) => n + script.lines.length, 0)
      const commands = allCommands(check(key).plan(1))
      const ops = commands.filter((command) => /^(admit|append|finish|load|unload|reset) /.test(command) || command === 'reset')
      expect(ops.length, key).toBeGreaterThan(scripted)
      expect(ops.length, key).toBeLessThanOrEqual(scripted + HYBRID_KV_STREAMS[key][0].ops)
    }
    const gauntlet = allCommands(check('gauntlet').plan(1)).filter((command) => /^(admit|append|finish|load|unload) /.test(command) || command === 'reset')
    const total = HYBRID_KV_SCRIPTS.gauntlet.reduce((n, script) => n + script.lines.length, 0) + HYBRID_KV_STREAMS.gauntlet.reduce((n, s) => n + s.ops, 0)
    expect(gauntlet).toHaveLength(total)
    // About 2,000 operations [estimated].
    expect(total).toBeGreaterThanOrEqual(1900)
    expect(total).toBeLessThanOrEqual(2100)
  })

  test('the early stages leave out what a learner has not written yet: no adapter before `adapter_pages`, no reset before `gauntlet`', () => {
    for (const key of ['one_group', 'sliding', 'state', 'hit_all_groups'] as const) {
      const commands = allCommands(check(key).plan(2))
      expect(commands.filter((command) => /^(load|unload|reset)\b/.test(command)), key).toEqual([])
      expect(commands.filter((command) => /^admit \d+ \d+ /.test(command)), key).toEqual([])
    }
    const adapters = allCommands(check('adapter_pages').plan(2))
    expect(adapters.some((command) => command.startsWith('load '))).toBe(true)
    expect(adapters.filter((command) => command === 'reset')).toEqual([])
    const gauntlet = allCommands(check('gauntlet').plan(2))
    expect(gauntlet.filter((command) => command === 'reset').length).toBeGreaterThan(2)
  })

  test('draw the same streams from a seed, and other streams from another', () => {
    for (const c of HYBRID_KV_CHECKS) {
      const a = allCommands(c.plan(12345))
      const b = allCommands(c.plan(12345))
      const d = allCommands(c.plan(12346))
      expect(a, c.id).toEqual(b)
      expect(a, c.id).not.toEqual(d)
      // The script is the same whatever the seed draws; the stream after it is not.
      const script = HYBRID_KV_SCRIPTS[c.id as keyof typeof HYBRID_KV_SCRIPTS][0].lines.length
      expect(a.slice(0, 6 + script * 7), c.id).toEqual(d.slice(0, 6 + script * 7))
    }
  })

  test('are pinned by a golden: a hash of every command that each check sends on seed 1', () => {
    const golden: Record<string, number> = Object.fromEntries(HYBRID_KV_CHECKS.map((c) => [c.id, hash32(allCommands(c.plan(1)).join('\n'))]))
    expect(golden).toEqual({
      one_group: 3_614_471_883,
      sliding: 2_406_419_486,
      state: 1_036_600_876,
      hit_all_groups: 2_211_817_350,
      adapter_pages: 29_327_314,
      gauntlet: 2_644_151_771,
    })
  })

  test('name the stage\'s script, the operation, the check and both replies when a module is wrong', () => {
    const wrong = drive(check('sliding').plan(1), kvModule((s) => BESTIARY.find((m) => m.id === 'window-off-by-one')!.make(s)))
    expect(wrong.ok).toBe(false)
    expect(wrong.message).toMatch(/^the sliding-window script, operation 3 of 16: append 2 \(1 tokens\): reply: append answered ok with 16 pages free, and the reference answers ok with 18 pages free; window: /)
    const events = drive(check('one_group').plan(1), kvModule((s) => BESTIARY.find((m) => m.id === 'published-twice')!.make(s)))
    expect(events.message).toMatch(/^the one-group script, operation 1 of 23: admit 1 \(20 tokens\): events: block 0:\d+ was published 2 times without a removal/)
  })

  test('stop a message at 700 characters, and list three failures', () => {
    for (const member of BESTIARY) {
      for (const c of HYBRID_KV_CHECKS) {
        const run = drive(c.plan(1), kvModule((s) => member.make(s)))
        if (!run.ok) expect(run.message.length, `${member.id} ${c.id}`).toBeLessThanOrEqual(701)
      }
    }
  })

  test('answer every blind strategy with a failure: one constant reply never passes a check', () => {
    for (const reply of ['ok', 'ok 0', 'ok 12 hit 0', '-', '', 'f', 'refused no-pages 0', 'err not initialized']) {
      for (const c of HYBRID_KV_CHECKS) expect(drive(c.plan(c.defaultSeed), () => reply).ok, `${c.id} answered "${reply}"`).toBe(false)
    }
  })

  test('refuse a short answer to a batch, and a module that does not start', () => {
    const plan = check('state').plan(0)
    const batch = plan.next() ?? []
    expect(batch[0]).toMatch(/^init 40 262144 1024 1 - full0:full:8:0:32:-:- state0:state:8:0:32:-:2/)
    expect(plan.judge(['ok'])).toBe(`the module answered 1 of the ${batch.length} commands sent`)
    const refused = check('state').plan(0)
    refused.next()
    const message = refused.judge(Array(batch.length).fill('err the pool holds 1 to 64 pages'))
    expect(message).toContain('init should answer "ok"')
    expect(message).toContain('the module did not start for the state-group script')
  })

  test('read a state that is not one as a problem of the module and not a crash of the plan', () => {
    // A module that answers every query with the wrong thing, in the right shape for `ok` and the wrong one for the rest.
    const reference = kvModule(kvReference)
    const lying = (what: string) => (command: string) => (command === what ? 'oops' : reference(command))
    for (const query of ['pages', 'queue', 'requests', 'adapters', 'cache', 'events']) {
      const run = drive(check('one_group').plan(1), lying(query))
      expect(run.ok, query).toBe(false)
      expect(run.message, query).toContain(`${query} was answered "oops", which cannot be read`)
    }
  })
})

describe('the bestiary, through the wire', () => {
  const member = (id: string) => {
    const found = BESTIARY.find((m) => m.id === id)
    if (found === undefined) throw new Error(`no member ${id}`)
    return found
  }
  const fails = (id: string, checkId: string, seed: number): boolean => !drive(check(checkId).plan(seed), kvModule((s) => member(id).make(s))).ok

  /** What the scripts alone decide: the checks that each member must fail on every seed, and those it must pass. A check a stream decides is in neither list. */
  const EXPECTED: Record<string, { fails: string[]; passes: string[] }> = {
    'leaky-free': { fails: ['one_group', 'sliding', 'state', 'hit_all_groups', 'adapter_pages', 'gauntlet'], passes: [] },
    'non-atomic-admit': { fails: ['sliding', 'gauntlet'], passes: ['one_group', 'adapter_pages'] },
    'window-off-by-one': { fails: ['sliding', 'gauntlet'], passes: ['one_group', 'state', 'adapter_pages'] },
    'window-short': { fails: ['sliding', 'gauntlet'], passes: ['one_group', 'state', 'adapter_pages'] },
    'double-counted': { fails: ['adapter_pages', 'gauntlet'], passes: ['one_group', 'sliding', 'state', 'hit_all_groups'] },
    'union-hit': { fails: ['hit_all_groups', 'gauntlet'], passes: ['one_group', 'adapter_pages'] },
    'published-twice': { fails: ['one_group', 'sliding', 'state', 'hit_all_groups', 'adapter_pages', 'gauntlet'], passes: [] },
    'free-forward': { fails: ['one_group', 'sliding', 'hit_all_groups', 'gauntlet'], passes: [] },
    'unhashed-back': { fails: ['one_group', 'sliding', 'state', 'hit_all_groups', 'adapter_pages', 'gauntlet'], passes: [] },
    'reset-while-running': { fails: ['gauntlet'], passes: ['one_group', 'sliding', 'state', 'hit_all_groups', 'adapter_pages'] },
  }

  test('every member of the TypeScript bestiary has a row, and every row a member', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(BESTIARY.map((m) => m.id).sort())
  })

  test.each(Object.entries(EXPECTED))('%s fails the checks of its mistake on every one of twenty seeds, and passes the others', (id, want) => {
    for (const checkId of want.fails) {
      const caught = seeds(checkId === 'gauntlet' ? 3 : 20).filter((seed) => fails(id, checkId, seed)).length
      expect(caught, `${id} ${checkId}`).toBe(checkId === 'gauntlet' ? 3 : 20)
    }
    for (const checkId of want.passes) {
      for (const seed of seeds(checkId === 'gauntlet' ? 1 : 10)) expect(fails(id, checkId, seed), `${id} ${checkId} seed ${seed}`).toBe(false)
    }
  })

  test('a mistake is caught in the script that is named for it, and not by luck in a stream', () => {
    const where = (id: string, checkId: string): string => drive(check(checkId).plan(1), kvModule((s) => member(id).make(s))).message
    expect(where('window-off-by-one', 'sliding')).toStartWith('the sliding-window script')
    expect(where('window-short', 'sliding')).toStartWith('the sliding-window script')
    expect(where('non-atomic-admit', 'sliding')).toStartWith('the sliding-window script')
    expect(where('union-hit', 'hit_all_groups')).toStartWith('the prefix-hit script')
    expect(where('double-counted', 'adapter_pages')).toStartWith('the adapter script')
    expect(where('free-forward', 'one_group')).toStartWith('the one-group script')
    expect(where('unhashed-back', 'one_group')).toStartWith('the one-group script')
    expect(where('leaky-free', 'one_group')).toStartWith('the one-group script')
    expect(where('published-twice', 'one_group')).toStartWith('the one-group script')
    expect(where('reset-while-running', 'gauntlet')).toStartWith('the reset script')
  })

  test('a module that throws is a module that traps: the plan does not see a reply', () => {
    const throwing = kvModule(() => {
      throw new Error('boom')
    })
    const run = drive(check('one_group').plan(1), throwing)
    expect(run.ok).toBe(false)
    expect(run.threw).toBe(true)
  })
})

describe('the knowledge components', () => {
  test('name checks of the lab, and the ids of content/kc/graph.yaml', async () => {
    const { readFileSync } = await import('node:fs')
    const graph = readFileSync(new URL('../../content/kc/graph.yaml', import.meta.url), 'utf8')
    const ids = new Set([...graph.matchAll(/^- id: (\S+)$/gm)].map((m) => m[1]))
    for (const [checkId, kcs] of Object.entries(HYBRID_KV_KCS)) {
      expect(HYBRID_KV_CHECKS.map((c) => c.id)).toContain(checkId)
      for (const kc of kcs) expect(ids.has(kc), `${checkId} names ${kc}`).toBe(true)
    }
    // The graph plans these for this task.
    const planned = [...graph.matchAll(/^- id: (\S+)[\s\S]*?planned: W1-T22/gm)]
    expect(planned.length).toBeGreaterThan(0)
  })
})
