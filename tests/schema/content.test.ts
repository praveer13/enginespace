/*
 * W0-T07's acceptance check 1, for lesson and module front matter and the eight block types (ARCHITECTURE §4.2 and §4.3):
 *
 *   - Each schema accepts the examples of A§4.2, which tests/fixtures/schema/lesson-a4-2.md copies word for word. A test
 *     reads docs/ARCHITECTURE.md and fails when the document's example and the fixture part ways.
 *   - Each schema rejects unknown keys. The walker adds one to every object inside every example, one object at a time, so
 *     no nested object escapes the check.
 *   - A§4.2 says which keys a lesson and a module must have, and which are optional. The tests hold the schemas to that split.
 *   - A§4.3's table is the block set: eight types, and six kinds of card.
 */
import { describe, expect, test } from 'bun:test'
import {
  BLOCK_TYPES,
  blockBodySchemas,
  blockSchema,
  CARD_PARTS,
  cardFrontMatterSchema,
  DIRECTIVES,
  isDirective,
  lessonFrontMatterSchema,
  moduleFrontMatterSchema,
} from '@es/schema/content'
import { between, fixture, keyRoles, messages, objectPaths, problems, read, splitContent, where, withKey } from './support'
import type { Path } from './support'

const architecture = read('docs/ARCHITECTURE.md')

/* ------------------------------------------------------------------------------------------------------------------ */
/* The examples. Each is valid; the tests below break them one way at a time.                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

const example = splitContent(fixture('lesson-a4-2.md'))
const lesson = example.frontMatter as Record<string, unknown>
const module_ = splitContent(fixture('module-tr2.md')).frontMatter as Record<string, unknown>

const body = (name: string) => {
  const found = example.directives.find((directive) => directive.name === name)
  if (found === undefined) throw new Error(`the A§4.2 fixture has no :::${name}`)
  return found.body as Record<string, unknown>
}

const options = [
  { id: 'cpu', text: 'The CPU lane' },
  { id: 'gpu', text: 'The GPU lane' },
]

/** One valid body for each directive, with the variants of the ones that have kinds. Keyed by a name for the test titles. */
const bodies: Record<string, { directive: (typeof DIRECTIVES)[number]; value: Record<string, unknown> }> = {
  'predict (numeric)': { directive: 'predict', value: body('predict') },
  'predict (choice)': {
    directive: 'predict',
    value: { id: 'tr2.l3.p2', prompt: 'Which lane waits?', answer: { kind: 'choice', options }, reveal: 'after-game', kcs: ['tr2.bubble'] },
  },
  'predict (interval)': {
    directive: 'predict',
    value: { id: 'tr2.l3.p3', prompt: 'Give a range for the bubble.', answer: { kind: 'interval', unit: 'us' }, reveal: 'after-game', kcs: ['tr2.bubble'] },
  },
  item: { directive: 'item', value: body('item') },
  game: { directive: 'game', value: body('game') },
  'trace (pinned)': { directive: 'trace', value: { id: 'base-step', tasks: ['gap', 'attribute'] } },
  'trace (synthetic)': { directive: 'trace', value: { id: 'loop-async-off', seed: 7, tasks: ['gap'] } },
  'lab (forge)': { directive: 'lab', value: { id: 'hybrid-kv', lane: 'B', stages: ['s1', 's2'] } },
  'lab (GPU)': { directive: 'lab', value: { id: 'tr8.replay', lane: 'F', stages: ['s1'] } },
  'card (notional-machine)': { directive: 'card', value: { kind: 'notional-machine', id: 'trace-room-steploop' } },
  'card (in-production)': { directive: 'card', value: { kind: 'in-production', id: 'loop-async' } },
  'card (build-this)': { directive: 'card', value: { kind: 'build-this', id: 'hybrid-kv' } },
  'card (change)': { directive: 'card', value: { kind: 'change', id: 'vllm-0-34' } },
  'card (isomorphism)': {
    directive: 'card',
    value: { kind: 'isomorphism', title: 'A block table is a page table', body: 'Both map a logical index to a physical slot.', breaks: 'A block holds many tokens.' },
  },
  'card (warning)': { directive: 'card', value: { kind: 'warning', title: 'A model', body: 'The browser world is a model.' } },
  figure: {
    directive: 'figure',
    value: { src: 'figures/tr2/bubble.svg', alt: 'Two steps with a gap between them', description: 'The GPU lane idles while the CPU lane prepares the next step.', origin: 'generated' },
  },
}

