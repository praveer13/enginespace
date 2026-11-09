/*
 * W1-T10: the invoke protocol's runner (src/forge/invoke.ts). It is tested with a host that runs a module written here in JavaScript, so
 * every outcome the runner must tell apart can be provoked on demand (a pass, a wrong reply, a trap, a timeout, an ABI breach), and
 * the commands it sent can be read back. The modules are not the model: a clock per key stands in for the rotation, as in
 * tests/sim/forge.test.ts. The runner with the real worker and Rust's wasm is tested in tests/forge/toy-wasm.test.ts.
 */
import { describe, expect, test } from 'bun:test'
import { TOY_CHECKS } from '../../packages/sim'
import type { CallOutcome, ForgeHost, ForgeSession, LoadedModule } from '../../src/forge/host'
import { moduleProblem, RunAborted, runLab, seedsOf, type HostLab, type Progress } from '../../src/forge/invoke'
import { FORGE_LABS } from '../../src/forge/labs'
import { CHECK_BUDGET_MS } from '../../src/forge/protocol'
import { LabAbiError } from '../../vendor/kernelspace/src/lib/wasm-lab'

const lab: HostLab = { id: 'toy', checks: TOY_CHECKS }

const SHA = 'ab'.repeat(32)

function loaded(overrides: Partial<LoadedModule> = {}): LoadedModule {
  return {
    sha256: SHA,
    bytes: 1234,
    lab: 'toy',
    reference: false,
    version: 1,
    list: { lab: 'toy', version: 1, abi: 2, checks: TOY_CHECKS.map(({ id, label, stage, seeded }) => ({ id, label, stage, seeded })) },
    ...overrides,
  }
}

/** A module of the toy lab: a clock per key. `fifo` keeps a held key where it came in. */
function toy(kind: 'reference' | 'fifo' = 'reference'): (command: string) => string {
  let capacity = 0
  let clock = 0
  const touched = new Map<number, number>()
  return (command) => {
    const [verb, argument] = command.split(' ')
    if (verb === 'init') {
      capacity = Number(argument)
      touched.clear()
      return 'ok'
    }
    if (verb === 'len') return String(touched.size)
    if (verb === 'order') return touched.size === 0 ? '-' : [...touched.entries()].sort((a, b) => a[1] - b[1]).map(([key]) => key).join(',')
    const key = Number(argument)
    clock += 1
    if (touched.has(key)) {
      if (kind === 'reference') touched.set(key, clock)
      return 'hit'
    }
    let dumped = ''
    if (touched.size === capacity) {
      const [oldest] = [...touched.entries()].reduce((least, entry) => (entry[1] < least[1] ? entry : least))
      touched.delete(oldest)
      dumped = ` dump ${oldest}`
    }
    touched.set(key, clock)
    return `miss${dumped}`
  }
}

interface Spy {
  host: ForgeHost
  opened: number
  /** The commands of each instance, in order. */
  commands: string[][]
  /** The budget each call was given. */
  budgets: number[]
}

/** A host whose instances are modules written in JavaScript. `step` can answer a call in another way than the module does. */
function jsHost(make: () => (command: string) => string, step?: (instance: number, call: number, commands: readonly string[], budgetMs: number) => CallOutcome | undefined): Spy {
  const spy: Spy = { host: undefined as unknown as ForgeHost, opened: 0, commands: [], budgets: [] }
  spy.host = {
    async load() {
      throw new Error('the runner does not load')
    },
    async open(): Promise<ForgeSession> {
      const instance = spy.opened++
      const module = make()
      let calls = 0
      spy.commands.push([])
      return {
        async call(commands, budgetMs) {
          spy.budgets.push(budgetMs)
          spy.commands[instance].push(...commands)
          const special = step?.(instance, calls++, commands, budgetMs)
          return special ?? { kind: 'replies', replies: commands.map((command) => module(command)) }
        },
        async close() {
          return undefined
        },
      }
    },
    dispose() {},
  }
  return spy
}

