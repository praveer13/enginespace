/*
 * W2-T42: the three blocks that were placeholders, as markup (the server renderer inside a router): the trace block in a lesson and on a ticket,
 * "In vLLM today", and the Build row. A card's file loads after the page's first paint, so the page-level checks read what stands while it
 * loads, and the card's words are drawn from the compiled card itself.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import type { Claim, CompiledBlock, CompiledBuildThis, CompiledInProduction, CompiledLesson, LessonIndex } from '@es/schema'
import { Blocks } from '@/content/render/Blocks'
import { inProductionTitle } from '@/content/render/kept'
import { BuildThisBody, InProductionBody } from '@/content/render/KeptCards'
import { claimNumbers, renderEnv } from '@/content/render/model'
import { groupSections } from '@/content/render/sections'
import { LessonView } from '@/pages/Lesson'
import { compile, output } from './support.ts'

const TODAY = '2026-11-04'
const compiled = compile()
const json = <T>(file: string): T => JSON.parse(output(compiled, file)) as T
const lesson = json<CompiledLesson>('src/content/generated/lessons/tr2.l0-sample.json')
const claims: ReadonlyMap<string, Claim> = new Map(json<{ claims: Claim[] }>('public/claims.json').claims.map((claim) => [claim.id, claim]))
const lessonIndex = json<LessonIndex>('src/content/generated/lesson-index.json')
const engine = json<CompiledInProduction>('src/content/generated/cards/in-vllm-prefix-cache.json')
const build = json<CompiledBuildThis>('src/content/generated/cards/build-hybrid-kv-pool.json')

const render = (element: ReactElement, location = '/') => renderToString(h(StaticRouter, { location }, element)).replaceAll('<!-- -->', '')
// The sample lesson without the blocks that load code lazily (a guess, a question set, a game): rendering one starts that load, and a lazy component that
// has resolved draws differently for every later test of the process (tests/content/render.test.ts reads the loading state).
const base: CompiledBlock[] = lesson.blocks.filter((block) => block.type !== 'predict' && block.type !== 'item' && block.type !== 'game')
const trace: CompiledBlock = { type: 'trace', id: 'loop-off', seed: 7, tasks: ['gap'] }
const kept = (kind: 'in-production' | 'build-this', id: string, cites: string[]): CompiledBlock => ({ type: 'card', kind, id, cites })
const ENGINE_CITES = ['vllm.cache.prefix-caching-default', 'vllm.cache.block-size-default', 'sglang.radix.rust-core-default']

describe('the trace block', () => {
  test('on a ticket waits under one button, labelled synthetic, and loads nothing of the viewer until the learner asks', () => {
    const html = render(h(Blocks, { blocks: [trace], env: renderEnv([trace], claims, TODAY), scope: 'tr9.l1', rev: 'abc123' }))
    expect(html).not.toContain('data-placeholder')
    expect(html).not.toContain('Not built yet')
    expect(html).toContain('>synthetic<')
    expect(html).toContain('Open the trace')
    expect(html).toContain('data-phase="waiting"')
    expect(html).not.toContain('data-trace-view')
  })

  test('with no seed is a pinned trace that has not been captured, and says so instead of offering a button', () => {
    const html = render(h(Blocks, { blocks: [{ type: 'trace', id: 'night-1', tasks: ['gap'] }], env: renderEnv([], claims, TODAY), scope: 'tr9.l1' }))
    expect(html).toContain('has not been captured yet')
    expect(html).not.toContain('Open the trace')
  })

  test('in a lesson is a Run-style block where it was written, with the head of a run', () => {
    const shown: CompiledLesson = { ...lesson, blocks: [...base, trace] }
    const html = render(h(LessonView, { lesson: shown, lessons: lessonIndex.modules.tr2 ?? [], claims, today: TODAY }), '/m/tr2/l0-sample')
    expect(html).toContain('<span class="es-run__kind">Trace</span>')
    expect(html).toContain('Open the trace')
    expect(html).not.toContain('A trace sits here')
  })
})

describe('"In vLLM today"', () => {
  test('is a note in the lesson where it was written, which waits for its card and names no task', () => {
    const shown: CompiledLesson = { ...lesson, blocks: [...base, kept('in-production', 'in-vllm-prefix-cache', ENGINE_CITES)] }
    const html = render(h(LessonView, { lesson: shown, lessons: lessonIndex.modules.tr2 ?? [], claims, today: TODAY }), '/m/tr2/l0-sample')
    expect(html).toMatch(/class="es-note es-inprod" data-kind="in-engine"/)
    expect(html).toContain('In vLLM today')
    expect(html).not.toContain('W2-T42')
  })

  test('draws the lever, then a list under each engine whose every item is a numbered mark', () => {
    const blocks: CompiledBlock[] = [kept('in-production', engine.id, ENGINE_CITES)]
    const env = { ...renderEnv(blocks, claims, TODAY), marks: claimNumbers(blocks) }
    env.claim = (id) => h('sup', { 'data-claim': id }, String(env.marks?.get(id)))
    const html = render(h(InProductionBody, { card: engine, env }))
    expect(html).toContain('data-engine="vLLM"')
    expect(html).toContain('data-engine="SGLang"')
    expect(html.match(/<li>/g)?.length).toBe(3)
    expect([...html.matchAll(/data-claim="([^"]+)"/g)].map((match) => match[1])).toEqual(ENGINE_CITES)
    expect(inProductionTitle(engine)).toBe('In vLLM today')
  })

  test('on a page of tickets is printed when it loads, and names no task', () => {
    const blocks = [kept('in-production', engine.id, ENGINE_CITES)]
    const html = render(h(Blocks, { blocks, env: renderEnv(blocks, claims, TODAY), scope: 'tr9.l1' }))
    expect(html).not.toContain('data-placeholder')
    expect(html).not.toContain('W2-T42')
  })
})

describe('the Build row', () => {
  test('is Keep’s, drawn from a Build-this card beside the lesson’s lab blocks, and the card is not drawn where it was written', () => {
    const blocks: CompiledBlock[] = [...base, kept('build-this', build.id, [])]
    const sections = groupSections(blocks)
    expect(sections.builds).toEqual([blocks.length - 1])
    expect(groupSections(base).builds).toEqual([])
    const html = render(h(LessonView, { lesson: { ...lesson, blocks }, lessons: lessonIndex.modules.tr2 ?? [], claims, today: TODAY }), '/m/tr2/l0-sample')
    expect(html.indexOf('keep-build-')).toBeGreaterThan(html.indexOf('id="keep"'))
  })

  test('names the lab, says what the learner builds and which stages the lesson prepares, and links to the lab', () => {
    const env = renderEnv([], claims, TODAY)
    const html = render(h(BuildThisBody, { card: build, env, heading: (name) => h('h3', null, name) }))
    expect(html).toContain('href="/labs/hybrid-kv"')
    expect(html).toContain('A hybrid KV manager with adapter pages')
    expect(html).toContain('This lesson prepares stages s1, s2.')
    expect(html).toContain('Open the lab')
  })

  test('of a lab that has no page yet says it is not published, and links nowhere', () => {
    const env = renderEnv([], claims, TODAY)
    const html = render(h(BuildThisBody, { card: { ...build, lab: 'tr3.profile', stages: ['s1'] }, env, heading: (name) => h('h3', null, name) }))
    expect(html).toContain('Not published yet.')
    expect(html).toContain('This lesson prepares stage s1.')
    expect(html).not.toContain('href="/labs/')
  })
})

describe('a lesson that cites through a card', () => {
  test('numbers the card’s claims after the prose’s own, in block order, so its marks match its Sources', () => {
    const own = [...claimNumbers(lesson.blocks).keys()]
    const blocks: CompiledBlock[] = [...lesson.blocks, kept('in-production', engine.id, ENGINE_CITES)]
    expect([...claimNumbers(blocks).keys()]).toEqual([...own, ...ENGINE_CITES.filter((id) => !own.includes(id))])
  })
})
