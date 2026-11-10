/**
 * `tr1.request-state`: the twelve statuses of a request in vLLM v0.33.0 and what moves a request from one to the next (TR1; KC
 * `tr1.request-states`, and `tr1.abort-path` for an abort). It is the exit item of TR1's fifth lesson, on the states, and of its seventh,
 * after an abort. The statuses and the moves are the pinned `RequestStatus` and the places in the scheduler that set it, and each move is a
 * claim about vLLM v0.33.0 (a re-pin that moves one raises a change card for this family):
 *
 *   arrives          a new request starts in WAITING, or in WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR when it has a structured-output request
 *                    (claims vllm.request.starts-waiting and vllm.request.grammar-wait; the model's `vllm.waiting-queue` stage has the state WAITING);
 *   grammar-ready    the compiled grammar promotes it to WAITING (claim vllm.request.grammar-ready);
 *   remote-start/    a connector's asynchronous load of its KV puts a waiting request in WAITING_FOR_REMOTE_KVS, and the end of the load
 *   remote-done      promotes it to WAITING, or to PREEMPTED if it had been preempted (claims vllm.request.remote-kv-wait and -ready);
 *   admit            the scheduler admits a WAITING or PREEMPTED request into a step, and its status is RUNNING (claim vllm.request.admitted);
 *   preempt          the scheduler takes a running request's blocks back, and its status is PREEMPTED (claim vllm.request.preempted-status);
 *   stop, length,    `check_stop` sets one of three finished statuses after each output (claim vllm.request.check-stop), and the
 *   repetition,      scheduler sets FINISHED_ERROR when the grammar rejects what was sampled (vllm.request.grammar-error);
 *   grammar-error
 *   session-wait     a resumable session that stops with no input queued waits in WAITING_FOR_STREAMING_REQ (claim vllm.request.streaming-wait);
 *   abort            `finish_requests` sets FINISHED_ABORTED on a request that is not finished, and skips one that is (claims
 *                    vllm.engine-core.abort-status and vllm.scheduler.finish-requests; the model's `vllm.finish-aborted` stage has the state).
 * A status is finished when it comes after PREEMPTED in the enum, so the six that begin FINISHED_ are, including FINISHED_IGNORED, which nothing
 * assigns (claims vllm.request.finished-order and vllm.request.ignored-unassigned).
 *
 * What the variants ask:
 *   next    the status a request has after an event (level 3: after two events in a row);
 *   moves   the event that moves a request from one status to another;
 *   count   how many of a list of requests' statuses count as finished (level 3: how many do not);
 *   abort   the status a request has after an abort reaches `finish_requests`, which is FINISHED_ABORTED unless the request had finished.
 * The answer is drawn first. At level 0 a worked example with another move comes first, at level 1 the first step of the solution is shown,
 * and at level 2 the learner is alone with the statuses.
 */
import { below, pick, shuffle } from '@es/sim/core'
import type { Rng, Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, num, rich } from '../../rich'
import type { ChoiceOption, Gen, Given, Item, Level, NumPart, Rich, Step, VariantSpec } from '../../types'
import { drawOutcome, EXACT, shown, workedPart } from './kit'

const FAMILY = 'tr1.request-state'
const VERSION = 1
const KC_STATES = 'tr1.request-states'
const KC_ABORT = 'tr1.abort-path'

