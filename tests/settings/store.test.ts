/*
 * The settings of a tab (W0-T22): a store over a fake environment, so every rule of it is read without a browser. The browser's own
 * environment (localStorage, the root element, the `storage` event) is exercised in e2e/settings.spec.ts.
 */
import { describe, expect, spyOn, test } from 'bun:test'
import { decodeMirror, DEFAULT_SETTINGS, encodeMirror, MIRROR_KEY } from '@/settings/model'
import type { Settings } from '@/settings/model'
import { browserEnv, createSettingsStore } from '@/settings/store'
import type { SettingsEnv } from '@/settings/store'

interface FakeEnv extends SettingsEnv {
  data: Map<string, string>
  attributes: Map<string, string>
  /** Another tab writes the copy, and this tab hears it. */
  foreign(text: string | null): void
  listeners: Set<() => void>
  writes: string[]
}

function fakeEnv(initial?: string): FakeEnv {
  const data = new Map<string, string>(initial === undefined ? [] : [[MIRROR_KEY, initial]])
  const attributes = new Map<string, string>()
  const listeners = new Set<() => void>()
  const writes: string[] = []
  return {
    data,
    attributes,
    listeners,
    writes,
    storage: {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        writes.push(value)
        data.set(key, value)
      },
      removeItem: (key) => {
        writes.push('(removed)')
        data.delete(key)
      },
    },
    root: { setAttribute: (name, value) => void attributes.set(name, value), removeAttribute: (name) => void attributes.delete(name) },
    hear(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    foreign(text) {
      if (text === null) data.delete(MIRROR_KEY)
      else data.set(MIRROR_KEY, text)
      for (const listener of [...listeners]) listener()
    },
  }
}

const chosen = (patch: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...patch })

describe('a store starts from the copy', () => {
  test('the defaults when nothing is stored', () => {
    expect(createSettingsStore(fakeEnv()).get()).toEqual(DEFAULT_SETTINGS)
  })

  test('what an earlier visit saved', () => {
    const env = fakeEnv(encodeMirror(chosen({ view3d: false, motion: 'reduce' })))
    expect(createSettingsStore(env).get()).toEqual(chosen({ view3d: false, motion: 'reduce' }))
  })

  test('the defaults when the copy is damaged, and the damaged text is left alone until a change replaces it', () => {
    const env = fakeEnv('{{{')
    const store = createSettingsStore(env)
    expect(store.get()).toEqual(DEFAULT_SETTINGS)
    expect(env.data.get(MIRROR_KEY)).toBe('{{{')
  })

  test('the defaults when storage is blocked, and no call to it ever throws', () => {
    const blocked: SettingsEnv = {
      storage: {
        getItem: () => {
          throw new Error('SecurityError')
        },
        setItem: () => {
          throw new Error('QuotaExceededError')
        },
        removeItem: () => {
          throw new Error('SecurityError')
        },
      },
      root: null,
      hear: () => () => undefined,
    }
    const store = createSettingsStore(blocked)
    expect(store.get()).toEqual(DEFAULT_SETTINGS)
    expect(() => store.set({ view3d: false })).not.toThrow()
    // The setting stands for as long as the page does.
    expect(store.get().view3d).toBe(false)
    expect(() => store.reset()).not.toThrow()
    expect(store.get()).toEqual(DEFAULT_SETTINGS)
    expect(() => store.start()()).not.toThrow()
  })

  test('the defaults with no storage at all, as on the server', () => {
    const store = createSettingsStore({ storage: null, root: null, hear: () => () => undefined })
    expect(store.get()).toEqual(DEFAULT_SETTINGS)
    store.set({ tierCap: 1 })
    expect(store.get().tierCap).toBe(1)
  })
})

describe('a change made in this tab', () => {
  test('updates the store, tells every subscriber once, and writes the copy', () => {
    const env = fakeEnv()
    const store = createSettingsStore(env)
    let heard = 0
    store.subscribe(() => {
      heard += 1
    })
    store.set({ tierCap: 2 })
    expect(store.get()).toEqual(chosen({ tierCap: 2 }))
    expect(heard).toBe(1)
    expect(decodeMirror(env.data.get(MIRROR_KEY) ?? null)).toEqual(chosen({ tierCap: 2 }))
  })

  test('changes the whole value, never one in place: a snapshot a component holds is not changed under it', () => {
    const store = createSettingsStore(fakeEnv())
    const before = store.get()
    store.set({ gameKeys: false })
    expect(before.gameKeys).toBe(true)
    expect(store.get()).not.toBe(before)
    expect(Object.isFrozen(store.get())).toBe(true)
  })

  test('says nothing when nothing changed, and keeps the snapshot', () => {
    const store = createSettingsStore(fakeEnv())
    let heard = 0
    store.subscribe(() => {
      heard += 1
    })
    const before = store.get()
    store.set({ view3d: true })
    store.set({})
    expect(heard).toBe(0)
    expect(store.get()).toBe(before)
  })

  test('puts reduced motion on the root, and takes it off when the system decides again', () => {
    const env = fakeEnv()
    const store = createSettingsStore(env)
    store.set({ motion: 'reduce' })
    expect(env.attributes.get('data-motion')).toBe('reduce')
    store.set({ motion: 'full' })
    expect(env.attributes.get('data-motion')).toBe('full')
    store.set({ motion: 'system' })
    expect(env.attributes.has('data-motion')).toBe(false)
  })

  test('keeps no copy while everything is at its default, so a learner who chose nothing has nothing stored', () => {
    const env = fakeEnv()
    const store = createSettingsStore(env)
    store.set({ view3d: false })
    expect(env.data.has(MIRROR_KEY)).toBe(true)
    store.set({ view3d: true })
    expect(env.data.has(MIRROR_KEY)).toBe(false)
  })

  test('a subscriber that unsubscribes hears nothing more', () => {
    const store = createSettingsStore(fakeEnv())
    let first = 0
    let second = 0
    const off = store.subscribe(() => {
      first += 1
    })
    store.subscribe(() => {
      second += 1
    })
    store.set({ tierCap: 1 })
    off()
    store.set({ tierCap: 2 })
    expect([first, second]).toEqual([1, 2])
  })

  test('a subscriber that throws does not stop the others hearing, nor break the change', () => {
    const env = fakeEnv()
    const store = createSettingsStore(env)
    const log = spyOn(console, 'error').mockImplementation(() => undefined)
    let heard = 0
    store.subscribe(() => {
      throw new Error('a page`s bug')
    })
    store.subscribe(() => {
      heard += 1
    })
    expect(() => store.set({ view3d: false })).not.toThrow()
    expect(heard).toBe(1)
    expect(store.get().view3d).toBe(false)
    expect(env.data.has(MIRROR_KEY)).toBe(true)
    expect(log).toHaveBeenCalledTimes(1)
    log.mockRestore()
  })
})

