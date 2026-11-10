/*
 * W1b-T05: `tr5a.hit-length`, the tokens a prefix hit covers when every KV group of a hybrid model must hold it. The tests hold the family's rule
 * to the facts it rests on: the claims about vLLM v0.33.0 that it cites, the lesson's own caches, and the sim's lookup (`kvFindHit`), run on the same
 * blocks through the sim's hash chains, which finds each key again.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { bandAcceptance, bandedSeeds, BAND_FLOOR, drawInBand, familiesForKc, familyById, FAMILIES, fixedSeeds, LEVELS, measureBlind, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { acceptedEdges, accepts, hitEdge, hitLength, maxEdge, needBlocks } from '@es/play/items/families/tr5a/hit-length'
import { kvChain, kvExtraKey, kvFindHit } from '../../packages/sim/kv'
import type { KvGroupSpec, KvSpec } from '../../packages/sim/kv'
import { untaggedNumbers } from '../../scripts/content/prose.ts'
import { itemProblems } from '../../scripts/verify-items.ts'
import { keyOf, wrongOf } from './items-support.ts'
import { claim, KC_IDS } from './items-tr6-support.ts'

setDefaultTimeout(60_000)

const SEEDS = fixedSeeds(300, 0x417)

const seedsOf = (variant: string, level: 0 | 1 | 2 | 3, count: number): number[] =>
  bandedSeeds(hitLength, level, 3000)
    .filter((seed) => hitLength.make(seed, level).variant === variant)
    .slice(0, count)

/** The scene that an item's params describe: the model the ticket prints, and the blocks each group has cached. */
interface Scene {
  readonly variant: 'windows' | 'states' | 'limiter'
  readonly prompt: number
  readonly block: number
  readonly window: number
  readonly held: readonly (readonly number[])[]
  readonly limiter: number
}

function sceneOf(item: Item): Scene {
  const { prompt, block, window, held, limiter } = item.params
  if (typeof prompt !== 'number' || typeof block !== 'number' || typeof window !== 'number' || typeof held !== 'string' || typeof limiter !== 'number') throw new Error('not a scene')
  if (item.variant !== 'windows' && item.variant !== 'states' && item.variant !== 'limiter') throw new Error(`no scene for ${item.variant}`)
  return { variant: item.variant, prompt, block, window, held: held.split(';').map((blocks) => blocks.split('.').map(Number)), limiter }
}

/** The sim's spec for the scene: one full group and the others sliding or state, all with one block size. */
function specOf(scene: Scene): KvSpec {
  const groups: KvGroupSpec[] = scene.held.map((_, at) => {
    if (at === 0) return { id: 'full0', kind: 'full', layers: 1, blockTokens: scene.block }
    return scene.window > 0
      ? { id: `sw${at - 1}`, kind: 'sliding', layers: 1, blockTokens: scene.block, window: scene.window }
      : { id: `state${at - 1}`, kind: 'state', layers: 1, blockTokens: scene.block, statePages: 2 }
  })
  return { poolPages: 1, pageBytes: scene.block, tokenBytes: 1, paddingLayers: 0, groups, prefixCaching: true }
}

/** The hit that the sim's lookup finds when each group has the blocks the scene gives it cached, in tokens, and what each group alone would serve. */
function simHit(scene: Scene): { hit: number; perGroup: readonly number[] } {
  const spec = specOf(scene)
  const prompt = Array.from({ length: scene.prompt }, (_, at) => at + 1)
  const whole = Math.floor(scene.prompt / scene.block)
  const chains = spec.groups.map(() => kvChain(prompt, whole, scene.block, kvExtraKey(null)))
  const cached = scene.held.map((blocks, group) => new Set(blocks.map((block) => chains[group][block])))
  return kvFindHit(spec, (group, hash) => cached[group].has(hash), chains, scene.prompt - 1)
}

const keyValue = (item: Item): number => (item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN)

