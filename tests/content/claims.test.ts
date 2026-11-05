/*
 * verify:claims (ARCHITECTURE §4.4, §4.7): the claims files, the derived claims that must recompute, the dates, the pins and the
 * TTLs that are reported and never fail.
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { compileContent } from '../../scripts/content/build.ts'
import { agrees, claimProblems, evaluate, FormulaError } from '../../scripts/verify-claims.ts'
import { CLAIM_COUNT, CLAIMS, compile, errors, LESSON, lineOf, LOCK_KEYS, project, read, REPO_COUNTS, repo, swap, where } from './support.ts'
import type { Edit } from './support.ts'

const TODAY = '2026-11-04'
const claims = read(CLAIMS)

/**
 * Compiles a copy with the edit and returns what verify:claims finds in it on `today`. The lock is the repo's own (W1-T01), so every
 * claim's pin is one of its keys unless a test passes another set. `only` narrows the claims to the sample file's, for a test whose
 * expectation counts the sample's claims and not the upstream ones that W1-T01 added.
 */
function problems(edits: Record<string, Edit>, today = TODAY, lock: ReadonlySet<string> | null = LOCK_KEYS, only?: string) {
  const result = compileContent({ root: project(edits) })
  return claimProblems(only === undefined ? result.claims : result.claims.filter((record) => record.file === only), lock, today)
}
const summary = (found: ReturnType<typeof problems>) => found.map((d) => `${d.severity} ${d.line} ${d.code}`)

describe('formulas', () => {
  const inputs = new Map([
    ['a.b', 2100],
    ['a.step-us', 300],
    ['a.step', 7],
  ])
  const table: [string, number][] = [
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['-2 * -3', 6],
    ['- (4 - 6)', 2],
    ['10 / 4', 2.5],
    ['8 / 2 / 2', 2],
    ['2 - 3 - 4', -5],
    ['1.5e2 + .5', 150.5],
    ['ceil(7 / 2)', 4],
    ['floor(7 / 2)', 3],
    ['round(2.5)', 3],
    ['abs(-4)', 4],
    ['min(3, 1, 2)', 1],
    ['max(a.step, 10) * 2', 20],
    ['a.b / 1000', 2.1],
    ['a.step-us - 100', 200],
    ['a.step * a.step-us', 2100],
    ['ceil(a.b / (a.step * 4))', 75],
  ]
  for (const [formula, expected] of table) {
    test(`${formula} = ${expected}`, () => {
      expect(evaluate(formula, inputs)).toBeCloseTo(expected, 12)
    })
  }

  test('reports the inputs it read', () => {
    const used = new Set<string>()
    evaluate('a.b / 2', inputs, used)
    expect([...used]).toEqual(['a.b'])
  })

  const failing: [string, RegExp][] = [
    ['1 +', /ends where a number was expected/],
    ['(1 + 2', /expected "\)"/],
    ['1 2', /left over/],
    ['1 / 0', /divides by zero/],
    ['1e999', /finite/],
    ['foo(1)', /cannot read "foo" in the formula/],
    ['x + 1', /cannot read "x"/],
    ['a.step - c', /cannot read "c"/],
    ['a.b.c', /cannot read "a\.b\.c"/],
    ['2 ^ 3', /cannot read "\^"/],
    ['ceil 4', /cannot read "ceil"/],
    ['min(1,)', /unexpected "\)"/],
    ['', /ends where a number was expected/],
  ]
  for (const [formula, message] of failing) {
    test(`${JSON.stringify(formula)} is refused`, () => {
      expect(() => evaluate(formula, inputs)).toThrow(FormulaError)
      expect(() => evaluate(formula, inputs)).toThrow(message)
    })
  }
})

describe('a value agrees with a computed number to the precision it is written in', () => {
  const table: [number, number, boolean][] = [
    [24, 24, true],
    [24, 24.0000000001, true],
    [24, 24.5, false],
    [24, 23.9, false],
    [2.1, 2.1, true],
    [3.9, 3.9045, true],
    [3.9, 3.86, true],
    [3.9, 3.96, false],
    [3.9, 4, false],
    [0.25, 0.2549, true],
    [0.25, 0.26, false],
    [1e-7, 1.04e-7, true],
    [1e-7, 1.6e-7, false],
    [0, 0, true],
    [-2.5, -2.54, true],
  ]
  for (const [value, computed, expected] of table) {
    test(`${value} against ${computed}`, () => {
      expect(agrees(value, computed)).toBe(expected)
    })
  }
})