/* ------------------------------------------------------------------------------------------------------------------ */

describe("ARCHITECTURE §4.2's examples", () => {
  test('the fixture is the document’s example, word for word', () => {
    const shown = between(architecture, '### 4.2 Lesson and module files', '**Front matter.**')
    const fenced = /```markdown\n([\s\S]*?)\n```/.exec(shown)
    if (fenced === null) throw new Error('§4.2 no longer shows a markdown example')
    expect(`${fenced[1]}\n`).toBe(fixture('lesson-a4-2.md'))
  })

  test('its front matter is a lesson’s', () => {
    expect(lessonFrontMatterSchema.parse(lesson)).toEqual({
      id: 'tr2.l3',
      module: 'tr2',
      title: 'Async scheduling closes the bubble',
      minutes: 25,
      kcs: ['tr2.async-overlap', 'tr2.bubble'],
      builds_on: ['ks:T5.L7', 'ks:T0.L6'],
      status: 'draft',
    })
  })

  test('it holds a predict, a game and an item, and each body passes', () => {
    expect(example.directives.map((directive) => directive.name)).toEqual(['predict', 'game', 'item'])
    for (const { name, body: yaml } of example.directives) {
      if (!isDirective(name)) throw new Error(`${name} is not a directive`)
      expect(blockBodySchemas[name].parse(yaml)).toEqual(yaml as never)
    }
  })

  test('each, with its type, is a block', () => {
    for (const { name, body: yaml } of example.directives) {
      const block = blockSchema.parse({ type: name, ...(yaml as object) })
      expect(block).toEqual({ type: name, ...(yaml as object) } as never)
    }
  })

  test('its prose, with a claim reference and tags, is a prose block', () => {
    expect(example.prose).toContain('{{claim:vllm.async-scheduling.default}}')
    expect(blockSchema.safeParse({ type: 'prose', md: example.prose }).success).toBe(true)
  })
})

describe('every schema rejects an unknown key, in every object', () => {
  const subjects: [string, Parameters<typeof problems>[0], Record<string, unknown>][] = [
    ['lesson front matter', lessonFrontMatterSchema, { ...lesson, lanes: ['B'], games: ['loop'], labs: ['hybrid-kv'] }],
    ['module front matter', moduleFrontMatterSchema, { ...module_, labs: ['hybrid-kv'] }],
    ...Object.entries(bodies).map(([name, { directive, value }]): [string, Parameters<typeof problems>[0], Record<string, unknown>] => [
      `${name} body`,
      blockBodySchemas[directive],
      value,
    ]),
    ...Object.entries(bodies).map(([name, { directive, value }]): [string, Parameters<typeof problems>[0], Record<string, unknown>] => [
      `${name} block`,
      blockSchema,
      { type: directive, ...value },
    ]),
    ['prose block', blockSchema, { type: 'prose', md: 'Some text.' }],
  ]

  for (const [name, schema, value] of subjects) {
    test(name, () => {
      expect(problems(schema, value)).toEqual([])
      const paths = objectPaths(value)
      expect(paths.length).toBeGreaterThan(0)
      for (const path of paths) {
        expect(problems(schema, withKey(value, [...path, 'zzz'], true))).toEqual([`${where(path)}: unrecognized_keys[zzz]`])
      }
    })
  }

  test('the nested objects are among those checked', () => {
    const nested = objectPaths(module_).map(where)
    expect(nested).toEqual(expect.arrayContaining(['(root)', 'hours_by_lane', 'artifacts.0']))
    expect(objectPaths(bodies['predict (choice)'].value).map(where)).toEqual(expect.arrayContaining(['answer', 'answer.options.1']))
  })

  test('the compiler adds `rev`, so authored front matter may not carry one', () => {
    expect(problems(lessonFrontMatterSchema, { ...lesson, rev: 'a'.repeat(64) })).toEqual(['(root): unrecognized_keys[rev]'])
  })
})

