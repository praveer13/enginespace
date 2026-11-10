/**
 * The toy families of W1-T04's tests. They are small enough to reason about, and each is a real `Gen` built from the framework's own
 * helpers, so the tests of the draws, the grading, the blind-strategy measure and the attempt run on code that families are written in.
 *
 *   toySum       a numeric variant `sum` (a + b, where the band refuses a = b) and a choice variant `larger` (which of three numbers is
 *                the largest, drawn answer first, so each option is right a third of the time). A fair family: it passes every gate.
 *   constantKey  a numeric family whose key is the same number on every seed: the best constant passes every item.
 *   echoKey      a numeric family whose key is one of the numbers printed on the ticket: reading it off passes every item.
 *   cuedChoice   a choice family whose right option is always the longest: "always the longest" passes every item.
 *   fixedId      a choice family whose right option always has the id `a`.
 *   tightBand    a numeric family whose band accepts about one seed in fifty.
 */
import { below, between, shuffle } from '@es/sim/core'
import { finishItem, gradeChoice, gradeNumeric, itemRng, num, resolveVariant, rich } from '@es/play/items'
import type { Gen, Item, Level, Response, Step, VariantSpec } from '@es/play/items'

/** What a family's `make` gives `finishItem`: the item without the parts that the framework fills in. */
type Made = Omit<Item, 'family' | 'version' | 'rev'>

type Options = {
  id?: string
  variants?: VariantSpec[]
  band?: (seed: number, level: Level) => boolean
  make: (seed: number, level: Level, variant: string) => Made
  version?: number
}

/** A family from its parts, with the grading of the framework and a one-step solution. */
export function toy({ id = 'tr2.toy', variants, band, make, version = 1 }: Options): Gen {
  const specs: VariantSpec[] = variants ?? [{ id: 'one', title: 'One', kcs: ['tr2.bubble'], levels: [0, 1, 2, 3] }]
  const shape = { id, variants: specs }
  const gen: Gen = {
    id,
    version,
    title: 'Toy',
    kcs: [...new Set(specs.flatMap((spec) => spec.kcs))],
    variants: specs,
    make: (seed, level, variant) => {
      const spec = resolveVariant(shape, seed, level, variant)
      return finishItem({ id, version }, make(seed, level, spec.id))
    },
    band: band ?? (() => true),
    grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response)),
    solution: (item): readonly Step[] => [{ text: rich('The key is ', num(item.answer.kind === 'numeric' ? item.answer.truth : 0, { unit: 'tokens', tag: 'derived' }), '.') }],
  }
  return gen
}

const SUM = { id: 'sum', title: 'A sum', kcs: ['tr2.bubble'], levels: [0, 1, 2, 3] } as const satisfies VariantSpec
const LARGER = { id: 'larger', title: 'Which is larger', kcs: ['tr2.async-overlap'], levels: [2, 3] } as const satisfies VariantSpec

const numbersOf = (seed: number, level: Level, variant: string): [number, number] => {
  const rng = itemRng('tr2.toy-sum', variant, level, seed, 'numbers')
  return [between(rng, 10, 99), between(rng, 10, 99)]
}

export const toySum: Gen = toy({
  id: 'tr2.toy-sum',
  variants: [SUM, LARGER],
  band: (seed, level) => {
    const variant = resolveVariant({ id: 'tr2.toy-sum', variants: [SUM, LARGER] }, seed, level)
    const [a, b] = numbersOf(seed, level, variant.id)
    return variant.id !== 'sum' || a !== b
  },
  make: (seed, level, variant): Made => {
    const base = { variant, level, seed, kcs: variant === 'sum' ? SUM.kcs : LARGER.kcs, worked: [] }
    if (variant === 'sum') {
      const [a, b] = numbersOf(seed, level, variant)
      return {
        ...base,
        stem: rich('What do the two numbers come to?'),
        givens: [
          { label: 'first', value: num(a, { unit: 'tokens' }) },
          { label: 'second', value: num(b, { unit: 'tokens' }) },
        ],
        answer: { kind: 'numeric', label: 'the sum', unit: 'tokens', truth: a + b, tolerance: {} },
        params: { a, b },
      }
    }
    // Answer first: the largest of three numbers is the first, the second or the third, one time in three.
    const rng = itemRng('tr2.toy-sum', variant, level, seed, 'larger')
    const place = below(rng, 3)
    const big = between(rng, 60, 99)
    const others = [between(rng, 10, 29), between(rng, 30, 59)]
    const values = [0, 1, 2].map((at) => (at === place ? big : (others.shift() ?? 20)))
    const names = ['x', 'y', 'z']
    return {
      ...base,
      stem: rich('Which of the three is the largest?'),
      givens: names.map((label, at) => ({ label, value: num(values[at], { unit: 'tokens' }) })),
      answer: {
        kind: 'choice',
        label: 'the largest',
        options: shuffle(
          itemRng('tr2.toy-sum', variant, level, seed, 'order'),
          names.map((name, at) => ({
            id: name,
            text: rich(`The one called ${name}`),
            why: at === place ? rich(name, ' is the largest, at ', num(big, { unit: 'tokens' }), '.') : rich(name, ' is smaller than the largest.'),
            ...(at === place ? {} : { miss: `tr2.toy-sum.not-${name}` }),
          })),
        ),
        correct: names[place],
      },
      params: { x: values[0], y: values[1], z: values[2] },
    }
  },
})

