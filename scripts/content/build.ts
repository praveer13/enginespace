/*
 * The content compiler (ARCHITECTURE §4, D-016, W0-T08): `content/` in; `src/content/generated/`, `public/md/`,
 * `public/llms.txt` and `public/claims.json` out.
 *
 *   bun scripts/content/build.ts [--root <dir>]     compile, and write the outputs unless something failed
 *
 * `compileContent` is the whole compiler as a function of a directory, and it writes nothing. The Vite plugin runs it in
 * development and during `vite build`, this script runs it in CI, and the three gates (`verify:content`, `verify:claims`
 * and `verify:numbers`) run it and print the diagnostics that belong to each.
 *
 * What it reads:
 *   content/course.yaml           the modules in order, with their titles and hours
 *   content/modules/<id>/module.md and lessons/*.md
 *   content/claims/**.yaml        the dated, sourced facts
 *   content/kc/graph.yaml         the KCs: the ids that lessons and predictions name, and what the map shows (optional until W1-T03)
 *   content/cards/*.md            the notional-machine cards that blocks and modules name (A§5.9)
 *   course.lock.json              the pins that modules and claims name (optional until W1-T01)
 *
 * What it writes:
 *   src/content/generated/index.json              the course index, in the entry's closure (6 KB gz [estimated])
 *   src/content/generated/map.json                what the map and the module pages read: prerequisites, artifacts, KCs and refs
 *   src/content/generated/modules/<id>.json       one per written module
 *   src/content/generated/lessons/<id>.<slug>.json  one per lesson (40 KB gz each [estimated])
 *   src/content/generated/cards/<id>.json         one per card (40 KB gz each [estimated])
 *   public/md/<module>/<slug>.md, index.md and public/llms.txt   the learner's agent's export
 *   public/claims.json                            every claim, for the chips and the about page
 *
 * A source problem is a `Diagnostic` with a file and a line. Any error means no output is written.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { claimSchema } from '../../packages/schema/claims.ts'
import type { Claim } from '../../packages/schema/claims.ts'
import {
  claimsOutputSchema,
  compiledCardSchema,
  compiledLessonSchema,
  compiledModuleSchema,
  contentIndexSchema,
  courseMapSchema,
  lessonRoute,
  moduleRoute,
} from '../../packages/schema/compiled.ts'
import type { CompiledBlock, ContentIndex, CourseMap, IndexLesson, IndexModule } from '../../packages/schema/compiled.ts'
import { lessonFrontMatterSchema, moduleFrontMatterSchema } from '../../packages/schema/content.ts'
import type { LessonFrontMatter, ModuleFrontMatter } from '../../packages/schema/content.ts'
import { courseSchema } from '../../packages/schema/course.ts'
import type { Course } from '../../packages/schema/course.ts'
import { kcGraphSchema } from '../../packages/schema/kc.ts'
import type { Kc } from '../../packages/schema/kc.ts'
import { kcIdSchema, moduleOfKc } from '../../packages/schema/refs.ts'
import { compileCard } from './cards.ts'
import type { CardResult } from './cards.ts'
import { blockLinks, blockMarkdown, blockMinutes, compileDirective, GAME_IDS, LAB_IDS, textFields, unknownGame, unknownKcs, unknownLab } from './directives.ts'
import type { DirectiveBlock, LinkEnv, LinkProblem } from './directives.ts'
import { formatDiagnostic, isRecord, loadYaml, locate, parseContentFile, problem, schemaDiagnostics } from './parse.ts'
import type { ContentFile, Diagnostic, Gate } from './parse.ts'
import { compileProse, numberMessage, untaggedNumbers, WORDS_PER_MINUTE, withoutCode } from './prose.ts'
import type { ProseContext } from './prose.ts'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Shapes                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The size caps of A§4.6 and A§11.1, in gzipped bytes [estimated]. */
export const BUDGETS = { index: 6 * 1024, page: 40 * 1024, map: 12 * 1024 } as const

/** A lesson whose own reading time is further than this from its declared minutes earns a warning (A§4.2) [estimated]. */
export const MINUTES_TOLERANCE = 0.2

export interface Output {
  /** Relative to the repository root, written with slashes. */
  path: string
  text: string
}

export interface ClaimRecord {
  claim: Claim
  file: string
  /** The line of the claim's first key. */
  line: number
}

export interface CompileResult {
  diagnostics: Diagnostic[]
  /** Complete only when `diagnostics` holds no error. */
  outputs: Output[]
  claims: ClaimRecord[]
  /** The keys of `course.lock.json`, or null when the file does not exist. */
  lockKeys: ReadonlySet<string> | null
  /** The ids of the cards that compiled (a card with a problem of its own is left out), which `verify:games` holds a game's card to. */
  cards: ReadonlySet<string>
  stats: { modules: number; lessons: number; claims: number }
}

const hasError = (diagnostics: readonly Diagnostic[]) => diagnostics.some((d) => d.severity === 'error')

/** JSON with its keys sorted and nothing between tokens: the same value is always the same bytes, which a hash needs. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .filter(([, inner]) => inner !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonicalJson(inner)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')
const gzipped = (text: string): number => gzipSync(Buffer.from(text), { level: 9 }).length
const json = (value: unknown): string => `${JSON.stringify(value)}\n`

/* ------------------------------------------------------------------------------------------------------------------ */
/* Reading the sources                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The files under a directory that `accept` takes, sorted, as absolute paths. A missing directory holds none. */
function walk(dir: string, accept: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return []
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...walk(full, accept))
    else if (accept(entry.name)) found.push(full)
  }
  return found
}

