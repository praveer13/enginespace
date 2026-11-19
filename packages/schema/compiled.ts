/**
 * What the content compiler writes (ARCHITECTURE §4.1 and §4.6, D-016): the course index, one JSON per module, per lesson and per
 * card, and the claims file. The renderer reads these and nothing in `content/`, and `scripts/content/build.ts` validates each output
 * against the schema here before it writes it, so a compiler bug fails the build instead of reaching a page.
 *
 * Prose is a restricted token tree. Its nodes are the ones A§4.1 lists: paragraph, heading, list, table and code at block
 * level, and text, emphasis, code, link, claim reference and tag inside a line. React renders the tree, and no node holds
 * HTML, so nothing anywhere renders HTML from content. The other seven blocks keep the shape that `blockSchema` gives them.
 *
 * The source files write `builds_on` and `hours_by_lane` in snake case, and the compiler copies authored fields as authored.
 * The fields the compiler adds are camel case, as the claims' `verifiedAt` and `ttlDays` are.
 */
import { z } from './zod'
import { PROSE_TAGS, claimSchema } from './claims'
import type { ProseTag } from './claims'
import { nonBlank, sha256Hex } from './common'
import { artifactSchema, blockSchema, cardFrontMatterSchema, LANES, lessonFrontMatterSchema, moduleFrontMatterSchema, STATUSES } from './content'
import type { Block } from './content'
import { familyIdSchema, gameIdSchema, kcIdSchema, kcRefSchema, labIdSchema, lessonIdSchema, moduleIdSchema, prereqSchema, refSchema } from './refs'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Prose                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What can stand inside a line of prose. */
export type ProseInline =
  | { type: 'text'; text: string }
  | { type: 'em'; children: ProseInline[] }
  | { type: 'strong'; children: ProseInline[] }
  /** A code span. Nothing inside it is read as a reference, a tag or a number. */
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: ProseInline[] }
  /** `{{claim:id}}`, shown as a chip with the claim's value, source and date. */
  | { type: 'claim'; id: string }
  /** `{{ks:T5.L7}}`, a link out to a kernelspace lesson or KC. `ref` carries the `ks:` prefix, as `builds_on` does. */
  | { type: 'ks'; ref: string }
  /** One of the five prose tags (A§0), shown as a chip. */
  | { type: 'tag'; tag: ProseTag }

export type ProseAlign = 'left' | 'center' | 'right' | null

export type ProseFlow =
  | { type: 'paragraph'; children: ProseInline[] }
  /** The page's title is the h1, so prose starts at 2. A heading goes at most one level deeper than the one before it. */
  | { type: 'heading'; depth: 2 | 3 | 4; children: ProseInline[] }
  | { type: 'list'; ordered: boolean; start?: number; items: ProseFlow[][] }
  | { type: 'table'; align: ProseAlign[]; head: ProseInline[][]; rows: ProseInline[][][] }
  | { type: 'code'; lang?: string; text: string }

/**
 * A link goes out over https, to a route of this site (`/map`), or to an anchor (`#why`). Nothing else: no `javascript:`
 * and no `data:` URL, and no `http:`, which the site would have to upgrade (D-033).
 */
export const PROSE_HREF = /^(?:https:\/\/[^\s<>"]+|\/(?!\/)[^\s<>"]*|#[^\s<>"]+)$/

const hrefSchema = z.string().regex(PROSE_HREF, 'must be an https URL, a route such as /map, or an anchor such as #why')

export const proseInlineSchema: z.ZodType<ProseInline> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('text'), text: z.string().min(1) }),
    z.strictObject({ type: z.literal('em'), children: z.array(proseInlineSchema).min(1) }),
    z.strictObject({ type: z.literal('strong'), children: z.array(proseInlineSchema).min(1) }),
    z.strictObject({ type: z.literal('code'), text: z.string().min(1) }),
    z.strictObject({ type: z.literal('link'), href: hrefSchema, children: z.array(proseInlineSchema).min(1) }),
    z.strictObject({ type: z.literal('claim'), id: z.string().min(1) }),
    z.strictObject({ type: z.literal('ks'), ref: z.string().min(1) }),
    z.strictObject({ type: z.literal('tag'), tag: z.enum(PROSE_TAGS) }),
  ]),
)