describe('start', () => {
  test('marks the root with what the copy said, before anything draws', () => {
    const env = fakeEnv(encodeMirror(chosen({ motion: 'reduce' })))
    const store = createSettingsStore(env)
    expect(env.attributes.size).toBe(0)
    store.start()
    expect(env.attributes.get('data-motion')).toBe('reduce')
  })

  test('marks nothing while the system decides', () => {
    const env = fakeEnv()
    createSettingsStore(env).start()
    expect(env.attributes.size).toBe(0)
  })

  test('takes what another tab writes, tells subscribers, and writes nothing back', () => {
    const env = fakeEnv()
    const store = createSettingsStore(env)
    store.start()
    let heard = 0
    store.subscribe(() => {
      heard += 1
    })
    env.writes.length = 0
    env.foreign(encodeMirror(chosen({ motion: 'reduce', view3d: false })))
    expect(store.get()).toEqual(chosen({ motion: 'reduce', view3d: false }))
    expect(env.attributes.get('data-motion')).toBe('reduce')
    expect(heard).toBe(1)
    expect(env.writes).toEqual([])
  })

  test('takes the defaults when another tab removes the copy, as a reset or a clear does', () => {
    const env = fakeEnv(encodeMirror(chosen({ motion: 'full', tierCap: 1 })))
    const store = createSettingsStore(env)
    store.start()
    expect(env.attributes.get('data-motion')).toBe('full')
    env.foreign(null)
    expect(store.get()).toEqual(DEFAULT_SETTINGS)
    expect(env.attributes.has('data-motion')).toBe(false)
  })

  test('stops hearing when it is told to', () => {
    const env = fakeEnv()
    const store = createSettingsStore(env)
    const stop = store.start()
    expect(env.listeners.size).toBe(1)
    stop()
    expect(env.listeners.size).toBe(0)
    env.foreign(encodeMirror(chosen({ view3d: false })))
    expect(store.get()).toEqual(DEFAULT_SETTINGS)
  })
})

describe('adopt and reset', () => {
  test('adopt takes the record`s values, marks the root and rewrites the copy to match', () => {
    const env = fakeEnv(encodeMirror(chosen({ motion: 'reduce' })))
    const store = createSettingsStore(env)
    store.start()
    store.adopt(chosen({ motion: 'full', tierCap: 2 }))
    expect(store.get()).toEqual(chosen({ motion: 'full', tierCap: 2 }))
    expect(env.attributes.get('data-motion')).toBe('full')
    expect(decodeMirror(env.data.get(MIRROR_KEY) ?? null)).toEqual(chosen({ motion: 'full', tierCap: 2 }))
  })

  test('adopt of what the store holds already changes nothing and tells no one', () => {
    const store = createSettingsStore(fakeEnv())
    let heard = 0
    store.subscribe(() => {
      heard += 1
    })
    store.adopt({ ...DEFAULT_SETTINGS })
    expect(heard).toBe(0)
  })

  test('reset puts every setting back, takes the mark off the root and removes the copy', () => {
    const env = fakeEnv()
    const store = createSettingsStore(env)
    store.start()
    store.set({ motion: 'reduce', view3d: false, gameKeys: false, tierCap: 1 })
    store.reset()
    expect(store.get()).toEqual(DEFAULT_SETTINGS)
    expect(env.attributes.has('data-motion')).toBe(false)
    expect(env.data.has(MIRROR_KEY)).toBe(false)
  })
})

describe('the browser`s environment', () => {
  test('has no storage and no root where there is no window, so the server and the tests hold the defaults', () => {
    const env = browserEnv()
    expect(env.storage).toBeNull()
    expect(env.root).toBeNull()
    expect(() => env.hear(() => undefined)()).not.toThrow()
  })
})
