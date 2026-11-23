/*
 * A guess's words are set with their code spans in the code face: no rendered text of a guess (its prompt, its options) holds a backtick.
 * Over every lesson of every module. The renderer is src/content/render/Tagged.tsx.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Tagged } from '@/content/render/Tagged'
import { compileContent } from '../../scripts/content/build.ts'
import { repo } from './support.ts'

const html = (text: string): string => renderToStaticMarkup(h(Tagged, { text }))

describe('a guess renders its code spans', () => {
  test('a span becomes a code element, with its tag beside a number kept', () => {
    expect(html('Call `x.view(2, 3)` on 4096 [estimated] tokens')).toBe(
      'Call <code>x.view(2, 3)</code> on <span class="es-num" data-tag="estimated">4096<span class="sr-only"> (estimated)</span></span> tokens',
    )
  })
  test('an unpaired backtick stays as written', () => expect(html('a ` b')).toBe('a ` b'))

  test('no rendered guess text of any lesson holds a backtick', () => {
    const result = compileContent({ root: repo })
    let seen = 0
    const blocks = predictBlocks(result)
    for (const block of blocks) {
      const texts = [block.prompt, ...(block.answer.kind === 'choice' ? block.answer.options.map((o: { text: string }) => o.text) : [])]
      for (const text of texts) {
        seen += 1
        expect(html(text), block.id).not.toContain('`')
      }
    }
    expect(seen).toBeGreaterThan(20)
  })
})

interface Found {
  id: string
  prompt: string
  answer: { kind: string; options: { text: string }[] }
}
function predictBlocks(result: ReturnType<typeof compileContent>): Found[] {
  const found: Found[] = []
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk)
    else if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>
      if (record.type === 'predict' && typeof record.prompt === 'string') found.push(record as unknown as Found)
      Object.values(record).forEach(walk)
    }
  }
  for (const output of result.outputs) if (output.path.endsWith('.json')) walk(JSON.parse(output.text))
  return found
}
