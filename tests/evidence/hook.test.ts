/*
 * `useEvidence()` (W0-T11): one engine for the tab, opened by the first thing that asks, and an empty ledger until it is
 * open. Bun has no DOM, so this renders on the server renderer, which sees the state a page shows before the store opens. The
 * client side of the hook (subscribing, and a second tab's write reaching the DOM) is checked in a real browser, by
 * e2e/ledger-conformance.spec.ts.
 */
import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryStore, seededIds } from '@es/ledger'
import type { LedgerStore } from '@es/ledger'
import { NOT_READY } from '@/evidence/engine'
import { closeEvidence, configureEvidence, useEvidence } from '@/evidence/useEvidence'
import type { Evidence } from '@/evidence/useEvidence'
import { ACK, fixedClock, ITEM, watch } from './support'

afterEach(() => closeEvidence())

/** Renders a component that calls the hook, and hands back what the hook returned. */
function render(): Evidence {
  let seen: Evidence | undefined
  function Probe() {
    seen = useEvidence()
    return null
  }
  renderToString(createElement(Probe))
  if (seen === undefined) throw new Error('the hook did not run')
  return seen
}

const options = (store: LedgerStore) => ({
  store,
  clock: fixedClock(),
  newId: seededIds(5),
  tabId: 'tab-hook',
  channelFactory: null,
  storageManager: null,
})

describe('useEvidence', () => {
  test('returns the not-ready state until the store is open, with every action', () => {
    const view = render()
    expect(view.ready).toBe(false)
    expect(view.events).toEqual([])
    expect(view.working.size).toBe(0)
    expect(view.readOnly).toBe(false)
    for (const action of ['append', 'setWorking', 'deleteWorking', 'exportLedger', 'previewImport', 'importLedger', 'undoImport', 'reset', 'reload']) {
      expect(typeof view[action as keyof Evidence]).toBe('function')
    }
    expect(NOT_READY.ready).toBe(false)
  })

  test('opens nothing when it renders: a page that only draws never touches the store', () => {
    const store = watch(new MemoryStore())
    let opened = 0
    configureEvidence(options({ ...store, open: () => ((opened += 1), store.open()) }))
    render()
    render()
    expect(opened).toBe(0)
  })

  test('an action opens the engine on the configured store, and waits for it', async () => {
    const store = new MemoryStore()
    configureEvidence(options(store))
    const view = render()
    const result = await view.append(ITEM)
    expect(result.ok && result.durable).toBe(true)
    expect((await store.readAll()).events).toHaveLength(1)
    // One engine serves every caller: the next action writes beside the first.
    await render().append(ACK)
    expect((await store.readAll()).events).toHaveLength(2)
  })

  test('the actions are the same functions on every render', () => {
    const a = render()
    const b = render()
    expect(a.append).toBe(b.append)
    expect(a.exportLedger).toBe(b.exportLedger)
  })

  test('configuring after the engine is open is an error, and closing makes it possible again', async () => {
    configureEvidence(options(new MemoryStore()))
    await render().append(ACK)
    expect(() => configureEvidence(options(new MemoryStore()))).toThrow('before the first useEvidence()')
    closeEvidence()
    const fresh = new MemoryStore()
    configureEvidence(options(fresh))
    await render().append(ACK)
    expect((await fresh.readAll()).events).toHaveLength(1)
  })

  test('when even the fallback fails, the action rejects, the failure is logged once, and the next action tries again', async () => {
    const broken: LedgerStore = {
      backend: 'idb',
      open: () => Promise.reject(new Error('blocked')),
      readAll: () => Promise.reject(new Error('blocked')),
      commit: () => Promise.reject(new Error('blocked')),
      listCheckpoints: () => Promise.reject(new Error('blocked')),
      readCheckpoint: () => Promise.reject(new Error('blocked')),
      onVersionChange: () => () => undefined,
      close: () => undefined,
    }
    const logged = spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      configureEvidence({ ...options(broken), fallbackStore: () => broken })
      const view = render()
      await expect(view.append(ACK)).rejects.toThrow('blocked')
      expect(logged).toHaveBeenCalledTimes(1)
      await expect(view.append(ACK)).rejects.toThrow('blocked')
      expect(logged).toHaveBeenCalledTimes(2)
    } finally {
      logged.mockRestore()
    }
  })

  test('reload() reloads the page', () => {
    const view = render()
    const original = (globalThis as { window?: unknown }).window
    let reloads = 0
    ;(globalThis as { window?: unknown }).window = { location: { reload: () => (reloads += 1) } }
    try {
      view.reload()
    } finally {
      ;(globalThis as { window?: unknown }).window = original
    }
    expect(reloads).toBe(1)
  })
})
