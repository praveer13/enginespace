/*
 * R-T06: the chrome of every route (REDESIGN §2.3). The header is the wordmark, then Course, Games, Review and Progress, then the outline
 * Continue at the right, whose words and link are the pointer's (`es:next`, `nextStep`'s last answer) or, before any page has written one,
 * the empty ledger's answer. On a phone the links sit behind a button labelled Navigation. The footer is About, Sources and changes, and
 * Settings. No route's chrome links the design system's page or the GPU lab results.
 *
 * Every route of the table is drawn on the server renderer, as tests/smoke.test.ts draws them. What the button does when pressed, and
 * the phone's layout, are a browser's to show (e2e/route-change.spec.ts).
 */
import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router'
import { routes } from '@/routes'
import { START_POINTER } from '@/settings/store'

const URLS = ['/', '/map', '/m/tr2', '/m/tr2/l1-one-step-five-calls', '/play', '/play/loop', '/labs/hybrid-kv', '/trace-room', '/receipts', '/today', '/evidence', '/design', '/settings', '/about', '/changes', '/nope']

async function render(url: string): Promise<string> {
  const handler = createStaticHandler(routes)
  const context = await handler.query(new Request(new URL(url, 'http://localhost')))
  if (context instanceof Response) throw new Error(`${url} answered with a ${context.status} response`)
  const router = createStaticRouter(handler.dataRoutes, context)
  return renderToString(createElement(StaticRouterProvider, { router, context, hydrate: false })).replaceAll('<!-- -->', '')
}

const navOf = (html: string, label: string) => new RegExp(`<nav aria-label="${label}"[^>]*>([\\s\\S]*?)</nav>`).exec(html)?.[1] ?? ''
const linksOf = (nav: string) => [...nav.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((match) => [match[1], match[2].replace(/<[^>]+>/g, '')])

describe('the chrome of every route', () => {
  for (const url of URLS) {
    test(`${url}: the header has Course, Games, Review, Progress and Continue, and the footer About, How numbers are tagged, Sources and changes, Settings`, async () => {
      const html = await render(url)
      const header = navOf(html, 'Primary')
      const links = linksOf(header)
      expect(links.slice(0, 5)).toEqual([
        ['/', 'enginespace'],
        ['/map', 'Course'],
        ['/play', 'Games'],
        ['/today', 'Review'],
        ['/evidence', 'Progress'],
      ])
      // Continue: the empty ledger's answer on the server, with its full label as the link's name and the first word for a phone.
      expect(links[5]).toEqual([START_POINTER.href, `${START_POINTER.label}${START_POINTER.word}`])
      expect(header).toMatch(/<a [^>]*class="es-board__next"[^>]*data-way="continue"/)
      expect(links).toHaveLength(6)
      expect(linksOf(navOf(html, 'Footer'))).toEqual([
        ['/about', 'About'],
        ['/about#numbers', 'How numbers are tagged'],
        ['/changes', 'Sources and changes'],
        ['/settings', 'Settings'],
      ])
      const chrome = header + navOf(html, 'Footer')
      expect(chrome).not.toContain('href="/design"')
      expect(chrome).not.toContain('href="/receipts"')
    })
  }

  test('on a phone the links sit behind a button labelled Navigation, which says it is closed and names the list it opens', async () => {
    const html = await render('/map')
    const header = navOf(html, 'Primary')
    const button = /<button [^>]*class="es-board__toggle"[^>]*>([\s\S]*?)<\/button>/.exec(header)
    expect(button?.[1].replace(/<[^>]+>/g, '')).toBe('Navigation')
    expect(button?.[0]).toContain('aria-expanded="false"')
    const controls = /aria-controls="([^"]+)"/.exec(button?.[0] ?? '')?.[1]
    expect(header).toContain(`<ul id="${controls}" class="es-board__links">`)
    expect(html).toMatch(/<nav aria-label="Primary"[^>]*data-fold="closed"/)
  })

  test("the first word of Continue is hidden from assistive technology, so the link's name is its full label", async () => {
    const header = navOf(await render('/'), 'Primary')
    expect(header).toContain(`<span class="es-board__next-label">${START_POINTER.label}</span><span class="es-board__next-word" aria-hidden="true">${START_POINTER.word}</span>`)
  })
})