const slash = (file: string): string => file.split(path.sep).join('/')
const rel = (root: string, absolute: string): string => slash(path.relative(root, absolute))

function loadCourse(root: string, out: Diagnostic[]): Course | null {
  const file = 'content/course.yaml'
  const abs = path.join(root, file)
  if (!existsSync(abs)) {
    out.push(problem('content', 'error', 'missing-file', file, 1, 'content/course.yaml lists the course\'s modules in order, with their hours (ARCHITECTURE §2.2)'))
    return null
  }
  const text = readFileSync(abs, 'utf8')
  const loaded = loadYaml(text, file, 1, 'content', out)
  if (!loaded.ok) return null
  const parsed = courseSchema.safeParse(loaded.value)
  if (!parsed.success) {
    out.push(...schemaDiagnostics(parsed.error.issues, { file, text, firstLine: 1, gate: 'content', subject: 'course.yaml' }))
    return null
  }
  return parsed.data
}

function loadClaims(root: string, out: Diagnostic[]): Map<string, ClaimRecord> {
  const claims = new Map<string, ClaimRecord>()
  for (const abs of walk(path.join(root, 'content/claims'), (name) => /\.ya?ml$/.test(name))) {
    const file = rel(root, abs)
    const text = readFileSync(abs, 'utf8')
    const loaded = loadYaml(text, file, 1, 'claims', out)
    if (!loaded.ok) continue
    if (!Array.isArray(loaded.value)) {
      out.push(problem('claims', 'error', 'schema', file, 1, 'a claims file is a list of claims, each starting with "- id:"'))
      continue
    }
    const lines = text.split('\n')
    loaded.value.forEach((entry: unknown, index) => {
      const line = 1 + locate(lines, [index])
      const parsed = claimSchema.safeParse(entry)
      if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => ({ ...issue, path: [index, ...issue.path] }))
        out.push(...schemaDiagnostics(issues, { file, text, firstLine: 1, gate: 'claims', subject: 'a claim' }))
        return
      }
      const earlier = claims.get(parsed.data.id)
      if (earlier !== undefined) {
        out.push(problem('claims', 'error', 'duplicate-claim', file, line, `claim "${parsed.data.id}" is also defined at ${earlier.file}:${earlier.line}`))
        return
      }
      claims.set(parsed.data.id, { claim: parsed.data, file, line })
    })
  }
  return claims
}

/** The KC ids that lessons name, which are read even from a graph that fails its schema, and the graph itself once it passes. */
function loadKcs(root: string, out: Diagnostic[]): { ids: Set<string>; graph: Kc[] } {
  const file = 'content/kc/graph.yaml'
  const abs = path.join(root, file)
  const ids = new Set<string>()
  if (!existsSync(abs)) return { ids, graph: [] }
  const text = readFileSync(abs, 'utf8')
  const loaded = loadYaml(text, file, 1, 'content', out)
  if (!loaded.ok) return { ids, graph: [] }
  const parsed = kcGraphSchema.safeParse(loaded.value)
  if (!parsed.success) out.push(...schemaDiagnostics(parsed.error.issues, { file, text, firstLine: 1, gate: 'content', subject: 'a KC' }))
  if (Array.isArray(loaded.value)) {
    for (const entry of loaded.value) {
      if (isRecord(entry) && kcIdSchema.safeParse(entry.id).success) ids.add(entry.id as string)
    }
  }
  return { ids, graph: parsed.success ? parsed.data : [] }
}

function loadLockKeys(root: string): Set<string> | null {
  const abs = path.join(root, 'course.lock.json')
  if (!existsSync(abs)) return null
  const keys = new Set<string>()
  try {
    const lock: unknown = JSON.parse(readFileSync(abs, 'utf8'))
    const entries = isRecord(lock) && Array.isArray(lock.entries) ? lock.entries : []
    for (const entry of entries) if (isRecord(entry) && typeof entry.key === 'string') keys.add(entry.key)
  } catch {
    // verify:pins reports a malformed lockfile. Here it holds no key, so a pin that names one is reported.
  }
  return keys
}

interface Cards {
  /** The file name of every card, without `.md`: what a block or a module may name. */
  stems: Set<string>
  /** The cards that compiled, by id. */
  compiled: Map<string, CardResult>
}

