/*
 * The reload prompt (W0-T11's acceptance check 3, the part that shows): a store of a few lines that the shell reads, and the
 * ticket that says what happened. The hook publishes into the store when the engine goes read-only; a real browser shows it,
 * in e2e/ledger-conformance.spec.ts, and this file checks what the server renderer draws, in the shell around a page.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router'
import { MemoryStore, seededIds } from '@es/ledger'
import { EvidenceNotice } from '@/evidence/EvidenceNotice'
import { READ_ONLY_NOTES } from '@/evidence/guard'
import { getReadOnlyNotice, setReadOnlyNotice, subscribeReadOnlyNotice } from '@/evidence/notice'
import { closeEvidence, configureEvidence, useEvidence } from '@/evidence/useEvidence'
import { routes } from '@/routes'
import { ACK, fixedClock } from './support'

afterEach(() => {
  closeEvidence()
  setReadOnlyNotice(null)
})

const NOTICE = { reason: 'newer-schema', text: READ_ONLY_NOTES['newer-schema'] } as const

async function renderShell(url = '/'): Promise<string> {
  const handler = createStaticHandler(routes)
  const context = await handler.query(new Request(new URL(url, 'http://localhost')))
  if (context instanceof Response) throw new Error(`${url} answered with a ${context.status} response`)
  const router = createStaticRouter(handler.dataRoutes, context)
  return renderToString(createElement(StaticRouterProvider, { router, context, hydrate: false })).replaceAll('<!-- -->', '')
}

describe('the notice store', () => {
  test('starts empty, and holds what it is given', () => {
    expect(getReadOnlyNotice()).toBeNull()
    setReadOnlyNotice(NOTICE)
    expect(getReadOnlyNotice()).toEqual(NOTICE)
    setReadOnlyNotice(null)
    expect(getReadOnlyNotice()).toBeNull()
  })

  test('tells a listener of a change only, and not after it unsubscribes', () => {
    let heard = 0
    const off = subscribeReadOnlyNotice(() => {
      heard += 1
    })
    setReadOnlyNotice(null)
    expect(heard).toBe(0)
    setReadOnlyNotice(NOTICE)
    setReadOnlyNotice({ ...NOTICE })
    expect(heard).toBe(1)
    setReadOnlyNotice({ reason: 'versionchange', text: READ_ONLY_NOTES.versionchange })
    expect(heard).toBe(2)
    off()
    setReadOnlyNotice(null)
    expect(heard).toBe(2)
  })
})

describe('EvidenceNotice', () => {
  test('draws nothing in the ordinary case', () => {
    expect(renderToString(createElement(EvidenceNotice))).toBe('')
  })

  test('draws the ticket: an alert with what happened and what to do, and a Reload to pull', () => {
    setReadOnlyNotice(NOTICE)
    const html = renderToString(createElement(EvidenceNotice))
    expect(html).toContain('role="alert"')
    expect(html).toContain('This tab has stopped saving.')
    expect(html).toContain('Your evidence is safe. Reload to update.')
    expect(html).toContain('data-reason="newer-schema"')
    expect(html).toMatch(/<button[^>]*>.*Reload.*<\/button>/s)
  })

  test('says what each reason means', () => {
    for (const reason of ['newer-schema', 'newer-idb', 'versionchange'] as const) {
      setReadOnlyNotice({ reason, text: READ_ONLY_NOTES[reason] })
      // The renderer escapes the apostrophe of "This browser's".
      expect(renderToString(createElement(EvidenceNotice))).toContain(READ_ONLY_NOTES[reason].replaceAll("'", '&#x27;'))
    }
  })
})

describe('the shell', () => {
  test('shows no prompt until the ledger goes read-only', async () => {
    const html = await renderShell('/')
    expect(html).toContain('<main id="main"')
    expect(html).not.toContain('role="alert"')
  })

  test('shows the prompt at the head of the main landmark, above whichever page matched', async () => {
    setReadOnlyNotice(NOTICE)
    const html = await renderShell('/map')
    const main = html.slice(html.indexOf('<main id="main"'), html.indexOf('</main>'))
    expect(main).toContain('role="alert"')
    expect(main).toContain('Reload to update')
    expect(main.indexOf('role="alert"')).toBeLessThan(main.indexOf('<h1'))
  })

  test('shows it on the error page and the not-found page too', async () => {
    setReadOnlyNotice(NOTICE)
    expect(await renderShell('/nope')).toContain('role="alert"')
  })
})

describe('the hook publishes it', () => {
  test('a read-only ledger sets the notice, and closing the engine clears it', async () => {
    const store = new MemoryStore({ meta: { deviceId: 'dev-new', createdAt: '2026-10-01T00:00:00.000Z', schemaVersion: 2 } })
    configureEvidence({ store, clock: fixedClock(), newId: seededIds(9), tabId: 'tab-hook', channelFactory: null, storageManager: null })
    let view: ReturnType<typeof useEvidence> | undefined
    function Probe() {
      view = useEvidence()
      return null
    }
    renderToString(createElement(Probe))
    expect(getReadOnlyNotice()).toBeNull()
    const refused = await view?.append(ACK)
    expect(refused).toMatchObject({ ok: false, error: 'read-only' })
    expect(getReadOnlyNotice()).toEqual({ reason: 'newer-schema', text: READ_ONLY_NOTES['newer-schema'] })
    closeEvidence()
    expect(getReadOnlyNotice()).toBeNull()
  })

  test('a writable ledger leaves it empty', async () => {
    configureEvidence({ store: new MemoryStore(), clock: fixedClock(), newId: seededIds(9), tabId: 'tab-hook', channelFactory: null, storageManager: null })
    let view: ReturnType<typeof useEvidence> | undefined
    function Probe() {
      view = useEvidence()
      return null
    }
    renderToString(createElement(Probe))
    await view?.append(ACK)
    expect(getReadOnlyNotice()).toBeNull()
  })
})
