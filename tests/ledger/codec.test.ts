/*
 * W0-T10's acceptance check 3, and the rest of what "a strict codec" means (ARCHITECTURE §7.2, D-024):
 *
 *   - the codec rejects unknown kinds, malformed refs and scores outside [0, 1];
 *   - it accepts exactly the shapes of types.ts: every key of every example is needed or optional as the type says, an unknown
 *     key is refused at every level, and a value of the wrong type is refused wherever the type is not free JSON;
 *   - the envelope and kinds are the ones ARCHITECTURE §7.2 writes, read from the document, so a field or a kind added to one
 *     without the other fails here.
 */
import { describe, expect, test } from 'bun:test'
import { decodeEvent, fitsJson, GRADED_KINDS, KIND_REFS, KINDS, LIMITS, PROVENANCES } from '@es/ledger'
import type { Kind, LedgerEvent } from '@es/ledger'
import { between, tableRows, backticked } from '../ci/support'
import { read } from '../ci/support'
import { copy, EXAMPLES, HEX_A, HEX_B, omit } from './support'

type Path = (string | number)[]

const accepts = (event: unknown) => decodeEvent(event).ok
const reason = (event: unknown): string => {
  const decoded = decodeEvent(event)
  if (decoded.ok) throw new Error(`the codec accepted ${JSON.stringify(event)}`)
  return decoded.reason
}

/** An example with every optional top-level field present, so that a sweep sees them all. */
function full(kind: Kind): LedgerEvent {
  const event: Record<string, unknown> = { ...copy(EXAMPLES[kind]), rev: 'abcd1234' }
  if ((GRADED_KINDS as readonly string[]).includes(kind)) Object.assign(event, { seed: 5, conf: 'think' })
  return event as unknown as LedgerEvent
}

const get = (value: unknown, path: Path): unknown => path.reduce<unknown>((at, key) => (at as Record<string | number, unknown>)[key], value)

/** A copy of `value` with the member at `path` set, or removed when `to` is undefined. */
function put<T>(value: T, path: Path, to: unknown): T {
  const out = copy(value) as Record<string | number, unknown>
  const holder = path.slice(0, -1).reduce<Record<string | number, unknown>>((at, key) => at[key] as Record<string | number, unknown>, out)
  const last = path[path.length - 1]
  if (to === undefined) delete holder[last]
  else holder[last] = to
  return out as T
}

/** Where the object members of a value are, the value first. Arrays are walked and not listed. */
function objectPaths(value: unknown, path: Path = []): Path[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => objectPaths(item, [...path, index]))
  if (value !== null && typeof value === 'object') {
    return [path, ...Object.entries(value).flatMap(([key, inner]) => objectPaths(inner, [...path, key]))]
  }
  return []
}

/** Where the primitives of a value are. */
function leafPaths(value: unknown, path: Path = []): Path[] {
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) => leafPaths(inner, [...path, Array.isArray(value) ? Number(key) : key]))
  }
  return [path]
}

/** The members whose value is free JSON by design: the codec bounds their size and says nothing else about them. */
const FREE_JSON: Path[] = [
  ['data', 'answer'],
  ['data', 'predicted'],
  ['data', 'actual'],
  ['data', 'marks'],
  // A prediction's value is a number, an option id or an interval, and the codec relates it to the truth beside it.
  ['data', 'value'],
  ['data', 'truth'],
]
const isFree = (path: Path) => FREE_JSON.some((free) => free.every((key, index) => path[index] === key))

/** Which members of the object at `where` the codec needs, and which it can do without. */
function roles(event: LedgerEvent, where: Path): { required: string[]; optional: string[] } {
  const required: string[] = []
  const optional: string[] = []
  for (const key of Object.keys(get(event, where) as object)) (accepts(put(event, [...where, key], undefined)) ? optional : required).push(key)
  return { required: required.sort(), optional: optional.sort() }
}

