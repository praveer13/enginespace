/*
 * /design (ARCHITECTURE §3.1; the former W0-T06's check 3, and W0-T22's check 3 in advance): the page lists exactly the
 * roles in tokens.ts, each with its value, and shows every component of src/design/components. It renders through the
 * route table on the server renderer, as tests/smoke.test.ts renders every route.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router'
import { routes } from '@/routes'
import { cssVar, PAIRS, resolveColor, ROLE_NAMES, roleOf, type ColorRoleName } from '@/design/tokens'

async function render(url: string): Promise<string> {
  const handler = createStaticHandler(routes)
  const context = await handler.query(new Request(new URL(url, 'http://localhost')))
  if (context instanceof Response) throw new Error(`${url} answered with a ${context.status} response`)
  const router = createStaticRouter(handler.dataRoutes, context)
  return renderToString(createElement(StaticRouterProvider, { router, context, hydrate: false })).replaceAll('<!-- -->', '')
}

const decode = (html: string) =>
  html.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')

describe('/design', () => {
  let html = ''
  let text = ''
  beforeAll(async () => {
    html = await render('/design')
    text = decode(html)
  })

  test('has one h1, "Design system", and the roles, contrast and components sections', () => {
    expect([...html.matchAll(/<h1[^>]*>(.*?)<\/h1>/gs)].map((match) => match[1])).toEqual(['Design system'])
    for (const id of ['roles', 'contrast', 'components']) expect(html).toContain(`<h2 id="${id}">`)
  })

  test('lists exactly the roles in tokens.ts', () => {
    const listed = [...html.matchAll(/data-role="([^"]+)"/g)].map((match) => match[1])
    expect(listed.sort()).toEqual([...ROLE_NAMES].sort())
  })

  test.each(ROLE_NAMES)('shows %s with its variable and its value', (name) => {
    const entry = new RegExp(`data-role="${name}"[\\s\\S]*?</li>`).exec(html)?.[0] ?? ''
    const shown = decode(entry)
    expect(shown).toContain(cssVar(name))
    const role = roleOf(name)
    if (role.kind === 'color') expect(shown).toContain(resolveColor(name as ColorRoleName))
    else if (role.kind === 'font') expect(shown).toContain(role.family.join(', '))
    else expect(shown).toContain(role.value)
  })

  test('shows every declared contrast pair', () => {
    for (const pair of PAIRS) expect(text).toContain(`${pair.fg}</code> on <code>${pair.bg}`)
  })

  test('shows every component of the design system', () => {
    for (const title of [
      'Ticket',
      'Stub',
      'Rail',
      'Printer tape',
      'Readout',
      'Tape label',
      'Pan',
      'Station light',
      'Bell',
      'Button',
      'Link',
      'Toggle',
      'Field',
      'The board and the menu',
      'Marks',
    ])
      expect(html).toContain(`<h3 class="es-spec__component-title">${title}</h3>`)
  })

  test('shows each component in its states', () => {
    for (const state of ['hover', 'focus', 'active', 'disabled', 'loading', 'error', 'empty']) expect(text).toContain(`>${state}</figcaption>`)
    expect(text).toContain('a ticket you pick up: hover')
    expect(text).toContain('under the lamp')
  })
})
