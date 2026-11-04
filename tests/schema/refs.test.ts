/*
 * W0-T07's acceptance check 2, and the id grammar under every other schema:
 *
 *   - Every ref form in ARCHITECTURE §4.5 parses, and a malformed ref fails.
 *   - So does every concrete ref the design docs write, and every kernelspace ref the curriculum writes.
 *   - The id patterns agree with the ones the architecture spells out (§9.6's lab and stage, §4.4's lock keys).
 *
 * The document tests read docs/ARCHITECTURE.md and the curriculum files themselves, so a form added to the document without
 * the grammar (or the reverse) fails here.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import {
  claimIdSchema,
  formatRef,
  kcIdSchema,
  kcRefSchema,
  ksRefSchema,
  labIdSchema,
  labOfStage,
  lessonIdSchema,
  lockKeySchema,
  moduleIdSchema,
  moduleOfKc,
  moduleOfRef,
  parseRef,
  predictIdSchema,
  prereqSchema,
  receiptLabIdSchema,
  REF_KINDS,
  refSchema,
  stageIdSchema,
} from '@es/schema/refs'
import { between, read, root } from './support'

const architecture = read('docs/ARCHITECTURE.md')

type Schema = { safeParse: (value: unknown) => { success: boolean } }
/** The values the schema refuses. A test that expects it to take them all expects this to be empty. */
const refused = (schema: Schema, values: string[]) => values.filter((value) => !schema.safeParse(value).success)
/** The values the schema takes. A test that expects it to refuse them all expects this to be empty. */
const taken = (schema: Schema, values: string[]) => values.filter((value) => schema.safeParse(value).success)

describe('the ref forms of ARCHITECTURE §4.5', () => {
  /** An example of each form, in the order §4.5 lists them. The keys are §4.5's own templates. */
  const examples: Record<string, string[]> = {
    'item:gen/<family>/<variant>': ['item:gen/tr2.bubble-width/async-on'],
    'play:<game>/<level>': ['play:loop/close', 'play:broken-bench/court', 'play:switchyard/load-or-recompute'],
    'lab:<lab>': ['lab:hybrid-kv', 'lab:tr8.replay'],
    'trace:<trace>/<task>': ['trace:base-step/gap'],
    'challenge:<lab>.<stage>': ['challenge:tr8.replay.s2', 'challenge:capstone.pair.s1'],
    'receipt:<lab>.<stage>': ['receipt:tr0.forward.s2', 'receipt:tr5b.connector.s3', 'receipt:capstone.pair.s1'],
    'prove:<lab>': ['prove:hybrid-kv', 'prove:kv-publisher', 'prove:tr8.replay'],
    'predict:<lesson>#<id>': ['predict:tr2.l3#tr2.l3.p1', 'predict:tr2.l3#p1'],
    'review:<kc>': ['review:tr2.async-overlap', 'review:cap.paired-runs'],
  }

  const templates = [...between(architecture, '### 4.5 Knowledge components and refs', '### 4.6').matchAll(/^- `([^`]+:[^`]*)`$/gm)].map((m) => m[1])

  test('§4.5 lists the nine forms that these examples cover', () => {
    expect(templates.length).toBe(9)
    expect([...templates].sort()).toEqual(Object.keys(examples).sort())
  })

  for (const [template, refs] of Object.entries(examples)) {
    test(`${template} parses, and formats back to the same text`, () => {
      for (const ref of refs) {
        const parsed = parseRef(ref)
        if (parsed === null) throw new Error(`${ref} did not parse`)
        expect(parsed.kind).toBe(template.slice(0, template.indexOf(':')))
        expect(formatRef(parsed)).toBe(ref)
        expect(refSchema.safeParse(ref).success).toBe(true)
      }
    })
  }

  test('the parts of each form come out under their names', () => {
    expect(parseRef('item:gen/tr2.bubble-width/async-on')).toEqual({ kind: 'item', family: 'tr2.bubble-width', variant: 'async-on' })
    expect(parseRef('play:loop/close')).toEqual({ kind: 'play', game: 'loop', level: 'close' })
    expect(parseRef('lab:hybrid-kv')).toEqual({ kind: 'lab', lab: 'hybrid-kv' })
    expect(parseRef('trace:base-step/gap')).toEqual({ kind: 'trace', trace: 'base-step', task: 'gap' })
    expect(parseRef('challenge:tr8.replay.s2')).toEqual({ kind: 'challenge', stage: 'tr8.replay.s2' })
    expect(parseRef('receipt:tr0.forward.s2')).toEqual({ kind: 'receipt', stage: 'tr0.forward.s2' })
    expect(parseRef('prove:tr8.replay')).toEqual({ kind: 'prove', lab: 'tr8.replay' })
    expect(parseRef('predict:tr2.l3#tr2.l3.p1')).toEqual({ kind: 'predict', lesson: 'tr2.l3', id: 'tr2.l3.p1' })
    expect(parseRef('review:tr2.async-overlap')).toEqual({ kind: 'review', kc: 'tr2.async-overlap' })
  })

  test('an ack takes the two forms of §7.2', () => {
    expect(parseRef('screen:welcome')).toEqual({ kind: 'screen', id: 'welcome' })
    expect(parseRef('change:vllm-0-34')).toEqual({ kind: 'change', id: 'vllm-0-34' })
    expect(REF_KINDS.length).toBe(11)
  })

  test('a stage belongs to the lab before its last dot', () => {
    expect(labOfStage('tr8.replay.s2')).toBe('tr8.replay')
    expect(labOfStage('capstone.pair.s1')).toBe('capstone.pair')
  })
})

