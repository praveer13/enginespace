/**
 * The strict codec (ARCHITECTURE §7.2, §7.5, D-024): untrusted input in, a typed event or a reason out, and the one function that
 * makes an event.
 *
 * Everything that enters the ledger from outside passes `decodeEvent`: an import file, an outbox entry that a crash left behind,
 * a message from another tab. It accepts exactly the shapes of types.ts and nothing else:
 *   - an unknown kind, an unknown key anywhere, a missing field or a wrong type is refused. A field that a newer build adds
 *     comes with a newer `SCHEMA_VERSION`, and an older build refuses the whole export (`parseExport`) instead of dropping it;
 *   - the ref must be one of A§4.5's forms and must fit the kind (a `play` event has a `play:` ref);
 *   - `score` lies in [0, 1], `provenance` is one of the seven names, and `day` is the day of `at` shifted by `tz`;
 *   - every JSON value, text and list is bounded (LIMITS), because an import is a file the learner chose and may have edited.
 *
 * The schemas are zod, as in packages/schema. Each is annotated with the type it must produce, so a field added to types.ts and
 * not here, or the reverse, fails to compile. The ref grammar is packages/schema's; this file adds which forms a kind takes.
 *
 * Decoding checks form and not truth. A receipt's `sha256` is not recomputed here (the verifier hashes with `crypto.subtle`),
 * and a token's checksum is not checked. The free JSON of an event (an answer, a reply, the marks) is bounded and checked, and
 * it is not copied: the decoded event holds the input's own object there.
 */
import { z } from 'zod'
import { parseRef, stageIdSchema } from '@es/schema/refs'
import type { RefKind } from '@es/schema/refs'
import { dayOf, isIsoInstant, isLocalDay } from './ids'
import { canonicalJson, mergeEvents, mergeReceipts } from './merge'
import { PROVENANCES } from './provenance'
import { CONFIDENCES, EVENT_VERSION, EXPORT_SCHEMA, LIMITS, SCHEMA_VERSION } from './types'
import type {
  ChallengeEvent,
  Draft,
  EventOf,
  ExportFile,
  Json,
  Kind,
  Ledger,
  LedgerEvent,
  PredictEvent,
  PredictValue,
  ProveEvent,
  ReceiptEvent,
  ReceiptRecord,
  WorkingRecord,
  WriterContext,
} from './types'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Results                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

export type Decoded<T> = { ok: true; value: T } | { ok: false; reason: string }

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason })

/** A short form of an untrusted value, for a message. It never calls a method that the value brought with it. */
function quote(value: unknown): string {
  if (typeof value === 'string') {
    const text = JSON.stringify(value)
    return text.length > 60 ? `${text.slice(0, 57)}...` : text
  }
  if (Array.isArray(value)) return 'a list'
  if (value === null) return 'null'
  switch (typeof value) {
    case 'object':
      return 'an object'
    case 'function':
      return 'a function'
    case 'symbol':
      return 'a symbol'
    default:
      return String(value)
  }
}

