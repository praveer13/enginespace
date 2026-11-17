/*
 * The step loop's poster and its compare strips (packages/play/loop/strip.ts): the poster is the timing diagram's first frame as a file
 * and equals what the front page draws (scripts/posters.ts, src/front/poster.ts), the SVG tree has two writers that agree, and the
 * debrief's strips are one scale.
 *
 * Until R-T44 this file was the kitchen layout's test (tests/play/loop-layout.test.ts). The kitchen's drawing left the tree with it; what
 * was not the kitchen's is kept here: the poster, the tree's writers and the strips.
 */
import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { svgToReact } from '@/games/loop/svg'
import { passDrawing } from '@/front/poster'
import { initState } from '@es/play/loop/engine'
import { firesOfRun } from '@es/play/loop/compare'
import { buildLevel, services } from '@es/play/loop/levels'
import { loopView } from '@es/play/loop/session'
import { layoutStrip, STRIP, stripSvg } from '@es/play/loop/strip'
import { countMarks, escapeText, svgMarkup } from '@es/play/loop/svg'
import type { SvgNode } from '@es/play/loop/svg'
import { ROLES } from '@/design/tokens'
import { POSTER_LEVEL, POSTER_SEED, renderPosters, stalePosters } from '../../scripts/posters'

const first = loopView(initState(buildLevel(POSTER_LEVEL, POSTER_SEED)))

describe("the poster is the timing diagram's first frame", () => {
  test('scripts/posters.ts draws the practice seed of the first level, in both orientations, from the lane layout', () => {
    expect([POSTER_LEVEL, POSTER_SEED]).toEqual(['first-1-fill', 1])
    const posters = renderPosters()
    expect(posters.map((poster) => poster.orientation)).toEqual(['landscape', 'portrait'])
    for (const poster of posters) {
      expect(poster.svg).toBe(`${svgMarkup(passDrawing(first, poster.orientation))}\n`)
      expect(poster.file).toBe(`loop-first-frame-${poster.orientation}.svg`)
    }
  })

  test('the portrait poster is the same tree in React: the markup the React side writes is the markup the script writes', () => {
    const [, portrait] = renderPosters()
    expect(renderToStaticMarkup(svgToReact(passDrawing(first, 'portrait')) as never)).toBe(portrait.svg.trimEnd())
  })

  test('the poster is the same for every visitor: drawing it twice gives the same text', () => {
    expect(renderPosters().map((poster) => poster.svg)).toEqual(renderPosters().map((poster) => poster.svg))
  })

  test('the committed posters under public/posters are what the code draws now (`bun scripts/posters.ts --check`)', () => {
    expect(stalePosters()).toEqual([])
  })

  test('the first frame is the waiting queue, the CPU row and four empty slots on the graticule, the now line at tick 0', () => {
    const [landscape, portrait] = renderPosters()
    expect(landscape.svg).toContain('role="img"')
    expect(landscape.svg).toContain('aria-label="Timing diagram of the step loop, first frame: 6 requests waiting, 4 empty batch slots, now at tick 0, in synthetic ticks."')
    for (const poster of [landscape, portrait]) {
      expect([...poster.svg.matchAll(/data-row="(slot-\d)"/g)].map((match) => match[1])).toEqual(['slot-0', 'slot-1', 'slot-2', 'slot-3'])
      expect([...poster.svg.matchAll(/>empty</g)]).toHaveLength(4)
      expect(poster.svg).toContain('data-part="now"')
      expect(poster.svg).not.toMatch(/printer|ticket|station|lamp-streak/i)
    }
    // A desk's poster shows all six requests; a phone's the ones its track has room for.
    expect([...landscape.svg.matchAll(/data-req="(\d)"/g)].map((match) => match[1])).toEqual(['0', '1', '2', '3', '4', '5'])
  })
})

