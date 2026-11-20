/*
 * W2-T42: the two other cards that live in a file, as the compiler reads them (scripts/content/cards.ts):
 *
 *   - an In-production card ("In vLLM today"): words, then one part for each engine, `## vLLM` and `## SGLang` in that order, each a list whose
 *     every item cites a claim;
 *   - a Build-this card (the Build row in Keep): front matter that names a lab and its stages, and words, with no parts.
 *
 * And what a lesson's block that names one of them carries: the claims the card cites, so that the lesson numbers its marks and lists its Sources
 * before the card's file has loaded. Every test that breaks a card breaks a copy of the fixtures below and says which line it broke.
 */
import { describe, expect, test } from 'bun:test'
import { compiledBuildThisSchema, compiledInProductionSchema, compiledLessonSchema } from '@es/schema'
import type { CompiledBuildThis, CompiledInProduction, CompiledLesson } from '@es/schema'
import { LESSON, compile, errors, lineOf, output, swap, where } from './support.ts'
import type { Edit } from './support.ts'

const IN = 'content/cards/fixture-engine.md'
const IN_JSON = 'src/content/generated/cards/fixture-engine.json'
const BUILD = 'content/cards/fixture-build.md'
const BUILD_JSON = 'src/content/generated/cards/fixture-build.json'

const inProduction = `---
id: fixture-engine
kind: in-production
title: A fixture lever
status: draft
---

What the lever does, in a few words.

## vLLM

- The CPU's work for one step takes {{claim:sample.world.host-step-us}} in the sample world.

## SGLang

- A decode step takes {{claim:sample.world.decode-step-ms}} there.
`

const buildThis = `---
id: fixture-build
kind: build-this
title: A manager of pages
lab: hybrid-kv
stages: [s1, s2]
status: draft
---

You write the manager, and the lab checks it.
`

const brokenIn = (edit: Edit) => compile({ [IN]: typeof edit === 'string' ? edit : edit === null ? inProduction : edit(inProduction) })
const brokenBuild = (edit: Edit) => compile({ [BUILD]: typeof edit === 'string' ? edit : edit === null ? buildThis : edit(buildThis) })