/** `path: message` for the first few issues, so an error names the place in the event and not only the rule. */
function describe(error: z.ZodError): string {
  const shown = error.issues.slice(0, 3).map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`)
  const more = error.issues.length - shown.length
  return more > 0 ? `${shown.join('; ')} (and ${more} more)` : shown.join('; ')
}

/** Removes the members that are `undefined`, in place, so a stored event holds what a JSON file would. */
function dropUndefined<T>(value: T, depth = 0): T {
  if (depth > LIMITS.jsonDepth + 4 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    for (const item of value) dropUndefined(item, depth + 1)
    return value
  }
  const record = value as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key]
    else dropUndefined(record[key], depth + 1)
  }
  return value
}

function decode<T>(schema: z.ZodType<T>, input: unknown): Decoded<T> {
  const result = schema.safeParse(input)
  return result.success ? { ok: true, value: dropUndefined(result.data) } : fail(describe(result.error))
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Bounded JSON                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface JsonBudget {
  /** The characters the value may take as JSON, counted as the walk goes. */
  chars: number
  depth: number
}

/**
 * Whether a value is JSON within a budget: plain objects and arrays, finite numbers, strings, booleans and null, nested no
 * deeper than the budget, and small enough. The walk stops at the first excess, so a hostile value costs no more than its
 * budget.
 */
export function fitsJson(value: unknown, budget: JsonBudget): value is Json {
  let chars = 0
  const walk = (item: unknown, depth: number): boolean => {
    if (depth > budget.depth) return false
    switch (typeof item) {
      case 'string':
        chars += item.length + 2
        break
      case 'number':
        if (!Number.isFinite(item)) return false
        chars += String(item).length
        break
      case 'boolean':
        chars += 5
        break
      case 'object': {
        if (item === null) {
          chars += 4
          break
        }
        if (Array.isArray(item)) {
          chars += 2
          for (let index = 0; index < item.length; index += 1) {
            chars += 1
            if (chars > budget.chars || !walk(item[index], depth + 1)) return false
          }
          break
        }
        const proto: unknown = Object.getPrototypeOf(item)
        if (proto !== Object.prototype && proto !== null) return false
        chars += 2
        for (const key of Object.keys(item)) {
          chars += key.length + 4
          if (chars > budget.chars || !walk((item as Record<string, unknown>)[key], depth + 1)) return false
        }
        break
      }
      default:
        return false
    }
    return chars <= budget.chars
  }
  return walk(value, 0)
}

const json = (chars: number, what: string) =>
  z.custom<Json>((value) => fitsJson(value, { chars, depth: LIMITS.jsonDepth }), `must be JSON of at most ${chars} characters: ${what}`)

/* ------------------------------------------------------------------------------------------------------------------ */
/* Fragments                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

const ID_MESSAGE = `must be at most ${LIMITS.idChars} letters, digits, hyphens or underscores, and start with a letter or a digit`
const id = z.string().max(LIMITS.idChars).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, ID_MESSAGE)
const instant = z.string().refine(isIsoInstant, 'must be an ISO instant as toISOString writes it, such as 2026-11-04T09:30:00.000Z')
const day = z.string().refine(isLocalDay, 'must be a calendar day written YYYY-MM-DD')
const uint32 = z.int().min(0).max(0xffffffff)
const sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'must be 64 lowercase hex digits (a SHA-256)')
/** One line of plain text. */
const line = z
  .string()
  .min(1)
  .max(LIMITS.lineChars)
  .regex(/^[^\p{Cc}]*$/u, 'must be one line of plain text')
/** An option id, as a choice prediction names it. */
const choiceId = z
  .string()
  .max(LIMITS.idChars)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, 'must be an option id')

/** The refs a kind may take (A§7.2's table). `ack` takes the two forms of an acknowledgement. */
export const KIND_REFS: Readonly<Record<Kind, readonly RefKind[]>> = {
  predict: ['predict'],
  item: ['item'],
  play: ['play'],
  'lab-check': ['lab'],
  prove: ['prove'],
  'trace-mark': ['trace'],
  challenge: ['challenge'],
  receipt: ['receipt'],
  review: ['review'],
  ack: ['screen', 'change'],
}

const envelope = {
  id,
  v: z.literal(EVENT_VERSION),
  ref: z.string().max(LIMITS.refChars),
  at: instant,
  tz: z.int().min(-LIMITS.tzMinutes).max(LIMITS.tzMinutes),
  day,
  dev: id,
  rev: z
    .string()
    .regex(/^[0-9a-z]+$/, 'must be lowercase letters and digits')
    .min(LIMITS.revCharsMin)
    .max(LIMITS.revChars)
    .optional(),
}

const graded = {
  score: z.number().min(0).max(1),
  ok: z.boolean(),
  provenance: z.enum(PROVENANCES),
  seed: uint32.optional(),
  conf: z.enum(CONFIDENCES).optional(),
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Checks across fields                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Problem {
  path: (string | number)[]
  message: string
}

interface Reporter {
  addIssue(issue: { code: 'custom'; message: string; path: (string | number)[] }): void
}

function report(ctx: Reporter, ...lists: Problem[][]): void {
  for (const list of lists) for (const problem of list) ctx.addIssue({ code: 'custom', message: problem.message, path: problem.path })
}

/**
 * What every event must satisfy beyond its fields: the frozen day, and a ref that fits the kind. zod runs these after the fields
 * that have the right type, even when one of them failed a refinement, so a value here may still be malformed (an `at` that is
 * not an instant). That field has been reported already, and what depends on it is left out.
 */
function envelopeProblems(event: { kind: Kind; ref: string; at: string; tz: number; day: string }): Problem[] {
  const problems: Problem[] = []
  if (isIsoInstant(event.at) && Number.isInteger(event.tz) && Math.abs(event.tz) <= LIMITS.tzMinutes) {
    const expected = dayOf(event.at, event.tz)
    if (event.day !== expected) problems.push({ path: ['day'], message: `must be ${expected}, the day of at shifted by tz` })
  }
  const ref = parseRef(event.ref)
  if (ref === null) {
    problems.push({ path: ['ref'], message: `${quote(event.ref)} is not a ledger ref (ARCHITECTURE §4.5)` })
  } else if (!KIND_REFS[event.kind].includes(ref.kind)) {
    const takes = KIND_REFS[event.kind].map((form) => `${form}:`).join(' or ')
    problems.push({ path: ['ref'], message: `${quote(event.ref)} does not fit a ${event.kind} event, which takes a ${takes} ref` })
  }
  return problems
}

const predictShape = (value: PredictValue): string => (typeof value === 'number' ? 'number' : typeof value === 'string' ? 'choice' : 'interval')

function predictProblems(event: PredictEvent): Problem[] {
  const { value, truth } = event.data
  const problems: Problem[] = []
  if (predictShape(value) !== predictShape(truth)) {
    problems.push({ path: ['data', 'truth'], message: `must have the shape of value, which is a ${predictShape(value)}, and not a ${predictShape(truth)}` })
  }
  for (const [key, entry] of [['value', value], ['truth', truth]] as const) {
    if (typeof entry === 'object' && entry.lo > entry.hi) problems.push({ path: ['data', key], message: 'an interval needs lo at most hi' })
  }
  return problems
}

function proveProblems(event: ProveEvent): Problem[] {
  const ref = parseRef(event.ref)
  if (ref === null || ref.kind !== 'prove') return []
  const { wasmSha256, receiptSha256 } = event.data
  // A forge lab is a bare slug and has a module; a lab with a receipt is module-prefixed (packages/schema's refs).
  const forge = !ref.lab.includes('.')
  const problems: Problem[] = []
  if (forge) {
    if (wasmSha256 === undefined) problems.push({ path: ['data', 'wasmSha256'], message: 'a forge lab names the module it asked about' })
    if (receiptSha256 !== undefined) problems.push({ path: ['data', 'receiptSha256'], message: 'a forge lab has no receipt' })
  } else {
    if (receiptSha256 === undefined) problems.push({ path: ['data', 'receiptSha256'], message: 'a lab with a receipt names the receipt it asked about' })
    if (wasmSha256 !== undefined) problems.push({ path: ['data', 'wasmSha256'], message: 'a lab with a receipt has no forge module' })
  }
  return problems
}

/** The parts of a challenge token (A§8.4): `es1:<lab>.<stage>:<seed>:<nonce>:<issued>:<fnv32>`. */
export interface ChallengeToken {
  stage: string
  /** The seed, read from its 8 hex digits. */
  seed: number
  nonce: string
  /** `YYYYMMDD`. */
  issuedOn: string
  /** The FNV-1a checksum as written. It catches typos and is not checked here. */
  checksum: string
}

const TOKEN = /^es1:([^:]+):([0-9a-f]{8}):([A-Za-z0-9]{16}):([0-9]{8}):([0-9a-f]{8})$/

/** Takes a challenge token apart, or returns null when it is not one. */
export function parseChallengeToken(token: string): ChallengeToken | null {
  const match = TOKEN.exec(token)
  if (match === null || !stageIdSchema.safeParse(match[1]).success) return null
  const issued = `${match[4].slice(0, 4)}-${match[4].slice(4, 6)}-${match[4].slice(6)}`
  if (!isLocalDay(issued)) return null
  return { stage: match[1], seed: Number.parseInt(match[2], 16), nonce: match[3], issuedOn: match[4], checksum: match[5] }
}

const TOKEN_MESSAGE = 'must be a challenge token es1:<lab>.<stage>:<seed>:<nonce>:<issued>:<checksum> (ARCHITECTURE §8.4)'

function challengeProblems(event: ChallengeEvent): Problem[] {
  const token = parseChallengeToken(event.data.token)
  if (token === null) return [{ path: ['data', 'token'], message: TOKEN_MESSAGE }]
  const problems: Problem[] = []
  const ref = parseRef(event.ref)
  if (ref !== null && ref.kind === 'challenge' && ref.stage !== token.stage) {
    problems.push({ path: ['ref'], message: `names stage ${ref.stage}, and the token names ${token.stage}` })
  }
  if (token.seed !== event.data.seed) problems.push({ path: ['data', 'seed'], message: 'must be the seed in the token' })
  if (token.nonce !== event.data.nonce) problems.push({ path: ['data', 'nonce'], message: 'must be the nonce in the token' })
  if (token.issuedOn !== event.data.issuedOn) problems.push({ path: ['data', 'issuedOn'], message: 'must be the issue date in the token' })
  return problems
}

function receiptProblems(event: ReceiptEvent): Problem[] {
  const token = parseChallengeToken(event.data.challenge)
  if (token === null) return [{ path: ['data', 'challenge'], message: TOKEN_MESSAGE }]
  const ref = parseRef(event.ref)
  if (ref !== null && ref.kind === 'receipt' && ref.stage !== token.stage) {
    return [{ path: ['ref'], message: `names stage ${ref.stage}, and the challenge names ${token.stage}` }]
  }
  return []
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Events                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

const predictValue = z.union([z.number(), choiceId, z.strictObject({ lo: z.number(), hi: z.number() })])

const predictSchema = z
  .strictObject({
    ...envelope,
    kind: z.literal('predict'),
    ...graded,
    data: z.strictObject({ value: predictValue, truth: predictValue, unit: line.optional() }),
  })
  .superRefine((event, ctx) => report(ctx, envelopeProblems(event), predictProblems(event)))

const itemSchema = z
  .strictObject({
    ...envelope,
    kind: z.literal('item'),
    ...graded,
    data: z.strictObject({ answer: json(LIMITS.answerChars, 'the learner\'s answer') }),
  })
  .superRefine((event, ctx) => report(ctx, envelopeProblems(event)))

const playSchema = z
  .strictObject({
    ...envelope,
    kind: z.literal('play'),
    ...graded,
    data: z.strictObject({ actions: z.string().max(LIMITS.actionsChars), actionsSha256: sha256 }),
  })
  .superRefine((event, ctx) => report(ctx, envelopeProblems(event)))

const labCheckSchema = z
  .strictObject({
    ...envelope,
    kind: z.literal('lab-check'),
    ...graded,
    data: z.strictObject({
      wasmSha256: sha256,
      seeds: z.array(uint32).max(LIMITS.seeds),
      checks: z
        .array(
          z.strictObject({
            id: z
              .string()
              .max(LIMITS.idChars)
              .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, 'must be a check id'),
            status: z.enum(['pass', 'fail', 'trap', 'timeout']),
            seed: uint32.optional(),
          }),
        )
        .min(1)
        .max(LIMITS.checks),
    }),
  })
  .superRefine((event, ctx) => report(ctx, envelopeProblems(event)))

const proveSchema = z
  .strictObject({
    ...envelope,
    kind: z.literal('prove'),
    ...graded,
    data: z.strictObject({
      predicted: json(LIMITS.answerChars, 'the predicted reply'),
      actual: json(LIMITS.answerChars, 'the actual reply, or null'),
      agentClosed: z.boolean(),
      wasmSha256: sha256.optional(),
      receiptSha256: sha256.optional(),
    }),
  })
  .superRefine((event, ctx) => report(ctx, envelopeProblems(event), proveProblems(event)))

const traceMarkSchema = z
  .strictObject({
    ...envelope,
    kind: z.literal('trace-mark'),
    ...graded,
    data: z.strictObject({
      marks: z.custom<Json[]>(
        (value) => Array.isArray(value) && fitsJson(value, { chars: LIMITS.marksChars, depth: LIMITS.jsonDepth }),
        `must be a list of JSON of at most ${LIMITS.marksChars} characters`,
      ),
      error: z.number().min(0),
    }),
  })
  .superRefine((event, ctx) => report(ctx, envelopeProblems(event)))

const challengeSchema = z
  .strictObject({
    ...envelope,
    kind: z.literal('challenge'),
    data: z.strictObject({
      token: z.string().max(LIMITS.lineChars),
      seed: uint32,
      nonce: z.string().regex(/^[A-Za-z0-9]{16}$/, 'must be 16 letters or digits'),
      issuedOn: z.string().regex(/^[0-9]{8}$/, 'must be YYYYMMDD'),
    }),
  })
  .superRefine((event, ctx) => report(ctx, envelopeProblems(event), challengeProblems(event)))

const receiptSchema = z
  .strictObject({
    ...envelope,
    kind: z.literal('receipt'),
    ...graded,
    data: z.strictObject({
      receiptSha256: sha256,
      challenge: z.string().max(LIMITS.lineChars),
      checks: z
        .array(
          z.strictObject({
            id: z
              .string()
              .max(LIMITS.idChars)
              .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, 'must be a check id'),
            verdict: z.enum(['pass', 'fail', 'attested']),
            bound: line.optional(),
          }),
        )
        .min(1)
        .max(LIMITS.checks),
      graderVersion: line,
      environment: line,
    }),
  })
  .superRefine((event, ctx) => report(ctx, envelopeProblems(event), receiptProblems(event)))

const reviewSchema = z
  .strictObject({
    ...envelope,
    kind: z.literal('review'),
    ...graded,
    data: z.strictObject({ grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) }),
  })
  .superRefine((event, ctx) => report(ctx, envelopeProblems(event)))

const ackSchema = z.strictObject({ ...envelope, kind: z.literal('ack') }).superRefine((event, ctx) => report(ctx, envelopeProblems(event)))

/** One schema per kind. The annotation is the compile-time check that each produces the type in types.ts. */
const EVENT_SCHEMAS: { [K in Kind]: z.ZodType<EventOf<K>> } = {
  predict: predictSchema,
  item: itemSchema,
  play: playSchema,
  'lab-check': labCheckSchema,
  prove: proveSchema,
  'trace-mark': traceMarkSchema,
  challenge: challengeSchema,
  receipt: receiptSchema,
  review: reviewSchema,
  ack: ackSchema,
}

/** Decodes one event from untrusted input, or says why it cannot. */
export function decodeEvent(input: unknown): Decoded<LedgerEvent> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return fail('not an object')
  const kind = (input as { kind?: unknown }).kind
  if (typeof kind !== 'string' || !Object.hasOwn(EVENT_SCHEMAS, kind)) return fail(`unknown kind ${quote(kind)}`)
  return decode<LedgerEvent>(EVENT_SCHEMAS[kind as Kind], input)
}

/**
 * Makes an event: the draft the grading code supplies, plus the id, the instant, the zone, the day and the device. The day is
 * computed here, once, from `at` and `tz`, and it is frozen into the event. The result has passed `decodeEvent`, so a draft
 * that breaks a rule throws here, where the bug is, and not at the next import.
 */
export function stampEvent<K extends Kind>(context: WriterContext, draft: Draft<K> & { kind: K }): EventOf<K> {
  const at = context.clock.nowIso()
  if (!isIsoInstant(at)) throw new Error(`cannot write the event: the clock gave ${quote(at)}, which is not an ISO instant`)
  const tz = context.clock.tzOffsetMinutes(at)
  const candidate = { ...(draft as object), id: context.newId(), v: EVENT_VERSION, at, tz, day: dayOf(at, tz), dev: context.dev }
  const decoded = decodeEvent(candidate)
  if (!decoded.ok) throw new Error(`cannot write the event: ${decoded.reason}`)
  return decoded.value as EventOf<K>
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The other stores' records                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

const receiptRecordSchema: z.ZodType<ReceiptRecord> = z.strictObject({
  sha256,
  receipt: json(LIMITS.receiptChars, 'the parsed receipt'),
  reports: z.array(z.strictObject({ at: instant, report: json(LIMITS.receiptChars, 'a verification report') })).max(LIMITS.reports),
})

/** Decodes a receipt record, as an import file carries it. */
export function decodeReceiptRecord(input: unknown): Decoded<ReceiptRecord> {
  return decode(receiptRecordSchema, input)
}

const workingRecordSchema: z.ZodType<WorkingRecord> = z.strictObject({
  key: z
    .string()
    .max(LIMITS.refChars)
    .regex(/^[a-z][a-z0-9-]*:[A-Za-z0-9][A-Za-z0-9._#/:-]*$/, 'must be <namespace>:<name>, such as settings:reduced-motion'),
  value: json(LIMITS.workingChars, 'the value'),
  at: instant,
  dev: id,
})

/** Decodes a `working` record, as a message from another tab carries it. */
export function decodeWorkingRecord(input: unknown): Decoded<WorkingRecord> {
  return decode(workingRecordSchema, input)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Export and import                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

export type ImportErrorCode = 'too-large' | 'parse' | 'unknown-format' | 'newer-schema' | 'invalid'

export const IMPORT_ERROR_MESSAGES: Record<ImportErrorCode, string> = {
  'too-large': `this file is over ${LIMITS.importBytes / (1024 * 1024)} MiB`,
  parse: "this file isn't valid JSON",
  'unknown-format': "this file isn't an enginespace export",
  'newer-schema': 'this export was made by a newer version of enginespace: reload to update, then try again',
  invalid: 'this export is damaged or edited, and it failed validation',
}

export type ParsedExport =
  | { ok: true; file: ExportFile; duplicates: number }
  | { ok: false; error: ImportErrorCode; detail: string }

const refuse = (error: ImportErrorCode, detail: string = IMPORT_ERROR_MESSAGES[error]): { ok: false; error: ImportErrorCode; detail: string } => ({
  ok: false,
  error,
  detail,
})

/** `enginespace/export@N`, and the N that this build writes. */
const FORMAT = /^enginespace\/export@([0-9]+)$/
const EXPORT_FORMAT = Number(FORMAT.exec(EXPORT_SCHEMA)?.[1])

const exportHeader = z.strictObject({
  schema: z.literal(EXPORT_SCHEMA),
  exportedAt: instant,
  schemaVersion: z.int().min(1),
  device: id,
  events: z.array(z.unknown()),
  receipts: z.array(z.unknown()),
})

/**
 * Reads an export file (A§7.5): size, JSON, format, version, then every record, and one bad record refuses the file. A newer
 * `schemaVersion` is refused before anything else is read, because its records may hold fields this build would drop. A file
 * that repeats an id is settled by the merge rule, and `duplicates` says how many records that removed.
 */
export function parseExport(text: string): ParsedExport {
  if (new TextEncoder().encode(text).byteLength > LIMITS.importBytes) return refuse('too-large')
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return refuse('parse')
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return refuse('unknown-format')
  const head = data as Record<string, unknown>
  const named = typeof head.schema === 'string' ? FORMAT.exec(head.schema) : null
  if (named === null) return refuse('unknown-format')
  if (Number(named[1]) > EXPORT_FORMAT) return refuse('newer-schema')
  if (Number.isInteger(head.schemaVersion) && (head.schemaVersion as number) > SCHEMA_VERSION) return refuse('newer-schema')

  const header = exportHeader.safeParse(head)
  if (!header.success) return refuse('invalid', describe(header.error))
  const events: LedgerEvent[] = []
  for (const [index, raw] of header.data.events.entries()) {
    const decoded = decodeEvent(raw)
    if (!decoded.ok) return refuse('invalid', `events[${index}]: ${decoded.reason}`)
    events.push(decoded.value)
  }
  const receipts: ReceiptRecord[] = []
  for (const [index, raw] of header.data.receipts.entries()) {
    const decoded = decodeReceiptRecord(raw)
    if (!decoded.ok) return refuse('invalid', `receipts[${index}]: ${decoded.reason}`)
    receipts.push(decoded.value)
  }
  const file: ExportFile = {
    schema: EXPORT_SCHEMA,
    exportedAt: header.data.exportedAt,
    schemaVersion: header.data.schemaVersion,
    device: header.data.device,
    events: mergeEvents(events),
    receipts: mergeReceipts(receipts),
  }
  return { ok: true, file, duplicates: events.length + receipts.length - file.events.length - file.receipts.length }
}

/** The export of a ledger: events by (`at`, `id`), receipts by SHA-256, so the same ledger always gives the same file. */
export function buildExport(input: { ledger: Ledger; device: string; exportedAt: string }): ExportFile {
  return {
    schema: EXPORT_SCHEMA,
    exportedAt: input.exportedAt,
    schemaVersion: SCHEMA_VERSION,
    device: input.device,
    events: mergeEvents(input.ledger.events),
    receipts: mergeReceipts(input.ledger.receipts),
  }
}

/** The file's text: canonical JSON, so equal exports are equal bytes. */
export function serializeExport(file: ExportFile): string {
  return canonicalJson(file)
}
