/*
 * W0-T07's acceptance check 1, for `course.lock.json` (ARCHITECTURE §4.4, D-035): the schema rejects unknown keys and takes an
 * entry as §4.4 shapes it. The tests read §4.4 itself, so a key added to the document and not to the schema fails here.
 */
import { describe, expect, test } from 'bun:test'
import { LOCK_KINDS, lockEntrySchema, lockFileSchema } from '@es/schema/lock'
import { between, fieldsOf, fixture, keyRoles, objectPaths, problems, read, where, withKey } from './support'
import type { Path } from './support'

const architecture = read('docs/ARCHITECTURE.md')
const section = between(architecture, '**`course.lock.json`**', '**Why vLLM and SGLang each get their own environment.**')

const file = JSON.parse(fixture('course.lock.json')) as { schema: string; entries: Record<string, unknown>[] }
const [vllm, insideVllm, nanoVllm, dataset] = file.entries

describe("ARCHITECTURE §4.4's entry", () => {
  const shape = /`(\{key, kind[^`]*\})`/.exec(section)?.[1]
  if (shape === undefined) throw new Error('§4.4 no longer shows the lock entry’s shape')
  const fields = fieldsOf(shape)

  test('the schema has the keys §4.4 lists, and no others', () => {
    // "version|commit" is two keys, of which an entry has at least one.
    const listed = fields.flatMap((field) => field.name.split('|'))
    expect(listed.sort()).toEqual(['checkedAt', 'commit', 'key', 'kind', 'name', 'notes', 'sha256', 'ttlDays', 'url', 'version'])
    expect(Object.keys({ ...vllm, ...dataset }).sort()).toEqual(listed.sort())
  })

  test('only sha256 is marked optional, and a version or a commit stands in for the pair', () => {
    expect(fields.filter((field) => field.optional).map((field) => field.name)).toEqual(['sha256'])
    expect(fields.find((field) => field.name === 'version|commit')).toBeDefined()
    expect(keyRoles(lockEntrySchema, { ...vllm, sha256: dataset.sha256 })).toEqual({
      required: ['checkedAt', 'key', 'kind', 'name', 'notes', 'ttlDays', 'url'],
      // Either of version and commit can go while the other stays.
      optional: ['commit', 'sha256', 'version'],
    })
  })

  test('the kinds are the ones §4.4 lists, in its order', () => {
    const detail = fields.find((field) => field.name === 'kind')?.detail
    expect(detail?.split('|')).toEqual([...LOCK_KINDS])
  })
})

describe('the fixture file', () => {
  test('is a lockfile, with the pins D-035 proposes', () => {
    const parsed = lockFileSchema.parse(file)
    expect(parsed.entries.map((entry) => entry.key)).toEqual(['vllm', 'inside-vllm', 'nano-vllm', 'example-dataset'])
    expect(parsed.entries.map((entry) => entry.kind)).toEqual(['pypi', 'blog', 'git', 'dataset'])
  })

  test('the commits in it are the ones DECISIONS.md D-035 records', () => {
    const decisions = read('docs/DECISIONS.md')
    for (const entry of [vllm, insideVllm, nanoVllm]) expect(decisions).toContain(entry.commit as string)
  })

  test('the dataset’s SHA-256 is that of the word example', async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('example'))
    expect(Buffer.from(digest).toString('hex')).toBe(dataset.sha256 as string)
  })
})

describe('every object rejects an unknown key', () => {
  test('the file', () => {
    expect(problems(lockFileSchema, file)).toEqual([])
    for (const path of objectPaths(file)) {
      expect(problems(lockFileSchema, withKey(file, [...path, 'zzz'], true))).toEqual([`${where(path)}: unrecognized_keys[zzz]`])
    }
  })

  test('an entry', () => {
    for (const entry of [vllm, dataset]) {
      expect(problems(lockEntrySchema, entry)).toEqual([])
      expect(problems(lockEntrySchema, { ...entry, zzz: 1 })).toEqual(['(root): unrecognized_keys[zzz]'])
    }
  })
})

describe('entries', () => {
  const cases: [string, Path, unknown, string[]][] = [
    ['a key in capitals', ['key'], 'VLLM', ['key: invalid_format']],
    ['a key with a space', ['key'], 'vllm 0', ['key: invalid_format']],
    ['a kind that is not listed', ['kind'], 'tarball', ['kind: invalid_value']],
    ['a blank name', ['name'], ' ', ['name: invalid_format']],
    ['a blank version', ['version'], '', ['version: invalid_format']],
    ['a commit that is abbreviated', ['commit'], '4ba787ec', ['commit: invalid_format']],
    ['a commit in capitals', ['commit'], '4BA787EC9959E566D3B587A796DFF07673324DA5', ['commit: invalid_format']],
    ['a commit one digit long', ['commit'], '4ba787ec9959e566d3b587a796dff07673324da', ['commit: invalid_format']],
    ['a URL that is http', ['url'], 'http://pypi.org/project/vllm/', ['url: invalid_format']],
    ['a URL that is a path', ['url'], '/project/vllm', ['url: invalid_format']],
    ['no URL', ['url'], undefined, ['url: invalid_type']],
    ['a SHA-256 in capitals', ['sha256'], 'A'.repeat(64), ['sha256: invalid_format']],
    ['a SHA-256 of 40 digits', ['sha256'], 'a'.repeat(40), ['sha256: invalid_format']],
    ['a check date that does not exist', ['checkedAt'], '2026-13-01', ['checkedAt: invalid_format']],
    ['a TTL of 0', ['ttlDays'], 0, ['ttlDays: too_small']],
    ['a TTL as text', ['ttlDays'], '90', ['ttlDays: invalid_type']],
    ['no notes', ['notes'], undefined, ['notes: invalid_type']],
    ['notes that are not text', ['notes'], 7, ['notes: invalid_type']],
  ]
  for (const [name, path, to, expected] of cases) {
    test(`refuses ${name}`, () => expect(problems(lockEntrySchema, withKey(vllm, path, to))).toEqual(expected))
  }

  test('takes notes that are empty', () => {
    expect(problems(lockEntrySchema, { ...vllm, notes: '' })).toEqual([])
  })

  test('refuses an entry with neither a version nor a commit, and takes either alone', () => {
    const neither = withKey(withKey(vllm, ['version'], undefined), ['commit'], undefined)
    expect(problems(lockEntrySchema, neither)).toEqual(['version: custom'])
    expect(problems(lockEntrySchema, withKey(vllm, ['version'], undefined))).toEqual([])
    expect(problems(lockEntrySchema, withKey(vllm, ['commit'], undefined))).toEqual([])
  })

  test('takes a key with a dot, as qwen3-0.6b has', () => {
    expect(problems(lockEntrySchema, { ...dataset, key: 'qwen3-0.6b' })).toEqual([])
  })
})

describe('the file', () => {
  test('refuses a key pinned twice, at the second place', () => {
    expect(problems(lockFileSchema, { ...file, entries: [vllm, nanoVllm, vllm] })).toEqual(['entries.2.key: custom'])
  })

  test('takes a file with no entries', () => {
    expect(problems(lockFileSchema, { ...file, entries: [] })).toEqual([])
  })

  test('refuses a file with no schema tag, another version, no entries, or only a list', () => {
    expect(problems(lockFileSchema, withKey(file, ['schema'], undefined))).toEqual(['schema: invalid_value'])
    expect(problems(lockFileSchema, withKey(file, ['schema'], 'enginespace/lock@2'))).toEqual(['schema: invalid_value'])
    expect(problems(lockFileSchema, withKey(file, ['entries'], undefined))).toEqual(['entries: invalid_type'])
    expect(problems(lockFileSchema, file.entries)).toEqual(['(root): invalid_type'])
  })
})

describe('the invalid fixture', () => {
  test('lock-bad.json: each mistake is named', () => {
    const bad = JSON.parse(fixture('invalid/lock-bad.json'))
    expect(problems(lockFileSchema, bad)).toEqual([
      'schema: invalid_value',
      'entries.0.version: custom',
      'entries.1.kind: invalid_value',
      'entries.1.commit: invalid_format',
      'entries.1.url: invalid_format',
      'entries.1.sha256: invalid_format',
      'entries.1.checkedAt: invalid_format',
      'entries.1.ttlDays: too_small',
      'entries.1: unrecognized_keys[maintainer]',
    ])
  })
})
