/**
 * Tab sync over a BroadcastChannel (ARCHITECTURE §7.4): one tab writes, and every other tab re-derives.
 *
 * The channel carries a notice that something changed, and never the change. A receiver reads the store again, so the store
 * stays the one source of truth: there is no second copy of an event on the wire to disagree with it, and a message from
 * anywhere on the origin is never decoded as evidence. The notice says what kind of change it was, so a receiver can skip a
 * read it does not need, and the sender's `schemaVersion` rides on every message so that an older tab can go read-only the
 * moment a newer one speaks (guard.ts).
 *
 * The wrapper stamps `from` and `schemaVersion` on each message it sends, drops the tab's own echoes and any message that is
 * not one of ours, and degrades to a channel that does nothing where BroadcastChannel does not exist. A closed channel or a
 * failed post never breaks a write: tabs then catch up the next time they read the store.
 */

/** The channel's name (ARCHITECTURE §7.4). */
export const CHANNEL_NAME = 'enginespace'

/** What changed in the store, for a receiver that wants to skip a read. */
export const CHANGES = ['append', 'working', 'import', 'undo', 'reset'] as const
export type Change = (typeof CHANGES)[number]

export type ChannelMessage =
  /** A tab has opened. A newer bundle's hello tells an older tab to stop writing. */
  | { t: 'hello'; from: string; schemaVersion: number }
  /** The store changed: read it again. */
  | { t: 'changed'; from: string; schemaVersion: number; what: Change }
  /**
   * A message with our envelope and a kind we do not know, which a newer bundle may send. It still carries its sender's
   * `schemaVersion`, so the guard can read it, and nothing else about it is acted on.
   */
  | { t: 'other'; from: string; schemaVersion: number }

/** The part of a message that the caller supplies. */
export type OutgoingMessage = { t: 'hello' } | { t: 'changed'; what: Change }

/** The slice of BroadcastChannel this module uses, so a test can fake it. */
export interface ChannelLike {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  close(): void
}

export interface EvidenceChannel {
  /** False where BroadcastChannel is missing, and `post` then does nothing. */
  readonly available: boolean
  post(message: OutgoingMessage): void
  /** Receive the messages of other tabs. Returns the unsubscribe. */
  subscribe(listener: (message: ChannelMessage) => void): () => void
  close(): void
}

export interface OpenChannelOptions {
  /** This tab's id, unique for this page load. */
  tabId: string
  /** This bundle's `SCHEMA_VERSION`, stamped on every message. */
  schemaVersion: number
  /** The constructor of a channel by name. `null` or a missing BroadcastChannel gives a channel that does nothing. */
  factory?: ((name: string) => ChannelLike) | null
}

/** BroadcastChannel in a browser, and nothing where it is missing (a worker without it, a server, an old WebView). */
export function browserChannelFactory(): ((name: string) => ChannelLike) | null {
  return typeof BroadcastChannel === 'undefined' ? null : (name) => new BroadcastChannel(name)
}

/** The longest sender id a message may carry [estimated]: this build's are 36 characters. */
const MAX_FROM_CHARS = 100

/**
 * Whether a received value is a message of ours: an object with a sender and a version. This is a shape check on data from
 * the channel and nothing more, and whatever passes only ever tells the tab to read the store again or to stop writing. A
 * kind of message that this build does not know is kept, as `other`, for the sake of its version.
 */
export function parseChannelMessage(data: unknown): ChannelMessage | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null
  const message = data as Record<string, unknown>
  if (typeof message.from !== 'string' || message.from.length === 0 || message.from.length > MAX_FROM_CHARS) return null
  const version = message.schemaVersion
  if (typeof version !== 'number' || !Number.isFinite(version)) return null
  if (message.t === 'hello') return { t: 'hello', from: message.from, schemaVersion: version }
  if (message.t === 'changed' && typeof message.what === 'string' && (CHANGES as readonly string[]).includes(message.what)) {
    return { t: 'changed', from: message.from, schemaVersion: version, what: message.what as Change }
  }
  return { t: 'other', from: message.from, schemaVersion: version }
}

const NO_CHANNEL: EvidenceChannel = { available: false, post() {}, subscribe: () => () => {}, close() {} }

export function openChannel(options: OpenChannelOptions): EvidenceChannel {
  const make = options.factory === undefined ? browserChannelFactory() : options.factory
  let channel: ChannelLike | null = null
  try {
    channel = make === null ? null : make(CHANNEL_NAME)
  } catch {
    channel = null
  }
  if (channel === null) return NO_CHANNEL
  const open = channel
  const unsubscribers = new Set<() => void>()
  return {
    available: true,
    post(message) {
      try {
        open.postMessage({ ...message, from: options.tabId, schemaVersion: options.schemaVersion })
      } catch {
        // A closed channel must not break a write: the other tabs read the store next time they look.
      }
    },
    subscribe(listener) {
      const onMessage = (event: { data: unknown }): void => {
        const message = parseChannelMessage(event.data)
        if (message === null || message.from === options.tabId) return
        listener(message)
      }
      open.addEventListener('message', onMessage)
      const unsubscribe = (): void => {
        open.removeEventListener('message', onMessage)
        unsubscribers.delete(unsubscribe)
      }
      unsubscribers.add(unsubscribe)
      return unsubscribe
    },
    close() {
      for (const unsubscribe of [...unsubscribers]) unsubscribe()
      try {
        open.close()
      } catch {
        // Already closed.
      }
    },
  }
}
