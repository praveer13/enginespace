/*
 * W1-T22: the `hybrid-kv` crate held to the oracle in packages/sim, without a Rust toolchain. The harness (labs/forge/hybrid-kv/src/lib.rs)
 * is Rust and the oracle is TypeScript, and the two say the same things in two places:
 *
 *   the wire        the header of the harness is the header of packages/sim/forge/kv-wire.ts, line for line
 *   the pools       the `init` lines of the crate are `wireSpec` of the lab's four pools
 *   the scripts     the crate plays the lines of packages/sim/forge/hybrid-kv.ts, and knows the replies that `kvReference` gives them
 *   the streams     the crate draws the streams that the oracle's table says: the pool, the length, the adapters, the reset
 *   the hash        the values in the crate's tests are `kvBlockHash`'s
 *
 * What the crate then does with them is tested where Rust runs: `cargo test` (labs.yml), verify:labs and tests/forge/hybrid-kv-wasm.test.ts.
 */
import { describe, expect, test } from 'bun:test'
import {
  HYBRID_KV_CHECKS,
  HYBRID_KV_SCRIPTS,
  HYBRID_KV_SPECS,
  HYBRID_KV_STREAMS,
  kvAdapterCatalog,
  kvBlockHash,
  kvReference,
  parseWireOp,
  scriptOps,
  wireReply,
  wireSpec,
  SCRIPT_ADAPTERS,
  SCRIPT_HIT,
  SCRIPT_ONE_GROUP,
  SCRIPT_RESET,
  SCRIPT_SAME_SIZE,
  SCRIPT_SLIDING,
  SCRIPT_STATE,
} from '../../packages/sim'
import type { KvScript } from '../../packages/sim'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { read, root } from '../ci/support'

const harness = read('labs/forge/hybrid-kv/src/lib.rs')
const wireTs = read('packages/sim/forge/kv-wire.ts')
const crateTests = read('labs/forge/hybrid-kv/tests/checks.rs')

/** The Rust name of each pool constant, and the pool of the oracle that it must be. */
const POOLS = { ONE_GROUP: 'one-group', TWO_KINDS: 'two-kinds', STATE: 'state', SAME_SIZE: 'same-size' } as const

/** The Rust name of each script, and the script of the oracle that it must be. */
const SCRIPTS: Readonly<Record<string, KvScript>> = {
  ONE_GROUP: SCRIPT_ONE_GROUP,
  SLIDING: SCRIPT_SLIDING,
  STATE: SCRIPT_STATE,
  HIT: SCRIPT_HIT,
  SAME_SIZE: SCRIPT_SAME_SIZE,
  ADAPTERS: SCRIPT_ADAPTERS,
  RESET: SCRIPT_RESET,
}

