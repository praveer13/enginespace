/*
 * W1-T09: what the viewer says aloud (src/trace/useSpoken.ts). The line is spoken from an effect after a tenth of a second, so that the
 * sentences a held key makes in that time are spoken as the last of them and a screen reader is not left to talk over thirty: a
 * server render holds nothing, and e2e/trace-view.spec.ts walks the line as the keys change it.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SPEAK_WINDOW_MS, useSpoken } from '@/trace/useSpoken'

function Line({ text }: { text: string | null }) {
  const spoken = useSpoken(text === null ? null : { seq: 1, text })
  return h('p', null, spoken === null ? 'nothing yet' : spoken.text)
}

describe('the spoken line', () => {
  test('holds nothing in a server render, whether or not the reducer has said something', () => {
    expect(renderToStaticMarkup(h(Line, { text: null }))).toBe('<p>nothing yet</p>')
    expect(renderToStaticMarkup(h(Line, { text: 'Step 3 of 26.' }))).toBe('<p>nothing yet</p>')
  })

  test('coalesces within a tenth of a second', () => {
    expect(SPEAK_WINDOW_MS).toBe(100)
  })
})
