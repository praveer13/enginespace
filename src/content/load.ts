/*
 * How the app reaches the compiled content (ARCHITECTURE §4.6, W0-T09). The compiler writes `src/content/generated/` (the
 * course index, one JSON per module, lesson and card) and `public/claims.json`, and nothing here reads `content/` (§2.3).
 *
 *   - The index and each module, lesson and card are lazy chunks through `import.meta.glob`, so a page pays for the one lesson it
 *     shows, and for the cards that lesson names. The globs sit inside functions, never at the top of the module: the server renderer in tests/ has no
 *     `import.meta.glob`, and it imports every page. Vite replaces each call wherever it stands.
 *   - The claims file is fetched from this site's own origin (`connect-src 'self'`, D-033) and only by a page whose prose
 *     cites a claim.
 *   - A load that fails is not remembered, so the next ask tries again.
 *
 * The hooks start a load in an effect and never in render, so a page rendered on the server shows its loading state and a
 * hook can be used where no Vite exists.
 */
import { useEffect, useState } from 'react'
import type { Claim, ClaimsOutput, CompiledCard, CompiledLesson, CompiledModule, ContentIndex } from '@es/schema'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Loading                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

const lessonFiles = () => import.meta.glob<CompiledLesson>('./generated/lessons/*.json', { import: 'default' })
const moduleFiles = () => import.meta.glob<CompiledModule>('./generated/modules/*.json', { import: 'default' })
const cardFiles = () => import.meta.glob<CompiledCard>('./generated/cards/*.json', { import: 'default' })
const indexFiles = () => import.meta.glob<ContentIndex>('./generated/index.json', { import: 'default' })

const asks = new Map<string, Promise<unknown>>()

/** One load per name, shared by everyone who asks, and forgotten if it fails. A `make` that throws is a failed load, not a throw. */
export function once<T>(name: string, make: () => Promise<T>): Promise<T> {
  const known = asks.get(name) as Promise<T> | undefined
  if (known !== undefined) return known
  const ask = new Promise<T>((resolve) => resolve(make()))
  asks.set(name, ask)
  ask.catch(() => {
    if (asks.get(name) === ask) asks.delete(name)
  })
  return ask
}

/** The file for `name` from a glob's table, or null when the compiler wrote none: a module or lesson that does not exist. */
export function pick<T>(files: Record<string, () => Promise<T>>, path: string): Promise<T | null> {
  const load = Object.hasOwn(files, path) ? files[path] : undefined
  return load === undefined ? Promise.resolve(null) : load()
}

/** The course index: modules, lessons, titles, routes and hours. */
export function loadIndex(): Promise<ContentIndex> {
  return once('index', async () => {
    const index = await pick(indexFiles(), './generated/index.json')
    if (index === null) throw new Error('the course index was not compiled: run `bun scripts/content/build.ts`')
    return index
  })
}

/** A module's page, or null when `id` has no `module.md` (a planned module, or no module at all). */
export function loadModule(id: string): Promise<CompiledModule | null> {
  return once(`module:${id}`, () => pick(moduleFiles(), `./generated/modules/${id}.json`))
}

/** A lesson's page, or null when there is none. `slug` is the last part of its route, such as `l0-sample`. */
export function loadLesson(module: string, slug: string): Promise<CompiledLesson | null> {
  return once(`lesson:${module}/${slug}`, () => pick(lessonFiles(), `./generated/lessons/${module}.${slug}.json`))
}

/** A notional-machine card (A§5.9), or null when `id` has no card. The compiler checks every card a block names, so null means a stale build. */
export function loadCard(id: string): Promise<CompiledCard | null> {
  return once(`card:${id}`, () => pick(cardFiles(), `./generated/cards/${id}.json`))
}

/** A path under `public/`, which the site serves at its base (`/` in development, `/enginespace/` on GitHub Pages). */
export const publicUrl = (path: string): string => `${import.meta.env.BASE_URL ?? '/'}${path.replace(/^\/+/, '')}`

/** Every claim by id. */
export function loadClaims(): Promise<ReadonlyMap<string, Claim>> {
  return once('claims', async () => {
    const response = await fetch(publicUrl('claims.json'))
    if (!response.ok) throw new Error(`claims.json answered ${response.status}`)
    const body = (await response.json()) as ClaimsOutput
    if (!Array.isArray(body.claims)) throw new Error('claims.json has no claims')
    return new Map(body.claims.map((claim): [string, Claim] => [claim.id, claim]))
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Hooks                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What a page holds while it waits for content. */
export type Loaded<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error'; error: Error }

const LOADING: Loaded<never> = { status: 'loading' }

/** A kind of content, and how to ask for one of it by name. A source is a module-level constant, so an effect can depend on it. */
export interface Source<T> {
  ask: (name: string) => Promise<T>
}

const INDEX: Source<ContentIndex> = { ask: () => loadIndex() }
const MODULE: Source<CompiledModule | null> = { ask: (name) => loadModule(name) }
const LESSON: Source<CompiledLesson | null> = { ask: (name) => loadLesson(...(name.split('/') as [string, string])) }
const CARD: Source<CompiledCard | null> = { ask: (name) => loadCard(name) }
const CLAIMS: Source<ReadonlyMap<string, Claim>> = { ask: () => loadClaims() }

/**
 * The answer to `source.ask(name)`: loading until it comes, then ready or an error. A new name starts a new load, and the
 * answer to an old one is dropped. A null name asks for nothing and stays loading.
 */
export function useSource<T>(source: Source<T>, name: string | null): Loaded<T> {
  const [answer, setAnswer] = useState<{ source: Source<T>; name: string; loaded: Loaded<T> } | null>(null)
  useEffect(() => {
    if (name === null) return
    let current = true
    // A source that throws before it returns a promise is an error like any other, not a crash of the page.
    Promise.resolve()
      .then(() => source.ask(name))
      .then(
        (value) => current && setAnswer({ source, name, loaded: { status: 'ready', value } }),
        (error: unknown) => current && setAnswer({ source, name, loaded: { status: 'error', error: error instanceof Error ? error : new Error(String(error)) } }),
      )
    return () => {
      current = false
    }
  }, [source, name])
  return answer !== null && answer.source === source && answer.name === name ? answer.loaded : LOADING
}

export const useIndex = (): Loaded<ContentIndex> => useSource(INDEX, '')
export const useModule = (id: string): Loaded<CompiledModule | null> => useSource(MODULE, id)
export const useLesson = (module: string, slug: string): Loaded<CompiledLesson | null> => useSource(LESSON, `${module}/${slug}`)
/** A card, loaded when the page shows the block that names it. */
export const useCard = (id: string): Loaded<CompiledCard | null> => useSource(CARD, id)
/** The claims file, fetched only when `wanted`. */
export const useClaims = (wanted: boolean): Loaded<ReadonlyMap<string, Claim>> => useSource(CLAIMS, wanted ? 'claims' : null)

/**
 * Sets the tab's title once the page has its content. App sets the route's own title (`Lesson · enginespace`) in an effect
 * of its own, and a parent's effect runs after a child's in the same commit, so this waits one microtask, which runs after
 * every effect of the commit has.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title === null) return
    let current = true
    queueMicrotask(() => {
      if (current) document.title = title
    })
    return () => {
      current = false
    }
  }, [title])
}