describe('which keys are required', () => {
  test('a lesson has id, module, title, minutes, kcs, builds_on and status, and optionally lanes, games and labs', () => {
    const full = { ...lesson, lanes: ['B'], games: ['loop'], labs: ['hybrid-kv'] }
    expect(keyRoles(lessonFrontMatterSchema, full)).toEqual({
      required: ['builds_on', 'id', 'kcs', 'minutes', 'module', 'status', 'title'],
      optional: ['games', 'labs', 'lanes'],
    })
  })

  test('a module adds hours (and hours_by_lane), outcomes, artifacts, worlds, prereqs and pins', () => {
    expect(keyRoles(moduleFrontMatterSchema, { ...module_, labs: ['hybrid-kv'] })).toEqual({
      required: ['artifacts', 'hours', 'id', 'outcomes', 'pins', 'prereqs', 'status', 'title', 'worlds'],
      optional: ['games', 'hours_by_lane', 'labs', 'lanes'],
    })
  })

  const roles: Record<string, { required: string[]; optional: string[] }> = {
    'predict (numeric)': { required: ['answer', 'id', 'kcs', 'prompt', 'reveal'], optional: [] },
    item: { required: ['count', 'family', 'level'], optional: [] },
    game: { required: ['id', 'level', 'mode'], optional: [] },
    'trace (synthetic)': { required: ['id', 'tasks'], optional: ['seed'] },
    'lab (forge)': { required: ['id', 'lane', 'stages'], optional: [] },
    'card (notional-machine)': { required: ['id', 'kind'], optional: [] },
    'card (isomorphism)': { required: ['body', 'breaks', 'kind'], optional: ['title'] },
    'card (warning)': { required: ['body', 'kind'], optional: ['title'] },
    figure: { required: ['alt', 'description', 'origin', 'src'], optional: [] },
  }
  for (const [name, expected] of Object.entries(roles)) {
    test(`a ${name} block`, () => {
      const { directive, value } = bodies[name]
      expect(keyRoles(blockBodySchemas[directive], value)).toEqual(expected)
    })
  }
})

describe('lesson front matter', () => {
  const cases: [string, Path, unknown, string[]][] = [
    ['an id in capitals', ['id'], 'tr2.L3', ['id: invalid_format']],
    ['an id with no lesson number', ['id'], 'tr2', ['id: invalid_format']],
    ['an id from another module', ['id'], 'tr3.l1', ['id: custom']],
    ['a module that does not exist', ['module'], 'tr9', ['module: invalid_format']],
    ['a blank title', ['title'], '  ', ['title: invalid_format']],
    ['a title that is not text', ['title'], 7, ['title: invalid_type']],
    ['minutes with a fraction', ['minutes'], 25.5, ['minutes: invalid_type']],
    ['no minutes', ['minutes'], 0, ['minutes: too_small']],
    ['minutes as text', ['minutes'], '25', ['minutes: invalid_type']],
    ['a KC from kernelspace in kcs', ['kcs'], ['ks:t5.kv-capacity'], ['kcs.0: invalid_format']],
    ['a KC named twice', ['kcs'], ['tr2.bubble', 'tr2.bubble'], ['kcs.1: custom']],
    ['a kernelspace ref without ks:', ['builds_on'], ['T5.L7'], ['builds_on.0: invalid_format']],
    ['a status that is not one of the three', ['status'], 'published', ['status: invalid_value']],
    ['a lane that is not B, L or F', ['lanes'], ['G'], ['lanes.0: invalid_value']],
    ['a game id in capitals', ['games'], ['Loop'], ['games.0: invalid_format']],
    ['a lab named twice', ['labs'], ['hybrid-kv', 'hybrid-kv'], ['labs.1: custom']],
  ]
  for (const [name, path, to, expected] of cases) {
    test(`refuses ${name}`, () => expect(problems(lessonFrontMatterSchema, withKey(lesson, path, to))).toEqual(expected))
  }

  test('takes empty lists for kcs and builds_on', () => {
    expect(lessonFrontMatterSchema.safeParse({ ...lesson, kcs: [], builds_on: [] }).success).toBe(true)
  })

  test('refuses a value that is not an object', () => {
    for (const value of [null, 'tr2.l3', [], 7]) expect(lessonFrontMatterSchema.safeParse(value).success).toBe(false)
  })
})

