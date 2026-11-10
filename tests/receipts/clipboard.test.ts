/*
 * W2-T06: copying a token (src/receipts/clipboard.ts). `copyText` says whether the browser let it: it writes through the Clipboard API,
 * and a browser that has none (a page that is not a secure context) or that refuses (the learner denied it, the page is not focused)
 * answers false and throws nothing, so that the page can leave the text selected for the learner's own hands. The hook and the
 * selection need a page, and e2e/receipts.spec.ts copies in a browser, refuses in a browser, and reads what was selected.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { copyText, COPIED_MS } from '@/receipts/clipboard'

const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard')

function setClipboard(value: unknown): void {
  Object.defineProperty(globalThis.navigator, 'clipboard', { value, configurable: true })
}

afterEach(() => {
  if (original === undefined) Reflect.deleteProperty(globalThis.navigator, 'clipboard')
  else Object.defineProperty(globalThis.navigator, 'clipboard', original)
})

describe('copyText', () => {
  test('writes the text through the Clipboard API, and says it did', async () => {
    const written: string[] = []
    setClipboard({ writeText: async (text: string) => void written.push(text) })
    expect(await copyText('es1:tr8.replay.s2:0badc0de:ABCDEFGHJKLMNPQR:20261109:1a2b3c4d')).toBe(true)
    expect(written).toEqual(['es1:tr8.replay.s2:0badc0de:ABCDEFGHJKLMNPQR:20261109:1a2b3c4d'])
  })

  test('says it did not when the browser refuses, and throws nothing', async () => {
    setClipboard({ writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) })
    expect(await copyText('text')).toBe(false)
    setClipboard({
      writeText: () => {
        throw new Error('not focused')
      },
    })
    expect(await copyText('text')).toBe(false)
  })

  test('says it did not when the browser has no Clipboard API, as a page that is not a secure context has none', async () => {
    setClipboard(undefined)
    expect(await copyText('text')).toBe(false)
  })
})

describe('the word "copied"', () => {
  test('stays a few seconds [estimated]: long enough to be read, and short enough that the next copy is not met by a stale word', () => {
    expect(COPIED_MS).toBeGreaterThanOrEqual(2000)
    expect(COPIED_MS).toBeLessThanOrEqual(6000)
  })
})
