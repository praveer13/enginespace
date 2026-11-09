/**
 * `tr1.what-moved`: what became of a box of the "Inside vLLM" post, and whether a statement of the post still holds, by vLLM v0.33.0 (TR1;
 * KC `tr1.read-at-the-pin`). It is the exit item of TR1's fourth lesson: each ticket gives a name or a statement from the post and asks where it
 * is at the pin, or whether it still holds (W1-report §5). The post reads vLLM at the commit `42172ad`, and every fact of a case is two claims,
 * one that quotes the code or the text at that commit (`inside-vllm.*`) and one that quotes the pin (`vllm.*`); a re-pin that moves one raises a
 * change card for this family. The cases are the lesson's own table of fifteen boxes and its list of statements, five kinds of change each:
 *
 *   box        same-file (the post's address still works, and only the line is stale), moved, renamed, replaced, new. Six boxes stayed in their
 *              file, which content/claims/tr1-items.yaml carries; the other seven are in tr1.yaml and in the claims of the files beside it.
 *   statement  holds, default (the post calls it experimental or manual and it is the default now), removed, added (the post says it is
 *              missing and it exists now), moved.
 *
 * What the variants ask:
 *   box        the kind of change that a box of the post has been through;
 *   statement  whether a statement of the post still holds at the pin, and if it does not, how it went stale.
 * The kind is drawn first and the case follows from it, so each of the five answers is the key on one seed in five. At level 0 a worked example
 * with another case comes first, at level 1 the first step of the solution is shown (what the pin has), at level 2 the learner is alone with the
 * post's side, and at level 3 the ticket gives the pin's side and leaves the post's to the learner.
 */
import { below, pick } from '@es/sim/core'
import type { Rng, Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice } from '../../grade'
import { code, rich } from '../../rich'
import type { ChoiceOption, Gen, Item, Level, Rich, Step, VariantSpec } from '../../types'
import { shown, workedPart } from './kit'

const FAMILY = 'tr1.what-moved'
const VERSION = 1
const KC = 'tr1.read-at-the-pin'

type VariantId = 'box' | 'statement'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'box', title: 'What became of a box of the post', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'statement', title: 'Whether a statement of the post still holds', kcs: [KC], levels: [0, 1, 2, 3] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The cases                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What happened to a box between the post's commit and the pin (the fourth lesson's five kinds of change). */
export const BOX_KINDS = ['same-file', 'moved', 'renamed', 'replaced', 'new'] as const
export type BoxKind = (typeof BOX_KINDS)[number]

/** Whether a statement of the post holds at the pin, and how it went stale if it did not. */
export const VERDICTS = ['holds', 'default', 'removed', 'added', 'moved'] as const
export type Verdict = (typeof VERDICTS)[number]

/** A fact of a case: the claims that carry it, and words that each claim's text must hold, which the family's test checks. */
export interface Fact {
  /** The sentence, as the solution says it. It may compare the fact with the other commit: "too", "still", "the old file", "gone". */
  readonly says: Rich
  /**
   * The same fact in words that do not compare it with the other commit, where `says` does. The ticket of level 3 and the first step of level 1
   * show this one, because a word of comparison would answer the question; the explanation, once the question is answered, says the first.
   */
  readonly found?: Rich
  /** The claims that carry it, and for each some words of its text. */
  readonly claims: Readonly<Record<string, readonly string[]>>
}

/** What a ticket shows of a fact before the question is answered. */
export const foundOf = (fact: Fact): Rich => fact.found ?? fact.says

export interface Case<Kind extends string> {
  readonly id: string
  readonly kind: Kind
  /** What the ticket names: the box, or the statement of the post. It is the post's side when the ticket is at level 2 or below. */
  readonly subject: Rich
  /** What the post's commit has. */
  readonly post: Fact
  /** What v0.33.0 has. */
  readonly pin: Fact
}

const where = (path: string): Rich => rich(code(path))

/** A box that stayed in its file: the class or the method is defined in the same file at both commits (content/claims/tr1-items.yaml). */
function stayed(slug: string, what: string, path: string, wording: string): Case<'same-file'> {
  return {
    id: slug,
    kind: 'same-file',
    subject: rich(wording, code(what), '.'),
    post: { says: rich('The post\'s commit defines ', code(what), ' in ', ...where(path), '.'), claims: { [`inside-vllm.where.${slug}`]: [path] } },
    pin: {
      says: rich('v0.33.0 defines ', code(what), ' in ', ...where(path), ' too, at a later line.'),
      found: rich('At v0.33.0 ', code(what), ' is defined in ', ...where(path), '.'),
      claims: { [`vllm.where.${slug}`]: [path] },
    },
  }
}