/** A numeric family with one variant and a key chosen by `key`. `printed` adds the numbers printed on the ticket. */
function numeric(id: string, key: (seed: number) => number, printed: (seed: number, truth: number) => { label: string; value: number }[] = () => []): Gen {
  return toy({
    id,
    make: (seed, level, variant) => {
      const truth = key(seed)
      return {
        variant,
        level,
        seed,
        kcs: ['tr2.bubble'],
        stem: rich('How many?'),
        givens: printed(seed, truth).map((given) => ({ label: given.label, value: num(given.value, { unit: 'tokens' }) })),
        worked: [],
        answer: { kind: 'numeric', label: 'how many', unit: 'tokens', truth, tolerance: {} },
        params: { seed },
      }
    },
  })
}

export const constantKey: Gen = numeric('tr2.constant-key', () => 42)
export const echoKey: Gen = numeric('tr2.echo-key', (seed) => 100 + (seed % 900), (_, truth) => [{ label: 'the total', value: truth }, { label: 'the rest', value: 7 }])

/**
 * A choice family with three options whose texts are `texts`. The right one is the text at `right`. Their ids and the order they are
 * shown in are drawn by the seed, unless `fixedId` names the id that the right one always has, so that only the cue under test shows.
 */
function choice(id: string, texts: [string, string, string], right: number, fixedId?: string): Gen {
  return toy({
    id,
    make: (seed, level, variant) => {
      const ids = shuffle(itemRng(id, variant, level, seed, 'ids'), ['a', 'b', 'c'])
      // With a fixed id, the right option takes it and the others take what is left, in order.
      const names = fixedId === undefined ? ids : texts.map((_, at) => (at === right ? fixedId : (['a', 'b', 'c'].filter((name) => name !== fixedId)[at < right ? at : at - 1])))
      const options = texts.map((text, at) => ({ id: names[at], text: rich(text), why: rich(`Because of ${text}.`), ...(at === right ? {} : { miss: `${id}.not-${names[at]}` }) }))
      return {
        variant,
        level,
        seed,
        kcs: ['tr2.bubble'],
        stem: rich('Which?'),
        givens: [],
        worked: [],
        answer: { kind: 'choice', label: 'which', options: shuffle(itemRng(id, variant, level, seed, 'order'), options), correct: names[right] },
        params: { right },
      }
    },
  })
}

/** The right option is always the longest of the three, wherever it is shown and whatever its id: the cue "always the longest" reads it. */
export const cuedChoice: Gen = choice('tr2.cued-choice', ['Short', 'A good deal longer than the others by far', 'Brief'], 1)
/** The right option is always `a`, whatever the seed and wherever it is shown. */
export const fixedId: Gen = choice('tr2.fixed-id', ['One', 'Two', 'Six'], 0, 'a')

export const tightBand: Gen = (() => {
  const base = numeric('tr2.tight-band', (seed) => 100 + (seed % 900))
  return { ...base, band: (seed: number) => seed % 50 === 0 }
})()

/** The right response for an item, from its key. */
export const keyOf = (item: Item): Response =>
  item.answer.kind === 'choice' ? { kind: 'choice', pick: item.answer.correct } : { kind: 'numeric', value: item.answer.truth }

/** A response that is wrong: another option, or a number far from the key. */
export const wrongOf = (item: Item): Response =>
  item.answer.kind === 'choice'
    ? { kind: 'choice', pick: (item.answer.options.find((option) => option.id !== (item.answer.kind === 'choice' ? item.answer.correct : '')) ?? item.answer.options[0]).id }
    : { kind: 'numeric', value: item.answer.truth + 10_000 }
