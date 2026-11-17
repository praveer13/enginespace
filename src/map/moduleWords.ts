import type { CompiledBlock, ProseFlow } from '@es/schema'
import { plainText, sections } from '@/content/render/model'

/*
 * What a module page says about a module that its file does not say in one place (REDESIGN section 3.3), as pure functions: the two
 * sentences under the title, the line of size beside it, and the order of the Reference. No React, no clock.
 */

/** Splits at a full stop, a question mark or an exclamation mark that is followed by a space and a capital, a digit or a quote. */
const SENTENCE_END = /(?<=[.!?])\s+(?=[A-Z0-9"“`])/

/** The module's first two sentences: the first paragraph of its prose, which says what the module is and why it is there. */
export function twoSentences(blocks: readonly CompiledBlock[]): string {
  for (const block of blocks) {
    if (block.type !== 'prose') continue
    const first = block.body.find((flow) => flow.type !== 'heading')
    if (first === undefined || first.type !== 'paragraph') return ''
    const text = plainText(first.children).replace(/\s+/g, ' ').trim()
    return text.split(SENTENCE_END).slice(0, 2).join(' ')
  }
  return ''
}

const LANE_PHRASES = { B: 'in the browser', L: 'on a laptop', F: 'on a GPU' } as const

/** What the module needs, in words: "browser only", or "7.5 h in the browser, then 2.5 h on a GPU". */
export function needsLine(byLane: { B?: number; L?: number; F?: number } | undefined, hours: (value: number) => string): string {
  const lanes = (['B', 'L', 'F'] as const).filter((lane) => byLane?.[lane] !== undefined)
  if (lanes.length === 0) return ''
  if (lanes.length === 1) return lanes[0] === 'B' ? 'browser only' : `${LANE_PHRASES[lanes[0]].replace(/^on a /, '').replace(/^in the /, '')} only`
  return lanes.map((lane) => `${hours(byLane?.[lane] ?? 0)} h ${LANE_PHRASES[lane]}`).join(', then ')
}

/** One closed part of the Reference, in the order of the file. `titled` holds the subsections of a part that gathers several of the file's `##` sections. */
export type Part =
  | { kind: 'prose'; title: string; flows: readonly ProseFlow[]; subsections?: readonly { title: string; flows: readonly ProseFlow[] }[] }
  | { kind: 'card'; id: string }

const ENGINES = /engines/i
const CREDIT = /hours|credit/i

/**
 * The module's own words, as the Reference holds them: "About this module" (what comes before the first heading, then the sections that are
 * neither of the next two, under their own small headings), what the module says about the engines, credit and the hours, and each
 * notional-machine card. Order follows the file.
 */
export function referenceParts(blocks: readonly CompiledBlock[]): Part[] {
  const about: { title: string; flows: readonly ProseFlow[] }[] = []
  let intro: readonly ProseFlow[] = []
  const rest: Part[] = []
  for (const block of blocks) {
    if (block.type === 'prose') {
      for (const section of sections(block.body)) {
        if (section.flows.length === 0) continue
        if (section.heading === null) intro = [...intro, ...section.flows]
        else {
          const title = plainText(section.heading.children)
          if (ENGINES.test(title) || CREDIT.test(title)) rest.push({ kind: 'prose', title, flows: section.flows })
          else about.push({ title, flows: section.flows })
        }
      }
    } else if (block.type === 'card' && block.kind === 'notional-machine') rest.push({ kind: 'card', id: block.id })
  }
  const first: Part[] = intro.length === 0 && about.length === 0 ? [] : [{ kind: 'prose', title: 'About this module', flows: intro, subsections: about }]
  return [...first, ...rest]
}

/** True when the file already says its credit and its hours, so the page does not say them twice. */
export const saysHours = (parts: readonly Part[]): boolean => parts.some((part) => part.kind === 'prose' && CREDIT.test(part.title))
