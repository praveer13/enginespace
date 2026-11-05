/**
 * The Reach-In's night (GAMES.md §8, "Core loop": "the seeded agentic workload: sessions whose next turn extends their last prompt").
 *
 * A workload is a few tables, each a conversation of a few tickets. A table's first ticket opens with the house's standing order when
 * the table has one (several tables can share it, so their first blocks are the same blocks), and every later ticket opens with the
 * whole of the one before it, the prompt and the reply, then adds what the guest says next. So the cache has something to hit, and a
 * hit is as long as the prefix that every station still holds.
 *
 * Every draw comes from a sub-stream of the seed named for its purpose (`pool/table/3`), so that a table's tokens do not move when
 * another table gets a ticket more. Token ids are drawn from a vocabulary of 50,000, as the sim's own streams are, which makes two
 * random blocks never match. Nothing here is the engine's: the lengths, the number of tables and the think times are the game's own
 * and synthetic [estimated].
 */
import { between, below, chance, rngFor } from '@es/sim/core'
import type { Rng, Seed } from '@es/sim/core'
import type { PoolReq, PoolTable } from './types'

const VOCAB = 50000

export interface WorkloadSpec {
  readonly tables: number
  /** Tickets at a table: from, to. */
  readonly turns: readonly [number, number]
  /** Standing orders (shared system prompts) that tables may open with. */
  readonly standing: number
  readonly standingTokens: readonly [number, number]
  /** Per mille of tables that open with a standing order. */
  readonly standingShare: number
  /** Tokens the guest says: in a table's first ticket, and in each ticket after. */
  readonly firstTokens: readonly [number, number]
  readonly nextTokens: readonly [number, number]
  /** Steps of decode a ticket asks for: from, to. */
  readonly outChunks: readonly [number, number]
  /** Steps a table thinks after a ticket is served, before its next arrives. */
  readonly think: readonly [number, number]
  /** The step a table's first ticket arrives. */
  readonly spread: readonly [number, number]
  /** Tokens a ticket decodes in one step. */
  readonly chunk: number
  /** The recipe kit of table t is `kits[t % kits.length]`; an empty list means the base model for all. */
  readonly kits: readonly (number | null)[]
  /** Pins the first ticket of the first table to exactly this many tokens, as vLLM's design document counts its example. */
  readonly pinFirst?: number
}

const tokens = (rng: Rng, count: number): number[] => Array.from({ length: count }, () => below(rng, VOCAB))
const range = (rng: Rng, [lo, hi]: readonly [number, number]): number => between(rng, lo, hi)

/** The tables and tickets of a night. */
export function buildWorkload(seed: Seed, spec: WorkloadSpec): { readonly tables: PoolTable[]; readonly reqs: PoolReq[] } {
  const standing: number[][] = Array.from({ length: spec.standing }, (_, i) => {
    const rng = rngFor(seed, `pool/standing/${i}`)
    return tokens(rng, range(rng, spec.standingTokens))
  })

  interface Script {
    readonly table: number
    readonly turn: number
    readonly prompt: number[]
    readonly out: number[]
    readonly delay: number
  }
  const scripts: Script[][] = []
  const tables: PoolTable[] = []
  for (let t = 0; t < spec.tables; t++) {
    const rng = rngFor(seed, `pool/table/${t}`)
    const turns = range(rng, spec.turns)
    const opens = spec.standing > 0 && chance(rng, spec.standingShare)
    const standingId = opens ? t % spec.standing : null
    const adapter = spec.kits.length === 0 ? null : spec.kits[t % spec.kits.length]
    tables.push({ id: t, letter: String.fromCharCode(65 + t), standing: standingId, standingLen: standingId === null ? 0 : standing[standingId].length, adapter, tickets: turns })
    const mine: Script[] = []
    let sequence: number[] = standingId === null ? [] : standing[standingId]
    for (let turn = 0; turn < turns; turn++) {
      const said = range(rng, turn === 0 ? spec.firstTokens : spec.nextTokens)
      const pinned = t === 0 && turn === 0 && spec.pinFirst !== undefined
      const prompt = sequence.concat(tokens(rng, pinned ? Math.max(1, (spec.pinFirst ?? 0) - sequence.length) : said))
      const out = tokens(rng, spec.chunk * range(rng, spec.outChunks))
      mine.push({ table: t, turn, prompt, out, delay: turn === 0 ? range(rng, spec.spread) : range(rng, spec.think) })
      sequence = prompt.concat(out)
    }
    scripts.push(mine)
  }

  // Ticket numbers run turn by turn: every table's first, then every table's second.
  const ids: number[][] = scripts.map(() => [])
  let next = 0
  const most = scripts.reduce((m, s) => Math.max(m, s.length), 0)
  for (let turn = 0; turn < most; turn++) for (let t = 0; t < scripts.length; t++) if (turn < scripts[t].length) ids[t][turn] = next++

  const reqs: PoolReq[] = new Array<PoolReq>(next)
  scripts.forEach((mine, t) => {
    mine.forEach((s, turn) => {
      const id = ids[t][turn]
      reqs[id] = { id, table: t, turn, prompt: s.prompt, out: s.out, adapter: tables[t].adapter, next: turn + 1 < mine.length ? ids[t][turn + 1] : null, delay: s.delay }
    })
  })
  return { tables, reqs }
}