/** Compiles `content/cards/*.md`. A `README.md` there is not a card. */
function loadCards(root: string, claimIds: ReadonlySet<string>, out: Diagnostic[]): Cards {
  const cards: Cards = { stems: new Set(), compiled: new Map() }
  for (const abs of walk(path.join(root, 'content/cards'), (name) => name.endsWith('.md') && !/^readme\.md$/i.test(name))) {
    const file = rel(root, abs)
    cards.stems.add(path.basename(abs, '.md'))
    const card = compileCard(file, readFileSync(abs, 'utf8'), claimIds, out)
    if (card !== null) cards.compiled.set(card.front.id, card)
  }
  return cards
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Compiling a module and its lessons                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Sources {
  root: string
  course: Course | null
  /** The KC graph, or an empty list while content/kc/graph.yaml is absent or fails its schema (which is reported). */
  kcGraph: readonly Kc[]
  claims: ReadonlyMap<string, ClaimRecord>
  claimIds: ReadonlySet<string>
  lockKeys: ReadonlySet<string> | null
  links: LinkEnv
}

/** A source file after its body is compiled. */
interface Body {
  file: ContentFile
  blocks: CompiledBlock[]
  directives: DirectiveBlock[]
  /** The file as the export reads it, in order. */
  parts: ({ kind: 'prose'; md: string } | { kind: 'block'; block: DirectiveBlock })[]
  cited: Set<string>
  /** How many directives failed to compile. The checks that compare a lesson with its blocks wait until they are mended. */
  skipped: number
  /** [estimated] minutes: the words read at WORDS_PER_MINUTE, plus what each block adds. */
  readingMinutes: number
}

/** Keys the compiler writes itself, which an author must not: the message says where each one comes from. */
const COMPILER_KEYS = {
  rev: 'the compiler adds rev, a SHA-256 over the authored fields and the claims the page cites',
  slug: 'the slug is the file name',
  readingMinutes: 'the compiler works out the reading time',
} as const

/** The first line of a front matter key's value. */
const frontLine = (file: ContentFile, path: (string | number)[]): number => file.frontMatterLine + locate(file.frontMatterText.split('\n'), path)

/** The number gate, for a plain string of the front matter. */
function frontNumbers(file: ContentFile, path: (string | number)[], text: string, out: Diagnostic[]): void {
  for (const finding of untaggedNumbers(withoutCode(text))) out.push(problem('numbers', 'error', 'untagged-number', file.file, frontLine(file, path), numberMessage(finding)))
}

function linkDiagnostics(problems: readonly LinkProblem[], file: string, yaml: string, firstLine: number, out: Diagnostic[]): void {
  const lines = yaml.split('\n')
  for (const found of problems) out.push(problem('content', 'error', found.code, file, firstLine + locate(lines, found.path), found.message))
}

/** Compiles the segments of a file, in order: the prose through marked, the directives through their schemas, and the links. */
function compileBody(file: ContentFile, sources: Sources, lessonId: string | undefined, out: Diagnostic[]): Body {
  const cited = new Set<string>()
  const ctx: ProseContext = { file: file.file, claims: sources.claimIds, cited, outline: { depth: 1 }, words: { count: 0 }, out }
  const body: Body = { file, blocks: [], directives: [], parts: [], cited, skipped: 0, readingMinutes: 0 }
  const predictIds = new Set<string>()
  let minutes = 0

  for (const segment of file.segments) {
    if (segment.kind === 'prose') {
      const flow = compileProse(segment.md, segment.line, ctx)
      if (flow.length > 0) {
        body.blocks.push({ type: 'prose', body: flow })
        body.parts.push({ kind: 'prose', md: segment.md })
      }
      continue
    }

    const block = compileDirective(segment, file.file, out)
    if (block === null) {
      body.skipped += 1
      continue
    }
    const at = (problems: readonly LinkProblem[]) => linkDiagnostics(problems, file.file, segment.yaml, segment.bodyLine, out)
    at(blockLinks(block, sources.links))

    if (block.type === 'predict' && lessonId !== undefined) {
      const owner = block.id.slice(0, block.id.lastIndexOf('.'))
      if (owner !== lessonId) at([{ code: 'id-mismatch', path: ['id'], message: `the prediction "${block.id}" belongs to lesson ${owner}, not to ${lessonId}` }])
      if (predictIds.has(block.id)) at([{ code: 'duplicate-id', path: ['id'], message: `the prediction "${block.id}" appears twice in this lesson` }])
      predictIds.add(block.id)
    }

    const yamlLines = segment.yaml.split('\n')
    for (const field of textFields(block)) {
      const line = segment.bodyLine + locate(yamlLines, field.path)
      if (/\{\{|\}\}/.test(field.text)) out.push(problem('content', 'error', 'bad-ref', file.file, line, 'a reference such as {{claim:id}} works in prose only: this field is plain text'))
      for (const finding of untaggedNumbers(withoutCode(field.text))) out.push(problem('numbers', 'error', 'untagged-number', file.file, line, numberMessage(finding)))
    }

    body.blocks.push(block)
    body.directives.push(block)
    body.parts.push({ kind: 'block', block })
    minutes += blockMinutes(block)
  }

  body.readingMinutes = Math.round((ctx.words.count / WORDS_PER_MINUTE + minutes) * 10) / 10
  return body
}

/** The claims a rev depends on, as the learner reads them: what a claim says, not when someone last checked it. */
function citedClaims(cited: ReadonlySet<string>, sources: Sources): Record<string, unknown>[] {
  return [...cited]
    .sort()
    .flatMap((id) => {
      const claim = sources.claims.get(id)?.claim
      return claim === undefined ? [] : [{ id, value: claim.value, unit: claim.unit, text: claim.text, tag: claim.tag }]
    })
}

/**
 * A SHA-256 over the authored fields, the compiled blocks and the claims that the page cites (A§4.2). It reads the token
 * tree and not the Markdown, so a rewrap of the source changes nothing. `status` and `minutes` stay out: they record where the
 * page stands and how long it is thought to take, and neither changes what a learner was asked, so neither should turn
 * evidence into "re-check".
 */
function revOf(front: object, blocks: readonly CompiledBlock[], cited: ReadonlySet<string>, sources: Sources): string {
  const authored: Record<string, unknown> = { ...front }
  delete authored.status
  delete authored.minutes
  return sha256(canonicalJson({ front: authored, blocks, claims: citedClaims(cited, sources) }))
}

/** A card's `rev`, as a lesson's is: the authored fields, the words and the claims it cites. `status` stays out, as it does for a lesson. */
function revOfCard(card: CardResult, sources: Sources): string {
  const authored: Record<string, unknown> = { ...card.front }
  delete authored.status
  return sha256(canonicalJson({ front: authored, words: card.words, claims: citedClaims(card.cited, sources) }))
}

const orderOf = (slug: string): number => Number.parseInt(/^l(\d+)/.exec(slug)?.[1] ?? '0', 10)

interface LessonResult {
  slug: string
  front: LessonFrontMatter
  body: Body
  rev: string
}

function compileLesson(abs: string, moduleId: string, sources: Sources, out: Diagnostic[]): LessonResult | null {
  const file = rel(sources.root, abs)
  const slug = path.basename(abs, '.md')
  if (!/^l[0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    out.push(problem('content', 'error', 'bad-file-name', file, 1, `a lesson file is named like l3-async-overlap.md: l, the lesson's number, then words joined by hyphens`))
    return null
  }
  const parsedFile = parseContentFile(file, readFileSync(abs, 'utf8'), out)
  if (parsedFile === null) return null

  const lessonId = `${moduleId}.${/^l\d+/.exec(slug)?.[0]}`
  let front: LessonFrontMatter | undefined
  if (parsedFile.frontMatter !== undefined) {
    const parsed = lessonFrontMatterSchema.safeParse(parsedFile.frontMatter)
    if (parsed.success) front = parsed.data
    else {
      out.push(
        ...schemaDiagnostics(parsed.error.issues, {
          file,
          text: parsedFile.frontMatterText,
          firstLine: parsedFile.frontMatterLine,
          gate: 'content',
          subject: 'a lesson',
          allowedKeys: Object.keys(lessonFrontMatterSchema.shape),
          hints: COMPILER_KEYS,
        }),
      )
    }
  }

  // The file's name fixes the lesson's id, so a prediction is held to that and not to a front matter id that is wrong.
  const body = compileBody(parsedFile, sources, lessonId, out)
  if (front === undefined) return null

  if (front.module !== moduleId) out.push(problem('content', 'error', 'id-mismatch', file, frontLine(parsedFile, ['module']), `the file is in modules/${moduleId}, and its module says "${front.module}"`))
  if (front.id !== lessonId) out.push(problem('content', 'error', 'id-mismatch', file, frontLine(parsedFile, ['id']), `the file ${slug}.md is lesson ${lessonId}, and its id says "${front.id}"`))

  const at = (problems: readonly LinkProblem[], key: string) => {
    for (const found of problems) out.push(problem('content', 'error', found.code, file, frontLine(parsedFile, [key, ...found.path.slice(1)]), found.message))
  }
  at(unknownKcs(front.kcs, sources.links, ['kcs']), 'kcs')
  for (const [key, ids, check] of [
    ['games', front.games, unknownGame],
    ['labs', front.labs, unknownLab],
  ] as const) {
    ids?.forEach((id, index) => at(check(id, sources.links, [key, index]), key))
  }

  // A lesson's kcs, games and labs agree with its blocks. A block that failed to compile has no say until it is mended.
  const taught = new Set(front.kcs)
  for (const block of body.skipped > 0 ? [] : body.directives) {
    if (block.type !== 'predict') continue
    for (const kc of block.kcs.filter((name) => !taught.has(name))) {
      out.push(problem('content', 'error', 'kc-mismatch', file, frontLine(parsedFile, ['kcs']), `the prediction "${block.id}" tests ${kc}, which the lesson's kcs do not list`))
    }
  }
  for (const [key, listed, used] of [
    ['games', front.games, body.directives.flatMap((block) => (block.type === 'game' ? [block.id] : []))],
    ['labs', front.labs, body.directives.flatMap((block) => (block.type === 'lab' ? [block.id] : []))],
  ] as const) {
    if (listed === undefined || body.skipped > 0) continue
    const missing = used.filter((id) => !listed.includes(id))
    const extra = listed.filter((id) => !used.includes(id))
    if (missing.length > 0) out.push(problem('content', 'error', `${key}-mismatch`, file, frontLine(parsedFile, [key]), `a block uses ${missing.join(', ')}, which ${key} does not list`))
    if (extra.length > 0) out.push(problem('content', 'error', `${key}-mismatch`, file, frontLine(parsedFile, [key]), `${key} lists ${extra.join(', ')}, which no block uses`))
  }

  frontNumbers(parsedFile, ['title'], front.title, out)
  if (body.skipped === 0 && Math.abs(front.minutes - body.readingMinutes) > MINUTES_TOLERANCE * front.minutes) {
    out.push(
      problem('content', 'warning', 'minutes-drift', file, frontLine(parsedFile, ['minutes']), `the lesson says ${front.minutes} minutes and the compiler reads ${body.readingMinutes}: the words at ${WORDS_PER_MINUTE} a minute plus what each block adds`),
    )
  }

  return { slug, front, body, rev: revOf(front, body.blocks, body.cited, sources) }
}

interface ModuleResult {
  front: ModuleFrontMatter
  body: Body
  rev: string
  lessons: LessonResult[]
}

function compileModule(id: string, sources: Sources, out: Diagnostic[]): ModuleResult | null {
  const dir = path.join(sources.root, 'content/modules', id)
  const file = `content/modules/${id}/module.md`
  const abs = path.join(dir, 'module.md')
  const course = sources.course?.modules.find((module) => module.id === id)
  if (sources.course !== null && course === undefined) {
    out.push(problem('content', 'error', 'unknown-module', `content/modules/${id}`, 1, `"${id}" is not a module of content/course.yaml`))
  }
  if (!existsSync(abs)) {
    out.push(problem('content', 'error', 'missing-file', `content/modules/${id}`, 1, `a module is a folder with a module.md: ${file} is missing`))
    return null
  }

  const parsedFile = parseContentFile(file, readFileSync(abs, 'utf8'), out)
  let front: ModuleFrontMatter | undefined
  if (parsedFile?.frontMatter !== undefined) {
    const parsed = moduleFrontMatterSchema.safeParse(parsedFile.frontMatter)
    if (parsed.success) front = parsed.data
    else {
      out.push(
        ...schemaDiagnostics(parsed.error.issues, {
          file,
          text: parsedFile.frontMatterText,
          firstLine: parsedFile.frontMatterLine,
          gate: 'content',
          subject: 'a module',
          allowedKeys: Object.keys(moduleFrontMatterSchema.shape),
          hints: COMPILER_KEYS,
        }),
      )
    }
  }

  const lessons: LessonResult[] = []
  const lessonIds = new Map<string, string>()
  for (const lessonPath of walk(path.join(dir, 'lessons'), (name) => name.endsWith('.md') && !/^readme\.md$/i.test(name))) {
    const lesson = compileLesson(lessonPath, id, sources, out)
    if (lesson === null) continue
    const earlier = lessonIds.get(lesson.front.id)
    if (earlier !== undefined) out.push(problem('content', 'error', 'duplicate-id', rel(sources.root, lessonPath), 1, `lesson ${lesson.front.id} is also ${earlier}`))
    lessonIds.set(lesson.front.id, rel(sources.root, lessonPath))
    lessons.push(lesson)
  }
  lessons.sort((a, b) => orderOf(a.slug) - orderOf(b.slug) || (a.slug < b.slug ? -1 : 1))

  if (parsedFile === null) return null
  const body = compileBody(parsedFile, sources, undefined, out)
  if (front === undefined) return null

  const at = (found: readonly LinkProblem[], key: string) => {
    for (const item of found) out.push(problem('content', 'error', item.code, file, frontLine(parsedFile, [key, ...item.path.slice(1)]), item.message))
  }
  const line = (key: string) => frontLine(parsedFile, [key])
  if (front.id !== id) out.push(problem('content', 'error', 'id-mismatch', file, line('id'), `the file is in modules/${id}, and its id says "${front.id}"`))
  if (course !== undefined) {
    if (front.title !== course.title) out.push(problem('content', 'error', 'title-mismatch', file, line('title'), `course.yaml calls this module "${course.title}", and the file says "${front.title}"`))
    if (front.hours !== course.hours) out.push(problem('content', 'error', 'hours-mismatch', file, line('hours'), `course.yaml gives ${course.hours} hours, and the file says ${front.hours}`))
    if (front.hours_by_lane !== undefined && canonicalJson(front.hours_by_lane) !== canonicalJson(course.hours_by_lane)) {
      out.push(problem('content', 'error', 'hours-mismatch', file, line('hours_by_lane'), `course.yaml splits the hours as ${canonicalJson(course.hours_by_lane)}, and the file says ${canonicalJson(front.hours_by_lane)}`))
    }
    const lanes = Object.keys(course.hours_by_lane).sort().join(',')
    if (front.lanes !== undefined && [...front.lanes].sort().join(',') !== lanes) {
      out.push(problem('content', 'error', 'lanes-mismatch', file, line('lanes'), `course.yaml works in lanes ${lanes}, and the file lists ${[...front.lanes].sort().join(',')}`))
    }
  }
  front.games?.forEach((game, index) => at(unknownGame(game, sources.links, ['games', index]), 'games'))
  front.labs?.forEach((lab, index) => at(unknownLab(lab, sources.links, ['labs', index]), 'labs'))
  front.worlds.forEach((world, index) => {
    if (!sources.links.cards.has(world)) at([{ code: 'unknown-card', path: ['worlds', index], message: `no card "${world}": a world's card is the file content/cards/${world}.md` }], 'worlds')
  })
  front.prereqs.forEach((prereq, index) => {
    if (!prereq.startsWith('ks:') && !sources.course?.modules.some((module) => module.id === prereq)) {
      at([{ code: 'unknown-module', path: ['prereqs', index], message: `"${prereq}" is not a module of content/course.yaml` }], 'prereqs')
    }
  })
  if (sources.lockKeys !== null) {
    front.pins.forEach((pin, index) => {
      if (!sources.lockKeys?.has(pin)) at([{ code: 'unknown-pin', path: ['pins', index], message: `no pin "${pin}" in course.lock.json` }], 'pins')
    })
  }
  frontNumbers(parsedFile, ['title'], front.title, out)
  front.outcomes.forEach((outcome, index) => frontNumbers(parsedFile, ['outcomes', index], outcome, out))
  front.artifacts.forEach((artifact, index) => frontNumbers(parsedFile, ['artifacts', index, 'title'], artifact.title, out))

  return { front, body, rev: revOf(front, body.blocks, body.cited, sources), lessons }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The learner's agent's export                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The words a claim reference becomes in the export: the claim's value and unit, and its tag. */
function claimInline(claim: Claim): string {
  return `**${claim.value}${claim.unit === undefined ? '' : ` ${claim.unit}`}** [${claim.tag}]`
}

/** The source Markdown of a prose segment with its references written out. The tags are already in the text. */
function exportProse(md: string, sources: Sources): string {
  return md
    .replace(/\{\{\s*claim:(\S+?)\s*\}\}/g, (match, id: string) => {
      const claim = sources.claims.get(id)?.claim
      return claim === undefined ? match : claimInline(claim)
    })
    .replace(/\{\{\s*ks:(\S+?)\s*\}\}/g, (_match, ref: string) => `kernelspace ${ref}`)
}

function claimLine(claim: Claim): string {
  const how =
    claim.derived !== undefined
      ? `derived as ${claim.derived.formula}`
      : claim.source !== undefined
        ? `source: ${claim.source.title} <${claim.source.url}>, read ${claim.source.accessed}`
        : 'from the course\'s own synthetic world'
  return `- \`${claim.id}\`: ${claim.text} Value ${claim.value}${claim.unit === undefined ? '' : ` ${claim.unit}`} [${claim.tag}], checked ${claim.verifiedAt} (${how}).`
}

function claimsSection(cited: ReadonlySet<string>, sources: Sources): string {
  const claims = [...cited].sort().flatMap((id) => {
    const claim = sources.claims.get(id)?.claim
    return claim === undefined ? [] : [claim]
  })
  return claims.length === 0 ? '' : `\n\n## Claims cited\n\n${claims.map(claimLine).join('\n')}`
}

function bodyMarkdown(body: Body, sources: Sources): string {
  return body.parts.map((part) => (part.kind === 'prose' ? exportProse(part.md.trim(), sources) : blockMarkdown(part.block))).join('\n\n')
}

function lessonMarkdown(module: ModuleResult, lesson: LessonResult, sources: Sources): string {
  const { front } = lesson
  const meta = [`${module.front.title}`, `lesson \`${front.id}\``, front.status, `about ${front.minutes} minutes [estimated]`].join(' · ')
  const lines = [`# ${front.title}`, '', `_${meta}_`]
  if (front.builds_on.length > 0) lines.push('', `Builds on kernelspace: ${front.builds_on.map((ref) => `\`${ref}\``).join(', ')}.`)
  if (front.kcs.length > 0) lines.push('', `Knowledge components: ${front.kcs.map((kc) => `\`${kc}\``).join(', ')}.`)
  return `${lines.join('\n')}\n\n${bodyMarkdown(lesson.body, sources)}${claimsSection(lesson.body.cited, sources)}\n`
}

function moduleMarkdown(module: ModuleResult, sources: Sources): string {
  const { front } = module
  const lines = [`# ${front.title}`, '', `_Module \`${front.id}\` · ${front.status} · about ${front.hours} hours [estimated]_`, '', '## What you will be able to do', '']
  lines.push(...front.outcomes.map((outcome) => `- ${outcome}`))
  if (front.prereqs.length > 0) lines.push('', `Prerequisites (advice, never a lock): ${front.prereqs.map((prereq) => `\`${prereq}\``).join(', ')}.`)
  const intro = bodyMarkdown(module.body, sources)
  if (intro !== '') lines.push('', intro)
  lines.push('', '## Lessons', '')
  lines.push(...module.lessons.map((lesson) => `- [${lesson.front.title}](${lesson.slug}.md): lesson \`${lesson.front.id}\`, about ${lesson.front.minutes} minutes [estimated]`))
  return `${lines.join('\n')}${claimsSection(module.body.cited, sources)}\n`
}

