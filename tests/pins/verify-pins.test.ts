/*
 * W1-T01's verify:pins (ARCHITECTURE §4.4, §10.2): the gate that holds course.lock.json to its schema and to what each kind of entry is
 * pinned by, reports a pin past its TTL and never fails on it, and names the file and the line of every problem.
 *
 *   - locateJson: the line of every value, and of a syntax error;
 *   - checkLock: each rule, as a mutation of a valid file and the findings it earns;
 *   - the command, run on trees that this file builds, and through the gate registry on the repo.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { GATES } from '../../scripts/verify.ts'
import { checkLock, formatFinding, locateJson } from '../../scripts/verify-pins.ts'
import type { Finding } from '../../scripts/verify-pins.ts'
import { fixture } from '../schema/support'

const TODAY = '2026-11-04'
const repo = path.resolve(import.meta.dirname, '../..')

/** The schema tests' valid lockfile: a pypi, a blog, a git and a dataset entry, all checked on 2026-11-03. */
type Doc = { schema: string; entries: Record<string, unknown>[] }
const valid = (): Doc => JSON.parse(fixture('course.lock.json')) as Doc
const render = (doc: unknown): string => `${JSON.stringify(doc, null, 2)}\n`

/** The 1-based line of the first line that holds `needle`, searching from line `from` on. */
function lineOf(text: string, needle: string, from = 1): number {
  const index = text.split('\n').findIndex((line, i) => i + 1 >= from && line.includes(needle))
  if (index < 0) throw new Error(`no line has "${needle}"`)
  return index + 1
}

const summary = (found: readonly Finding[]) => found.map((one) => `${one.severity} ${one.code} ${one.line}`)

describe('locateJson', () => {
  test('records the line of every key and every value, and puts a key on its own line', () => {
    const text = '{\n  "a": 1,\n  "b": [\n    true,\n    {"c": "x"}\n  ]\n}\n'
    const { value, lines } = locateJson(text)
    expect(value).toEqual({ a: 1, b: [true, { c: 'x' }] })
    expect(Object.fromEntries(lines)).toEqual({ '': 1, a: 2, b: 3, 'b.0': 4, 'b.1': 5, 'b.1.c': 5 })
  })

  test('reads strings with escapes, numbers with exponents, null and empty containers', () => {
    const { value } = locateJson('{"s": "a\\n\\u00e9\\"\\\\", "n": -1.5e2, "z": null, "o": {}, "l": []}')
    expect(value).toEqual({ s: 'a\né"\\', n: -150, z: null, o: {}, l: [] })
  })

  test('does not let a key called __proto__ change the object it belongs to', () => {
    const { value } = locateJson('{"__proto__": {"polluted": true}}')
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.keys(value as object)).toEqual(['__proto__'])
  })

  const syntax: [string, string, number, string][] = [
    ['a value that is missing', '{\n  "a": 1,\n  "b": }\n', 3, 'cannot read a value at "}"'],
    ['a colon that is missing', '{\n  "a" 1\n}', 2, 'expected ":" after a key'],
    ['a comma that is missing', '{\n  "a": 1\n  "b": 2\n}', 3, 'expected "," or "}"'],
    ['a key without quotes', '{\n  a: 1\n}', 2, 'expected a key in double quotes'],
    ['a trailing comma', '{\n  "a": 1,\n}', 3, 'expected a key in double quotes'],
    ['a string that runs past its line', '{\n  "a": "x\n}', 2, 'a string runs past the end of its line'],
    ['a string that is never closed', '{"a": "x', 1, 'a string is not closed'],
    ['an array that is never closed', '[1, 2', 1, 'expected "," or "]"'],
    ['text after the value', '{"a": 1}\n\nx', 3, 'there is text after the end of the value'],
    ['an empty file', '', 1, 'the file ends where a value was expected'],
  ]
  for (const [name, text, line, message] of syntax) {
    test(`names the line of ${name}`, () => {
      const { findings } = checkLock(text, TODAY)
      expect(findings).toEqual([{ severity: 'error', code: 'bad-json', line, message: `not valid JSON: ${message}` }])
    })
  }
})