type VariantId = 'next' | 'moves' | 'count' | 'abort'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'next', title: 'The status after an event', kcs: [KC_STATES], levels: [0, 1, 2, 3] },
  { id: 'moves', title: 'What moves a request on', kcs: [KC_STATES], levels: [1, 2] },
  { id: 'count', title: 'Which statuses are finished', kcs: [KC_STATES], levels: [2, 3] },
  { id: 'abort', title: 'The status after an abort', kcs: [KC_STATES, KC_ABORT], levels: [1, 2] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The statuses and the moves                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** `RequestStatus` of vLLM v0.33.0, in the order of the enum (claim vllm.request.states). */
export const STATUSES = [
  'WAITING',
  'WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR',
  'WAITING_FOR_REMOTE_KVS',
  'WAITING_FOR_STREAMING_REQ',
  'RUNNING',
  'PREEMPTED',
  'FINISHED_STOPPED',
  'FINISHED_LENGTH_CAPPED',
  'FINISHED_ABORTED',
  'FINISHED_IGNORED',
  'FINISHED_ERROR',
  'FINISHED_REPETITION',
] as const
export type Status = (typeof STATUSES)[number]

const isStatus = (value: unknown): value is Status => typeof value === 'string' && (STATUSES as readonly string[]).includes(value)

/** Whether the scheduler counts a status as finished: it comes after PREEMPTED in the enum (claim vllm.request.finished-order). */
export const isFinished = (status: Status): boolean => STATUSES.indexOf(status) > STATUSES.indexOf('PREEMPTED')

const FINISHED: readonly Status[] = STATUSES.filter(isFinished)
const UNFINISHED: readonly Status[] = STATUSES.filter((status) => !isFinished(status))

/** Where a move starts: a status, a request that has just arrived, or any status that is not finished (an abort). */
export type Start = Status | 'new' | 'unfinished'

export interface Move {
  readonly id: string
  readonly from: Start
  /** A clause that follows "when" or "and": what happens. */
  readonly event: string
  readonly to: Status
  /** The claims about vLLM v0.33.0 that the move rests on. */
  readonly claims: readonly string[]
  /** The place in the pinned source that sets the status: the file and the definition that holds the line. */
  readonly where: { readonly path: string; readonly symbol: string }
}

const REQUEST = 'vllm/v1/request.py'
const SCHEDULER = 'vllm/v1/core/sched/scheduler.py'
const UTILS = 'vllm/v1/core/sched/utils.py'

/** The moves of the table of the fifth lesson, one for each place that sets a status. */
export const MOVES: readonly Move[] = [
  { id: 'arrives', from: 'new', event: 'it has no structured-output request', to: 'WAITING', claims: ['vllm.request.starts-waiting'], where: { path: REQUEST, symbol: 'Request.__init__' } },
  { id: 'arrives-grammar', from: 'new', event: 'it has a structured-output request', to: 'WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR', claims: ['vllm.request.grammar-wait'], where: { path: REQUEST, symbol: 'Request.__init__' } },
  { id: 'grammar-ready', from: 'WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR', event: 'its grammar has compiled', to: 'WAITING', claims: ['vllm.request.grammar-ready'], where: { path: SCHEDULER, symbol: 'Scheduler._handle_blocked_waiting_request' } },
  { id: 'remote-start', from: 'WAITING', event: 'a connector starts to load its KV from elsewhere without blocking', to: 'WAITING_FOR_REMOTE_KVS', claims: ['vllm.request.remote-kv-wait'], where: { path: SCHEDULER, symbol: 'Scheduler.schedule' } },
  { id: 'remote-done', from: 'WAITING_FOR_REMOTE_KVS', event: 'the remote load of its KV has finished, and the request had not been preempted before', to: 'WAITING', claims: ['vllm.request.remote-kv-ready'], where: { path: SCHEDULER, symbol: 'Scheduler._handle_blocked_waiting_request' } },
  {
    id: 'remote-done-preempted',
    from: 'WAITING_FOR_REMOTE_KVS',
    event: 'the remote load of its KV has finished, and the request had been preempted before',
    to: 'PREEMPTED',
    claims: ['vllm.request.remote-kv-ready'],
    where: { path: SCHEDULER, symbol: 'Scheduler._handle_blocked_waiting_request' },
  },
  { id: 'admit', from: 'WAITING', event: 'the scheduler admits it into a step', to: 'RUNNING', claims: ['vllm.request.admitted'], where: { path: SCHEDULER, symbol: 'Scheduler.schedule' } },
  { id: 'admit-preempted', from: 'PREEMPTED', event: 'the scheduler admits it into a step', to: 'RUNNING', claims: ['vllm.request.admitted'], where: { path: SCHEDULER, symbol: 'Scheduler.schedule' } },
  { id: 'preempt', from: 'RUNNING', event: 'the scheduler needs its blocks for other requests', to: 'PREEMPTED', claims: ['vllm.request.preempted-status', 'vllm.scheduler.preemption-recompute'], where: { path: SCHEDULER, symbol: 'Scheduler._preempt_request' } },
  { id: 'stop', from: 'RUNNING', event: 'it samples the end-of-sequence token or a stop token', to: 'FINISHED_STOPPED', claims: ['vllm.request.check-stop'], where: { path: UTILS, symbol: 'check_stop' } },
  { id: 'length', from: 'RUNNING', event: 'it reaches the length of the model or its token limit', to: 'FINISHED_LENGTH_CAPPED', claims: ['vllm.request.check-stop'], where: { path: UTILS, symbol: 'check_stop' } },
  { id: 'repetition', from: 'RUNNING', event: 'repetition detection finds a repeated pattern in its output', to: 'FINISHED_REPETITION', claims: ['vllm.request.check-stop'], where: { path: UTILS, symbol: 'check_stop' } },
  { id: 'grammar-error', from: 'RUNNING', event: 'the grammar rejects the tokens that were sampled for it', to: 'FINISHED_ERROR', claims: ['vllm.request.grammar-error'], where: { path: SCHEDULER, symbol: 'Scheduler.update_from_output' } },
  { id: 'session-wait', from: 'RUNNING', event: 'a resumable session stops with no input queued', to: 'WAITING_FOR_STREAMING_REQ', claims: ['vllm.request.streaming-wait'], where: { path: SCHEDULER, symbol: 'Scheduler._handle_stopped_request' } },
  { id: 'abort', from: 'unfinished', event: "an abort reaches the scheduler's finish_requests", to: 'FINISHED_ABORTED', claims: ['vllm.engine-core.abort-status', 'vllm.scheduler.finish-requests'], where: { path: SCHEDULER, symbol: 'Scheduler.finish_requests' } },
]

const moveById = (id: unknown): Move => {
  const found = MOVES.find((move) => move.id === id)
  if (found === undefined) throw new RangeError(`${FAMILY} has no move "${String(id)}"`)
  return found
}

/**
 * Whether a move can be the second of two. Nothing comes before a new request's start. The end of a remote load leads to WAITING or to PREEMPTED by
 * the request's history, which a status does not hold, so a chain that ends in it would have to say where the request was before, and none does.
 */
const isLast = (move: Move): boolean => move.from !== 'new' && move.id !== 'remote-done' && move.id !== 'remote-done-preempted'

/** The statuses that a move leads to: every one but FINISHED_IGNORED, which nothing assigns. */
const TARGETS: readonly Status[] = STATUSES.filter((status) => MOVES.some((move) => move.to === status))

/** The statuses a chain of two moves can end in. */
const CHAIN_ENDS: readonly Status[] = TARGETS.filter((status) => MOVES.some((move) => move.to === status && isLast(move)))

/** What puts a request in a status, as a sentence: what the option that is not the key says about its own status. */
const ENTERS: Readonly<Record<Status, string>> = {
  WAITING: 'A request starts in WAITING, and returns to it when its grammar has compiled or its remote load has finished.',
  WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR: 'A request that has a structured-output request starts there, and leaves when its grammar has compiled.',
  WAITING_FOR_REMOTE_KVS: 'A waiting request enters it when a connector starts to load its KV from elsewhere.',
  WAITING_FOR_STREAMING_REQ: 'A running request enters it when a resumable session stops with no input queued.',
  RUNNING: 'A waiting or preempted request enters it when the scheduler admits it into a step.',
  PREEMPTED: 'A running request enters it when the scheduler takes its blocks back, and a request that was preempted before returns to it when its remote load has finished.',
  FINISHED_STOPPED: 'A running request enters it when it samples the end-of-sequence token or a stop token.',
  FINISHED_LENGTH_CAPPED: 'A running request enters it when it reaches the length of the model or its token limit.',
  FINISHED_ABORTED: 'A request that is not finished enters it when an abort reaches the scheduler.',
  FINISHED_IGNORED: 'Nothing enters it: no code in the package assigns this status.',
  FINISHED_ERROR: 'A running request enters it when the grammar rejects the tokens that were sampled for it.',
  FINISHED_REPETITION: 'A running request enters it when repetition detection finds a repeated pattern in its output.',
}

const slug = (status: Status): string => status.toLowerCase().replace(/_/g, '-')

/** A status in a sentence: the enum's own name, in the mono face. */
const statusCode = (status: Status) => code(status)

const capitalise = (words: string): string => words.charAt(0).toUpperCase() + words.slice(1)

/** The status an option offers, with the sentence a learner reads on the reveal. A status is `required` when the question makes it a lure. */
function statusOptions(variant: VariantId, level: Level, seed: Seed, key: Status, required: readonly Status[], because: (status: Status) => Rich): ChoiceOption[] {
  const fixed = [...new Set<Status>([key, ...required])]
  // A key is never FINISHED_IGNORED, which nothing assigns, so it is a lure only where the question is about an abort: elsewhere the key would be
  // the only status among the options that the names of the statuses could not tell from a lure by their length.
  const pool = variant === 'abort' ? STATUSES : TARGETS
  const others = shuffle(
    itemRng(FAMILY, variant, level, seed, 'others'),
    pool.filter((status) => !fixed.includes(status)),
  ).slice(0, 5 - fixed.length)
  return shown(
    FAMILY,
    variant,
    level,
    seed,
    [...fixed, ...others].map((status): ChoiceOption => ({ id: slug(status), text: rich(statusCode(status)), why: because(status), ...(status === key ? {} : { miss: `${FAMILY}.${slug(status)}-for-${slug(key)}` }) })),
  )
}

/** The place in the pinned source that sets a status, in a sentence. */
const whereRich = (move: Move): Rich => rich('The pinned source sets it in ', code(move.where.symbol), ' of ', code(move.where.path), '.')

/* ------------------------------------------------------------------------------------------------------------------ */
/* next                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/** One or two moves from a start, which is a request that has just arrived or a status; the status after the last is the key. */
interface Journey {
  readonly start: Status | 'new'
  readonly moves: readonly Move[]
}

/** The statuses along a journey: the start, then the status that each move leads to. */
const statusesOf = (journey: Journey): (Status | 'new')[] => [journey.start, ...journey.moves.map((move) => move.to)]

/** The move into `to`, and the status it starts from when it starts from any unfinished status. */
function drawMove(rng: Rng, to: Status, not?: Move): { move: Move; from: Status | 'new' } {
  const move = pick(
    rng,
    MOVES.filter((candidate) => candidate.to === to && candidate !== not),
  )
  return { move, from: move.from === 'unfinished' ? pick(rng, UNFINISHED) : move.from }
}

/** A journey drawn from its last move: at levels 0 to 2 one move, and at level 3 two in a row, the first of them leading to where the second starts. */
function drawJourney(level: Level, seed: Seed, purpose: string, key?: Status): Journey {
  const rng = itemRng(FAMILY, 'next', level, seed, purpose)
  if (level < 3) {
    const to = key ?? TARGETS[drawOutcome(FAMILY, 'next', level, seed, TARGETS.length)]
    const { move, from } = drawMove(rng, to)
    return { start: from, moves: [move] }
  }
  const ends = CHAIN_ENDS
  const to = key ?? ends[below(itemRng(FAMILY, 'next', level, seed, 'outcome'), ends.length)]
  const second = pick(
    rng,
    MOVES.filter((move) => move.to === to && isLast(move)),
  )
  const first = pick(
    rng,
    MOVES.filter((move) => move.from !== 'unfinished' && (second.from === 'unfinished' ? !isFinished(move.to) : move.to === second.from)),
  )
  // The filter above leaves out the abort as a first move, so a first move starts in a status or with a new request.
  if (first.from === 'unfinished') throw new RangeError(`${FAMILY}: the move ${first.id} cannot start a chain`)
  return { start: first.from, moves: [first, second] }
}

const startRich = (start: Status | 'new'): Rich => (start === 'new' ? rich('A new request arrives') : rich('A request is in ', statusCode(start)))

/** The steps of a journey: for each move the status the request is in and what happens, and the status it gives; at the end where the source sets it. */
function journeySteps(journey: Journey): Step[] {
  const statuses = statusesOf(journey)
  const steps: Step[] = []
  journey.moves.forEach((move, at) => {
    const from = statuses[at]
    steps.push({ text: from === 'new' ? rich('A new request is looked at when ', move.event, '.') : rich('The request is in ', statusCode(from), ', and ', move.event, '.') })
    steps.push({ text: rich(ENTERS[move.to], ' So the status is ', statusCode(move.to), '.') })
  })
  const last = journey.moves[journey.moves.length - 1]
  steps.push({ text: whereRich(last) })
  return steps
}

function buildNext(spec: VariantSpec, level: Level, seed: Seed): Item {
  const journey = drawJourney(level, seed, 'scene')
  const key = journey.moves[journey.moves.length - 1].to
  const [one, two] = journey.moves
  const stem =
    two === undefined
      ? rich(...startRich(journey.start), `, and ${one.event}. Which status does the request have afterwards?`)
      : rich(...startRich(journey.start), `. First ${one.event}, and then ${two.event}. Which status does the request have afterwards?`)
  const events = journey.moves.map((move) => move.event).join(' and then ')
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      stem,
      givens: [],
      worked: workedPart(level, journeySteps(journey), (attempt) => {
        const ends = level < 3 ? TARGETS : CHAIN_ENDS
        const other = ends[(ends.indexOf(key) + 1 + (attempt % (ends.length - 1))) % ends.length]
        return journeySteps(drawJourney(level, seed, `example-${attempt}`, other))
      }),
      answer: {
        kind: 'choice',
        label: 'the status',
        options: statusOptions('next', level, seed, key, [], (status) => (status === key ? rich(ENTERS[status]) : rich(ENTERS[status], ` That is not what happens when ${events}.`))),
        correct: slug(key),
      },
      params: { moves: journey.moves.map((move) => move.id).join(','), start: journey.start },
    },
  )
}

