/*
 * R-T25: /about and /changes are built pages. About says what the course is, what each model leaves out (each card in full), how numbers are
 * tagged under the anchor `#numbers`, what stays on the device and the licences; Sources and changes lists the pins and says what has moved.
 * Neither shows a build-log id, a task or a wave, and neither names a licence for the site's own code and content (O-3, the owner's).
 */
import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { findBanned } from '../../src/copy/banned'
import { TAG_LEGEND } from '../../src/design/components/Stamp'
import { Component as About } from '../../src/pages/About'
import { Component as Changes } from '../../src/pages/Changes'
import lock from '../../course.lock.json'
import { planPages } from '../../scripts/pages/plan'
import { loadSources } from '../../scripts/pages/sources'
import { routes } from '../../src/routes'

const page = (location: string, Component: () => ReturnType<typeof About>) => renderToString(createElement(StaticRouter, { location }, createElement(Component))).replaceAll('<!-- -->', '')
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const decode = (value: string) => value.replaceAll('&#x27;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&')

const about = page('/about', About)
const changes = page('/changes', Changes)
const plan = planPages(routes, loadSources())
const lead = (url: string) => {
  const found = plan.pages.find((candidate) => candidate.url === url)
  if (found === undefined || found.keep) throw new Error(`no document of its own for ${url}`)
  return found
}

describe('/about', () => {
  test('has one h1 and its sections: what the course is, what each model leaves out, how numbers are tagged, privacy and licences', () => {
    expect([...about.matchAll(/<h1[^>]*>(.*?)<\/h1>/gs)].map((match) => match[1])).toEqual(['About'])
    expect([...about.matchAll(/<h2[^>]*>(.*?)<\/h2>/gs)].map((match) => match[1])).toEqual([
      'What the course is',
      'What each model leaves out',
      'How numbers are tagged',
      'What stays on your device',
      'Licences',
    ])
  })

  test('has the tag legend under the anchor the footer links to: the four words, and unverified in its own line', () => {
    const section = /<section[^>]*id="numbers"[^>]*>(.*?)<\/section>/s.exec(about)?.[1] ?? ''
    expect(section).not.toBe('')
    for (const { word, means } of TAG_LEGEND) {
      expect(section).toContain(word)
      expect(decode(text(section))).toContain(means)
    }
    expect(section).toContain('data-word="unverified"')
  })

  test('holds each model`s card under its game`s name, in full where the game speaks in the engine`s words, and says "Not published yet" where it does not', () => {
    for (const id of ['loop', 'pool', 'engine-floor', 'verifier', 'broken-bench']) expect(about).toContain(`id="ab-card-${id}"`)
    expect(about).toContain('data-loop-card')
    expect(about).toContain('data-pool-card')
    expect([...about.matchAll(/Not published yet\./g)]).toHaveLength(2)
  })

  test('its lead is the served document`s description', () => {
    expect(decode(about)).toContain(lead('/about').description)
    expect(lead('/about').heading).toBe('About')
  })

  test('shows no build-log word, no banned word, and no licence for the site`s own code and content', () => {
    const body = decode(text(about))
    expect(body).not.toMatch(/\bW\d+b?-T\d+|\bR-T\d+|\bD-\d{3}|\bO-\d\b|Arriving with|not built yet/)
    expect(findBanned(body)).toEqual([])
    expect(body).not.toMatch(/\bMIT\b|CC BY|all rights reserved|\bGPL\b|\bBSD\b|Apache License/i)
  })
})

describe('/changes', () => {
  test('has one h1, one row for each pin of the course lock, and one stamp for the table', () => {
    expect([...changes.matchAll(/<h1[^>]*>(.*?)<\/h1>/gs)].map((match) => match[1])).toEqual(['Sources and changes'])
    expect([...changes.matchAll(/<tbody>(.*?)<\/tbody>/gs)][0][1].match(/<tr>/g)).toHaveLength(lock.entries.length)
    expect([...changes.matchAll(/es-stamp/g)].length).toBeGreaterThan(0)
    expect([...changes.matchAll(/data-word="measured"/g)]).toHaveLength(1)
  })

  test('says each pin by its version or its short commit, and when it was last read', () => {
    for (const entry of lock.entries) {
      expect(changes).toContain(`dateTime="${entry.checkedAt}"`)
      if (entry.commit !== undefined) expect(changes).toContain(entry.commit.slice(0, 7))
      if (entry.version !== undefined) expect(changes).toContain(entry.version)
    }
  })

  test('says change cards are not published yet, in the words of a learner, and shows no build-log word', () => {
    const body = decode(text(changes))
    expect(body).toContain('are not published yet')
    expect(body).not.toMatch(/\bW\d+b?-T\d+|\bR-T\d+|\bD-\d{3}|\bO-\d\b|Arriving with|Not built yet/)
    expect(findBanned(body)).toEqual([])
  })

  test('its lead is the served document`s description', () => {
    expect(decode(changes)).toContain(lead('/changes').description)
  })
})
