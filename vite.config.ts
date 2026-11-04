import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { contentPlugin } from './scripts/content/vite-plugin'
import { metaCsp } from './scripts/pages/csp'
import { frontShell } from './scripts/pages/front-shell'

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

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the site at /enginespace/ until a custom domain exists (O-1); local dev and previews use "/".
  base: process.env.VITE_BASE || '/',
  // The content compiler (ARCHITECTURE §4.1): it compiles content/ at the start of a build and of the dev server, and again when a lesson changes.
  // The meta CSP (§12) goes into every document of a build, right behind its <meta charset>.
  // The front page's static shell (§6.11) is the app rendered once at `/`, written into index.html's root (W0-T18).
  plugins: [react(), contentPlugin(), metaCsp(), frontShell()],
  build: {
    // verify:bundle walks dist/.vite/manifest.json to measure each route's static JS and CSS closure.
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (THREE_VENDOR.some((pattern) => pattern.test(id))) return 'three-vendor'
          if (REACT_VENDOR.test(id)) return 'react-vendor'
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
