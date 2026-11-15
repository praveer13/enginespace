/*
 * W1-T04: the item block as markup (the server renderer; the browser walk is e2e/items.spec.ts): the ticket that waits, the ticket
 * for a family that no task has built, and the first ticket of an attempt, which holds a seed and no key. And the event the
 * block writes: it passes the ledger's strict codec, carries no key, and grades again to what it recorded.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { decodeEvent, stampEvent } from '@es/ledger'
import type { WriterContext } from '@es/ledger'
import { answerItem, FAMILIES, plain, regradeItem, resultOf, startAttempt } from '@es/play/items'
import type { Gen } from '@es/play/items'
import { bubbleWidth } from '@es/play/items/families/tr2/bubble-width'
import Attempt from '@/items/Attempt'
import { seedLabel } from '@/items/answer'
import { itemDraft } from '@/items/event'
import { ItemBlock } from '@/items/ItemBlock'
import { keyOf, toy, wrongOf } from '../play/items-support.ts'

const render = (element: ReactElement) => renderToString(h(StaticRouter, { location: '/m/tr2/l0-sample' }, element)).replaceAll('<!-- -->', '')
const block = (family: string, level: number, count = 3) => ({ type: 'item' as const, family, level, count })

describe('the ticket that waits', () => {
  const html = render(h(ItemBlock, { block: block('tr2.bubble-width', 2), scope: 'tr2.l0' }))

  test('says what is coming, how many, and at what level, and draws no seed: entropy is read when the stub is pulled', () => {
    expect(html).toContain('data-block="item"')
    expect(html).toContain('data-phase="idle"')
    expect(html).toContain('3 items on fresh numbers, drawn when you start.')
    expect(html).toContain('<span class="es-ticket-line__qty">3x</span>')
    expect(html).toContain('Bubble width')
    expect(html).toContain('level 2')
    expect(html).toContain('on your own')
    expect(html).not.toContain('data-seed')
    expect(html).not.toContain('seed ')
  })

  test('names the KCs it assesses on tape, and has a stub that is not held down', () => {
    for (const kc of ['tr2.bubble', 'tr2.async-overlap']) expect(html).toContain(kc)
    expect(html).toMatch(/<button type="button" class="es-stub__pull"(?![^>]*disabled)[^>]*>/)
    expect(html).toContain('Start items')
  })

  test('is a ticket like the other blocks: the lesson on its head line, the family beside it, a stamped title', () => {
    expect(html).toContain('<span aria-hidden="true">tr2.l0</span>')
    expect(html).toContain('tr2.bubble-width')
    expect(html).toContain('<h2 class="es-ticket__title">Items</h2>')
    expect(html).toContain('class="es-ticket es-c-block"')
  })

  test('says one item, in the singular', () => {
    expect(render(h(ItemBlock, { block: block('tr2.bubble-width', 2, 1), scope: 'tr2.l0' }))).toContain('1 item on fresh numbers')
  })
})

describe('the ticket that waits, for a family that two lessons name at two levels', () => {
  test('names the KCs of the variants that the block draws at its level, and not the other level\'s', () => {
    const first = render(h(ItemBlock, { block: block('tr5a.blocks-held', 2), scope: 'tr5a.l1' }))
    for (const kc of ['tr5a.kv-groups', 'tr5a.sliding-free', 'tr5a.state-pages']) expect(first).toContain(kc)
    expect(first).not.toContain('tr5a.page-size-unification')
    const second = render(h(ItemBlock, { block: block('tr5a.blocks-held', 3), scope: 'tr5a.l2' }))
    expect(second).toContain('tr5a.page-size-unification')
    for (const kc of ['tr5a.kv-groups', 'tr5a.sliding-free', 'tr5a.state-pages']) expect(second).not.toContain(kc)
  })
})

describe('the ticket for a family that is not built, or a level it does not offer', () => {
  test('says the generator is not built, holds the stub down, and starts nothing', () => {
    const html = render(h(ItemBlock, { block: block('tr2.no-such-family', 2), scope: 'tr2.l3' }))
    expect(html).toContain('data-phase="unbuilt"')
    expect(html).toContain('Not built yet: the generator for tr2.no-such-family')
    expect(html).toMatch(/<button type="button" class="es-stub__pull"[^>]*disabled=""/)
  })

  test('a level the family offers no variant at says which levels it does', () => {
    const upper: Gen = toy({ id: 'tr2.upper', variants: [{ id: 'one', title: 'One', kcs: ['tr2.bubble'], levels: [2, 3] }], make: (seed, level, variant) => bubbleWidth.make(seed, level, 'close-it') && { variant, level, seed, kcs: ['tr2.bubble'], stem: [], givens: [], worked: [], answer: { kind: 'numeric', label: 'n', unit: 'tokens', truth: 1, tolerance: {} }, params: {} } })
    const html = render(h(ItemBlock, { block: block('tr2.upper', 0), scope: 'tr2.l3', families: [upper] }))
    expect(html).toContain('has no items at level 0 (worked example)')
    expect(html).toContain('levels it offers are 2, 3')
    expect(html).toContain('disabled=""')
  })
})

describe('the first ticket of an attempt', () => {
  const entropy = [11, 222, 3333]
  const html = render(h(Attempt, { gen: bubbleWidth, level: 2, entropy, scope: 'tr2.l0', onRestart: () => undefined }))
  const attempt = startAttempt(bubbleWidth, 2, entropy)
  const first = attempt.served[0]

  test('holds the seed it was drawn from, in the foot line and as data, and the question with its numbers', () => {
    expect(html).toContain('data-phase="asking"')
    expect(html).toContain(`data-seed="${first.seed}"`)
    expect(html).toContain(`seed ${seedLabel(first.seed)}`)
    expect(html).toContain('unseen')
    expect(html).toContain('Item 1 of 3')
    expect(html).toContain(plain(first.item.stem).replace(/'/g, '&#x27;'))
    for (const given of first.item.givens) expect(html).toContain(given.label)
  })

  test('takes the answer on a slip or on lines with a tick box, and three plates for how sure', () => {
    if (first.item.answer.kind === 'numeric') {
      expect(html).toContain('class="es-field__input"')
      expect(html).toContain('inputMode="decimal"')
    } else {
      expect(html).toContain('type="radio"')
    }
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(3)
    for (const tap of ['guess', 'think so', 'sure']) expect(html).toContain(`>${tap}<`)
    expect(html).toContain('Check the ticket')
    expect(html).toContain('How sure are you?')
    expect(html).toMatch(/aria-labelledby="[^"]+"/)
  })

  test('is lit: the heat lamp falls on the ticket that waits for an answer', () => {
    expect(html).toContain('data-lamp="true"')
  })

  test('holds no key and no solution: neither the sentences that explain nor a mark of a verdict are in the markup', () => {
    for (const attemptEntropy of [[5, 6, 7], [100, 200, 300], [1, 2, 4]]) {
      const page = render(h(Attempt, { gen: bubbleWidth, level: 2, entropy: attemptEntropy, scope: 'tr2.l0', onRestart: () => undefined }))
      const first = startAttempt(bubbleWidth, 2, attemptEntropy).served[0].item
      for (const step of bubbleWidth.solution(first)) {
        const sentence = plain(step.text.filter((part) => part.t === 'text'))
        for (const piece of sentence.split(/(?<=\.)\s/).filter((text) => text.length > 30)) expect(page).not.toContain(piece.replace(/'/g, '&#x27;'))
      }
      if (first.answer.kind === 'choice') for (const option of first.answer.options) expect(page).not.toContain(plain(option.why).replace(/'/g, '&#x27;'))
      expect(page).not.toContain('data-ok')
      expect(page).not.toContain('es-item__reveal')
      expect(page).not.toContain('"truth"')
    }
  })

  test('puts the question first, then the numbers, then the slip, so the page reads as a ticket is filled', () => {
    const at = (text: string) => html.indexOf(text)
    expect(at('Item 1 of 3')).toBeLessThan(at(plain(first.item.stem).replace(/'/g, '&#x27;')))
    expect(at('es-item__givens')).toBeLessThan(at('How sure are you?'))
    expect(at('How sure are you?')).toBeLessThan(at('seed '))
    expect(at('seed ')).toBeLessThan(at('Check the ticket'))
  })
})

describe('the event the block writes', () => {
  const context: WriterContext = { clock: { nowIso: () => '2026-11-04T09:30:00.000Z', tzOffsetMinutes: () => 0 }, newId: () => 'ev-1', dev: 'dev-a1' }

  test('is an item event that the ledger\'s strict codec takes, for a right answer and for a wrong one, for each shape', () => {
    for (const level of [0, 2, 3] as const) {
      let attempt = startAttempt(bubbleWidth, level, [3, 77, 1234])
      for (const [index, served] of attempt.served.entries()) {
        attempt = answerItem(bubbleWidth, attempt, index, index === 1 ? wrongOf(served.item) : keyOf(served.item), index === 0 ? 'sure' : undefined)
        const draft = itemDraft(resultOf(attempt, index))
        const event = stampEvent(context, draft)
        expect(event.kind).toBe('item')
        expect(decodeEvent(JSON.parse(JSON.stringify(event))).ok).toBe(true)
        expect(event.ref).toBe(`item:gen/tr2.bubble-width/${served.item.variant}`)
        expect(event).toMatchObject({ ok: index !== 1, provenance: 'unseen', seed: served.seed, rev: served.item.rev })
      }
    }
  })

  test('carries the confidence only when one was tapped, and the learner\'s answer with its level, and no key, no solution and no time', () => {
    let attempt = startAttempt(bubbleWidth, 2, [9, 10, 11])
    attempt = answerItem(bubbleWidth, attempt, 0, keyOf(attempt.served[0].item), 'think')
    attempt = answerItem(bubbleWidth, attempt, 1, keyOf(attempt.served[1].item))
    const tapped = itemDraft(resultOf(attempt, 0))
    const silent = itemDraft(resultOf(attempt, 1))
    expect(tapped.conf).toBe('think')
    expect('conf' in silent).toBe(false)
    expect(tapped.data).toEqual({ answer: { level: 2, response: keyOf(attempt.served[0].item) } })
    const text = JSON.stringify(tapped)
    for (const forbidden of ['truth', 'solution', 'why', 'ms', 'duration']) expect(text).not.toContain(`"${forbidden}"`)
  })

  test('grades again, from the seed and the answer alone, to what it recorded, and an edit of the score changes nothing', () => {
    for (const family of FAMILIES) {
      let attempt = startAttempt(family, 2, [1, 20, 300])
      for (const [index, served] of attempt.served.entries()) {
        attempt = answerItem(family, attempt, index, index === 2 ? wrongOf(served.item) : keyOf(served.item))
        const event = stampEvent(context, itemDraft(resultOf(attempt, index)))
        if (event.kind !== 'item') throw new Error('an item event')
        const again = regradeItem({ ref: event.ref, seed: event.seed, rev: event.rev, answer: event.data.answer })
        expect(again).toMatchObject({ valid: true, ok: event.ok, score: event.score, stale: false })
        // The edited event: the grade is not read from it.
        const edited = regradeItem({ ref: event.ref, seed: event.seed, rev: event.rev, answer: event.data.answer })
        expect(edited).toMatchObject({ ok: index !== 2 })
      }
    }
  })
})
