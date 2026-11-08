/**
 * Lessons and modules (ARCHITECTURE §4.2 and §4.3, D-016): the front matter of `lesson` and `module.md` files, and the eight
 * block types. A card kept in its own file (`content/cards/<id>.md`, §5.9) has front matter and three parts of its own, which
 * sit at the end of this file beside the `card` block that names it.
 *
 * A content file is Markdown with YAML front matter and container directives (`:::predict … :::`). The compiler splits a file
 * into its front matter, its prose and its directives, parses the YAML of each with js-yaml's `CORE_SCHEMA`, and validates:
 *   - the front matter with `lessonFrontMatterSchema` or `moduleFrontMatterSchema`;
 *   - each directive's body with `blockBodySchemas[name]`. A name that is not a key there is a ninth block type, which D-016
 *     forbids;
 *   - the compiled form of a block, `{ type, ...body }`, with `blockSchema`.
 *
 * Every object is strict, so a misspelt or unknown key is an error (the issue's path says where). The compiler adds `rev` (a
 * SHA-256 over the authored fields and the claims they cite), so authored front matter that carries one is rejected.
 *
 * Checks that need more than one file stay with `verify:content`: that a `module` is in `course.yaml`, that a `game`, `lab`,
 * claim or KC named here exists, that a lesson's `kcs` and `games` agree with its blocks, and that every number in the prose
 * carries a tag.
 *
 * A§4.2 spells out the lesson front matter and the `predict`, `game` and `item` directives, and the module's keys in a list.
 * A§4.3 names the other four blocks and what each carries, and no more. The `trace`, `lab`, `card` and `figure` shapes below
 * read that line and nothing else into it, so the task that first builds each block may extend them.
 */
import { z } from './zod'
import { nonBlank, uniqueList } from './common'
import {
  dottedIdSchema,
  familyIdSchema,
  gameIdSchema,
  kcIdSchema,
  ksRefSchema,
  labIdSchema,
  lessonIdSchema,
  levelIdSchema,
  lockKeySchema,
  moduleIdSchema,
  predictIdSchema,
  prereqSchema,
  slugSchema,
} from './refs'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Front matter                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Where a page stands (A§4.2). */
export const STATUSES = ['draft', 'review', 'live'] as const
/** The three lanes of work (A§8.1): B in the browser, L on the laptop's CPU, F on a GPU. */
export const LANES = ['B', 'L', 'F'] as const

const status = z.enum(STATUSES)
const lane = z.enum(LANES)

/** What a page touches, for the map and the links. A lesson and a module may both list it (A§4.2). */
const reach = {
  lanes: uniqueList(lane).optional(),
  games: uniqueList(gameIdSchema).optional(),
  labs: uniqueList(labIdSchema).optional(),
}

export const lessonFrontMatterSchema = z
  .strictObject({
    id: lessonIdSchema,
    module: moduleIdSchema,
    title: nonBlank,
    /** An [estimated] reading time in minutes. The compiler recomputes it and warns when the two part ways (A§4.2). */
    minutes: z.int().positive(),
    /** The KCs the lesson teaches. */
    kcs: uniqueList(kcIdSchema),
    /** The kernelspace lessons and KCs it leans on, rendered as links out. */
    builds_on: uniqueList(ksRefSchema),
    status,
    ...reach,
  })
  .superRefine((lesson, ctx) => {
    // A malformed id or module is already reported; this is for two well-formed ones that disagree.
    const wellFormed = lessonIdSchema.safeParse(lesson.id).success && moduleIdSchema.safeParse(lesson.module).success
    if (wellFormed && !lesson.id.startsWith(`${lesson.module}.`)) {
      ctx.addIssue({ code: 'custom', message: `the id "${lesson.id}" does not belong to module "${lesson.module}"`, path: ['id'] })
    }
  })

