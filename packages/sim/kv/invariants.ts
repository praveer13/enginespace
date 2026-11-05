// The invariants of a hybrid KV manager (ARCHITECTURE §5.4; GAMES.md §8, "Invariants"), checked on a snapshot of its state.
//
// A manager keeps these true after every operation: pages are conserved, reference counts never go below zero and match the tables that
// hold the pages, a block table's length and holes follow its group's rule, the cache is the pages that hold hashes, the queue is a
// permutation of the pages that may be allocated, an adapter's pages are its own and its users are the requests that run on it, and
// every block that was stored or removed was published exactly once. Each failure names the check that it breaks, and the lab's host
// reports the same names (`KV_CHECKS`). The checks that need more than a snapshot, such as that a refused operation changed nothing and
// that a reply is the reference's, are the judge's (judge.ts).

import { kvTableRule } from './spec'
import type { KvGroupSpec, KvPage, KvSpec, KvState } from './types'

/** The checks that a snapshot can fail, in the order a report lists them. */
export const KV_CHECKS = [
  { id: 'conservation', title: 'Pages are conserved', catches: 'a page that no table, adapter or queue accounts for: a leaky free' },
  { id: 'refcounts', title: 'Reference counts match the tables', catches: 'a count that is negative, or not the number of table entries that hold the page' },
  { id: 'tables', title: 'A block table follows its group', catches: 'a table of the wrong length, or a hole where the group keeps the block, or a block where it does not' },
  { id: 'window', title: 'A sliding window keeps exactly its blocks', catches: 'a window off by one: a block the window has left, or one it still needs, let go' },
  { id: 'cache', title: 'The cache is the hashed pages', catches: 'a hash with no page, a hashed page with no entry, or two pages under one key' },
  { id: 'queue', title: 'The queue is the pages that can be allocated', catches: 'a page twice in the queue, or a held page in it, or an allocatable page missing from it' },
  { id: 'adapters', title: 'An adapter owns its pages, and its users run', catches: 'an adapter page that another adapter or a table holds, or a user count that is not the running requests' },
  { id: 'events', title: 'Every block is published exactly once', catches: 'a block stored twice, a removal of a block never stored, or a cached block never published' },
] as const

export type KvCheckId = (typeof KV_CHECKS)[number]['id']

/** The ids of the checks that a reply can fail beside these: that it is the reference's, that its hit is the intersection, that a refusal changed nothing. */
export const KV_JUDGE_CHECKS = ['reply', 'hit', 'atomic'] as const

/** The most problems one call lists: a broken manager breaks the same rule on every page, and the first few say enough. */
const LISTED = 24

/** A list of entries by group and then hash: itself when it is in that order already, and a sorted copy when it is not. */
function sortedByKey<T extends { readonly group: number; readonly hash: number }>(list: readonly T[]): readonly T[] {
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1]
    const b = list[i]
    if (a.group > b.group || (a.group === b.group && a.hash > b.hash)) return [...list].sort((x, y) => x.group - y.group || x.hash - y.hash)
  }
  return list
}

/** The check that a block-level fault of this group breaks. */
const blockCheck = (group: KvGroupSpec): KvCheckId => (group.kind === 'sliding' ? 'window' : 'tables')

const describeSkip = (group: KvGroupSpec): string => (group.kind === 'sliding' ? 'the window' : group.kind === 'state' ? 'the state' : 'the group')

function describePage(rec: KvPage): string {
  if (rec.st === 'cached' || rec.st === 'used') return `${rec.st} in group ${rec.group} with hash ${rec.hash}`
  return rec.st
}

/**
 * What is wrong with a snapshot of a manager for `spec`, one sentence each, each beginning with the id of the check that it fails
 * (`conservation: page 7 is held by no table`). Empty when every invariant holds.
 */