describe('the sample claims', () => {
  test('pass, with one warning that pins cannot be checked when there is no lock', () => {
    // The warning sits on the first claim that has a pin, in the order the compiler reads the files.
    const firstPinned = compile().claims.find((record) => record.claim.pin !== undefined)
    expect(summary(problems({}, TODAY, null))).toEqual([`warning ${firstPinned?.line} pins-unchecked`])
  })

  test('pass cleanly once the lock has the pin', () => {
    expect(problems({})).toEqual([])
    expect(problems({}, TODAY, LOCK_KEYS, CLAIMS)).toEqual([])
  })

  test('are each a line in the compiled file, with the line of their first key', () => {
    const result = compile()
    // The sample's own claims, in the file's order; the claims of other files (each game's) come after them or before, and are the games' to test.
    expect(result.claims.filter((r) => r.file === CLAIMS).map((r) => `${r.claim.id} ${r.file}:${r.line}`)).toEqual([
      `vllm.release.requires-python ${CLAIMS}:${lineOf(claims, '- id: vllm.release.requires-python')}`,
      `sample.world.host-step-us ${CLAIMS}:${lineOf(claims, '- id: sample.world.host-step-us')}`,
      `sample.world.decode-step-us ${CLAIMS}:${lineOf(claims, '- id: sample.world.decode-step-us')}`,
      `sample.world.decode-step-ms ${CLAIMS}:${lineOf(claims, '- id: sample.world.decode-step-ms')}`,
    ])
  })
})

describe('derived claims', () => {
  const derived = lineOf(claims, '- id: sample.world.decode-step-ms')

  test('must recompute', () => {
    expect(summary(problems({ [CLAIMS]: swap('value: 2.1', 'value: 2.2') }))).toEqual([`error ${derived} not-derived`])
    expect(problems({ [CLAIMS]: swap('value: 2.1', 'value: 2.2') })[0].message).toBe('sample.world.decode-step-ms: the value is 2.2, and sample.world.decode-step-us / 1000 gives 2.1')
  })

  test('follow their inputs', () => {
    expect(summary(problems({ [CLAIMS]: swap('value: 2100', 'value: 2400') }))).toEqual([`error ${derived} not-derived`])
  })

  test('may be written to the precision of their last digit', () => {
    expect(problems({ [CLAIMS]: (text) => text.replace('value: 2100', 'value: 2149').replace('value: 2.1\n', 'value: 2.1\n') })).toEqual([])
    expect(summary(problems({ [CLAIMS]: (text) => text.replace('value: 2100', 'value: 2151') }))).toEqual([`error ${derived} not-derived`])
  })

  test('must read each input they declare', () => {
    const edit = swap('inputs: [sample.world.decode-step-us]', 'inputs: [sample.world.decode-step-us, sample.world.host-step-us]')
    expect(summary(problems({ [CLAIMS]: edit }))).toEqual([`error ${derived} unused-input`])
  })

  test('may use more than one input', () => {
    const edit = (text: string) => text.replace('formula: sample.world.decode-step-us / 1000', 'formula: (sample.world.decode-step-us + sample.world.host-step-us - sample.world.host-step-us) / 1000').replace('inputs: [sample.world.decode-step-us]', 'inputs: [sample.world.decode-step-us, sample.world.host-step-us]')
    expect(problems({ [CLAIMS]: edit })).toEqual([])
  })

  test('cannot read a claim they do not declare', () => {
    const edit = swap('formula: sample.world.decode-step-us / 1000', 'formula: sample.world.decode-step-us / sample.world.host-step-us')
    const found = problems({ [CLAIMS]: edit })
    expect(summary(found)).toEqual([`error ${derived} bad-formula`])
    expect(found[0].message).toContain('cannot read "sample.world.host-step-us"')
  })

  test('cannot name an input that is not a claim, or whose value is not a number', () => {
    expect(summary(problems({ [CLAIMS]: swap('inputs: [sample.world.decode-step-us]', 'inputs: [sample.world.nope]') }))).toEqual([`error ${derived} unknown-input`])
    const edit = (text: string) => text.replace('formula: sample.world.decode-step-us / 1000', 'formula: 2 * vllm.release.requires-python').replace('inputs: [sample.world.decode-step-us]', 'inputs: [vllm.release.requires-python]')
    const found = problems({ [CLAIMS]: edit })
    expect(found[0].message).toContain('whose value is not a number')
  })

  test('must have a number for a value', () => {
    expect(summary(problems({ [CLAIMS]: swap('value: 2.1', 'value: "2.1"') }))).toEqual([`error ${derived} not-derived`])
  })

  test('are recomputed when the formula has a function of its inputs', () => {
    const edit = (text: string) => text.replace('formula: sample.world.decode-step-us / 1000', 'formula: ceil(sample.world.decode-step-us / 1000)').replace('value: 2.1\n', 'value: 3\n')
    expect(problems({ [CLAIMS]: edit })).toEqual([])
  })
})