describe('module front matter', () => {
  test('takes the TR2 fixture, which is built from A§4.2’s list of keys', () => {
    const parsed = moduleFrontMatterSchema.parse(module_)
    expect(parsed.id).toBe('tr2')
    expect(parsed.artifacts).toEqual([{ id: 'loop', lane: 'B', title: 'The step-loop sim, toggled until the bubbles close' }])
    expect(parsed.prereqs).toEqual(['ks:T5.L7', 'ks:T0.L6', 'ks:T4.L3'])
  })

  const cases: [string, Path, unknown, string[]][] = [
    ['a lesson id for the module', ['id'], 'tr2.l3', ['id: invalid_format']],
    ['no hours', ['hours'], 0, ['hours: too_small']],
    ['lane hours that do not add up', ['hours_by_lane'], { B: 4, F: 5 }, ['hours_by_lane: custom']],
    ['a lane that is not B, L or F', ['hours_by_lane'], { B: 5, X: 5 }, ['hours_by_lane: unrecognized_keys[X]']],
    ['a lane with no hours', ['hours_by_lane'], { B: 10, F: 0 }, ['hours_by_lane.F: too_small']],
    ['no outcomes', ['outcomes'], [], ['outcomes: too_small']],
    ['a blank outcome', ['outcomes'], ['Name the CPU work', ''], ['outcomes.1: invalid_format']],
    ['no artifacts', ['artifacts'], [], ['artifacts: too_small']],
    ['an artifact in no lane', ['artifacts'], [{ id: 'loop', title: 'The sim' }], ['artifacts.0.lane: invalid_value']],
    [
      'an artifact listed twice',
      ['artifacts'],
      [
        { id: 'loop', lane: 'B', title: 'The sim' },
        { id: 'loop', lane: 'B', title: 'The sim again' },
      ],
      ['artifacts.1.id: custom'],
    ],
    ['a world with a space in it', ['worlds'], ['trace room'], ['worlds.0: invalid_format']],
    ['a prerequisite that is a lesson of ours', ['prereqs'], ['tr2.l3'], ['prereqs.0: invalid_format']],
    ['a prerequisite that is a module that does not exist', ['prereqs'], ['tr9'], ['prereqs.0: invalid_format']],
    ['a lock key in capitals', ['pins'], ['Vllm'], ['pins.0: invalid_format']],
  ]
  for (const [name, path, to, expected] of cases) {
    test(`refuses ${name}`, () => expect(problems(moduleFrontMatterSchema, withKey(module_, path, to))).toEqual(expected))
  }

  test('takes hours_by_lane that add up to hours, in fractions too', () => {
    expect(moduleFrontMatterSchema.safeParse(withKey(module_, ['hours_by_lane'], { B: 7.5, F: 2.5 })).success).toBe(true)
    expect(moduleFrontMatterSchema.safeParse({ ...module_, hours: 0.3, hours_by_lane: { B: 0.1, F: 0.2 } }).success).toBe(true)
  })

  test('takes a module with no worlds, prerequisites or pins', () => {
    expect(moduleFrontMatterSchema.safeParse({ ...module_, worlds: [], prereqs: [], pins: [] }).success).toBe(true)
  })
})

