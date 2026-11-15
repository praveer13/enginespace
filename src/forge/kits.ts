/*
 * What a forge lab's page hands over (W1b-T08; ARCHITECTURE §9.3): the lab's crate, as the zip that the packer wrote (scripts/pack-labs.ts) and
 * the site serves as a static file, `/labs/enginespace-<lab>.zip`. `public/labs/manifest.json` says each zip's size and SHA-256, and the page
 * prints both beside the link, so a learner can check what they downloaded against what the site holds.
 *
 * The manifest is fetched from this site's own origin and nowhere else (`connect-src 'self'`, D-033), once for the whole visit, by the page that
 * shows a crate. The link itself needs no manifest, because the name of a zip is the lab's id in a fixed frame: while the manifest is on its
 * way, or when it cannot be read, the page still offers the download and says that the size and the hash are missing.
 */

import { once, publicUrl, useSource, type Loaded, type Source } from '@/content/load'

/** One forge lab's zip, as the manifest describes it. */
export interface LabKit {
  lab: string
  /** `enginespace-hybrid-kv.zip`: a name in `public/labs`. */
  name: string
  bytes: number
  /** Lowercase hex. */
  sha256: string
}

/** What a page knows of its lab's zip: the manifest is still on its way, it holds the zip, or it could not say. */
export type KitState = { status: 'loading' } | { status: 'ready'; kit: LabKit } | { status: 'unavailable' }

/** The zip of a lab, as `scripts/pack-labs.ts` names it (`zipName`). tests/forge/kits.test.ts holds the two together. */
export const kitName = (lab: string): string => `enginespace-${lab}.zip`

/** Where the site serves a file of `public/labs`. */
export const kitUrl = (name: string): string => publicUrl(`labs/${name}`)

/** A plain file name: the manifest is the site's own, and a name that is anything else is not followed. */
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/
const HEX_64 = /^[0-9a-f]{64}$/

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The forge labs' zips in a parsed `manifest.json`, by lab id. An entry of another kind (W2-T10's GPU kit and grader wheel join this file)
 * is not a forge lab's and is passed over, and so is an entry of this kind that does not say its name, size and hash plainly: the page of
 * that lab then says that it cannot read them, which is better than printing a hash it does not trust.
 */
export function parseKits(body: unknown): ReadonlyMap<string, LabKit> {
  if (!isRecord(body) || !Array.isArray(body.files)) throw new Error('labs/manifest.json has no list of files')
  const kits = new Map<string, LabKit>()
  for (const file of body.files as unknown[]) {
    if (!isRecord(file) || file.kind !== 'forge-lab' || typeof file.lab !== 'string') continue
    const { lab, name, bytes, sha256 } = file
    if (typeof name !== 'string' || !FILE_NAME.test(name) || typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 0) continue
    if (typeof sha256 !== 'string' || !HEX_64.test(sha256)) continue
    kits.set(lab, { lab, name, bytes, sha256 })
  }
  return kits
}

/** The manifest, fetched once. A failed fetch is not remembered, so the next page tries again. */
export function loadKits(): Promise<ReadonlyMap<string, LabKit>> {
  return once('lab-kits', async () => {
    const response = await fetch(publicUrl('labs/manifest.json'))
    if (!response.ok) throw new Error(`labs/manifest.json answered ${response.status}`)
    return parseKits(await response.json())
  })
}

const KITS: Source<ReadonlyMap<string, LabKit>> = { ask: () => loadKits() }

/** What the manifest says of `lab`'s zip. */
export function useLabKit(lab: string): KitState {
  const loaded: Loaded<ReadonlyMap<string, LabKit>> = useSource(KITS, lab)
  if (loaded.status === 'loading') return { status: 'loading' }
  const kit = loaded.status === 'ready' ? loaded.value.get(lab) : undefined
  return kit === undefined ? { status: 'unavailable' } : { status: 'ready', kit }
}

/**
 * The line that checks a download against the manifest, in the form `sha256sum -c` reads: the hash, two spaces, the name. Run where the zip was
 * saved, it prints `<name>: OK` for the file the site holds. The name is a plain file name (`FILE_NAME`), so the quotes cannot be broken.
 */
export const checkLine = (kit: LabKit): string => `echo '${kit.sha256}  ${kit.name}' | sha256sum -c`
