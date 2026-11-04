/**
 * The schema guard (ARCHITECTURE §7.4, D-024): when does this bundle stop writing?
 *
 * A deploy can leave an old tab open beside a new one. The new bundle may have changed what an event holds, or what the
 * database holds, and an old bundle that kept writing would drop a field it does not know. So a bundle goes read-only,
 * and asks for a reload, as soon as it learns that a newer one owns the data. There are three ways to learn it, one per
 * `ReadOnlyReason` of packages/ledger:
 *
 *   newer-schema   `meta.schemaVersion` in the database is newer than this bundle's, or a message on the channel comes from
 *                  a newer bundle (its `schemaVersion` is stamped on every message, channel.ts);
 *   newer-idb      the database is at a newer IndexedDB version, so opening it failed with a VersionError (idb-store.ts);
 *   versionchange  another context asked to upgrade the database while this tab held it open, and the store let go.
 *
 * Read-only is a latch. The first reason sticks, and reloading is the only way out, because a reload is what loads the
 * newer bundle. The checks are pure and take this bundle's version as an argument, so a test can play an older or a newer
 * bundle. Whoever holds the guard decides what read-only means: the engine writes nothing once it has latched.
 */
import type { ReadOnlyReason, StoreInfo } from '@es/ledger'

function isNewer(candidate: unknown, bundle: number): boolean {
  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate > bundle
}

/** What `store.open()` reported: a newer IndexedDB version, or a newer `schemaVersion` inside the database. */
export function checkStoreInfo(bundleSchema: number, info: StoreInfo): ReadOnlyReason | null {
  if (info.readOnly) return info.reason ?? 'newer-idb'
  return isNewer(info.schemaVersion, bundleSchema) ? 'newer-schema' : null
}

/**
 * A message from another tab. Any message from a newer bundle counts, since the events it wrote may not be readable here.
 * The version is untrusted input from the channel: a message without a usable number is not a reason.
 */
export function checkMessage(bundleSchema: number, message: { schemaVersion: unknown }): ReadOnlyReason | null {
  return isNewer(message.schemaVersion, bundleSchema) ? 'newer-schema' : null
}

/** The store let go of the database for another context's upgrade. The event itself is the evidence. */
export function checkVersionChange(): ReadOnlyReason {
  return 'versionchange'
}

export interface Guard {
  readonly readOnly: boolean
  readonly reason: ReadOnlyReason | undefined
  /** Each check returns true when this call latched read-only, or it was latched already. */
  storeInfo(info: StoreInfo): boolean
  message(message: { schemaVersion: unknown }): boolean
  versionChange(): boolean
}

/**
 * A latch over the checks. The first reason sticks, and `onReadOnly` fires once, when it latches.
 * `bundleSchema` is this build's `SCHEMA_VERSION`.
 */
export function createGuard(bundleSchema: number, onReadOnly?: (reason: ReadOnlyReason) => void): Guard {
  let latched: ReadOnlyReason | undefined
  const apply = (reason: ReadOnlyReason | null): boolean => {
    if (reason !== null && latched === undefined) {
      latched = reason
      onReadOnly?.(reason)
    }
    return latched !== undefined
  }
  return {
    get readOnly() {
      return latched !== undefined
    },
    get reason() {
      return latched
    },
    storeInfo: (info) => apply(checkStoreInfo(bundleSchema, info)),
    message: (message) => apply(checkMessage(bundleSchema, message)),
    versionChange: () => apply(checkVersionChange()),
  }
}

/**
 * What a read-only tab tells the learner, in plain words: what happened, that nothing is lost, and what to do. The reload
 * prompt shows one of these, and `useEvidence()` carries it as `notice`.
 */
export const READ_ONLY_NOTES: Readonly<Record<ReadOnlyReason, string>> = {
  'newer-schema': 'A newer version of enginespace has saved to this browser, so this tab is read-only and saves nothing. Your evidence is safe. Reload to update.',
  'newer-idb': "This browser's database was upgraded by a newer version of enginespace, so this tab is read-only and saves nothing. Your evidence is safe. Reload to update.",
  versionchange: 'Another tab upgraded the database, so this tab is read-only and saves nothing. Your evidence is safe. Reload to keep saving.',
}

/** The note for a reason. */
export const readOnlyNote = (reason: ReadOnlyReason): string => READ_ONLY_NOTES[reason]