export const BOXES: readonly Case<BoxKind>[] = [
  stayed('async-llm', 'AsyncLLM', 'vllm/v1/engine/async_llm.py', 'The post draws the front of the engine that the API server talks to: the class '),
  stayed('async-mp-client', 'AsyncMPClient', 'vllm/v1/engine/core_client.py', 'The post draws the client that sends requests to the engine core over ZeroMQ: the class '),
  stayed('engine-core-proc', 'EngineCoreProc', 'vllm/v1/engine/core.py', 'The post draws the engine core as a process with a busy loop: the class '),
  stayed('scheduler', 'Scheduler', 'vllm/v1/core/sched/scheduler.py', 'The post draws the engine core\'s scheduler: the class '),
  stayed('allocate-slots', 'allocate_slots', 'vllm/v1/core/kv_cache_manager.py', 'The post draws the call that gives a request its KV blocks: the method '),
  stayed('free-block-queue', 'free_block_queue', 'vllm/v1/core/block_pool.py', 'The post draws the queue of free KV blocks: the attribute '),
  {
    id: 'create-completion',
    kind: 'moved',
    subject: rich('The post draws the route that serves a completion: the function ', code('create_completion'), ' of ', code('vllm/entrypoints/openai/api_server.py'), '.'),
    post: { says: rich('The post\'s commit has the route ', code('create_completion'), ' in ', code('vllm/entrypoints/openai/api_server.py'), '.'), claims: { 'inside-vllm.completions-route': ['create_completion', 'api_server.py'] } },
    pin: {
      says: rich('v0.33.0 has ', code('create_completion'), ' in ', code('vllm/entrypoints/openai/completion/api_router.py'), ', and the old file only re-exports names and warns that it is deprecated.'),
      found: rich('At v0.33.0 the route ', code('create_completion'), ' is defined in ', code('vllm/entrypoints/openai/completion/api_router.py'), '.'),
      claims: { 'vllm.http.create-completion': ['create_completion', 'completion/api_router.py'], 'vllm.http.api-server-shim': ['deprecated'] },
    },
  },
  {
    id: 'model-runner',
    kind: 'moved',
    subject: rich('The post draws the model runner that runs the forward pass and samples inside ', code('execute_model'), ': the class ', code('GPUModelRunner'), ' of ', code('vllm/v1/worker/gpu_model_runner.py'), '.'),
    post: { says: rich('The post\'s commit has a model runner whose ', code('execute_model'), ' samples in the same call, in ', code('vllm/v1/worker/gpu_model_runner.py'), '.'), claims: { 'inside-vllm.sample-in-execute-model': ['execute_model', 'samples'] } },
    pin: {
      says: rich('At v0.33.0 the default runner is Model Runner V2, in ', code('vllm/v1/worker/gpu/model_runner.py'), ', and the old file is still shipped as the runner to fall back to.'),
      found: rich('At v0.33.0 the default model runner is Model Runner V2, in ', code('vllm/v1/worker/gpu/model_runner.py'), '.'),
      claims: { 'vllm.step.execute-then-sample': ['MRV2'], 'vllm.mrv2.default-since': ['default'], 'vllm.mrv1.still-ships': ['gpu_model_runner.py'] },
    },
  },
  {
    id: 'waiting-for-fsm',
    kind: 'renamed',
    subject: rich('The post draws the state of a request that waits for its guided decoding to be ready: ', code('WAITING_FOR_FSM'), '.'),
    post: { says: rich('In the post\'s commit a request that asks for guided decoding starts in ', code('WAITING_FOR_FSM'), '.'), claims: { 'inside-vllm.fsm-wait': ['WAITING_FOR_FSM'] } },
    pin: {
      says: rich('At v0.33.0 a request with a structured-output request starts in ', code('WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR'), ', which does what the old state did.'),
      found: rich('At v0.33.0 a request with a structured-output request starts in ', code('WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR'), '.'),
      claims: { 'vllm.request.grammar-wait': ['WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR'] },
    },
  },
  {
    id: 'req-to-block-hashes',
    kind: 'replaced',
    subject: rich('The post draws where a request\'s block hashes are kept: the dict ', code('req_to_block_hashes'), ' of the KV cache manager.'),
    post: { says: rich('In the post\'s commit the KV cache manager keeps every request\'s block hashes in the dict ', code('req_to_block_hashes'), '.'), claims: { 'inside-vllm.block-hashes-in-the-manager': ['req_to_block_hashes'] } },
    pin: {
      says: rich('At v0.33.0 each request carries its own list ', code('block_hashes'), ', and the manager\'s dict is gone.'),
      found: rich('At v0.33.0 each request carries its own list ', code('block_hashes'), '.'),
      claims: { 'vllm.request.block-hashes': ['block_hashes', 'gone'] },
    },
  },
  {
    id: 'hash-request-tokens',
    kind: 'replaced',
    subject: rich('The post draws the function that fills in a request\'s block hashes when it is first looked up: ', code('hash_request_tokens'), '.'),
    post: { says: rich('In the post\'s commit ', code('get_computed_blocks'), ' fills a request\'s hashes by calling ', code('hash_request_tokens'), '.'), claims: { 'inside-vllm.hash-request-tokens': ['hash_request_tokens'] } },
    pin: {
      says: rich('At v0.33.0 a block hasher on the request fills its hashes, and the function ', code('hash_request_tokens'), ' is gone.'),
      found: rich('At v0.33.0 a block hasher on the request fills its hashes.'),
      claims: { 'vllm.request.block-hashes': ['hash_request_tokens', 'gone'] },
    },
  },
  {
    id: 'aborts-queue',
    kind: 'new',
    subject: rich('A box called ', code('aborts_queue'), ' carries the aborts of the engine core at v0.33.0.'),
    post: {
      says: rich('In the post\'s commit an abort reaches the busy loop on the same input queue as a new request, behind the requests before it, and the file has no ', code('aborts_queue'), '.'),
      claims: { 'inside-vllm.abort-input-queue': ['same input queue', 'aborts_queue'] },
    },
    pin: { says: rich('At v0.33.0 aborts arrive on a queue of their own, ', code('aborts_queue'), ', which the step drains after the forward and before the update.'), claims: { 'vllm.engine-core.aborts': ['aborts_queue'] } },
  },
  {
    id: 'sample-tokens',
    kind: 'new',
    subject: rich('A call named ', code('sample_tokens'), ' samples the tokens of a step at v0.33.0.'),
    post: { says: rich('In the post\'s commit the runner samples inside ', code('execute_model'), ', in the same call as the forward pass, and nothing is called ', code('sample_tokens'), '.'), claims: { 'inside-vllm.sample-in-execute-model': ['execute_model'] } },
    pin: { says: rich('At v0.33.0 the default runner\'s ', code('execute_model'), ' returns nothing, and sampling is a second call, ', code('sample_tokens'), '.'), claims: { 'vllm.step.execute-then-sample': ['sample_tokens'] } },
  },
]

