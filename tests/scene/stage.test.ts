/*
 * W0-T15: the Stage as markup. On the server, and in the first render on the client, the Stage paints its 2D view and loads
 * nothing: the scene's chunk is fetched only after the browser has been asked for its tier (A§6.10). The behaviour that needs
 * WebGL (the swap, a lost context, the frame loop) is exercised in a browser by e2e/scene-kit.spec.ts.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import { createElement as h, lazy } from 'react'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router'
import { routes } from '@/routes'
import { Stage, UNAVAILABLE } from '@/scene/Stage'

let loads = 0
const Scene = lazy(async () => {
  loads += 1
  return { default: () => h('div', { 'data-scene': '' }) }
})

describe('the Stage on the server', () => {
  test('paints its 2D view, keeps its own polite live region, and loads no scene', () => {
    const markup = renderToStaticMarkup(h(Stage<object>, { view2d: h('svg', { 'data-twin': '' }), scene: Scene, sceneProps: {}, id: 'probe' }))
    expect(markup).toContain('data-stage="probe"')
    expect(markup).toContain('data-stage-phase="twin"')
    expect(markup).toContain('data-twin=""')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).not.toContain('data-scene')
    expect(markup).not.toContain('<canvas')
    expect(loads).toBe(0)
  })

  test("speaks through the game's live region when it is given one, and keeps none of its own", () => {
    const markup = renderToStaticMarkup(h(Stage<object>, { view2d: h('svg'), scene: Scene, sceneProps: {}, announce: () => undefined }))
    expect(markup).not.toContain('aria-live')
  })

  test("says A§6.7's words when 3D cannot run", () => {
    expect(UNAVAILABLE).toBe('3D view unavailable; showing the 2D view.')
  })
})

describe('/design: the scene kit section', () => {
  let html = ''
  beforeAll(async () => {
    const handler = createStaticHandler(routes)
    const context = await handler.query(new Request('http://localhost/design'))
    if (context instanceof Response) throw new Error('/design answered with a response')
    const router = createStaticRouter(handler.dataRoutes, context)
    html = renderToString(h(StaticRouterProvider, { router, context, hydrate: false }))
  })

  test('has its heading after the components', () => {
    expect(html).toContain('<h2 id="scene-kit">Scene kit</h2>')
    expect(html.indexOf('id="components"')).toBeLessThan(html.indexOf('id="scene-kit"'))
  })

  test('paints the specimen in 2D first: the Stage shows the twin, and the twin stands beside it', () => {
    expect(html).toContain('data-stage="specimen"')
    expect(html).toContain('data-stage-phase="twin"')
    expect(html.match(/class="es-twin"/g)?.length).toBe(2)
    expect(html).not.toContain('<canvas')
  })

  test('mirrors the fires in a listbox with one option in the tab order', () => {
    expect(html).toContain('role="listbox"')
    const options = html.match(/role="option"/g)?.length ?? 0
    expect(options).toBeGreaterThan(0)
    expect(html.match(/role="option"[^>]*tabindex="0"|tabindex="0"[^>]*role="option"/g)?.length).toBe(1)
  })

  test('has the controls: the bell, overlap, the rail, the three camera presets', () => {
    for (const name of ['Ring the bell: fire the next step', 'Over the shoulder', 'Side of the pass', 'Under the lamps', '4 clips', '64 clips']) {
      expect(html).toContain(name)
    }
    expect(html).toContain('Write the next call during this fire')
  })

  test('labels its ticks synthetic', () => {
    expect(html).toContain('the clock · ticks, synthetic')
  })
})
