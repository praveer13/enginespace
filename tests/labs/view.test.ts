/*
 * W2b-T30: a graded lab's page as markup, drawn on the server renderer at /labs/tr0.forward from the lab's descriptor (src/labs/tr0-forward.ts
 * and variations of it made here), with what the site's list of files says of each kit file as a prop. What a click,
 * a key and a copy do, and axe at 320, 360 and 1280 px, are checked in a real browser in e2e/lab-page.spec.ts.
 *
 *   - The page is the numbered procedure of REDESIGN 3.9: the eight steps in order, and above the first only what the lab builds and needs.
 *   - The kit's files are linked by kind, each with its size and SHA-256 from the list, and the step says so when the list cannot be read.
 *   - Each stage carries one state line of the fixed set, a challenge link, its command with a copy control, and what the terminal shows.
 *   - A command from a pin's documents that the course never ran carries the tag unverified; one the course ran, or its own, does not.
 *   - Each check prints its id, its label, who checks it and what it catches.
 *   - No number on the page stands without a tag, no banned word and no build-log id.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router'
import { untaggedNumbers } from '../../scripts/content/prose'
import { findBanned } from '../../src/copy/banned'
import { PAGE, STAGE_STATE, stateLine } from '../../src/labs/copy'
import { GradedLabView } from '../../src/labs/GradedLabView'
import { parseKitFiles, fileFor, type KitFileState } from '../../src/labs/kit-files'
import { GRADED_LABS } from '../../src/labs/published'
import type { GradedLab } from '../../src/labs/types'
import { labById } from '../../src/receipts/labs'

const root = path.resolve(import.meta.dirname, '../..')
const MANIFEST = parseKitFiles(JSON.parse(readFileSync(path.join(root, 'public/labs/manifest.json'), 'utf8')))
const FIXTURE = GRADED_LABS['tr0.forward']

const ready = (lab: GradedLab): KitFileState[] =>
  lab.kit.map((ref) => {
    const file = fileFor(MANIFEST, ref)
    if (file === undefined) throw new Error(`the manifest has no ${ref.kind}`)
    return { status: 'ready', file }
  })

const decode = (html: string) => html.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
const textOf = (html: string) => decode(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
/**
 * The text a learner reads as prose: code is an identifier, and its digits are not figures. A readout's value is left out too: the
 * component will not print a number without its tag (src/design/components/Readout.tsx), so its figure is tagged by construction.
 */
const proseOf = (html: string) =>
  textOf(html.replace(/<code\b[^>]*>.*?<\/code>/gs, ' ').replace(/<pre\b[^>]*>.*?<\/pre>/gs, ' ').replace(/<data class="es-readout__value"[^>]*>.*?<\/data>/gs, ' '))