describe('an In-production card that follows the rules', () => {
  const result = brokenIn(null)

  test('compiles with nothing to say, to one JSON file with its intro and a part for each engine, in order', () => {
    expect(errors(result)).toEqual([])
    const json = JSON.parse(output(result, IN_JSON)) as CompiledInProduction
    expect(compiledInProductionSchema.parse(json)).toEqual(json)
    expect(json).toMatchObject({ id: 'fixture-engine', kind: 'in-production', title: 'A fixture lever', status: 'draft' })
    expect(json.engines.map((part) => part.engine)).toEqual(['vLLM', 'SGLang'])
    expect(JSON.stringify(json.engines[0].words)).toContain('{"type":"claim","id":"sample.world.host-step-us"}')
  })

  test('may speak of one engine only', () => {
    const edit = (text: string) => text.replace(/\n## SGLang[\s\S]*$/, '\n')
    const json = JSON.parse(output(brokenIn(edit), IN_JSON)) as CompiledInProduction
    expect(json.engines.map((part) => part.engine)).toEqual(['vLLM'])
  })

  test('is refused when its engines come in the wrong order, repeat, or are not an engine, on the line of the first heading', () => {
    const swapped = (text: string) => text.replace('## vLLM', '## TEMP').replace('## SGLang', '## vLLM').replace('## TEMP', '## SGLang')
    expect(where(brokenIn(swapped))).toEqual([`${IN}:${lineOf(swapped(inProduction), '## SGLang')} card-parts`])
    const other = swap('## SGLang', '## TensorRT-LLM')
    expect(where(brokenIn(other))).toEqual([`${IN}:${lineOf(inProduction, '## vLLM')} card-parts`])
    expect(where(brokenIn((text) => text.replace(/\n## vLLM[\s\S]*$/, '\n')))).toEqual([`${IN}:${lineOf(inProduction, 'status: draft') + 2} card-parts`])
  })

  test('is refused when an item cites no claim: a flag or a source line is a claim', () => {
    const edit = swap('- A decode step takes {{claim:sample.world.decode-step-ms}} there.', '- A decode step takes a while.')
    expect(where(brokenIn(edit))).toEqual([`${IN}:${lineOf(edit(inProduction), 'takes a while')} card-rule-unsourced`])
  })

  test('is refused when a part is not a list, or is empty, and when a claim does not exist', () => {
    const prose = swap('- A decode step takes {{claim:sample.world.decode-step-ms}} there.', 'A decode step takes {{claim:sample.world.decode-step-ms}} there.')
    expect(where(brokenIn(prose))).toEqual([`${IN}:${lineOf(inProduction, '## SGLang')} card-rules`])
    expect(where(brokenIn(swap('- A decode step takes {{claim:sample.world.decode-step-ms}} there.\n', '')))).toContain(`${IN}:${lineOf(inProduction, '## SGLang')} card-empty-part`)
    expect(errors(brokenIn(swap('sample.world.decode-step-ms', 'sample.world.nothing-like-it'))).map((d) => d.code)).toContain('unknown-claim')
  })

  test('is held to its file name and to the number gate in its title', () => {
    expect(where(brokenIn(swap('id: fixture-engine', 'id: other')))).toEqual([`${IN}:${lineOf(inProduction, 'id: fixture-engine')} id-mismatch`])
    expect(errors(brokenIn(swap('title: A fixture lever', 'title: Twelve levers, 12 of them'))).map((d) => d.code)).toEqual(['untagged-number'])
  })
})

describe('a Build-this card that follows the rules', () => {
  test('compiles to one JSON file with its front matter and its words', () => {
    const result = brokenBuild(null)
    expect(errors(result)).toEqual([])
    const json = JSON.parse(output(result, BUILD_JSON)) as CompiledBuildThis
    expect(compiledBuildThisSchema.parse(json)).toEqual(json)
    expect(json).toMatchObject({ id: 'fixture-build', kind: 'build-this', lab: 'hybrid-kv', stages: ['s1', 's2'] })
    expect(JSON.stringify(json.intro)).toContain('You write the manager')
  })

  test('is refused when its lab is not one the course has, its stages are not stages, or it has a part or no words', () => {
    expect(where(brokenBuild(swap('lab: hybrid-kv', 'lab: no-such-lab')))).toEqual([`${BUILD}:${lineOf(buildThis, 'lab: hybrid-kv')} unknown-lab`])
    expect(where(brokenBuild(swap('stages: [s1, s2]', 'stages: [one]')))).toEqual([`${BUILD}:${lineOf(buildThis, 'stages:')} schema`])
    expect(where(brokenBuild(swap('You write the manager, and the lab checks it.', '## Part\n\nWords.')))).toContain(`${BUILD}:${lineOf(buildThis.replace('You write the manager, and the lab checks it.', '## Part\n\nWords.'), '## Part')} card-parts`)
    expect(where(brokenBuild(swap('You write the manager, and the lab checks it.\n', '')))).toEqual([`${BUILD}:${lineOf(buildThis, 'stages:') + 3} card-empty-part`])
  })
})

describe('a lesson whose block names one of them', () => {
  const WARNING = 'kind: warning\ntitle: A model\nbody: The browser world is a model, and the real engine is the judge.'
  const naming = (kind: string, id: string): Edit => swap(WARNING, `kind: ${kind}\nid: ${id}`)
  const compiledLesson = (edits: Record<string, Edit>): CompiledLesson => {
    const result = compile({ [IN]: inProduction, [BUILD]: buildThis, ...edits })
    expect(errors(result)).toEqual([])
    return JSON.parse(output(result, 'src/content/generated/lessons/tr2.l0-sample.json')) as CompiledLesson
  }

  test('carries the claims the card cites, in the order the card cites them, and so numbers them with the lesson’s own', () => {
    const json = compiledLesson({ [LESSON]: naming('in-production', 'fixture-engine') })
    expect(compiledLessonSchema.parse(json)).toEqual(json)
    const block = json.blocks.find((one) => one.type === 'card' && one.kind === 'in-production')
    expect(block).toEqual({ type: 'card', kind: 'in-production', id: 'fixture-engine', cites: ['sample.world.host-step-us', 'sample.world.decode-step-ms'] })
    const build = compiledLesson({ [LESSON]: naming('build-this', 'fixture-build') }).blocks.find((one) => one.type === 'card' && one.kind === 'build-this')
    expect(build).toEqual({ type: 'card', kind: 'build-this', id: 'fixture-build', cites: [] })
  })

  test('changes its rev with what the card cites, and is refused when it names a card of another kind', () => {
    const base = compiledLesson({ [LESSON]: naming('in-production', 'fixture-engine') }).rev
    const other = compiledLesson({ [LESSON]: naming('in-production', 'fixture-engine'), [IN]: inProduction.replace('sample.world.decode-step-ms', 'sample.world.decode-step-us') }).rev
    expect(other).not.toBe(base)
    const wrong = compile({ [IN]: inProduction, [LESSON]: naming('build-this', 'fixture-engine') })
    expect(errors(wrong).map((d) => d.code)).toEqual(['card-kind'])
  })
})

describe('the repo’s own cards of the two kinds', () => {
  test('compile, and cite their claims', () => {
    const result = compile()
    expect(errors(result)).toEqual([])
    const engine = JSON.parse(output(result, 'src/content/generated/cards/in-vllm-prefix-cache.json')) as CompiledInProduction
    expect(compiledInProductionSchema.parse(engine)).toEqual(engine)
    expect(engine.engines.map((part) => part.engine)).toEqual(['vLLM', 'SGLang'])
    const build = JSON.parse(output(result, 'src/content/generated/cards/build-hybrid-kv-pool.json')) as CompiledBuildThis
    expect(compiledBuildThisSchema.parse(build)).toEqual(build)
    expect(build.lab).toBe('hybrid-kv')
  })
})