/** A module's graded artifact: a Build card names it, and the map counts it (A§4.2). */
export const artifactSchema = z.strictObject({ id: dottedIdSchema, lane, title: nonBlank })
export type Artifact = z.infer<typeof artifactSchema>

const hours = z.number().positive()

export const moduleFrontMatterSchema = z
  .strictObject({
    id: moduleIdSchema,
    title: nonBlank,
    status,
    /** [estimated] learner hours. */
    hours,
    /** The hours split by lane. When given, they add up to `hours`. */
    hours_by_lane: z.strictObject({ B: hours.optional(), L: hours.optional(), F: hours.optional() }).optional(),
    outcomes: z.array(nonBlank).min(1),
    artifacts: z.array(artifactSchema).min(1),
    /** The notional-machine cards the module uses, by card id (`content/cards/<id>.md`). */
    worlds: uniqueList(slugSchema),
    /** Kernelspace refs and other modules. They advise and never lock (A§1, I9). */
    prereqs: uniqueList(prereqSchema),
    /** The `course.lock.json` keys the module depends on. */
    pins: uniqueList(lockKeySchema),
    ...reach,
  })
  .superRefine((module, ctx) => {
    const lanes = module.hours_by_lane
    // With no hours to add up to, `hours` has already been reported.
    if (lanes !== undefined && module.hours > 0) {
      const total = (lanes.B ?? 0) + (lanes.L ?? 0) + (lanes.F ?? 0)
      if (Math.abs(total - module.hours) > 1e-9) {
        ctx.addIssue({ code: 'custom', message: `the lanes add up to ${total} hours, and hours says ${module.hours}`, path: ['hours_by_lane'] })
      }
    }
    const seen = new Set<string>()
    module.artifacts.forEach((artifact, index) => {
      if (seen.has(artifact.id)) ctx.addIssue({ code: 'custom', message: `artifact "${artifact.id}" is listed twice`, path: ['artifacts', index, 'id'] })
      seen.add(artifact.id)
    })
  })

/* ------------------------------------------------------------------------------------------------------------------ */
/* Blocks                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** When a prediction's answer is shown. A§4.2's example is the only one the architecture names; a task that needs another adds it here. */
export const REVEAL_POINTS = ['after-game'] as const
/** A game block is a practice run, or a graded one on a fresh seed (A§6.3). */
export const GAME_MODES = ['practice', 'graded'] as const
/** Who made a figure's SVG. */
export const FIGURE_ORIGINS = ['authored', 'generated'] as const

/** "must be a, b or c", for the error of a union that found no member to try. */
function oneOf(words: readonly string[]): string {
  return `must be ${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`
}

/** A unit with no spaces, such as `us`, `tokens` or `GB/s`. */
const unit = z.string().regex(/^\S+$/, 'must be a unit without spaces, such as us or tokens/s')

/** The kinds of answer a prediction takes (A§4.3). */
const ANSWER_KINDS = ['numeric', 'choice', 'interval'] as const

/**
 * The shape of the answer a learner gives, never the answer: the pure model computes the reference when the prediction is
 * revealed, so no key is stored (A§1, I3).
 */
const predictAnswerSchema = z.discriminatedUnion(
  'kind',
  [
    // A number within a relative tolerance: 0.15 is 15 %, and 0 asks for the exact value. A value above 1 is more likely a
    // percentage typed as a ratio than a tolerance, so it is rejected.
    z.strictObject({ kind: z.literal('numeric'), unit, rel_tol: z.number().min(0).max(1) }),
    // One of a few options, shown shuffled and graded by id.
    z.strictObject({
      kind: z.literal('choice'),
      options: z
        .array(z.strictObject({ id: slugSchema, text: nonBlank }))
        .min(2)
        .superRefine((options, ctx) => {
          const seen = new Set<string>()
          options.forEach((option, index) => {
            if (seen.has(option.id)) ctx.addIssue({ code: 'custom', message: `option "${option.id}" appears twice`, path: [index, 'id'] })
            seen.add(option.id)
          })
        }),
    }),
    // A range for the true value, scored by log score (ASSESSMENT §4.7).
    z.strictObject({ kind: z.literal('interval'), unit }),
  ],
  { error: oneOf(ANSWER_KINDS) },
)

