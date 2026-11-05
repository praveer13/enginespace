/*
 * Shared by TR1's content tests (W1-T20): the module, its lessons and its claims as the compiler reads them, the helpers that read the
 * compiled prose (links, code spans, tables, the exit check), and the parser of the lessons' excerpts. `tr1-module.test.ts` holds the content
 * to the checks of W1-T15 and to the lifecycle model, and `tr1-sources.test.ts` holds it to the pinned trees of the engines.
 */
import path from 'node:path'
import { compiledLessonSchema, compiledModuleSchema } from '@es/schema'
import type { CompiledBlock, ProseFlow, ProseInline } from '@es/schema'
import { lockFileSchema } from '@es/schema/lock'
import { expect } from 'bun:test'
import { compileContent } from '../../scripts/content/build.ts'
import { read, repo } from './support.ts'

export const LESSON_FILES = [
  'content/modules/tr1/lessons/l1-five-mechanisms.md',
  'content/modules/tr1/lessons/l2-nano-vllm-in-one-sitting.md',
  'content/modules/tr1/lessons/l3-mini-sglang-four-processes.md',
  'content/modules/tr1/lessons/l4-inside-vllm-and-what-moved.md',
  'content/modules/tr1/lessons/l5-vllm-at-the-pin-by-symbol.md',
  'content/modules/tr1/lessons/l6-sglang-at-the-pin.md',
  'content/modules/tr1/lessons/l7-abort-inside-the-engine.md',
] as const
export const MODULE_FILE = 'content/modules/tr1/module.md'
export const CLAIMS_FILE = 'content/claims/tr1.yaml'

export const result = compileContent({ root: repo })
export const lessons = LESSON_FILES.map((file) => {
  const slug = path.basename(file, '.md')
  const out = result.outputs.find((o) => o.path === `src/content/generated/lessons/tr1.${slug}.json`)
  if (out === undefined) throw new Error(`the compiler wrote no lesson for ${file}`)
  return { file, slug, text: read(file), lesson: compiledLessonSchema.parse(JSON.parse(out.text)) }
})
const moduleOut = result.outputs.find((o) => o.path === 'src/content/generated/modules/tr1.json')
if (moduleOut === undefined) throw new Error('the compiler wrote no module for tr1')
export const module_ = compiledModuleSchema.parse(JSON.parse(moduleOut.text))
export const moduleText = read(MODULE_FILE)
export const lock = lockFileSchema.parse(JSON.parse(read('course.lock.json')))
export const pin = (key: string) => {
  const found = lock.entries.find((e) => e.key === key)
  if (found === undefined) throw new Error(`course.lock.json has no ${key}`)
  return found
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Reading the compiled prose                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

export function inlineText(nodes: readonly ProseInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'code':
          return node.text
        case 'em':
        case 'strong':
        case 'link':
          return inlineText(node.children)
        case 'claim':
          return `{{claim:${node.id}}}`
        case 'ks':
          return `{{${node.ref}}}`
        case 'tag':
          return `[${node.tag}]`
      }
    })
    .join('')
}

/** The code spans of some inline nodes, with whether each sits inside a link. */
export function codeSpans(nodes: readonly ProseInline[], linked = false): { text: string; linked: boolean }[] {
  return nodes.flatMap((node) => {
    switch (node.type) {
      case 'code':
        return [{ text: node.text, linked }]
      case 'em':
      case 'strong':
        return codeSpans(node.children, linked)
      case 'link':
        return codeSpans(node.children, true)
      default:
        return []
    }
  })
}

/** Every link in some inline nodes. */
export function linksIn(nodes: readonly ProseInline[]): { href: string; text: string }[] {
  return nodes.flatMap((node) => {
    switch (node.type) {
      case 'link':
        return [{ href: node.href, text: inlineText(node.children) }, ...linksIn(node.children)]
      case 'em':
      case 'strong':
        return linksIn(node.children)
      default:
        return []
    }
  })
}

/** The inline nodes of a flow node, for the kinds that hold a line of prose. */
export function flowInlines(flow: ProseFlow): ProseInline[] {
  switch (flow.type) {
    case 'paragraph':
    case 'heading':
      return flow.children
    case 'list':
      return flow.items.flat().flatMap(flowInlines)
    case 'table':
      return [...flow.head.flat(), ...flow.rows.flat(2)]
    case 'code':
      return []
  }
}