const LLMS_SUMMARY =
  'Engine Internals, a kernelspace specialization for backend engineers: trace one request through vLLM and SGLang, attribute every microsecond of a token\'s latency, benchmark the engine honestly, and land one upstream contribution backed by evidence.'

function llmsText(course: Course, modules: ReadonlyMap<string, ModuleResult>): string {
  const lines = [
    '# enginespace',
    '',
    `> ${LLMS_SUMMARY}`,
    '',
    '## How to tutor from this material',
    '',
    '- The learner is a backend engineer who has finished kernelspace\'s serving tracks. Be Socratic: ask them to commit to a prediction before you discuss one, and do not hand over answers. The reference answers are computed by the course\'s own models when a prediction is revealed, so this export holds none.',
    '- Every number is a claim with a source and a date, or carries a tag: [measured], [derived], [estimated] or [unverified]. Treat [estimated] and [unverified] as unchecked.',
    '- The browser world is a model, and each world\'s card says what it models and what it ignores. The real engine is the authority.',
    '- Credit comes from checks the learner cannot fake: fresh seeds in the browser, and reference comparisons on a GPU. Reading and clicking earn nothing.',
    '',
    '## Modules',
  ]
  for (const entry of course.modules) {
    const module = modules.get(entry.id)
    lines.push('', `### ${entry.title} (\`${entry.id}\`)`, '')
    if (module === undefined) {
      lines.push('- Planned: not written yet.')
      continue
    }
    lines.push(`- [Overview](md/${entry.id}/index.md): what the module teaches, and its lessons`)
    for (const lesson of module.lessons) lines.push(`- [${lesson.front.title}](md/${entry.id}/${lesson.slug}.md): lesson \`${lesson.front.id}\`, about ${lesson.front.minutes} minutes [estimated]`)
  }
  return `${lines.join('\n')}\n`
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The whole compile                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * What the map and the module pages read (ARCHITECTURE §3.1). A module that is written gives its own prerequisites, artifacts and
 * labs; one that is not gives what `course.yaml` holds, and no labs. The KCs come from the graph, and the refs from the predictions
 * of every lesson: `predict:tr2.l3#tr2.l3.p1` is evidence for the KCs that the block names.
 */
function buildMap(course: Course, modules: ReadonlyMap<string, ModuleResult>, graph: readonly Kc[]): CourseMap {
  const kcs = graph.map((kc) => ({
    id: kc.id,
    module: moduleOfKc(kc.id),
    description: kc.description,
    requires: kc.requires,
    ...(kc.threshold === true ? { threshold: true } : {}),
    ...(kc.planned === undefined ? {} : { planned: kc.planned }),
  }))
  const refs: Record<string, string[]> = {}
  for (const module of modules.values()) {
    for (const lesson of module.lessons) {
      for (const block of lesson.body.blocks) {
        if (block.type === 'predict') refs[`predict:${lesson.front.id}#${block.id}`] = [...block.kcs]
      }
    }
  }
  return {
    modules: course.modules.map((entry) => {
      const written = modules.get(entry.id)?.front
      return {
        id: entry.id,
        prereqs: written?.prereqs ?? entry.prereqs ?? [],
        artifacts: written?.artifacts ?? entry.artifacts ?? [],
        labs: written?.labs ?? [],
        kcs: kcs.filter((kc) => kc.module === entry.id).map((kc) => kc.id),
      }
    }),
    kcs,
    refs,
  }
}

/** The index, the map, the module, lesson and card JSON, and the export. */
function buildOutputs(course: Course, modules: ReadonlyMap<string, ModuleResult>, cards: ReadonlyMap<string, CardResult>, sources: Sources, out: Diagnostic[]): Output[] {
  const outputs: Output[] = []
  const sizes: { path: string; source: string; budget: number }[] = []
  const emit = (file: string, text: string, source?: string, budget?: number) => {
    outputs.push({ path: file, text })
    if (source !== undefined && budget !== undefined) sizes.push({ path: file, source, budget })
  }
  /** Checks an output against its schema, which holds a compiler bug to the shape the renderer reads. */
  const checked = <T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } } }, value: unknown, label: string, source: string): T | undefined => {
    const parsed = schema.safeParse(value)
    if (parsed.success) return parsed.data
    const first = parsed.error.issues[0]
    out.push(problem('content', 'error', 'internal', source, 1, `the compiled ${label} does not validate: ${first.path.map(String).join('.') || '(root)'} ${first.message}`))
    return undefined
  }

  const indexModules: IndexModule[] = []
  for (const entry of course.modules) {
    const module = modules.get(entry.id)
    const lessons: IndexLesson[] = (module?.lessons ?? []).map(({ slug, front }) => ({
      id: front.id,
      slug,
      title: front.title,
      route: lessonRoute(entry.id, slug),
      minutes: front.minutes,
      status: front.status,
    }))
    indexModules.push({
      id: entry.id,
      title: entry.title,
      route: moduleRoute(entry.id),
      status: module?.front.status ?? 'planned',
      hours: entry.hours,
      hours_by_lane: entry.hours_by_lane,
      ...(module === undefined ? {} : { prereqs: module.front.prereqs, ...(module.front.games === undefined ? {} : { games: module.front.games }) }),
      lessons,
    })
    if (module === undefined) continue

    const moduleSource = `content/modules/${entry.id}/module.md`
    const compiled = checked(compiledModuleSchema, { ...module.front, rev: module.rev, blocks: module.body.blocks }, `module ${entry.id}`, moduleSource)
    if (compiled !== undefined) emit(`src/content/generated/modules/${entry.id}.json`, json(compiled), moduleSource, BUDGETS.page)
    emit(`public/md/${entry.id}/index.md`, moduleMarkdown(module, sources))

    for (const lesson of module.lessons) {
      const source = `content/modules/${entry.id}/lessons/${lesson.slug}.md`
      const lessonJson = checked(
        compiledLessonSchema,
        { ...lesson.front, slug: lesson.slug, rev: lesson.rev, readingMinutes: lesson.body.readingMinutes, blocks: lesson.body.blocks },
        `lesson ${lesson.front.id}`,
        source,
      )
      if (lessonJson !== undefined) emit(`src/content/generated/lessons/${entry.id}.${lesson.slug}.json`, json(lessonJson), source, BUDGETS.page)
      emit(`public/md/${entry.id}/${lesson.slug}.md`, lessonMarkdown(module, lesson, sources))
    }
  }

  for (const [id, card] of cards) {
    const compiled = checked(compiledCardSchema, { ...card.front, rev: revOfCard(card, sources), ...card.words }, `card ${id}`, card.file)
    if (compiled !== undefined) emit(`src/content/generated/cards/${id}.json`, json(compiled), card.file, BUDGETS.page)
  }

  const index = checked<ContentIndex>(contentIndexSchema, { totalHours: course.modules.reduce((sum, module) => sum + module.hours, 0), modules: indexModules }, 'course index', 'content/course.yaml')
  if (index !== undefined) emit('src/content/generated/index.json', json(index), 'content/course.yaml', BUDGETS.index)
  const courseMap = checked<CourseMap>(courseMapSchema, buildMap(course, modules, sources.kcGraph), 'course map', 'content/course.yaml')
  if (courseMap !== undefined) emit('src/content/generated/map.json', json(courseMap), 'content/course.yaml', BUDGETS.map)
  emit('public/llms.txt', llmsText(course, modules))

  const claims = [...sources.claims.values()].map((record) => record.claim).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const claimsOut = checked(claimsOutputSchema, { claims }, 'claims file', 'content/claims')
  if (claimsOut !== undefined) emit('public/claims.json', json(claimsOut))

  for (const { path: file, source, budget } of sizes) {
    const size = gzipped(outputs.find((output) => output.path === file)?.text ?? '')
    if (size > budget) out.push(problem('content', 'error', 'size-budget', source, 1, `${file} is ${size} bytes gzipped, over its budget of ${budget} [estimated] (A§4.6)`))
  }
  return outputs
}