describe('the wire', () => {
  /** The lines of a header's wire table, with the comment marks off: from the `init` line to the last event. */
  function table(text: string, mark: RegExp): string[] {
    const lines = text.split('\n')
    const from = lines.findIndex((line) => mark.test(line) && line.includes('init <pool>'))
    const to = lines.findIndex((line, i) => i > from && line.includes('AllBlocksCleared'))
    return lines.slice(from, to + 1).map((line) => line.replace(mark, '').trimEnd())
  }

  test('the header of the harness is the header of the wire module, line for line', () => {
    const rust = table(harness, /^\/\/!/)
    const ts = table(wireTs, /^\/\//)
    expect(rust.length).toBeGreaterThan(15)
    expect(rust).toEqual(ts)
  })

  test('the largest pool, and the most bytes of a reply, are the wire module\'s', () => {
    expect(harness).toMatch(/pub const MAX_POOL: usize = 128;/)
    expect(wireTs).toMatch(/export const WIRE_MAX_POOL = 128/)
    expect(harness).toMatch(/const MAX_REPLY: usize = 4000;/)
  })

  test('the refusals are the wire module\'s, word for word', () => {
    const words = [...harness.matchAll(/Refusal::\w+ => "([a-z-]+)",/g)].map((m) => m[1])
    expect(words.sort()).toEqual(['busy', 'exists', 'in-use', 'no-adapter', 'no-pages', 'unknown'])
  })
})

describe('the pools', () => {
  const constants = new Map([...harness.matchAll(/^const SPEC_(\w+): &str =\s*"([^"]*)";/gm)].map((m) => [m[1], m[2]]))

  test('the crate has the four pools, and each is the `init` line of the oracle\'s', () => {
    expect([...constants.keys()].sort()).toEqual(Object.keys(POOLS).sort())
    for (const [name, pool] of Object.entries(POOLS)) expect(constants.get(name), name).toBe(wireSpec(HYBRID_KV_SPECS[pool]))
  })

  test('the pools fit the wire: at most 128 pages, and every block exactly one page', () => {
    for (const spec of Object.values(HYBRID_KV_SPECS)) {
      expect(spec.poolPages).toBeLessThanOrEqual(128)
      for (const g of spec.groups) expect((g.layers + (g.padLayers ?? 0)) * g.blockTokens * spec.tokenBytes).toBe(spec.pageBytes)
    }
  })

  test('the adapters of a stream are the catalog of the pool\'s page size', () => {
    const catalogs = new Map(
      [...harness.matchAll(/^const CATALOG_(\w+): Catalog = &\[(.*)\];/gm)].map((m) => [m[1], [...m[2].matchAll(/\((\d+), (\d+)\)/g)].map((pair) => [Number(pair[1]), Number(pair[2])])]),
    )
    expect([...catalogs.keys()].sort()).toEqual(Object.keys(POOLS).sort())
    for (const [name, pool] of Object.entries(POOLS)) {
      expect(catalogs.get(name), name).toEqual(kvAdapterCatalog(HYBRID_KV_SPECS[pool]).map((a) => [a.id, a.pages]))
    }
  })
})

describe('the scripts', () => {
  const steps = new Map(
    [...harness.matchAll(/static (\w+)_STEPS: &\[Step\] = &\[([\s\S]*?)\n\];/g)].map((m) => [
      m[1],
      [...m[2].matchAll(/Step \{ line: "([^"]*)", reply: "([^"]*)", note: "([^"]*)" \}/g)].map((step) => ({ line: step[1], reply: step[2], note: step[3] })),
    ]),
  )
  const scripts = new Map(
    [...harness.matchAll(/static SCRIPT_(\w+): Script = Script \{ name: "([^"]*)", spec: SPEC_(\w+), steps: (\w+)_STEPS \}/g)].map((m) => [m[1], { name: m[2], pool: m[3], steps: m[4] }]),
  )

  test('the crate has the seven scripts of the oracle, with the names and the pools', () => {
    expect([...scripts.keys()].sort()).toEqual(Object.keys(SCRIPTS).sort())
    for (const [name, script] of Object.entries(SCRIPTS)) {
      const crate = scripts.get(name)
      expect(crate?.name, name).toBe(script.name)
      expect(crate?.pool, name).toBe(Object.entries(POOLS).find(([, pool]) => pool === script.pool)?.[0])
      expect(crate?.steps, name).toBe(name)
    }
  })

  test('each step is a line of the oracle\'s script, and every line of the script is a step', () => {
    for (const [name, script] of Object.entries(SCRIPTS)) {
      expect(steps.get(name)?.map((step) => step.line), name).toEqual(script.lines)
    }
  })

  test('each step knows the reply that the reference gives its operation', () => {
    for (const [name, script] of Object.entries(SCRIPTS)) {
      const reference = kvReference(HYBRID_KV_SPECS[script.pool])
      const replies = scriptOps(script).map((op) => wireReply(reference.apply(op)))
      expect(steps.get(name)?.map((step) => step.reply), name).toEqual(replies)
    }
  })

  test('most steps carry a note, and a note is a lower-case clause', () => {
    for (const [name, list] of steps) {
      expect(list.filter((step) => step.note !== '').length, name).toBeGreaterThan(Math.floor(list.length / 4))
      for (const step of list) if (step.note !== '') expect(step.note, `${name}: ${step.line}`).toMatch(/^[a-z0-9]/)
    }
  })

  test('the doc\'s 112-token request holds 7 + 2 + 2 = 11 pages, as the first notes of the scripts say', () => {
    const spec = HYBRID_KV_SPECS['two-kinds']
    const model = kvReference(spec)
    const reply = model.apply(parseWireOp('admit 1 - 0+112'))
    expect(reply).toEqual({ ok: true, free: spec.poolPages - 11, hit: 0 })
    const page = kvReference(HYBRID_KV_SPECS['one-group'])
    expect(page.apply(parseWireOp('admit 1 - 0+20'))).toEqual({ ok: true, free: 18, hit: 0 })
  })

  test('each check of the crate plays the scripts of the oracle\'s check, in order, and a stream of its table', () => {
    const functions = new Map([...harness.matchAll(/pub fn check_(\w+)\(ctx: &Ctx\) -> Check \{([\s\S]*?)\n\}/g)].map((m) => [m[1], m[2]]))
    expect([...functions.keys()]).toEqual(HYBRID_KV_CHECKS.map((c) => c.id))
    const names = new Map(Object.entries(SCRIPTS).map(([name, script]) => [script, name]))
    for (const check of HYBRID_KV_CHECKS) {
      const body = functions.get(check.id) ?? ''
      const played = [...body.matchAll(/&SCRIPT_(\w+)/g)].map((m) => m[1])
      expect(played, check.id).toEqual(HYBRID_KV_SCRIPTS[check.id as keyof typeof HYBRID_KV_SCRIPTS].map((script) => names.get(script)))
    }
  })
})

describe('the streams', () => {
  const ops = [...(/const STREAM_OPS: \[usize; 5\] = \[([^\]]*)\];/.exec(harness)?.[1] ?? '').matchAll(/\d+/g)].map((m) => Number(m[0]))

  test('the stage checks draw the streams of the oracle\'s table: the pool, how many operations, the adapters and the reset', () => {
    const stages = ['one_group', 'sliding', 'state', 'hit_all_groups', 'adapter_pages'] as const
    expect(ops).toEqual(stages.map((id) => HYBRID_KV_STREAMS[id][0].ops))
    for (const [i, id] of stages.entries()) {
      const body = new RegExp(`pub fn check_${id}\\(ctx: &Ctx\\) -> Check \\{([\\s\\S]*?)\\n\\}`).exec(harness)?.[1] ?? ''
      const stream = /Stream \{ name: "[^"]*", spec: SPEC_(\w+), ops: STREAM_OPS\[(\d)\], catalog: (&\[\]|CATALOG_\w+), reset: (true|false) \}/.exec(body)
      const want = HYBRID_KV_STREAMS[id][0]
      expect(stream?.[1], id).toBe(Object.entries(POOLS).find(([, pool]) => pool === want.pool)?.[0])
      expect(Number(stream?.[2]), id).toBe(i)
      expect(stream?.[3] !== '&[]', id).toBe(want.adapters)
      expect(stream?.[4] === 'true', id).toBe(want.reset)
    }
  })

  test('the gauntlet draws four streams on the four pools, with adapters and a reset', () => {
    const body = /pub fn check_gauntlet\(ctx: &Ctx\) -> Check \{([\s\S]*?)\n\}/.exec(harness)?.[1] ?? ''
    const streams = [...body.matchAll(/Stream \{ name: "stream (\d) of 4", spec: SPEC_(\w+), ops: (\d+), catalog: CATALOG_(\w+), reset: (true|false) \}/g)]
    expect(streams.map((m) => [POOLS[m[2] as keyof typeof POOLS], Number(m[3]), m[4] === m[2], m[5] === 'true'])).toEqual(
      HYBRID_KV_STREAMS.gauntlet.map((s) => [s.pool, s.ops, true, s.reset]),
    )
    expect(HYBRID_KV_STREAMS.gauntlet.every((s) => s.adapters)).toBe(true)
  })
})

describe('the hash and the digest', () => {
  test('the values in the crate\'s tests are the hash of the oracle', () => {
    const first = Array.from({ length: 16 }, (_, i) => i)
    const second = Array.from({ length: 16 }, (_, i) => 16 + i)
    const a = kvBlockHash(0, first, 0, 16, 0)
    const b = kvBlockHash(a, second, 0, 16, 4)
    const c = kvBlockHash(0, [4294967295, 0, 7], 0, 3, 1)
    const numbers = [...crateTests.matchAll(/(\d{1,3}(?:_\d{3})+)/g)].map((m) => Number(m[1].replaceAll('_', '')))
    expect(numbers).toContain(a)
    expect(numbers).toContain(b)
    expect(numbers).toContain(c)
  })
})

describe('the claims that the lab cites', () => {
  /** Every claim id of content/claims, from the `- id:` lines of its files. */
  const claims = new Set(
    (readdirSync(path.join(root, 'content/claims'), { recursive: true }) as string[])
      .filter((file) => file.endsWith('.yaml'))
      .flatMap((file) => [...read(`content/claims/${file}`).matchAll(/^- id: (\S+)$/gm)].map((m) => m[1])),
  )

  test('every claim id in the template, the harness and the wire module is a claim of the repository', () => {
    const cited = new Set([harness, read('labs/forge/hybrid-kv/src/manager.rs'), read('labs/forge/hybrid-kv/reference/manager.rs'), wireTs].flatMap((text) => [...text.matchAll(/\b((?:vllm|sglang)\.[a-z0-9-]+\.[a-z0-9-]+)\b/g)].map((m) => m[1])))
    expect(cited.size).toBeGreaterThanOrEqual(10)
    expect([...cited].filter((id) => !claims.has(id))).toEqual([])
  })
})
