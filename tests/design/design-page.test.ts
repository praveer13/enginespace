/*
 * /design (ARCHITECTURE §3.1; the former W0-T06's check 3, and W0-T22's check 3): the page lists exactly the roles in tokens.ts,
 * each with its value, shows every component of src/design/components in its states, puts the motion roles to work, and stands
 * each motion and each scene beside its 2D twin. It renders through the route table on the server renderer, as
 * tests/smoke.test.ts renders every route. What a click does (the bell, the specimen's controls) is checked in a real browser, in
 * e2e/settings.spec.ts and e2e/scene-kit.spec.ts.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router'
import { routes } from '@/routes'
import { cssVar, PAIRS, resolveColor, ROLE_NAMES, roleOf, rolesIn, type ColorRoleName } from '@/design/tokens'

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

  test('has one h1, "Design system", and its sections in order: roles, contrast, components, motion, scene kit', () => {
    expect([...html.matchAll(/<h1[^>]*>(.*?)<\/h1>/gs)].map((match) => match[1])).toEqual(['Design system'])
    const ids = ['roles', 'contrast', 'components', 'motion', 'scene-kit']
    for (const id of ids) expect(html).toContain(`<h2 id="${id}">`)
    expect([...html.matchAll(/<h2 id="([^"]+)">/g)].map((match) => match[1])).toEqual(ids)
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

describe('/design: landmarks, and what the lights say', () => {
  let html = ''
  let text = ''
  beforeAll(async () => {
    html = await render('/design')
    text = decode(html)
  })

  /** The regions the page has: each section, nav or aside with a name, by what axe reads, the role and the name. */
  function landmarks(markup: string): string[] {
    const named = (id: string) => decode(new RegExp(`id="${id}"[^>]*>(.*?)</`, 's').exec(markup)?.[1] ?? '').replace(/<[^>]+>/g, '').trim()
    return [...markup.matchAll(/<(section|nav|aside)\b([^>]*)>/g)].flatMap(([, tag, attributes]) => {
      const label = /aria-label="([^"]*)"/.exec(attributes)?.[1]
      const by = /aria-labelledby="([^"]*)"/.exec(attributes)?.[1]
      const name = label !== undefined ? decode(label) : by !== undefined ? named(by) : undefined
      return name === undefined ? [] : [`${tag === 'nav' ? 'navigation' : 'region'}: ${name}`]
    })
  }

  test('no two landmarks share a role and a name (axe: landmark-unique)', () => {
    const found = landmarks(html)
    expect(found.length).toBeGreaterThan(10)
    const twice = found.filter((landmark, index) => found.indexOf(landmark) !== index)
    expect(twice).toEqual([])
  })

  test('the roles of a group are a group named by its heading, and not a region that the page\'s own "Motion" section could echo', () => {
    expect(html).toContain('<div class="es-spec__group" role="group" aria-labelledby="roles-motion"><h3 class="es-spec__group-title" id="roles-motion">Motion</h3>')
    expect(landmarks(html)).toContain('region: Motion')
    expect(landmarks(html).filter((landmark) => landmark === 'region: Motion')).toHaveLength(1)
  })

  test('the toggle and the station light say that a light that is on burns the heat lamp, and a lane is a mark beside it', () => {
    expect(text).toContain("a pilot light that burns the heat lamp's amber when it is on")
    expect(text).toContain("it burns the heat lamp's amber while it cooks")
    expect(text).toContain("dark, the lane's mark stays")
    expect(text).not.toContain('burns green')
    expect(text).not.toContain("lit in its lane's colour")
    // The marks of the lanes shown: the line's is the green board's square, the expo's the blue board's circle.
    const station = html.slice(html.indexOf('aria-label="Station light"'), html.indexOf('aria-label="Bell"'))
    expect(station).toContain('data-lane="gpu"')
    expect(station).toContain('data-glyph="square"')
    expect(station).toContain('data-lane="cpu"')
    expect(station).toContain('data-glyph="circle"')
  })

  test('the size ramp is listed under its own heading, each step drawn at its size', () => {
    expect(html).toContain('id="roles-size">Type sizes</h3>')
    const entry = /data-role="size-caption"[\s\S]*?<\/li>/.exec(html)?.[0] ?? ''
    expect(entry).toContain('font-size:var(--es-size-caption)')
    expect(decode(entry)).toContain('0.8125rem')
  })
})

