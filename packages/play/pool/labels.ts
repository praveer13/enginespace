/**
 * The label on a page (GAMES.md §2.6: a page carries its hash and its group): which conversation's prefix a block belongs to, and which
 * block of it.
 *
 * The sim's pages know a hash and a group and nothing of whose they are, as an engine's pages do. The game does know, because it wrote
 * the run: every block of every request is a block of its conversation's longest sequence, and the sequence's hash chain (the sim's own)
 * names each block. So a page's label is `C·5`, conversation C's block 5 (counted from the head, 0), or `S1·2` for a block that lies
 * wholly inside the first shared system prompt, which several conversations open with and so share. A learner reads a page's owner off its
 * label, and the mirror lists the hash beside it. The field names (`table`, `standing`) are the first ids and do not change; the label's
 * text is display copy and enters no state.
 */
import { divFloor } from '@es/sim/core'
import { kvChain, kvExtraKey } from '@es/sim/kv'
import type { PoolLevel, PoolReq } from './types'

export interface PanLabel {
  /** The conversation whose prefix the block belongs to, or null for a shared system prompt's block. */
  readonly table: number | null
  readonly standing: number | null
  readonly block: number
  /** `C·5` or `S1·2`. */
  readonly text: string
}

const catalogs = new WeakMap<PoolLevel, ReadonlyMap<string, PanLabel>>()

const keyOf = (blockTokens: number, hash: number): string => `${blockTokens}:${hash}`

/** Every block that the run can make, by block size and hash. Built once for a level. */
export function labelsOf(level: PoolLevel): ReadonlyMap<string, PanLabel> {
  const known = catalogs.get(level)
  if (known !== undefined) return known
  const sizes: number[] = []
  for (const group of level.spec.groups) if (!sizes.includes(group.blockTokens)) sizes.push(group.blockTokens)
  const labels = new Map<string, PanLabel>()
  for (const table of level.tables) {
    let last: PoolReq | null = null
    for (const req of level.reqs) if (req.table === table.id && (last === null || req.turn > last.turn)) last = req
    if (last === null) continue
    const sequence = last.prompt.concat(last.out)
    for (const size of sizes) {
      const chain = kvChain(sequence, divFloor(sequence.length, size), size, kvExtraKey(table.adapter))
      chain.forEach((hash, block) => {
        const key = keyOf(size, hash)
        if (labels.has(key)) return
        const shared = table.standing !== null && (block + 1) * size <= table.standingLen
        labels.set(key, shared ? { table: null, standing: table.standing, block, text: `S${(table.standing ?? 0) + 1}·${block}` } : { table: table.id, standing: null, block, text: `${table.letter}·${block}` })
      })
    }
  }
  catalogs.set(level, labels)
  return labels
}

/** The label of the block with this hash at this block size, or undefined for a hash the run never makes. */
export const labelOf = (level: PoolLevel, blockTokens: number, hash: number): PanLabel | undefined => labelsOf(level).get(keyOf(blockTokens, hash))