/** The journey that an item was made from, read back from its params. */
function journeyOf(item: Pick<Item, 'params'>): Journey {
  const { moves, start } = item.params
  const list = typeof moves === 'string' ? moves.split(',').map(moveById) : []
  if (list.length === 0 || (start !== 'new' && !isStatus(start))) throw new TypeError(`${FAMILY}: the params are not a journey`)
  return { start, moves: list }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* moves                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Whether a move takes a request that is in `from` to `to`. */
const takes = (move: Move, from: Status | 'new', to: Status): boolean => move.to === to && (move.from === from || (move.from === 'unfinished' && from !== 'new' && !isFinished(from)))

/** Where a move starts, in a clause that follows "takes a request". */
const fromRich = (move: Move): Rich =>
  move.from === 'new' ? rich('that has just arrived') : move.from === 'unfinished' ? rich('that is not finished') : rich('out of ', statusCode(move.from))

function movesSteps(move: Move, from: Status | 'new'): Step[] {
  return [
    { text: from === 'new' ? rich('Ask what a new request needs to start in ', statusCode(move.to), '.') : rich('Ask what takes a request out of ', statusCode(from), ' into ', statusCode(move.to), '.') },
    { text: rich(ENTERS[move.to], ' So the event is that ', move.event, '.') },
    { text: whereRich(move) },
  ]
}

function buildMoves(spec: VariantSpec, level: Level, seed: Seed): Item {
  const to = TARGETS[drawOutcome(FAMILY, 'moves', level, seed, TARGETS.length)]
  const { move, from } = drawMove(itemRng(FAMILY, 'moves', level, seed, 'scene'), to)
  const others = shuffle(
    itemRng(FAMILY, 'moves', level, seed, 'others'),
    MOVES.filter((candidate) => candidate.id !== move.id && !takes(candidate, from, to)),
  ).slice(0, 4)
  const options = shown(
    FAMILY,
    'moves',
    level,
    seed,
    [move, ...others].map(
      (candidate): ChoiceOption => ({
        id: candidate.id,
        text: rich(capitalise(candidate.event)),
        why: candidate.id === move.id ? rich(ENTERS[to]) : rich('That is what takes a request ', ...fromRich(candidate), ' to ', statusCode(candidate.to), ', and not what puts this one in ', statusCode(to), '.'),
        ...(candidate.id === move.id ? {} : { miss: `${FAMILY}.${candidate.id}-for-${move.id}` }),
      }),
    ),
  )
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      stem: from === 'new' ? rich('A new request starts in ', statusCode(to), '. What puts it there?') : rich('A request goes from ', statusCode(from), ' to ', statusCode(to), '. What moves it?'),
      givens: [],
      worked: workedPart(level, movesSteps(move, from), (attempt) => {
        const other = TARGETS[(TARGETS.indexOf(to) + 1 + (attempt % (TARGETS.length - 1))) % TARGETS.length]
        const example = drawMove(itemRng(FAMILY, 'moves', level, seed, `example-${attempt}`), other)
        return movesSteps(example.move, example.from)
      }),
      answer: { kind: 'choice', label: 'what moves it', options, correct: move.id },
      params: { move: move.id, from },
    },
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* count                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const WORDS: Readonly<Record<number, string>> = { 9: 'nine', 12: 'twelve' }

const counted = (value: number, tag: 'derived' | 'synthetic' = 'derived'): NumPart => num(value, { unit: value === 1 ? 'request' : 'requests', tag })

interface CountScene {
  readonly statuses: readonly Status[]
  readonly finished: number
}

/** `finished` of `size` statuses are finished, and the rest are not, in an order the seed draws. */
function drawCount(level: Level, seed: Seed, purpose: string, finished?: number): CountScene {
  const size = level === 3 ? 12 : 9
  const rng = itemRng(FAMILY, 'count', level, seed, purpose)
  const c = finished ?? below(itemRng(FAMILY, 'count', level, seed, 'outcome'), size + 1)
  const listed: Status[] = [...Array.from({ length: c }, () => pick(rng, FINISHED)), ...Array.from({ length: size - c }, () => pick(rng, UNFINISHED))]
  return { statuses: shuffle(rng, listed), finished: c }
}

/** The number asked for: at level 3 the requests that are not finished. */
const keyOfCount = (scene: CountScene, level: Level): number => (level === 3 ? scene.statuses.length - scene.finished : scene.finished)

function countSteps(scene: CountScene, level: Level): Step[] {
  const finished = scene.statuses.filter(isFinished)
  const key = keyOfCount(scene, level)
  const steps: Step[] = [
    { text: rich('The scheduler counts a status as finished when it comes after ', statusCode('PREEMPTED'), ' in the enum, and that is every status that begins ', code('FINISHED_'), ': six of the statuses of the enum.') },
    { text: finished.length === 0 ? rich('None of the listed statuses is one of them.') : rich('The finished ones in the list are ', code(finished.join(', ')), ', which makes ', counted(finished.length), '.') },
  ]
  if (scene.statuses.includes('FINISHED_IGNORED')) {
    steps.push({ text: rich(statusCode('FINISHED_IGNORED'), ' counts, though nothing in the package assigns it: the rule is the order of the enum.') })
  }
  steps.push({
    text: level === 3 ? rich('The others are not finished: ', counted(scene.statuses.length, 'synthetic'), ' less ', counted(finished.length), ' is ', counted(key), '.') : rich('So ', counted(key), ' count as finished.'),
    result: counted(key),
  })
  return steps
}

/**
 * What a wrong count says. FINISHED_IGNORED is finished by the rule, the order of the enum, though nothing assigns it, and a learner who leaves it
 * out counts one fewer finished request. A learner who counts the other side gives the number of requests that the question does not ask for.
 */
const COUNT_RULES: readonly DiagnosisRule[] = [
  (item, value) => {
    const { statuses } = countOf(item)
    const size = statuses.length
    const finished = statuses.filter(isFinished).length
    const ignored = statuses.filter((status) => status === 'FINISHED_IGNORED').length
    const asksFinished = item.level !== 3
    if (ignored > 0 && value === (asksFinished ? finished - ignored : size - finished + ignored)) {
      return { id: `${FAMILY}.ignored-left-out`, message: rich(statusCode('FINISHED_IGNORED'), ' is finished by the rule, which is the order of the enum, though nothing assigns it.') }
    }
    if (value === (asksFinished ? size - finished : finished)) {
      return { id: `${FAMILY}.counted-the-other-side`, message: rich(asksFinished ? 'You counted the requests that are not finished. The question asks for the finished ones.' : 'You counted the finished requests. The question asks for the others.') }
    }
    return null
  },
]

function buildCount(spec: VariantSpec, level: Level, seed: Seed): Item {
  const scene = drawCount(level, seed, 'scene')
  const key = keyOfCount(scene, level)
  const givens: Given[] = [{ label: 'statuses', value: code(scene.statuses.join(', ')) }]
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      stem: rich(`These are the statuses of ${WORDS[scene.statuses.length]} requests in vLLM v0.33.0, one for each request. `, level === 3 ? 'How many of the requests are not finished?' : 'How many of the requests does the scheduler count as finished?'),
      givens,
      worked: workedPart(level, countSteps(scene, level), (attempt) => {
        const size = scene.statuses.length
        const other = drawCount(level, seed, `example-${attempt}`, (scene.finished + 1 + (attempt % size)) % (size + 1))
        return other.finished === scene.finished ? null : countSteps(other, level)
      }),
      answer: { kind: 'numeric', label: level === 3 ? 'requests not finished' : 'requests finished', unit: 'requests', truth: key, tolerance: EXACT },
      params: { statuses: scene.statuses.join(',') },
    },
  )
}

