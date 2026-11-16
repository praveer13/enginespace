/*
 * W2-T01's `receipt@1` (ARCHITECTURE §9.6, ASSESSMENT §5.4): the zod schema that the grader's JSON Schema is written from.
 *
 *   - It is the outline of A§9.6: the tests read that outline and ASSESSMENT's table of fields, so a field added to a document and not to
 *     the schema, or the reverse, fails here. The three places where the schema departs from the outline are named and held.
 *   - Every object is strict, at every level, so a receipt with a hostname, a user name or a serial number in it has a key that no field
 *     allows (A§9.5, "never collected"): the tests put such keys in each object and none is taken. Only `ext` and the claimed summary of a
 *     performance run take any key.
 *   - What JSON Schema cannot say is checked here: the lab is the stage's, the artifacts differ, `onPin` follows `offPin`.
 *   - A length counts code points, as JSON Schema's maxLength does, and a text is plain.
 */
import { describe, expect, test } from 'bun:test'
import { ARTIFACT_KINDS, ASSISTED_LEVELS, CHECK_KINDS, GUARD_STATES, HOST_KINDS, INPUT_KINDS, NOTES_MAX_CHARS, PERFORMANCE_KINDS, RECEIPT_LIMITS, RECEIPT_SCHEMA_TAG, artifactEntrySchema, checkSchema, environmentSchema, inputSchema, receiptSchema } from '@es/schema/receipt'
import { canonicalJson } from '../../packages/sim/core/json'
import { sampleReceipt, sha256 } from './receipt-support'
import { between, fieldsOf, keyRoles, objectPaths, problems, read, withKey } from './support'
import type { Path } from './support'

const architecture = read('docs/ARCHITECTURE.md')
const assessment = read('docs/ASSESSMENT.md')
const outline = between(architecture, '```yaml\n$id: enginespace/receipt@1', '```')
const sample = sampleReceipt()

/** The `a|b|c` after a field's colon in the outline, as the list. */
const alternatives = (detail: string): string[] => detail.split('|').map((one) => one.trim())