/** `predict` writes a `predict` event, graded at the reveal. */
const predictShape = {
  id: predictIdSchema,
  prompt: nonBlank,
  answer: predictAnswerSchema,
  reveal: z.enum(REVEAL_POINTS),
  kcs: uniqueList(kcIdSchema).min(1),
}

/**
 * `item` draws a generator family's items on fresh seeds at grade time, and writes `item` events. `level` is kernelspace's
 * K1 fading level, 0 to 3 [measured: `src/lib/items/types.ts` at d478f91], which ASSESSMENT §4.2 takes as the item contract.
 */
const itemShape = {
  family: familyIdSchema,
  level: z.int().min(0).max(3),
  count: z.int().positive(),
}

/** `game` embeds `src/games/<id>` at one level and writes `play` events. */
const gameShape = {
  id: gameIdSchema,
  level: levelIdSchema,
  mode: z.enum(GAME_MODES),
}

/**
 * `trace` opens a trace and sets span tasks on it, and writes `trace-mark` events. `id` names a pinned trace, or a synthetic
 * one when a `seed` is given: the seed picks the synthetic trace's jitter. A task is named as in the ref
 * `trace:<trace>/<task>`.
 */
const traceShape = {
  id: slugSchema,
  seed: z.uint32().optional(),
  tasks: uniqueList(slugSchema).min(1),
}

/** `lab` is a Build card for a lab and the stages it covers, linking to `/labs/:lab`. It writes nothing: the lab page does. */
const labShape = {
  id: labIdSchema,
  lane,
  stages: uniqueList(z.string().regex(/^s[0-9]+$/, 'must be a stage such as s1')).min(1),
}

/**
 * `figure` is a static SVG with alt text and a long description. `src` is a path to a file in the repo, never a URL, so a
 * figure cannot pull in a third-party request (D-033). It is rendered as an image, never as injected markup (D-016).
 */
const figureShape = {
  src: z.string().regex(/^(?:[a-z0-9][a-z0-9_-]*\/)*[a-z0-9][a-z0-9_-]*\.svg$/, 'must be a relative path to an .svg file in lowercase'),
  alt: nonBlank,
  description: nonBlank,
  origin: z.enum(FIGURE_ORIGINS),
}

/** The kinds of card (A§4.3). */
export const CARD_KINDS = ['notional-machine', 'in-production', 'build-this', 'change', 'isomorphism', 'warning'] as const

/**
 * `card` is one of six kinds (A§4.3). Four stand for a card kept in its own file, which the block names by id: a world's
 * notional-machine card, and the In-production, Build-this and change cards. An isomorphism says where the comparison breaks,
 * and a warning warns; both are written in the block. Only a change card writes to the ledger, an `ack`.
 */
const referenceCard = <Kind extends 'notional-machine' | 'in-production' | 'build-this' | 'change'>(kind: Kind) => ({
  kind: z.literal(kind),
  id: slugSchema,
})
const isomorphismCard = { kind: z.literal('isomorphism'), title: nonBlank.optional(), body: nonBlank, breaks: nonBlank }
const warningCard = { kind: z.literal('warning'), title: nonBlank.optional(), body: nonBlank }

/** The six cards, each with the keys in `extra` beside its own. A block adds its `type`, and a directive's body adds nothing. */
function cards<Extra extends z.ZodRawShape>(extra: Extra) {
  return z.discriminatedUnion(
    'kind',
    [
      z.strictObject({ ...extra, ...referenceCard('notional-machine') }),
      z.strictObject({ ...extra, ...referenceCard('in-production') }),
      z.strictObject({ ...extra, ...referenceCard('build-this') }),
      z.strictObject({ ...extra, ...referenceCard('change') }),
      z.strictObject({ ...extra, ...isomorphismCard }),
      z.strictObject({ ...extra, ...warningCard }),
    ],
    { error: oneOf(CARD_KINDS) },
  )
}

