/*
 * Directives (ARCHITECTURE §4.2, §4.3; D-016): the seven blocks that sit beside prose, and what the compiler checks of each.
 *
 *   :::predict … :::    a YAML body, validated by `blockBodySchemas[name]` from packages/schema, which rejects any key it does
 *                       not know. A name that is not a key of that table is a ninth block type, and D-016 forbids one.
 *
 * Three things beyond the schema live here, because they need the roster of games and labs or the files of the repo:
 *   - the links of a block (`blockLinks`): a game, a lab, a KC, a card and a figure file that it names must exist;
 *   - the plain text of a block (`textFields`), which the number gate reads as it reads prose;
 *   - the minutes a block adds to a lesson (`blockMinutes`), and the block as Markdown for the learner's agent
 *     (`blockMarkdown`).
 */
import { blockBodySchemas, blockSchema, BLOCK_TYPES, DIRECTIVES, isDirective } from '../../packages/schema/content.ts'
import type { Block } from '../../packages/schema/content.ts'
import { loadYaml, problem, schemaDiagnostics } from './parse.ts'
import type { Diagnostic, DirectiveSegment } from './parse.ts'

export type DirectiveBlock = Exclude<Block, { type: 'prose' }>

/**
 * The game ids of ARCHITECTURE §6.1's roster. The registry of W0-T14 (`packages/play/registry.ts`) will carry the same ids,
 * and a test holds this list to the table in the document. A content task adds a game here when §6.1 does.
 */
export const GAME_IDS: readonly string[] = ['loop', 'engine-floor', 'pool', 'verifier', 'shape-shifter', 'switchyard', 'broken-bench', 'gap-hunt', 'dispatch']

/**
 * The lab ids of ARCHITECTURE §9.2: the three forge labs (lane B) and the GPU and local labs (lanes L and F), whose kits sit
 * in `labs/gpu/<module>-<lab>` and whose ids read `<module>.<lab>`. A test holds this list to the document's tree.
 */
export const LAB_IDS: readonly string[] = [
  'hybrid-kv',
  'rejection-sampler',
  'kv-publisher',
  'tr0.forward',
  'tr1.fork',
  'tr3.profile',
  'tr4.sweep',
  'tr5b.connector',
  'tr6.proposer',
  'tr7.reproduce',
  'tr8.replay',
  'capstone.pair',
]

/** The cards that live in a file of their own, `content/cards/<id>.md` (A§2.2, A§4.3). The other two are written in the block. */
const FILE_CARDS = ['notional-machine', 'in-production', 'build-this', 'change'] as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* Compiling a directive                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const keysOf = (name: (typeof DIRECTIVES)[number]): string[] | undefined => {
  const schema = blockBodySchemas[name]
  return 'shape' in schema ? Object.keys(schema.shape) : undefined
}

/**
 * Compiles one directive to its block, or returns null after saying why. A key the schema does not know, a value of the wrong
 * kind and a block type outside the eight are each reported on the line they are on.
 */
