/**
 * What TR1's two lifecycle families share (W1b-T03): `tr1.which-mechanism` and `tr1.where-does-it-run` both ask about one stage of a real
 * engine's request path, and the path is the lifecycle model's (packages/sim/lifecycle, W1-T16). Each stage there has a mechanism, a place
 * it starts and a place it ends, and a citation of its file, symbol, line and quote at the commit its engine is pinned to, so a key that
 * is read from a stage is derived from the sim and rests on the pinned source (ARCHITECTURE §4.4, §5.8).
 *
 * This file reads the paths, and nothing here makes a fact up:
 *   - a pool of the stages of an engine, each once for every set of places it has (a stage that runs on rank 1 in a two-rank path has a
 *     second entry), with the flags of a request that put it on the path (a second rank, an abort, a prefix hit, two samples, a reply
 *     that is not streamed);
 *   - the five words of the first lesson for the model's nine mechanisms (the same table as `MECHANISM_WORD` in tests/content/tr1-demos.ts,
 *     which a test holds this one to);
 *   - the words that print a stage, a place and the boundary between two places.
 *
 * It is apart from kit.ts, which all five families import: a family's chunk loads when an item is drawn, and the model's paths are about
 * 9 KB of gzip that a step budget, a request state or a box of the post has no use for [measured 2026-11-09 in the build].
 *
 * Like the rest of packages/play it is pure (D-017): no DOM, no clock, no entropy. The pools are built once and cached, and that is a
 * function of the model's data alone.
 */
import { boundaryOf } from '@es/sim/lifecycle/legal'
import { ENGINES, referencePath, scenarios } from '@es/sim/lifecycle/paths'
import type { EngineId, Mechanism, Place, Scenario, StageDef } from '@es/sim/lifecycle/types'
import { code, rich, text } from '../../rich'
import type { Part, Rich } from '../../types'

/* ------------------------------------------------------------------------------------------------------------------ */
/* The five words                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The five mechanisms of the first lesson: a request moves from one place to the next by one of them, or is worked on where it stands. */
export const KLASSES = ['compute', 'queue', 'ipc', 'copy', 'sync'] as const
export type Klass = (typeof KLASSES)[number]

/** What the model's nine mechanisms come to in the lesson's five words: a call, a launch and a collective are all compute, a socket and shared memory are both IPC, and a copy goes down or up. */
export const KLASS_OF: Readonly<Record<Mechanism, Klass>> = {
  call: 'compute',
  launch: 'compute',
  collective: 'compute',
  queue: 'queue',
  ipc: 'ipc',
  shm: 'ipc',
  h2d: 'copy',
  d2h: 'copy',
  sync: 'sync',
}

/** The engines a variant draws from, and the lifecycle KC that reading them exercises. A variant is an engine family because its KC is. */
export type Group = 'nano' | 'sglang' | 'vllm'

