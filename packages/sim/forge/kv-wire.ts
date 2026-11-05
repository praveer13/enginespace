// The wire of the `hybrid-kv` lab (labs/forge/hybrid-kv, ARCHITECTURE §8.3): how the host's operations and a learner's manager meet over
// `ks_invoke`, one text command in and one text reply out. The Rust side is the crate's harness (src/lib.rs), and the two must agree
// word for word: tests/forge/hybrid-kv-crate.test.ts reads the harness's header and holds it to this file.
//
// The host sends one operation at a time and, after each, asks the module for its state, as lab 02's `dump()` does for a Fleet page:
//
//   init <pool> <pageBytes> <tokenBytes> <caching 0|1> <slots|-> <group>...    → ok
//        group := <id>:<kind>:<layers>:<padLayers>:<blockTokens>:<window|->:<statePages|->
//   admit <req> <adapter|-> <tokens>                                           → ok <free> hit <tokens> | refused <reason> <free>
//   append <req> <tokens>                                                      → ok <free> | refused <reason> <free>
//   finish <req>                                                               → ok <free> | refused <reason> <free>
//   load <adapter> <pages>                                                     → ok <free> | refused <reason> <free>
//   unload <adapter>                                                           → ok <free> | refused <reason> <free>
//   reset                                                                      → ok <free> | refused <reason> <free>
//   pages      f | c:<g>:<hash> | u:<g>:<refs>:<hash|-> | a:<adapter>, joined by ;          one for each page, by id
//   queue      <page>,<page>,… or -                                                         the pages an allocation may take, front first
//   requests   <id>:<adapter|->:<tokens>:<table>/<table>/…, joined by ; or -                a table is <page|_>,… with _ for a block let go
//   adapters   <id>:<users>:<page>,<page>,… or -, joined by ; or -
//   cache      <g>:<hash>:<page>, joined by ; or -
//   events     what was published since the last `events`, joined by ; or -:
//                S:<g>:<parent|->:<adapter|->:<hash>,<hash>,…:<n>:<digest>     BlockStored; the run's n token ids as a count and a digest
//                R:<g>:<hash>                                                  BlockRemoved
//                C                                                             AllBlocksCleared
//
// `<tokens>` is a list of token ids, each a number or `<first>+<count>` for a run of consecutive ids. A reply is at most 4,096 bytes
// (the host cuts it) [measured: CALL_REPLY_MAX_BYTES in vendor/kernelspace/src/workers/lab-protocol.ts at d478f91], so no query is asked
// of a pool larger than 128 pages [derived: a page takes about 22 bytes in `pages` and in `cache`]. The reasons are those of `KvRefusal`.
//
// The host builds everything else about an event itself (the group's kind and window, the adapter's name, the medium): they follow from
// the group and the adapter, so the module reports only what its own code decides: which blocks, in which group, in which order.

import { kvStored, kvRemoved, kvCleared } from '../kv'
import type {
  KvAdapter,
  KvAllBlocksCleared,
  KvBlockRemoved,
  KvCacheEntry,
  KvEvent,
  KvGroupSpec,
  KvOp,
  KvPage,
  KvRefusal,
  KvRequest,
  KvResult,
  KvSpec,
  KvState,
} from '../kv'

/** The most pages a pool may have for the queries to fit in a reply of 4,096 bytes. */
export const WIRE_MAX_POOL = 128

/** The commands that ask for the state, in the order the host sends them after an operation. */
export const WIRE_QUERIES = ['pages', 'queue', 'requests', 'adapters', 'cache', 'events'] as const
export type WireQuery = (typeof WIRE_QUERIES)[number]

export const WIRE_REASONS: readonly KvRefusal[] = ['no-pages', 'no-slot', 'no-adapter', 'exists', 'unknown', 'in-use', 'busy']

/** What a parse came to: the value, or what is wrong with the text. */
export type Parsed<T> = { readonly value: T } | { readonly problem: string }

const ok = <T>(value: T): Parsed<T> => ({ value })
const bad = (problem: string): { readonly problem: string } => ({ problem })
export const isProblem = <T>(p: Parsed<T>): p is { readonly problem: string } => 'problem' in p

