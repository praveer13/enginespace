/*
 * W1-T09: the Trace Room's route keeps the stub it had in a build that is neither the dev server nor a test build, which is how these
 * tests run (bun sets neither VITE_ES_TEST_HOOKS nor Vite's mode). The specimen tape is on show in those two builds only, so that a
 * production build holds no part of the viewer and the front page's first-paint closure does not pay for it (src/pages/TraceRoom.tsx
 * says why). What the specimen page shows is walked in a test build by e2e/trace-view.spec.ts.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Route, Routes, StaticRouter } from 'react-router'
import { Component as TraceRoom } from '@/pages/TraceRoom'

const at = (location: string) =>
  renderToStaticMarkup(h(StaticRouter, { location }, h(Routes, null, h(Route, { path: '/trace-room/:trace', element: h(TraceRoom) }), h(Route, { path: '/trace-room', element: h(TraceRoom) }))))

describe('the Trace Room route outside the dev server and test builds', () => {
  test('is a stub with one heading, for a specimen’s id as for any other', () => {
    for (const location of ['/trace-room/synthetic-7', '/trace-room/sample']) {
      const markup = at(location)
      expect(markup.match(/<h1/g)?.length).toBe(1)
      expect(markup).toContain('Not built yet')
      expect(markup).toContain('W2-T20')
      expect(markup).toContain(`Trace id: ${location.split('/').pop()}`)
      expect(markup).not.toContain('data-trace-view')
      expect(markup).not.toContain('specimen tape')
    }
  })

  test('says nothing of an id on the list’s address', () => {
    const markup = at('/trace-room')
    expect(markup).toContain('Not built yet')
    expect(markup).toContain('W2-T20')
    expect(markup).not.toContain('Trace id')
  })
})