describe('card front matter (A§5.9, W1-T07)', () => {
  const card = { id: 'trace-room-steploop', kind: 'notional-machine', title: 'The engine step loop', world: 'steploop', status: 'draft' }

  test('takes the front matter of the step-loop card that W0-T13 wrote', () => {
    expect(problems(cardFrontMatterSchema, card)).toEqual([])
    expect(problems(cardFrontMatterSchema, splitContent(read('content/cards/trace-room-steploop.md')).frontMatter)).toEqual([])
  })

  test('has five keys, all required, and the card block names it by the same id', () => {
    expect(keyRoles(cardFrontMatterSchema, card)).toEqual({ required: ['id', 'kind', 'status', 'title', 'world'], optional: [] })
    expect(problems(blockBodySchemas.card, { kind: 'notional-machine', id: card.id })).toEqual([])
  })

  test('refuses an unknown key, and a rev, which the compiler adds', () => {
    expect(problems(cardFrontMatterSchema, { ...card, speed: 3 })).toEqual(['(root): unrecognized_keys[speed]'])
    expect(problems(cardFrontMatterSchema, { ...card, rev: 'a'.repeat(64) })).toEqual(['(root): unrecognized_keys[rev]'])
  })

  const cases: [string, Path, unknown, string[]][] = [
    ['an id in capitals', ['id'], 'Trace-Room', ['id: invalid_format']],
    ['an id with a dot', ['id'], 'trace.room', ['id: invalid_format']],
    ['a kind with no file format yet', ['kind'], 'in-production', ['kind: invalid_value']],
    ['a kind that is not a card', ['kind'], 'lesson', ['kind: invalid_value']],
    ['a blank title', ['title'], '  ', ['title: invalid_format']],
    ['a world with a space in it', ['world'], 'step loop', ['world: invalid_format']],
    ['a status that is not draft, review or live', ['status'], 'done', ['status: invalid_value']],
  ]
  for (const [name, path, to, expected] of cases) {
    test(`refuses ${name}`, () => expect(problems(cardFrontMatterSchema, withKey(card, path, to))).toEqual(expected))
  }

  test('says why a kind is refused: the other cards kept in a file arrive with the tasks that decide their format', () => {
    expect(messages(cardFrontMatterSchema, withKey(card, ['kind'], 'build-this'))).toEqual([
      'must be notional-machine: the other cards kept in a file arrive with W1-T13 (In-production, Build-this) and W3-T06 (change)',
    ])
  })

  test('has three parts, in the order of A§5.9', () => {
    expect([...CARD_PARTS]).toEqual(['Models', 'Ignores', 'Calibrated against'])
    const section = between(architecture, '### 5.9 Notional-machine cards', '### 5.10')
    const named = [...section.matchAll(/- \*\*"([^"]+)"\*\*/g)].map((match) => match[1])
    expect(named).toEqual([...CARD_PARTS])
  })
})

