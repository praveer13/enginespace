/*
 * A route's chunks are preloaded when a link to it is hovered or focused (ARCHITECTURE §6.10, D-059). The build writes the route table
 * beside the entry (scripts/pages/route-table.ts): for each pattern of the route table, the chunks its page needs besides the entry's,
 * and for each game, its component's. It is read the first time a link is reached for, and each chunk is preloaded once, with
 * `<link rel=modulepreload>`, which fetches a module and runs nothing, so a page's code runs only when the page is opened.
 *
 * The entry carries this and no list of the pages' chunks: Vite would put one in the entry for each lazy route, and every page would
 * download every page's names (vite.config.ts). A document preloads its own route's chunks (front-shell.ts, prepare-pages). In the dev
 * server there is no table, and nothing to preload.
 */
import { matchRoutes } from 'react-router'
import type { RouteObject } from 'react-router'

/**
 * The keys of the route table that a path is found under: its route's pattern (`/m/:module`), and the path itself, which is how a game's
 * own chunks are kept (`/play/loop`). None for a path outside `basename`, or for one the route table does not match.
 */
export function routeKeys(routes: RouteObject[], pathname: string, basename = '/'): string[] {
  const leaf = matchRoutes(routes, pathname, basename)?.at(-1)
  if (leaf === undefined) return []
  const local = `/${pathname.slice(basename.replace(/\/$/, '').length).replace(/^\/+|\/+$/g, '')}`
  return [leaf.route.index === true ? '/' : `/${leaf.route.path ?? ''}`, local]
}

/** Starts preloading on hover and focus, over the whole document. `table` is the route table's address, beside the entry. */
export function preloadOnIntent(routes: RouteObject[], basename: string, table: string): void {
  let files: Promise<Record<string, readonly string[]>> | null = null
  const sent = new Set<string>()
  const preload = (keys: readonly string[]) => {
    // A table that cannot be fetched or read preloads nothing, and the route still opens: its chunks load as it imports them.
    files ??= fetch(table)
      .then((response) => (response.ok ? response.json() : {}))
      .catch(() => ({}))
    void files.then((byKey) => {
      for (const file of keys.flatMap((key) => byKey[key] ?? [])) {
        if (sent.has(file)) continue
        sent.add(file)
        const link = document.createElement('link')
        link.rel = 'modulepreload'
        link.crossOrigin = ''
        link.href = `${basename}${file}`
        document.head.append(link)
      }
    })
  }
  const intent = (event: Event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (!(link instanceof HTMLAnchorElement) || link.origin !== location.origin) return
    const keys = routeKeys(routes, link.pathname, basename)
    if (keys.length > 0) preload(keys)
  }
  document.addEventListener('pointerover', intent, { passive: true })
  document.addEventListener('focusin', intent)
}