const TWO_32 = 4294967296

// ---------------------------------------------------------------------------------------------------------------------------
// Numbers

const DIGITS = /^(0|[1-9][0-9]*)$/

function count(text: string, what: string, max = Number.MAX_SAFE_INTEGER): Parsed<number> {
  if (!DIGITS.test(text)) return bad(`${what} is not a number: "${text}"`)
  const n = Number(text)
  if (!Number.isSafeInteger(n) || n > max) return bad(`${what} is out of range: "${text}"`)
  return ok(n)
}

const maybe = <T>(text: string, read: (text: string) => Parsed<T>): Parsed<T | null> => {
  if (text === '-') return ok(null)
  const parsed = read(text)
  return isProblem(parsed) ? parsed : ok(parsed.value)
}

// ---------------------------------------------------------------------------------------------------------------------------
// The digest of a run of token ids

/** FNV-1a over the four little-endian bytes of each token, as 8 hex digits: how an event names the tokens of a stored run. */
export function tokenDigest(tokens: readonly number[]): number {
  let h = 0x811c9dc5
  for (const t of tokens) {
    for (let k = 0; k < 4; k++) {
      h ^= (t >>> (8 * k)) & 0xff
      h = Math.imul(h, 0x01000193)
    }
  }
  return h >>> 0
}

const hex8 = (n: number): string => n.toString(16).padStart(8, '0')

/** An event with the tokens of a stored run replaced by `[count, digest]`: the form both sides compare. */
export function digestEvent(event: KvEvent): KvEvent {
  return event.type === 'BlockStored' ? { ...event, token_ids: [event.token_ids.length, tokenDigest(event.token_ids)] } : event
}

// ---------------------------------------------------------------------------------------------------------------------------
// Commands

const list = (items: readonly (number | string)[]): string => (items.length === 0 ? '-' : items.join(','))

/** `init …` for a spec. */
export function wireSpec(spec: KvSpec): string {
  const groups = spec.groups.map((g) =>
    [g.id, g.kind, g.layers, g.padLayers ?? 0, g.blockTokens, g.window ?? '-', g.statePages ?? '-'].join(':'),
  )
  return ['init', spec.poolPages, spec.pageBytes, spec.tokenBytes, spec.prefixCaching ? 1 : 0, spec.adapterSlots ?? '-', ...groups].join(' ')
}

/**
 * The spec an `init` line says, or a problem. The line carries what a manager needs and not `stateBytes`, which is for the record, and
 * `paddingLayers` is the sum of the groups' padding.
 */
export function parseWireSpec(line: string): Parsed<KvSpec> {
  const w = line.trim().split(/\s+/)
  if (w[0] !== 'init' || w.length < 7) return bad('init takes a pool, a page size, a token size, caching, slots and at least one group')
  const pool = count(w[1], 'the pool', WIRE_MAX_POOL)
  const pageBytes = count(w[2], 'the page size')
  const tokenBytes = count(w[3], 'the token size')
  const slots = maybe(w[5], (t) => count(t, 'the adapter slots'))
  if (isProblem(pool)) return pool
  if (isProblem(pageBytes)) return pageBytes
  if (isProblem(tokenBytes)) return tokenBytes
  if (isProblem(slots)) return slots
  if (pool.value < 1) return bad(`the pool holds 1 to ${WIRE_MAX_POOL} pages, got ${pool.value}`)
  if (w[4] !== '0' && w[4] !== '1') return bad(`caching is 0 or 1, got "${w[4]}"`)
  const groups: KvGroupSpec[] = []
  let padding = 0
  for (const token of w.slice(6)) {
    const f = token.split(':')
    if (f.length !== 7) return bad(`a group is <id>:<kind>:<layers>:<pad>:<block>:<window|->:<statePages|->, got "${token}"`)
    if (f[1] !== 'full' && f[1] !== 'sliding' && f[1] !== 'state') return bad(`the kind of a group is full, sliding or state, got "${f[1]}"`)
    const layers = count(f[2], 'the layers of a group')
    const pad = count(f[3], 'the padding of a group')
    const block = count(f[4], 'the block size of a group')
    const window = maybe(f[5], (t) => count(t, 'the window of a group'))
    const statePages = maybe(f[6], (t) => count(t, 'the state pages of a group'))
    if (isProblem(layers)) return layers
    if (isProblem(pad)) return pad
    if (isProblem(block)) return block
    if (isProblem(window)) return window
    if (isProblem(statePages)) return statePages
    padding += pad.value
    groups.push({
      id: f[0],
      kind: f[1],
      layers: layers.value,
      ...(pad.value > 0 ? { padLayers: pad.value } : {}),
      blockTokens: block.value,
      ...(window.value === null ? {} : { window: window.value }),
      ...(statePages.value === null ? {} : { statePages: statePages.value }),
    })
  }
  return ok({
    poolPages: pool.value,
    pageBytes: pageBytes.value,
    tokenBytes: tokenBytes.value,
    paddingLayers: padding,
    groups,
    prefixCaching: w[4] === '1',
    ...(slots.value === null ? {} : { adapterSlots: slots.value }),
  })
}

