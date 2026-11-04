import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import './index.css'
import { routes } from './routes'

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

// GitHub Pages serves the site under /enginespace/ until a custom domain exists (O-1); Vite's `base` sets BASE_URL.
const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL })

const container = document.getElementById('root')
if (!container) throw new Error('index.html lost its #root element')

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