export const cardBodySchema = cards({})

/**
 * The three parts of a notional-machine card, in the order a card has them (A§5.9): the rules the world follows, each with
 * its source; what the world leaves out; and what it was checked against, or "nothing yet". They are the card's `##` headings.
 */
export const CARD_PARTS = ['Models', 'Ignores', 'Calibrated against'] as const
export type CardPart = (typeof CARD_PARTS)[number]

/**
 * The front matter of a card kept in its own file, `content/cards/<id>.md` (A§4.3, A§5.9). The file's name is the card's id.
 * Like a lesson's, the card's `rev` is added by the compiler, so an authored one is refused.
 *
 * Only the notional-machine card has a format so far. The In-production and Build-this cards arrive with W1-T13 and the change
 * card with W3-T06, and each brings its own front matter and parts, so a file of another kind is refused until then.
 */
export const cardFrontMatterSchema = z.strictObject({
  id: slugSchema,
  kind: z.literal('notional-machine', {
    error: 'must be notional-machine: the other cards kept in a file arrive with W1-T13 (In-production, Build-this) and W3-T06 (change)',
  }),
  title: nonBlank,
  /** The model in `packages/sim` that the card describes, by its module name: `steploop`, `kv`, `spec` (A§5.2). */
  world: slugSchema,
  status,
})

/** The block types: prose, which is the Markdown between directives, and the seven directives. The cap is eight (A§4.3). */
export const DIRECTIVES = ['predict', 'item', 'game', 'trace', 'lab', 'card', 'figure'] as const
export const BLOCK_TYPES = ['prose', ...DIRECTIVES] as const

export type Directive = (typeof DIRECTIVES)[number]
export type BlockType = (typeof BLOCK_TYPES)[number]

export const isDirective = (name: string): name is Directive => (DIRECTIVES as readonly string[]).includes(name)

/**
 * What a directive's YAML must be, by directive name. The directive's name is the block's type, so the body does not repeat
 * it. A name that is not a key here is not a block type.
 */
export const blockBodySchemas = {
  predict: z.strictObject(predictShape),
  item: z.strictObject(itemShape),
  game: z.strictObject(gameShape),
  trace: z.strictObject(traceShape),
  lab: z.strictObject(labShape),
  card: cardBodySchema,
  figure: z.strictObject(figureShape),
} as const satisfies Record<Directive, z.ZodType>

/**
 * A block as the compiler holds it: the body with its type. Prose is the Markdown source between directives. The compiler
 * turns it into a token tree for its output (A§4.1), which this does not describe.
 */
export const blockSchema = z.discriminatedUnion(
  'type',
  [
    z.strictObject({ type: z.literal('prose'), md: nonBlank }),
    z.strictObject({ type: z.literal('predict'), ...predictShape }),
    z.strictObject({ type: z.literal('item'), ...itemShape }),
    z.strictObject({ type: z.literal('game'), ...gameShape }),
    z.strictObject({ type: z.literal('trace'), ...traceShape }),
    z.strictObject({ type: z.literal('lab'), ...labShape }),
    cards({ type: z.literal('card') }),
    z.strictObject({ type: z.literal('figure'), ...figureShape }),
  ],
  { error: oneOf(BLOCK_TYPES) },
)

export type LessonFrontMatter = z.infer<typeof lessonFrontMatterSchema>
export type ModuleFrontMatter = z.infer<typeof moduleFrontMatterSchema>
export type CardFrontMatter = z.infer<typeof cardFrontMatterSchema>
export type Block = z.infer<typeof blockSchema>