/** Token ids as a command writes them: runs of consecutive ids of three or more as `first+count`. */
export function wireTokens(tokens: readonly number[]): string {
  const parts: string[] = []
  for (let i = 0; i < tokens.length; ) {
    let j = i + 1
    while (j < tokens.length && tokens[j] === tokens[j - 1] + 1) j++
    parts.push(j - i >= 3 ? `${tokens[i]}+${j - i}` : tokens.slice(i, j).join(','))
    i = j
  }
  return parts.join(',')
}

/** The command for an operation. */
export function wireOp(op: KvOp): string {
  switch (op.op) {
    case 'admit':
      return `admit ${op.req} ${op.adapter ?? '-'} ${wireTokens(op.prompt)}`
    case 'append':
      return `append ${op.req} ${wireTokens(op.tokens)}`
    case 'finish':
      return `finish ${op.req}`
    case 'load-adapter':
      return `load ${op.adapter} ${op.pages}`
    case 'unload-adapter':
      return `unload ${op.adapter}`
    case 'reset':
      return 'reset'
  }
}

function readTokens(text: string): Parsed<number[]> {
  const out: number[] = []
  for (const part of text.split(',')) {
    const [first, run, extra] = part.split('+')
    if (extra !== undefined) return bad(`"${part}" is not a token or a run`)
    const start = count(first, 'a token', TWO_32 - 1)
    if (isProblem(start)) return start
    if (run === undefined) {
      out.push(start.value)
      continue
    }
    const length = count(run, 'a run length', 1 << 20)
    if (isProblem(length) || length.value < 1) return bad(`"${part}" is not a run of 1 or more tokens`)
    if (start.value + length.value > TWO_32) return bad(`"${part}" runs past the largest token id`)
    for (let k = 0; k < length.value; k++) out.push(start.value + k)
  }
  return ok(out)
}

