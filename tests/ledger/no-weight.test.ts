/*
 * W0-T10's acceptance check 4: "No event carries a weight (test)."
 *
 * An event stores how it was earned (its provenance) and never what that is worth. The worth is looked up when the ledger is
 * read (ARCHITECTURE §7.3, D-024), so a change to a weight rewrites no history. Five things hold that:
 *   - no event the generator makes, and no example, has a member that names a weight, at any depth;
 *   - the codec refuses a weight wherever one could be put;
 *   - `provenance` is a name, and a number is not one;
 *   - no source file of the package, bar provenance.ts, so much as names a weight;
 *   - nothing that writes, merges or stores an event imports the weights.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { buildExport, canonicalJson, decodeEvent, GRADED_KINDS, KINDS, PROVENANCE_WEIGHTS, serializeExport, weightOf } from '@es/ledger'
import type { Kind, Ledger, LedgerEvent } from '@es/ledger'
import { root } from '../ci/support'
import { copy, EXAMPLES, randomLedger } from './support'

const SEEDS = Array.from({ length: 200 }, (_, index) => index + 1)

/** A name that says what an event is worth. (`exportedAt` has an "xp" in it, so the short names must start the member's name.) */
const WEIGHTY = /weight|^xp|credit|^points?|multiplier|worth/i

/** Every member name in a value, at any depth. */
function memberNames(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) memberNames(item, into)
  else if (value !== null && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      into.add(key)
      memberNames(inner, into)
    }
  }
  return into
}

/**
 * The members a codec-checked event can have: the names in `data` that carry free JSON (an answer, a reply, marks) are the
 * learner's own and are not the event's, so the scan leaves them out.
 */
function eventMembers(event: LedgerEvent): Set<string> {
  const copyOf = copy(event) as unknown as { data?: Record<string, unknown> }
  for (const free of ['answer', 'predicted', 'actual', 'marks']) delete copyOf.data?.[free]
  return memberNames(copyOf)
}

describe('no event carries a weight', () => {
  test('not one of the examples, whatever its kind', () => {
    for (const kind of KINDS) expect([...eventMembers(EXAMPLES[kind])].filter((name) => WEIGHTY.test(name))).toEqual([])
  })

  test('not one of the events of 200 seeds, nor any member of an export of them', () => {
    const kinds = new Set<Kind>()
    for (const seed of SEEDS) {
      const ledger = randomLedger(seed, 10)
      for (const event of ledger.events) {
        kinds.add(event.kind)
        expect([...eventMembers(event)].filter((name) => WEIGHTY.test(name))).toEqual([])
      }
      const file = buildExport({ ledger, device: 'dev-a1', exportedAt: '2026-11-10T08:00:00.000Z' })
      expect([...memberNames({ ...file, receipts: [] })].filter((name) => WEIGHTY.test(name))).toEqual([])
    }
    // The generator reached every kind, so the scan covered every shape.
    expect([...kinds].sort()).toEqual([...KINDS].sort())
  })

  test('the members of an event are the envelope, the graded fields, and the kind\'s own data', () => {
    const allowed = new Set(['id', 'v', 'kind', 'ref', 'at', 'tz', 'day', 'dev', 'rev', 'score', 'ok', 'provenance', 'seed', 'conf', 'data'])
    for (const kind of KINDS) for (const key of Object.keys(EXAMPLES[kind])) expect(allowed.has(key)).toBe(true)
  })
})

describe('the codec refuses a weight', () => {
  const names = ['weight', 'weights', 'xp', 'credit', 'credits', 'points', 'multiplier', 'worth', 'provenanceWeight', 'w']

  test.each([...KINDS])('%s, at the top and inside data', (kind) => {
    for (const name of names) {
      expect(decodeEvent({ ...copy(EXAMPLES[kind]), [name]: 1 }).ok).toBe(false)
      if (kind !== 'ack') {
        const event = copy(EXAMPLES[kind]) as unknown as { data: Record<string, unknown> }
        event.data[name] = 1
        expect(decodeEvent(event).ok).toBe(false)
      }
    }
  })

  test('and says that the member is not one of the event\'s', () => {
    const decoded = decodeEvent({ ...EXAMPLES.item, weight: 0.3 })
    expect(decoded.ok).toBe(false)
    if (!decoded.ok) expect(decoded.reason).toContain('weight')
  })

  test('a provenance is a name: a weight is not one', () => {
    for (const provenance of [0, 0.3, 1, '1.0', '0.3', 'weight', 'full', { weight: 1 }]) {
      expect(decodeEvent({ ...EXAMPLES.item, provenance }).ok).toBe(false)
    }
  })

  test('an ungraded event has no provenance to weigh', () => {
    for (const kind of ['challenge', 'ack'] as const) expect(decodeEvent({ ...copy(EXAMPLES[kind]), provenance: 'unseen' }).ok).toBe(false)
    expect(GRADED_KINDS).not.toContain('challenge')
    expect(GRADED_KINDS).not.toContain('ack')
  })
})

describe('weights apply at read time', () => {
  const FILES = readdirSync(path.join(root, 'packages/ledger'))
    .filter((name) => name.endsWith('.ts'))
    .map((name) => ({ name, source: readFileSync(path.join(root, 'packages/ledger', name), 'utf8') }))
  const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  test('the package has the files that the tracker lists', () => {
    expect(FILES.map((file) => file.name).sort()).toEqual(['codec.ts', 'conformance.ts', 'ids.ts', 'index.ts', 'memory-store.ts', 'merge.ts', 'provenance.ts', 'types.ts'])
  })

  test('only provenance.ts names a weight', () => {
    for (const { name, source } of FILES) {
      const mentions = withoutComments(source).match(/\b\w*(weight|Weight|WEIGHT)\w*\b/g) ?? []
      if (name === 'provenance.ts') expect(mentions).toContain('PROVENANCE_WEIGHTS')
      else expect(mentions).toEqual([])
    }
  })

  test('nothing but provenance.ts and the index imports the weights, and the index only re-exports the module', () => {
    for (const { name, source } of FILES) {
      if (name === 'provenance.ts') continue
      const imports = [...source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'\.\/provenance'/g)].flatMap((match) => match[1].split(',').map((part) => part.trim()))
      expect(imports.filter((imported) => /weight/i.test(imported))).toEqual([])
    }
    const index = FILES.find((file) => file.name === 'index.ts')?.source ?? ''
    expect(index).toContain("export * from './provenance'")
  })

  test('the table is looked up, and the ledger it is looked up for does not change', () => {
    const ledger = randomLedger(17, 12)
    const bytes = (value: Ledger) => serializeExport(buildExport({ ledger: value, device: 'dev-a1', exportedAt: '2026-11-10T08:00:00.000Z' }))
    const before = bytes(ledger)
    const credit = (value: Ledger, weights: Record<string, number>) =>
      value.events.reduce((sum, event) => sum + ('provenance' in event && event.ok ? weights[event.provenance] : 0), 0)
    const now = credit(ledger, PROVENANCE_WEIGHTS)
    const halved = credit(ledger, Object.fromEntries(Object.entries(PROVENANCE_WEIGHTS).map(([name, weight]) => [name, weight / 2])))
    expect(now).toBeGreaterThan(0)
    expect(halved).toBeCloseTo(now / 2, 9)
    // A different table gives a different total and the same bytes.
    expect(bytes(ledger)).toBe(before)
    expect(canonicalJson(ledger)).toBe(canonicalJson(randomLedger(17, 12)))
    expect(weightOf('unseen')).toBe(PROVENANCE_WEIGHTS.unseen)
  })
})