/** The scene that an item was made from, read back from its params. */
function countOf(item: Pick<Item, 'params'>): { statuses: Status[] } {
  const { statuses } = item.params
  const list = typeof statuses === 'string' ? statuses.split(',') : []
  if (!list.every(isStatus) || list.length === 0) throw new TypeError(`${FAMILY}: the params are not a list of statuses`)
  return { statuses: list }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* abort                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The statuses an abort can leave a request in: FINISHED_ABORTED if it was not finished, and the status it had if it was (it is skipped). */
const ABORT_KEYS: readonly Status[] = ['FINISHED_ABORTED', 'FINISHED_STOPPED', 'FINISHED_LENGTH_CAPPED', 'FINISHED_REPETITION', 'FINISHED_ERROR']

function abortSteps(held: Status, key: Status): Step[] {
  return [
    { text: rich('An abort reaches ', code('finish_requests'), ', which skips a request that is already finished and finishes any other with ', statusCode('FINISHED_ABORTED'), '.') },
    {
      text: isFinished(held)
        ? rich('The request is in ', statusCode(held), ', which is finished, so it is skipped and its status stays ', statusCode(key), '.')
        : rich('The request is in ', statusCode(held), ', which is not finished, so it is taken out of its queue, given ', statusCode(key), ' and freed.'),
    },
    { text: rich('The pinned source does this in ', code('Scheduler.finish_requests'), ' of ', code(SCHEDULER), '.') },
  ]
}

function buildAbort(spec: VariantSpec, level: Level, seed: Seed): Item {
  const key = ABORT_KEYS[drawOutcome(FAMILY, 'abort', level, seed, ABORT_KEYS.length)]
  const held: Status = key === 'FINISHED_ABORTED' ? pick(itemRng(FAMILY, 'abort', level, seed, 'scene'), UNFINISHED) : key
  const because = (status: Status): Rich => {
    if (status === key) return isFinished(held) ? rich('A request that is finished is skipped by ', code('finish_requests'), ', so an abort leaves its status as it is.') : rich('An abort finishes a request that is not finished, with ', statusCode('FINISHED_ABORTED'), '.')
    if (status === 'FINISHED_ABORTED') return rich('The request is finished already, and ', code('finish_requests'), ' skips a request that is finished, so it never becomes ', statusCode('FINISHED_ABORTED'), '.')
    if (status === held) return rich('An abort finishes a request that is not finished, so ', statusCode(held), ' does not stay.')
    return rich(ENTERS[status], ' An abort does not do that.')
  }
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      stem: rich('A request is in ', statusCode(held), ' when an abort reaches the scheduler\'s ', code('finish_requests'), ' for it. Which status does the request have afterwards?'),
      givens: [],
      worked: workedPart(level, abortSteps(held, key), (attempt) => {
        const other = ABORT_KEYS[(ABORT_KEYS.indexOf(key) + 1 + (attempt % (ABORT_KEYS.length - 1))) % ABORT_KEYS.length]
        const otherHeld: Status = other === 'FINISHED_ABORTED' ? pick(itemRng(FAMILY, 'abort', level, seed, `example-${attempt}`), UNFINISHED) : other
        return abortSteps(otherHeld, other)
      }),
      answer: { kind: 'choice', label: 'the status', options: statusOptions('abort', level, seed, key, ['FINISHED_ABORTED', held], because), correct: slug(key) },
      params: { held },
    },
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const requestState: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'The states of a request',
  kcs: [KC_STATES, KC_ABORT],
  variants: VARIANTS,
  make(seed, level, variant) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level, variant)
    if (!isVariant(spec.id)) throw new RangeError(`${FAMILY} has no variant "${spec.id}"`)
    switch (spec.id) {
      case 'next':
        return buildNext(spec, level, seed)
      case 'moves':
        return buildMoves(spec, level, seed)
      case 'count':
        return buildCount(spec, level, seed)
      case 'abort':
        return buildAbort(spec, level, seed)
    }
  },
  // Every seed makes a fair question: the answer is drawn first, and the scene follows from it.
  band: () => true,
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, COUNT_RULES)),
  solution(item) {
    if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
    switch (item.variant) {
      case 'next':
        return journeySteps(journeyOf(item))
      case 'moves': {
        const { move, from } = item.params
        return movesSteps(moveById(move), from === 'new' || isStatus(from) ? from : 'new')
      }
      case 'count': {
        const { statuses } = countOf(item)
        return countSteps({ statuses, finished: statuses.filter(isFinished).length }, item.level)
      }
      case 'abort': {
        const { held } = item.params
        if (!isStatus(held)) throw new TypeError(`${FAMILY}: the params of abort are not a status`)
        return abortSteps(held, isFinished(held) ? held : 'FINISHED_ABORTED')
      }
    }
  },
}
