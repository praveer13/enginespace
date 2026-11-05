/*
 * W1-T06: the posters on the Play index. The board draws a game's poster from the file that scripts/posters.ts writes to
 * public/posters/ and that the front page inlines, and never from the game's layout code, which the front page's first paint holds
 * (verify:bundle). So what is held here is that the file, read by the board's own small reader and drawn back as elements, is the
 * picture the game's 2D view paints first, byte for byte; that the table of posters agrees with the files; that a file which is not a
 * poster is not drawn; and how a poster is fetched.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement as h } from 'react'
import { svgMarkup } from '@es/play/loop/svg'
import { passDrawing, posterView } from '@/front/poster'
import { Poster } from '@/games/specials/Poster'
import { forgetPosters, hasPoster, loadPoster, parsePoster, posterElement, posterOf, posterRead, POSTERS } from '@/games/specials/posters'
import { renderPosters } from '../../scripts/posters'
import { root } from '../ci/support'
import { render } from './support'

const fileOf = (name: string): string => readFileSync(path.join(root, 'public/posters', name), 'utf8')
const draw = (markup: string): string => {
  const tree = parsePoster(markup)
  if (tree === null) throw new Error('not a poster')
  return render(posterElement(tree))
}

describe('the board reads the posters that scripts/posters.ts writes', () => {
  test('each poster file of the table is there, and is one that scripts/posters.ts writes', () => {
    const written = renderPosters().map((poster) => poster.file)
    for (const [id, poster] of Object.entries(POSTERS)) {
      expect(existsSync(path.join(root, 'public/posters', poster.file)), `${id}: ${poster.file}`).toBe(true)
      expect(written, `${id}: ${poster.file}`).toContain(poster.file)
    }
  })

  test('the file is read, and drawn back as the same markup', () => {
    for (const poster of Object.values(POSTERS)) {
      const text = fileOf(poster.file)
      expect(draw(text)).toBe(text.trim())
    }
  })

  test("Service's poster is the first frame of its 2D view: the front page's picture, as the pure code draws it", () => {
    expect(draw(fileOf(POSTERS.loop.file))).toBe(svgMarkup(passDrawing(posterView(), 'landscape')))
  })

  test('the size in the table is the size in the file, so the well keeps the shape of the drawing', () => {
    for (const poster of Object.values(POSTERS)) {
      const tree = parsePoster(fileOf(poster.file))
      expect(tree?.attrs.viewBox).toBe(`0 0 ${poster.width} ${poster.height}`)
      expect(tree?.attrs.role).toBe('img')
      expect(tree?.attrs['aria-label']?.length ?? 0).toBeGreaterThan(0)
    }
  })

  test('a game has a poster only if it is in the table, and only its own id counts', () => {
    expect(hasPoster('loop')).toBe(true)
    expect(posterOf('loop')).toBe(POSTERS.loop)
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'shape-shifter', '']) {
      expect(hasPoster(name), name).toBe(false)
      expect(posterOf(name), name).toBeUndefined()
    }
  })

  test('the poster paints with the design system\'s properties and has no colour of its own', () => {
    const text = fileOf(POSTERS.loop.file)
    expect(text).toContain('var(--es-')
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/)
  })
})

describe('a file that is not a poster is not drawn', () => {
  const refused: [string, string][] = [
    ['an empty file', ''],
    ['a page of HTML, as a server answers a name it does not have', '<!doctype html><html><head></head><body></body></html>'],
    ['markup that is not an svg', '<g></g>'],
    ['a script', '<svg><script>alert(1)</script></svg>'],
    ['an element that is not on the list', '<svg><a href="https://example.com"></a></svg>'],
    ['a handler', '<svg onload="alert(1)"></svg>'],
    ['a style', '<svg style="fill:red"></svg>'],
    ['a link', '<svg><use href="#a"></use></svg>'],
    ['an element that is not closed', '<svg><g></svg>'],
    ['an element closed as another', '<svg><g></rect></svg>'],
    ['two roots', '<svg></svg><svg></svg>'],
    ['text after the root', '<svg></svg>tail'],
    ['an entity the writer does not write', '<svg><text>&nbsp;</text></svg>'],
    ['an attribute twice', '<svg width="1" width="2"></svg>'],
    ['an attribute with an upper-case name that SVG does not write so', '<svg strokeWidth="1"></svg>'],
    ['a self-closing element, which the writer never writes', '<svg><g/></svg>'],
  ]
  for (const [name, markup] of refused) {
    test(name, () => {
      expect(parsePoster(markup)).toBeNull()
    })
  }

  test('an svg with nothing in it is a poster of nothing, and is drawn as it is', () => {
    expect(draw('<svg></svg>')).toBe('<svg></svg>')
  })
})

describe('what the reader keeps', () => {
  test('the five escapes are read as the characters they stand for, and written back as they were', () => {
    const markup = '<svg aria-label="a &amp; b &quot;c&quot; &#x27;d&#x27;"><text x="1">1 &lt; 2 &amp;&amp; 3 &gt; 2</text></svg>'
    const tree = parsePoster(markup)
    expect(tree?.attrs['aria-label']).toBe('a & b "c" \'d\'')
    expect(tree?.children).toEqual([{ tag: 'text', attrs: { x: '1' }, children: ['1 < 2 && 3 > 2'] }])
    expect(draw(markup)).toBe(markup)
  })

  test("SVG's hyphenated attributes are React's camel case, and the camel case SVG writes stays", () => {
    const markup = '<svg viewBox="0 0 4 4"><defs><filter id="f"><feGaussianBlur stdDeviation="3"></feGaussianBlur></filter></defs><line x1="0" y1="1" x2="2" y2="3" stroke="var(--es-paper)" stroke-width="1.5" stroke-dasharray="2 3" data-part="rail"></line><text text-anchor="middle" font-size="12" dominant-baseline="middle" fill-opacity="0.5">a</text></svg>'
    expect(draw(markup)).toBe(markup)
  })
})

describe('fetching a poster', () => {
  const real = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = real
    forgetPosters()
  })
  const answer = (body: string, status = 200) => new Response(body, { status })

  test("a poster is asked for from this site's own origin, once, and kept", async () => {
    const asked: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      asked.push(String(input))
      return answer('<svg><g data-part="a"></g></svg>')
    }) as typeof fetch
    expect(posterRead('kept.svg')).toBeNull()
    const first = await loadPoster('kept.svg')
    expect(first?.tag).toBe('svg')
    expect(await loadPoster('kept.svg')).toBe(first)
    expect(posterRead('kept.svg')).toBe(first)
    expect(asked).toEqual(['/posters/kept.svg'])
  })

  test('a file that is not there, a file that is not a poster and a fetch that fails are all null, and none is remembered', async () => {
    let asked = 0
    const replies: (() => Response | Promise<Response>)[] = [() => answer('nope', 404), () => answer('<html></html>'), () => Promise.reject(new Error('offline'))]
    globalThis.fetch = (async () => {
      asked += 1
      return replies[(asked - 1) % replies.length]()
    }) as typeof fetch
    expect(await loadPoster('gone.svg')).toBeNull()
    expect(await loadPoster('gone.svg')).toBeNull()
    expect(await loadPoster('gone.svg')).toBeNull()
    expect(asked).toBe(3)
    expect(posterRead('gone.svg')).toBeNull()
    // The next page that asks is answered, because a failure was not kept.
    globalThis.fetch = (async () => answer('<svg></svg>')) as typeof fetch
    expect((await loadPoster('gone.svg'))?.tag).toBe('svg')
  })
})

describe('the poster in its well', () => {
  const real = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = real
    forgetPosters()
  })

  test('the well has the shape of the drawing until the file has come, and holds the drawing once it has', async () => {
    forgetPosters()
    expect(render(h(Poster, { id: 'loop' }))).toBe('<div class="es-poster" data-state="reading" style="aspect-ratio:720 / 348"></div>')
    globalThis.fetch = (async () => new Response(fileOf(POSTERS.loop.file))) as typeof fetch
    await loadPoster(POSTERS.loop.file)
    const drawn = render(h(Poster, { id: 'loop' }))
    expect(drawn).toContain('data-state="drawn"')
    expect(drawn).toContain(fileOf(POSTERS.loop.file).trim())
  })

  test('a game that has no poster draws no well of its own', () => {
    expect(render(h(Poster, { id: 'pool' }))).toBe('')
  })
})