export function compileDirective(segment: DirectiveSegment, file: string, out: Diagnostic[]): DirectiveBlock | null {
  const { name } = segment
  if (!isDirective(name)) {
    const hint =
      name === 'prose'
        ? 'prose is the Markdown between directives and has no directive of its own'
        : `the cap is eight: ${BLOCK_TYPES.join(', ')}. A ninth reopens D-016`
    out.push(problem('content', 'error', 'unknown-block', file, segment.line, `:::${name} is not a block type (${hint})`))
    return null
  }

  const loaded = loadYaml(segment.yaml, file, segment.bodyLine, 'content', out)
  if (!loaded.ok) return null
  const value = loaded.value ?? {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    out.push(problem('content', 'error', 'schema', file, segment.bodyLine, `:::${name} holds key: value lines`))
    return null
  }

  const parsed = blockBodySchemas[name].safeParse(value)
  if (!parsed.success) {
    out.push(
      ...schemaDiagnostics(parsed.error.issues, {
        file,
        text: segment.yaml,
        firstLine: segment.bodyLine,
        gate: 'content',
        subject: `:::${name}`,
        allowedKeys: keysOf(name),
      }),
    )
    return null
  }

  // The compiled form of a block is its body with its type (packages/schema/content.ts).
  const block = blockSchema.safeParse({ type: name, ...parsed.data })
  if (!block.success || block.data.type === 'prose') {
    out.push(problem('content', 'error', 'internal', file, segment.line, `:::${name} passed its body schema and failed the block schema: ${block.error?.issues[0]?.message ?? 'prose'}`))
    return null
  }
  return block.data
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Links                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What a block's links are checked against. */
export interface LinkEnv {
  games: ReadonlySet<string>
  labs: ReadonlySet<string>
  /** The ids in `content/kc/graph.yaml`. */
  kcs: ReadonlySet<string>
  /** The stems of `content/cards/*.md`. */
  cards: ReadonlySet<string>
  /** Whether a figure's file exists, given its `src`. */
  figureExists(src: string): boolean
}

export interface LinkProblem {
  code: string
  /** Where the bad value sits in the block's YAML. */
  path: (string | number)[]
  message: string
}

const list = (words: Iterable<string>): string => [...words].join(', ')

/** The KC ids a lesson or a prediction names that the graph does not have. */
export function unknownKcs(kcs: readonly string[], env: LinkEnv, path: (string | number)[]): LinkProblem[] {
  const hint = env.kcs.size === 0 ? ' (content/kc/graph.yaml has none, or is missing)' : ''
  return kcs.flatMap((kc, index) =>
    env.kcs.has(kc) ? [] : [{ code: 'unknown-kc', path: [...path, index], message: `no KC "${kc}" in content/kc/graph.yaml${hint}` }],
  )
}

export const unknownGame = (id: string, env: LinkEnv, path: (string | number)[]): LinkProblem[] =>
  env.games.has(id) ? [] : [{ code: 'unknown-game', path, message: `no game "${id}": ARCHITECTURE §6.1 has ${list(env.games)}` }]

export const unknownLab = (id: string, env: LinkEnv, path: (string | number)[]): LinkProblem[] =>
  env.labs.has(id) ? [] : [{ code: 'unknown-lab', path, message: `no lab "${id}": ARCHITECTURE §9.2 has ${list(env.labs)}` }]

/** The links a block makes to games, labs, KCs, cards and figures that the repo has to answer. */
export function blockLinks(block: DirectiveBlock, env: LinkEnv): LinkProblem[] {
  switch (block.type) {
    case 'predict':
      return unknownKcs(block.kcs, env, ['kcs'])
    case 'game':
      return unknownGame(block.id, env, ['id'])
    case 'lab':
      return unknownLab(block.id, env, ['id'])
    case 'card':
      if ((FILE_CARDS as readonly string[]).includes(block.kind) && 'id' in block && !env.cards.has(block.id)) {
        return [{ code: 'unknown-card', path: ['id'], message: `no card "${block.id}": a ${block.kind} card is the file content/cards/${block.id}.md` }]
      }
      return []
    case 'figure':
      return env.figureExists(block.src) ? [] : [{ code: 'missing-file', path: ['src'], message: `no file public/${block.src}: a figure's src is a path under public/` }]
    default:
      return []
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Plain text, minutes and the Markdown export                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface TextField {
  path: (string | number)[]
  text: string
}

/** The strings of a block that a page shows as text. The number gate reads each as it reads a line of prose. */
export function textFields(block: DirectiveBlock): TextField[] {
  switch (block.type) {
    case 'predict': {
      const fields: TextField[] = [{ path: ['prompt'], text: block.prompt }]
      if (block.answer.kind === 'choice') {
        block.answer.options.forEach((option, index) => fields.push({ path: ['answer', 'options', index, 'text'], text: option.text }))
      }
      return fields
    }
    case 'card':
      if (block.kind === 'isomorphism') {
        return [...(block.title === undefined ? [] : [{ path: ['title'], text: block.title }]), { path: ['body'], text: block.body }, { path: ['breaks'], text: block.breaks }]
      }
      if (block.kind === 'warning') {
        return [...(block.title === undefined ? [] : [{ path: ['title'], text: block.title }]), { path: ['body'], text: block.body }]
      }
      return []
    case 'figure':
      return [
        { path: ['alt'], text: block.alt },
        { path: ['description'], text: block.description },
      ]
    default:
      return []
  }
}

/**
 * What each block adds to a lesson's minutes, [estimated]. These are starting points for the content tasks to tune against
 * the lesson tables of curriculum/TR2: a prediction takes 2 minutes, an item 2, a practice game level 15 and a graded one 20,
 * a trace task 5, a lab stage 15, and a card or a figure 1.
 */
export const BLOCK_MINUTES = { predict: 2, item: 2, practice: 15, graded: 20, traceTask: 5, labStage: 15, card: 1, figure: 1 } as const

export function blockMinutes(block: DirectiveBlock): number {
  switch (block.type) {
    case 'predict':
      return BLOCK_MINUTES.predict
    case 'item':
      return BLOCK_MINUTES.item * block.count
    case 'game':
      return block.mode === 'graded' ? BLOCK_MINUTES.graded : BLOCK_MINUTES.practice
    case 'trace':
      return BLOCK_MINUTES.traceTask * block.tasks.length
    case 'lab':
      return BLOCK_MINUTES.labStage * block.stages.length
    case 'card':
      return BLOCK_MINUTES.card
    case 'figure':
      return BLOCK_MINUTES.figure
  }
}

const quote = (text: string): string => text.split('\n').map((line) => `> ${line}`.trimEnd()).join('\n')

/**
 * A block as Markdown for the learner's agent (A§4.6). Nothing in a block is a key or an answer: a prediction holds the shape
 * of its answer, and the course's model computes the reference when the prediction is revealed (A§1, I3). So the export says
 * what the learner is asked to do, and tells the agent to let them commit before it discusses anything.
 */
export function blockMarkdown(block: DirectiveBlock): string {
  switch (block.type) {
    case 'predict': {
      const shape =
        block.answer.kind === 'numeric'
          ? `a number in \`${block.answer.unit}\`, graded within a relative tolerance of \`${block.answer.rel_tol}\` [estimated]`
          : block.answer.kind === 'interval'
            ? `a range in \`${block.answer.unit}\`, scored by log score`
            : `one of: ${block.answer.options.map((option) => `${option.text} (\`${option.id}\`)`).join('; ')}`
      return quote(`**Predict \`${block.id}\`.** ${block.prompt}\n\nThe learner commits to ${shape} before the reveal. Ask them to commit to an answer and say why before you discuss it.`)
    }
    case 'item':
      return quote(`**Practice.** Items from the generator family \`${block.family}\`, level \`${block.level}\`, \`${block.count}\` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.`)
    case 'game':
      return quote(`**Play.** The game \`${block.id}\`, level \`${block.level}\`, in \`${block.mode}\` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.`)
    case 'trace':
      return quote(`**Trace.** \`${block.id}\`${block.seed === undefined ? '' : ` (synthetic, seed \`${block.seed}\`)`}, with the ${block.tasks.length === 1 ? 'task' : 'tasks'} ${block.tasks.map((task) => `\`${task}\``).join(', ')}. The learner marks spans in the trace viewer.`)
    case 'lab':
      return quote(`**Build.** The lab \`${block.id}\` (lane ${block.lane}), ${block.stages.length === 1 ? 'stage' : 'stages'} ${block.stages.map((stage) => `\`${stage}\``).join(', ')}. The lab page grades it.`)
    case 'card':
      switch (block.kind) {
        case 'isomorphism':
          return quote(`**${block.title ?? 'Isomorphism'}.** ${block.body}\n\nWhere it breaks: ${block.breaks}`)
        case 'warning':
          return quote(`**${block.title ?? 'Warning'}.** ${block.body}`)
        default:
          return quote(`**Card.** The ${block.kind} card \`${block.id}\`.`)
      }
    case 'figure':
      return `![${block.alt.replace(/[[\]]/g, '')}](../../${block.src})\n\n_${block.description}_`
  }
}