const statuses = (run: Awaited<ReturnType<typeof runLab>>) => Object.fromEntries(run.checks.map((check) => [check.id, check.status]))

describe('a run on fresh seeds', () => {
  test('passes every check of a right module, in a fresh instance each, and names the module it graded', async () => {
    const spy = jsHost(() => toy())
    const events: Progress[] = []
    const run = await runLab(spy.host, lab, loaded(), { onProgress: (event) => events.push(event) })
    expect(statuses(run)).toEqual({ fill: 'pass', hits: 'pass', dump: 'pass', recency: 'pass', churn: 'pass' })
    expect(run).toMatchObject({ lab: 'toy', reference: false, version: 1, wasmSha256: SHA, seeds: 'fresh', complete: true })
    expect(spy.opened).toBe(5)
    for (const commands of spy.commands) expect(commands[0]).toMatch(/^init /)
    expect(run.checks.map((check) => check.label)).toEqual(TOY_CHECKS.map((check) => check.label))
    expect(run.checks.map((check) => check.stage)).toEqual([1, 1, 2, 3, 4])
    expect(run.checks.every((check) => check.commands > 0)).toBe(true)
    expect(events.map((event) => `${event.type}:${event.index}`)).toEqual(['check-start:0', 'check-done:0', 'check-start:1', 'check-done:1', 'check-start:2', 'check-done:2', 'check-start:3', 'check-done:3', 'check-start:4', 'check-done:4'])
  })

  test('draws one seed for the seeded check and none for the rest, marks it fresh, and draws it at the start of the check', async () => {
    const drawn: number[] = []
    const run = await runLab(jsHost(() => toy()).host, lab, loaded(), {
      draw: () => {
        drawn.push(4_000_000_001)
        return 4_000_000_001
      },
    })
    expect(run.checks.map((check) => check.seed)).toEqual([undefined, undefined, undefined, undefined, 4_000_000_001])
    expect(run.checks.map((check) => check.fresh)).toEqual([undefined, undefined, undefined, undefined, true])
    expect(drawn).toHaveLength(1)
  })

  test('draws other seeds on another run, from the browser\'s entropy by default', async () => {
    const seeds = new Set<number | undefined>()
    for (let i = 0; i < 20; i++) seeds.add((await runLab(jsHost(() => toy()).host, lab, loaded())).checks[4].seed)
    expect(seeds.size).toBeGreaterThan(15)
    for (const seed of seeds) expect(Number.isInteger(seed) && (seed as number) >= 0 && (seed as number) <= 0xffff_ffff).toBe(true)
  })

  test('a wrong module fails the checks that name its mistake, says which reply was wrong, and the run goes on', async () => {
    const run = await runLab(jsHost(() => toy('fifo')).host, lab, loaded())
    expect(statuses(run)).toEqual({ fill: 'pass', hits: 'fail', dump: 'pass', recency: 'fail', churn: 'fail' })
    expect(run.checks[1].msg).toBe('order should answer "2,3,1", and the module answered "1,2,3": a hit moves the key to the back')
    expect(run.checks[3].msg).toContain('touch 4 should answer "miss dump 2"')
  })

  test('a check is judged after each batch and stops at the first wrong reply: no more commands go to a module that has failed', async () => {
    const spy = jsHost(() => toy('fifo'))
    const run = await runLab(spy.host, lab, loaded(), { draw: () => 99, only: ['churn'] })
    expect(run.checks[0].status).toBe('fail')
    // The first batch holds 100 touches and their queries; a wrong reply in it ends the check, so the other 1,900 touches are never sent.
    expect(spy.commands[0].filter((command) => command.startsWith('touch')).length).toBeLessThanOrEqual(100)
  })
})