describe('dates, pins and age', () => {
  const first = lineOf(claims, '- id: vllm.release.requires-python')

  test('a date after today is an error, and tomorrow is not (time zones)', () => {
    expect(summary(problems({ [CLAIMS]: swap('verifiedAt: 2026-11-04\n  ttlDays: 90', 'verifiedAt: 2026-11-06\n  ttlDays: 90') }))).toEqual([`error ${first} future-date`])
    expect(problems({ [CLAIMS]: swap('verifiedAt: 2026-11-04\n  ttlDays: 90', 'verifiedAt: 2026-11-05\n  ttlDays: 90') })).toEqual([])
    expect(summary(problems({ [CLAIMS]: swap('accessed: 2026-11-04', 'accessed: 2026-12-01') }))).toEqual([`error ${first} future-date`])
  })

  test('a pin that the lock does not have is an error', () => {
    expect(summary(problems({}, TODAY, new Set(['sglang']), CLAIMS))).toEqual([`error ${first} unknown-pin`])
    // Every upstream claim of W1-T01 names a pin too, so a lock with only sglang fails all the others' pins as well.
    expect(problems({}, TODAY, new Set(['sglang'])).filter((found) => found.code === 'unknown-pin').length).toBeGreaterThan(100)
  })

  test('a claim past its TTL is a warning that names the day it went stale, and never an error', () => {
    // 90 days after 2026-11-04 is 2027-02-02.
    expect(problems({}, '2027-02-02')).toEqual([])
    // The sample's claim is the only one of its file that is stale then. The upstream claims have the same 90 days, so they are stale too.
    const stale = problems({}, '2027-02-03', LOCK_KEYS, CLAIMS)
    expect(summary(stale)).toEqual([`warning ${first} stale-claim`])
    expect(stale[0].message).toBe('vllm.release.requires-python: stale since 2027-02-02 (checked 2026-11-04, good for 90 days)')
    expect(errors({ diagnostics: stale, outputs: [], claims: [], lockKeys: null, stats: { modules: 0, lessons: 0, claims: 0 } })).toEqual([])
  })

  test('the 365-day claims are stale a year on', () => {
    const found = problems({}, '2027-11-05')
    expect(found.map((d) => d.code)).toEqual(Array.from({ length: CLAIM_COUNT }, () => 'stale-claim'))
  })
})

