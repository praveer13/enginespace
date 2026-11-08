import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import './index.css'
import { routes } from './routes'
import { startSettings } from './settings/store'

// The learner's settings reach the document before anything is drawn: reduced motion is a CSS and scene concern from the first
// paint, and must not flash its animations at a learner who turned it on (ARCHITECTURE §6.9). The store reads a copy that
// sits in localStorage, so the front page need not open the ledger to honour them (src/settings/model.ts says why).
startSettings()

/*
 * A deploy replaces the hashed chunks under an open tab, so a lazy route import can 404 ("Failed to
 * fetch dynamically imported module"). Reload once to pick up the new index.html. The sessionStorage
 * flag stops a chunk that is still missing after the reload from looping, and it is cleared once the
 * reloaded page has stayed up (30 s, kernelspace's figure [estimated]), so a later deploy gets its own one
 * reload. Without a reload, the route error boundary (App.tsx) shows a Reload button instead. This is
 * kernelspace's pattern, re-implemented (ARCHITECTURE §3.2, §13).
 */
const RELOAD_FLAG = 'es:preload-reloaded'
const HEALTHY_AFTER_MS = 30_000

window.addEventListener('vite:preloadError', () => {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
  } catch {
    return // no storage means no loop guard, so leave recovery to the route error boundary
  }
  window.location.reload()
})

window.setTimeout(() => {
  try {
    sessionStorage.removeItem(RELOAD_FLAG)
  } catch {
    // storage unavailable: nothing was set
  }
}, HEALTHY_AFTER_MS)

// Vite's `base` sets BASE_URL: "/" at the root of https://enginespace.naigap.com (D-058), or the subpath that a preview or a fork builds under.
const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL })

const container = document.getElementById('root')
if (!container) throw new Error('index.html lost its #root element')
const root = container

/*
 * React takes the root once the first page's route has loaded, its chunk and its loader, and not before. Until then the static shell
 * that the document holds stays on screen (the front page's, W0-T18, or the one prepare-pages wrote for the route), rather than a
 * loading line in its place, so the page that replaces it arrives whole and moves nothing.
 */
function mount() {
  createRoot(root).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}

if (router.state.initialized) mount()
else {
  const stop = router.subscribe((state) => {
    if (!state.initialized) return
    stop()
    mount()
  })
}
