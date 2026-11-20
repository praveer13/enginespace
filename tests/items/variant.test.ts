/*
 * An `item` block may name a variant: the block draws that variant and no other, and a block that names none draws as it always did
 * (the seed picks among the variants offered at the level). The golden vectors are not touched by either.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { startAttempt } from '@es/play/items'
import { bubbleWidth } from '@es/play/items/families/tr2/bubble-width'
import { ItemBlock } from '@/items/ItemBlock'

const render = (element: ReactElement) => renderToString(h(StaticRouter, { location: '/m/tr2/l0-sample' }, element)).replaceAll('<!-- -->', '')
const entropy = Array.from({ length: 24 }, (_, at) => 1000 + at * 7919)
const variantsOf = (attempt: ReturnType<typeof startAttempt>) => new Set(attempt.served.map((served) => served.item.variant))

describe('a block that names a variant', () => {
  test('draws only that variant, at a level that offers several', () => {
    expect(variantsOf(startAttempt(bubbleWidth, 2, entropy)).size).toBeGreaterThan(1)
    for (const variant of ['async-off', 'async-on', 'close-it']) expect([...variantsOf(startAttempt(bubbleWidth, 2, entropy, { variant }))]).toEqual([variant])
  })

  test('is refused where the variant is not offered at the level, as the draw refuses it', () => {
    expect(() => startAttempt(bubbleWidth, 0, entropy, { variant: 'close-it' })).toThrow('is not offered at level 0')
  })

  test('shows the variant on its waiting sheet, and is unbuilt at a level that does not offer it', () => {
    const named = render(h(ItemBlock, { block: { type: 'item', family: 'tr2.bubble-width', level: 2, count: 3, variant: 'close-it' }, scope: 'tr2.l0' }))
    const title = bubbleWidth.variants.find((variant) => variant.id === 'close-it')?.title ?? ''
    expect(title).not.toBe('')
    expect(named).toContain(`Bubble width: ${title}`)
    expect(named).toContain('data-phase="idle"')
    const absent = render(h(ItemBlock, { block: { type: 'item', family: 'tr2.bubble-width', level: 0, count: 3, variant: 'close-it' }, scope: 'tr2.l0' }))
    expect(absent).toContain('data-phase="unbuilt"')
  })
})

describe('a block that names none', () => {
  test('draws as before: the attempt is the same with and without an empty options object', () => {
    expect(startAttempt(bubbleWidth, 2, entropy, {})).toEqual(startAttempt(bubbleWidth, 2, entropy))
    const plain = render(h(ItemBlock, { block: { type: 'item', family: 'tr2.bubble-width', level: 2, count: 3 }, scope: 'tr2.l0' }))
    expect(plain).toContain('Bubble width')
    expect(plain).not.toContain('Bubble width:')
  })
})
