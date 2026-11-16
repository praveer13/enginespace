/*
 * R-T12, principle P4 of REDESIGN §2.1 (name, then ask): every term of src/copy/terms.ts that an opener level's goal line, prompts and
 * stage list use is in that level's parts list or in the lesson's setup or primer. A learner meets a word in the parts list or in the
 * lesson's own few words before the run, and never for the first time in a control.
 *
 * It checks words, not whether the level can be solved. The levels it holds are the openers of the table (tests/content/openers-table.ts): the
 * levels of an A or B row. A game that has no parts table yet is marked as waiting on the task that gives it one (`test.todo`, which runs
 * nothing), and that task replaces the mark with a table: R-T31 for the broken benchmark. The pool's, the step loop's (R-T28: the demo
 * levels' and the full levels'), the rejection sampler's and the request path's (R-T29) parts lists exist, and every level of an A or B row of
 * those games passes.
 */
import { describe, expect, test } from 'bun:test'
import { compiledLessonSchema } from '@es/schema'
import type { CompiledLesson, ProseFlow, ProseInline } from '@es/schema'
import { FLOOR_COPY, FLOOR_QUESTION, floorPartsOf } from '@es/play/engine-floor/copy'
import type { FloorLevelId } from '@es/play/engine-floor/types'
import { LOOP_COPY } from '@es/play/loop/copy'
import { FULL_COPY } from '@es/play/loop/full/copy'
import { fullPartsOf } from '@es/play/loop/full/parts'
import { loopPartsOf } from '@es/play/loop/parts'
import type { LoopLevelId } from '@es/play/loop/types'
import type { FullLevelId } from '@es/play/loop/full/types'
import { POOL_COPY, partsOf } from '@es/play/pool/copy'
import type { PoolLevelId } from '@es/play/pool/types'
import { ASK_WORDS, VERIFIER_COPY, partsOf as samplerPartsOf } from '@es/play/verifier/copy'
import type { VerifierLevelId } from '@es/play/verifier/types'
import { TERMS } from '@/copy/terms'
import { compileContent } from '../../scripts/content/build.ts'
import { OPENERS } from './openers-table.ts'
import { repo, todo } from './support.ts'

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Whether `text` uses `term`: the whole word or words, in any case, with an ending (`evict`, `evicted`, `KV pages`). */
export const mentions = (text: string, term: string): boolean => new RegExp(`(?<![\\p{L}\\p{N}])${escape(term)}(?:s|es|d|ed|ing)?(?![\\p{L}\\p{N}])`, 'iu').test(text)

/** The terms of the table that `levelText` uses and that neither `partsText` nor `setupText` carries. */
export function missingTerms(levelText: string, partsText: string, setupText: string): string[] {
  return TERMS.map((entry) => entry.term).filter((term) => mentions(levelText, term) && !mentions(partsText, term) && !mentions(setupText, term))
}

const inline = (nodes: readonly ProseInline[]): string =>
  nodes.map((node) => (node.type === 'text' ? node.text : node.type === 'em' || node.type === 'strong' || node.type === 'link' ? inline(node.children) : node.type === 'code' ? node.text : ' ')).join('')
const flowText = (flows: readonly ProseFlow[]): string =>
  flows
    .map((flow) => {
      if (flow.type === 'paragraph' || flow.type === 'heading') return inline(flow.children)
      if (flow.type === 'list') return flow.items.map(flowText).join(' ')
      if (flow.type === 'table') return [...flow.head, ...flow.rows.flat()].map(inline).join(' ')
      return ''
    })
    .join(' ')

/** The lesson's setup or primer: the prose before its first game block. */
function setupOf(lesson: CompiledLesson): string {
  const at = lesson.blocks.findIndex((block) => block.type === 'game')
  const before = at < 0 ? lesson.blocks : lesson.blocks.slice(0, at)
  return before.map((block) => (block.type === 'prose' ? flowText(block.body) : '')).join(' ')
}

const isFull = (level: string): boolean => level in FULL_COPY