describe('the services of the compare view are strips of one scale', () => {
  const s = services(1)
  const scaleTicks = 255

  test('a strip has a slab for each fire and a place for every batch slot, and no text: its captions and counts are DOM', () => {
    const fires = firesOfRun(s.par)
    const strip = layoutStrip(fires, { slots: 4, scaleTicks, label: 'Par' })
    expect(strip.width).toBe(STRIP.width)
    expect(svgMarkup(stripSvg(strip))).not.toContain('<text')
    expect(strip.rects).toHaveLength(1 + fires.length * 5)
    expect(svgMarkup(stripSvg(strip))).toContain('aria-label="Par"')
  })

  test('a strip paints with roles of src/design/tokens.ts and nothing else', () => {
    const markup = svgMarkup(stripSvg(layoutStrip(firesOfRun(s.par), { slots: 4, scaleTicks, label: 'x' })))
    const roles = new Set([...markup.matchAll(/var\(--es-([a-z0-9-]+)\)/g)].map((match) => match[1]))
    expect(roles.size).toBeGreaterThan(0)
    for (const role of roles) expect(Object.keys(ROLES)).toContain(role)
    expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i)
  })

  test('the fires of a sim run: tokens first, then ghost tokens, then empty slots, and the idle stretch and the admissions as the sim counted them', () => {
    const fires = firesOfRun(s.par)
    expect(fires).toHaveLength(s.par.steps.length)
    fires.forEach((fire, i) => {
      const step = s.par.steps[i]
      expect(fire.places.map((place) => place.state)).toEqual([
        ...Array.from({ length: step.seqs - step.ghostSeqs }, () => 'plate'),
        ...Array.from({ length: step.ghostSeqs }, () => 'binned'),
        ...Array.from({ length: 4 - step.seqs }, () => 'empty'),
      ])
      expect([fire.bubbleUs, fire.admits, fire.ghosts]).toEqual([step.bubbleUs, step.prefillSeqs, step.ghostSeqs])
      expect([fire.startUs, fire.endUs]).toEqual([s.par.lanes['gpu-stream'][i].startUs, s.par.lanes['gpu-stream'][i].endUs])
    })
  })

  test('lengths compare: a service that takes longer runs further along the same scale', () => {
    const par = layoutStrip(firesOfRun(s.par), { slots: 4, scaleTicks, label: 'x' })
    const refill = layoutStrip(firesOfRun(s.refillAlone), { slots: 4, scaleTicks, label: 'x' })
    const reach = (strip: typeof par) => Math.max(...strip.rects.flatMap((rect) => (rect.fill === 'lane-gpu' ? [rect.x + rect.w] : [])))
    expect(reach(refill)).toBeGreaterThan(300)
    expect(reach(par)).toBeLessThan(reach(refill))
  })
})

describe('the SVG tree and its two writers', () => {
  const sample: SvgNode = {
    tag: 'svg',
    attrs: { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 10 10', role: 'img', 'aria-label': 'the CPU\'s "lane" & <the GPU>' },
    children: [
      { tag: 'g', attrs: { 'data-part': 'x' }, children: [{ tag: 'rect', attrs: { x: 1.5, y: 2, width: 3, height: 4, rx: 2, fill: 'var(--es-paper)', strokeWidth: 1, strokeDasharray: '3 3', fillOpacity: 0.5 } }] },
      { tag: 'text', attrs: { x: 1, y: 2, textAnchor: 'middle', fontFamily: 'var(--es-font-numeric)', fontSize: 12, dominantBaseline: 'central' }, children: ['07 it\'s <b> & "q"'] },
    ],
  }

  test('the text writer and React\'s static renderer give the same markup, escapes included', () => {
    expect(svgMarkup(sample)).toBe(renderToStaticMarkup(svgToReact(sample) as never))
    expect(escapeText('a&b<c>d"e\'f')).toBe('a&amp;b&lt;c&gt;d&quot;e&#x27;f')
  })

  test('a strip is the same markup in both writers', () => {
    const tree = stripSvg(layoutStrip(firesOfRun(services(1).par), { slots: 4, scaleTicks: 255, label: 'x' }))
    expect(renderToStaticMarkup(svgToReact(tree) as never)).toBe(svgMarkup(tree))
  })

  test('marks are the elements that draw, and groups are not marks', () => {
    expect(countMarks(sample)).toBe(2)
  })

  test('an attribute name with no SVG spelling here is refused, so a typo cannot ship as a camelCase attribute', () => {
    expect(() => svgMarkup({ tag: 'rect', attrs: { strokeWidth: 1, strokeMiterlimit: 4 } })).toThrow('no kebab-case form')
  })
})