describe("A§9.6's outline", () => {
  const required = /required: \[([^\]]*)\]/.exec(outline)?.[1].split(',').map((name) => name.trim()) ?? []
  const lines = outline.split('\n')
  /** The field of the outline at the top level: its name and what follows, with continuation lines joined to it. */
  const top = new Map<string, string>()
  for (const [i, line] of lines.entries()) {
    const found = /^ {2}([a-zA-Z]+): +(.*)$/.exec(line)
    if (found === null) continue
    let detail = found[2]
    for (let next = i + 1; next < lines.length && /^ {4,}\S/.test(lines[next]); next += 1) detail += ` ${lines[next].trim()}`
    top.set(found[1], detail)
  }

  test('lists the top-level fields in the order of the schema, and names the required ones that the schema requires', () => {
    expect([...top.keys()]).toEqual(Object.keys(receiptSchema.shape))
    expect(required).toHaveLength(12)
    expect(keyRoles(receiptSchema, sample)).toEqual({ required: [...required].sort(), optional: ['ext', 'notes', 'performance'] })
  })

  test('names the schema tag, and the lab and stage patterns that the schema applies', () => {
    expect(top.get('schema')).toContain(RECEIPT_SCHEMA_TAG)
    const lab = receiptSchema.shape.lab
    const stage = receiptSchema.shape.stage
    for (const [schema, example] of [[lab, 'tr8.replay'], [stage, 'tr8.replay.s1']] as const) expect(schema.safeParse(example).success).toBe(true)
    expect(lab.safeParse('tr8.replay.s1').success).toBe(false)
    expect(stage.safeParse('tr8.replay').success).toBe(false)
    expect(top.get('lab')).toContain('^(tr[0-8][ab]?|capstone)')
    expect(top.get('stage')).toContain('\\.s[0-9]+$')
  })

  test('gives the fields of inputs, artifacts, checks, the challenge, the grader and the pins, and the schema has them and the optional marks', () => {
    const roles = (shape: string, schema: Parameters<typeof keyRoles>[0], value: object) => {
      const fields = fieldsOf(shape)
      return { names: fields.map((field) => field.name).sort(), optional: fields.filter((field) => field.optional).map((field) => field.name).sort(), roles: keyRoles(schema, value) }
    }
    const shapeOf = (key: string) => /(\{.*\})/.exec((top.get(key) ?? '').replace(/^\[/, '').replace(/\]\s*(#.*)?$/, '').replace(/\s+#.*$/, ''))?.[1] ?? ''
    for (const [key, schema, value] of [
      ['inputs', inputSchema, sample.inputs[0]],
      ['artifacts', artifactEntrySchema, sample.artifacts[0]],
      ['checks', checkSchema, { ...sample.checks[0], tolerance: 0.001 }],
    ] as const) {
      const found = roles(shapeOf(key), schema, value)
      expect([key, found.names]).toEqual([key, [...found.roles.required, ...found.roles.optional].sort()])
      expect([key, found.optional]).toEqual([key, found.roles.optional])
    }
    expect(fieldsOf(shapeOf('challenge')).map((field) => field.name)).toEqual(Object.keys(receiptSchema.shape.challenge.shape))
    expect(fieldsOf(shapeOf('grader')).map((field) => field.name)).toEqual(Object.keys(receiptSchema.shape.grader.shape))
    expect(fieldsOf(shapeOf('pins')).map((field) => field.name)).toEqual(Object.keys(receiptSchema.shape.pins.shape))
  })

  test('lists the kinds, the provenance values and the cap on notes that the schema has', () => {
    const kind = (key: string) => alternatives(/kind: ([a-z|-]+)/.exec(top.get(key) ?? '')?.[1] ?? '')
    expect(kind('inputs')).toEqual([...INPUT_KINDS])
    expect(kind('artifacts')).toEqual([...ARTIFACT_KINDS])
    expect(kind('checks')).toEqual([...CHECK_KINDS])
    expect(kind('performance')).toEqual([...PERFORMANCE_KINDS])
    const provenance = top.get('provenance') ?? ''
    expect(alternatives(/assisted: ([a-z|]+)/.exec(provenance)?.[1] ?? '')).toEqual([...ASSISTED_LEVELS])
    expect(alternatives(/guard: ([a-z|]+)/.exec(provenance)?.[1] ?? '')).toEqual([...GUARD_STATES])
    expect(top.get('notes')).toContain(`maxLength: ${NOTES_MAX_CHARS}`)
    expect(NOTES_MAX_CHARS).toBe(2000)
  })

  test('puts the environment as §9.5 collects it, and departs from the outline in three places that are held here', () => {
    const fields = fieldsOf(/(\{.*\})/.exec(top.get('environment') ?? '')?.[1] ?? '')
    expect(fields.map((field) => field.name.replace(/\[\]$/, ''))).toEqual(Object.keys(environmentSchema.shape))
    // The outline marks engineConfig alone as optional. The schema also lets a lab that runs no GPU and no engine (TR0, on the CPU) leave out the driver and the engine.
    expect(fields.filter((field) => field.optional).map((field) => field.name)).toEqual(['engineConfig'])
    expect(keyRoles(environmentSchema, sample.environment).optional).toEqual(['driver', 'engine', 'engineConfig'])
    // And the GPU list may be empty, which a CPU receipt needs.
    expect(environmentSchema.safeParse({ ...sample.environment, gpus: [], driver: undefined, engine: undefined, engineConfig: undefined }).success).toBe(true)
  })

  test('takes the host kinds that A§9.5 lists for a self-declared host, and the environment variables it allows', () => {
    const section = between(architecture, '### 9.5 Environment fingerprint', '### 9.6')
    const kinds = /Self-declared:\*\* a host kind \(([^)]*)\)/.exec(section)?.[1] ?? ''
    expect([...kinds.matchAll(/`([a-z]+)`/g)].map((found) => found[1])).toEqual([...HOST_KINDS])
    expect(section).toContain('named `VLLM_*` and `SGLANG_*` variables')
  })

  test("follows ASSESSMENT §5.4's table of fields, in its order", () => {
    const table = between(assessment, '| Field | Holds | Used for |', '## 5.5').split('\n').filter((line) => line.startsWith('| `'))
    const named = table.flatMap((line) => [...(/^\| ([^|]*) \|/.exec(line)?.[1] ?? '').matchAll(/`([^`]+)`/g)].map((found) => found[1].replace(/\[\]$/, '')))
    expect(named).toEqual(Object.keys(receiptSchema.shape))
  })
})

describe('a receipt', () => {
  test('that the sample builds is taken, and holds a number of each kind of entry that the caps allow', () => {
    expect(receiptSchema.safeParse(sample).success).toBe(true)
    expect(sample.artifacts.length).toBeLessThanOrEqual(RECEIPT_LIMITS.artifacts)
    expect(sample.checks.length).toBeLessThanOrEqual(RECEIPT_LIMITS.checks)
  })

  test('is canonical JSON, and a copy of it through JSON.parse has the same hash', () => {
    const text = canonicalJson(sample)
    expect(sha256(canonicalJson(JSON.parse(text)))).toBe(sha256(text))
    expect(sha256(text)).toMatch(/^[0-9a-f]{64}$/)
  })

  test('that leaves out the optional parts is taken: a CPU receipt has no GPU, no driver and no engine', () => {
    const cpu = structuredClone(sample) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any -- the test deletes members of a typed receipt
    cpu.environment.gpus = []
    for (const key of ['driver', 'engine', 'engineConfig']) delete cpu.environment[key]
    for (const key of ['performance', 'notes', 'ext']) delete cpu[key]
    expect(receiptSchema.safeParse(cpu).success).toBe(true)
  })
})

describe('every object is strict', () => {
  /** The objects that take any key: the extension, the claimed summary and the variables, which a pattern holds to their names. */
  const open = (path: Path): boolean => path[0] === 'ext' || (path[0] === 'performance' && path[1] === 'claimed') || (path[0] === 'environment' && path[1] === 'envVars')

  test('an unknown key in any object of the receipt is refused, and it is the unknown key that is named', () => {
    const paths = objectPaths(sample).filter((path) => !open(path))
    expect(paths.length).toBeGreaterThan(15)
    for (const path of paths) {
      const bad = withKey(sample, [...path, 'zzz'], 1)
      expect([path.join('.'), problems(receiptSchema, bad)]).toEqual([path.join('.'), [`${path.length === 0 ? '(root)' : path.join('.')}: unrecognized_keys[zzz]`]])
    }
  })

  test('the keys that §9.5 says are never collected are refused wherever they are put', () => {
    const never = ['hostname', 'host', 'user', 'username', 'ip', 'ipAddress', 'mac', 'macAddress', 'uuid', 'gpuUuid', 'serial', 'serialNumber', 'path', 'cwd', 'home', 'token', 'hfToken', 'env']
    const places: Path[] = [[], ['environment'], ['environment', 'host'], ['environment', 'gpus', 0], ['environment', 'driver'], ['environment', 'torch'], ['environment', 'engine'], ['grader'], ['inputs', 0], ['pins']]
    for (const place of places) {
      for (const key of never) {
        if (place.length === 1 && place[0] === 'environment' && key === 'host') continue // the host is a field of the environment
        expect([place.join('.'), key, receiptSchema.safeParse(withKey(sample, [...place, key], 'x')).success]).toEqual([place.join('.'), key, false])
      }
    }
  })

  test('the extension and the claimed summary take any key and any JSON, and are part of the receipt’s hash', () => {
    const open1 = withKey(sample, ['ext', 'anything'], { nested: [1, 2.5, 'x', null, true] })
    const open2 = withKey(sample, ['performance', 'claimed', 'p99Ms'], 12.5)
    expect(receiptSchema.safeParse(open1).success).toBe(true)
    expect(receiptSchema.safeParse(open2).success).toBe(true)
    expect(sha256(canonicalJson(open1))).not.toBe(sha256(canonicalJson(sample)))
  })
})

describe('what the environment may hold', () => {
  const vars = (value: Record<string, string>) => receiptSchema.safeParse(withKey(sample, ['environment', 'envVars'], value)).success

  test('variables are VLLM_* and SGLANG_* only, so a token or a path never gets in', () => {
    expect(vars({ VLLM_ATTENTION_BACKEND: 'FLASH_ATTN', SGLANG_ENABLE_X: '1', VLLM_A1_B2: 'x' })).toBe(true)
    expect(vars({})).toBe(true)
    for (const name of ['HF_TOKEN', 'PATH', 'HOME', 'USER', 'vllm_x', 'VLLM_', 'VLLMX_Y', 'SGLANG', 'VLLM_x', 'XVLLM_A', 'CUDA_VISIBLE_DEVICES', 'VLLM-A']) {
      expect([name, vars({ [name]: 'x' })]).toEqual([name, false])
    }
  })

  test('a variable’s value is one line of at most 256 characters', () => {
    expect(vars({ VLLM_A: 'x'.repeat(256) })).toBe(true)
    expect(vars({ VLLM_A: 'x'.repeat(257) })).toBe(false)
    expect(vars({ VLLM_A: 'a\nb' })).toBe(false)
    expect(vars({ VLLM_A: '' })).toBe(true)
  })

  test('at most 64 variables [estimated]', () => {
    const many = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`VLLM_V${i}`, '1']))
    expect(vars(many(RECEIPT_LIMITS.envVars))).toBe(true)
    expect(vars(many(RECEIPT_LIMITS.envVars + 1))).toBe(false)
  })

  test('a GPU needs its name and its memory, and the rest is left out where it could not be read', () => {
    const gpu = (value: object) => environmentSchema.safeParse({ ...sample.environment, gpus: [value] }).success
    expect(gpu({ name: 'Example GPU', memoryBytes: 1 })).toBe(true)
    expect(gpu({ name: 'Example GPU' })).toBe(false)
    expect(gpu({ memoryBytes: 1 })).toBe(false)
    expect(gpu({ name: 'Example GPU', memoryBytes: 1, computeCapability: '9.0', mig: 'enabled', ecc: 'unsupported', virtualization: 'vgpu' })).toBe(true)
    expect(gpu({ name: 'Example GPU', memoryBytes: 1, computeCapability: '9' })).toBe(false)
    expect(gpu({ name: 'Example GPU', memoryBytes: 1, mig: 'maybe' })).toBe(false)
    expect(gpu({ name: 'Example GPU', memoryBytes: 1.5 })).toBe(false)
    expect(gpu({ name: 'Example GPU', memoryBytes: 0 })).toBe(false)
    expect(gpu({ name: 'Example GPU', memoryBytes: 1, uuid: 'GPU-1234' })).toBe(false)
  })

  test('at most 16 GPUs and 32 libraries [estimated]', () => {
    const gpu = { name: 'Example GPU', memoryBytes: 1 }
    expect(environmentSchema.safeParse({ ...sample.environment, gpus: Array.from({ length: 16 }, () => gpu) }).success).toBe(true)
    expect(environmentSchema.safeParse({ ...sample.environment, gpus: Array.from({ length: 17 }, () => gpu) }).success).toBe(false)
    const libs = (count: number) => Array.from({ length: count }, (_, i) => ({ name: `lib${i}`, version: '1.0' }))
    expect(environmentSchema.safeParse({ ...sample.environment, libs: libs(32) }).success).toBe(true)
    expect(environmentSchema.safeParse({ ...sample.environment, libs: libs(33) }).success).toBe(false)
  })
})

describe('what JSON Schema cannot say', () => {
  const at = (change: (value: any) => void) => { // eslint-disable-line @typescript-eslint/no-explicit-any -- the test edits a copy of a typed receipt
    const copy = structuredClone(sample)
    change(copy)
    return problems(receiptSchema, copy)
  }

  test('the lab is the lab of the stage', () => {
    expect(at((r) => (r.lab = 'tr3.other'))).toEqual(['lab: custom'])
  })

  test('the challenge’s token names this stage', () => {
    expect(at((r) => (r.stage = 'tr3.profile.s3'))).toEqual(['challenge.token: custom'])
  })

  test('artifact ids, input names, check ids, library names and off-pin entries each differ', () => {
    expect(at((r) => (r.artifacts[1].id = r.artifacts[0].id))).toEqual(['artifacts.1.id: custom'])
    expect(at((r) => (r.inputs[1].name = r.inputs[0].name))).toEqual(['inputs.1.name: custom'])
    expect(at((r) => (r.checks[1].id = r.checks[0].id))).toEqual(['checks.1.id: custom'])
    expect(at((r) => (r.environment.libs[1].name = r.environment.libs[0].name))).toEqual(['environment.libs.1.name: custom'])
    expect(at((r) => ((r.pins.onPin = false), (r.pins.offPin = ['vllm', 'vllm'])))).toEqual(['pins.offPin.1: custom'])
  })

  test('onPin is true exactly when offPin is empty', () => {
    expect(at((r) => (r.pins.onPin = false))).toEqual(['pins.onPin: custom'])
    expect(at((r) => (r.pins.offPin = ['torch']))).toEqual(['pins.onPin: custom'])
    expect(at((r) => ((r.pins.onPin = false), (r.pins.offPin = ['torch'])))).toEqual([])
  })

  test('a number that a check reports is finite, and an integer among them is below 2^53', () => {
    expect(at((r) => (r.checks[0].value = 2 ** 53))).toEqual(['checks.0.value: custom'])
    expect(at((r) => (r.checks[0].value = 1e300))).toEqual(['checks.0.value: custom'])
    expect(at((r) => (r.checks[0].bound = Number.POSITIVE_INFINITY))).toEqual(['checks.0.bound: invalid_type'])
    expect(at((r) => (r.checks[0].tolerance = Number.NaN))).toEqual(['checks.0.tolerance: invalid_type'])
    expect(at((r) => (r.checks[0].value = 0.00032))).toEqual([])
    expect(at((r) => (r.checks[0].value = 2 ** 53 - 1))).toEqual([])
    expect(at((r) => (r.checks[0].value = 1.5e-7))).toEqual([])
  })
})

describe('text', () => {
  const notes = (value: string) => receiptSchema.safeParse(withKey(sample, ['notes'], value)).success

  test('counts code points, as JSON Schema does, and not the UTF-16 units that a string’s length counts', () => {
    expect(notes('a'.repeat(2000))).toBe(true)
    expect(notes('a'.repeat(2001))).toBe(false)
    // 2,000 emoji are 4,000 UTF-16 units and 2,000 characters.
    expect(notes('\u{1F600}'.repeat(2000))).toBe(true)
    expect(notes('\u{1F600}'.repeat(2001))).toBe(false)
    expect(notes('')).toBe(true)
  })

  test('is plain: a tab and a line break may be in the notes, and no other control character, and no lone surrogate', () => {
    expect(notes('line one\n\tline two\r\n')).toBe(true)
    for (const bad of ['a\u0000b', 'a\u0007b', 'a\u001bb', 'a\u007fb', 'a\ud800b', '\udc00']) expect([bad, notes(bad)]).toEqual([bad, false])
  })

  test('names, details and formats are one line, bounded, and not empty where they name something', () => {
    const name = (value: string) => receiptSchema.safeParse(withKey(sample, ['inputs', 0, 'name'], value)).success
    expect([name('Example/model'), name(''), name('a\nb'), name('x'.repeat(128)), name('x'.repeat(129))]).toEqual([true, false, false, true, false])
    const detail = (value: string) => receiptSchema.safeParse(withKey(sample, ['checks', 0, 'detail'], value)).success
    expect([detail(''), detail('a\nb'), detail('x'.repeat(1000)), detail('x'.repeat(1001))]).toEqual([true, true, true, false])
    const format = (value: string) => receiptSchema.safeParse(withKey(sample, ['artifacts', 0, 'format'], value)).success
    expect([format('json'), format('text/plain'), format('enginespace/trace@1'), format('JSON'), format('a b'), format(''), format('a'.repeat(65))]).toEqual([true, true, true, false, false, false, false])
  })

  test('ids are lower-case words joined by single dots, hyphens or underscores', () => {
    const id = (value: string) => receiptSchema.safeParse(withKey(sample, ['artifacts', 0, 'id'], value)).success
    for (const good of ['trace', 'bench-log', 'tr3.profile.log', 'a_b', 'a1']) expect([good, id(good)]).toEqual([good, true])
    for (const bad of ['', 'Trace', '-a', 'a-', 'a--b', 'a b', '__proto__', 'a/b', 'x'.repeat(65)]) expect([bad, id(bad)]).toEqual([bad, false])
  })
})

describe('moments and versions', () => {
  const when = (value: string) => receiptSchema.safeParse(withKey(sample, ['createdAt'], value)).success

  test('createdAt is a UTC date-time that exists, with Z and an optional fraction', () => {
    for (const good of ['2026-11-09T12:30:00Z', '2026-11-09T12:30:00.5Z', '2024-02-29T23:59:59.123456789Z', '0001-01-01T00:00:00Z']) expect([good, when(good)]).toEqual([good, true])
    for (const bad of ['2026-11-09T12:30:00', '2026-11-09T12:30:00+00:00', '2026-11-09 12:30:00Z', '2026-11-09T24:00:00Z', '2026-11-09T12:60:00Z', '2026-11-09T12:30:60Z', '2026-13-09T12:30:00Z', '2023-02-29T12:00:00Z', '2026-11-09T12:30:00.Z', '2026-11-09T12:30:00.1234567890Z', '2026-11-09', '']) {
      expect([bad, when(bad)]).toEqual([bad, false])
    }
  })

  test('a version starts with a digit and is made of the characters that packages and drivers use', () => {
    const version = (value: string) => receiptSchema.safeParse(withKey(sample, ['grader', 'version'], value)).success
    for (const good of ['0.1.0', '2.14.0+cu130', '0.7.2.post1', '580.82.07', '1', '3.12.7rc1']) expect([good, version(good)]).toEqual([good, true])
    for (const bad of ['', 'v1.0', 'latest', '1 0', '1.0\n', ' 1.0', 'x'.repeat(65)]) expect([bad, version(bad)]).toEqual([bad, false])
  })

  test('a hash is 64 lower-case hex digits, and the grader is the one grader there is', () => {
    const hash = (value: string) => receiptSchema.safeParse(withKey(sample, ['grader', 'sourceSha256'], value)).success
    expect([hash('a'.repeat(64)), hash('A'.repeat(64)), hash('a'.repeat(63)), hash(`${'a'.repeat(64)}\n`)]).toEqual([true, false, false, false])
    expect(receiptSchema.safeParse(withKey(sample, ['grader', 'name'], 'other-grader')).success).toBe(false)
  })
})
