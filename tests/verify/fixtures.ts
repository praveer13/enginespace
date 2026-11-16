/*
 * Reading the owner's receipt fixtures (W2-T12) from tests/fixtures/receipts/: the manifest, the pin of each file by its SHA-256, and the context in which the
 * browser would check it. The fixtures are real bundles from the owner's GPUs, so the context is the site's own: the grader build that the receipt names is taken
 * as the one the site published (W2-T10 adds it to the list), the receipt's challenge is in the ledger, and everything else is what the page passes today.
 *
 * The same loader reads a folder of synthetic bundles in the loader's own tests, with the synthetic context, so that the code that will read the owner's bundles
 * has run before they exist.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { VerifyContext } from '@es/verify'
import { ATLAS } from '@/receipts/atlas'
import { BANKS, STAGE_DECLARATIONS } from '@/receipts/declared'
import { ENGINE_PINS } from '@/receipts/pins'
import { root } from '../ci/support'
import { readBundleFile } from './bestiary'
import type { Fixture } from './synthetic'

export const FIXTURES_DIR = path.join(root, 'tests/fixtures/receipts')

export interface ManifestEntry {
  readonly file: string
  readonly sha256: string
  readonly dated: string
  readonly stage: string
  readonly gpu: string
}

export interface Manifest {
  readonly schema: 'enginespace/receipt-fixtures@1'
  readonly fixtures: readonly ManifestEntry[]
}

/** The manifest of a folder, or an empty one when there is none. Throws, naming the entry, on anything that is not the format above. */
export function readManifest(dir: string = FIXTURES_DIR): Manifest {
  const file = path.join(dir, 'manifest.json')
  if (!existsSync(file)) return { schema: 'enginespace/receipt-fixtures@1', fixtures: [] }
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null) throw new Error('manifest.json is not an object')
  const manifest = parsed as { schema?: unknown; fixtures?: unknown }
  if (manifest.schema !== 'enginespace/receipt-fixtures@1') throw new Error(`manifest.json: schema is ${JSON.stringify(manifest.schema)}, not "enginespace/receipt-fixtures@1"`)
  if (!Array.isArray(manifest.fixtures)) throw new Error('manifest.json: fixtures is not a list')
  for (const [at, entry] of (manifest.fixtures as Record<string, unknown>[]).entries()) {
    for (const key of ['file', 'sha256', 'dated', 'stage', 'gpu']) {
      if (typeof entry[key] !== 'string') throw new Error(`manifest.json: fixtures[${at}].${key} is not a string`)
    }
    if (!/^[0-9a-f]{64}$/.test(entry.sha256 as string)) throw new Error(`manifest.json: fixtures[${at}].sha256 is not 64 lower-case hex digits`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.dated as string)) throw new Error(`manifest.json: fixtures[${at}].dated is not a date`)
    if (!/^[a-z0-9][a-z0-9._-]*\.es\.json\.gz$/.test(entry.file as string)) throw new Error(`manifest.json: fixtures[${at}].file is not a bundle's file name`)
  }
  return manifest as unknown as Manifest
}

/** The context in which a real fixture is checked: the site's own data, the receipt's grader as the published one, and its challenge in the ledger a day before the receipt was made. */
export function siteContextFor(bundle: Fixture['bundle']): VerifyContext {
  const { receipt } = bundle
  const issued = `${receipt.challenge.issuedOn.slice(0, 4)}-${receipt.challenge.issuedOn.slice(4, 6)}-${receipt.challenge.issuedOn.slice(6, 8)}T12:00:00.000Z`
  const { token, seed, nonce, issuedOn } = receipt.challenge
  return {
    book: [{ token, stage: receipt.stage, seed, nonce, issuedOn, at: issued }],
    nowMs: Date.parse(receipt.createdAt) + 60_000,
    graders: [{ version: receipt.grader.version, sourceSha256: receipt.grader.sourceSha256 }],
    pins: ENGINE_PINS,
    atlas: ATLAS,
    stages: STAGE_DECLARATIONS,
    banks: BANKS,
  }
}

/**
 * The fixtures of a folder, each with the context that `contextOf` makes for it. A file whose bytes are not its entry's SHA-256 throws: a fixture is pinned,
 * and a bundle that changed is another fixture.
 */
export function loadFixtures(dir: string = FIXTURES_DIR, contextOf: (bundle: Fixture['bundle']) => VerifyContext = siteContextFor): Fixture[] {
  return readManifest(dir).fixtures.map((entry): Fixture => {
    const bytes = readFileSync(path.join(dir, entry.file))
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (digest !== entry.sha256) throw new Error(`${entry.file}: its bytes hash to ${digest}, and the manifest pins ${entry.sha256}`)
    const bundle = readBundleFile(bytes)
    if (bundle.receipt.stage !== entry.stage) throw new Error(`${entry.file}: the receipt is of ${bundle.receipt.stage}, and the manifest says ${entry.stage}`)
    return { name: entry.file, stage: entry.stage, provenance: 'gpu-verified', bundle, context: contextOf(bundle) }
  })
}
