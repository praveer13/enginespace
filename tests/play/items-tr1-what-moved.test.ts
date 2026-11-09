/*
 * W1b-T03: `tr1.what-moved`, the exit item of TR1's fourth lesson. The tests hold every case to the claims that carry it: one claim that quotes
 * the code or the text of "Inside vLLM" at its commit, and one that quotes vLLM v0.33.0, each saying what the case says of its side. The six
 * claims of content/claims/tr1-items.yaml, which the lesson's unchanged boxes needed, are checked against the pinned sources when a machine has them.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CORE_SCHEMA, load } from 'js-yaml'
import { familiesForKc, familyById, fixedSeeds, FAMILIES, LEVELS, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { BOX_KINDS, BOXES, claimsOf, foundOf, STATEMENTS, VERDICTS, whatMoved } from '@es/play/items/families/tr1/what-moved'
import type { Case } from '@es/play/items/families/tr1/what-moved'
import { claim, correctId, expectWellMade, KC_IDS, root, shares, sourceFile } from './items-tr1-support.ts'

setDefaultTimeout(60_000)

const SEEDS = fixedSeeds(400, 0x71a5)

const squash = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** What a claim is, as `claim` of the support file reads it, with its pin. */
interface Record {
  id: string
  pin?: string
  text: string
  source?: { url: string; quote: string; title: string; accessed: string }
  verifiedAt: string
  ttlDays: number
  tag: string
}
const record = (id: string): Record => claim(id) as unknown as Record

describe('the family', () => {
  test('is registered, names a KC of the graph, and offers its variants at every level', () => {
    expect(familyById('tr1.what-moved')).toBe(whatMoved)
    expect(FAMILIES).toContain(whatMoved)
    expect(familiesForKc('tr1.read-at-the-pin')).toEqual([whatMoved])
    for (const kc of whatMoved.kcs) expect(KC_IDS.has(kc)).toBe(true)
    for (const level of LEVELS) expect(offeredAt(whatMoved, level).map((variant) => variant.id)).toEqual(['box', 'statement'])
  })

  test('has cases for every kind of change and every verdict, and the lesson\'s fifteen boxes are among them', () => {
    expect([...new Set(BOXES.map((item) => item.kind))].sort()).toEqual([...BOX_KINDS].sort())
    expect([...new Set(STATEMENTS.map((item) => item.kind))].sort()).toEqual([...VERDICTS].sort())
    expect(new Set([...BOXES, ...STATEMENTS].map((item) => item.id)).size).toBe(BOXES.length + STATEMENTS.length)
    // How many cases each kind has: six boxes stayed in their file, and no kind is without a second case where the lesson gives one.
    const count = (kind: string) => BOXES.filter((item) => item.kind === kind).length
    expect(BOX_KINDS.map(count)).toEqual([6, 2, 1, 2, 2])
    expect(VERDICTS.map((verdict) => STATEMENTS.filter((item) => item.kind === verdict).length)).toEqual([4, 2, 2, 1, 1])
  })
})

describe('every item', () => {
  test('is deterministic, well formed and graded as the key says, at every level, with no bare number in a sentence', () => {
    expectWellMade(whatMoved, SEEDS)
  })
})

describe('every case rests on two sides of claims', () => {
  const all: Case<string>[] = [...BOXES, ...STATEMENTS]

  test('names claims that exist, those of the post\'s commit for the post and those of the pin for the pin, each saying what the case says of its side', () => {
    for (const item of all) {
      for (const [side, pin] of [['post', 'inside-vllm'], ['pin', 'vllm']] as const) {
        const claims = item[side].claims
        expect([item.id, side, Object.keys(claims).length > 0]).toEqual([item.id, side, true])
        for (const [id, words] of Object.entries(claims)) {
          const found = record(id)
          expect([item.id, id, found.pin]).toEqual([item.id, id, pin])
          for (const word of words) expect([item.id, id, word, found.text.toLowerCase().includes(word.toLowerCase())]).toEqual([item.id, id, word, true])
        }
      }
      expect(claimsOf(item).length).toBeGreaterThanOrEqual(2)
    }
  })

  test('says nothing in a sentence of its own that a claim already says word for word: a sentence of the export is not a key', () => {
    for (const item of all) {
      for (const side of ['post', 'pin'] as const) {
        const says = squash(plain(item[side].says))
        for (const id of Object.keys(item[side].claims)) {
          const text = squash(record(id).text)
          expect([item.id, side, id, text.includes(says) || says.includes(text)]).toEqual([item.id, side, id, false])
        }
      }
    }
  })

  test('gives the pin\'s side to a ticket of level 3 and to the first step of level 1 in words that do not compare it with the post: a "still" or a "gone" would answer', () => {
    const COMPARES = /\b(?:still|too|old|gone|later|longer|again|moved|renamed|replaced|removed)\b/i
    for (const item of all) {
      expect([item.id, COMPARES.test(plain(foundOf(item.pin)))]).toEqual([item.id, false])
      // The sentence that the ticket withholds is the one that compares: where there is one, the explanation says it.
      if (item.pin.found !== undefined) expect([item.id, plain(item.pin.found) === plain(item.pin.says)]).toEqual([item.id, false])
    }
  })

  test('has the quotes of the post\'s side in the commit that the post reads and of the pin\'s side in its tag, both for the unchanged boxes and for the rest', () => {
    for (const item of all) {
      for (const [side, ref] of [['post', '42172ad18fbc22c89d0063184e4570cc84186e16'], ['pin', 'v0.33.0']] as const) {
        for (const id of Object.keys(item[side].claims)) {
          const source = record(id).source
          expect(source).toBeDefined()
          const url = source?.url ?? ''
          // A claim of the post is the post's own text, or a file at the commit that the post reads; a claim of the pin is a file or a release at the pin.
          if (side === 'post') expect([id, url.startsWith('https://vllm.ai/blog/2025-09-05-anatomy-of-vllm') || url.includes(`/blob/${ref}/`)]).toEqual([id, true])
          else expect([id, url.includes(`/blob/${ref}/`) || /\/releases\/tag\/v0\.(?:14|29|33)\.0/.test(url)]).toEqual([id, true])
        }
      }
    }
  })
})

