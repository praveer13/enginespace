/*
 * The tab channel (ARCHITECTURE §7.4): a notice that something changed, never the change. The wrapper stamps who sent it and
 * which data model that bundle speaks, drops its own echoes and anything that is not ours, and does nothing where there is no
 * BroadcastChannel.
 */
import { describe, expect, test } from 'bun:test'
import { CHANNEL_NAME, CHANGES, openChannel, parseChannelMessage } from '@/evidence/channel'
import type { ChannelLike, ChannelMessage } from '@/evidence/channel'
import { FakeBus, quiet, until } from './support'

describe('parseChannelMessage', () => {
  test('reads a hello and a changed', () => {
    expect(parseChannelMessage({ t: 'hello', from: 'a', schemaVersion: 1 })).toEqual({ t: 'hello', from: 'a', schemaVersion: 1 })
    for (const what of CHANGES) {
      expect(parseChannelMessage({ t: 'changed', from: 'a', schemaVersion: 1, what })).toEqual({ t: 'changed', from: 'a', schemaVersion: 1, what })
    }
  })

  test('keeps a kind it does not know as `other`, for the sake of its version', () => {
    expect(parseChannelMessage({ t: 'rebuilt', from: 'b', schemaVersion: 7 })).toEqual({ t: 'other', from: 'b', schemaVersion: 7 })
    // A change it does not know is not a change it can act on, but the version is still read.
    expect(parseChannelMessage({ t: 'changed', from: 'b', schemaVersion: 7, what: 'compacted' })).toEqual({ t: 'other', from: 'b', schemaVersion: 7 })
  })

  test('refuses what is not an envelope of ours', () => {
    const bad: unknown[] = [
      null,
      undefined,
      'hello',
      42,
      [],
      {},
      { t: 'hello' },
      { t: 'hello', from: '', schemaVersion: 1 },
      { t: 'hello', from: 'x'.repeat(101), schemaVersion: 1 },
      { t: 'hello', from: 5, schemaVersion: 1 },
      { t: 'hello', from: 'a' },
      { t: 'hello', from: 'a', schemaVersion: '1' },
      { t: 'hello', from: 'a', schemaVersion: Number.NaN },
      { t: 'hello', from: 'a', schemaVersion: Number.POSITIVE_INFINITY },
    ]
    for (const value of bad) expect(parseChannelMessage(value)).toBeNull()
  })

  test('carries nothing else from a message: no payload reaches the engine', () => {
    const message = parseChannelMessage({ t: 'changed', from: 'a', schemaVersion: 1, what: 'append', events: [{ id: 'x' }], __proto__: { polluted: true } })
    expect(message).toEqual({ t: 'changed', from: 'a', schemaVersion: 1, what: 'append' })
  })
})

describe('openChannel', () => {
  test('is named for the product', () => {
    expect(CHANNEL_NAME).toBe('enginespace')
  })

  test('stamps the sender and the data model on what it sends, and a second tab hears it', async () => {
    const bus = new FakeBus()
    const a = openChannel({ tabId: 'a', schemaVersion: 3, factory: bus.factory })
    const b = openChannel({ tabId: 'b', schemaVersion: 3, factory: bus.factory })
    const heard: ChannelMessage[] = []
    b.subscribe((message) => heard.push(message))
    a.post({ t: 'changed', what: 'append' })
    await until(() => heard.length === 1, 'the message')
    expect(heard).toEqual([{ t: 'changed', from: 'a', schemaVersion: 3, what: 'append' }])
    expect(bus.posted).toEqual([{ t: 'changed', what: 'append', from: 'a', schemaVersion: 3 }])
  })

  test('does not hear itself', async () => {
    const bus = new FakeBus()
    const a = openChannel({ tabId: 'a', schemaVersion: 1, factory: bus.factory })
    openChannel({ tabId: 'b', schemaVersion: 1, factory: bus.factory })
    const heard: ChannelMessage[] = []
    a.subscribe((message) => heard.push(message))
    a.post({ t: 'hello' })
    // An echo can also come from another channel object of the same tab: it carries this tab's id and is dropped.
    bus.inject(CHANNEL_NAME, { t: 'hello', from: 'a', schemaVersion: 1 })
    await quiet()
    expect(heard).toEqual([])
  })

  test('drops what is not a message of ours', async () => {
    const bus = new FakeBus()
    const a = openChannel({ tabId: 'a', schemaVersion: 1, factory: bus.factory })
    const heard: ChannelMessage[] = []
    a.subscribe((message) => heard.push(message))
    bus.inject(CHANNEL_NAME, 'noise')
    bus.inject(CHANNEL_NAME, { t: 'changed', schemaVersion: 1, what: 'append' })
    bus.inject(CHANNEL_NAME, { t: 'hello', from: 'z', schemaVersion: 1 })
    await until(() => heard.length === 1, 'the one real message')
    await quiet()
    expect(heard).toEqual([{ t: 'hello', from: 'z', schemaVersion: 1 }])
  })

  test('unsubscribes, and close stops every subscription', async () => {
    const bus = new FakeBus()
    const a = openChannel({ tabId: 'a', schemaVersion: 1, factory: bus.factory })
    const b = openChannel({ tabId: 'b', schemaVersion: 1, factory: bus.factory })
    const first: ChannelMessage[] = []
    const second: ChannelMessage[] = []
    const off = b.subscribe((message) => first.push(message))
    b.subscribe((message) => second.push(message))
    a.post({ t: 'hello' })
    await until(() => first.length === 1 && second.length === 1, 'both subscribers')
    off()
    a.post({ t: 'hello' })
    await until(() => second.length === 2, 'the second message')
    expect(first).toHaveLength(1)
    b.close()
    a.post({ t: 'hello' })
    await quiet()
    expect(second).toHaveLength(2)
  })

  test('does nothing where there is no channel: not available, and nothing throws', () => {
    for (const factory of [null, (): ChannelLike => { throw new Error('no BroadcastChannel here') }]) {
      const channel = openChannel({ tabId: 'a', schemaVersion: 1, factory })
      expect(channel.available).toBe(false)
      channel.post({ t: 'hello' })
      channel.subscribe(() => undefined)()
      channel.close()
    }
  })

  test('a failed post does not break a write', () => {
    const channel = openChannel({
      tabId: 'a',
      schemaVersion: 1,
      factory: () => ({
        postMessage: () => {
          throw new Error('the channel is closed')
        },
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        close: () => {
          throw new Error('already closed')
        },
      }),
    })
    expect(channel.available).toBe(true)
    expect(() => channel.post({ t: 'changed', what: 'append' })).not.toThrow()
    expect(() => channel.close()).not.toThrow()
  })
})