/** Compiles `content/` under `root`. It reads files and writes none. */
export function compileContent({ root }: { root: string }): CompileResult {
  const out: Diagnostic[] = []
  const course = loadCourse(root, out)
  const claims = loadClaims(root, out)
  const kcs = loadKcs(root, out)
  const lockKeys = loadLockKeys(root)
  const claimIds: ReadonlySet<string> = new Set(claims.keys())
  const cards = loadCards(root, claimIds, out)
  const sources: Sources = {
    root,
    course,
    kcGraph: kcs.graph,
    claims,
    claimIds,
    lockKeys,
    links: {
      games: new Set(GAME_IDS),
      labs: new Set(LAB_IDS),
      kcs: kcs.ids,
      // A card file counts for a link even when it has a problem of its own, so one mistake in a card is reported once.
      cards: cards.stems,
      cardKinds: new Map([...cards.compiled].map(([id, card]) => [id, card.front.kind])),
      figureExists: (src) => existsSync(path.join(root, 'public', src)),
    },
  }

  const modules = new Map<string, ModuleResult>()
  const modulesDir = path.join(root, 'content/modules')
  const ids = existsSync(modulesDir) ? readdirSync(modulesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort() : []
  for (const id of ids) {
    const module = compileModule(id, sources, out)
    if (module !== null) modules.set(id, module)
  }

  const stats = { modules: modules.size, lessons: [...modules.values()].reduce((sum, module) => sum + module.lessons.length, 0), claims: claims.size }
  const records = [...claims.values()]
  const outputs = course === null ? [] : buildOutputs(course, modules, cards.compiled, sources, out)
  // By file, then by line, so that a run reads like a walk through the content. An open tag and its close tag are one finding.
  out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line))
  const diagnostics = out.filter((d, i) => d.code !== 'html' || !out.slice(0, i).some((earlier) => earlier.code === 'html' && earlier.file === d.file && earlier.line === d.line))
  return { diagnostics, outputs: hasError(diagnostics) ? [] : outputs, claims: records, lockKeys, cards: new Set(cards.compiled.keys()), stats }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Writing                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The folders that the compiler owns outright: a file in one that it did not write is stale, and goes. */