export const STATEMENTS: readonly Case<Verdict>[] = [
  {
    id: 'two-queues',
    kind: 'holds',
    subject: rich('The post says that the engine core\'s input thread puts each request on ', code('input_queue'), ' for the main thread, and that its output thread takes results from ', code('output_queue'), '.'),
    post: { says: rich('The post describes an input thread that fills ', code('input_queue'), ' and an output thread that empties ', code('output_queue'), '.'), claims: { 'inside-vllm.three-threads': ['input_queue', 'output_queue'] } },
    pin: {
      says: rich('At v0.33.0 the engine core keeps an ', code('input_queue'), ' and an ', code('output_queue'), ', and its input thread still puts each request on ', code('input_queue'), '.'),
      found: rich('At v0.33.0 the engine core keeps an ', code('input_queue'), ' and an ', code('output_queue'), ', and its input thread puts each request on ', code('input_queue'), '.'),
      claims: { 'vllm.engine-core.queues': ['input_queue', 'output_queue'], 'vllm.engine-core.input-thread-queue': ['input_queue'] },
    },
  },
  {
    id: 'prefix-caching',
    kind: 'holds',
    subject: rich('The post says that prefix caching needs no switch, since it is enabled by default.'),
    post: { says: rich('Prefix caching, the post says, is enabled by default.'), claims: { 'inside-vllm.prefix-caching-default': ['prefix caching'] } },
    pin: {
      says: rich('At v0.33.0 the engine caches prefixes by default, too.'),
      found: rich('At v0.33.0 the engine caches prefixes by default.'),
      claims: { 'vllm.cache.prefix-caching-default': ['Prefix caching', 'default'] },
    },
  },
  {
    id: 'block-size',
    kind: 'holds',
    subject: rich('The post gives the default size of a KV block as sixteen tokens.'),
    post: { says: rich('The post gives the default block size as sixteen tokens.'), claims: { 'inside-vllm.block-size-16': ['block size', 'tokens'] } },
    pin: {
      says: rich('The KV block still holds sixteen tokens by default at v0.33.0.'),
      found: rich('The default KV block holds sixteen tokens at v0.33.0.'),
      claims: { 'vllm.cache.block-size-default': ['block', 'default'] },
    },
  },
  {
    id: 'mixed-steps',
    kind: 'holds',
    subject: rich('The post says that the V1 scheduler can mix prefill and decode requests in the same step.'),
    post: { says: rich('The post says the V1 scheduler can mix prefill and decode requests in the same step.'), claims: { 'inside-vllm.mixes-prefill-decode': ['mix prefill and decode'] } },
    pin: { says: rich('At v0.33.0 the scheduler has no prefill phase and no decode phase, only one token budget that every request draws on.'), claims: { 'vllm.scheduler.no-phases': ['token budget'] } },
  },
  {
    id: 'async-scheduling',
    kind: 'default',
    subject: rich('The post lists async scheduling among the experimental features.'),
    post: { says: rich('In the post, async scheduling is one of the features listed as experimental.'), claims: { 'inside-vllm.async-experimental': ['async scheduling', 'Experimental'] } },
    pin: {
      says: rich('At v0.33.0 async scheduling is on by default unless an option conflicts, and it has been the default since v0.14.0.'),
      claims: { 'vllm.async-scheduling.default': ['on by default'], 'vllm.async-scheduling.since': ['v0.14.0'] },
    },
  },
  {
    id: 'chunked-prefill',
    kind: 'default',
    subject: rich('The post says that in V1 you enable chunked prefill by setting ', code('long_prefill_token_threshold'), ' to a positive integer.'),
    post: { says: rich('The post says to enable chunked prefill by setting ', code('long_prefill_token_threshold'), ' to a positive integer.'), claims: { 'inside-vllm.chunked-prefill-by-hand': ['long_prefill_token_threshold'] } },
    pin: {
      says: rich('At v0.33.0 chunked prefill is on by default, and the threshold defaults to zero, which caps nothing.'),
      claims: { 'vllm.scheduler.chunked-prefill-default': ['on by default'], 'vllm.scheduler.long-prefill-threshold-default': ['0', 'no cap'] },
    },
  },
  {
    id: 'use-v1',
    kind: 'removed',
    subject: rich('The post\'s setup code selects the V1 engine with ', code('VLLM_USE_V1="1"'), '.'),
    post: { says: rich('The post\'s setup code sets ', code('VLLM_USE_V1="1"'), ' to use the V1 engine.'), claims: { 'inside-vllm.use-v1': ['VLLM_USE_V1'] } },
    pin: { says: rich('At v0.33.0 the name ', code('VLLM_USE_V1'), ' does not exist, since V1 is the only engine.'), claims: { 'vllm.env.no-use-v1': ['VLLM_USE_V1', 'no'] } },
  },
  {
    id: 'medusa',
    kind: 'removed',
    subject: rich('The post says that V1 implements n-gram, EAGLE and Medusa as ways to propose draft tokens.'),
    post: { says: rich('The post names n-gram, EAGLE and Medusa as the proposal schemes that V1 implements.'), claims: { 'inside-vllm.no-draft-model': ['Medusa'] } },
    pin: {
      says: rich('Medusa is gone at v0.33.0: the release removed it, and the MLP speculator with it.'),
      found: rich('At v0.33.0 vLLM has no Medusa method and no MLP speculator.'),
      claims: { 'vllm.spec.medusa-removed': ['Medusa', 'removed'] },
    },
  },
  {
    id: 'draft-model',
    kind: 'added',
    subject: rich('The post says that V1 does not support the draft-model method.'),
    post: { says: rich('The post says that V1 does not support the draft-model method.'), claims: { 'inside-vllm.no-draft-model': ['draft-model'] } },
    pin: { says: rich('At v0.33.0 the speculative methods include ', code('draft_model'), '.'), claims: { 'vllm.spec.methods': ['draft_model'] } },
  },
  {
    id: 'api-server',
    kind: 'moved',
    subject: rich('The post\'s engine serves a completion from the function ', code('create_completion'), ' in ', code('vllm/entrypoints/openai/api_server.py'), ', so that file is the API server\'s entry.'),
    post: { says: rich('The post\'s commit has the route ', code('create_completion'), ' in ', code('vllm/entrypoints/openai/api_server.py'), '.'), claims: { 'inside-vllm.completions-route': ['create_completion', 'api_server.py'] } },
    pin: {
      says: rich('At v0.33.0 that file only re-exports names and warns that it is deprecated, and the live entry is under ', code('vllm/entrypoints/launchers/'), '.'),
      found: rich('At v0.33.0 the API server\'s entry is under ', code('vllm/entrypoints/launchers/'), '.'),
      claims: { 'vllm.http.api-server-shim': ['deprecated', 'launchers'] },
    },
  },
]

