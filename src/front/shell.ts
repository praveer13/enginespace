/*
 * The front page's static shell (ARCHITECTURE §6.11, TRACKER W0-T18): what index.html holds inside `<div id="root">` before any
 * script runs. It is the app itself at `/`, rendered once by the build: the board, the pass with the order ticket (the heading and the
 * promise) and the poster in its box, the deck, and below the fold the night, the order, the menu and the next ticket, in plain HTML.
 *
 * scripts/pages/front-shell.ts loads this module through Vite's server-side loader, so it runs the same code the browser runs, with
 * the same aliases and the same compiled content, and writes its markup into index.html. The app then renders the same page into the
 * root once its chunks are in (src/main.tsx waits for the route), so the swap from the static HTML to the live page moves nothing.
 *
 * It is never part of the browser's bundle: nothing in the app imports it.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router'
import { routes } from '@/routes'

/** The markup of the app at the front page, for a site served under `base` (`/` or `/enginespace/`). */
export async function renderFrontShell(base: string): Promise<string> {
  const handler = createStaticHandler(routes, { basename: base })
  const context = await handler.query(new Request(new URL(base, 'http://localhost')))
  if (context instanceof Response) throw new Error(`the front page answered with a ${context.status} response, not a page`)
  if (context.errors !== null) throw new Error(`the front page failed to render: ${JSON.stringify(context.errors)}`)
  const router = createStaticRouter(handler.dataRoutes, context)
  return renderToStaticMarkup(createElement(StaticRouterProvider, { router, context, hydrate: false }))
}