describe('every concrete ref the design docs write', () => {
  const files = ['docs', 'curriculum'].flatMap((dir) => readdirSync(path.join(root, dir)).map((name) => `${dir}/${name}`))
  const written = new Set(
    files
      .filter((file) => file.endsWith('.md'))
      .flatMap((file) => [...read(file).matchAll(/`((?:item|play|lab|trace|challenge|receipt|prove|predict|review|screen|change):[^`<>\s]+)`/g)].map((m) => m[1])),
  )

  test('there are some to check', () => {
    expect(written.size).toBeGreaterThan(30)
  })

  test('each one parses and formats back to the same text', () => {
    const bad = [...written].filter((ref) => {
      const parsed = parseRef(ref)
      return parsed === null || formatRef(parsed) !== ref || !refSchema.safeParse(ref).success
    })
    expect(bad).toEqual([])
  })
})

describe('a malformed ref fails', () => {
  const malformed = [
    // not a ref at all
    '',
    'play',
    'play:',
    'quiz:lesson',
    'unknown:x',
    'PLAY:loop/close',
    'ks:T5.L7',
    // a part missing or extra
    'play:loop',
    'play:loop/',
    'play:/close',
    'play:loop/close/extra',
    'item:gen/tr2.bubble-width',
    'item:tr2.bubble-width/async-on',
    'trace:base-step',
    'trace:base-step/',
    'lab:',
    'prove:',
    'review:',
    'screen:',
    'predict:tr2.l3',
    'predict:tr2.l3#',
    'predict:tr2#p1',
    'challenge:tr8.replay',
    'receipt:tr0.forward',
    'challenge:tr8.replay.s2.x',
    // an id out of its grammar
    'play:Loop/close',
    'play:loop/Close',
    'play:loop--x/close',
    'play:-loop/close',
    'play:loop_x/close',
    'lab:Hybrid-kv',
    'lab:hybrid_kv',
    'lab:tr8.',
    'lab:tr9.replay',
    'item:gen/bubble-width/async-on',
    'item:gen/tr9.bubble-width/async-on',
    'predict:tr2.l3#P1',
    'predict:tr2.L3#p1',
    'review:t5.kv-capacity',
    'review:ks:t5.kv-capacity',
    'review:tr2',
    'review:tr2.Async',
    'change:a/b',
    // a stage needs its number, and a forge lab issues no challenge or receipt
    'challenge:tr8.replay.s',
    'challenge:tr8.replay.2',
    'challenge:replay.s2',
    'challenge:tr9.replay.s2',
    'challenge:hybrid-kv.s1',
    'receipt:tr0.forward.stage2',
    // whitespace
    ' play:loop/close',
    'play:loop/close ',
    'play:loop/close\n',
    'play:loop close',
  ]

  test('parseRef gives null', () => {
    expect(malformed.filter((ref) => parseRef(ref) !== null)).toEqual([])
  })

  test('refSchema refuses it', () => {
    expect(taken(refSchema, malformed)).toEqual([])
  })

  test('refSchema and parseRef agree on every string here and in the examples', () => {
    const valid = ['play:loop/close', 'lab:tr8.replay', 'receipt:tr0.forward.s2', 'predict:tr2.l3#tr2.l3.p1', 'review:cap.paired-runs', 'screen:welcome']
    for (const ref of [...valid, ...malformed]) expect(refSchema.safeParse(ref).success).toBe(parseRef(ref) !== null)
  })

  test('a value that is not a string is refused', () => {
    expect(refSchema.safeParse(7).success).toBe(false)
    expect(refSchema.safeParse(null).success).toBe(false)
    expect(refSchema.safeParse({ kind: 'play', game: 'loop', level: 'close' }).success).toBe(false)
  })
})

describe('a long string that is not an id fails fast', () => {
  // A ledger import is a file the learner chose, so a pattern that backtracks without bound would stall the tab. The strings
  // below are the shapes that break an ambiguous pattern: repeated separators, and a near miss at the very end.
  const long = 50_000
  const hostile = [
    `${'a-'.repeat(long / 2)}!`,
    `${'a.'.repeat(long / 2)}!`,
    `${'a-b.'.repeat(long / 4)}!`,
    `tr2.${'a-'.repeat(long / 2)}!`,
    `predict:tr2.l3#${'a.'.repeat(long / 2)}!`,
    `ks:t5.${'a-'.repeat(long / 2)}!`,
    `${'a'.repeat(long)}!`,
  ]
  const schemas = [refSchema, claimIdSchema, kcIdSchema, kcRefSchema, ksRefSchema, prereqSchema, labIdSchema, stageIdSchema, lockKeySchema, lessonIdSchema]

  test('every pattern answers within two seconds for all of them, where a blow-up would not return at all', () => {
    const start = performance.now()
    for (const schema of schemas) for (const input of hostile) expect(schema.safeParse(input).success).toBe(false)
    for (const input of hostile) expect(parseRef(input)).toBeNull()
    expect(performance.now() - start).toBeLessThan(2000)
  })
})

describe('the identifiers', () => {
  test('a module is tr0 to tr8 with tr5a and tr5b, or capstone', () => {
    expect(refused(moduleIdSchema, ['tr0', 'tr2', 'tr5a', 'tr5b', 'tr8', 'capstone'])).toEqual([])
    expect(taken(moduleIdSchema, ['', 'tr9', 'tr', 'TR2', 'tr2.l3', 'tr5c', 'cap', 'tr10', ' tr2'])).toEqual([])
  })

  test('a lesson is its module and l and a number', () => {
    expect(refused(lessonIdSchema, ['tr2.l3', 'tr5a.l2', 'tr0.l0', 'capstone.l1', 'tr8.l12'])).toEqual([])
    expect(taken(lessonIdSchema, ['tr2', 'tr2.l', 'tr2.3', 'tr2.L3', 'tr2.l3.p1', 'l3', 'tr9.l1', 'tr2.l0-sample'])).toEqual([])
  })

  test('a prediction is its lesson and p and a number', () => {
    expect(refused(predictIdSchema, ['tr2.l3.p1', 'tr5a.l2.p12'])).toEqual([])
    expect(taken(predictIdSchema, ['tr2.l3', 'tr2.l3.p', 'tr2.l3.q1', 'p1', 'tr2.l3.p1.x'])).toEqual([])
  })

  test('a KC is a module (the capstone is cap) and a slug', () => {
    expect(refused(kcIdSchema, ['tr2.async-overlap', 'tr5a.kv-groups', 'cap.paired-runs', 'tr0.tensor-metadata'])).toEqual([])
    expect(taken(kcIdSchema, ['tr2', 'tr2.', 'tr2.Async', 'tr2.a.b', 'capstone.x', 'ks:t5.kv-capacity', 't5.kv-capacity', 'tr9.x'])).toEqual([])
  })

  test('an edge between KCs may name a kernelspace KC, and a kernelspace ref also covers lessons', () => {
    expect(refused(kcRefSchema, ['tr2.bubble', 'ks:t5.kv-capacity', 'ks:r.borrow-rules'])).toEqual([])
    expect(taken(kcRefSchema, ['ks:T5.L7', 't5.kv-capacity', 'ks:t8.x', 'ks:t5', 'ks:'])).toEqual([])
    expect(refused(ksRefSchema, ['ks:T5.L7', 'ks:T0.L6', 'ks:R.L3', 'ks:t5.kv-capacity'])).toEqual([])
    expect(taken(ksRefSchema, ['T5.L7', 'ks:T8.L1', 'ks:T5L7', 'ks:T5.L', 'ks:t5.L7', 'ks:T5.l7.x', 'tr2.bubble', 'ks:T5.L7 '])).toEqual([])
  })

  test('a prerequisite is a module or a kernelspace ref', () => {
    expect(refused(prereqSchema, ['tr2', 'capstone', 'ks:T5.L7', 'ks:t5.kv-capacity'])).toEqual([])
    expect(taken(prereqSchema, ['tr9', 'T5.L7', 'tr2.l3', 'tr2.bubble'])).toEqual([])
  })

  test('a lab is a forge lab slug or a module-prefixed lab, and only the second has stages', () => {
    expect(refused(labIdSchema, ['hybrid-kv', 'kv-publisher', 'rejection-sampler', 'tr8.replay', 'capstone.pair'])).toEqual([])
    expect(taken(labIdSchema, ['', 'Hybrid', 'hybrid_kv', 'tr9.replay', 'tr8.replay.s1', 'tr8.', '.replay'])).toEqual([])
    expect(refused(receiptLabIdSchema, ['tr8.replay', 'tr5b.connector', 'capstone.pair'])).toEqual([])
    expect(taken(receiptLabIdSchema, ['hybrid-kv', 'tr8', 'tr8.replay.s1'])).toEqual([])
    expect(refused(stageIdSchema, ['tr8.replay.s1', 'tr3.profile.s5', 'capstone.pair.s2', 'tr1.fork.s10'])).toEqual([])
    expect(taken(stageIdSchema, ['tr8.replay', 'hybrid-kv.s1', 'tr8.replay.s', 'tr8.replay.S1', 'tr8.replay.s1.s2'])).toEqual([])
  })

  test('a claim has at least two dotted segments', () => {
    expect(refused(claimIdSchema, ['vllm.async-scheduling.default', 'hw.h100-sxm.hbm-bw', 'a.b'])).toEqual([])
    expect(taken(claimIdSchema, ['vllm', 'vllm.', '.vllm', 'vllm..x', 'Vllm.x', 'vllm.x_y', 'vllm.x '])).toEqual([])
  })
})

describe('the identifiers agree with the architecture', () => {
  test("every key in ARCHITECTURE §4.4's pin table is a lock key", () => {
    const table = between(architecture, '| Key | Proposed pin | Evidence |', '**Why vLLM and SGLang each get their own environment.**')
    const keys = table
      .split('\n')
      .filter((line) => line.startsWith('| `'))
      .map((line) => line.split('|')[1])
      .flatMap((cell) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]))
    expect(keys).toEqual(['vllm', 'sglang', 'inside-vllm', 'nano-vllm', 'mini-sglang', 'nsys', 'ncu', 'perfetto', 'qwen3-0.6b', 'burstgpt-v2'])
    expect(refused(lockKeySchema, keys)).toEqual([])
    expect(taken(lockKeySchema, ['', 'Vllm', 'vllm_', '-vllm', 'vllm-', 'vllm..x', 'qwen3 0.6b'])).toEqual([])
  })

  test("a lab and a stage mean what §9.6's patterns mean", () => {
    const section = between(architecture, '### 9.6 The receipt format', '**The bundle')
    const pattern = (field: string) => {
      const found = new RegExp(`^  ${field}:\\s+\\{ pattern: '([^']+)' \\}`, 'm').exec(section)
      if (found === null) throw new Error(`§9.6 no longer gives a pattern for ${field}`)
      return new RegExp(found[1])
    }
    const lab = pattern('lab')
    const stage = pattern('stage')
    const candidates = [
      'tr8.replay', 'tr0.forward', 'capstone.pair', 'tr5b.connector', 'tr8.replay.s2', 'tr1.fork.s10', 'capstone.pair.s1',
      'tr9.replay', 'tr8', 'hybrid-kv', 'TR8.replay', 'tr8.Replay', 'tr8.replay.s', 'tr8.replay.2', 'tr8.', 'tr8.replay.s1.s2',
      'tr8.re_play', 'tr8.replay s1', '',
    ]
    // The two agree on every candidate. (The grammar also refuses a stray hyphen, such as tr8.-x, which §9.6's pattern allows.)
    expect(candidates.map((s) => receiptLabIdSchema.safeParse(s).success)).toEqual(candidates.map((s) => lab.test(s)))
    expect(candidates.map((s) => stageIdSchema.safeParse(s).success)).toEqual(candidates.map((s) => stage.test(s)))
  })

  test('every kernelspace ref the curriculum writes is a kernelspace ref', () => {
    const refs = new Set(
      readdirSync(path.join(root, 'curriculum')).flatMap((name) => [...read(`curriculum/${name}`).matchAll(/`(ks:[^`\s]+)`/g)].map((m) => m[1])),
    )
    expect(refs.size).toBeGreaterThan(20)
    expect(refused(ksRefSchema, [...refs])).toEqual([])
    expect(refused(kcRefSchema, [...refs])).toEqual([])
  })
})

describe('the module that a KC or a ref belongs to', () => {
  const none = () => undefined

  test('a KC belongs to the module it begins with, and the capstone is cap', () => {
    expect(moduleOfKc('tr2.async-overlap')).toBe('tr2')
    expect(moduleOfKc('tr5a.pool-sizing')).toBe('tr5a')
    expect(moduleOfKc('cap.attribution')).toBe('capstone')
  })

  test('a ref belongs to the module its lesson, family, lab, stage or KC begins with', () => {
    const refs: [string, string][] = [
      ['predict:tr2.l3#tr2.l3.p1', 'tr2'],
      ['item:gen/tr2.bubble-width/a', 'tr2'],
      ['lab:tr8.replay', 'tr8'],
      ['prove:tr3.profile', 'tr3'],
      ['challenge:tr8.replay.s2', 'tr8'],
      ['receipt:tr8.replay.s2', 'tr8'],
      ['review:tr6.exactness', 'tr6'],
      ['review:cap.attribution', 'capstone'],
    ]
    for (const [ref, module] of refs) expect(moduleOfRef(ref, none), ref).toBe(module)
  })

  test('a game belongs to the module the registry gives, and a ref that names no module belongs to none', () => {
    expect(moduleOfRef('play:loop/close', (game) => (game === 'loop' ? 'tr2' : undefined))).toBe('tr2')
    expect(moduleOfRef('play:pool/evict', none)).toBeNull()
    for (const ref of ['lab:hybrid-kv', 'trace:t1/a', 'screen:welcome', 'change:c1', 'not a ref', '']) expect(moduleOfRef(ref, none), ref).toBeNull()
  })
})