export const GROUP_ENGINES: Readonly<Record<Group, readonly EngineId[]>> = {
  nano: ['nano-vllm'],
  sglang: ['mini-sglang', 'sglang'],
  vllm: ['inside-vllm', 'vllm'],
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The stages of an engine                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The things about a request that put a stage on its path or leave it off: GAMES.md §5's scenario flags. */
export type Flag = 'streaming' | 'tp' | 'abort' | 'prefixHit' | 'n'

export interface Need {
  readonly flag: Flag
  readonly value: boolean | 1 | 2
}

/** The request the practice levels draw: streamed, one rank, no abort, no prefix hit, one sample. A flag at its baseline needs no mention. */
const BASELINE: Readonly<Record<Flag, boolean | 1 | 2>> = { streaming: true, tp: 1, abort: false, prefixHit: false, n: 1 }
const FLAGS: readonly Flag[] = ['streaming', 'tp', 'abort', 'prefixHit', 'n']

/** A flag's value as a noun phrase that follows "the request has": words and no digit, so a sentence holds no bare number. */
function needWords(need: Need): string {
  switch (need.flag) {
    case 'streaming':
      return need.value === true ? 'a streamed answer' : 'an answer that is not streamed'
    case 'tp':
      return need.value === 2 ? 'two ranks' : 'one rank'
    case 'abort':
      return need.value === true ? 'a client that leaves mid-stream' : 'a client that stays to the end'
    case 'prefixHit':
      return need.value === true ? 'a prefix hit' : 'no prefix hit'
    case 'n':
      return need.value === 2 ? 'two samples' : 'one sample'
  }
}

/** One stage of an engine's path, as one place on the page: the stage, the stage before it on the path where it first appears, and the flags it needs. */
export interface Entry {
  readonly engine: EngineId
  readonly stage: StageDef
  /** The stage that comes before it on the first path that holds it, which ends where this one starts. Null for the first stage of a path. */
  readonly prev: StageDef | null
  readonly needs: readonly Need[]
}

/** The ranks an entry is for: two when only a two-rank path has it, and one otherwise. */
export const ranksOf = (entry: Pick<Entry, 'needs'>): 1 | 2 => (entry.needs.some((need) => need.flag === 'tp' && need.value === 2) ? 2 : 1)

/** Whether the stage belongs to an abort: a client leaves mid-stream, and the path grows by the stages that follow. */
export const isAbort = (entry: Pick<Entry, 'needs'>): boolean => entry.needs.some((need) => need.flag === 'abort' && need.value === true)

/** A place's key, for maps and sets. */
export const placeKey = (place: Place): string => `${place.process}|${place.thread}|${place.device}|${place.rank}`

/**
 * The flags that every scenario holding a stage agrees on and that differ from the baseline: what it takes to have the stage. A flag that
 * an engine has only one value of, such as nano-vllm's answers, which are never streamed, is a fact about the engine and not about the request.
 */
function needsOf(engine: EngineId, held: readonly Scenario[]): Need[] {
  const out: Need[] = []
  for (const flag of FLAGS) {
    if (ENGINES[engine].supports[flag].length === 1) continue
    const values = new Set(held.map((scenario) => scenario[flag]))
    if (values.size !== 1) continue
    const [value] = [...values]
    if (value !== BASELINE[flag]) out.push({ flag, value })
  }
  return out
}

const POOLS = new Map<EngineId, readonly Entry[]>()

/**
 * Every stage of an engine's paths, once for each pair of places it has, in the order of the paths (scenarios in the model's order, stages
 * in theirs). A stage that sits in other places in a two-rank path is another entry, and `(stage.id, ranksOf)` names an entry.
 */
export function poolOf(engine: EngineId): readonly Entry[] {
  const known = POOLS.get(engine)
  if (known !== undefined) return known
  const found = new Map<string, { stage: StageDef; prev: StageDef | null; held: Scenario[] }>()
  for (const scenario of scenarios(engine)) {
    const path = referencePath(scenario)
    path.forEach((stage, at) => {
      const key = `${stage.id}|${placeKey(stage.from)}|${placeKey(stage.to)}`
      const hit = found.get(key)
      if (hit === undefined) found.set(key, { stage, prev: at > 0 ? path[at - 1] : null, held: [scenario] })
      else hit.held.push(scenario)
    })
  }
  const pool = [...found.values()].map(({ stage, prev, held }): Entry => ({ engine, stage, prev, needs: needsOf(engine, held) }))
  POOLS.set(engine, pool)
  return pool
}

/** The entry of `engine` for the stage `id` on a path of `ranks` ranks, or undefined. */
export function entryOf(engine: EngineId, id: string, ranks: 1 | 2): Entry | undefined {
  return poolOf(engine).find((entry) => entry.stage.id === id && ranksOf(entry) === ranks)
}

/** The request a stage needs, in words, or null when the practice levels' request has it. */
export function conditionOf(entry: Pick<Entry, 'needs'>): string | null {
  return entry.needs.length === 0 ? null : entry.needs.map(needWords).join(', ')
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** An engine as a sentence names it. A commit is an identifier and so a code part: a bare run of digits and letters would read as a number. */
export function engineWords(engine: EngineId): Rich {
  switch (engine) {
    case 'inside-vllm':
      return rich('the vLLM that the post "Inside vLLM" reads (commit ', code('42172ad'), ')')
    default:
      return rich(ENGINES[engine].title)
  }
}

const DIGIT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'] as const

/** A rank in the label of a stage, "rank 1", is read as a word: a digit in a sentence would be a number with no tag, and a rank is a name. */
const spellRanks = (words: string): string => words.replace(/\b([0-9])\b/g, (_, digit: string) => DIGIT_WORDS[Number(digit)])

/** A stage's label, which writes its symbols in backticks, as text and code parts. */
export function labelRich(label: string): Rich {
  return label.split('`').flatMap((piece, at): Part[] => (piece === '' ? [] : [at % 2 === 1 ? code(piece) : text(spellRanks(piece))]))
}

/** A place as the lifecycle game's tiles write it: the process and the thread, or the GPU of the process that owns it. */
export const placeText = (place: Place): string => (place.device === 'gpu' ? `GPU of ${place.process}` : `${place.process} · ${place.thread}`)

/** The boundary between a stage's two places, in a sentence that names both. The five rules of the first lesson are what it leans on. */
export function boundaryRich(stage: StageDef): Rich {
  const { from, to } = stage
  switch (boundaryOf(from, to)) {
    case 'none':
      return rich('The stage starts and ends in ', code(placeText(from)), ', so the request stays where it is.')
    case 'thread':
      return rich('The stage starts in ', code(placeText(from)), ' and ends in ', code(placeText(to)), ', two threads of one process.')
    case 'process':
      return rich('The stage starts in ', code(placeText(from)), ' and ends in ', code(placeText(to)), ', two processes.')
    case 'to-gpu':
      return rich('The stage starts on the host, in ', code(placeText(from)), ', and ends on the GPU of ', code(to.process), '.')
    case 'to-host':
      return rich('The stage starts on the GPU of ', code(from.process), ' and ends on the host, in ', code(placeText(to)), '.')
    case 'on-gpu':
      return rich('The stage starts and ends on the GPU of ', code(from.process), ', so the request stays on the device.')
    case 'across-gpus':
      return rich('The stage starts on the GPU of ', code(from.process), ' and ends on the GPU of ', code(to.process), ', the devices of two ranks.')
  }
}

/** The line of the engine's source that the stage was read from, in a sentence, at the pin that the model cites. */
export function sourceRich(entry: Pick<Entry, 'stage'>): Rich {
  const { source } = entry.stage
  return rich('The engine\'s own line is ', code(source.quote), ' in ', code(source.path), ', in ', code(source.symbol), ', at the pinned commit.')
}

/** Whether another stage of the same engine cites the same line of the same file: a line shared by two stages does not say which one it is. */
export function sharesLine(entry: Pick<Entry, 'engine' | 'stage'>): boolean {
  const { path, line } = entry.stage.source
  return poolOf(entry.engine).some((other) => other.stage.id !== entry.stage.id && other.stage.source.path === path && other.stage.source.line === line)
}