const alignSchema = z.enum(['left', 'center', 'right']).nullable()

export const proseFlowSchema: z.ZodType<ProseFlow> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('paragraph'), children: z.array(proseInlineSchema).min(1) }),
    z.strictObject({ type: z.literal('heading'), depth: z.union([z.literal(2), z.literal(3), z.literal(4)]), children: z.array(proseInlineSchema).min(1) }),
    z.strictObject({
      type: z.literal('list'),
      ordered: z.boolean(),
      start: z.int().optional(),
      items: z.array(z.array(proseFlowSchema).min(1)).min(1),
    }),
    z.strictObject({
      type: z.literal('table'),
      align: z.array(alignSchema).min(1),
      head: z.array(z.array(proseInlineSchema)).min(1),
      rows: z.array(z.array(z.array(proseInlineSchema))),
    }),
    z.strictObject({ type: z.literal('code'), lang: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9+#._-]*$/).optional(), text: z.string() }),
  ]),
)

/* ------------------------------------------------------------------------------------------------------------------ */
/* Blocks, lessons and modules                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A compiled prose block holds the token tree of the Markdown between two directives, where a source block holds `md`. */
export type CompiledProse = { type: 'prose'; body: ProseFlow[] }
export type CompiledBlock = CompiledProse | Exclude<Block, { type: 'prose' }>

const compiledProseSchema = z.strictObject({ type: z.literal('prose'), body: z.array(proseFlowSchema).min(1) })
const directiveBlockSchema = blockSchema.refine((block) => block.type !== 'prose', { message: 'a compiled prose block has a body, not md' })

// The refine keeps the source `Block` type, which still includes prose with `md`; the union below is the compiled set.
export const compiledBlockSchema = z.union([compiledProseSchema, directiveBlockSchema]) as unknown as z.ZodType<CompiledBlock> // the union parses only CompiledBlock, and the refine leaves the type of the source Block, whose prose holds md

/** A lesson's file name without `.md`: `l3-async-overlap`. It is the last part of the lesson's route, and the lesson's id is `<module>.l3`. */
export const lessonSlugSchema = z.string().regex(/^l[0-9]+(?:-[a-z0-9]+)*$/, 'must be a lesson file name such as l3-async-overlap')

export const moduleRoute = (module: string): string => `/m/${module}`
export const lessonRoute = (module: string, slug: string): string => `/m/${module}/${slug}`

export const compiledLessonSchema = lessonFrontMatterSchema.extend({
  slug: lessonSlugSchema,
  /** A SHA-256 over the lesson's authored fields, its blocks and the claims it cites (A§4.2). */
  rev: sha256Hex,
  /** The compiler's [estimated] minutes for the lesson, which it compares with the declared `minutes`. */
  readingMinutes: z.number().positive(),
  blocks: z.array(compiledBlockSchema),
})

export const compiledModuleSchema = moduleFrontMatterSchema.extend({
  rev: sha256Hex,
  blocks: z.array(compiledBlockSchema),
})

/**
 * A notional-machine card, compiled (A§5.9): its front matter, then its words as the same prose token tree that a lesson has.
 * `intro` is what comes before the first part, and may be empty. The three parts follow in `CARD_PARTS` order, and each holds
 * something: `models`, `ignores` and `calibrated` (the part "Calibrated against").
 */
