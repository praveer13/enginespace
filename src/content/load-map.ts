/*
 * How the course map and the module pages reach the compiled map (ARCHITECTURE §4.6, W1-T06): `src/content/generated/map.json`, which
 * holds each module's prerequisites, artifacts, labs and KCs, the KCs with their edges, and the refs that content assigns to KCs.
 *
 * It sits beside load.ts and not in it, because load.ts is in the front page's first-paint closure (the course index is loaded by its
 * loader, A§6.10) and nothing the front page does reads the map. It shares load.ts's helpers: one load per name, forgotten if it fails,
 * and a hook that starts the load in an effect and never in render. The glob sits inside a function, as load.ts's do, so that the
 * server renderer of the tests, which has no `import.meta.glob`, can import this module.
 */
import type { CourseMap } from '@es/schema'
import { once, pick, useSource } from './load'
import type { Loaded, Source } from './load'

const mapFiles = () => import.meta.glob<CourseMap>('./generated/map.json', { import: 'default' })

/** The compiled map, or a rejection that says the compiler has not run. */
export function loadMap(): Promise<CourseMap> {
  return once('map', async () => {
    const map = await pick(mapFiles(), './generated/map.json')
    if (map === null) throw new Error('the course map was not compiled: run `bun scripts/content/build.ts`')
    return map
  })
}

const MAP: Source<CourseMap> = { ask: () => loadMap() }

export const useMap = (): Loaded<CourseMap> => useSource(MAP, '')
