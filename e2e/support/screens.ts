/*
 * R-T47: the per-screen checks of REDESIGN section 5.2, as functions that read a page and say what is wrong with it. e2e/screens.spec.ts
 * runs them over every route of e2e/routes.ts, and e2e/first-visit.spec.ts runs the ones about the way on at every checkpoint.
 *
 * The way on is held to `nextStep` itself, not to a copy of its answer: `wayOn` runs the pure function over the events that the browser's
 * ledger holds, the lessons table that the build compiled, and the bookmark in `es:here`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import type { MapLesson } from '@es/schema/compiled'
import { nextStep } from '../../src/progress/next'
import { pointerOnPage } from '../../src/settings/store'
import type { Bookmark, Step } from '../../src/progress/next'
import { ledgerEvents } from './lessons'
import { bannedOn, readable } from './copy-scan'

const root = path.resolve(import.meta.dirname, '../..')

/** The course's lessons, in order, as the build compiled them (the table `nextStep` reads). */
export const LESSONS: MapLesson[] = (JSON.parse(readFileSync(path.join(root, 'src/content/generated/map.json'), 'utf8')) as { lessons: MapLesson[] }).lessons

/** `nextStep`'s answer for what this browser holds: its ledger's events and the place last in view. */
export async function wayOn(page: Page, due = 0): Promise<Step> {
  const events = (await ledgerEvents(page)) as Parameters<typeof nextStep>[0]
  const here = await page.evaluate(() => {
    try {
      return window.localStorage.getItem('es:here')
    } catch {
      return null
    }
  })
  let bookmark: Bookmark | null = null
  try {
    bookmark = here === null ? null : (JSON.parse(here) as Bookmark)
  } catch {
    bookmark = null
  }
  return nextStep(events, LESSONS, bookmark, { due })
}

/** The answer for a learner who has done nothing: Start, TR1 lesson 1. */
export const FIRST_VISIT: Step = nextStep([], LESSONS, null)

export interface WayControl {
  /** The control's name as a reader says it, and the header's own "Continue" or "Start" in full. */
  readonly name: string
  readonly href: string
  /** A ContinueLink: its label is `nextStep`'s label, and its link is `nextStep`'s link. */
  readonly continueLink: boolean
  readonly where: string
}

/**
 * Every control of the page that says Continue or Start in the sense of the way on: a ContinueLink (the header's, and a page's own), and any
 * link that opens with "Continue" or "Start the course". "Start questions" and "Start review" are not the way on: they begin a set.
 */
