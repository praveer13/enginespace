import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { contentPlugin } from './scripts/content/vite-plugin'
import { metaCsp } from './scripts/pages/csp'
import { frontShell } from './scripts/pages/front-shell'
import { routeTable } from './scripts/pages/route-table'

const root = path.dirname(fileURLToPath(import.meta.url))

/** The internal packages (D-014): folders under packages/, reached as `@es/<name>`. */
export const PACKAGES = ['sim', 'play', 'ledger', 'schema', 'verify'] as const

/**
 * The 3D vendor chunk (D-023): three's core build and R3F. It loads with the first scene and never at first paint.
 * three's addons stay out of it: they belong to the chunk that uses them (postfx, a scene).
 */
const THREE_VENDOR = [/[\\/]node_modules[\\/]three[\\/]build[\\/]/, /[\\/]node_modules[\\/]@react-three[\\/]fiber[\\/]/]

/**
 * What the entry and R3F both use. Rollup pulls every dependency of a manual chunk into it unless that dependency is
 * assigned elsewhere, so left alone these would move into three-vendor and the entry would import three-vendor at first
 * paint. A package the entry shares with R3F belongs on this list (tests/build.test.ts fails when one is missing).
 */
const REACT_VENDOR = /[\\/]node_modules[\\/](react|react-dom|scheduler|zustand|use-sync-external-store)[\\/]/

/**
 * Scene kit v1's props (src/scene/props): one chunk that every 3D game shares over three-vendor, measured by verify:bundle's
 * scene-kit row. A manual chunk pulls in every static dependency not assigned elsewhere, so the two modules the props share with
 * the rest of the app go in a small chunk of their own: the kit's context (kit.ts, which the kit's core imports too) and the props'
 * pure data (specs.ts, which the design page's notes read). Without it, a scene that uses no prop, or a page's first paint, would
 * load the props and three with them.
 */
const SCENE_KIT_DATA = /[\\/]src[\\/]scene[\\/](?:kit\.ts|props[\\/]specs\.ts)$/
const SCENE_KIT = /[\\/]src[\\/]scene[\\/]props[\\/]/

/** What each lazy import preloads, and the route table beside the entry that preloads a route before it opens (D-059, A§6.10). */
const routes = routeTable(root)

// https://vite.dev/config/
export default defineConfig({
  // The site is served at the root of https://enginespace.naigap.com (D-058), so the deploy builds with the default base "/", as local dev
  // does. A preview or a fork that is served under a subpath builds with VITE_BASE=/that-path/, and prepare-pages reads the same variable.
  base: process.env.VITE_BASE || '/',
  // The content compiler (ARCHITECTURE §4.1): it compiles content/ at the start of a build and of the dev server, and again when a lesson changes.
  // The meta CSP (§12) goes into every document of a build, right behind its <meta charset>.
  // The front page's static shell (§6.11) is the app rendered once at `/`, written into index.html's root (W0-T18).
  // The route table goes beside the entry, and the preload lists follow it (scripts/pages/route-table.ts).
  plugins: [react(), contentPlugin(), metaCsp(), frontShell(), routes.plugin],
  build: {
    // verify:bundle walks dist/.vite/manifest.json to measure each route's static JS and CSS closure.
    manifest: true,
    // No modulepreload polyfill in the entry (D-023, W1 note): every browser since Firefox 115 and Safari 17 has
    // <link rel=modulepreload>, and an older one still loads each module, only without the preload. Vite's preload helper stays.
    // The entry's lazy imports, the route table's pages among them, keep no list of chunks: a route's chunks are preloaded from the route
    // table beside the entry when a link to it is hovered or focused (src/route-preload.ts), and by the document of the route
    // (prepare-pages). Any other lazy import keeps the chunks that its importer has not loaded (D-059, scripts/pages/route-table.ts).
    modulePreload: { polyfill: false, resolveDependencies: routes.resolveDependencies },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (THREE_VENDOR.some((pattern) => pattern.test(id))) return 'three-vendor'
          if (REACT_VENDOR.test(id)) return 'react-vendor'
          if (SCENE_KIT_DATA.test(id)) return 'scene-kit-data'
          if (SCENE_KIT.test(id)) return 'scene-kit'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      ...Object.fromEntries(PACKAGES.map((name) => [`@es/${name}`, path.resolve(root, 'packages', name)])),
    },
  },
})
