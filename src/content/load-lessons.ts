/*
 * How the module, lesson and card pages reach their compiled content (ARCHITECTURE §4.6, W0-T09): one lazy chunk for each module,
 * lesson and notional-machine card, through `import.meta.glob`, so a page pays for the one lesson it shows and for the cards that
 * lesson names.
 *
 * It sits beside load.ts and not in it, as load-map.ts does (D-059). Each table names every module, lesson or card of the course,
 * with its path and the name of its chunk, so it grows with every lesson that is written, and load.ts is in the closure of every
 * page that reads the course index or a claim: the front page's first paint, which awaits the index, and every game whose
 * debrief cites a claim. Only the pages that show a module, a lesson or a card load these tables. They share load.ts's helpers:
 * one load per name, forgotten if it fails, and a hook that starts the load in an effect and never in render. The globs sit
 * inside functions, as load.ts's does, so that the server renderer of the tests, which has no `import.meta.glob`, can import
 * this module.
 */
import type { CompiledCard, CompiledLesson, CompiledModule } from '@es/schema'
import { once, pick, useSource } from './load'
import type { Loaded, Source } from './load'

const lessonFiles = () => import.meta.glob<CompiledLesson>('./generated/lessons/*.json', { import: 'default' })
const moduleFiles = () => import.meta.glob<CompiledModule>('./generated/modules/*.json', { import: 'default' })
const cardFiles = () => import.meta.glob<CompiledCard>('./generated/cards/*.json', { import: 'default' })

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

const MODULE: Source<CompiledModule | null> = { ask: (name) => loadModule(name) }
const LESSON: Source<CompiledLesson | null> = { ask: (name) => loadLesson(...(name.split('/') as [string, string])) }
const CARD: Source<CompiledCard | null> = { ask: (name) => loadCard(name) }

export const useModule = (id: string): Loaded<CompiledModule | null> => useSource(MODULE, id)
export const useLesson = (module: string, slug: string): Loaded<CompiledLesson | null> => useSource(LESSON, `${module}/${slug}`)
/** A card, loaded when the page shows the block that names it. */
export const useCard = (id: string): Loaded<CompiledCard | null> => useSource(CARD, id)