describe('the family', () => {
  test('is registered, names the KC of the graph, and offers its variants at the levels it says', () => {
    expect(familyById('tr5a.hit-length')).toBe(hitLength)
    expect(FAMILIES).toContain(hitLength)
    expect(familiesForKc('tr5a.hit-intersection')).toEqual([hitLength])
    for (const kc of hitLength.kcs) expect(KC_IDS.has(kc)).toBe(true)
    expect(offeredAt(hitLength, 0).map((variant) => variant.id)).toEqual(['windows', 'states'])
    expect(offeredAt(hitLength, 2).map((variant) => variant.id)).toEqual(['windows', 'states'])
    // The lesson's exit ticket asks for the tokens a hit covers, at level 2: the changed surface is level 3.
    expect(offeredAt(hitLength, 3).map((variant) => variant.id)).toEqual(['limiter'])
    for (const seed of SEEDS.slice(0, 100)) expect(hitLength.make(seed, 2).answer.kind).toBe('numeric')
  })

  test('rests on claims that say what it says: the intersection, the loop, the window, the state, the last token and the alignment', () => {
    expect(claim('vllm.hybrid-kv.intersection').text).toContain('returns the intersection of the groups')
    expect(claim('vllm.hybrid-kv.n-group-lookup').text).toContain('any shortening restarts the pass over all the types')
    expect(claim('vllm.hybrid-kv.sliding-hit-blocks').value).toBe('ceil((window - 1) / block size)')
    expect(claim('vllm.hybrid-kv.sliding-hit-prefix').text).toContain('still hits on the cached run that starts at the first block')
    expect(claim('vllm.hybrid-kv.mamba-hit').text).toContain('needs that one block')
    expect(claim('vllm.hybrid-kv.downward-closed').text).toContain('full attention as downward-closed')
    expect(claim('vllm.kv-pool.max-hit-length').text).toContain("caps it at the prompt's length less 1")
    expect(claim('vllm.hybrid-kv.hit-alignment').text).toContain('multiple of the least common multiple of the groups')
  })
})

describe("the lesson's caches, held to the sim", () => {
  const first = { variant: 'windows', prompt: 176, block: 16, window: 32, limiter: 0, held: [range(0, 9), range(6, 8), range(7, 9)] } as const
  const second = { ...first, held: [range(0, 9), [6, 7, 9], range(7, 9)] } as const
  const states = { variant: 'states', prompt: 330, block: 32, window: 0, limiter: 0, held: [range(0, 7), [2, 5], [2, 5], [2, 5]] } as const

  function range(from: number, to: number): number[] {
    return Array.from({ length: to - from + 1 }, (_, at) => from + at)
  }

  test('with the blocks 0 to 9, 6 to 8 and 7 to 9 the groups accept the edges 1 to 10, 8 and 9, and 9 and 10, so the hit is 9 blocks, 144 tokens', () => {
    expect(needBlocks(32, 16)).toBe(2)
    expect(maxEdge(176, 16)).toBe(10)
    expect(acceptedEdges(first, 0)).toEqual(range(1, 10))
    expect(acceptedEdges(first, 1)).toEqual([8, 9])
    expect(acceptedEdges(first, 2)).toEqual([9, 10])
    expect(hitEdge(first)).toBe(9)
    expect(simHit(first)).toMatchObject({ hit: 144, perGroup: [160, 144, 160] })
  })

  test('with a block lost from the middle of the first window\'s run the groups share no edge: the union is 160 tokens and the shortest of the longest is 128', () => {
    expect(acceptedEdges(second, 1)).toEqual([8])
    expect(hitEdge(second)).toBe(0)
    const sim = simHit(second)
    expect(sim.hit).toBe(0)
    expect(Math.max(...sim.perGroup)).toBe(160)
    expect(Math.min(...sim.perGroup)).toBe(128)
  })

  test('three state groups that saved the blocks 2 and 5 accept the edges 3 and 6, and the full group every edge to 8, so the hit is 6 blocks, 192 tokens', () => {
    expect(acceptedEdges(states, 1)).toEqual([3, 6])
    expect(acceptedEdges(states, 0)).toEqual(range(1, 8))
    expect(hitEdge(states)).toBe(6)
    expect(simHit(states).hit).toBe(192)
  })
})

