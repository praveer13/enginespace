/*
 * A lesson of the build with the three blocks of W2-T42 in it (a trace block, "In vLLM today" and a Build-this card), for the specs that look at
 * them. No lesson of the course uses these blocks yet, and a spec must not wait for one: it serves the lesson's chunk with the blocks added.
 *
 * The compiler writes a lesson as `const <name>=JSON.parse(`<blocks>`)` in a chunk of the build, so the chunk is read, its blocks are parsed,
 * the three are put in, and the chunk is written again. The blocks name the two cards of `content/cards/` that the course holds, with the claims
 * each cites, read from the compiled cards of the tree (`src/content/generated/cards/`, which a build has written).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'

const root = path.resolve(import.meta.dirname, '../..')

/** The lesson the blocks are added to: step-loop lesson 3, whose tape is the one a trace block draws. */
export const KEPT_LESSON = { route: '/m/tr2/l3-async-scheduling-closes-the-bubble', chunk: /^tr2\.l3-async-scheduling-closes-the-bubble-[\w-]+\.js$/ }
/** The trace block's id, its seed and its task. */
export const KEPT_TRACE = { id: 'loop-off', seed: 7, task: 'gap' } as const

type Block = Record<string, unknown>

/** The claims a compiled card cites, in order of first citation. */
function citesOf(card: string): string[] {
  const text = readFileSync(path.join(root, 'src/content/generated/cards', `${card}.json`), 'utf8')
  return [...new Set([...text.matchAll(/"type":"claim","id":"([^"]+)"/g)].map((match) => match[1]))]
}

/** The blocks of the chunk and the span of the template literal that holds them, which `JSON.parse(` opens. */
function blocksOf(source: string): { blocks: Block[]; from: number; to: number } {
  const name = /(\w+) as blocks[,}]/.exec(source)?.[1]
  if (name === undefined) throw new Error('the lesson chunk exports no `blocks`')
  const open = source.indexOf(`${name}=JSON.parse(\``)
  if (open < 0) throw new Error(`the lesson chunk has no \`${name}=JSON.parse(\``)
  const from = open + `${name}=JSON.parse(\``.length
  let to = from
  while (source[to] !== '`') to += source[to] === '\\' ? 2 : 1
  // The template literal's own text is the JSON: evaluate it, as the browser does.
  const text = new Function(`return \`${source.slice(from, to)}\``)() as string
  return { blocks: JSON.parse(text) as Block[], from, to }
}

/** The chunk's text with a trace block, "In vLLM today" and a Build-this card put in: the trace and the note after the first game block, the card at the end. */
export function withKeptBlocks(source: string): string {
  const { blocks, from, to } = blocksOf(source)
  const game = blocks.findIndex((block) => block.type === 'game')
  const added: Block[] = [
    { type: 'card', kind: 'in-production', id: 'in-vllm-prefix-cache', cites: citesOf('in-vllm-prefix-cache') },
    { type: 'trace', id: KEPT_TRACE.id, seed: KEPT_TRACE.seed, tasks: [KEPT_TRACE.task] },
  ]
  const next = [...blocks.slice(0, game + 1), ...added, ...blocks.slice(game + 1), { type: 'card', kind: 'build-this', id: 'build-hybrid-kv-pool', cites: citesOf('build-hybrid-kv-pool') }]
  const literal = JSON.stringify(next).replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${')
  return source.slice(0, from) + literal + source.slice(to)
}

/** Serves the lesson's chunk from `dist` with the blocks in it, for this page. Call before the page goes to `KEPT_LESSON.route`. */
export async function serveKeptLesson(page: Page, dist: string): Promise<void> {
  const assets = path.join(dist, 'assets')
  if (!existsSync(assets)) throw new Error(`no build in ${dist}`)
  const file = readdirSync(assets).find((name) => KEPT_LESSON.chunk.test(name))
  if (file === undefined) throw new Error(`the build has no chunk for ${KEPT_LESSON.route}`)
  const patched = withKeptBlocks(readFileSync(path.join(assets, file), 'utf8'))
  await page.route(`**/assets/${file}`, (route) => route.fulfill({ body: patched, contentType: 'text/javascript' }))
}