describe('a trap, a timeout and a breach of the ABI', () => {
  const panic = 'panicked at toy/src/rotation.rs:31:9: not yet implemented: build the rotation'

  test('a trap is a result with the panic\'s words, and the other checks still run', async () => {
    const trapping = jsHost(() => toy(), () => ({ kind: 'trap', replies: [], panic, trace: 'seen' }))
    const run = await runLab(trapping.host, lab, loaded())
    expect(run.checks.map((check) => check.status)).toEqual(['trap', 'trap', 'trap', 'trap', 'trap'])
    expect(run.checks[0].msg).toBe('not implemented yet: build the rotation (toy/src/rotation.rs:31:9)')
    expect(run.checks[0]).toMatchObject({ panic, trace: 'seen', commands: 1 })
    expect(trapping.opened).toBe(5)
  })

  test('a trap with no panic text says so', async () => {
    const run = await runLab(jsHost(() => toy(), () => ({ kind: 'trap', replies: ['ok', 'miss'] })).host, lab, loaded(), { only: ['fill'] })
    expect(run.checks[0].status).toBe('trap')
    expect(run.checks[0].msg).toContain('trapped without a panic message')
    expect(run.checks[0].commands).toBe(3)
  })

  test('a check that runs out its time is `timeout`, with the limit in the message, and the run goes on to the next', async () => {
    const run = await runLab(jsHost(() => toy(), (instance) => (instance === 2 ? { kind: 'timeout' } : undefined)).host, lab, loaded())
    expect(statuses(run)).toEqual({ fill: 'pass', hits: 'pass', dump: 'timeout', recency: 'pass', churn: 'pass' })
    expect(run.checks[2].msg).toContain('was still running after 2 s')
    expect(run.checks[2].msg).toContain('went on with the next check')
  })

  test('the budget is one for the whole check: each batch is given what the last ones left, and a spent budget ends the check unasked', async () => {
    let now = 0
    const spy = jsHost(
      () => toy(),
      () => {
        now += 900
        return undefined
      },
    )
    const run = await runLab(spy.host, lab, loaded(), { only: ['churn'], now: () => now, draw: () => 5 })
    // Batch 1 spends 900 ms of 2,000, batch 2 is given 1,100 and spends 900, batch 3 is given 200 and spends 900: the fourth is never sent.
    expect(spy.budgets).toEqual([2000, 1100, 200])
    expect(run.checks[0].status).toBe('timeout')
    expect(CHECK_BUDGET_MS).toBe(2000)
  })

  test('the budget is the time in the module, not the time the oracle takes: a slow judge costs the check nothing', async () => {
    const spy = jsHost(() => toy())
    // The clock moves only in `now()`, which the runner reads around calls alone.
    const run = await runLab(spy.host, lab, loaded(), { only: ['churn'], now: () => 0 })
    expect(run.checks[0].status).toBe('pass')
    expect(new Set(spy.budgets)).toEqual(new Set([2000]))
  })

  test('a module that breaks the ABI is a failed check with the breach in words, and one that crashes its worker too', async () => {
    const breach = jsHost(() => toy(), () => {
      throw new LabAbiError('your module replied with a pointer past the end of its memory: ABI violation.')
    })
    const run = await runLab(breach.host, lab, loaded(), { only: ['fill'] })
    expect(run.checks[0]).toMatchObject({ status: 'fail', msg: 'your module replied with a pointer past the end of its memory: ABI violation.' })

    const crash = jsHost(() => toy(), () => {
      throw new Error('the forge worker stopped')
    })
    const crashed = await runLab(crash.host, lab, loaded(), { only: ['fill'] })
    expect(crashed.checks[0]).toMatchObject({ status: 'fail', msg: 'the check could not finish: the forge worker stopped' })
  })

  test('a plan that throws is a failed check, and later checks still run', async () => {
    const broken: HostLab = {
      id: 'toy',
      checks: TOY_CHECKS.map((check, i) =>
        i === 1
          ? {
              ...check,
              plan: () => {
                throw new Error('the oracle has a bug')
              },
            }
          : check,
      ),
    }
    const run = await runLab(jsHost(() => toy()).host, broken, loaded())
    expect(statuses(run)).toEqual({ fill: 'pass', hits: 'fail', dump: 'pass', recency: 'pass', churn: 'pass' })
    expect(run.checks[1].msg).toBe('the check could not finish: the oracle has a bug')
  })
})