/** Every claim id that a case rests on. */
export const claimsOf = (item: Case<string>): string[] => [...Object.keys(item.post.claims), ...Object.keys(item.pin.claims)]

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What each kind of change is, after the fourth lesson: the options of `box`. */
const BOX_TEXT: Readonly<Record<BoxKind, string>> = {
  'same-file': 'Same file: the post\'s address still works, and only its line has moved on',
  moved: 'Moved: it lives in another file now, and the post\'s file points the way or is a shim',
  renamed: 'Renamed: the idea is still there, under another name that you find by what it does',
  replaced: 'Replaced: another structure does its job, and the post\'s box is gone',
  new: 'New: the post\'s engine has nothing like it, and the pin added it',
}

/** What each kind of change tells a reader to do, for the reveal. */
const BOX_RULE: Readonly<Record<BoxKind, string>> = {
  'same-file': 'The post\'s file and name still work, so the line is the only thing to look up again.',
  moved: 'The name is still in the code but in another file, so search the tree for the symbol and read the old file for a notice.',
  renamed: 'The idea survived under a new name, so look for what the old one did.',
  replaced: 'The job is done in another place, by another structure, so the post\'s box has nothing to point at.',
  new: 'The post\'s engine never had it, so no amount of searching the post will find it.',
}

const VERDICT_TEXT: Readonly<Record<Verdict, string>> = {
  holds: 'It still holds at v0.33.0',
  default: 'It is stale: what the post calls experimental or manual is on by default now',
  removed: 'It is stale: what the post names is gone from v0.33.0',
  added: 'It is stale: what the post says is missing exists at v0.33.0',
  moved: 'It is stale: what the post points at is somewhere else at v0.33.0',
}