describe('the six unchanged boxes, whose claims are in tr1-items.yaml', () => {
  const FILE = 'content/claims/tr1-items.yaml'
  // The compiler reads the claims with the core schema, which leaves a date as the string it is.
  const claims = load(readFileSync(path.join(root, FILE), 'utf8'), { schema: CORE_SCHEMA }) as Record[]
  const POST = '42172ad18fbc22c89d0063184e4570cc84186e16'
  const PIN = '4ba787ec9959e566d3b587a796dff07673324da5'

  test('are a pair of claims each, with the same file on both sides, and the new claim of a first status', () => {
    expect(claims).toHaveLength(13)
    const boxes = BOXES.filter((item) => item.kind === 'same-file')
    expect(boxes).toHaveLength(6)
    for (const item of boxes) {
      const [postId] = Object.keys(item.post.claims)
      const [pinId] = Object.keys(item.pin.claims)
      expect(postId).toBe(`inside-vllm.where.${item.id}`)
      expect(pinId).toBe(`vllm.where.${item.id}`)
      expect(record(postId).source?.url.split('#')[0].replace(POST, 'X')).toBe(record(pinId).source?.url.split('#')[0].replace('v0.33.0', 'X'))
      expect(record(postId).source?.quote).toBe(record(pinId).source?.quote)
    }
    expect(claims.map((entry) => entry.id)).toContain('vllm.request.starts-waiting')
  })

  test('are measured, dated, and kept for a quarter, like the other claims at a pin', () => {
    for (const entry of claims) {
      expect(entry.tag).toBe('measured')
      expect(entry.ttlDays).toBe(90)
      expect(entry.source?.accessed ?? '').toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect((entry.source?.accessed ?? '') <= entry.verifiedAt).toBe(true)
      expect(entry.source?.url).not.toMatch(/\/(?:main|master|latest|stable|HEAD)(?:\/|#|$)/)
      expect(entry.text).toMatch(/\.$/)
    }
  })

  const files = claims.map((entry) => {
    const m = /^https:\/\/github\.com\/vllm-project\/vllm\/blob\/([^/]+)\/([^#]+)#L(\d+)(?:-L(\d+))?$/.exec(entry.source?.url ?? '')
    return { entry, ref: m?.[1] ?? '', file: m?.[2] ?? '', first: Number(m?.[3]), last: Number(m?.[4] ?? m?.[3]) }
  })
  const sourced = files.every(({ ref, file }) => sourceFile('vllm', ref === 'v0.33.0' ? PIN : ref, file) !== null)
  test.skipIf(!sourced)('quote the line they anchor, in the unpacked tarballs of the two commits', () => {
    for (const { entry, ref, file, first, last } of files) {
      const text = sourceFile('vllm', ref === 'v0.33.0' ? PIN : ref, file) ?? ''
      const lines = text.split('\n')
      expect([entry.id, last <= lines.length]).toEqual([entry.id, true])
      expect([entry.id, squash(lines.slice(first - 1, last).join(' ')).includes(squash(entry.source?.quote ?? ''))]).toEqual([entry.id, true])
    }
  })
})

describe('box', () => {
  const caseOf = (item: Item): Case<string> => BOXES.find((candidate) => candidate.id === item.params.case) as Case<string>

  test('is the kind of change of the case, drawn first, so each of the five is the key on a fifth of the seeds', () => {
    for (const level of LEVELS) {
      for (const seed of SEEDS.slice(0, 100)) {
        const item = whatMoved.make(seed, level, 'box')
        expect(correctId(item)).toBe(caseOf(item).kind)
      }
    }
    const share = shares(whatMoved, 2, 'box', correctId)
    expect([...share.keys()].sort()).toEqual([...BOX_KINDS].sort())
    for (const [kind, rate] of share) expect([kind, rate > 0.15 && rate < 0.25]).toEqual([kind, true])
  })

  test('shows the post\'s side at levels 0 to 2 and the pin\'s at level 3, and the other side only in the explanation', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      for (const level of [0, 1, 2] as const) {
        const item = whatMoved.make(seed, level, 'box')
        const found = caseOf(item)
        expect(plain(item.stem)).toContain(plain(found.subject))
        expect(plain(item.stem)).not.toContain(plain(found.pin.says))
        expect(plain(item.stem)).not.toContain(plain(foundOf(found.pin)))
      }
      const item = whatMoved.make(seed, 3, 'box')
      const found = caseOf(item)
      expect(plain(item.stem)).toContain(plain(foundOf(found.pin)))
      expect(plain(item.stem)).not.toContain(plain(found.post.says))
    }
  })

  test('explains the right option by the rule of its kind and the pin\'s side, and a wrong one by saying it did not happen', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      const item = whatMoved.make(seed, 2, 'box')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const found = caseOf(item)
      for (const option of item.answer.options) {
        expect(plain(option.why)).toContain(plain(found.pin.says))
        if (option.id === item.answer.correct) expect(option.miss).toBeUndefined()
        else {
          expect(plain(option.why)).toContain('That is not what happened here.')
          expect(option.miss).toBe(`tr1.what-moved.${option.id}-for-${item.answer.correct}`)
        }
      }
    }
  })

  test('draws every case: no box is left out, and none is every ticket', () => {
    const seen = new Map<string, number>()
    for (const seed of fixedSeeds(1000, 0x2b0c)) {
      const id = String(whatMoved.make(seed, 2, 'box').params.case)
      seen.set(id, (seen.get(id) ?? 0) + 1)
    }
    expect([...seen.keys()].sort()).toEqual(BOXES.map((item) => item.id).sort())
    for (const n of seen.values()) expect(n).toBeLessThan(300)
  })
})

