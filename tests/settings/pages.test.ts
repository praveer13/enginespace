/*
 * /settings and /evidence through the route table (W0-T22), on the server renderer: the page as a visitor's first render sees it,
 * before the browser has been asked about the device and before the ledger has opened. Each page then has its heading, its
 * panels and the ticket or the tape that says it is still printing, and none of it needs the ledger. The pages' behaviour once
 * they have a ledger and a device is in tests/settings/view.test.ts and tests/evidence/view.test.ts (their views, with every input
 * as a prop) and in e2e/settings.spec.ts (a real browser).
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router'
import { routes } from '@/routes'

async function render(url: string): Promise<string> {
  const handler = createStaticHandler(routes)
  const context = await handler.query(new Request(new URL(url, 'http://localhost')))
  if (context instanceof Response) throw new Error(`${url} answered with a ${context.status} response`)
  const router = createStaticRouter(handler.dataRoutes, context)
  return renderToString(createElement(StaticRouterProvider, { router, context, hydrate: false })).replaceAll('<!-- -->', '')
}

const decode = (html: string) => html.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
/** The switch with this label: whether it is on. Its block runs from its own opening tag to its label. */
function switchOn(html: string, label: string): boolean | undefined {
  const at = html.indexOf(`>${label}</label>`)
  if (at < 0) return undefined
  const start = html.lastIndexOf('<div class="es-toggle"', at)
  const checked = /role="switch" aria-checked="(true|false)"/.exec(html.slice(start, at))?.[1]
  return checked === undefined ? undefined : checked === 'true'
}
const headings = (html: string, level: number) => [...html.matchAll(new RegExp(`<h${level}[^>]*>(.*?)</h${level}>`, 'gs'))].map((match) => match[1].replace(/<[^>]+>/g, ''))

describe('/settings', () => {
  let html = ''
  beforeAll(async () => {
    html = await render('/settings')
  })

  test('is the page of panels: one h1, then the view, motion, keys and this device', () => {
    expect(headings(html, 1)).toEqual(['Settings'])
    expect(headings(html, 2)).toEqual(['View', 'Motion', 'Keys', 'This device'])
    expect(html).toContain('<main id="main"')
  })

  test('draws the defaults before anything has been read: 3D on, no cap, motion by the system, keys on', () => {
    expect(switchOn(html, 'Draw the games in 3D')).toBe(true)
    expect(switchOn(html, 'Game keys')).toBe(true)
    // The export's own switch is off: compression is a choice made when exporting, and not a setting.
    expect(switchOn(html, 'Compress the file')).toBe(false)
    expect(decode(html)).toContain('Tier 3 · full')
    expect(html).toMatch(/aria-pressed="true">Tier 3 · full</)
    expect(html).toMatch(/aria-pressed="true">Follow my system</)
  })

  test('says it is checking the device, and that the printer is warming, until the browser has been asked', () => {
    expect(html).toContain('Checking what this device can draw.')
    expect(html).toContain('Warming up')
  })

  test('offers this device`s data: the tape of where it is kept, export, import and reset, none of which needs the ledger yet', () => {
    expect(decode(html)).toContain('Where your evidence is kept')
    expect(html).toMatch(/<button[^>]*>Export evidence<\/button>/)
    expect(html).toMatch(/<button[^>]*>Choose a file<\/button>/)
    expect(html).toMatch(/<button[^>]*>.*Reset this device.*<\/button>/s)
    // The tape is a printer warming up until the ledger has opened: it prints no line it does not know.
    expect(html).toMatch(/aria-label="Where your evidence is kept" aria-busy="true"/)
  })

  test('shows no dialog and no problem until there is one', () => {
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('role="alert"')
  })

  test('is in the shell: the board above it, the kick-plate below, and the page`s own link lit', () => {
    expect(html).toContain('<nav aria-label="Primary"')
    expect(html).toMatch(/<nav aria-label="Footer"[^>]*>.*aria-current="page"[^>]*>Settings</s)
  })
})

describe('/evidence', () => {
  let html = ''
  beforeAll(async () => {
    html = await render('/evidence')
  })

  test('is the page of panels: one h1, and a ticket that is still printing until the ledger has opened', () => {
    expect(headings(html, 1)).toEqual(['Evidence'])
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Printing your evidence')
    expect(html).not.toContain('Nothing in the ledger yet')
    expect(html).not.toContain('<table')
  })

  test('offers the means to keep a copy straight away, and the tape is a printer warming up until the ledger has opened', () => {
    expect(headings(html, 2)).toEqual(['Keep a copy'])
    expect(html).toMatch(/<button[^>]*>Export evidence<\/button>/)
    expect(html).toMatch(/aria-label="Where your evidence is kept" aria-busy="true"/)
    expect(html).toContain('Warming up')
  })

  test('is in the shell, with Evidence lit on the board', () => {
    expect(html).toMatch(/<nav aria-label="Primary"[^>]*>.*aria-current="page"[^>]*>Evidence</s)
  })
})

describe('/design', () => {
  test('is still one page with one h1, and the motion section answers the settings by default', async () => {
    const html = await render('/design')
    expect(headings(html, 1)).toEqual(['Design system'])
    expect(html).toContain('data-motion-status="full"')
  })
})
