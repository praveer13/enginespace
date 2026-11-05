/**
 * What the tests of TR6's item families share (W1-T30): the claims they hold a family's facts to, the knowledge components of the graph,
 * and the reading of an item's printed numbers back from its ticket. Nothing here writes anything.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import type { Item } from '@es/play/items'

export const root = path.resolve(import.meta.dirname, '../..')

interface ClaimRecord {
  id: string
  value: string | number
  text: string
  source?: { url: string; quote: string }
}

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)
    return statSync(file).isDirectory() ? walk(file) : file.endsWith('.yaml') ? [file] : []
  })

const CLAIMS: ReadonlyMap<string, ClaimRecord> = new Map(
  walk(path.join(root, 'content/claims')).flatMap((file) => (load(readFileSync(file, 'utf8')) as ClaimRecord[]).map((claim): [string, ClaimRecord] => [claim.id, claim])),
)

/** The claim `id`, or a failure that names it: a family's facts rest on claims, and a claim that is gone must say so. */
export function claim(id: string): ClaimRecord {
  const found = CLAIMS.get(id)
  if (found === undefined) throw new Error(`no claim ${id} in content/claims`)
  return found
}

/** The ids of the knowledge components in the graph. */
export const KC_IDS: ReadonlySet<string> = new Set([...readFileSync(path.join(root, 'content/kc/graph.yaml'), 'utf8').matchAll(/^- id: (\S+)/gm)].map((match) => match[1]))

/** The numbers printed on a ticket, by the label of the given. */
export function printed(item: Item): Record<string, number> {
  return Object.fromEntries(item.givens.flatMap((given) => (given.value.t === 'num' ? [[given.label, given.value.value]] : [])))
}

/** The text of a given that is words, by its label. */
export function words(item: Item): Record<string, string> {
  return Object.fromEntries(item.givens.flatMap((given) => (given.value.t === 'text' ? [[given.label, given.value.text]] : given.value.t === 'code' ? [[given.label, given.value.code]] : [])))
}
