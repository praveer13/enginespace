/*
 * The files a graded lab's first step links (GradedLabView.tsx), read from `public/labs/manifest.json`: the GPU-lane kit, the grader as a
 * wheel, and a forge lab's crate. scripts/pack-kit.ts and scripts/pack-labs.ts write that list, each entry with its kind, name, size and
 * SHA-256, and the page prints the size and the hash beside each link so that a learner can check a download.
 *
 * src/forge/kits.ts reads the same list for the forge labs' own page and keeps only their crates. This reads every kind, and is fetched
 * once per visit from the site's own origin (`connect-src 'self'`). An entry that does not say its name, size and hash plainly is passed
 * over: the step then says it cannot read them, which is better than printing a hash it does not trust.
 */
import { once, publicUrl, useSource, type Loaded, type Source } from '@/content/load'
import type { KitRef } from './types'

/** One file of the list, as a lab's page links it. */
export interface KitFile {
  kind: KitRef['kind']
  /** The forge lab a crate belongs to; none for the kit and the wheel. */
  lab?: string
  /** `enginespace-gpu-kit-0.1.0.zip`: a name in `public/labs`. */
  name: string
  bytes: number
  /** Lowercase hex. */
  sha256: string
}

/** What a page knows of one file it links: the list is on its way, it holds the file, or it could not say. */
export type KitFileState = { status: 'loading' } | { status: 'ready'; file: KitFile } | { status: 'unavailable' }

const KINDS: readonly KitRef['kind'][] = ['gpu-kit', 'grader-wheel', 'forge-lab']
/** A plain file name of a kind the packers write: a zip or a wheel. */
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:zip|whl)$/
const HEX_64 = /^[0-9a-f]{64}$/

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Every file of a parsed `manifest.json` that names its kind, name, size and hash plainly. */
export function parseKitFiles(body: unknown): KitFile[] {
  if (!isRecord(body) || !Array.isArray(body.files)) throw new Error('labs/manifest.json has no list of files')
  const out: KitFile[] = []
  for (const entry of body.files as unknown[]) {
    if (!isRecord(entry)) continue
    const { kind, lab, name, bytes, sha256 } = entry
    if (typeof kind !== 'string' || !(KINDS as readonly string[]).includes(kind)) continue
    if (typeof name !== 'string' || !FILE_NAME.test(name) || typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 0) continue
    if (typeof sha256 !== 'string' || !HEX_64.test(sha256)) continue
    if (kind === 'forge-lab' && typeof lab !== 'string') continue
    out.push({ kind: kind as KitRef['kind'], ...(kind === 'forge-lab' ? { lab: lab as string } : {}), name, bytes, sha256 })
  }
  return out
}

/** The file of the list that a step asks for: the one of its kind, and for a crate, the one of its lab. */
export function fileFor(files: readonly KitFile[], ref: KitRef): KitFile | undefined {
  return files.find((file) => file.kind === ref.kind && (ref.kind !== 'forge-lab' || file.lab === ref.lab))
}

/** The list, fetched once. A failed fetch is not remembered, so the next page tries again. */
export function loadKitFiles(): Promise<readonly KitFile[]> {
  return once('lab-kit-files', async () => {
    const response = await fetch(publicUrl('labs/manifest.json'))
    if (!response.ok) throw new Error(`labs/manifest.json answered ${response.status}`)
    return parseKitFiles(await response.json())
  })
}

const FILES: Source<readonly KitFile[]> = { ask: () => loadKitFiles() }

/** What the list says of each file a lab links, in the lab's order. */
export function useKitFiles(refs: readonly KitRef[]): KitFileState[] {
  const loaded: Loaded<readonly KitFile[]> = useSource(FILES, 'all')
  return refs.map((ref): KitFileState => {
    if (loaded.status === 'loading') return { status: 'loading' }
    const file = loaded.status === 'ready' ? fileFor(loaded.value, ref) : undefined
    return file === undefined ? { status: 'unavailable' } : { status: 'ready', file }
  })
}

/** Where the site serves a file of `public/labs`. */
export const kitFileUrl = (name: string): string => publicUrl(`labs/${name}`)

/** The line that checks a download, in the form `sha256sum -c` reads: run where the file was saved, it prints `<name>: OK`. */
export const checkLineOf = (file: KitFile): string => `echo '${file.sha256}  ${file.name}' | sha256sum -c`