export const OWNED_DIRS = ['src/content/generated', 'public/md'] as const

export interface WriteResult {
  written: string[]
  unchanged: string[]
  removed: string[]
}

/** Writes the outputs under `root`, leaves a file alone when its bytes are already right, and removes what it no longer writes. */
export function writeOutputs(root: string, outputs: readonly Output[]): WriteResult {
  const result: WriteResult = { written: [], unchanged: [], removed: [] }
  for (const output of outputs) {
    const abs = path.join(root, output.path)
    if (existsSync(abs) && readFileSync(abs, 'utf8') === output.text) {
      result.unchanged.push(output.path)
      continue
    }
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, output.text)
    result.written.push(output.path)
  }

  const keep = new Set(outputs.map((output) => output.path))
  const prune = (dir: string) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        prune(full)
        if (readdirSync(full).length === 0) rmSync(full, { recursive: true })
      } else if (!keep.has(rel(root, full))) {
        rmSync(full)
        result.removed.push(rel(root, full))
      }
    }
  }
  for (const owned of OWNED_DIRS) prune(path.join(root, owned))
  return result
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The command line, and the gates                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '../..')

/** Reads `--root <dir>`, the one option of the compiler and of the gates built on it. Null means a usage error. */
export function parseRoot(argv: readonly string[]): string | null {
  let root = DEFAULT_ROOT
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root' && argv[i + 1] !== undefined) {
      root = path.resolve(argv[i + 1])
      i += 1
    } else return null
  }
  return root
}

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

