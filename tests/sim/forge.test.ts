/*
 * W1-T10: the oracle of the forge host (packages/sim/forge): the plans that turn a seed into commands for a learner's module, and the
 * model that says what a right module answers (ARCHITECTURE §8.3, D-025).
 *
 * The plans are tested against modules written here in another shape than the model (a clock per key, not an ordered list), so a
 * mistake in the model shows as a disagreement and not as two copies of one mistake. The Rust crate is the third voice: its wasm
 * builds are run through the host in tests/forge/toy-wasm.test.ts and by verify:labs.
 */
import { describe, expect, test } from 'bun:test'
import { createRotation, CHURN_QUERY_EVERY, CHURN_TOUCHES, hash32, MAX_CAPACITY, scripted, shown, SHOWN_CHARS, TOY_CHECKS, wrongReply } from '../../packages/sim'
import type { CheckPlan, PlannedCheck } from '../../packages/sim'

/** A module of the toy lab as a function from a command to its reply. `fifo` is the bestiary's first-in-first-out mistake. */
function toyModule(kind: 'reference' | 'fifo'): (command: string) => string {
  let capacity = 0
  let clock = 0
  const touched = new Map<number, number>()
  return (command) => {
    const [verb, argument] = command.split(' ')
    switch (verb) {
      case 'init':
        capacity = Number(argument)
        touched.clear()
        return 'ok'
      case 'touch': {
        const key = Number(argument)
        clock += 1
        if (touched.has(key)) {
          // First in, first out: a held key keeps the tick it came in on.
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
      case 'len':
        return String(touched.size)
      case 'order':
        return touched.size === 0 ? '-' : [...touched.entries()].sort((a, b) => a[1] - b[1]).map(([key]) => key).join(',')
      default:
        return `err unknown command '${command}'`
    }
  }
}

interface Driven {
  ok: boolean
  message: string
  commands: number
  batches: number
}

/** Plays a plan against a module the way the runner does: a batch at a time, to the first wrong reply. */
function drive(plan: CheckPlan, module: (command: string) => string): Driven {
  let commands = 0
  let batches = 0
  for (let batch = plan.next(); batch !== null; batch = plan.next()) {
    batches += 1
    commands += batch.length
    const wrong = plan.judge(batch.map((command) => module(command)))
    if (wrong !== null) return { ok: false, message: wrong, commands, batches }
  }
  return { ok: true, message: plan.passed(), commands, batches }
}

const check = (id: string): PlannedCheck => {
  const found = TOY_CHECKS.find((candidate) => candidate.id === id)
  if (found === undefined) throw new Error(`no check ${id}`)
  return found
}

/** Every command a plan sends, if every reply is as the reference module gives it. */
function allCommands(plan: CheckPlan): string[] {
  const module = toyModule('reference')
  const sent: string[] = []
  for (let batch = plan.next(); batch !== null; batch = plan.next()) {
    sent.push(...batch)
    plan.judge(batch.map((command) => module(command)))
  }
  return sent
}

describe('the rotation model', () => {
  test('a miss finds room, a hit goes to the back, and a full rotation dumps its front', () => {
    const rotation = createRotation(3)
    expect([1, 2, 3].map((key) => rotation.touch(key))).toEqual(['miss', 'miss', 'miss'])
    expect(rotation.order()).toBe('1,2,3')
    expect(rotation.touch(1)).toBe('hit')
    expect(rotation.order()).toBe('2,3,1')
    expect(rotation.touch(4)).toBe('miss dump 2')
    expect(rotation.order()).toBe('3,1,4')
    expect(rotation.size()).toBe(3)
  })

  test('an empty rotation lists as a dash, and a rotation of one dumps whatever it held', () => {
    expect(createRotation(1).order()).toBe('-')
    const one = createRotation(1)
    expect(one.touch(7)).toBe('miss')
    expect(one.touch(7)).toBe('hit')
    expect(one.touch(8)).toBe('miss dump 7')
  })

  test('refuses a capacity the wire refuses', () => {
    for (const capacity of [0, -1, 1.5, MAX_CAPACITY + 1]) expect(() => createRotation(capacity)).toThrow(RangeError)
    expect(() => createRotation(MAX_CAPACITY)).not.toThrow()
  })
})

describe('the toy lab\'s checks', () => {
  test('are the five of the crate, in grading order, with one seeded', () => {
    expect(TOY_CHECKS.map((c) => [c.id, c.stage, c.seeded])).toEqual([
      ['fill', 1, false],
      ['hits', 1, false],
      ['dump', 2, false],
      ['recency', 3, false],
      ['churn', 4, true],
    ])
    for (const c of TOY_CHECKS) {
      expect(c.label.length).toBeGreaterThan(0)
      expect(c.catches.length).toBeGreaterThan(0)
      if (!c.seeded) expect(c.defaultSeed).toBe(0)
    }
  })

  test('a right module passes every check, on a hundred seeds', () => {
    for (const c of TOY_CHECKS) {
      const seeds = c.seeded ? Array.from({ length: 100 }, (_, i) => i * 40_503 + 1) : [0]
      for (const seed of seeds) {
        const run = drive(c.plan(seed), toyModule('reference'))
        expect(run.ok, `${c.id} on seed ${seed}: ${run.message}`).toBe(true)
      }
    }
  })

  test('the first-in-first-out mistake passes `fill` and `dump` and fails the three that the bestiary names', () => {
    const verdicts = Object.fromEntries(TOY_CHECKS.map((c) => [c.id, drive(c.plan(c.defaultSeed), toyModule('fifo')).ok]))
    expect(verdicts).toEqual({ fill: true, hits: false, dump: true, recency: false, churn: false })
    // Seeded, it is caught on every seed of a thousand: a mistake that depends on luck would not be a bestiary member.
    let caught = 0
    for (let seed = 1; seed <= 1000; seed++) if (!drive(check('churn').plan(seed * 7_919), toyModule('fifo')).ok) caught += 1
    expect(caught).toBe(1000)
  })

  test('name the command and both replies when a reply is wrong', () => {
    const run = drive(check('hits').plan(0), toyModule('fifo'))
    expect(run.message).toBe('order should answer "2,3,1", and the module answered "1,2,3": a hit moves the key to the back')
    const dump = drive(check('dump').plan(0), () => 'ok')
    expect(dump.message).toBe('touch 1 should answer "miss", and the module answered "ok"')
  })

  test('answer every blind strategy with a failure: one constant reply never passes a check', () => {
    for (const reply of ['ok', 'miss', 'hit', '0', '1', '-', '', 'miss dump 1']) {
      for (const c of TOY_CHECKS) expect(drive(c.plan(c.defaultSeed), () => reply).ok, `${c.id} answered "${reply}"`).toBe(false)
    }
  })

  test('refuse a short or a long answer to a batch', () => {
    const plan = check('fill').plan(0)
    const batch = plan.next()
    expect(batch?.length).toBe(7)
    expect(plan.judge(['ok'])).toBe('the module answered 1 of the 7 commands sent')
  })
})

describe('the seeded run (`churn`)', () => {
  test('draws the same commands from a seed, and other commands from another', () => {
    const a = allCommands(check('churn').plan(12345))
    const b = allCommands(check('churn').plan(12345))
    const c = allCommands(check('churn').plan(12346))
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  test('sends 2,000 touches in batches of 100, asks `len` and `order` after every 25th, and starts with `init`', () => {
    const plan = check('churn').plan(99)
    const module = toyModule('reference')
    const sizes: number[] = []
    const sent: string[] = []
    for (let batch = plan.next(); batch !== null; batch = plan.next()) {
      sizes.push(batch.length)
      sent.push(...batch)
      plan.judge(batch.map((command) => module(command)))
    }
    expect(sent[0]).toMatch(/^init [3-8]$/)
    expect(sent.filter((command) => command.startsWith('touch'))).toHaveLength(CHURN_TOUCHES)
    expect(sent.filter((command) => command === 'len')).toHaveLength(CHURN_TOUCHES / CHURN_QUERY_EVERY)
    expect(sent.filter((command) => command === 'order')).toHaveLength(CHURN_TOUCHES / CHURN_QUERY_EVERY)
    expect(sizes).toHaveLength(CHURN_TOUCHES / 100)
    // 100 touches and the 4 pairs of queries that fall inside them; the first batch also holds `init`.
    expect(sizes[0]).toBe(1 + 100 + 8)
    expect(new Set(sizes.slice(1))).toEqual(new Set([108]))
  })

  test('draws a capacity of 3 to 8 pans, over keys 1 to twice the capacity', () => {
    const capacities = new Set<number>()
    for (let seed = 1; seed <= 300; seed++) {
      const commands = allCommands(check('churn').plan(seed))
      const capacity = Number(commands[0].split(' ')[1])
      capacities.add(capacity)
      const keys = commands.filter((command) => command.startsWith('touch')).map((command) => Number(command.split(' ')[1]))
      expect(Math.min(...keys)).toBeGreaterThanOrEqual(1)
      expect(Math.max(...keys)).toBeLessThanOrEqual(capacity * 2)
    }
    expect([...capacities].sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7, 8])
  })

  test('is pinned by a golden: the first commands of seed 1, and a hash of all of them', () => {
    const commands = allCommands(check('churn').plan(1))
    expect(commands.slice(0, 6)).toEqual(['init 7', 'touch 9', 'touch 7', 'touch 2', 'touch 7', 'touch 6'])
    expect(hash32(commands.join('\n'))).toBe(2_647_323_020)
  })

  test('stops at the first wrong reply and says which touch it was', () => {
    const plan = check('churn').plan(5)
    const reference = toyModule('reference')
    const batch = plan.next() ?? []
    const replies = batch.map((command) => reference(command))
    const at = batch.findIndex((command) => command.startsWith('touch'))
    replies[at + 3] = 'miss dump 99'
    const message = plan.judge(replies) ?? ''
    expect(message).toContain('should answer')
    expect(message).toContain('"miss dump 99"')
    expect(message).toMatch(/touch 4 of 2000$/)
  })
})

describe('the scripted plan', () => {
  test('sends its exchanges in batches and says what it was waiting for', () => {
    const plan = scripted(
      [
        { send: 'a', expect: '1' },
        { send: 'b', expect: '2', note: 'b is two' },
        { send: 'c', expect: '3' },
      ],
      'all three',
      2,
    )
    expect(plan.next()).toEqual(['a', 'b'])
    expect(plan.judge(['1', '2'])).toBeNull()
    expect(plan.next()).toEqual(['c'])
    expect(plan.judge(['3'])).toBeNull()
    expect(plan.next()).toBeNull()
    expect(plan.passed()).toBe('all three')
    const again = scripted([{ send: 'b', expect: '2', note: 'b is two' }], 'x')
    again.next()
    expect(again.judge(['9'])).toBe('b should answer "2", and the module answered "9": b is two')
  })

  test('refuses a batch size below one', () => {
    expect(() => scripted([], 'x', 0)).toThrow(RangeError)
  })

  test('quotes a module\'s reply, cuts it, and shows control characters', () => {
    expect(shown('a b')).toBe('"a b"')
    expect(shown('x\ny')).toBe('"x\\ny"')
    expect(shown('z'.repeat(SHOWN_CHARS + 20))).toBe(`"${'z'.repeat(SHOWN_CHARS)}…"`)
    expect(wrongReply('touch 1', 'hit', '<script>')).toBe('touch 1 should answer "hit", and the module answered "<script>"')
  })
})