describe('the claims files themselves', () => {
  const at = (id: string) => lineOf(claims, `- id: ${id}`)
  const cases: [string, Record<string, Edit>, string[]][] = [
    ['a source with no quote', { [CLAIMS]: swap(`    quote: '"requires_python":"<3.15,>=3.11"'\n`, '') }, [`${CLAIMS}:${lineOf(claims, '  source:')} schema`]],
    ['a source that is not https', { [CLAIMS]: swap('url: https://pypi.org', 'url: http://pypi.org') }, [`${CLAIMS}:${lineOf(claims, 'url: https://pypi.org')} schema`]],
    ['a claim with no source that is not synthetic or derived', { [CLAIMS]: swap('  synthetic: true\n  verifiedAt: 2026-11-04\n  ttlDays: 365\n\n- id: sample.world.decode-step-us', '  verifiedAt: 2026-11-04\n  ttlDays: 365\n\n- id: sample.world.decode-step-us') }, [`${CLAIMS}:${at('sample.world.host-step-us')} schema`]],
    ['a claim with no tag', { [CLAIMS]: swap('  tag: measured\n', '') }, [`${CLAIMS}:${at('vllm.release.requires-python')} schema`]],
    ['a claim with an unknown key', { [CLAIMS]: swap('  tag: measured\n', '  tag: measured\n  confidence: high\n') }, [`${CLAIMS}:${lineOf(claims.replace('  tag: measured\n', '  tag: measured\n  confidence: high\n'), 'confidence: high')} unknown-key`]],
    ['a TTL of zero', { [CLAIMS]: swap('ttlDays: 90', 'ttlDays: 0') }, [`${CLAIMS}:${lineOf(claims, 'ttlDays: 90')} schema`]],
    ['a derived claim with no derivation', { [CLAIMS]: swap('  derived:\n    formula: sample.world.decode-step-us / 1000\n    inputs: [sample.world.decode-step-us]\n', '') }, [`${CLAIMS}:${at('sample.world.decode-step-ms')} schema`]],
    ['a date that does not exist', { [CLAIMS]: swap('verifiedAt: 2026-11-04\n  ttlDays: 90', 'verifiedAt: 2026-02-31\n  ttlDays: 90') }, [`${CLAIMS}:${lineOf(claims, 'verifiedAt: 2026-11-04')} schema`]],
    ['a file that is not a list', { [CLAIMS]: 'id: x\n' }, [`${CLAIMS}:1 schema`]],
    ['a file that is not YAML', { [CLAIMS]: '- id: [x\n' }, [`${CLAIMS}:2 bad-yaml`]],
  ]
  for (const [name, edits, expected] of cases) {
    test(name, () => {
      const result = compile(edits)
      expect(where(result, 'claims')).toEqual(expected)
      expect(errors(result, 'content').filter((d) => d.file === CLAIMS)).toEqual([])
    })
  }

  test('a bare YAML date stays a string, so a date is accepted as the schema writes it', () => {
    expect(where(compile(), 'claims')).toEqual([])
  })

  test('one bad claim does not hide the others: the good ones still resolve, and only a reference to the bad one fails', () => {
    const result = compile({ [CLAIMS]: swap('ttlDays: 90', 'ttlDays: 0') })
    expect(where(result, 'claims')).toEqual([`${CLAIMS}:${lineOf(claims, 'ttlDays: 90')} schema`])
    expect(where(result, 'content')).toEqual([`${LESSON}:${lineOf(read(LESSON), '{{claim:vllm.release.requires-python}}')} unknown-claim`])
  })

  test('claims in a nested folder are read too', () => {
    const result = compile({ 'content/claims/hardware/h100.yaml': claims.replace(/sample\./g, 'hw.').replace('vllm.release.requires-python', 'hw.release.python') })
    expect(result.stats.claims).toBe(CLAIM_COUNT + 4)
  })
})

describe('the gate as a command', () => {
  function run(root: string, ...args: string[]) {
    const result = spawnSync(process.execPath, [path.join(repo, 'scripts/verify-claims.ts'), '--root', root, ...args], { encoding: 'utf8' })
    return { status: result.status, out: result.stdout, err: result.stderr }
  }

  test('passes on the repo, whose lock has every pin, with no warning', () => {
    const result = run(repo, '--today', TODAY)
    expect(result.status).toBe(0)
    expect(result.out).not.toContain('pins-unchecked')
    expect(result.out).toBe(`verify:claims passed: ${REPO_COUNTS}, ${CLAIM_COUNT} claims\n`)
  })

  test('prints a warning about pins in a tree that has no lockfile', () => {
    // project() copies content/ and leaves course.lock.json behind.
    const result = run(project(), '--today', TODAY)
    expect(result.status).toBe(0)
    expect(result.out).toContain('warning pins-unchecked')
    expect(result.out).toContain(`verify:claims passed: 1 module, 1 lesson, ${CLAIM_COUNT} claims, 1 warning`)
  })

  test('lists a stale claim and still exits 0', () => {
    const result = run(repo, '--today', '2027-03-01')
    expect(result.status).toBe(0)
    expect(result.out).toContain('warning stale-claim: vllm.release.requires-python: stale since 2027-02-02')
  })

  test('fails on a derived claim that does not recompute, with the file and the line', () => {
    const root = project({ [CLAIMS]: swap('value: 2.1', 'value: 2.2') })
    const result = run(root, '--today', TODAY)
    expect(result.status).toBe(1)
    expect(result.out).toContain(`${CLAIMS}:${lineOf(claims, '- id: sample.world.decode-step-ms')}: error not-derived:`)
    expect(result.out).toContain('verify:claims failed: 1 error in 1 file')
  })

  test('a date that is not a date is a usage error', () => {
    expect(run(repo, '--today', 'tomorrow').status).toBe(2)
    expect(run(repo, '--nope').status).toBe(2)
  })
})