describe('every key is the sim\'s', () => {
  test.each([0, 1, 2, 3] as const)('at level %p the sim\'s lookup, run on the cached blocks of the ticket, finds the key, and each group alone serves its longest edge', (level) => {
    let checked = 0
    for (const variant of offeredAt(hitLength, level)) {
      for (const seed of SEEDS) {
        const item = hitLength.make(seed, level, variant.id)
        const scene = sceneOf(item)
        const sim = simHit(scene)
        const edge = hitEdge(scene)
        expect([variant.id, seed, sim.hit]).toEqual([variant.id, seed, edge * scene.block])
        scene.held.forEach((_, group) => expect(sim.perGroup[group]).toBe(Math.max(0, ...acceptedEdges(scene, group)) * scene.block))
        if (item.answer.kind === 'numeric') expect(item.answer.truth).toBe(sim.hit)
        checked += 1
      }
    }
    expect(checked).toBe(SEEDS.length * offeredAt(hitLength, level).length)
  })

  test('a hit is a whole number of blocks, never covers the last token, and is nothing when no edge is common', () => {
    for (const seed of SEEDS) {
      for (const variant of ['windows', 'states'] as const) {
        const item = hitLength.make(seed, 2, variant)
        const scene = sceneOf(item)
        const key = keyValue(item)
        expect(key % scene.block).toBe(0)
        expect(key).toBeLessThanOrEqual(scene.prompt - 1)
        expect(key).toBeLessThanOrEqual(maxEdge(scene.prompt, scene.block) * scene.block)
      }
    }
  })
})

describe('every item', () => {
  test.each(LEVELS)('at level %p is deterministic, well formed and graded as the key says', (level) => {
    for (const seed of SEEDS) {
      for (const variant of offeredAt(hitLength, level)) {
        const item = hitLength.make(seed, level, variant.id)
        expect(hitLength.make(seed, level, variant.id)).toEqual(item)
        expect(itemProblems(hitLength, item, { seed, level, variant: variant.id })).toEqual([])
        expect(hitLength.grade(item, keyOf(item)).ok).toBe(true)
        expect(hitLength.grade(item, wrongOf(item)).ok).toBe(false)
      }
    }
  })

  test('prints no number in a sentence that is not a tagged part, and prints the blocks as code', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      for (const level of LEVELS) {
        const item = hitLength.make(seed, level)
        for (const parts of [item.stem, ...item.worked.map((step) => step.text), ...hitLength.solution(item).map((step) => step.text)]) {
          for (const part of parts) if (part.t === 'text') expect(untaggedNumbers(part.text)).toEqual([])
        }
        for (const given of item.givens) if (given.label.startsWith('blocks')) expect(given.value.t).toBe('code')
      }
    }
  })

  test('level 0 shows a whole solution of another scene, level 1 the words of the first step, the rest nothing', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const variant of ['windows', 'states']) {
        const zero = hitLength.make(seed, 0, variant)
        expect(zero.worked.length).toBeGreaterThanOrEqual(4)
        expect(zero.worked.at(-1)?.result?.value).not.toBe(keyValue(zero))
        expect(hitLength.make(seed, 1, variant).worked).toHaveLength(1)
        expect(hitLength.make(seed, 2, variant).worked).toEqual([])
      }
      expect(hitLength.make(seed, 3, 'limiter').worked).toEqual([])
    }
  })

  test('the solution walks from the last token to the largest edge, and ends in the key', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      for (const variant of ['windows', 'states'] as const) {
        const item = hitLength.make(seed, 2, variant)
        const steps = hitLength.solution(item)
        expect(plain(steps[0].text)).toContain('never covers the last token')
        expect(steps.at(-1)?.result).toMatchObject({ unit: 'tokens', tag: 'derived', value: keyValue(item) })
        // One line for each group between the rule and the result.
        expect(steps).toHaveLength(2 + sceneOf(item).held.length + 1)
      }
    }
  })
})