describe('the blocks', () => {
  const cases: [string, string, Path, unknown, string[]][] = [
    // predict
    ['a prediction id that is not of its lesson', 'predict (numeric)', ['id'], 'tr2.l3.q1', ['id: invalid_format']],
    ['a blank prompt', 'predict (numeric)', ['prompt'], '', ['prompt: invalid_format']],
    ['a reveal point that does not exist', 'predict (numeric)', ['reveal'], 'whenever', ['reveal: invalid_value']],
    ['no KCs', 'predict (numeric)', ['kcs'], [], ['kcs: too_small']],
    ['a KC named twice', 'predict (numeric)', ['kcs'], ['tr2.bubble', 'tr2.bubble'], ['kcs.1: custom']],
    ['an answer of an unknown kind', 'predict (numeric)', ['answer'], { kind: 'essay' }, ['answer.kind: invalid_union']],
    ['a tolerance that is a percentage', 'predict (numeric)', ['answer', 'rel_tol'], 15, ['answer.rel_tol: too_big']],
    ['a negative tolerance', 'predict (numeric)', ['answer', 'rel_tol'], -0.1, ['answer.rel_tol: too_small']],
    ['a tolerance as text', 'predict (numeric)', ['answer', 'rel_tol'], '15 %', ['answer.rel_tol: invalid_type']],
    ['a unit with a space', 'predict (numeric)', ['answer', 'unit'], 'micro seconds', ['answer.unit: invalid_format']],
    ['one option', 'predict (choice)', ['answer', 'options'], [options[0]], ['answer.options: too_small']],
    ['two options with one id', 'predict (choice)', ['answer', 'options'], [options[0], { id: 'cpu', text: 'Again' }], ['answer.options.1.id: custom']],
    ['an option with no text', 'predict (choice)', ['answer', 'options'], [options[0], { id: 'gpu' }], ['answer.options.1.text: invalid_type']],
    // item
    ['a family with no module', 'item', ['family'], 'bubble-width', ['family: invalid_format']],
    ['a level above 3', 'item', ['level'], 4, ['level: too_big']],
    ['a level below 0', 'item', ['level'], -1, ['level: too_small']],
    ['a level that is a word', 'item', ['level'], 'hard', ['level: invalid_type']],
    ['no items', 'item', ['count'], 0, ['count: too_small']],
    ['half an item', 'item', ['count'], 1.5, ['count: invalid_type']],
    // game
    ['a game id in capitals', 'game', ['id'], 'Loop', ['id: invalid_format']],
    ['a level with a space', 'game', ['level'], 'load or recompute', ['level: invalid_format']],
    ['a mode that is not practice or graded', 'game', ['mode'], 'timed', ['mode: invalid_value']],
    // trace
    ['a seed above 32 bits', 'trace (synthetic)', ['seed'], 4294967296, ['seed: too_big']],
    ['a negative seed', 'trace (synthetic)', ['seed'], -1, ['seed: too_small']],
    ['a seed with a fraction', 'trace (synthetic)', ['seed'], 1.5, ['seed: invalid_type']],
    ['no tasks', 'trace (pinned)', ['tasks'], [], ['tasks: too_small']],
    ['a task named twice', 'trace (pinned)', ['tasks'], ['gap', 'gap'], ['tasks.1: custom']],
    ['a trace id with a slash', 'trace (pinned)', ['id'], 'base/step', ['id: invalid_format']],
    // lab
    ['a lane that is not B, L or F', 'lab (forge)', ['lane'], 'G', ['lane: invalid_value']],
    ['no stages', 'lab (forge)', ['stages'], [], ['stages: too_small']],
    ['a stage with no number', 'lab (forge)', ['stages'], ['s'], ['stages.0: invalid_format']],
    ['a stage named twice', 'lab (forge)', ['stages'], ['s1', 's1'], ['stages.1: custom']],
    ['a lab id in capitals', 'lab (GPU)', ['id'], 'TR8.replay', ['id: invalid_format']],
    // card
    ['a card of a kind that does not exist', 'card (warning)', ['kind'], 'tip', ['kind: invalid_union']],
    ['a notional-machine card with no id', 'card (notional-machine)', ['id'], undefined, ['id: invalid_type']],
    ['an isomorphism that does not say where it breaks', 'card (isomorphism)', ['breaks'], undefined, ['breaks: invalid_type']],
    ['a warning with no text', 'card (warning)', ['body'], ' ', ['body: invalid_format']],
    ['a warning that names a card', 'card (warning)', ['id'], 'x', ['(root): unrecognized_keys[id]']],
    // figure
    ['a figure from a URL', 'figure', ['src'], 'https://example.com/bubble.svg', ['src: invalid_format']],
    ['a figure outside the folder', 'figure', ['src'], '../bubble.svg', ['src: invalid_format']],
    ['a figure at an absolute path', 'figure', ['src'], '/figures/bubble.svg', ['src: invalid_format']],
    ['a figure that is a PNG', 'figure', ['src'], 'figures/bubble.png', ['src: invalid_format']],
    ['a figure with capitals in its path', 'figure', ['src'], 'figures/Bubble.svg', ['src: invalid_format']],
    ['a figure with no alt text', 'figure', ['alt'], '', ['alt: invalid_format']],
    ['a figure with no description', 'figure', ['description'], undefined, ['description: invalid_type']],
    ['a figure from nobody', 'figure', ['origin'], 'found', ['origin: invalid_value']],
  ]
  for (const [name, example_, path, to, expected] of cases) {
    test(`refuses ${name}`, () => {
      const { directive, value } = bodies[example_]
      expect(problems(blockBodySchemas[directive], withKey(value, path, to))).toEqual(expected)
      // The block, with its type, says the same.
      expect(problems(blockSchema, { type: directive, ...withKey(value, path, to) })).toEqual(expected)
    })
  }

  test('an unknown kind of answer or card says what the kinds are', () => {
    expect(messages(blockBodySchemas.predict, withKey(body('predict'), ['answer'], { kind: 'essay' }))).toEqual(['must be numeric, choice or interval'])
    expect(messages(blockBodySchemas.card, { kind: 'tip' })).toEqual(['must be notional-machine, in-production, build-this, change, isomorphism or warning'])
  })

  test('takes a tolerance of 0 (exact) and of 1', () => {
    for (const rel_tol of [0, 1, 0.02]) {
      expect(blockBodySchemas.predict.safeParse(withKey(bodies['predict (numeric)'].value, ['answer', 'rel_tol'], rel_tol)).success).toBe(true)
    }
  })

  test('takes levels 0 to 3', () => {
    for (const level of [0, 1, 2, 3]) expect(blockBodySchemas.item.safeParse({ ...body('item'), level }).success).toBe(true)
  })

  test('takes seeds 0 and 4294967295', () => {
    for (const seed of [0, 4294967295]) expect(blockBodySchemas.trace.safeParse({ id: 'x', seed, tasks: ['gap'] }).success).toBe(true)
  })

  test('takes a figure in a folder', () => {
    expect(blockBodySchemas.figure.safeParse(withKey(bodies.figure.value, ['src'], 'figures/tr2/l3-bubble_1.svg')).success).toBe(true)
  })
})