describe('statement', () => {
  const caseOf = (item: Item): Case<string> => STATEMENTS.find((candidate) => candidate.id === item.params.case) as Case<string>

  test('is the verdict of the case, drawn first, so each of the five is the key on a fifth of the seeds', () => {
    for (const level of LEVELS) {
      for (const seed of SEEDS.slice(0, 100)) {
        const item = whatMoved.make(seed, level, 'statement')
        expect(correctId(item)).toBe(caseOf(item).kind)
      }
    }
    const share = shares(whatMoved, 2, 'statement', correctId)
    expect([...share.keys()].sort()).toEqual([...VERDICTS].sort())
    for (const [verdict, rate] of share) expect([verdict, rate > 0.15 && rate < 0.25]).toEqual([verdict, true])
  })

  test('holds for the four statements the lesson says went on being true, and is stale for the six that it lists, and the stale ones say how', () => {
    expect(STATEMENTS.filter((item) => item.kind === 'holds').map((item) => item.id)).toEqual(['two-queues', 'prefix-caching', 'block-size', 'mixed-steps'])
    expect(STATEMENTS.filter((item) => item.kind !== 'holds').map((item) => item.id)).toEqual(['async-scheduling', 'chunked-prefill', 'use-v1', 'medusa', 'draft-model', 'api-server'])
    // The statements of the post that the lesson lists as stale are the ones whose pin-side claims say a default, a removal or a shim.
    expect(record('vllm.async-scheduling.default').text).toContain('on by default')
    expect(record('vllm.scheduler.chunked-prefill-default').text).toContain('on by default')
    expect(record('vllm.env.no-use-v1').text).toContain('has no VLLM_USE_V1')
    expect(record('vllm.spec.medusa-removed').text).toContain('were removed')
    expect(record('vllm.http.api-server-shim').text).toContain('deprecated')
  })

  test('at level 3 gives the pin\'s side and asks whether the post\'s statement holds', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      const item = whatMoved.make(seed, 3, 'statement')
      expect(plain(item.stem)).toContain(plain(foundOf(caseOf(item).pin)))
      expect(plain(item.stem)).toContain('Does what the post "Inside vLLM" says about it hold')
    }
  })
})

describe('levels', () => {
  test('give a worked example at level 0, the pin\'s side as the first step at level 1, and nothing at levels 2 and 3', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const variant of ['box', 'statement'] as const) {
        expect(whatMoved.make(seed, 0, variant).worked).toHaveLength(3)
        const first = whatMoved.make(seed, 1, variant)
        expect(first.worked).toHaveLength(1)
        const found = (variant === 'box' ? BOXES : STATEMENTS).find((candidate) => candidate.id === first.params.case)
        expect(plain(first.worked[0].text)).toBe(plain(found === undefined ? [] : foundOf(found.pin)))
        expect(whatMoved.make(seed, 2, variant).worked).toHaveLength(0)
        expect(whatMoved.make(seed, 3, variant).worked).toHaveLength(0)
      }
    }
  })

  test('end the solution in the kind and the rule, after the post\'s side and the pin\'s', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const item = whatMoved.make(seed, 2, 'box')
      const steps = whatMoved.solution(item)
      const found = BOXES.find((candidate) => candidate.id === item.params.case) as Case<string>
      expect(steps.map((step) => plain(step.text)).slice(0, 2)).toEqual([plain(found.post.says), plain(found.pin.says)])
      expect(plain(steps[2].text)).toMatch(/^So it is a box that /)
    }
  })
})