describe('the scenes', () => {
  test('no hit at all is a fair answer in a few items, and is rare', () => {
    for (const variant of ['windows', 'states']) {
      const seeds = seedsOf(variant, 2, 400)
      const zero = seeds.filter((seed) => keyValue(hitLength.make(seed, 2, variant)) === 0).length
      expect(zero / seeds.length).toBeGreaterThan(0.02)
      expect(zero / seeds.length).toBeLessThan(0.15)
    }
  })

  test('the longest hit of one group is not the answer in most items, which is what makes it an intersection', () => {
    for (const variant of ['windows', 'states']) {
      let union = 0
      const seeds = seedsOf(variant, 2, 400)
      for (const seed of seeds) {
        const scene = sceneOf(hitLength.make(seed, 2, variant))
        const longest = scene.held.map((_, group) => Math.max(0, ...acceptedEdges(scene, group)))
        if (Math.max(...longest) === hitEdge(scene)) union += 1
      }
      expect(union / seeds.length).toBeLessThan(0.3)
    }
  })

  test('the windows and the block sizes are the ones the lesson reads: a window of 32 to 80 tokens in blocks of 16, and state blocks of 32', () => {
    for (const seed of SEEDS.slice(0, 120)) {
      const windows = sceneOf(hitLength.make(seed, 2, 'windows'))
      expect([windows.block, [32, 48, 64, 80].includes(windows.window)]).toEqual([16, true])
      expect(windows.held.length).toBeGreaterThanOrEqual(3)
      const states = sceneOf(hitLength.make(seed, 2, 'states'))
      expect([states.block, states.window]).toEqual([32, 0])
    }
  })

  test('a window that has fewer blocks before the edge than it needs takes all of them from the first', () => {
    // Two blocks before the edge of 2 blocks, three needed: the run from the first block is the whole of it.
    expect(accepts('sliding', new Set([0, 1]), 2, 3)).toBe(true)
    expect(accepts('sliding', new Set([1]), 2, 3)).toBe(false)
    expect(accepts('sliding', new Set([4, 5, 6]), 7, 3)).toBe(true)
    expect(accepts('sliding', new Set([4, 6]), 7, 3)).toBe(false)
    expect(accepts('state', new Set([6]), 7, 3)).toBe(true)
    expect(accepts('full', new Set([0, 1, 2]), 3, 3)).toBe(true)
    expect(accepts('full', new Set([1, 2]), 3, 3)).toBe(false)
  })
})