describe('ARCHITECTURE §7.2 is the envelope and the kinds that the codec accepts', () => {
  const section = between(read('docs/ARCHITECTURE.md'), '### 7.2 Event envelope and kinds', '### 7.3')

  test('the table lists the ten kinds in order, and the ref forms each kind takes', () => {
    const rows = tableRows(section)
    expect(rows.map((row) => backticked(row[0])[0])).toEqual([...KINDS])
    for (const row of rows) {
      const kind = backticked(row[0])[0] as Kind
      const forms = backticked(row[1]).map((form) => form.slice(0, form.indexOf(':')))
      expect(forms).toEqual([...KIND_REFS[kind]])
    }
  })

  test('the interfaces name the envelope fields and the graded fields, and their optional ones', () => {
    const code = /```ts\n([\s\S]*?)```/.exec(section)?.[1].replace(/\/\*[\s\S]*?\*\//g, '')
    if (code === undefined) throw new Error('§7.2 no longer has its interfaces')
    const fieldsOf = (text: string) => [...text.matchAll(/(\w+)(\?)?:/g)].map((match) => ({ name: match[1], optional: match[2] === '?' }))
    const [envelopeText, gradedText] = code.split('interface Graded')
    const documented = {
      envelope: fieldsOf(envelopeText),
      graded: fieldsOf(gradedText),
    }
    const sorted = (names: string[]) => [...names].sort()
    const names = (fields: { name: string; optional: boolean }[], optional: boolean) =>
      sorted(fields.filter((field) => field.optional === optional).map((field) => field.name))

    // An ack is the envelope alone. Its kind and ref are the codec's too.
    const ack = roles(full('ack'), [])
    expect(ack.required).toEqual(names(documented.envelope, false))
    expect(ack.optional).toEqual(names(documented.envelope, true))

    // A graded event adds the graded fields and a `data` member that holds the kind's own.
    const graded = roles(full('item'), [])
    expect(graded.required).toEqual(sorted([...names(documented.envelope, false), ...names(documented.graded, false), 'data']))
    expect(graded.optional).toEqual(sorted([...names(documented.envelope, true), ...names(documented.graded, true)]))
  })

  test('the provenance names are the ones §7.3 writes', () => {
    const line = /`Provenance = ([^`]+)`/.exec(read('docs/ARCHITECTURE.md'))?.[1]
    if (line === undefined) throw new Error('§7.3 no longer defines Provenance')
    expect([...line.matchAll(/'([a-z-]+)'/g)].map((match) => match[1])).toEqual([...PROVENANCES])
  })
})

describe('a valid event of every kind', () => {
  test.each([...KINDS])('%s decodes to itself, and to itself again after a trip through JSON', (kind) => {
    const decoded = decodeEvent(EXAMPLES[kind])
    if (!decoded.ok) throw new Error(decoded.reason)
    expect(decoded.value).toEqual(EXAMPLES[kind])
    const again = decodeEvent(JSON.parse(JSON.stringify(EXAMPLES[kind])))
    if (!again.ok) throw new Error(again.reason)
    expect(again.value).toEqual(EXAMPLES[kind])
  })

  test('the decoder leaves its input alone and returns a new object', () => {
    for (const kind of KINDS) {
      const input = copy(EXAMPLES[kind])
      const decoded = decodeEvent(input)
      if (!decoded.ok) throw new Error(decoded.reason)
      expect(input).toEqual(EXAMPLES[kind])
      expect(decoded.value).not.toBe(input)
    }
  })

  test('an optional member that is undefined is dropped, as a JSON file would drop it', () => {
    const decoded = decodeEvent({ ...EXAMPLES.play, rev: undefined, seed: undefined, data: { ...EXAMPLES.play.data } })
    if (!decoded.ok) throw new Error(decoded.reason)
    expect(Object.keys(decoded.value)).not.toContain('rev')
    expect(Object.keys(decoded.value)).not.toContain('seed')
  })
})

describe('unknown kinds', () => {
  const kinds: unknown[] = ['bogus', 'Play', 'PLAY', ' play', 'play ', '', 'visit', 'lab-green', 'quiz', 'constructor', 'toString', 'hasOwnProperty', '__proto__', 5, null, undefined, ['play'], { toString: 'play' }]

  test.each(kinds.map((kind, index) => [index, kind] as const))('kind #%#: %p is refused', (_index, kind) => {
    const text = reason({ ...EXAMPLES.play, kind })
    expect(text).toContain('unknown kind')
  })

  test('an event with no kind, and a value that is not an object, are refused', () => {
    expect(reason(omit(EXAMPLES.play, 'kind'))).toContain('unknown kind')
    for (const value of [null, undefined, 5, 'play', true, [], [EXAMPLES.play]]) expect(reason(value)).toBe('not an object')
  })

  test('every event named with another kind than its fields is refused', () => {
    for (const kind of KINDS) {
      for (const other of KINDS) {
        if (other === kind) continue
        expect(accepts({ ...copy(EXAMPLES[kind]), kind: other })).toBe(false)
      }
    }
  })
})

describe('malformed refs', () => {
  const malformed = [
    '',
    ' ',
    'play',
    'play:',
    ':',
    'x:y',
    'PLAY:loop/close',
    'play:loop',
    'play:loop/',
    'play:/close',
    'play:Loop/close',
    'play:loop/close/extra',
    'play:loop/close ',
    ' play:loop/close',
    'play:loop close',
    'play:loop/clo\nse',
    'play:__proto__/close',
    'item:gen/x',
    'item:gen/tr2.bubble-width',
    'lab:',
    'lab:Hybrid-KV',
    'predict:tr2.l3',
    'predict:tr2.l3#',
    'trace:base-step',
    'challenge:tr8.replay',
    'receipt:tr8.replay.s',
    'review:tr2',
    'screen:',
    'change:two words',
    `play:loop/${'a'.repeat(LIMITS.refChars)}`,
    `play:${'a'.repeat(5000)}/close`,
  ]

  test.each([...KINDS])('%s refuses every malformed ref', (kind) => {
    for (const ref of malformed) {
      expect(accepts({ ...copy(EXAMPLES[kind]), ref })).toBe(false)
    }
  })

  test('a ref that is not a string is refused', () => {
    for (const ref of [undefined, null, 5, ['play:loop/close'], { kind: 'play' }]) expect(accepts({ ...copy(EXAMPLES.play), ref })).toBe(false)
  })

  test('the reason names the ref, the kind and the form the kind takes', () => {
    expect(reason({ ...EXAMPLES.play, ref: 'play:loop' })).toContain('ref')
    const wrongKind = reason({ ...EXAMPLES.play, ref: 'lab:hybrid-kv' })
    expect(wrongKind).toContain('does not fit a play event')
    expect(wrongKind).toContain('play:')
    expect(reason({ ...EXAMPLES.ack, ref: 'play:loop/close' })).toContain('screen: or change:')
  })

  /** A ref of each of A§4.5's forms, and the two an ack takes. */
  const refs: Record<string, string> = {
    predict: 'predict:tr2.l3#tr2.l3.p1',
    item: 'item:gen/tr2.bubble-width/async-on',
    play: 'play:loop/close',
    lab: 'lab:hybrid-kv',
    prove: 'prove:hybrid-kv',
    trace: 'trace:base-step/gap',
    challenge: 'challenge:tr8.replay.s2',
    receipt: 'receipt:tr8.replay.s2',
    review: 'review:tr2.async-overlap',
    screen: 'screen:welcome',
    change: 'change:vllm-0-34',
  }

  test('a ref of the wrong form is refused by every kind, and a ref of its own form is accepted', () => {
    for (const kind of KINDS) {
      for (const [form, ref] of Object.entries(refs)) {
        const fits = (KIND_REFS[kind] as readonly string[]).includes(form)
        // The refs a kind's other fields are tied to (a challenge's token, a prove's lab) are checked by their own tests.
        if (fits && ['challenge', 'receipt', 'prove'].includes(kind)) continue
        expect(accepts({ ...copy(EXAMPLES[kind]), ref })).toBe(fits)
      }
    }
  })

  test('the forms in the design docs are accepted where they belong', () => {
    const good: [Kind, string][] = [
      ['predict', 'predict:tr2.l3#p1'],
      ['play', 'play:broken-bench/court'],
      ['play', 'play:switchyard/load-or-recompute'],
      ['lab-check', 'lab:tr8.replay'],
      ['review', 'review:cap.paired-runs'],
      ['ack', 'change:vllm-0-34'],
    ]
    for (const [kind, ref] of good) expect(accepts({ ...copy(EXAMPLES[kind]), ref })).toBe(true)
  })
})

describe('scores outside [0, 1]', () => {
  const bad: unknown[] = [-0.0001, -1, 1.0001, 2, 1e9, -1e-9, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '0.5', '1', null, true, [0.5], {}]
  const good = [0, 1, 0.5, 1e-9, 0.9999999999999999, Number.MIN_VALUE, 0.3333333333333333]

  test.each([...GRADED_KINDS])('%s refuses a score outside [0, 1] and one that is not a number', (kind) => {
    for (const score of bad) expect(accepts({ ...copy(EXAMPLES[kind]), score })).toBe(false)
  })

  test.each([...GRADED_KINDS])('%s accepts every score inside [0, 1], the ends included', (kind) => {
    for (const score of good) expect(accepts({ ...copy(EXAMPLES[kind]), score })).toBe(true)
  })

  test('a graded event with no score is refused, and the reason names it', () => {
    for (const kind of GRADED_KINDS) {
      expect(reason(omit(EXAMPLES[kind], 'score'))).toContain('score')
    }
  })

  test('a score of 1.0001 says where it went wrong', () => {
    expect(reason({ ...EXAMPLES.item, score: 1.0001 })).toContain('score')
  })

  test('an ungraded event refuses the graded fields', () => {
    for (const kind of ['challenge', 'ack'] as const) {
      for (const [key, value] of [['score', 1], ['ok', true], ['provenance', 'unseen'], ['seed', 1], ['conf', 'sure']] as const) {
        expect(accepts({ ...copy(EXAMPLES[kind]), [key]: value })).toBe(false)
      }
    }
  })
})

describe('the envelope', () => {
  test('provenance is one of the seven names', () => {
    for (const provenance of PROVENANCES) expect(accepts({ ...EXAMPLES.item, provenance })).toBe(true)
    for (const provenance of ['Unseen', 'field', 'lab-green', 'receipt-verified', '', 1, null, ['unseen']]) {
      expect(accepts({ ...EXAMPLES.item, provenance })).toBe(false)
    }
    expect(reason({ ...EXAMPLES.item, provenance: 'field' })).toContain('provenance')
  })

  test('conf is guess, think or sure', () => {
    for (const conf of ['guess', 'think', 'sure']) expect(accepts({ ...EXAMPLES.item, conf })).toBe(true)
    for (const conf of ['Sure', 'unsure', '', null, 1]) expect(accepts({ ...EXAMPLES.item, conf })).toBe(false)
  })

  test('seed is a uint32', () => {
    for (const seed of [0, 1, 4294967295]) expect(accepts({ ...EXAMPLES.item, seed })).toBe(true)
    for (const seed of [-1, 4294967296, 1.5, '7', Number.NaN, null]) expect(accepts({ ...EXAMPLES.item, seed })).toBe(false)
  })

  test('v is 1', () => {
    for (const v of [0, 2, '1', 1.5, null]) expect(accepts({ ...EXAMPLES.item, v })).toBe(false)
  })

  test('an id and a device are 1 to 64 letters, digits, hyphens or underscores, not starting with a hyphen or underscore', () => {
    const good = ['e1', 'A_b-9', 'a'.repeat(LIMITS.idChars), '0f8b2c64-3e1d-4a52-9d7a-61f1c0b1a2c3', '9']
    const bad = ['', ' a', 'a b', 'a/b', '_a', '-a', '__proto__', 'é', 'a'.repeat(LIMITS.idChars + 1), 'a\n', 5, null]
    for (const key of ['id', 'dev']) {
      for (const value of good) expect(accepts({ ...EXAMPLES.item, [key]: value })).toBe(true)
      for (const value of bad) expect(accepts({ ...EXAMPLES.item, [key]: value })).toBe(false)
    }
  })

  test('rev is lowercase letters and digits, 4 to 64 of them', () => {
    for (const rev of ['abcd', 'a1b2c3d4', 'a'.repeat(LIMITS.revChars), HEX_A]) expect(accepts({ ...EXAMPLES.item, rev })).toBe(true)
    for (const rev of ['abc', 'ABCD', 'ab cd', 'ab-cd', 'a'.repeat(LIMITS.revChars + 1), '', 5, null]) expect(accepts({ ...EXAMPLES.item, rev })).toBe(false)
  })

  test('at is an ISO instant as toISOString writes it', () => {
    const bad = [
      '2026-11-04T09:30:00Z',
      '2026-11-04T09:30:00.000+00:00',
      '2026-11-04 09:30:00.000Z',
      '2026-11-04T09:30:00.000z',
      '2026-11-04',
      '2026-02-30T09:30:00.000Z',
      '2026-13-01T09:30:00.000Z',
      '2026-11-04T25:00:00.000Z',
      '2026-11-04T09:30:60.000Z',
      '+012026-11-04T09:30:00.000Z',
      '',
      1730712600000,
      null,
    ]
    for (const at of bad) expect(accepts({ ...EXAMPLES.item, at })).toBe(false)
    expect(reason({ ...EXAMPLES.item, at: '2026-11-04T09:30:00Z' })).toContain('at:')
  })

  test('day is the day of at shifted by tz, frozen at write', () => {
    const at = '2026-11-04T23:30:00.000Z'
    expect(accepts({ ...EXAMPLES.item, at, tz: 0, day: '2026-11-04' })).toBe(true)
    expect(accepts({ ...EXAMPLES.item, at, tz: 60, day: '2026-11-05' })).toBe(true)
    expect(accepts({ ...EXAMPLES.item, at, tz: -480, day: '2026-11-04' })).toBe(true)
    expect(accepts({ ...EXAMPLES.item, at, tz: 330, day: '2026-11-05' })).toBe(true)
    expect(accepts({ ...EXAMPLES.item, at, tz: 60, day: '2026-11-04' })).toBe(false)
    expect(accepts({ ...EXAMPLES.item, at: '2026-11-04T00:30:00.000Z', tz: -60, day: '2026-11-03' })).toBe(true)
    expect(reason({ ...EXAMPLES.item, at, tz: 60, day: '2026-11-04' })).toContain('2026-11-05')
    for (const day of ['2026-11-4', '2026-02-30', '20261104', '', 5, null]) expect(accepts({ ...EXAMPLES.item, at, tz: 0, day })).toBe(false)
  })

  test('tz is whole minutes within a day of UTC', () => {
    for (const tz of [-1440, -480, 0, 330, 345, 840, 1440]) {
      const at = '2026-11-04T12:00:00.000Z'
      const day = new Date(Date.parse(at) + tz * 60_000).toISOString().slice(0, 10)
      expect(accepts({ ...EXAMPLES.item, at, tz, day })).toBe(true)
    }
    for (const tz of [-1441, 1441, 1.5, '60', Number.NaN, null]) expect(accepts({ ...EXAMPLES.item, tz })).toBe(false)
  })
})

describe('unknown and missing members, and members of the wrong type', () => {
  /** What each kind's own `data` needs and may leave out, written out as ARCHITECTURE §7.2 and types.ts have it. */
  const DATA: Partial<Record<Kind, { required: string[]; optional: string[] }>> = {
    predict: { required: ['truth', 'value'], optional: ['unit'] },
    item: { required: ['answer'], optional: [] },
    play: { required: ['actions', 'actionsSha256'], optional: [] },
    'lab-check': { required: ['checks', 'seeds', 'wasmSha256'], optional: [] },
    prove: { required: ['actual', 'agentClosed', 'predicted', 'wasmSha256'], optional: [] },
    'trace-mark': { required: ['error', 'marks'], optional: [] },
    challenge: { required: ['issuedOn', 'nonce', 'seed', 'token'], optional: [] },
    receipt: { required: ['challenge', 'checks', 'environment', 'graderVersion', 'receiptSha256'], optional: [] },
    review: { required: ['grade'], optional: [] },
  }

  test.each([...KINDS])('%s needs and allows exactly the members of its type', (kind) => {
    const event = full(kind)
    const data = DATA[kind]
    if (data === undefined) {
      expect(Object.keys(event)).not.toContain('data')
      return
    }
    expect(roles(event, ['data'])).toEqual(data)
  })

  test.each([...KINDS])('%s refuses an unknown member at every level of an object', (kind) => {
    const event = full(kind)
    for (const where of objectPaths(event)) {
      if (isFree(where)) continue
      for (const key of ['weight', 'xp', 'extra', '__proto__']) {
        const holder = copy(event) as unknown as Record<string | number, unknown>
        const target = where.reduce<Record<string | number, unknown>>((at, step) => at[step] as Record<string | number, unknown>, holder)
        Object.defineProperty(target, key, { value: 1, enumerable: true, configurable: true, writable: true })
        expect(accepts(holder)).toBe(false)
      }
    }
  })

  test.each([...KINDS])('%s refuses a member of the wrong type, wherever the type is not free JSON', (kind) => {
    const event = full(kind)
    const wrong = (value: unknown): unknown[] => {
      if (typeof value === 'string') return [null, 5, true, [], {}]
      if (typeof value === 'number') return [null, 'x', true, [], {}]
      if (typeof value === 'boolean') return [null, 'true', 1, 0, [], {}]
      return [null, 'x', 5, true, {}]
    }
    for (const path of leafPaths(event)) {
      if (isFree(path)) continue
      for (const replacement of wrong(get(event, path))) expect(accepts(put(event, path, replacement))).toBe(false)
    }
  })

  test.each([...KINDS])('%s refuses a member that is gone', (kind) => {
    const event = full(kind)
    for (const where of objectPaths(event)) {
      if (isFree(where)) continue
      const { required } = roles(event, where)
      for (const key of required) expect(accepts(put(event, [...where, key], undefined))).toBe(false)
    }
  })

  test('the reason names the member and says what was wrong', () => {
    expect(reason({ ...EXAMPLES.play, extra: 1 })).toContain('extra')
    expect(reason({ ...EXAMPLES.play, data: { ...EXAMPLES.play.data, weight: 1 } })).toContain('weight')
    expect(reason({ ...EXAMPLES.play, data: { ...EXAMPLES.play.data, actionsSha256: 'abc' } })).toContain('data.actionsSha256')
    expect(reason({ ...EXAMPLES.play, ok: 'yes' })).toContain('ok')
  })

  test('a long list of problems is cut short', () => {
    const text = reason({ kind: 'item', id: 5, v: 2, ref: 3, at: 4, tz: 'x', day: 6, dev: 7, score: 'a', ok: 'b', provenance: 'c', data: 1 })
    expect(text).toMatch(/\(and \d+ more\)$/)
    expect(text.length).toBeLessThan(600)
  })
})

describe('what each kind carries', () => {
  test('predict: a number, an option id or an interval, and a truth of the same shape', () => {
    const decode = (value: unknown, truth: unknown) => accepts({ ...EXAMPLES.predict, data: { value, truth } })
    expect(decode(3, 4)).toBe(true)
    expect(decode(-3.5, 0)).toBe(true)
    expect(decode('b', 'c')).toBe(true)
    expect(decode({ lo: 1, hi: 2 }, { lo: 1, hi: 1 })).toBe(true)
    expect(decode(3, 'b')).toBe(false)
    expect(decode('b', 3)).toBe(false)
    expect(decode({ lo: 1, hi: 2 }, 3)).toBe(false)
    expect(decode({ lo: 3, hi: 2 }, { lo: 1, hi: 2 })).toBe(false)
    expect(decode({ lo: 1, hi: 2 }, { lo: 5, hi: 4 })).toBe(false)
    expect(decode({ lo: 1 }, { lo: 1, hi: 2 })).toBe(false)
    expect(decode({ lo: 1, hi: 2, mid: 1 }, { lo: 1, hi: 2 })).toBe(false)
    expect(decode(Number.NaN, 3)).toBe(false)
    expect(decode(Number.POSITIVE_INFINITY, 3)).toBe(false)
    expect(decode('has space', 'b')).toBe(false)
    expect(decode(null, null)).toBe(false)
    expect(decode(true, true)).toBe(false)
    expect(decode([1], [1])).toBe(false)
  })

  test('predict: the unit is a line of text', () => {
    expect(accepts({ ...EXAMPLES.predict, data: { value: 1, truth: 2, unit: 'us' } })).toBe(true)
    for (const unit of ['', 'a\nb', 'a'.repeat(LIMITS.lineChars + 1), 5]) expect(accepts({ ...EXAMPLES.predict, data: { value: 1, truth: 2, unit } })).toBe(false)
  })

  test('item: the answer is any JSON within its budget', () => {
    for (const answer of [null, 1, 'b', true, [1, 2], { lo: 1, hi: 2 }, { a: { b: [1, { c: null }] } }, 'x'.repeat(LIMITS.answerChars - 2)]) {
      expect(accepts({ ...EXAMPLES.item, data: { answer } })).toBe(true)
    }
    for (const answer of [undefined, () => 1, Number.NaN, Number.POSITIVE_INFINITY, 10n, Symbol('x'), new Date(0), new Map(), 'x'.repeat(LIMITS.answerChars)]) {
      expect(accepts({ ...EXAMPLES.item, data: { answer } })).toBe(false)
    }
    expect(accepts({ ...EXAMPLES.item, data: {} })).toBe(false)
  })

  test('play: the log is a bounded string and its hash is a SHA-256', () => {
    const data = (over: object) => ({ ...EXAMPLES.play, data: { ...EXAMPLES.play.data, ...over } })
    expect(accepts(data({ actions: '' }))).toBe(true)
    expect(accepts(data({ actions: 'a'.repeat(LIMITS.actionsChars) }))).toBe(true)
    expect(accepts(data({ actions: 'a'.repeat(LIMITS.actionsChars + 1) }))).toBe(false)
    for (const actionsSha256 of ['', 'abc', HEX_A.toUpperCase(), `${HEX_A}0`, HEX_A.slice(1), 'g'.repeat(64), 5]) {
      expect(accepts(data({ actionsSha256 }))).toBe(false)
    }
  })

  test('lab-check: a module hash, up to the seed limit, and at least one check with a known status', () => {
    const data = (over: object) => ({ ...EXAMPLES['lab-check'], data: { ...EXAMPLES['lab-check'].data, ...over } })
    const check = (id: string, status = 'pass') => ({ id, status })
    expect(accepts(data({ seeds: [] }))).toBe(true)
    expect(accepts(data({ seeds: Array.from({ length: LIMITS.seeds }, (_, index) => index) }))).toBe(true)
    expect(accepts(data({ seeds: Array.from({ length: LIMITS.seeds + 1 }, (_, index) => index) }))).toBe(false)
    expect(accepts(data({ seeds: [-1] }))).toBe(false)
    expect(accepts(data({ seeds: [4294967296] }))).toBe(false)
    expect(accepts(data({ checks: [] }))).toBe(false)
    expect(accepts(data({ checks: Array.from({ length: LIMITS.checks }, (_, index) => check(`c${index}`)) }))).toBe(true)
    expect(accepts(data({ checks: Array.from({ length: LIMITS.checks + 1 }, (_, index) => check(`c${index}`)) }))).toBe(false)
    for (const status of ['pass', 'fail', 'trap', 'timeout']) expect(accepts(data({ checks: [check('a', status)] }))).toBe(true)
    for (const status of ['ok', 'Pass', '', null]) expect(accepts(data({ checks: [check('a', status as string)] }))).toBe(false)
    for (const id of ['', ' ', '_a', 'a b', 'a'.repeat(LIMITS.idChars + 1)]) expect(accepts(data({ checks: [check(id)] }))).toBe(false)
    expect(accepts(data({ wasmSha256: 'abc' }))).toBe(false)
  })

  test('prove: a forge lab names its module, and a lab with a receipt names its receipt', () => {
    const forge = (over: object, ref = 'prove:hybrid-kv') => ({ ...EXAMPLES.prove, ref, data: { ...EXAMPLES.prove.data, ...over } })
    expect(accepts(forge({}))).toBe(true)
    expect(accepts(forge({ wasmSha256: undefined }))).toBe(false)
    expect(reason(forge({ wasmSha256: undefined }))).toContain('data.wasmSha256')
    expect(accepts(forge({ receiptSha256: HEX_B }))).toBe(false)

    const receipt = (over: object) => forge({ wasmSha256: undefined, receiptSha256: HEX_B, ...over }, 'prove:tr8.replay')
    expect(accepts(receipt({}))).toBe(true)
    expect(accepts(receipt({ receiptSha256: undefined }))).toBe(false)
    expect(accepts(receipt({ wasmSha256: HEX_A }))).toBe(false)
    expect(accepts(forge({ wasmSha256: undefined, receiptSha256: HEX_B }))).toBe(false)

    expect(accepts(forge({ actual: null }))).toBe(true)
    expect(accepts(forge({ predicted: undefined }))).toBe(false)
    expect(accepts(forge({ agentClosed: 'yes' }))).toBe(false)
    expect(accepts(forge({ wasmSha256: 'abc' }))).toBe(false)
  })

  test('trace-mark: a bounded list of marks and a non-negative error', () => {
    const data = (over: object) => ({ ...EXAMPLES['trace-mark'], data: { ...EXAMPLES['trace-mark'].data, ...over } })
    expect(accepts(data({ marks: [] }))).toBe(true)
    expect(accepts(data({ marks: [1, 'a', null, { start: 0 }] }))).toBe(true)
    expect(accepts(data({ marks: 'not a list' }))).toBe(false)
    expect(accepts(data({ marks: { start: 0 } }))).toBe(false)
    expect(accepts(data({ marks: [undefined] }))).toBe(false)
    expect(accepts(data({ marks: ['x'.repeat(LIMITS.marksChars)] }))).toBe(false)
    for (const error of [0, 3, 0.25, 1e9]) expect(accepts(data({ error }))).toBe(true)
    for (const error of [-1, -0.001, Number.NaN, Number.POSITIVE_INFINITY, '0', null]) expect(accepts(data({ error }))).toBe(false)
  })

  test('challenge: a token whose parts are the event\'s own', () => {
    const challenge = (over: object, ref = 'challenge:tr8.replay.s2') => ({ ...EXAMPLES.challenge, ref, data: { ...EXAMPLES.challenge.data, ...over } })
    expect(accepts(challenge({}))).toBe(true)
    // The ref names the token's stage.
    expect(accepts(challenge({}, 'challenge:tr8.replay.s1'))).toBe(false)
    expect(reason(challenge({}, 'challenge:tr8.replay.s1'))).toContain('tr8.replay.s2')
    expect(accepts(challenge({ seed: 1 }))).toBe(false)
    expect(accepts(challenge({ nonce: 'ZZZZZZZZZZZZZZZZ' }))).toBe(false)
    expect(accepts(challenge({ issuedOn: '20261105' }))).toBe(false)
    // The token must be the one of ARCHITECTURE §8.4.
    for (const token of [
      '',
      'es2:tr8.replay.s2:0badc0de:ABCDEFGHJKLMNPQR:20261104:1a2b3c4d',
      'es1:tr8.replay:0badc0de:ABCDEFGHJKLMNPQR:20261104:1a2b3c4d',
      'es1:tr8.replay.s2:0badc0d:ABCDEFGHJKLMNPQR:20261104:1a2b3c4d',
      'es1:tr8.replay.s2:0BADC0DE:ABCDEFGHJKLMNPQR:20261104:1a2b3c4d',
      'es1:tr8.replay.s2:0badc0de:ABCDEFGHJKLMNPQ:20261104:1a2b3c4d',
      'es1:tr8.replay.s2:0badc0de:ABCDEFGHJKLMNPQR:20261304:1a2b3c4d',
      'es1:tr8.replay.s2:0badc0de:ABCDEFGHJKLMNPQR:20261104:1a2b3c4',
      'es1:tr8.replay.s2:0badc0de:ABCDEFGHJKLMNPQR:20261104:1a2b3c4d:extra',
      'es1:TR8.replay.s2:0badc0de:ABCDEFGHJKLMNPQR:20261104:1a2b3c4d',
    ]) {
      expect(accepts(challenge({ token }))).toBe(false)
    }
    const other = 'es1:capstone.pair.s1:ffffffff:abcdefghij012345:20261230:00000000'
    expect(accepts(challenge({ token: other, seed: 0xffffffff, nonce: 'abcdefghij012345', issuedOn: '20261230' }, 'challenge:capstone.pair.s1'))).toBe(true)
  })

  test('receipt: the challenge it was bound to, checks with a verdict, and one line each of grader and environment', () => {
    const receipt = (over: object, ref = 'receipt:tr8.replay.s2') => ({ ...EXAMPLES.receipt, ref, data: { ...EXAMPLES.receipt.data, ...over } })
    expect(accepts(receipt({}))).toBe(true)
    expect(accepts(receipt({}, 'receipt:tr8.replay.s1'))).toBe(false)
    expect(accepts(receipt({ challenge: 'es1:nope' }))).toBe(false)
    expect(accepts(receipt({ checks: [] }))).toBe(false)
    for (const verdict of ['pass', 'fail', 'attested']) expect(accepts(receipt({ checks: [{ id: 'a', verdict }] }))).toBe(true)
    for (const verdict of ['skipped', 'Pass', '', null]) expect(accepts(receipt({ checks: [{ id: 'a', verdict }] }))).toBe(false)
    expect(accepts(receipt({ checks: [{ id: 'a', verdict: 'pass', bound: 'two\nlines' }] }))).toBe(false)
    expect(accepts(receipt({ checks: [{ id: 'a', verdict: 'pass', extra: 1 }] }))).toBe(false)
    for (const key of ['graderVersion', 'environment']) {
      for (const value of ['', 'two\nlines', 'tab\there', 'a'.repeat(LIMITS.lineChars + 1), 5]) expect(accepts(receipt({ [key]: value }))).toBe(false)
      expect(accepts(receipt({ [key]: 'a'.repeat(LIMITS.lineChars) }))).toBe(true)
    }
    expect(accepts(receipt({ receiptSha256: 'abc' }))).toBe(false)
  })

  test('review: a grade of 1 to 4', () => {
    for (const grade of [1, 2, 3, 4]) expect(accepts({ ...EXAMPLES.review, data: { grade } })).toBe(true)
    for (const grade of [0, 5, 2.5, '3', null, -1]) expect(accepts({ ...EXAMPLES.review, data: { grade } })).toBe(false)
  })

  test('ack: nothing but the envelope', () => {
    expect(accepts(EXAMPLES.ack)).toBe(true)
    expect(accepts({ ...EXAMPLES.ack, ref: 'change:vllm-0-34' })).toBe(true)
    expect(accepts({ ...EXAMPLES.ack, data: {} })).toBe(false)
    expect(accepts({ ...EXAMPLES.ack, data: { via: 'copy' } })).toBe(false)
  })
})

describe('hostile input', () => {
  test('a key named __proto__ is an unknown key, and it changes nothing', () => {
    const text = JSON.stringify(EXAMPLES.ack).replace('{', '{"__proto__":{"kind":"play"},')
    const parsed: unknown = JSON.parse(text)
    expect(Object.keys(parsed as object)).toContain('__proto__')
    expect(accepts(parsed)).toBe(false)
    expect(({} as Record<string, unknown>).kind).toBeUndefined()
  })

  test('a value with a prototype other than Object.prototype is not JSON', () => {
    class Answer {
      lo = 1
    }
    expect(accepts({ ...EXAMPLES.item, data: { answer: new Answer() } })).toBe(false)
    expect(accepts({ ...EXAMPLES.item, data: { answer: Object.create(null) } })).toBe(true)
  })

  test('an answer nested past the depth limit is refused, and a cycle cannot hang the decoder', () => {
    const nest = (depth: number): unknown => {
      let value: unknown = 1
      for (let level = 0; level < depth; level += 1) value = [value]
      return value
    }
    expect(accepts({ ...EXAMPLES.item, data: { answer: nest(LIMITS.jsonDepth - 1) } })).toBe(true)
    expect(accepts({ ...EXAMPLES.item, data: { answer: nest(LIMITS.jsonDepth + 1) } })).toBe(false)
    const cycle: unknown[] = []
    cycle.push(cycle)
    expect(accepts({ ...EXAMPLES.item, data: { answer: cycle } })).toBe(false)
    expect(accepts({ ...EXAMPLES.item, data: { answer: nest(100_000) } })).toBe(false)
  })

  test('a huge list is cut off by its budget, not walked to the end', () => {
    const started = performance.now()
    const huge = new Array<number>(5_000_000).fill(1)
    expect(accepts({ ...EXAMPLES.item, data: { answer: huge } })).toBe(false)
    expect(performance.now() - started).toBeLessThan(1000)
  })
})

describe('fitsJson', () => {
  const budget = { chars: 20, depth: 3 }

  test('counts what the value would take as JSON, and stops at the budget', () => {
    expect(fitsJson('abc', budget)).toBe(true)
    expect(fitsJson('x'.repeat(18), budget)).toBe(true)
    expect(fitsJson('x'.repeat(19), budget)).toBe(false)
    expect(fitsJson([1, 2, 3], budget)).toBe(true)
    expect(fitsJson(Array.from({ length: 30 }, () => 1), budget)).toBe(false)
    expect(fitsJson({ a: 1, b: 2 }, budget)).toBe(true)
    expect(fitsJson({ ['k'.repeat(30)]: 1 }, budget)).toBe(false)
  })

  test('allows null, booleans, finite numbers, strings, arrays and plain objects, and nothing else', () => {
    const big = { chars: 1000, depth: 6 }
    for (const value of [null, true, false, 0, -1.5, 1e21, '', 'é', [], {}, [[]], [{ a: [null] }]]) expect(fitsJson(value, big)).toBe(true)
    for (const value of [undefined, Number.NaN, Number.POSITIVE_INFINITY, 1n, Symbol('s'), () => 1, new Date(0), new Set(), /x/, new Uint8Array(2), [undefined], { a: undefined }]) {
      expect(fitsJson(value, big)).toBe(false)
    }
  })

  test('a list with a hole is not JSON', () => {
    // eslint-disable-next-line no-sparse-arrays
    expect(fitsJson([1, , 3], { chars: 100, depth: 3 })).toBe(false)
  })

  test('depth counts the value itself as level zero', () => {
    expect(fitsJson([[[1]]], { chars: 100, depth: 3 })).toBe(true)
    expect(fitsJson([[[[1]]]], { chars: 100, depth: 3 })).toBe(false)
  })
})
