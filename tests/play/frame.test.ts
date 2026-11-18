/*
 * R-T07, the instrument frame (REDESIGN §2.6) as markup, apart from any one game: its parts in order, the goal line in four parts, the dock
 * with the readout under it, the table in the DOM under a closed disclosure, and the result as a component of its own whose verdict word
 * comes from the grade's data. The pool's page (tests/play/pool-ui.test.ts) and e2e/pool.spec.ts hold the frame as a game fills it.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { POOL } from '@es/play/pool/entry'
import { poolSession } from '@es/play/pool/session'
import { Debrief } from '@/games/kit/Debrief'
import { Frame, RESULT_LINE } from '@/games/kit/Frame'
import { verdictOf } from '@/games/kit/verdict'
import { ViewSwitch } from '@/games/kit/ViewSwitch'

const render = (element: ReactElement) => renderToStaticMarkup(h(StaticRouter, { location: '/play/pool' }, element))

const frame = (over: Record<string, unknown> = {}) =>
  render(
    h(Frame, {
      game: POOL,
      role: 'You are the KV allocator.',
      session: poolSession,
      level: 'one-group',
      levelTitle: 'One KV group',
      seed: 2,
      mode: 'practice',
      goal: () => ({ aim: 'The aim.', control: 'What you control.', target: 'The number to beat.', ends: 'Ends when it ends.' }),
      diagram: () => h('div', { 'data-probe': 'diagram' }, 'the diagram'),
      legend: () => h('ul', { 'data-probe': 'legend' }),
      dock: () => h('div', { 'data-probe': 'dock' }, 'the decision'),
      readout: () => h('div', { 'data-probe': 'readout' }, 'the readout'),
      result: () => h('div', { 'data-probe': 'result' }),
      mirror: (run: { mirrorId: string }) => h('table', { id: run.mirrorId, 'data-probe': 'mirror' }),
      parts: [{ id: 'pool', name: 'KV page pool', sentence: 'Every page.' }],
      howTo: h('p', null, 'How to play it.'),
      titleBlock: { model: 'Model of a thing', clock: 'Clock: steps' },
      ...over,
    } as never),
  )

describe('the frame, apart from any game', () => {
  const markup = frame()

  test('its parts stand in order: the title strip, the goal line, the diagram with its legend under it, the dock with the readout under the decision, the foot strip, the title block, the table', () => {
    const order = ['class="es-frame__strip"', 'class="es-frame__goal-box"', 'data-probe="diagram"', 'data-probe="legend"', 'data-probe="dock"', 'data-probe="readout"', 'class="es-frame__foot"', 'es-titleblock', 'data-state-table=""'].map((needle) =>
      markup.indexOf(needle),
    )
    expect(order.every((at) => at >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  test('the title strip has the title, the role line and, in place of a level menu, the level and its mode in words', () => {
    expect(markup).toMatch(/<h2 id="[^"]+" class="es-frame__title">KV page pool<\/h2><p class="es-frame__role">You are the KV allocator.<\/p>/)
    expect(markup).toContain('One KV group · practice')
    for (const words of ['>Diagram</button>', '>3D</button>', '>Parts</button>', '>How to play</button>', '>Keyboard</button>']) expect(markup).toContain(words)
  })

  test('a level menu, when the game gives one, takes the place of the words', () => {
    const menu = frame({ menu: h('select', { 'aria-label': 'Level', 'data-probe': 'menu' }) })
    expect(menu).toContain('data-probe="menu"')
    expect(menu).not.toContain('One KV group · practice')
  })

  test('the goal line is one sentence in its four parts', () => {
    expect(markup).toMatch(/<strong class="es-goal__lead">Goal:<\/strong> <span data-part="aim">The aim.<\/span> <span data-part="control">What you control.<\/span> <span data-part="target">The number to beat.<\/span> <span data-part="ends">Ends when it ends.<\/span>/)
  })

  test('the diagram is a region the keyboard can reach, described by a note that points at the table', () => {
    expect(markup).toMatch(/class="es-frame__view" role="region" aria-label="Diagram" aria-describedby="[^"]+" tabindex="0"/)
    expect(markup).toContain('data-surface="2d"')
  })

  test('the table is in the DOM under a closed disclosure, "State as a table"', () => {
    expect(markup).toMatch(/<details class="es-frame__table" data-state-table=""><summary class="es-frame__table-summary">State as a table<\/summary><div class="es-frame__table-body"><table id="[^"]+" data-probe="mirror">/)
  })

  test('the foot strip has Undo in practice, Restart level and New numbers; a graded run has no Undo', () => {
    expect(markup).toContain('>Undo</button>')
    expect(markup).toContain('>Restart level</button>')
    expect(markup).toContain('>New numbers</button>')
    expect(frame({ mode: 'graded' })).not.toContain('>Undo</button>')
  })

  test('inside a lesson the title is a level down and there is no breadcrumb', () => {
    const embed = frame({ embedded: true })
    expect(embed).toMatch(/<h3 id="[^"]+" class="es-frame__title">/)
    expect(embed).not.toContain('Breadcrumb')
    expect(markup).toContain('<nav aria-label="Breadcrumb"')
  })

  test('the live region is there from the first render, empty, and the outcome line says where the result is', () => {
    expect(markup).toContain('data-live="line"')
    expect(markup).toMatch(/<div role="status" class="sr-only" data-live="outcome"><\/div>/)
    expect(RESULT_LINE).toBe('The run is over. The result is in the dock.')
  })
})

describe('the verdict word comes from the grade', () => {
  test('Passed and Not yet where the level has a pass rule, Finished (practice) where it has only a number to beat', () => {
    expect(verdictOf({ score: 1, ok: true }, true)).toBe('Passed')
    expect(verdictOf({ score: 0.6, ok: false }, true)).toBe('Not yet')
    expect(verdictOf({ score: 1, ok: true }, false)).toBe('Finished (practice)')
    expect(verdictOf({ score: 0.6, ok: false }, false)).toBe('Finished (practice)')
  })

  test('the result prints the word as its heading, then the ways on, then the sentence, then what the game adds', () => {
    const markup = render(h(Debrief, { verdict: 'Not yet', sentence: 'You evicted a page.', actions: h('button', null, 'Next level: Two'), children: h('p', null, 'more') }))
    expect(markup).toMatch(/<section class="es-debrief" data-verdict="Not yet" aria-label="Result"><h3 class="es-debrief__verdict" tabindex="-1" data-result-heading="">Not yet<\/h3><div class="es-debrief__actions"><button>Next level: Two<\/button><\/div><p class="es-debrief__sentence">You evicted a page.<\/p><div class="es-debrief__body"><p>more<\/p><\/div><\/section>/)
  })
})

describe('the view switch', () => {
  test('keeps "2D view" and "3D view" for the old shell, and says "Diagram" and "3D" in the frame', () => {
    const old = render(h(ViewSwitch, { view: '2d', onViewChange: () => undefined, available3d: true }))
    expect(old).toContain('>2D view</button>')
    expect(old).toContain('>3D view</button>')
    const framed = render(h(ViewSwitch, { view: '2d', onViewChange: () => undefined, available3d: true, labels: { flat: 'Diagram', depth: '3D' } }))
    expect(framed).toContain('>Diagram</button>')
    expect(framed).toContain('>3D</button>')
  })
})