const VERDICT_RULE: Readonly<Record<Verdict, string>> = {
  holds: 'The statement is still true of the pinned code, so it can be trusted as it stands.',
  default: 'A post lists as experimental or manual what a project later makes the default, so the statements about defaults go stale first.',
  removed: 'The name or the feature no longer exists, so the statement describes something that has been taken out.',
  added: 'What the post says is missing has been built since, so the statement describes an older engine.',
  moved: 'The thing is still there, but not where the post puts it.',
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

function stepsOf(item: Case<string>, rule: string, kindName: string): Step[] {
  return [
    { text: rich(...item.post.says) },
    { text: rich(...item.pin.says) },
    { text: rich(`So it is ${kindName}. ${rule}`) },
  ]
}

const boxSteps = (item: Case<BoxKind>): Step[] => stepsOf(item, BOX_RULE[item.kind], item.kind === 'same-file' ? 'a box that stayed in its file' : `a box that was ${item.kind === 'new' ? 'added' : item.kind}`)
const statementSteps = (item: Case<Verdict>): Step[] => stepsOf(item, VERDICT_RULE[item.kind], item.kind === 'holds' ? 'a statement that still holds' : 'a stale statement')

/** The case of a kind that a seed draws. `not` leaves one out, for a worked example. */
function drawCase<Kind extends string>(cases: readonly Case<Kind>[], kind: Kind, rng: Rng, not?: string): Case<Kind> {
  return pick(
    rng,
    cases.filter((candidate) => candidate.kind === kind && candidate.id !== not),
  )
}

function buildBox(spec: VariantSpec, level: Level, seed: Seed): Item {
  const kind = BOX_KINDS[below(itemRng(FAMILY, 'box', level, seed, 'kind'), BOX_KINDS.length)]
  const item = drawCase(BOXES, kind, itemRng(FAMILY, 'box', level, seed, 'case'))
  // Levels 0 to 2 give the post's side and ask what became of it; level 3 gives the pin's side and asks what it was.
  const stem =
    level === 3
      ? rich('A reader of vLLM v0.33.0 finds this. ', ...foundOf(item.pin), ' Which kind of change is it, from the commit that the post "Inside vLLM" reads to v0.33.0?')
      : rich(...item.subject, ' Which kind of change is this, from the commit that the post "Inside vLLM" reads to v0.33.0?')
  const options = shown(
    FAMILY,
    'box',
    level,
    seed,
    BOX_KINDS.map(
      (id): ChoiceOption => ({
        id,
        text: rich(BOX_TEXT[id]),
        why: id === kind ? rich(BOX_RULE[id], ' ', ...item.pin.says) : rich(BOX_RULE[id], ' That is not what happened here. ', ...item.pin.says),
        ...(id === kind ? {} : { miss: `${FAMILY}.${id}-for-${kind}` }),
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
      stem,
      givens: [],
      worked: workedPart(level, level === 1 ? [{ text: rich(...foundOf(item.pin)) }, ...boxSteps(item).slice(1)] : boxSteps(item), (attempt) => {
        const other = BOX_KINDS[(BOX_KINDS.indexOf(kind) + 1 + (attempt % (BOX_KINDS.length - 1))) % BOX_KINDS.length]
        return boxSteps(drawCase(BOXES, other, itemRng(FAMILY, 'box', level, seed, `example-${attempt}`)))
      }),
      answer: { kind: 'choice', label: 'the kind of change', options, correct: kind },
      params: { case: item.id },
    },
  )
}

function buildStatement(spec: VariantSpec, level: Level, seed: Seed): Item {
  const kind = VERDICTS[below(itemRng(FAMILY, 'statement', level, seed, 'kind'), VERDICTS.length)]
  const item = drawCase(STATEMENTS, kind, itemRng(FAMILY, 'statement', level, seed, 'case'))
  const stem =
    level === 3
      ? rich('A reader of vLLM v0.33.0 finds this. ', ...foundOf(item.pin), ' Does what the post "Inside vLLM" says about it hold, and if not, how did it go stale?')
      : rich(...item.subject, ' Does it hold at vLLM v0.33.0, and if not, how did it go stale?')
  const options = shown(
    FAMILY,
    'statement',
    level,
    seed,
    VERDICTS.map(
      (id): ChoiceOption => ({
        id,
        text: rich(VERDICT_TEXT[id]),
        why: id === kind ? rich(VERDICT_RULE[id], ' ', ...item.pin.says) : rich(VERDICT_RULE[id], ' That is not what happened here. ', ...item.pin.says),
        ...(id === kind ? {} : { miss: `${FAMILY}.${id}-for-${kind}` }),
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
      stem,
      givens: [],
      worked: workedPart(level, level === 1 ? [{ text: rich(...foundOf(item.pin)) }, ...statementSteps(item).slice(1)] : statementSteps(item), (attempt) => {
        const other = VERDICTS[(VERDICTS.indexOf(kind) + 1 + (attempt % (VERDICTS.length - 1))) % VERDICTS.length]
        return statementSteps(drawCase(STATEMENTS, other, itemRng(FAMILY, 'statement', level, seed, `example-${attempt}`)))
      }),
      answer: { kind: 'choice', label: 'what became of the statement', options, correct: kind },
      params: { case: item.id },
    },
  )
}

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

/** The case that an item was made from, read back from its params. */
function caseOf(item: Pick<Item, 'variant' | 'params'>): Case<string> {
  const found = (item.variant === 'box' ? BOXES : STATEMENTS).find((candidate) => candidate.id === item.params['case'])
  if (found === undefined) throw new TypeError(`${FAMILY}: the params of ${item.variant} are not a case`)
  return found
}

export const whatMoved: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'What moved since the post',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level, variant)
    if (!isVariant(spec.id)) throw new RangeError(`${FAMILY} has no variant "${spec.id}"`)
    return spec.id === 'box' ? buildBox(spec, level, seed) : buildStatement(spec, level, seed)
  },
  // Every seed makes a fair question: the kind is drawn first, and the case follows from it.
  band: () => true,
  grade: (item, response) => gradeChoice(item, response),
  solution(item) {
    const found = caseOf(item)
    return item.variant === 'box' ? boxSteps(found as Case<BoxKind>) : statementSteps(found as Case<Verdict>)
  },
}
