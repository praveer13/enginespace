/*
 * A lesson's sections (REDESIGN §2.5), derived from its compiled blocks and nothing else: no front-matter key and no block type is added.
 *
 *   Run   the game blocks before the first `##`, with the setup or primer, the guesses they answer and what sits between them. A lesson whose
 *         first game follows its first heading, or that has none, has no Run.
 *   Read  one part per `##`, from the first heading to the Test. A practice game block renders where it sits, as "Run: <level title>".
 *   Test  the file's last `##` part when it holds an `item` block or a graded game block. Every graded game block belongs here, wherever it
 *         sits in the file.
 *   Keep  generated: the KC sentences, the Build row (the lesson's `lab` blocks and its Build-this cards), the lesson record and the way on.
 *
 * The opener is read from the file's shape: A (run first) when at most 60 words of prose precede the first game, B (primer, then run) when
 * more do, C (read first) when there is no Run. The rule and the word count are the compiler's (`lessonRow` in scripts/content/build.ts),
 * so the page and the map's lessons table never disagree (tests/content/sections.test.ts holds the two together over every built lesson).
 *
 * A guess that a run answers sits in that run's guess slot when the run is in the same section or part and follows it, or when the level's
 * own opening guess asks the same quantity (packages/play/predictions/same.ts), so it is asked once; one whose run is further down stays
 * where it was written. A notional-machine card is never inlined: the page draws it as one line of its title block. An In-production card
 * ("In vLLM today") stays where it was written, so a file that sets it right after a game block has it end that run's debrief; a trace block
 * is a Run-style block and stays where it was written too.
 *
 * Pure: no DOM, no React, no clock.
 */
import type { CompiledBlock, ProseFlow, ProseInline } from '@es/schema'
import { isAnswered, planOf } from '@es/play/predictions/plan'
import { sameFor } from '@es/play/predictions/same'
import type { HeadingFlow } from './model'

export type Opener = 'A' | 'B' | 'C'

/** The most words before the first game of an opener A lesson (REDESIGN §2.5); the compiler's `OPENER_WORDS.run`. */
export const SETUP_WORDS = 60

/** One thing in a section, in file order: a stretch of a prose block, or a whole block by its place among the lesson's blocks. */
export type Piece = { readonly kind: 'prose'; readonly at: number; readonly flows: readonly ProseFlow[] } | { readonly kind: 'block'; readonly at: number }

export interface Part {
  readonly heading: HeadingFlow
  readonly pieces: readonly Piece[]
}

/** A guess that sits in a run's slot: the predict block, and whether the level's own opening guess asks the same quantity (one prompt). */
export interface Slotted {
  readonly at: number
  readonly paired: boolean
}

export interface LessonSections {
  readonly opener: Opener
  /** Words of prose before the first game: the setup (A) or the primer (B). For C, the words before the first heading. */
  readonly setupWords: number
  /** The Run, in file order, or null for an opener C lesson. Its game blocks are the opener's levels. */
  readonly run: { readonly pieces: readonly Piece[]; readonly games: readonly number[] } | null
  /** An opener C lesson's words before its first heading, which open Read. */
  readonly intro: readonly Piece[]
  readonly read: readonly Part[]
  readonly test: {
    /** The Test's own heading: the file's last part, or null when the lesson's only Test is a graded block that sits elsewhere. */
    readonly heading: HeadingFlow | null
    /** The lead-in and anything else of the last part, in file order, without its questions and graded blocks. */
    readonly pieces: readonly Piece[]
    readonly questions: readonly number[]
    readonly graded: readonly number[]
  }
  /** The guesses each game block holds in its slot, by the game block's place. */
  readonly slots: ReadonlyMap<number, readonly Slotted[]>
  /** The game block that answers each guess left where it was written, by the guess's place. */
  readonly answeredBelow: ReadonlyMap<number, number>
  /** Notional-machine cards, which the title block opens. */
  readonly cards: readonly number[]
  /** `lab` blocks, which Keep's Build row shows. */
  readonly labs: readonly number[]
  /** Build-this cards, which Keep's Build row shows beside the labs. */
  readonly builds: readonly number[]
}

/** Words a reader meets in prose, without code: the compiler's measure (`proseWords`). */
export function proseWords(flows: readonly ProseFlow[]): number {
  const inline = (nodes: readonly ProseInline[]): string =>
    nodes.map((node) => (node.type === 'text' ? node.text : node.type === 'em' || node.type === 'strong' || node.type === 'link' ? inline(node.children) : ' ')).join('')
  const count = (text: string): number => text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length
  let words = 0
  for (const flow of flows) {
    if (flow.type === 'paragraph' || flow.type === 'heading') words += count(inline(flow.children))
    else if (flow.type === 'list') words += flow.items.reduce((sum, item) => sum + proseWords(item), 0)
    else if (flow.type === 'table') words += [...flow.head, ...flow.rows.flat()].reduce((sum, cell) => sum + count(inline(cell)), 0)
  }
  return words
}

const isGraded = (block: CompiledBlock): boolean => block.type === 'game' && block.mode === 'graded'