/** Text with no spaces, to compare a sentence with its markup, where code stands apart from the punctuation after it. */
const squash = (text: string) => text.replace(/[`\s]+/g, '')

function render(lab: GradedLab = FIXTURE, files: readonly KitFileState[] = ready(lab)): string {
  const page = createElement(Routes, null, createElement(Route, { path: '/labs/:lab', element: createElement(GradedLabView, { lab, files }) }))
  return renderToString(createElement(MemoryRouter, { initialEntries: [`/labs/${lab.id}`] }, page)).replaceAll('<!-- -->', '')
}

const stepsOf = (html: string) => [...html.matchAll(/<li class="es-glab-step"[^>]*data-step-id="([^"]+)"[^>]*>\s*<h2[^>]*>(.*?)<\/h2>/gs)].map((m) => [m[1], textOf(m[2])])
const stepBody = (html: string, id: string) => {
  const start = html.indexOf(`data-step-id="${id}"`)
  const end = html.indexOf('<li class="es-glab-step"', start + 1)
  return html.slice(start, end < 0 ? undefined : end)
}

describe('/labs/tr0.forward, from the fixture descriptor', () => {
  const html = render()

  test('is headed by what the lab builds, and holds nothing above the first step but that and what it needs', () => {
    expect(textOf(/<h1[^>]*>(.*?)<\/h1>/s.exec(html)?.[1] ?? '')).toBe(FIXTURE.title)
    const head = /<header class="es-glab__head">(.*?)<\/header>/s.exec(html)?.[1] ?? ''
    expect(head).toContain('aria-label="Breadcrumb"')
    expect(head).toContain('href="/m/tr0"')
    expect(squash(textOf(head))).toContain(squash(FIXTURE.builds))
    for (const need of FIXTURE.needs) expect(textOf(head)).toContain(need.term)
    // Between the head and the list of steps: nothing.
    const between = html.slice(html.indexOf('</header>') + '</header>'.length, html.indexOf('<ol class="es-glab-steps"'))
    expect(textOf(between)).toBe('')
  })

  test('is the eight steps of REDESIGN 3.9, in order, in one ordered list', () => {
    expect(stepsOf(html)).toEqual([
      ['kit', 'Download the kit'],
      ['inputs', 'Fetch the inputs'],
      ['challenge', 'Get a challenge'],
      ['edit', 'Edit one file'],
      ['run', 'Run the grader'],
      ['import', 'Bring the receipt back'],
      ['checks', 'The checks'],
      ['prove', 'Prove it'],
    ])
  })

  test("links the kit's files by kind, each with its size and SHA-256 from the list, and a line that checks the download", () => {
    const kit = stepBody(html, 'kit')
    for (const ref of FIXTURE.kit) {
      const file = fileFor(MANIFEST, ref)!
      expect(kit).toContain(`data-kit-kind="${ref.kind}"`)
      expect(kit).toContain(`href="/labs/${file.name}"`)
      expect(kit).toContain(`value="${file.bytes}"`)
      expect(kit).toContain(file.sha256)
      expect(decode(kit)).toContain(`echo '${file.sha256}  ${file.name}' | sha256sum -c`)
    }
    expect(FIXTURE.kit.map((ref) => ref.kind)).toEqual(['gpu-kit', 'grader-wheel'])
  })

  test('says when the list of files is on its way, and when it cannot be read, and prints no hash it does not have', () => {
    const loading = stepBody(render(FIXTURE, FIXTURE.kit.map(() => ({ status: 'loading' }))), 'kit')
    expect(textOf(loading)).toContain(PAGE.kitLoading)
    expect(loading).not.toContain('SHA-256</span>')
    const missing = stepBody(render(FIXTURE, FIXTURE.kit.map(() => ({ status: 'unavailable' }))), 'kit')
    expect(decode(textOf(missing))).toContain(PAGE.kitMissing)
    expect(missing).not.toMatch(/[0-9a-f]{64}/)
  })

  test('gives each command its own copy control and what the terminal then shows', () => {
    const commands = [...FIXTURE.inputs, ...FIXTURE.stages.map((stage) => stage.run)]
    const lines = [...html.matchAll(/<code[^>]*data-command-line=""[^>]*>(.*?)<\/code>/gs)].map((m) => decode(m[1]))
    // Every command, and the check line of each kit file.
    expect(lines.filter((line) => !line.startsWith('echo '))).toEqual(commands.map((command) => command.line))
    expect(lines.length).toBe(commands.length + FIXTURE.kit.length)
    const buttons = [...html.matchAll(/<button[^>]*aria-label="([^"]+)"[^>]*>Copy the command<\/button>/g)].map((m) => decode(m[1]))
    expect(buttons.length).toBe(lines.length)
    expect(new Set(buttons).size).toBe(buttons.length)
    expect([...html.matchAll(/Then you see/g)].length).toBe(lines.length)
  })

  test('names every stage of the lab list, each with one state line of the fixed set, a challenge link and its grade command', () => {
    const listed = labById('tr0.forward')!
    const run = stepBody(html, 'run')
    const sections = [...run.matchAll(/<section class="es-glab-stage"[^>]*data-stage="([^"]+)"[^>]*>(.*?)<\/section>/gs)]
    expect(sections.map((m) => m[1])).toEqual(listed.stages.map((stage) => stage.id))
    for (const [index, m] of sections.entries()) {
      const page = FIXTURE.stages[index]
      const states = [...m[2].matchAll(/<p class="es-glab-state"[^>]*>(.*?)<\/p>/gs)].map((s) => textOf(s[1]))
      expect(states).toHaveLength(1)
      expect(states[0]).toContain(stateLine(page.state))
      expect(decode(m[2])).toContain(`enginespace grade ${page.id} --challenge <token>`)
    }
    const challenge = stepBody(html, 'challenge')
    for (const stage of listed.stages) expect(decode(challenge)).toContain(`href="/receipts?stage=${stage.id}"`)
    // The optional stage says so.
    expect(textOf(sections[0][2])).toContain(PAGE.optional)
    expect(textOf(sections[1][2])).not.toContain(PAGE.optional)
  })

  test('the fixture says what the lab is to show until the course has run it: stages 1 and 3 not run on the pinned weights, stage 2 awaiting the bank', () => {
    expect(FIXTURE.stages.map((stage) => stateLine(stage.state))).toEqual([STAGE_STATE['not-run-weights'], STAGE_STATE['awaiting-bank'], STAGE_STATE['not-run-weights']])
  })

  test('the list of stages beside the steps holds each stage with its state and its challenge', () => {
    const aside = /<aside class="es-glab-stages"[^>]*>(.*?)<\/aside>/s.exec(html)?.[1] ?? ''
    for (const stage of FIXTURE.stages) {
      expect(textOf(aside)).toContain(stateLine(stage.state))
      expect(decode(aside)).toContain(`href="/receipts?stage=${stage.id}"`)
    }
  })

  test('prints each check with its id, its label, who checks it and what it catches', () => {
    const checks = stepBody(html, 'checks')
    for (const stage of FIXTURE.stages) {
      for (const check of stage.checks) {
        expect(checks).toContain(`<code class="es-glab-check__id">${check.id}</code>`)
        expect(squash(textOf(checks))).toContain(squash(check.label))
        expect(squash(textOf(checks))).toContain(squash(check.catches))
      }
    }
    expect([...checks.matchAll(/data-by="grader"/g)].length).toBe(FIXTURE.stages.flatMap((s) => s.checks).filter((c) => c.by === 'grader').length)
    expect([...checks.matchAll(/data-by="browser"/g)].length).toBe(FIXTURE.stages.flatMap((s) => s.checks).filter((c) => c.by === 'browser').length)
  })

  test('ends on the Prove step, which says it is not published yet until the questions are open', () => {
    expect(textOf(stepBody(render({ ...FIXTURE, prove: { ...FIXTURE.prove, open: false } }), 'prove'))).toContain(PAGE.proveClosed)
    const open = stepBody(html, 'prove')
    expect(textOf(open)).not.toContain(PAGE.proveClosed)
    expect(open).toContain('href="/receipts"')
  })

  test('holds no number without a tag, no banned word and no build-log id', () => {
    expect(untaggedNumbers(proseOf(html))).toEqual([])
    expect(findBanned(textOf(html)).map((finding) => finding.match)).toEqual([])
    expect(textOf(html)).not.toMatch(/\b(?:W\d+b?-T\d+|R-T\d+|D-\d{2,3}|Q-\d+)\b/)
  })
})

describe('the tag unverified on a command', () => {
  const pinned = (ran?: string): GradedLab => ({
    ...FIXTURE,
    inputs: [{ line: 'vllm serve Qwen/Qwen3-0.6B', then: 'The server says it is ready.', from: 'pin', ...(ran === undefined ? {} : { ran }) }],
  })
  const stamps = (html: string) => [...stepBody(html, 'inputs').matchAll(/data-word="unverified"/g)].length

  test("marks a line of a pin's documents that the course has never run", () => {
    const html = render(pinned())
    expect(stamps(html)).toBeGreaterThan(0)
    expect(textOf(stepBody(html, 'inputs'))).toContain(PAGE.unverified)
  })

  test('marks neither a line the course ran nor a line of its own', () => {
    expect(stamps(render(pinned('2026-11-20')))).toBe(0)
    expect(stamps(render())).toBe(0)
  })
})

describe('a verified stage', () => {
  test('says the day the course ran it, and the commit it ran at, set as code', () => {
    const commit = 'aa61d1c50c3c6f319624e7bccbe1ca32ccecbc4f'
    const lab: GradedLab = { ...FIXTURE, stages: FIXTURE.stages.map((stage) => ({ ...stage, state: { kind: 'verified', on: '2026-11-20', commit } })) }
    const run = stepBody(render(lab), 'run')
    expect(textOf(run)).toContain('verified: the course ran it on 2026-11-20')
    expect(run).toContain(`at <code>${commit.slice(0, 12)}</code>`)
  })
})