export const compiledCardSchema = cardFrontMatterSchema.extend({
  /** A SHA-256 over the card's authored fields, its words and the claims it cites, as a lesson's is. */
  rev: sha256Hex,
  intro: z.array(proseFlowSchema),
  models: z.array(proseFlowSchema).min(1),
  ignores: z.array(proseFlowSchema).min(1),
  calibrated: z.array(proseFlowSchema).min(1),
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The index and the claims file                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

const hours = z.number().positive()

export const indexLessonSchema = z.strictObject({
  id: lessonIdSchema,
  slug: lessonSlugSchema,
  title: nonBlank,
  route: z.string().regex(/^\/m\/[a-z0-9]+\/l[0-9]+(?:-[a-z0-9]+)*$/),
  minutes: z.int().positive(),
  /** The lanes it is worked in, as the map's lesson row has them: the front page names them beside the first lesson's minutes. */
  needs: z.array(z.enum(LANES)).min(1).optional(),
  status: z.enum(STATUSES),
})

export const indexModuleSchema = z.strictObject({
  id: moduleIdSchema,
  title: nonBlank,
  route: z.string().regex(/^\/m\/[a-z0-9]+$/),
  /** `planned` is a module in `course.yaml` with no `module.md` yet. */
  status: z.enum(['planned', ...STATUSES]),
  /** True when the module has at least one lesson. The front page reads this where it once counted the module's lessons. */
  published: z.boolean(),
  hours,
  hours_by_lane: z.strictObject({ B: hours.optional(), L: hours.optional(), F: hours.optional() }),
  /** From `module.md`, so a planned module has neither. */
  prereqs: z.array(prereqSchema).optional(),
  games: z.array(gameIdSchema).optional(),
})

/** The course's first lesson as the front page names it: only what the page prints, so the index does not grow with the lessons. */
export const firstLessonSchema = z.strictObject({
  module: moduleIdSchema,
  title: nonBlank,
  route: indexLessonSchema.shape.route,
  minutes: indexLessonSchema.shape.minutes,
  needs: indexLessonSchema.shape.needs,
})

/**
 * The course index: the modules, whether each is published, and the course's first lesson. It is in the front page's first-paint
 * closure (A§4.6), so it holds nothing that grows with the number of lessons: those rows are in the lesson index, which a page
 * loads when it shows a module or a lesson. `verify:content` holds it to 6 KB gz.
 */
export const contentIndexSchema = z.strictObject({
  /** The sum of the modules' hours, [derived]. */
  totalHours: hours,
  /** Absent while no module has a lesson. */
  firstLesson: firstLessonSchema.optional(),
  modules: z.array(indexModuleSchema).min(1),
})

/** The lesson index: each module's lessons in course order, a second generated file that the pages that list lessons load on demand. */
export const lessonIndexSchema = z.strictObject({
  modules: z.record(moduleIdSchema, z.array(indexLessonSchema)),
})

/** `public/claims.json`, for the claim chips and the about page. Claims are sorted by id. */
export const claimsOutputSchema = z.strictObject({ claims: z.array(claimSchema) })

/* ------------------------------------------------------------------------------------------------------------------ */
/* The course map                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * A module as the map and the module pages read it. It is kept out of the course index, which is in the front page's
 * first-paint closure (A§4.6, A§6.10), so the front page pays nothing for it.
 */
export const mapModuleSchema = z.strictObject({
  id: moduleIdSchema,
  /** Kernelspace lessons and other modules it leans on: `module.md`'s once the module is written, `course.yaml`'s until then. */
  prereqs: z.array(prereqSchema),
  /** What it asks the learner to build and prove, with the lane each is worked in: the same rule. */
  artifacts: z.array(artifactSchema),
  /** The labs its page lists. A forge lab's events name no module in their ref, so this is how a lab finds its module. */
  labs: z.array(labIdSchema),
  /** Its KCs, in the order of the graph. */
  kcs: z.array(kcIdSchema),
  /** The first of the module's outcomes, which Course prints on the module's row. A planned module has none. */
  outcome: nonBlank.optional(),
})

/** A KC as the module page lists it. `planned` is the task that will add its first graded reference, until W1-T38 (ARCHITECTURE §4.5). */
export const mapKcSchema = z.strictObject({
  id: kcIdSchema,
  module: moduleIdSchema,
  description: nonBlank,
  requires: z.array(kcRefSchema),
  threshold: z.boolean().optional(),
  planned: z.string().optional(),
})

/** How a lesson opens (REDESIGN §2.5): a run first (A), a primer then a run (B), or reading first (C). */
export const LESSON_OPENERS = ['run', 'primer', 'read'] as const

/** A question set's family and how many of its questions the set asks. */
export const familyCountSchema = z.strictObject({ family: familyIdSchema, count: z.int().positive() })

/**
 * A lesson as the way on reads it (REDESIGN §2.4): its place, its size, and the ledger refs of each section, so that `nextStep`
 * (src/progress/next.ts) can say from events alone whether its Run is done, whether its Test is passed, and which lesson an event
 * belongs to. The compiler derives every field from the lesson's blocks, by the rules of REDESIGN §2.5:
 *   run          the game blocks before the first `##` (the opener's runs)
 *   inline       the practice game blocks after it
 *   predicts     every prediction's ref
 *   checkpoints  the item blocks outside the Test
 *   test         the item blocks of the last `##` part, when that part holds an item or a graded game, and every graded game block
 *   anchors      the heading ids where Read and Test start, as the lesson page draws them
 * `rev` is the lesson's, which a run in the lesson writes on its event: an event that several lessons could own goes to the one
 * whose `rev` it carries.
 */
export const mapLessonSchema = z.strictObject({
  id: lessonIdSchema,
  module: moduleIdSchema,
  route: z.string().regex(/^\/m\/[a-z0-9]+\/l[0-9]+(?:-[a-z0-9]+)*$/),
  title: nonBlank,
  minutes: z.int().positive(),
  /** The lanes it is worked in: B alone is "browser only". */
  needs: z.array(z.enum(LANES)).min(1),
  rev: sha256Hex,
  opener: z.enum(LESSON_OPENERS),
  run: z.array(refSchema),
  inline: z.array(refSchema),
  predicts: z.array(refSchema),
  checkpoints: z.array(familyCountSchema),
  test: z.strictObject({ questions: z.array(familyCountSchema), graded: z.array(refSchema) }),
  anchors: z.strictObject({ read: z.string().min(1).optional(), test: z.string().min(1).optional() }),
})

/**
 * `src/content/generated/map.json`: what the course map and the module pages read to show a learner's evidence. The modules
 * come with their prerequisites, artifacts, labs and KCs, the KCs with their edges, and `refs` with the KCs that content
 * assigns to a ledger ref: a prediction's, from the lesson that asks it. The other refs get their KCs from the game
 * registry, the item families and the labs (kernelspace's static ref map, ARCHITECTURE §4.5). `lessons` is every built lesson
 * in course order, as the way on reads it. Nothing about a learner is in it.
 */
export const courseMapSchema = z.strictObject({
  modules: z.array(mapModuleSchema).min(1),
  kcs: z.array(mapKcSchema),
  refs: z.record(refSchema, z.array(kcIdSchema)),
  lessons: z.array(mapLessonSchema),
})

export type CompiledLesson = z.infer<typeof compiledLessonSchema>
export type CompiledModule = z.infer<typeof compiledModuleSchema>
export type CompiledCard = z.infer<typeof compiledCardSchema>
export type IndexLesson = z.infer<typeof indexLessonSchema>
export type FirstLesson = z.infer<typeof firstLessonSchema>
export type LessonIndex = z.infer<typeof lessonIndexSchema>
export type IndexModule = z.infer<typeof indexModuleSchema>
export type ContentIndex = z.infer<typeof contentIndexSchema>
export type ClaimsOutput = z.infer<typeof claimsOutputSchema>
export type MapModule = z.infer<typeof mapModuleSchema>
export type MapKc = z.infer<typeof mapKcSchema>
export type MapLesson = z.infer<typeof mapLessonSchema>
export type FamilyCount = z.infer<typeof familyCountSchema>
export type CourseMap = z.infer<typeof courseMapSchema>
