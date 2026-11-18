/*
 * Build B's finish review: a guess's question is written with its numbers' tags in brackets, and the page shows no bracket. The number
 * before a tag carries the dotted underline (`es-num`) and the tag is hidden text, as in the lesson's prose (REDESIGN §2.8, P6).
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Tagged } from '@/content/render/Tagged'

const render = (text: string) => renderToStaticMarkup(h('p', null, h(Tagged, { text })))

describe('a tagged question', () => {
  test('tr5a.l1.p1: three tags, no bracket, each number underlined and its tag said to a reader', () => {
    const markup = render('A request holds 4,096 tokens [estimated]. Blocks of 16 tokens [estimated] and a 32-token window [estimated]. How many pages?')
    expect(markup).not.toContain('[estimated]')
    expect(markup.match(/class="es-num" data-tag="estimated"/g)).toHaveLength(3)
    expect(markup).toContain('<span class="es-num" data-tag="estimated">4,096<span class="sr-only"> (estimated)</span></span> tokens.')
    expect(markup).toContain('>32<span class="sr-only"> (estimated)</span></span>-token window.')
    expect(markup).toContain('How many pages?')
  })

  test('a question with no tag is its own words', () => {
    expect(render('How many pages?')).toBe('<p>How many pages?</p>')
  })
})