export function kvInvariants(spec: KvSpec, s: KvState): readonly string[] {
  const out: string[] = []
  const n = spec.poolPages
  const bad = (id: KvCheckId, text: string): void => {
    if (out.length < LISTED) out.push(`${id}: ${text}`)
  }

  if (s.pages.length !== n) {
    out.push(`conservation: the state lists ${s.pages.length} pages, and the pool has ${n}`)
    return out
  }
  const groups = spec.groups
  const pageOk = (p: unknown): p is number => typeof p === 'number' && Number.isInteger(p) && p >= 0 && p < n

  // --- the tables: what each request holds ---------------------------------------------------------------------------------
  const held = new Int32Array(n)
  const users = new Map<number, number>()
  let previous = -1
  for (const r of s.requests) {
    if (r.id <= previous) bad('tables', `requests are not listed by ascending id at request ${r.id}`)
    previous = r.id
    if (r.adapter !== null) users.set(r.adapter, (users.get(r.adapter) ?? 0) + 1)
    if (r.tables.length !== groups.length) {
      bad('tables', `request ${r.id} has ${r.tables.length} tables, and the spec has ${groups.length} groups`)
      continue
    }
    if (!Number.isInteger(r.length) || r.length < 1) bad('tables', `request ${r.id} holds ${r.length} tokens`)
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g]
      const table = r.tables[g]
      const rule = kvTableRule(group, Math.max(r.length, 0))
      if (table.length !== rule.blocks) {
        bad(group.kind === 'sliding' ? 'window' : 'tables', `request ${r.id}, group ${group.id}: the table has ${table.length} entries, and ${r.length} tokens need ${rule.blocks}`)
      }
      for (let j = 0; j < table.length; j++) {
        const page = table[j]
        if (page === null) {
          if (j >= rule.skip && j < rule.blocks) {
            bad(blockCheck(group), `request ${r.id}, group ${group.id}: block ${j} is let go, and the group still keeps it (it keeps blocks ${rule.skip} to ${rule.blocks - 1})`)
          }
          continue
        }
        if (j < rule.skip) {
          bad(blockCheck(group), `request ${r.id}, group ${group.id}: block ${j} is held though ${describeSkip(group)} has left it (the group keeps blocks ${rule.skip} to ${rule.blocks - 1})`)
        }
        if (!pageOk(page)) {
          bad('tables', `request ${r.id}, group ${group.id}: block ${j} names page ${String(page)}, which is not in the pool`)
          continue
        }
        held[page]++
        const rec = s.pages[page]
        if (rec.st !== 'used') bad('tables', `request ${r.id}, group ${group.id}: block ${j} is page ${page}, which is ${rec.st} and not held`)
        else if (rec.group !== g) bad('tables', `request ${r.id}, group ${group.id}: block ${j} is page ${page}, which belongs to group ${rec.group}`)
      }
    }
  }

  // --- the pages -----------------------------------------------------------------------------------------------------------
  const inQueue = new Uint8Array(n)
  let queueProblems = 0
  for (let at = 0; at < s.queue.length; at++) {
    const p = s.queue[at]
    if (!pageOk(p)) {
      bad('queue', `queue entry ${at} is page ${String(p)}, which is not in the pool`)
      queueProblems++
    } else if (inQueue[p] === 1) {
      bad('queue', `page ${p} is in the queue twice`)
      queueProblems++
    } else inQueue[p] = 1
  }
  let free = 0
  let cached = 0
  let used = 0
  let lent = 0
  for (let p = 0; p < n; p++) {
    const rec = s.pages[p]
    switch (rec.st) {
      case 'free':
        free++
        if (inQueue[p] === 0) bad('conservation', `page ${p} is free and is not in the queue`)
        break
      case 'cached':
        cached++
        if (inQueue[p] === 0) bad('conservation', `page ${p} is cached and is not in the queue`)
        break
      case 'used':
        used++
        if (inQueue[p] === 1) bad('queue', `page ${p} is held and is in the queue`)
        if (!Number.isInteger(rec.refs) || rec.refs < 1) bad('refcounts', `page ${p} is used and has a reference count of ${rec.refs}`)
        else if (held[p] === 0) bad('conservation', `page ${p} has ${rec.refs} references, and no table holds it`)
        else if (held[p] !== rec.refs) bad('refcounts', `page ${p} has ${rec.refs} references, and ${held[p]} table entries hold it`)
        break
      case 'adapter':
        lent++
        if (inQueue[p] === 1) bad('queue', `page ${p} holds an adapter and is in the queue`)
        if (held[p] > 0) bad('adapters', `page ${p} holds adapter ${rec.adapter}, and ${held[p]} table entries hold it`)
        break
    }
  }
  if (free + cached + used + lent !== n) bad('conservation', `${free} free, ${cached} cached, ${used} used and ${lent} adapter pages are not the ${n} of the pool`)
  if (queueProblems === 0 && s.queue.length !== free + cached) bad('queue', `the queue holds ${s.queue.length} pages, and ${free + cached} are free or cached`)

  // --- the cache -----------------------------------------------------------------------------------------------------------
  // Both lists are by group and then hash, which is how a manager writes them, so a pass down the two says everything at once. A dump
  // in any other order is sorted first.
  const cache = sortedByKey(s.cache)
  const hashed = new Uint8Array(n)
  for (let i = 0; i < cache.length; i++) {
    const e = cache[i]
    if (e.group < 0 || e.group >= groups.length) {
      bad('cache', `cache entry ${e.group}:${e.hash} names a group the spec does not have`)
      continue
    }
    if (i > 0 && cache[i - 1].group === e.group && cache[i - 1].hash === e.hash) bad('cache', `the cache holds ${e.group}:${e.hash} twice`)
    if (!pageOk(e.page)) {
      bad('cache', `cache entry ${e.group}:${e.hash} names page ${String(e.page)}, which is not in the pool`)
      continue
    }
    const rec = s.pages[e.page]
    if ((rec.st !== 'cached' && rec.st !== 'used') || rec.hash === null || rec.hash !== e.hash || rec.group !== e.group) {
      bad('cache', `cache entry ${e.group}:${e.hash} is page ${e.page}, which is ${describePage(rec)}`)
    }
    hashed[e.page]++
  }
  for (let p = 0; p < n; p++) {
    const rec = s.pages[p]
    if ((rec.st === 'cached' || rec.st === 'used') && rec.hash !== null && hashed[p] !== 1) bad('cache', `page ${p} has hash ${rec.hash} and ${hashed[p]} cache entries`)
  }
  if (!spec.prefixCaching && (s.cache.length > 0 || s.consumer.length > 0)) bad('cache', 'caching is off, and the pool still caches or publishes blocks')

  // --- the adapters --------------------------------------------------------------------------------------------------------
  const owned = new Uint8Array(n)
  const resident = new Set<number>()
  previous = -1
  for (const a of s.adapters) {
    if (a.id <= previous) bad('adapters', `adapters are not listed by ascending id at adapter ${a.id}`)
    previous = a.id
    resident.add(a.id)
    if (spec.adapterSlots !== undefined) {
      if (a.pages.length > 0) bad('adapters', `adapter ${a.id} holds ${a.pages.length} pages, and the adapters are in slots`)
    } else if (a.pages.length === 0) bad('adapters', `adapter ${a.id} is resident and holds no page`)
    for (const p of a.pages) {
      if (!pageOk(p)) {
        bad('adapters', `adapter ${a.id} names page ${String(p)}, which is not in the pool`)
        continue
      }
      owned[p]++
      const rec = s.pages[p]
      if (rec.st !== 'adapter' || rec.adapter !== a.id) bad('adapters', `adapter ${a.id} lists page ${p}, which is ${rec.st === 'adapter' ? `adapter ${rec.adapter}'s` : rec.st}`)
    }
    const running = users.get(a.id) ?? 0
    if (a.users !== running) bad('adapters', `adapter ${a.id} has ${a.users} users, and ${running} running requests use it`)
  }
  for (let p = 0; p < n; p++) {
    const rec = s.pages[p]
    if (rec.st === 'adapter' && owned[p] !== 1) bad('adapters', `page ${p} holds adapter ${rec.adapter} and ${owned[p]} adapters list it`)
  }
  if (spec.adapterSlots !== undefined && s.adapters.length > spec.adapterSlots) bad('adapters', `${s.adapters.length} adapters are resident, and there are ${spec.adapterSlots} slots`)
  const reported = new Set<number>()
  for (const r of s.requests) {
    if (r.adapter !== null && !resident.has(r.adapter) && !reported.has(r.adapter)) {
      reported.add(r.adapter)
      bad('adapters', `${users.get(r.adapter)} running requests use adapter ${r.adapter}, which is not resident`)
    }
  }

  // --- the events ----------------------------------------------------------------------------------------------------------
  // What the consumer believes, against the cache: the same blocks, each published once.
  const believed = sortedByKey(s.consumer)
  const count = (e: { group: number; hash: number; count: number }): void => {
    if (e.count !== 1) bad('events', `block ${e.group}:${e.hash} ${e.count > 1 ? `was published ${e.count} times without a removal` : `was removed ${-e.count} more times than it was stored`}`)
  }
  let i = 0
  let j = 0
  while (i < cache.length || j < believed.length) {
    const c = i < cache.length ? cache[i] : null
    const b = j < believed.length ? believed[j] : null
    const order = c === null ? 1 : b === null ? -1 : c.group - b.group || c.hash - b.hash
    if (order === 0 && c !== null && b !== null) {
      count(b)
      i++
      j++
    } else if (order < 0 && c !== null) {
      bad('events', `block ${c.group}:${c.hash} is cached and was never published`)
      i++
    } else if (b !== null) {
      count(b)
      if (b.count === 1) bad('events', `block ${b.group}:${b.hash} was published and is not in the cache`)
      j++
    }
  }
  return out
}