describe('limiter', () => {
  test('is drawn answer first: each of the four options is the key on about a quarter of the seeds', () => {
    const counts: Record<string, number> = { full: 0, first: 0, second: 0, none: 0 }
    for (const seed of bandedSeeds(hitLength, 3, 1000)) {
      const item = hitLength.make(seed, 3)
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      counts[item.answer.correct] += 1
    }
    for (const id of Object.keys(counts)) {
      expect([id, counts[id] > 180]).toEqual([id, true])
      expect([id, counts[id] < 330]).toEqual([id, true])
    }
  })

  test('the key names the one group that does not accept the next block, or none when the last token is what stops the hit', () => {
    for (const seed of seedsOf('limiter', 3, 400)) {
      const item = hitLength.make(seed, 3, 'limiter')
      const scene = sceneOf(item)
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const edge = hitEdge(scene)
      const need = needBlocks(scene.window, scene.block)
      // The edge one block further may be beyond what the last token allows, so each group is asked directly.
      const rejecting = scene.held.flatMap((blocks, group) => (accepts(group === 0 ? 'full' : 'sliding', new Set(blocks), edge + 1, need) ? [] : [group]))
      const ids = ['full', 'first', 'second']
      if (item.answer.correct === 'none') {
        expect(rejecting).toEqual([])
        expect(scene.prompt % scene.block).toBe(0)
        expect(edge).toBe(maxEdge(scene.prompt, scene.block))
      } else {
        expect(rejecting).toEqual([ids.indexOf(item.answer.correct)])
        expect(edge).toBeLessThan(maxEdge(scene.prompt, scene.block))
      }
      // The ticket says what the hit is.
      expect(plain(item.stem)).toContain(`${edge * scene.block}`.replace(/\B(?=(\d{3})+(?!\d))/g, ','))
    }
  })

  test('every option says why, with the blocks it needs and the block it lacks, and a lure names the group it blames', () => {
    for (const seed of seedsOf('limiter', 3, 120)) {
      const item = hitLength.make(seed, 3, 'limiter')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      expect(item.answer.options).toHaveLength(4)
      expect(item.answer.options.map((option) => option.id).sort()).toEqual(['first', 'full', 'none', 'second'])
      for (const option of item.answer.options) {
        expect(plain(option.why).length).toBeGreaterThan(60)
        for (const part of option.why) if (part.t === 'text') expect(untaggedNumbers(part.text)).toEqual([])
        if (option.id === item.answer.correct) expect(option.miss).toBeUndefined()
        else expect(option.miss).toMatch(/^tr5a\.hit-length\.blames-[a-z-]+$/)
      }
      const correct = item.answer.correct
      const right = item.answer.options.find((option) => option.id === correct)
      if (correct !== 'none') expect(plain(right?.why ?? [])).toContain('not cached')
    }
  })
})