describe('checkLock', () => {
  test('takes a valid lockfile, counts its entries and finds nothing', () => {
    expect(checkLock(render(valid()), TODAY)).toEqual({ findings: [], entries: 4 })
  })

  test('takes the schema fixture as it stands', () => {
    expect(checkLock(fixture('course.lock.json'), TODAY).findings).toEqual([])
  })

  /**
   * Each case changes one thing in the valid file and names the findings, as `severity code line`, on the rendered file. A line is that
   * of the key or the entry the finding is about.
   */
  const cases: [string, (doc: Doc) => void, (text: string) => string[]][] = [
    [
      'an entry with neither a version nor a commit',
      (doc) => {
        delete doc.entries[0].version
        delete doc.entries[0].commit
      },
      (text) => [`error schema ${lineOf(text, '"key": "vllm"') - 1}`],
    ],
    ['a commit that is abbreviated', (doc) => void (doc.entries[0].commit = '4ba787ec'), (text) => [`error schema ${lineOf(text, '"commit": "4ba787ec"')}`]],
    ['a URL that is not https', (doc) => void (doc.entries[1].url = 'http://vllm.ai/blog'), (text) => [`error schema ${lineOf(text, '"url": "http://vllm.ai/blog"')}`]],
    ['a kind that is not listed', (doc) => void (doc.entries[2].kind = 'tarball'), (text) => [`error schema ${lineOf(text, '"kind": "tarball"')}`]],
    ['a TTL of zero', (doc) => void (doc.entries[3].ttlDays = 0), (text) => [`error schema ${lineOf(text, '"ttlDays": 0')}`]],
    ['a key in the wrong file version', (doc) => void (doc.schema = 'enginespace/lock@2'), (text) => [`error schema ${lineOf(text, '"schema"')}`]],
    ['an unknown key in an entry', (doc) => void (doc.entries[0].maintainer = 'someone'), (text) => [`error unknown-key ${lineOf(text, '"maintainer"')}`]],
    ['an unknown key in the file', (doc) => void ((doc as unknown as Record<string, unknown>).extra = 1), (text) => [`error unknown-key ${lineOf(text, '"extra"')}`]],
    [
      'a key that is pinned twice',
      (doc) => void (doc.entries[3].key = 'vllm'),
      (text) => [`error schema ${lineOf(text, '"key": "vllm"', lineOf(text, '"key": "vllm"') + 1)}`],
    ],
    [
      'a pypi entry without its version',
      (doc) => void delete doc.entries[0].version,
      (text) => [`error kind-needs ${lineOf(text, '"key": "vllm"') - 1}`],
    ],
    [
      'a git entry without its commit',
      (doc) => {
        delete doc.entries[2].commit
        doc.entries[2].version = '1'
      },
      (text) => [`error kind-needs ${lineOf(text, '"key": "nano-vllm"') - 1}`],
    ],
    [
      'a dataset without its sha256',
      (doc) => void delete doc.entries[3].sha256,
      (text) => [`error kind-needs ${lineOf(text, '"key": "example-dataset"') - 1}`],
    ],
    [
      'a model without a commit',
      (doc) => {
        doc.entries[0].kind = 'model'
        delete doc.entries[0].commit
      },
      (text) => [`error kind-needs ${lineOf(text, '"key": "vllm"') - 1}`],
    ],
    [
      'a tool without a version',
      (doc) => {
        doc.entries[0].kind = 'tool'
        delete doc.entries[0].version
      },
      (text) => [`error kind-needs ${lineOf(text, '"key": "vllm"') - 1}`],
    ],
    ['a check date in the future', (doc) => void (doc.entries[0].checkedAt = '2026-11-06'), (text) => [`error future-date ${lineOf(text, '"checkedAt": "2026-11-06"')}`]],
  ]
  for (const [name, change, expected] of cases) {
    test(`reports ${name}`, () => {
      const doc = valid()
      change(doc)
      const text = render(doc)
      expect(summary(checkLock(text, TODAY).findings)).toEqual(expected(text))
    })
  }

  test('takes a blog entry that is pinned by a commit alone, and a tool that is pinned by a version alone', () => {
    const doc = valid()
    doc.entries.push({ key: 'nsys', kind: 'tool', name: 'Nsight Systems', version: '2026.5.1', url: 'https://developer.nvidia.com/nsight-systems/get-started', checkedAt: '2026-11-04', ttlDays: 60, notes: '' })
    expect(checkLock(render(doc), TODAY)).toEqual({ findings: [], entries: 5 })
  })

  test('takes tomorrow as a check date, because of time zones, and not the day after', () => {
    const doc = valid()
    doc.entries[0].checkedAt = '2026-11-05'
    expect(checkLock(render(doc), TODAY).findings).toEqual([])
    doc.entries[0].checkedAt = '2026-11-06'
    expect(summary(checkLock(render(doc), TODAY).findings)).toHaveLength(1)
  })

  test('names the day an entry went stale, as a warning on its check date', () => {
    const doc = valid()
    const text = render(doc)
    // vllm and nano-vllm were checked on 2026-11-03 with a TTL of 90 days, so they are fresh through 2027-02-01 and stale from the 2nd.
    // The other two have a TTL of 365 days.
    expect(checkLock(text, '2027-02-01').findings).toEqual([])
    const stale = checkLock(text, '2027-02-02').findings
    const vllmAt = lineOf(text, '"checkedAt"')
    const nanoAt = lineOf(text, '"checkedAt"', lineOf(text, '"key": "nano-vllm"'))
    expect(stale).toEqual([
      { severity: 'warning', code: 'stale-pin', line: vllmAt, message: 'vllm: stale since 2027-02-01 (checked 2026-11-03, good for 90 days)' },
      { severity: 'warning', code: 'stale-pin', line: nanoAt, message: 'nano-vllm: stale since 2027-02-01 (checked 2026-11-03, good for 90 days)' },
    ])
    expect(formatFinding(stale[0])).toBe(`course.lock.json:${vllmAt}: warning stale-pin: vllm: stale since 2027-02-01 (checked 2026-11-03, good for 90 days)`)
    // A year on, every entry is stale.
    expect(checkLock(text, '2027-11-04').findings.map((one) => one.code)).toEqual(['stale-pin', 'stale-pin', 'stale-pin', 'stale-pin'])
  })

  test('sorts what it finds by line', () => {
    const doc = valid()
    doc.entries[3].checkedAt = '2026-11-09'
    delete doc.entries[0].version
    const found = checkLock(render(doc), TODAY).findings
    expect(found.map((one) => one.line)).toEqual([...found.map((one) => one.line)].sort((a, b) => a - b))
    expect(found.map((one) => one.code)).toEqual(['kind-needs', 'future-date'])
  })
})