describe("ARCHITECTURE §4.3's block set", () => {
  const rows = between(architecture, '### 4.3 Block types', '### 4.4')
    .split('\n')
    .filter((line) => line.startsWith('| '))
    .slice(1)
    .map((line) => line.split('|').map((cell) => cell.trim()))

  test('the eight types are the table’s rows, in order', () => {
    const listed = rows.map((cells) => cells[1].replaceAll('`', '').replace(' (implicit)', ''))
    expect(listed).toEqual(['prose', 'predict', 'item', 'game', 'trace', 'lab', 'card', 'figure'])
    expect([...BLOCK_TYPES]).toEqual(listed)
    expect(BLOCK_TYPES.length).toBe(8)
  })

  test('a directive is every type but prose, and each has a body schema', () => {
    expect([...DIRECTIVES]).toEqual(BLOCK_TYPES.filter((type) => type !== 'prose'))
    expect(Object.keys(blockBodySchemas)).toEqual([...DIRECTIVES])
    expect(DIRECTIVES.every(isDirective)).toBe(true)
  })

  test('the card row lists six kinds, and each has an example that passes', () => {
    const cardRow = rows.find((cells) => cells[1] === '`card`')
    if (cardRow === undefined) throw new Error('§4.3 no longer has a card row')
    const kinds = cardRow[2]
      .replace('One of: ', '')
      .replace(/\s*\([^)]*\)/g, '')
      .split(',')
      .map((kind) => kind.trim())
    expect(kinds).toEqual(['notional-machine', 'in-production', 'build-this', 'change', 'isomorphism', 'warning'])
    const examples = Object.entries(bodies).filter(([, { directive }]) => directive === 'card')
    expect(examples.map(([, { value }]) => value.kind)).toEqual(kinds)
    for (const [, { value }] of examples) {
      expect(blockBodySchemas.card.safeParse(value).success).toBe(true)
      expect(blockSchema.safeParse({ type: 'card', ...value }).success).toBe(true)
    }
  })

  test('a ninth type is not a block, and the error lists the eight', () => {
    expect(problems(blockSchema, { type: 'poll', question: 'Does async scheduling help?' })).toEqual(['type: invalid_union'])
    expect(messages(blockSchema, { type: 'poll' })).toEqual(['must be prose, predict, item, game, trace, lab, card or figure'])
    expect(isDirective('poll')).toBe(false)
    expect(Object.hasOwn(blockBodySchemas, 'poll')).toBe(false)
  })

  test('a directive with a type that does not match its body is refused', () => {
    expect(blockSchema.safeParse({ type: 'game', ...body('item') }).success).toBe(false)
    expect(blockSchema.safeParse({ type: 'prose' }).success).toBe(false)
    expect(blockSchema.safeParse({ type: 'prose', md: '  ' }).success).toBe(false)
  })
})

