/*
 * W2-T01's vectors (ARCHITECTURE §9.8, D-030) and the TypeScript side of verify:vectors.
 *
 *   Accept 2: the vectors cover seed 0, seed 0xffffffff, Unicode in canonical JSON, and floats.
 *     The tests read the committed files and count what is in them, so a vector that is dropped to make a change pass is found.
 *
 *   The files have to be right as well as be there, so the expected values meet oracles of their own:
 *     - the SHA-256 digests meet FIPS 180-4's published ones and the browser's `crypto.subtle`;
 *     - the stream meets a second implementation of splitmix32 written here in BigInt, which has no int32 to wrap;
 *     - the float bits meet a DataView, and the canonical text of a float meets what JavaScript prints.
 *   And they have to be written for a reader in another language:
 *     - the files are ASCII, and every number in them is one that both languages read alike (the lint of scripts/schemas/format.ts);
 *     - each file says how to read each of its vectors, and each vector has what its reading names.
 *   Finally the gate: it passes on the tree, and fails, naming the file, on a drift, a missing file, a stray file and a number that Python
 *   might read differently.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { VECTOR_FILES, renderVectors } from '../../scripts/schemas/vectors'
import { asciiString, numberProblems, renderVectorFile } from '../../scripts/schemas/format'
import { seedForFirstDraw } from '../../scripts/schemas/rng-vectors'
import { vectorDrift } from '../../scripts/export-schemas'
import { main as verifyVectors } from '../../scripts/verify-vectors'
import { canonicalJson } from '../../packages/sim/core/json'
import { hash32, splitmix32u } from '../../packages/sim/core/rng'
import { read, root } from './support'

interface Vector {
  id: string
  note?: string
  fn?: string
  error?: boolean
  [field: string]: any // eslint-disable-line @typescript-eslint/no-explicit-any -- a vector has the fields of its function, which the reader of each file names
}
interface File {
  spec: string
  description: string
  reading: string[]
  source: string
  oracle: string
  vectors: Vector[]
}

const NAMES = ['rng', 'subseed', 'challenge', 'canonical', 'sha256'] as const
const files = Object.fromEntries(NAMES.map((name) => [name, JSON.parse(read(`schemas/vectors/${name}.json`)) as File])) as Record<(typeof NAMES)[number], File>
const where = (name: (typeof NAMES)[number]) => files[name].vectors

const scratch: string[] = []
function copyOfSchemas(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'es-vectors-'))
  scratch.push(dir)
  cpSync(path.join(root, 'schemas'), path.join(dir, 'schemas'), { recursive: true })
  return dir
}
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
})

describe('the five files', () => {
  test('are the ones that the tracker names for W2-T01, in its order, and the only ones in the folder', () => {
    const task = /schemas\/vectors\/\{([a-z0-9,]+)\}\.json/.exec(read('docs/TRACKER.md'))?.[1].split(',')
    expect(task).toEqual([...NAMES])
    expect(VECTOR_FILES.map((entry) => entry.file)).toEqual(NAMES.map((name) => `schemas/vectors/${name}.json`))
    expect(vectorDrift(root)).toEqual([])
  })

  test('are what the builders write now, byte for byte', () => {
    for (const { file, text } of renderVectors()) expect([file, read(file) === text]).toEqual([file, true])
  })

  test('are written twice alike: the render does not depend on the clock, the order of a table or the process', () => {
    expect(renderVectors()).toEqual(renderVectors())
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/export-schemas.ts'), '--check'], { cwd: root, encoding: 'utf8' })
    expect([result.status, result.stdout.trim()]).toEqual([0, 'export-schemas: 5 schema(s), their copies in the grader, and 5 vector file(s) are what the code writes'])
  })

  test('each has a spec, a description, a reading, a source and an oracle, and vectors with ids that differ', () => {
    for (const name of NAMES) {
      const file = files[name]
      expect(file.spec).toBe(`enginespace/vectors-${name}@1`)
      for (const text of [file.description, file.source, file.oracle]) expect(text.length).toBeGreaterThan(20)
      expect(file.reading.length).toBeGreaterThanOrEqual(2)
      expect(new Set(file.vectors.map((vector) => vector.id)).size).toBe(file.vectors.length)
      expect(file.vectors.length).toBeGreaterThan(20)
      expect(Object.keys(file)).toEqual(['spec', 'description', 'reading', 'source', 'oracle', 'vectors'])
    }
  })

  test('name every function they use in their reading, so a function added without a word on how to read it fails here', () => {
    for (const name of NAMES) {
      const reading = files[name].reading.join('\n')
      for (const fn of new Set(where(name).map((vector) => vector.fn))) expect([name, fn, reading.includes(String(fn))]).toEqual([name, fn, true])
    }
  })

  test('an error vector has no answer, and any other has the fields that its function writes', () => {
    const answer: Record<string, string[]> = {
      splitmix32u: ['seed', 'draws'],
      splitmix32: ['seed', 'values', 'bits'],
      'splitmix32u-digest': ['seed', 'count', 'sha256'],
      below: ['seed', 'n', 'count', 'results', 'consumed'],
      between: ['seed', 'lo', 'hi', 'count', 'results', 'consumed'],
      chance: ['seed', 'permille', 'count', 'results', 'consumed'],
      pick: ['seed', 'items', 'count', 'results', 'consumed'],
      weighted: ['seed', 'weights', 'count', 'results', 'consumed'],
      shuffle: ['seed', 'items', 'count', 'results', 'consumed'],
      hash32: ['text', 'hash', 'hex'],
      rngFor: ['seed', 'salt', 'hash', 'mixed', 'draws'],
      token: ['token', 'stage', 'seed', 'seedHex', 'nonce', 'issuedOn', 'body', 'checksum', 'firstDraws'],
      refused: ['token'],
      object: ['value', 'valid'],
      canonical: ['input', 'canonical', 'utf8Bytes', 'sha256'],
      sha256: ['bytes', 'sha256'],
      artifact: ['encoding', 'data', 'bytes', 'sha256'],
    }
    for (const name of NAMES) {
      for (const vector of where(name)) {
        const wanted = answer[vector.fn ?? '']
        expect([vector.id, wanted !== undefined]).toEqual([vector.id, true])
        const keys = new Set(Object.keys(vector))
        if (vector.error === true) {
          for (const result of ['results', 'consumed', 'draws', 'canonical', 'sha256', 'utf8Bytes']) expect([vector.id, result, keys.has(result)]).toEqual([vector.id, result, false])
        } else {
          for (const key of wanted) expect([vector.id, key, keys.has(key)]).toEqual([vector.id, key, true])
        }
      }
    }
  })
})

describe('Accept 2: the vectors cover seed 0, seed 0xffffffff, Unicode in canonical JSON and floats', () => {
  const seedsOf = (name: (typeof NAMES)[number]) => new Set(where(name).filter((vector) => typeof vector.seed === 'number').map((vector) => vector.seed as number))

  test('seed 0 and seed 0xffffffff are in the generator’s vectors, its sub-streams and the challenge tokens', () => {
    for (const name of ['rng', 'subseed', 'challenge'] as const) {
      expect([name, seedsOf(name).has(0)]).toEqual([name, true])
      expect([name, seedsOf(name).has(0xffffffff)]).toEqual([name, true])
    }
    // Every function of the generator is run on both.
    for (const fn of ['splitmix32u', 'splitmix32', 'splitmix32u-digest', 'below', 'between', 'chance', 'pick', 'weighted', 'shuffle']) {
      const ofFn = where('rng').filter((vector) => vector.fn === fn).map((vector) => vector.seed)
      expect([fn, ofFn.includes(0), ofFn.includes(0xffffffff)]).toEqual([fn, true, true])
    }
    const tokens = where('challenge').filter((vector) => vector.fn === 'token')
    expect(tokens.map((vector) => vector.seedHex)).toEqual(expect.arrayContaining(['00000000', 'ffffffff', '80000000', '7fffffff']))
  })

  test('the seeds at the edges of a signed 32-bit integer are in too, with the float stream and a long run', () => {
    const seeds = seedsOf('rng')
    for (const seed of [0x7fffffff, 0x80000000, 0xfffffffe, 1]) expect([seed, seeds.has(seed)]).toEqual([seed, true])
    expect(where('rng').some((vector) => vector.fn === 'splitmix32u-digest' && vector.count >= 100000)).toBe(true)
    expect(where('rng').filter((vector) => vector.fn === 'splitmix32')).toHaveLength(3)
  })

  test('Unicode is in the canonical JSON: accented, CJK and astral characters, surrogate pairs, control characters, keys in UTF-16 order and lone surrogates', () => {
    const canonical = where('canonical')
    const inputs = canonical.map((vector) => vector.input as string)
    const outputs = canonical.filter((vector) => vector.error !== true).map((vector) => vector.canonical as string)
    const codePoints = (text: string) => [...text].map((char) => char.codePointAt(0) as number)
    expect(outputs.some((text) => codePoints(text).some((cp) => cp >= 0x80 && cp <= 0x7ff))).toBe(true)
    expect(outputs.some((text) => codePoints(text).some((cp) => cp >= 0x800 && cp <= 0xffff))).toBe(true)
    expect(outputs.some((text) => codePoints(text).some((cp) => cp >= 0x10000))).toBe(true)
    expect(inputs.some((text) => /\\ud83d\\ude00/.test(text))).toBe(true)
    expect(inputs.some((text) => codePoints(text).some((cp) => cp >= 0x10000))).toBe(true)
    expect(outputs.some((text) => /\\u001f/.test(text))).toBe(true)
    // Keys: one case where UTF-16 order and code point order differ.
    const order = canonical.find((vector) => vector.id === 'keys-utf16-order-not-code-point-order')
    expect(order).toBeDefined()
    const keys = Object.keys(JSON.parse(order?.canonical as string) as object)
    expect(keys.map((key) => key.codePointAt(0))).toEqual([0x1f600, 0xe000, 0xff5e])
    // By code point (Python's sorted() on a str) the order is the other one.
    expect([...keys].sort((a, b) => (a.codePointAt(0) as number) - (b.codePointAt(0) as number)).map((key) => key.codePointAt(0))).toEqual([0xe000, 0xff5e, 0x1f600])
    // Lone surrogates have no canonical form.
    const lone = canonical.filter((vector) => /lone|reversed|high-then/.test(vector.id))
    expect(lone.length).toBeGreaterThanOrEqual(5)
    expect(lone.every((vector) => vector.error === true)).toBe(true)
    // The hash of "é" composed and decomposed differ: text is not normalised.
    const hash = (id: string) => canonical.find((vector) => vector.id === id)?.sha256
    expect(hash('str-e-acute')).toBeDefined()
    expect(hash('str-e-acute')).not.toBe(hash('str-e-then-accent'))
  })

  test('floats are in the canonical JSON, with the bits of each double: fractions, the shortest digits, and both sides of the exponent switch at 1e-6 and 1e-7', () => {
    const canonical = where('canonical')
    const floats = canonical.filter((vector) => typeof vector.bits === 'string')
    expect(floats.length).toBeGreaterThanOrEqual(40)
    const fractions = floats.filter((vector) => !Number.isInteger(Number(vector.canonical)))
    expect(fractions.length).toBeGreaterThanOrEqual(30)
    const byInput = (input: string) => canonical.find((vector) => vector.input === input)?.canonical
    expect([byInput('0.000001'), byInput('0.0000001'), byInput('1e-7'), byInput('5e-324'), byInput('0.1')]).toEqual(['0.000001', '1e-7', '1e-7', '5e-324', '0.1'])
    expect(byInput('0.30000000000000004')).toBe('0.30000000000000004')
    expect(byInput('1.0')).toBe('1')
    expect(byInput('-0.0')).toBe('0')
    expect(byInput('-0')).toBe('0')
    // The float stream of the generator, and a float among the values of the other files.
    expect(where('rng').filter((vector) => vector.fn === 'splitmix32').every((vector) => vector.values.every((value: number) => value >= 0 && value < 1))).toBe(true)
    // Past 2^53 a number has no canonical form, written as an integer or as a fraction.
    for (const id of ['int-beyond-2^53', 'int-2^53-plus-1', 'int-1e21', 'largest-double', 'overflow-to-infinity']) expect(canonical.find((vector) => vector.id === id)?.error).toBe(true)
    expect(canonical.find((vector) => vector.id === 'int-largest-safe')?.canonical).toBe('9007199254740991')
  })
})

describe('the expected values meet oracles of their own', () => {
  test('the digests of FIPS 180-4’s examples are the published ones', () => {
    const digest = (id: string) => where('sha256').find((vector) => vector.id === id)?.sha256
    expect(digest('sha256-empty')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(digest('sha256-abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(digest('sha256-nist-448-bits')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1')
    expect(digest('sha256-nist-896-bits')).toBe('cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1')
    expect(digest('sha256-million-a')).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0')
  })

  test('every digest is the one the browser’s crypto.subtle computes', async () => {
    const hex = (buffer: ArrayBuffer) => Buffer.from(buffer).toString('hex')
    for (const vector of where('sha256')) {
      if (vector.fn === 'sha256') {
        const bytes = vector.hex !== undefined ? Buffer.from(vector.hex, 'hex') : Buffer.alloc(vector.repeat.times, Buffer.from(vector.repeat.byteHex, 'hex'))
        expect(bytes.length).toBe(vector.bytes)
        expect([vector.id, hex(await crypto.subtle.digest('SHA-256', bytes))]).toEqual([vector.id, vector.sha256])
      } else if (vector.error !== true) {
        const bytes = vector.encoding === 'json' ? Buffer.from(canonicalJson(vector.data), 'utf8') : vector.encoding === 'text' ? Buffer.from(vector.data as string, 'utf8') : Buffer.from(vector.data as string, 'base64')
        expect([vector.id, bytes.length, hex(await crypto.subtle.digest('SHA-256', bytes))]).toEqual([vector.id, vector.bytes, vector.sha256])
        if (vector.bytesHex !== undefined) expect(bytes.toString('hex')).toBe(vector.bytesHex)
      }
    }
    for (const vector of where('canonical').filter((one) => one.error !== true)) {
      expect([vector.id, hex(await crypto.subtle.digest('SHA-256', Buffer.from(vector.canonical as string, 'utf8')))]).toEqual([vector.id, vector.sha256])
      expect(Buffer.byteLength(vector.canonical as string, 'utf8')).toBe(vector.utf8Bytes)
    }
  })

  test('every draw of the stream is the one a second splitmix32, written in BigInt, gives', () => {
    const MASK = 0xffffffffn
    const stream = (seed: number) => {
      let state = BigInt(seed) & MASK
      return () => {
        state = (state + 0x9e3779b9n) & MASK
        let t = state ^ (state >> 16n)
        t = (t * 0x21f0aaadn) & MASK
        t ^= t >> 15n
        t = (t * 0x735a2d97n) & MASK
        t ^= t >> 15n
        return Number(t)
      }
    }
    const fnv = (text: string) => {
      let h = 0x811c9dc5n
      for (const char of text) h = ((h ^ BigInt(char.charCodeAt(0))) * 0x01000193n) & MASK
      return Number(h)
    }
    for (const vector of where('rng').filter((one) => one.fn === 'splitmix32u')) {
      const next = stream(vector.seed)
      expect([vector.id, vector.draws.map(() => next())]).toEqual([vector.id, vector.draws])
    }
    for (const vector of where('subseed').filter((one) => one.fn === 'rngFor' && one.error !== true)) {
      const hash = fnv(vector.salt)
      const next = stream(Number((BigInt(vector.seed) ^ BigInt(hash)) & MASK))
      expect([vector.id, hash, vector.draws.map(() => next())]).toEqual([vector.id, vector.hash, vector.draws])
    }
    for (const vector of where('subseed').filter((one) => one.fn === 'hash32')) expect([vector.id, fnv(vector.text)]).toEqual([vector.id, vector.hash])
    for (const vector of where('challenge').filter((one) => one.fn === 'token')) {
      expect([vector.id, fnv(vector.body).toString(16).padStart(8, '0')]).toEqual([vector.id, vector.checksum])
      const next = stream(vector.seed)
      expect(vector.firstDraws.map(() => next())).toEqual(vector.firstDraws)
    }
  })

  test('a seed made for a draw gives that draw first, and the edges of a rejection are where the notes say', () => {
    for (const draw of [0, 1, 0x7fffffff, 0x80000000, 0xbfffffff, 0xc0000000, 0xfffffffe, 0xffffffff]) expect([draw, splitmix32u(seedForFirstDraw(draw))()]).toEqual([draw, draw])
    const edge = (id: string) => where('rng').find((vector) => vector.id === id)
    expect(edge('below-n-3-last-draw-taken')?.consumed).toBe(1)
    expect(edge('below-n-3-first-draw-thrown-back')?.consumed).toBeGreaterThanOrEqual(2)
    expect(edge('below-n-6755399441055744-first-attempt-taken')?.consumed).toBe(2)
    expect(edge('below-n-6755399441055744-first-attempt-thrown-back')?.consumed).toBeGreaterThanOrEqual(4)
    expect(edge('below-n-2147483648-largest-draw')?.results).toEqual([2147483647])
  })

  test('the bits of every float are those of its double, and a canonical float is what JavaScript prints for the number', () => {
    const view = new DataView(new ArrayBuffer(8))
    const bits = (value: number) => {
      view.setFloat64(0, value)
      return view.getBigUint64(0).toString(16).padStart(16, '0')
    }
    for (const vector of where('canonical').filter((one) => typeof one.bits === 'string')) {
      const value = Number(vector.input)
      expect([vector.id, bits(value)]).toEqual([vector.id, vector.bits])
      expect([vector.id, vector.canonical]).toEqual([vector.id, Object.is(value, -0) ? '0' : String(value)])
    }
    for (const vector of where('rng').filter((one) => one.fn === 'splitmix32')) {
      expect(vector.values.map(bits)).toEqual(vector.bits)
      const next = splitmix32u(vector.seed)
      expect(vector.values).toEqual(vector.values.map(() => next() / 4294967296))
    }
  })

  test('the hash of a salt is hash32, with the values of FNV-1a for "foobar" and for the empty text in the file', () => {
    expect(hash32('foobar')).toBe(0xbf9cf968)
    expect(where('subseed').find((vector) => vector.id === 'hash32-foobar')?.hex).toBe('bf9cf968')
    expect(where('subseed').find((vector) => vector.id === 'hash32-empty')?.hex).toBe('811c9dc5')
  })
})

describe('written for a reader in another language', () => {
  test('the files are ASCII, with LF line endings, no tabs and no trailing space', () => {
    for (const name of NAMES) {
      const text = read(`schemas/vectors/${name}.json`)
      expect([name, /^[\x20-\x7e\n]*$/.test(text)]).toEqual([name, true])
      expect(text.endsWith('}\n')).toBe(true)
      expect(text.split('\n').filter((line) => /[ \t]$/.test(line))).toEqual([])
    }
  })

  test('every number in them is one that both languages read alike', () => {
    for (const name of NAMES) expect([name, numberProblems(read(`schemas/vectors/${name}.json`))]).toEqual([name, []])
  })

  test('the lint finds negative zero, a whole number as a fraction, an exponent in another form, a whole number too large to be exact and a fraction of too many digits', () => {
    const found = (text: string) => numberProblems(`[\n  ${text}\n]`).map((problem) => problem.replace(/^\d+:\d+ /, '').split(':')[0])
    expect(found('-0')).toEqual(['-0'])
    expect(found('-0.0')).toEqual(['-0.0'])
    expect(found('1.0')).toEqual(['1.0'])
    expect(found('1E5')).toEqual(['1E5'])
    expect(found('1e5')).toEqual(['1e5'])
    expect(found('9007199254740993')).toEqual(['9007199254740993'])
    expect(found('0.30000000000000004000')).toEqual(['0.30000000000000004000'])
    expect(found('1e400')).toEqual(['1e400'])
    expect(found('0.1000000000000000055511151231257827')).toHaveLength(1)
    expect(found('100000000000000000000000')).toHaveLength(1)
  })

  test('the lint takes what both read alike, and looks at no digit inside a string', () => {
    for (const ok of ['0', '1', '-1', '9007199254740991', '9007199254740992', '0.1', '0.30000000000000004', '1e-7', '2.3283064365386963e-10', '5e-324', '-1.5', '4503599627370495.5']) {
      expect([ok, numberProblems(`[${ok}]`)]).toEqual([ok, []])
    }
    expect(numberProblems('["-0", "1.0 9007199254740993 1E5", {"1.0": "-0"}]')).toEqual([])
  })

  test('the lint says where: the line, the column and the number', () => {
    expect(numberProblems('{\n  "a": 1,\n  "b": -0\n}')).toEqual([expect.stringMatching(/^3:8 -0: negative zero/)])
  })

  test('the writer refuses -0, NaN and a function, and escapes everything above ~ as \\uXXXX, a pair for an astral character', () => {
    const file = (vector: object) => ({ spec: 'x@1', description: 'd', reading: ['r'], source: 's', oracle: 'o', vectors: [{ id: 'a', ...vector }] })
    expect(() => renderVectorFile(file({ n: -0 }))).toThrow('-0')
    expect(() => renderVectorFile(file({ n: Number.NaN }))).toThrow('no JSON form')
    expect(() => renderVectorFile(file({ n: () => 1 }))).toThrow('no JSON form')
    expect(asciiString('café \u{1F600} \u007f \u0001 "q" \\ \n')).toBe('"caf\\u00e9 \\ud83d\\ude00 \\u007f \\u0001 \\"q\\" \\\\ \\n"')
    expect(() => renderVectorFile({ ...file({}), vectors: [{ id: 'a' }, { id: 'a' }] })).toThrow('used twice')
    const text = renderVectorFile(file({ list: [1, 2, 3], nested: { a: 1 } }))
    expect(text).toContain('{"id": "a", "list": [1, 2, 3], "nested": {"a": 1}}')
    expect(text.endsWith('\n')).toBe(true)
  })

  test('a long list wraps at the width, a long vector is spread over lines, and the file reads back as the data', () => {
    const long = Array.from({ length: 80 }, (_, i) => 1_000_000_000 + i)
    const text = renderVectorFile({ spec: 'x@1', description: 'd', reading: ['r'], source: 's', oracle: 'o', vectors: [{ id: 'long', draws: long, note: 'n' }] })
    expect(text.split('\n').every((line) => line.length <= 205)).toBe(true)
    expect(text.split('\n').length).toBeGreaterThan(8)
    expect((JSON.parse(text) as File).vectors[0].draws).toEqual(long)
  })

  test('a vector file holds no word of the repository’s sweep for personal data: no local path, no login, no session', () => {
    for (const name of NAMES) {
      const text = read(`schemas/vectors/${name}.json`)
      expect([name, /\/home\/|\/tmp\/|\/Users\//.test(text)]).toEqual([name, false])
      expect(text).not.toMatch(/@[A-Za-z0-9-]+\.[a-z]{2,}/)
    }
  })
})

describe('verify:vectors', () => {
  function gate(dir: string) {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/verify-vectors.ts'), '--root', dir], { cwd: root, encoding: 'utf8' })
    return { status: result.status, said: result.stderr, out: result.stdout }
  }

  test('passes on the tree, and says how many files and vectors it holds', () => {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/verify-vectors.ts')], { cwd: root, encoding: 'utf8' })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toMatch(/^verify:vectors passed: 5 files and \d+ vectors are what the TypeScript code writes$/)
  })

  test('a changed value fails, naming the file and the line', () => {
    const dir = copyOfSchemas()
    const file = path.join(dir, 'schemas/vectors/rng.json')
    writeFileSync(file, readFileSync(file, 'utf8').replace('"seed": 0,', '"seed": 3,'))
    const { status, said } = gate(dir)
    expect(status).toBe(1)
    expect(said).toContain('verify:vectors: schemas/vectors/rng.json is not what the code writes (line ')
    expect(said).toContain('verify:vectors failed:')
    expect(said).toContain('the Python port follow')
  })

  test('a missing file fails, and so does a file that nothing writes', () => {
    const dir = copyOfSchemas()
    rmSync(path.join(dir, 'schemas/vectors/sha256.json'))
    writeFileSync(path.join(dir, 'schemas/vectors/extra.json'), '{}\n')
    const { status, said } = gate(dir)
    expect(status).toBe(1)
    expect(said).toContain('schemas/vectors/sha256.json is missing')
    expect(said).toContain('schemas/vectors/extra.json is not a vector file that anything writes')
  })

  test('a hand edit of a number is a drift: 1 written as 1.0 is caught, and the lint would have refused it besides', () => {
    const dir = copyOfSchemas()
    const file = path.join(dir, 'schemas/vectors/canonical.json')
    expect(vectorDrift(dir)).toEqual([])
    const edited = readFileSync(file, 'utf8').replace('"utf8Bytes": 1', '"utf8Bytes": 1.0')
    expect(numberProblems(edited)).toHaveLength(1)
    writeFileSync(file, edited)
    const after = vectorDrift(dir)
    expect(after).toHaveLength(1)
    expect(after[0]).toContain('schemas/vectors/canonical.json is not what the code writes')
  })

  test('a usage error is 2', () => {
    expect(verifyVectors(['--bogus'])).toBe(2)
    expect(verifyVectors(['--root'])).toBe(2)
  })

  test('is a live gate in the registry now, and passes when the registry runs it', () => {
    const list = spawnSync(process.execPath, [path.join(root, 'scripts/verify.ts'), 'list'], { cwd: root, encoding: 'utf8' }).stdout
    expect(list).toMatch(/schema +source +live +W2-T01 +scripts\/verify-schema\.ts/)
    expect(list).toMatch(/vectors +source +live +W2-T01 +scripts\/verify-vectors\.ts/)
    for (const gateName of ['schema', 'vectors']) {
      const result = spawnSync(process.execPath, [path.join(root, 'scripts/verify.ts'), gateName], { cwd: root, encoding: 'utf8' })
      expect([gateName, result.status, result.stdout.includes('pending')]).toEqual([gateName, 0, false])
    }
  })
})