/** The lesson's sections, from its blocks. */
export function groupSections(blocks: readonly CompiledBlock[]): LessonSections {
  // Every piece with its part: 0 before the first `##`, then 1, 2, ... A prose block breaks at each level-2 heading.
  const placed: { part: number; piece: Piece }[] = []
  const headings: HeadingFlow[] = []
  let part = 0
  let before = 0
  let firstGame = -1
  blocks.forEach((block, at) => {
    if (block.type !== 'prose') {
      if (block.type === 'game' && firstGame < 0) firstGame = at
      placed.push({ part, piece: { kind: 'block', at } })
      return
    }
    let flows: ProseFlow[] = []
    const flush = () => {
      if (flows.length > 0) placed.push({ part, piece: { kind: 'prose', at, flows } })
      flows = []
    }
    for (const flow of block.body) {
      if (flow.type === 'heading' && flow.depth === 2) {
        flush()
        part += 1
        headings.push(flow)
      } else {
        if (part === 0 && firstGame < 0) before += proseWords([flow])
        flows.push(flow)
      }
    }
    flush()
  })
  const last = part
  const partOf = new Map<number, number>()
  for (const { part: at, piece } of placed) if (piece.kind === 'block') partOf.set(piece.at, at)
  const blockAt = (piece: Piece): CompiledBlock | undefined => (piece.kind === 'block' ? blocks[piece.at] : undefined)
  const testPart = last > 0 && placed.some(({ part: at, piece }) => at === last && piece.kind === 'block' && (blocks[piece.at].type === 'item' || isGraded(blocks[piece.at])))

  // Where each guess sits: in the slot of the game block that answers it when that block follows it in the same section or part.
  const slots = new Map<number, Slotted[]>()
  const answeredBelow = new Map<number, number>()
  const slotted = new Set<number>()
  blocks.forEach((block, at) => {
    if (block.type !== 'predict' || block.reveal !== 'after-game') return
    const plan = planOf(block.id)
    if (!isAnswered(plan)) return
    const game = blocks.findIndex((candidate, place) => place > at && candidate.type === 'game' && candidate.id === plan.game && candidate.level === plan.level)
    if (game < 0) return
    const target = blocks[game]
    if (target.type !== 'game') return
    const pair = sameFor(block.id)
    const paired = pair !== undefined && pair.game === target.id && pair.level === target.level
    // A guess the level's own opening guess asks too is asked once, in that level's slot, wherever it was written (same.ts).
    if (target.mode === 'practice' && (paired || partOf.get(game) === partOf.get(at))) {
      const list = slots.get(game) ?? []
      list.push({ at, paired })
      slots.set(game, list)
      slotted.add(at)
    } else answeredBelow.set(at, game)
  })

  const cards: number[] = []
  const labs: number[] = []
  const builds: number[] = []
  const graded: number[] = []
  const keep = (piece: Piece): boolean => {
    const block = blockAt(piece)
    if (block === undefined) return true
    if (block.type === 'card' && block.kind === 'notional-machine') {
      cards.push(piece.at)
      return false
    }
    if (block.type === 'lab') {
      labs.push(piece.at)
      return false
    }
    if (block.type === 'card' && block.kind === 'build-this') {
      builds.push(piece.at)
      return false
    }
    if (isGraded(block)) {
      graded.push(piece.at)
      return false
    }
    return !slotted.has(piece.at)
  }
  const kept = placed.filter(({ piece }) => keep(piece))
  const inPart = (at: number) => kept.filter((entry) => entry.part === at).map((entry) => entry.piece)

  const opening = inPart(0)
  const games = opening.filter((piece) => blockAt(piece)?.type === 'game').map((piece) => piece.at)
  const opener: Opener = games.length === 0 ? 'C' : before <= SETUP_WORDS ? 'A' : 'B'

  const read: Part[] = []
  for (let at = 1; at <= last; at += 1) if (!(testPart && at === last)) read.push({ heading: headings[at - 1], pieces: inPart(at) })
  const testPieces = testPart ? inPart(last) : []
  const questions = testPieces.filter((piece) => blockAt(piece)?.type === 'item').map((piece) => piece.at)

  return {
    opener,
    setupWords: before,
    run: opener === 'C' ? null : { pieces: opening, games },
    intro: opener === 'C' ? opening : [],
    read,
    test: {
      heading: testPart ? headings[last - 1] : null,
      pieces: testPieces.filter((piece) => blockAt(piece)?.type !== 'item'),
      questions,
      graded,
    },
    slots,
    answeredBelow,
    cards,
    labs,
    builds,
  }
}

/** The anchor of a run on a lesson page, which the rail links to. */
export const runAnchor = (at: number): string => `run-${at}`

/** How the rail names a lesson's Test: "Test · 3 questions", or "Test · graded level" when a graded level is all it holds. */
export function testLabel(questions: number, graded: number): string {
  if (questions > 0) return `Test · ${questions} ${questions === 1 ? 'question' : 'questions'}`
  if (graded === 1) return 'Test · graded level'
  if (graded > 1) return `Test · ${graded} graded levels`
  return 'Test'
}