describe('diagnoses', () => {
  const idOf = (item: Item, value: number): string | undefined => {
    const graded = hitLength.grade(item, { kind: 'numeric', value })
    return graded.ok ? 'right' : graded.diagnosis?.id
  }

  test('a wrong number that a rule recognises is named, in a sentence of tagged parts', () => {
    const seen = new Set<string>()
    for (const variant of ['windows', 'states'] as const) {
      for (const seed of seedsOf(variant, 2, 300)) {
        const item = hitLength.make(seed, 2, variant)
        const scene = sceneOf(item)
        const edge = hitEdge(scene)
        const key = keyValue(item)
        const longest = scene.held.map((_, group) => Math.max(0, ...acceptedEdges(scene, group)) * scene.block)
        const top = maxEdge(scene.prompt, scene.block)
        const asFull = (() => {
          for (let e = top; e >= 1; e -= 1) if (scene.held.every((blocks) => Array.from({ length: e }, (_, at) => at).every((block) => blocks.includes(block)))) return e * scene.block
          return 0
        })()
        const need = scene.window > 0 ? needBlocks(scene.window, scene.block) : 1
        const oneShort = (() => {
          for (let e = top; e >= 1; e -= 1) if (scene.held.every((blocks, group) => accepts(group === 0 ? 'full' : scene.window > 0 ? 'sliding' : 'state', new Set(blocks), e, Math.max(1, need - 1)))) return e * scene.block
          return 0
        })()
        const wrong: Record<string, number> = {
          ...(variant === 'windows' ? { 'window-one-short': oneShort } : {}),
          union: Math.max(...longest),
          'shortest-longest': Math.min(...longest),
          'full-only': longest[0],
          'whole-prompt': scene.prompt,
          'blocks-not-tokens': edge,
          ...(key > 0 ? { 'zero-hit': 0 } : {}),
          [variant === 'windows' ? 'sliding-as-full' : 'state-as-full']: asFull,
        }
        for (const [id, value] of Object.entries(wrong)) {
          if (value === key) continue
          const rules = Object.entries(wrong).filter(([, other]) => other === value).map(([name]) => `tr5a.hit-length.${name}`)
          expect([id, value, rules.includes(idOf(item, value) ?? '')]).toEqual([id, value, true])
          seen.add(id)
          const message = hitLength.grade(item, { kind: 'numeric', value }).diagnosis?.message ?? []
          for (const part of message) if (part.t === 'text') expect(untaggedNumbers(part.text)).toEqual([])
          expect(plain(message).length).toBeGreaterThan(30)
        }
      }
    }
    expect([...seen].sort()).toEqual(['blocks-not-tokens', 'full-only', 'shortest-longest', 'sliding-as-full', 'state-as-full', 'union', 'whole-prompt', 'window-one-short', 'zero-hit'])
  })

  test('a window read one block short is named, and read one block long it gives no hit at all, which is named as that', () => {
    const seen = new Set<string>()
    for (const seed of seedsOf('windows', 2, 600)) {
      const item = hitLength.make(seed, 2, 'windows')
      const scene = sceneOf(item)
      const need = needBlocks(scene.window, scene.block)
      const key = keyValue(item)
      const by = (blocks: number): number => {
        for (let e = maxEdge(scene.prompt, scene.block); e >= 1; e -= 1) {
          if (scene.held.every((cached, group) => accepts(group === 0 ? 'full' : 'sliding', new Set(cached), e, blocks))) return e * scene.block
        }
        return 0
      }
      const short = by(need - 1)
      const long = by(need + 1)
      // A window one block long either leaves the hit as it was or leaves no edge, so what a learner who reads it so writes is a zero.
      if (long !== key) expect(long).toBe(0)
      if (short !== key && short !== 0 && idOf(item, short) === 'tr5a.hit-length.window-one-short') seen.add('window-one-short')
      if (long !== key && key > 0) expect(idOf(item, 0)).toBe('tr5a.hit-length.zero-hit')
    }
    expect([...seen]).toEqual(['window-one-short'])
  })

  test('a number nobody could mean is wrong and has no diagnosis, and a response of the wrong kind is wrong and never throws', () => {
    const item = hitLength.make(SEEDS[0], 2, 'windows')
    expect(idOf(item, 12_345_678)).toBeUndefined()
    const choice = hitLength.make(SEEDS[0], 3, 'limiter')
    for (const response of [{ kind: 'choice', pick: 'zzz' }, { kind: 'numeric', value: Number.NaN }, { kind: 'numeric', value: -5 }] as const) {
      expect(hitLength.grade(item, response).ok).toBe(false)
      expect(hitLength.grade(choice, response).ok).toBe(false)
    }
  })
})

describe('the draws', () => {
  test.each(LEVELS)('the band accepts well over the floor at level %p, and a draw is in band', (level) => {
    expect(bandAcceptance(hitLength, level).rate).toBeGreaterThan(BAND_FLOOR)
    for (const entropy of fixedSeeds(100, 4)) {
      const { seed } = drawInBand(hitLength, level, entropy)
      expect(hitLength.band(seed, level)).toBe(true)
    }
  })

  test('is not passed by a habit: the best blind strategy stays under its bound at every level', () => {
    for (const level of LEVELS) {
      const report = measureBlind(hitLength, level, bandedSeeds(hitLength, level, 1000))
      expect(report.over).toEqual([])
      for (const row of report.best) expect(row.rate).toBeLessThanOrEqual(row.kind === 'numeric' ? 0.15 : row.bound)
    }
  })

  test("keeps to the shared core: it imports no model of the sim, so that its code is a chunk of its own and brings none of the sim's (D-059)", () => {
    const source = readFileSync(new URL('../../packages/play/items/families/tr5a/hit-length.ts', import.meta.url), 'utf8')
    const imports = [...source.matchAll(/from '(@es\/[^']+)'/g)].map((match) => match[1])
    expect(imports.length).toBeGreaterThan(0)
    for (const specifier of imports) expect(specifier).toBe('@es/sim/core')
  })
})