describe('/design: motion', () => {
  let html = ''
  let text = ''
  beforeAll(async () => {
    html = await render('/design')
    text = decode(html)
  })

  const section = () => html.slice(html.indexOf('<h2 id="motion">'), html.indexOf('<h2 id="scene-kit">'))
  const rowsOf = (markup: string) => [...markup.matchAll(/<li class="es-spec__motion" data-motion-row="([^"]+)">(.*?)<\/li>/gs)].map((match) => ({ id: match[1], markup: match[2] }))

  test('has four motions, one for each duration role in tokens.ts, in the order of their durations', () => {
    const durations = rolesIn('motion').filter((name) => roleOf(name).kind === 'duration')
    expect(durations).toHaveLength(4)
    const shown = rowsOf(section()).map((row) => [...row.markup.matchAll(/<code>(dur-[a-z]+)<\/code>/g)].map((match) => match[1])[0])
    expect(shown).toEqual(durations)
    const milliseconds = durations.map((name) => Number.parseFloat((roleOf(name) as { value: string }).value))
    expect(milliseconds).toEqual([...milliseconds].sort((a, b) => a - b))
  })

  test('puts every easing role to work, and names only roles that exist', () => {
    const easings = rolesIn('motion').filter((name) => roleOf(name).kind === 'easing')
    const used = new Set(rowsOf(section()).flatMap((row) => [...row.markup.matchAll(/<code>(ease-[a-z]+)<\/code>/g)].map((match) => match[1])))
    expect([...used].sort()).toEqual([...easings].sort())
    for (const name of used) expect(ROLE_NAMES as readonly string[]).toContain(name)
  })

  test('prints each duration through the readout, tagged estimated, with the value tokens.ts holds', () => {
    for (const { markup } of rowsOf(section())) {
      const name = /<code>(dur-[a-z]+)<\/code>/.exec(markup)?.[1] ?? ''
      const value = Number.parseFloat((roleOf(name as (typeof ROLE_NAMES)[number]) as { value: string }).value)
      expect(markup).toContain(`<data class="es-readout__value" value="${value}">${value}</data><span class="es-readout__unit">ms</span><span class="es-readout__tag" data-tag="estimated">`)
    }
  })

  test('prints each easing`s curve value as tokens.ts holds it', () => {
    for (const { markup } of rowsOf(section())) {
      const name = /<code>(ease-[a-z]+)<\/code>/.exec(markup)?.[1] ?? ''
      expect(decode(markup)).toContain((roleOf(name as (typeof ROLE_NAMES)[number]) as { value: string }).value)
    }
  })

  test('stands each motion beside its twin: the runner it plays on, and the curve it follows', () => {
    const rows = rowsOf(section())
    expect(rows.map((row) => row.id)).toEqual(['press', 'strike', 'feed', 'course'])
    for (const { markup } of rows) {
      expect(markup).toContain('class="es-spec__motion-live"')
      expect(markup).toContain('class="es-spec__motion-twin"')
      expect(markup.indexOf('es-spec__motion-live')).toBeLessThan(markup.indexOf('es-spec__motion-twin'))
      expect(markup).toContain('<svg class="es-spec__easing"')
      expect(text).toContain('2D twin: the curve, progress against time')
    }
  })

  test('runs each motion on its own role: the duration and the easing are the role`s variables, never numbers', () => {
    for (const { markup } of rowsOf(section())) {
      const duration = /<code>(dur-[a-z]+)<\/code>/.exec(markup)?.[1] as (typeof ROLE_NAMES)[number]
      const easing = /<code>(ease-[a-z]+)<\/code>/.exec(markup)?.[1] as (typeof ROLE_NAMES)[number]
      expect(markup).toContain(`animation-duration:var(${cssVar(duration)})`)
      expect(markup).toContain(`animation-timing-function:var(${cssVar(easing)})`)
    }
  })

  test('moves nothing until the bell is rung: no motion has run, and the runner is marked aria-hidden', () => {
    expect(section()).not.toContain('data-ran')
    expect(html).toContain('Nothing moves until you ring.')
    expect([...section().matchAll(/<span class="es-spec__motion-track" aria-hidden="true">/g)]).toHaveLength(4)
  })

  test('has a bell to ring, and a status region that is there from the start', () => {
    expect(section()).toMatch(/<button[^>]*>Ring the bell<\/button>/)
    expect(section()).toContain('<p role="status" class="sr-only"></p>')
  })

  test('says what motion is on this page right now, and links to where it is changed', () => {
    expect(section()).toContain('data-motion-status="full"')
    expect(decode(section())).toContain('Motion on this page is <strong>full</strong>: your system does not ask for less.')
    expect(section()).toContain('href="/settings"')
  })
})

describe('/design: each scene beside its 2D twin', () => {
  let html = ''
  beforeAll(async () => {
    html = await render('/design')
  })

  test('every 3D view has a 2D twin, and the page has at least one pair', () => {
    const threeD = [...html.matchAll(/data-view="3d"/g)].length
    const twoD = [...html.matchAll(/data-view="2d"/g)].length
    expect(threeD).toBeGreaterThan(0)
    expect(twoD).toBe(threeD)
  })

  test('the twin stands beside the 3D view, in the same figure group, and is labelled as its twin', () => {
    const views = html.slice(html.indexOf('class="es-kit__views"'), html.indexOf('class="es-kit__deck"'))
    expect(views.indexOf('data-view="3d"')).toBeLessThan(views.indexOf('data-view="2d"'))
    expect(decode(views)).toContain('2D twin')
    expect(decode(views)).toContain('3D · the pass')
  })

  test('the 3D view paints its 2D twin first, so a device that cannot draw 3D loses nothing', () => {
    expect(html).toContain('data-stage-phase="twin"')
    expect(html).not.toContain('<canvas')
  })
})
