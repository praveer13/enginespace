import { useEffect, useState } from 'react'

/*
 * The level titles a lesson page shows ("Full attention and a sliding window"), read from the game registry once it has loaded after the
 * first paint (levels.ts). Until then a level is named by its game, which the roster gives at once, so an id is never shown as a title.
 */

type Namer = (game: string, level: string) => string | undefined

let loaded: Namer | null = null
let loading: Promise<Namer> | null = null

export function useLevelNames(): Namer {
  const [namer, setNamer] = useState<Namer | null>(loaded)
  useEffect(() => {
    if (namer !== null) return
    let live = true
    loading ??= import('./levels').then((module) => (loaded = module.levelTitle))
    void loading.then((found) => {
      if (live) setNamer(() => found)
    })
    return () => {
      live = false
    }
  }, [namer])
  return namer ?? (() => undefined)
}