describe('the invalid fixtures', () => {
  test('unknown keys: the name of each one is reported, with the place', () => {
    const file = splitContent(fixture('invalid/lesson-unknown-keys.md'))
    expect(problems(lessonFrontMatterSchema, file.frontMatter)).toEqual(['(root): unrecognized_keys[reviewer]'])
    const found = file.directives.map(({ name, body: yaml }) => {
      if (!isDirective(name)) throw new Error(`${name} is not a directive`)
      return [name, problems(blockBodySchemas[name], yaml)]
    })
    expect(found).toEqual([
      // rel_tolerance is a misspelling, so the tolerance is missing as well as the key being unknown.
      ['predict', ['answer.rel_tol: invalid_type', 'answer: unrecognized_keys[rel_tolerance]', '(root): unrecognized_keys[hint]']],
      ['game', ['(root): unrecognized_keys[seed]']],
      ['item', ['(root): unrecognized_keys[shuffle]']],
    ])
  })

  test('a ninth block type: the name is not a directive', () => {
    const file = splitContent(fixture('invalid/lesson-ninth-block.md'))
    expect(lessonFrontMatterSchema.safeParse(file.frontMatter).success).toBe(true)
    expect(file.directives.map(({ name }) => name).filter((name) => !isDirective(name))).toEqual(['poll'])
  })

  test('bad values: each field is named', () => {
    const file = splitContent(fixture('invalid/lesson-bad-values.md'))
    expect(problems(lessonFrontMatterSchema, file.frontMatter)).toEqual([
      'id: invalid_format',
      'module: invalid_format',
      'title: invalid_format',
      'minutes: invalid_type',
      'kcs.1: custom',
      'builds_on.0: invalid_format',
      'status: invalid_value',
    ])
    const found = file.directives.map(({ name, body: yaml }) => {
      if (!isDirective(name)) throw new Error(`${name} is not a directive`)
      return [name, problems(blockBodySchemas[name], yaml)]
    })
    expect(found).toEqual([
      ['predict', ['id: invalid_format', 'answer.rel_tol: too_big', 'reveal: invalid_value', 'kcs: too_small']],
      ['game', ['id: invalid_format', 'mode: invalid_value']],
      ['item', ['family: invalid_format', 'level: too_big', 'count: too_small']],
    ])
  })
})