export function wayControls(page: Page): Promise<WayControl[]> {
  return page.evaluate(() => {
    const out: WayControl[] = []
    const seen = new Set<Element>()
    const say = (element: Element) => (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().replace(/\s+/g, ' ')
    for (const element of document.querySelectorAll('a[href], button')) {
      const way = element.getAttribute('data-way')
      // A ContinueLink keeps its label in a span of its own, beside the first word that a phone shows.
      const name = way === null ? say(element) : (element.querySelector('.es-header__next-label')?.textContent ?? say(element)).trim().replace(/\s+/g, ' ')
      const isWay = way === 'continue' || /^(Continue\b|Start the course\b|Start:)/.test(name)
      if (!isWay || seen.has(element)) continue
      seen.add(element)
      // A local way on ("Open lesson 3: ...") names its target and never says Continue; it is not the answer's control.
      if (way === 'local') continue
      const link = element as HTMLAnchorElement
      const box = element.getBoundingClientRect()
      out.push({
        name,
        href: link.getAttribute('href') ?? '',
        continueLink: way === 'continue',
        where: `${element.tagName.toLowerCase()}${element.className && typeof element.className === 'string' ? `.${element.className.split(' ')[0]}` : ''} at y=${Math.round(box.top + window.scrollY)}`,
      })
    }
    return out
  })
}

/** What is wrong with the page's way on, against `step`: each control that disagrees, and a page with none at all when `required`. */
export async function wayOnProblems(page: Page, step: Step, required = true): Promise<string[]> {
  const controls = await wayControls(page)
  const problems: string[] = []
  const header = controls.find((control) => control.where.startsWith('a.es-header__next'))
  if (header === undefined && required) problems.push('the header has no Continue')
  // On the lesson the answer points at, the header's Continue says "Continue: this lesson" and not "Start" (pointerOnPage).
  const here = pointerOnPage(step, new URL(page.url()).pathname)
  for (const control of controls) {
    if (control.href !== step.href) problems.push(`${control.where} "${control.name}" goes to ${control.href}, and nextStep says ${step.href}`)
    // The words of a ContinueLink are the answer's, whole; a phone's header shows the first word alone and keeps the full label as its name.
    if (control.continueLink && control.name !== step.label && !(control.where.startsWith('a.es-header__next') && control.name === here.label)) problems.push(`${control.where} says "${control.name}", and nextStep says "${step.label}"`)
  }
  return problems
}

/**
 * A hexadecimal run that is a commit's SHA: 7 to 40 characters with a digit and a letter in them. A SHA that names an engine's pin is the
 * course's content, not the build log's: the lessons read vLLM, SGLang and nano-vllm at their pins, and the learner opens the engine's tree at
 * that commit. The pins are the full commits that content/claims holds, so a SHA is an engine pin when it is the start of one of them. Any
 * other SHA (a build of this site, the sibling repository's commit) is the build log's, and is a finding unless it is in a source link, or is
 * set in code as the date and commit of a [measured] tag are (REDESIGN 2.7), which the learner reads as an identifier.
 */
const ENGINE_PINS: string[] = (() => {
  const dir = path.join(root, 'content/claims')
  const files = (readdirSync(dir, { recursive: true }) as string[]).filter((file) => file.endsWith('.yaml'))
  return [...new Set(files.flatMap((file) => readFileSync(path.join(dir, file), 'utf8').match(/\b[0-9a-f]{40}\b/g) ?? []))]
})()

const SHA = /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g
const IDS = /\b(?:W\d+b?-T\d+|R-T\d+|D-\d{2,3}|Q-\d+)\b/g

/** Every tracker id and decision id in what a learner reads: `W2-T07`, `R-T12`, `D-044`, `Q-3`. */
export async function taskIds(page: Page): Promise<string[]> {
  return (await readable(page)).flatMap((text) => [...text.matchAll(IDS)].map((match) => `${match[0]} in "${text.slice(0, 80)}"`))
}

/** Every build-log id on the page in what a learner reads, a SHA outside a link excepted. */
export async function buildLogIds(page: Page): Promise<string[]> {
  const found = await taskIds(page)
  const shas = await page.evaluate((source) => {
    const sha = new RegExp(source, 'g')
    const hits: string[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const element = node.parentElement
      // What a reader meets: not a closed popover's or disclosure's words, which are one press away.
      if (element === null || !element.checkVisibility() || element.closest('script, style, noscript, template, a[href], code, pre, [aria-hidden="true"]') !== null) continue
      const text = node.textContent ?? ''
      for (const match of text.matchAll(sha)) hits.push(`${match[0]} in "${text.trim().slice(0, 80)}"`)
    }
    return hits
  }, SHA.source)
  const own = shas.filter((hit) => {
    const sha = /^[0-9a-f]+/.exec(hit)?.[0] ?? ''
    return !ENGINE_PINS.some((pin) => pin.startsWith(sha))
  })
  return [...found, ...own]
}

/** The banned words and phrases, and the build-log ids, on the page as it stands. */
export async function copyProblems(page: Page): Promise<string[]> {
  return [...(await bannedOn(page)), ...(await buildLogIds(page)).map((id) => `build-log id ${id}`)]
}

export interface Fill {
  readonly name: string
  readonly top: number
  readonly bottom: number
}

/**
 * The amber-filled controls of the page that are drawn (a box, not hidden), with their place in the document. A control is amber-filled when
 * its background is the lamp, which is also how the primary button and the way on say it (`.es-primary-button__pull`, `data-emphasis="primary"`).
 */
export function amberFills(page: Page): Promise<Fill[]> {
  return page.evaluate(() => {
    const lamp = getComputedStyle(document.documentElement).getPropertyValue('--es-marker').trim().toLowerCase()
    const probe = document.createElement('span')
    probe.style.color = lamp
    document.body.append(probe)
    const target = getComputedStyle(probe).color
    probe.remove()
    const out: { name: string; top: number; bottom: number }[] = []
    const candidates = new Set<Element>(document.querySelectorAll('.es-primary-button__pull, [data-emphasis="primary"], a, button, [role="button"], summary'))
    for (const element of candidates) {
      const style = getComputedStyle(element)
      const box = element.getBoundingClientRect()
      if (box.width < 24 || box.height < 24 || style.visibility === 'hidden' || style.display === 'none') continue
      // A control in a box that is closed or scrolled out of its own clip is not in any viewport.
      if (element.closest('[hidden], [inert], details:not([open]) > :not(summary)') !== null) continue
      let fill = style.backgroundColor === target
      // The primary button draws its fill on a child (the pull), so a control whose own background is clear is asked about its children too.
      if (!fill) for (const child of element.querySelectorAll('*')) if (getComputedStyle(child).backgroundColor === target && child.getBoundingClientRect().height >= 24) fill = true
      if (fill) out.push({ name: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50), top: box.top + window.scrollY, bottom: box.bottom + window.scrollY })
    }
    return out.sort((a, b) => a.top - b.top)
  })
}

/**
 * Scrolls the page from top to foot, a half screen at a time, and says where a viewport held more than one amber fill. A lesson's amber follows
 * the part in view, so the page is asked at every stop with its state as that scroll left it, and not once at the top.
 */
export async function amberByScroll(page: Page): Promise<string[]> {
  const height = await page.evaluate(() => window.innerHeight)
  const total = await page.evaluate(() => document.documentElement.scrollHeight)
  const found: string[] = []
  for (let y = 0, steps = 0; steps < 80; y += Math.round(height / 2), steps++) {
    await page.evaluate((to) => window.scrollTo(0, to), y)
    // The page reads its scroll in a frame and redraws in the next: three frames on, a part's way on has taken the viewport's state.
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => done())))))
    const at = await page.evaluate(() => window.scrollY)
    const inView = (await amberFills(page)).filter((fill) => fill.bottom > at && fill.top < at + height)
    const names = [...new Set(inView.map((fill) => `"${fill.name}" at ${Math.round(fill.top)}`))]
    if (names.length > 1) found.push(`${names.length} amber fills in the viewport that starts at ${at}: ${names.join(', ')}`)
    if (y + height >= total) break
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  return [...new Set(found)]
}

/** Everything of the page that stays put while the page scrolls: fixed or sticky, and drawn. */
export function stuck(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('body *')].flatMap((element) => {
      const style = getComputedStyle(element)
      if (style.position !== 'sticky' && style.position !== 'fixed') return []
      const box = element.getBoundingClientRect()
      if (box.width === 0 || box.height === 0 || style.visibility === 'hidden' || style.display === 'none') return []
      const name = `${element.tagName.toLowerCase()}${typeof element.className === 'string' && element.className !== '' ? `.${element.className.split(' ')[0]}` : ''}`
      return [`${name} is ${style.position} (${Math.round(box.width)} x ${Math.round(box.height)} at ${Math.round(box.top)})`]
    }),
  )
}