export function printDiagnostics(diagnostics: readonly Diagnostic[]): void {
  for (const diagnostic of diagnostics) console.log(formatDiagnostic(diagnostic))
}

/**
 * Runs the compiler and prints the diagnostics that belong to `gate`. `extra` adds the checks that only that gate makes.
 * The exit status is 0 when the gate found no error, 1 when it found one, and 2 for a usage error.
 */
export function runGate(gate: Gate, argv: readonly string[], extra?: (result: CompileResult, root: string) => Diagnostic[]): number {
  const root = parseRoot(argv)
  if (root === null) {
    console.error(`usage: bun scripts/verify-${gate}.ts [--root <dir>]`)
    return 2
  }
  const result = compileContent({ root })
  const mine = [...result.diagnostics.filter((diagnostic) => diagnostic.gate === gate), ...(extra?.(result, root) ?? [])]
  printDiagnostics(mine)
  const errors = mine.filter((diagnostic) => diagnostic.severity === 'error').length
  const warnings = mine.length - errors
  const files = new Set(mine.filter((diagnostic) => diagnostic.severity === 'error').map((diagnostic) => diagnostic.file)).size
  const warned = warnings > 0 ? `, ${plural(warnings, 'warning')}` : ''
  if (errors > 0) {
    console.log(`verify:${gate} failed: ${plural(errors, 'error')} in ${plural(files, 'file')}${warned}`)
    return 1
  }
  const { modules, lessons, claims } = result.stats
  console.log(`verify:${gate} passed: ${plural(modules, 'module')}, ${plural(lessons, 'lesson')}, ${plural(claims, 'claim')}${warned}`)
  return 0
}

export function main(argv: readonly string[]): number {
  const root = parseRoot(argv)
  if (root === null) {
    console.error('usage: bun scripts/content/build.ts [--root <dir>]')
    return 2
  }
  const result = compileContent({ root })
  printDiagnostics(result.diagnostics)
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
  if (errors.length > 0) {
    console.log(`content: ${plural(errors.length, 'error')}, nothing written`)
    return 1
  }
  const written = writeOutputs(root, result.outputs)
  const { modules, lessons, claims } = result.stats
  console.log(
    `content: ${plural(modules, 'module')}, ${plural(lessons, 'lesson')}, ${plural(claims, 'claim')}: wrote ${written.written.length} files, ${written.unchanged.length} unchanged, removed ${written.removed.length}`,
  )
  return 0
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2))