/** Every flow node of a lesson's prose, in order, lists unpacked. */
export function proseFlows(blocks: readonly CompiledBlock[]): ProseFlow[] {
  const out: ProseFlow[] = []
  const add = (flow: ProseFlow) => {
    out.push(flow)
    if (flow.type === 'list') for (const item of flow.items) for (const inner of item) add(inner)
  }
  for (const block of blocks) if (block.type === 'prose') for (const flow of block.body) add(flow)
  return out
}

/** The blocks of a lesson from its `## Exit check` heading to the end: the prose after the heading, then every block that follows. */
export function exitCheck(blocks: readonly CompiledBlock[]): { prose: ProseFlow[]; blocks: CompiledBlock[] } | null {
  for (let at = 0; at < blocks.length; at++) {
    const block = blocks[at]
    if (block.type !== 'prose') continue
    const heading = block.body.findIndex((flow) => flow.type === 'heading' && flow.depth === 2 && inlineText(flow.children) === 'Exit check')
    if (heading < 0) continue
    return { prose: block.body.slice(heading + 1), blocks: blocks.slice(at + 1) }
  }
  return null
}

export const lessonOf = (id: string) => {
  const found = lessons.find((l) => l.lesson.id === id)
  if (found === undefined) throw new Error(`no lesson ${id}`)
  return found
}

/** A table of a lesson by its head, as rows of cells (a cell is its inline nodes). */
export function tableWithHead(lessonId: string, head: readonly string[]): ProseInline[][][] {
  for (const flow of proseFlows(lessonOf(lessonId).lesson.blocks)) {
    if (flow.type !== 'table') continue
    if (flow.head.map((cell) => inlineText(cell).trim()).join('|') === head.join('|')) return flow.rows
  }
  throw new Error(`${lessonId} has no table headed ${head.join(' | ')}`)
}

/** Fails with the lesson and the line that went stale, where `expect(text).toContain` would print the whole lesson. */
export function mentions(lessonId: string, what: string, line: string): void {
  const text = lessonOf(lessonId).text.replace(/\s+/g, ' ')
  expect([lessonId, what, text.includes(line) ? line : `(missing) ${line}`]).toEqual([lessonId, what, line])
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The excerpts                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The first line of an excerpt: the file, the lines and the pin that it was cut from. */
export const HEADER = /^# (\S+), lines? (\d+)(?: to (\d+))? at (\S+)$/

export interface Excerpt {
  /** The 1-based line of the Markdown where the fence opens. */
  readonly at: number
  readonly file: string
  readonly first: number
  readonly last: number
  /** The pin as the header writes it: a short commit or a tag. */
  readonly pin: string
  /** The last non-blank line before the fence. */
  readonly before: string
  /** The lines between the header and the closing fence. */
  readonly body: readonly string[]
}

/** The excerpts of a lesson's Markdown: each Python block that has a header. */
export function excerptsOf(text: string): Excerpt[] {
  const lines = text.split('\n')
  const out: Excerpt[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('```python')) continue
    let j = i + 1
    while (!lines[j].startsWith('```')) j++
    const m = HEADER.exec(lines[i + 1])
    if (m !== null) {
      let k = i - 1
      while (k >= 0 && lines[k].trim() === '') k--
      out.push({ at: i + 1, file: m[1], first: Number(m[2]), last: Number(m[3] ?? m[2]), pin: m[4], before: lines[k], body: lines.slice(i + 2, j) })
    }
    i = j
  }
  return out
}

/** The repository and the full ref that each pin of the headers names. */
export const PIN_OF: Readonly<Record<string, { repo: string; ref: string }>> = {
  [pin('nano-vllm').commit?.slice(0, 7) ?? '']: { repo: 'GeeeekExplorer/nano-vllm', ref: pin('nano-vllm').commit ?? '' },
  [pin('mini-sglang').commit?.slice(0, 7) ?? '']: { repo: 'sgl-project/mini-sglang', ref: pin('mini-sglang').commit ?? '' },
  [pin('inside-vllm').commit?.slice(0, 7) ?? '']: { repo: 'vllm-project/vllm', ref: pin('inside-vllm').commit ?? '' },
  [`v${pin('vllm').version}`]: { repo: 'vllm-project/vllm', ref: `v${pin('vllm').version}` },
  [`v${pin('sglang').version}`]: { repo: 'sgl-project/sglang', ref: `v${pin('sglang').version}` },
}