/** What each game has as a parts table: the words of a level's parts list, or undefined while the game has none. */
const PARTS: Record<string, { at: (level: string) => string; waiting?: string }> = {
  pool: { at: (level) => partsOf(level as PoolLevelId).map((part) => `${part.name} ${part.sentence} ${part.engine ?? ''}`).join(' ') },
  loop: {
    at: (level) =>
      (isFull(level) ? fullPartsOf(level as FullLevelId) : loopPartsOf(level as LoopLevelId)).map((part) => `${part.name} ${part.sentence} ${part.engine ?? ''}`).join(' '),
  },
  'engine-floor': { at: (level) => floorPartsOf(level as FloorLevelId).map((part) => `${part.name} ${part.sentence}`).join(' ') },
  verifier: { at: (level) => samplerPartsOf(level as VerifierLevelId).map((part) => `${part.name} ${part.sentence} ${part.engine ?? ''}`).join(' ') },
  'broken-bench': { at: () => '', waiting: 'R-T31' },
}

/** The words of a level that the learner reads before and during a run: its goal line, its prompt and the question it asks first. */
const LEVEL_WORDS: Record<string, (level: string) => string> = {
  loop: (level) => {
    if (!isFull(level)) {
      const copy = LOOP_COPY[level as LoopLevelId]
      return [copy.goal.aim, copy.goal.controls, copy.goal.beat, copy.prompt].join(' ')
    }
    // A full level asks the stage's prediction first: its goal line, its prompt, and the question, for every stage.
    const copy = FULL_COPY[level as FullLevelId]
    const stages = Object.values(copy.stages).flatMap((stage) => [stage.goal.aim, stage.goal.controls, stage.goal.beat, 'question' in stage.prediction ? stage.prediction.question : ''])
    return [copy.goal.aim, copy.goal.controls, copy.goal.beat, copy.prompt, ...stages].join(' ')
  },
  pool: (level) => {
    const copy = POOL_COPY[level as PoolLevelId]
    return [copy.goal.aim, copy.goal.controls, copy.prompt, copy.predict.ask].join(' ')
  },
  verifier: (level) => {
    const copy = VERIFIER_COPY[level as VerifierLevelId]
    return [copy.goal.aim, copy.goal.controls, copy.prompt, ASK_WORDS[level as VerifierLevelId]].join(' ')
  },
  'engine-floor': (level) => {
    const copy = FLOOR_COPY[level as FloorLevelId]
    return [copy.goal.aim, copy.goal.controls, copy.prompt, FLOOR_QUESTION].join(' ')
  },
}

const compiled = compileContent({ root: repo })
const lessons = new Map<string, CompiledLesson>(
  compiled.outputs
    .filter((output) => output.path.startsWith('src/content/generated/lessons/'))
    .map((output) => compiledLessonSchema.parse(JSON.parse(output.text)))
    .map((lesson) => [lesson.id, lesson]),
)

describe('the rule of P4: an opener level uses only terms its parts list or its lesson has named', () => {
  test('a fixture lesson whose primer leaves out a term its level uses fails, and passes once the primer names it', () => {
    const level = 'Admit a request, and a request whose prompt begins like an earlier one has a prefix hit.'
    const parts = 'Waiting queue. Requests not yet admitted. A request is one prompt.'
    expect(missingTerms(level, parts, 'A short primer that says nothing of the hit.')).toEqual(['prefix hit'])
    expect(missingTerms(level, parts, 'A prefix hit is leading tokens whose KV is already cached.')).toEqual([])
    expect(missingTerms(level, `${parts} Prefix hits skip prefill.`, '')).toEqual([])
  })

  test('the term table has the words the pool uses', () => {
    expect(TERMS.some((entry) => entry.term === 'KV page pool')).toBe(true)
    expect(mentions('Evicted pages return to the free queue.', 'evict')).toBe(true)
    expect(mentions('The cost of preemption', 'preempt')).toBe(false)
  })

  for (const row of OPENERS.filter((one) => one.opener !== 'C')) {
    for (const ref of row.first ?? []) {
      const [, game, level] = /^play:([^/]+)\/(.+)$/.exec(ref) ?? []
      const parts = PARTS[game]
      const label = `${row.lesson} opens on ${game}/${level}`
      if (parts === undefined || parts.waiting !== undefined) {
        todo(`${label}: waiting on ${parts?.waiting ?? 'a parts table'}, which gives ${game} its parts list`)
        continue
      }
      const check = () => {
        const lesson = lessons.get(row.lesson)
        if (lesson === undefined) throw new Error(`${row.lesson} is not built`)
        expect({ ref, missing: missingTerms(LEVEL_WORDS[game](level), parts.at(level), setupOf(lesson)) }).toEqual({ ref, missing: [] })
      }
      test(label, check)
    }
  }
})