/** The operation a command line names. It reads what `wireOp` writes and the scripts' runs (`0+20`), and throws a RangeError on anything else. */
export function parseWireOp(line: string): KvOp {
  const w = line.trim().split(/\s+/)
  const fail = (why: string): never => {
    throw new RangeError(`not an operation: "${line}" (${why})`)
  }
  const num = (text: string | undefined, what: string): number => {
    const n = count(text ?? '', what)
    return isProblem(n) ? fail(n.problem) : n.value
  }
  const tokens = (text: string | undefined): number[] => {
    const t = readTokens(text ?? '')
    return isProblem(t) ? fail(t.problem) : t.value
  }
  switch (w[0]) {
    case 'admit': {
      if (w.length !== 4) return fail('admit takes a request, an adapter or -, and tokens')
      const req = num(w[1], 'a request id')
      const prompt = tokens(w[3])
      return w[2] === '-' ? { op: 'admit', req, prompt } : { op: 'admit', req, prompt, adapter: num(w[2], 'an adapter id') }
    }
    case 'append':
      return w.length === 3 ? { op: 'append', req: num(w[1], 'a request id'), tokens: tokens(w[2]) } : fail('append takes a request and tokens')
    case 'finish':
      return w.length === 2 ? { op: 'finish', req: num(w[1], 'a request id') } : fail('finish takes a request')
    case 'load':
      return w.length === 3 ? { op: 'load-adapter', adapter: num(w[1], 'an adapter id'), pages: num(w[2], 'a page count') } : fail('load takes an adapter and a page count')
    case 'unload':
      return w.length === 2 ? { op: 'unload-adapter', adapter: num(w[1], 'an adapter id') } : fail('unload takes an adapter')
    case 'reset':
      return w.length === 1 ? { op: 'reset' } : fail('reset takes nothing')
    default:
      return fail('no such command')
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// The reply to an operation

/** `ok 12`, `ok 12 hit 32` or `refused no-pages 3`. */
export function wireReply(result: KvResult): string {
  if (!result.ok) return `refused ${result.reason} ${result.free}`
  return result.hit === undefined ? `ok ${result.free}` : `ok ${result.free} hit ${result.hit}`
}

/** The result a reply says. `admit` replies carry a hit and the others do not: a reply of the wrong shape is a problem. */
export function parseWireReply(op: KvOp, text: string): Parsed<KvResult> {
  const w = text.split(' ')
  if (w[0] === 'ok') {
    const wantsHit = op.op === 'admit'
    if (w.length !== (wantsHit ? 4 : 2) || (wantsHit && w[2] !== 'hit')) return bad(`an ${op.op} is answered "ok <free>${wantsHit ? ' hit <tokens>' : ''}"`)
    const free = count(w[1], 'the free count')
    if (isProblem(free)) return free
    if (!wantsHit) return ok({ ok: true, free: free.value })
    const hit = count(w[3], 'the hit')
    return isProblem(hit) ? hit : ok({ ok: true, free: free.value, hit: hit.value })
  }
  if (w[0] === 'refused') {
    if (w.length !== 3 || !(WIRE_REASONS as readonly string[]).includes(w[1])) return bad('a refusal is "refused <reason> <free>", with a reason from the list')
    const free = count(w[2], 'the free count')
    return isProblem(free) ? free : ok({ ok: false, reason: w[1] as KvRefusal, free: free.value })
  }
  return bad(w[0] === 'err' ? `the module refused the command: ${text}` : `not an answer to ${op.op}`)
}

// ---------------------------------------------------------------------------------------------------------------------------
// The state

const join = (items: readonly string[]): string => (items.length === 0 ? '-' : items.join(';'))

/** The text of each state query for a snapshot: what a right module answers. */
export function wireState(state: KvState): Record<Exclude<WireQuery, 'events'>, string> {
  const page = (p: KvPage): string => {
    switch (p.st) {
      case 'free':
        return 'f'
      case 'cached':
        return `c:${p.group}:${p.hash}`
      case 'used':
        return `u:${p.group}:${p.refs}:${p.hash ?? '-'}`
      case 'adapter':
        return `a:${p.adapter}`
    }
  }
  const table = (t: readonly (number | null)[]): string => (t.length === 0 ? '-' : t.map((e) => e ?? '_').join(','))
  return {
    pages: state.pages.map(page).join(';'),
    queue: list(state.queue),
    requests: join(state.requests.map((r) => `${r.id}:${r.adapter ?? '-'}:${r.length}:${r.tables.map(table).join('/')}`)),
    adapters: join(state.adapters.map((a) => `${a.id}:${a.users}:${list(a.pages)}`)),
    cache: join(state.cache.map((e) => `${e.group}:${e.hash}:${e.page}`)),
  }
}

function readList(text: string, what: string): Parsed<number[]> {
  if (text === '-') return ok([])
  const out: number[] = []
  for (const part of text.split(',')) {
    const n = count(part, what)
    if (isProblem(n)) return n
    out.push(n.value)
  }
  return ok(out)
}

/** `pages`: one record for each page of the pool. */
export function parseWirePages(text: string, pool: number): Parsed<KvPage[]> {
  const records = text.split(';')
  if (records.length !== pool) return bad(`the pool has ${pool} pages, and the reply describes ${records.length}`)
  const out: KvPage[] = []
  for (const [id, record] of records.entries()) {
    const f = record.split(':')
    const where = `page ${id}`
    const num = (i: number, what: string): Parsed<number> => count(f[i] ?? '', `${what} of ${where}`)
    if (f[0] === 'f' && f.length === 1) {
      out.push({ st: 'free' })
    } else if (f[0] === 'c' && f.length === 3) {
      const group = num(1, 'the group')
      const hash = num(2, 'the hash')
      if (isProblem(group)) return group
      if (isProblem(hash)) return hash
      out.push({ st: 'cached', group: group.value, hash: hash.value })
    } else if (f[0] === 'u' && f.length === 4) {
      const group = num(1, 'the group')
      const refs = num(2, 'the reference count')
      const hash = maybe(f[3], (t) => count(t, `the hash of ${where}`))
      if (isProblem(group)) return group
      if (isProblem(refs)) return refs
      if (isProblem(hash)) return hash
      out.push({ st: 'used', group: group.value, refs: refs.value, hash: hash.value })
    } else if (f[0] === 'a' && f.length === 2) {
      const adapter = num(1, 'the adapter')
      if (isProblem(adapter)) return adapter
      out.push({ st: 'adapter', adapter: adapter.value })
    } else {
      return bad(`${where} is described as "${record}", which is not f, c:<g>:<hash>, u:<g>:<refs>:<hash|-> or a:<adapter>`)
    }
  }
  return ok(out)
}

export function parseWireQueue(text: string): Parsed<number[]> {
  return readList(text, 'a page in the queue')
}

export function parseWireRequests(text: string, groups: number): Parsed<KvRequest[]> {
  if (text === '-') return ok([])
  const out: KvRequest[] = []
  for (const record of text.split(';')) {
    const f = record.split(':')
    if (f.length !== 4) return bad(`a request is described as "${record}", which is not <id>:<adapter|->:<tokens>:<tables>`)
    const id = count(f[0], 'a request id')
    const adapter = maybe(f[1], (t) => count(t, 'the adapter of a request'))
    const length = count(f[2], 'the length of a request')
    if (isProblem(id)) return id
    if (isProblem(adapter)) return adapter
    if (isProblem(length)) return length
    const tables = f[3].split('/')
    if (tables.length !== groups) return bad(`request ${id.value} has ${tables.length} tables, and the spec has ${groups} groups`)
    const rows: (number | null)[][] = []
    for (const table of tables) {
      const row: (number | null)[] = []
      if (table !== '-') {
        for (const entry of table.split(',')) {
          if (entry === '_') {
            row.push(null)
            continue
          }
          const page = count(entry, `a block of request ${id.value}`)
          if (isProblem(page)) return page
          row.push(page.value)
        }
      }
      rows.push(row)
    }
    out.push({ id: id.value, adapter: adapter.value, length: length.value, tables: rows })
  }
  return ok(out)
}

export function parseWireAdapters(text: string): Parsed<KvAdapter[]> {
  if (text === '-') return ok([])
  const out: KvAdapter[] = []
  for (const record of text.split(';')) {
    const f = record.split(':')
    if (f.length !== 3) return bad(`an adapter is described as "${record}", which is not <id>:<users>:<pages>`)
    const id = count(f[0], 'an adapter id')
    const users = count(f[1], 'the users of an adapter')
    const pages = readList(f[2], 'a page of an adapter')
    if (isProblem(id)) return id
    if (isProblem(users)) return users
    if (isProblem(pages)) return pages
    out.push({ id: id.value, users: users.value, pages: pages.value })
  }
  return ok(out)
}

export function parseWireCache(text: string): Parsed<KvCacheEntry[]> {
  if (text === '-') return ok([])
  const out: KvCacheEntry[] = []
  for (const record of text.split(';')) {
    const f = record.split(':')
    if (f.length !== 3) return bad(`a cache entry is described as "${record}", which is not <g>:<hash>:<page>`)
    const group = count(f[0], 'the group of a cache entry')
    const hash = count(f[1], 'the hash of a cache entry')
    const page = count(f[2], 'the page of a cache entry')
    if (isProblem(group)) return group
    if (isProblem(hash)) return hash
    if (isProblem(page)) return page
    out.push({ group: group.value, hash: hash.value, page: page.value })
  }
  return ok(out)
}

// ---------------------------------------------------------------------------------------------------------------------------
// Events

/** The `events` text for events: the tokens of a stored run as a count and a digest, the rest as the module reports them. */
export function wireEvents(events: readonly KvEvent[]): string {
  return join(
    events.map((e) => {
      if (e.type === 'AllBlocksCleared') return 'C'
      const group = e.group_idx ?? 0
      if (e.type === 'BlockRemoved') return `R:${group}:${e.block_hashes[0]}`
      return `S:${group}:${e.parent_block_hash ?? '-'}:${e.lora_id ?? '-'}:${e.block_hashes.join(',')}:${e.token_ids.length}:${hex8(tokenDigest(e.token_ids))}`
    }),
  )
}

/**
 * The events a reply says, built as the model builds them (the shapes of `kvStored`, `kvRemoved` and `kvCleared`), with the tokens of a
 * stored run as `[count, digest]` (`digestEvent`).
 */
export function parseWireEvents(text: string, spec: KvSpec): Parsed<KvEvent[]> {
  if (text === '-') return ok([])
  const out: KvEvent[] = []
  for (const record of text.split(';')) {
    const f = record.split(':')
    if (f[0] === 'C' && f.length === 1) {
      out.push(kvCleared() satisfies KvAllBlocksCleared)
      continue
    }
    if (f[0] !== 'R' && f[0] !== 'S') return bad(`an event is described as "${record}", which is not S:…, R:<g>:<hash> or C`)
    const group = count(f[1] ?? '', 'the group of an event', spec.groups.length - 1)
    if (isProblem(group)) return group
    const g = spec.groups[group.value]
    if (f[0] === 'R' && f.length === 3) {
      const hash = count(f[2], 'a removed hash')
      if (isProblem(hash)) return hash
      out.push(kvRemoved(group.value, hash.value) satisfies KvBlockRemoved)
    } else if (f[0] === 'S' && f.length === 7) {
      const parent = maybe(f[2], (t) => count(t, 'the parent hash'))
      const adapter = maybe(f[3], (t) => count(t, 'the adapter of an event'))
      const hashes = readList(f[4], 'a stored hash')
      const n = count(f[5], 'the token count of an event')
      if (isProblem(parent)) return parent
      if (isProblem(adapter)) return adapter
      if (isProblem(hashes)) return hashes
      if (isProblem(n)) return n
      if (!/^[0-9a-f]{8}$/.test(f[6])) return bad(`the digest of an event is "${f[6]}", which is not 8 hex digits`)
      const stored = kvStored(g, group.value, hashes.value, parent.value, [], adapter.value)
      out.push({ ...stored, token_ids: [n.value, parseInt(f[6], 16)] })
    } else {
      return bad(`an event is described as "${record}", which is not S:…, R:<g>:<hash> or C`)
    }
  }
  return ok(out)
}

// ---------------------------------------------------------------------------------------------------------------------------
// Words

/** An operation in a few words, for a message. */
export function describeOp(op: KvOp): string {
  switch (op.op) {
    case 'admit':
      return `admit ${op.req} (${op.prompt.length} tokens${op.adapter === undefined ? '' : `, adapter ${op.adapter}`})`
    case 'append':
      return `append ${op.req} (${op.tokens.length} tokens)`
    case 'finish':
      return `finish ${op.req}`
    case 'load-adapter':
      return `load adapter ${op.adapter} (${op.pages} pages)`
    case 'unload-adapter':
      return `unload adapter ${op.adapter}`
    case 'reset':
      return 'reset'
  }
}