describe('the command', () => {
  const scratch: string[] = []
  afterAll(() => {
    for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
  })

  /** A tree with the given lockfile text, or none. */
  function tree(lock: string | null): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'enginespace-pins-'))
    scratch.push(dir)
    if (lock !== null) writeFileSync(path.join(dir, 'course.lock.json'), lock)
    return dir
  }
  function run(...args: string[]) {
    const result = spawnSync(process.execPath, [path.join(repo, 'scripts/verify-pins.ts'), ...args], { encoding: 'utf8' })
    return { status: result.status, out: result.stdout, err: result.stderr }
  }

  test('passes on a valid file and says how many entries it checked', () => {
    const result = run('--root', tree(render(valid())), '--today', TODAY)
    expect(result).toEqual({ status: 0, out: 'verify:pins passed: 4 entries\n', err: '' })
  })

  test('counts warnings in its summary and still passes', () => {
    const result = run('--root', tree(render(valid())), '--today', '2027-06-01')
    expect(result.status).toBe(0)
    expect(result.out).toContain('course.lock.json:11: warning stale-pin: vllm: stale since 2027-02-01')
    expect(result.out).toMatch(/verify:pins passed: 4 entries, 2 warnings\n$/)
  })

  test('fails with the file and the line of each error, and counts them', () => {
    const doc = valid()
    doc.entries[0].commit = 'abc'
    doc.entries[3].ttlDays = 0
    const text = render(doc)
    const result = run('--root', tree(text), '--today', TODAY)
    expect(result.status).toBe(1)
    expect(result.out).toContain(`course.lock.json:${lineOf(text, '"commit": "abc"')}: error schema: entries.0.commit: must be a full 40-digit lowercase commit SHA\n`)
    expect(result.out).toContain(`course.lock.json:${lineOf(text, '"ttlDays": 0')}: error schema: entries.3.ttlDays:`)
    expect(result.out).toMatch(/verify:pins failed: 2 errors in course\.lock\.json\n$/)
  })

  test('fails on text that is not JSON, at the line of the mistake', () => {
    const result = run('--root', tree('{\n  "schema": "enginespace/lock@1",\n  "entries": [,]\n}\n'), '--today', TODAY)
    expect(result.status).toBe(1)
    expect(result.out).toContain('course.lock.json:3: error bad-json: not valid JSON: cannot read a value at ","\n')
  })

  test('fails on a tree that has no lockfile', () => {
    const result = run('--root', tree(null), '--today', TODAY)
    expect(result.status).toBe(1)
    expect(result.out).toContain('course.lock.json:1: error missing-file:')
    expect(result.out).toMatch(/verify:pins failed: 1 error in course\.lock\.json\n$/)
  })

  test('refuses an unknown option, a root with no folder and a date that is not a date, with status 2', () => {
    for (const args of [['--nope'], ['--root'], ['somewhere'], ['--today', 'tomorrow'], ['--today', '2026-02-31'], ['--today', '2026-13-45'], ['--today']]) {
      const result = run(...args)
      expect([args, result.status]).toEqual([args, 2])
      expect(result.err).toContain('usage: bun scripts/verify-pins.ts [--root <dir>] [--today YYYY-MM-DD]')
    }
  })
})

describe('through the gate registry', () => {
  function registry(...args: string[]) {
    const result = spawnSync(process.execPath, [path.join(repo, 'scripts/verify.ts'), ...args], { encoding: 'utf8' })
    return { status: result.status, out: result.stdout }
  }

  test('verify:pins is wired to its script, and W1-T01 builds it', () => {
    expect(GATES.pins.stage).toBe('source')
    expect(GATES.pins.parts).toEqual([{ task: 'W1-T01', script: 'scripts/verify-pins.ts', args: [] }])
  })

  test('is live in the registry and passes on the repo, whose lockfile it reads', () => {
    expect(registry('list').out.split('\n').find((line) => line.startsWith('pins '))).toMatch(/^pins +source +live +W1-T01 +scripts\/verify-pins\.ts$/)
    const result = registry('pins')
    expect(result.status).toBe(0)
    expect(result.out).toContain('$ bun scripts/verify-pins.ts')
    expect(result.out).toMatch(/verify:pins passed: \d+ entries/)
    expect(result.out).not.toContain('pending')
  })
})