describe('telling a run again', () => {
  test('on the seeds of a run is the same run: the same commands, marked as told again, and not fresh', async () => {
    const first = jsHost(() => toy())
    const fresh = await runLab(first.host, lab, loaded(), { draw: () => 424_242 })
    const second = jsHost(() => toy())
    const again = await runLab(second.host, lab, loaded(), { seeds: 'replay', replay: seedsOf(fresh) })
    expect(seedsOf(fresh)).toEqual({ churn: 424_242 })
    expect(again.seeds).toBe('replay')
    expect(again.checks[4]).toMatchObject({ seed: 424_242, fresh: false })
    expect(second.commands).toEqual(first.commands)
  })

  test('uses the check\'s own seed when none was kept for it', async () => {
    const run = await runLab(jsHost(() => toy()).host, lab, loaded(), { seeds: 'replay', replay: {} })
    expect(run.checks[4].seed).toBe(TOY_CHECKS[4].defaultSeed)
  })
})

describe('only', () => {
  test('runs the checks named, in the lab\'s order, and the run is not complete', async () => {
    const run = await runLab(jsHost(() => toy()).host, lab, loaded(), { only: ['dump', 'fill'] })
    expect(run.checks.map((check) => check.id)).toEqual(['fill', 'dump'])
    expect(run.complete).toBe(false)
  })
})

describe('a run that is abandoned', () => {
  test('stops before it starts when its signal is already aborted, and sends the module nothing', async () => {
    const spy = jsHost(() => toy())
    const controller = new AbortController()
    controller.abort()
    await expect(runLab(spy.host, lab, loaded(), { signal: controller.signal })).rejects.toBeInstanceOf(RunAborted)
    expect(spy.opened).toBe(0)
  })

  test('stops at the check that is in the module when the page goes, reports nothing for it, and starts no other', async () => {
    const controller = new AbortController()
    const events: Progress[] = []
    // The page goes while the third check is in its call: that check comes back as a timeout, because its worker was stopped under it.
    const spy = jsHost(
      () => toy(),
      (instance) => {
        if (instance !== 2) return undefined
        controller.abort()
        return { kind: 'timeout' }
      },
    )
    await expect(runLab(spy.host, lab, loaded(), { signal: controller.signal, onProgress: (event) => events.push(event) })).rejects.toBeInstanceOf(RunAborted)
    expect(spy.opened).toBe(3)
    expect(events.filter((event) => event.type === 'check-done').map((event) => (event.type === 'check-done' ? event.result.id : ''))).toEqual(['fill', 'hits'])
  })
})

describe('whose module it is', () => {
  test('a module that lists the lab\'s checks is the lab\'s', () => {
    expect(moduleProblem(lab, loaded())).toBeNull()
  })

  test('another lab\'s module is refused by name, and so is a module built from another kit', async () => {
    expect(moduleProblem(lab, loaded({ lab: 'hybrid-kv' }))).toMatch(/is the "hybrid-kv" lab's, and this page grades "toy"/)
    const other = loaded()
    other.list = { ...other.list, checks: other.list.checks.slice(0, 4) }
    expect(moduleProblem(lab, other)).toMatch(/lists the checks fill, hits, dump, recency, and this page grades fill, hits, dump, recency, churn/)
    const reordered = loaded()
    reordered.list = { ...reordered.list, checks: [...reordered.list.checks].reverse() }
    expect(moduleProblem(lab, reordered)).not.toBeNull()
    await expect(runLab(jsHost(() => toy()).host, lab, other)).rejects.toThrow(LabAbiError)
  })

  test('the registry\'s toy lab grades the checks of packages/sim', () => {
    expect(FORGE_LABS.toy.checks).toBe(TOY_CHECKS)
  })
})
