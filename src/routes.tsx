import type { RouteObject } from 'react-router'
import App, { AppError, AppLoading, type RouteHandle } from './App'
import { Component as NotFound } from './pages/NotFound'

const SITE = 'enginespace'
/** A route's `<title>`: the page's name, then the site's. App sets it on every navigation. */
const titled = (page: string): RouteHandle => ({ title: `${page} · ${SITE}` })

/*
 * The route table (ARCHITECTURE §3.1). Every page is its own lazy chunk, so the entry holds only the shell
 * and the not-found page. The routes carry no guards: prerequisites advise and never block (I9).
 * Adding a route here means adding it to §3.1 and to tests/smoke.test.ts, which compares the two.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    Component: App,
    ErrorBoundary: AppError,
    HydrateFallback: AppLoading,
    children: [
      { index: true, lazy: () => import('./pages/Front'), handle: { title: SITE } satisfies RouteHandle },
      { path: 'map', lazy: () => import('./pages/Map'), handle: titled('Course map') },
      { path: 'm/:module', lazy: () => import('./pages/Module'), handle: titled('Module') },
      { path: 'm/:module/:lesson', lazy: () => import('./pages/Lesson'), handle: titled('Lesson') },
      { path: 'play', lazy: () => import('./pages/PlayIndex'), handle: titled('Games') },
      { path: 'play/:game', lazy: () => import('./pages/Game'), handle: titled('Game') },
      { path: 'labs/:lab', lazy: () => import('./pages/Lab'), handle: titled('Lab') },
      { path: 'trace-room', lazy: () => import('./pages/TraceRoom'), handle: titled('The Trace Room') },
      { path: 'trace-room/:trace', lazy: () => import('./pages/TraceRoom'), handle: titled('The Trace Room') },
      { path: 'receipts', lazy: () => import('./pages/Receipts'), handle: titled('Receipts') },
      { path: 'today', lazy: () => import('./pages/Today'), handle: titled('Today') },
      { path: 'evidence', lazy: () => import('./pages/Evidence'), handle: titled('Evidence') },
      { path: 'design', lazy: () => import('./pages/Design'), handle: titled('Design system') },
      { path: 'settings', lazy: () => import('./pages/Settings'), handle: titled('Settings') },
      { path: 'about', lazy: () => import('./pages/About'), handle: titled('About') },
      { path: 'changes', lazy: () => import('./pages/Changes'), handle: titled('Changes') },
      { path: '*', Component: NotFound, handle: titled('Page not found') },
    ],
  },
]
