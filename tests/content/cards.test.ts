/*
 * W1-T07: the notional-machine cards (ARCHITECTURE §5.9, D-012), as the compiler reads them. A card is a file of prose with three
 * parts, and the compiler holds it to what makes it a card:
 *
 *   - the front matter is `cardFrontMatterSchema`, and the file's name is the card's id;
 *   - the parts Models, Ignores and Calibrated against are all there, once each, in order, and none is empty;
 *   - the card cites claims (acceptance 1), every claim it cites exists, and each rule under Models names its source;
 *   - its words go through the prose gates: no HTML, no untagged number.
 *
 * Every test that breaks a card breaks a copy of the fixture below and says which line it broke. The cards of the repo itself
 * are held to the same rules in tests/content/world-cards.test.ts.
 */
import { describe, expect, test } from 'bun:test'
import { compiledCardSchema, CARD_PARTS, cardFrontMatterSchema } from '@es/schema'
import type { CompiledCard, ProseFlow } from '@es/schema'
import { canonicalJson } from '../../scripts/content/build.ts'
import { splitCard, unsourcedRules } from '../../scripts/content/cards.ts'
import { LESSON, CARD_COUNT, compile, errors, lineOf, output, read, sampleCard, swap, where } from './support.ts'
import type { Edit } from './support.ts'

const FILE = 'content/cards/fixture-world.md'
const JSON_FILE = 'src/content/generated/cards/fixture-world.json'
const card = sampleCard()
/** The fixture card compiled among the repo's own content. */
const compiled = (edits: Record<string, Edit> = {}) => compile({ [FILE]: card, ...edits })
/** The same, with an edit to the fixture card. */
const broken = (edit: Edit) => compile({ [FILE]: typeof edit === 'string' ? edit : edit === null ? card : edit(card) })

describe('a card that follows the rules', () => {
  const result = compiled()

  test('compiles with nothing to say', () => {
    expect(errors(result)).toEqual([])
    expect(result.diagnostics).toEqual([])
  })

  test('to one JSON file, which is a valid compiled card with its front matter, its intro and its three parts in order', () => {
    const json = JSON.parse(output(result, JSON_FILE)) as CompiledCard
    expect(compiledCardSchema.parse(json)).toEqual(json)
    expect(json).toMatchObject({ id: 'fixture-world', kind: 'notional-machine', title: 'A fixture world', world: 'fixture', status: 'draft' })
    expect(json.intro).toEqual([{ type: 'paragraph', children: [{ type: 'text', text: 'A world for a test.' }] }])
    expect(json.models[0]).toMatchObject({ type: 'list', ordered: false })
    expect(JSON.stringify(json.models)).toContain('{"type":"claim","id":"sample.world.host-step-us"}')
    expect(JSON.stringify(json.ignores)).toContain('Everything else.')
    expect(JSON.stringify(json.calibrated)).toContain('Nothing yet.')
  })

  test('and the repo\'s other cards are still written beside it', () => {
    const files = result.outputs.map((o) => o.path).filter((file) => file.startsWith('src/content/generated/cards/'))
    expect(files.length).toBe(CARD_COUNT + 1)
    expect(files).toContain(JSON_FILE)
  })

  test('twice to the same bytes', () => {
    expect(output(compiled(), JSON_FILE)).toBe(output(result, JSON_FILE))
  })

  test('with a name and three parts that CARD_PARTS and the compiled fields agree on', () => {
    expect([...CARD_PARTS]).toEqual(['Models', 'Ignores', 'Calibrated against'])
    expect(Object.keys(JSON.parse(output(result, JSON_FILE)) as object)).toEqual(['id', 'kind', 'title', 'world', 'status', 'rev', 'intro', 'models', 'ignores', 'calibrated'])
  })

  test('with no intro, an empty one', () => {
    const json = JSON.parse(output(broken(swap('A world for a test.\n\n', '')), JSON_FILE)) as CompiledCard
    expect(json.intro).toEqual([])
  })
})

describe('rev', () => {
  const rev = (edit: Edit): string => (JSON.parse(output(broken(edit), JSON_FILE)) as CompiledCard).rev

  test('does not change when the Markdown is rewrapped, or when only the status moves', () => {
    const base = rev(card)
    expect(rev(swap('The CPU\'s work for one step takes', 'The CPU\'s work\nfor one step\ntakes'))).toBe(base)
    expect(rev(swap('status: draft', 'status: review'))).toBe(base)
  })

  test('changes with the words, the front matter and the claims the card cites', () => {
    const base = rev(card)
    expect(rev(swap('Everything else.', 'Everything else at all.'))).not.toBe(base)
    expect(rev(swap('title: A fixture world', 'title: Another fixture world'))).not.toBe(base)
    const claimed = compile({
      [FILE]: card,
      'content/claims/sample.yaml': swap('text: In the sample world, the CPU\'s work for one step takes 300 microseconds.', 'text: In the sample world, the CPU\'s work for one step takes 301 microseconds.'),
    })
    expect((JSON.parse(output(claimed, JSON_FILE)) as CompiledCard).rev).not.toBe(base)
  })

  test('is a SHA-256 of the canonical JSON, which a reader can recompute from what the card says', () => {
    expect(rev(card)).toMatch(/^[0-9a-f]{64}$/)
    expect(canonicalJson({ b: 1, a: [2] })).toBe('{"a":[2],"b":1}')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The file and its front matter                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the file and its front matter', () => {
  test('a card\'s file name is its id: a card whose front matter says another id fails on the id\'s line', () => {
    const edit = swap('id: fixture-world', 'id: other-world')
    expect(where(broken(edit))).toEqual([`${FILE}:${lineOf(edit(card), 'id: other-world')} id-mismatch`])
  })

  test('a file name that is not a slug fails, because it would be an id that no block could name', () => {
    const result = compile({ 'content/cards/Fixture_World.md': card })
    expect(where(result)).toContain('content/cards/Fixture_World.md:1 bad-file-name')
  })

  test('a card needs front matter', () => {
    expect(where(broken('A card with no front matter.\n'))).toEqual([`${FILE}:1 no-front-matter`])
  })

  /** A break of the front matter, the code and the message of the one error it earns, and the text on the line it is reported on. */
  const schemaCases: [string, Edit, string, RegExp, string][] = [
    ['an unknown key', swap('status: draft', 'status: draft\nspeed: 3'), 'unknown-key', /unknown key "speed" of a card \(a card takes id, kind, title, world, status\)/, 'speed: 3'],
    ['a rev the author wrote', swap('status: draft', 'status: draft\nrev: abc'), 'unknown-key', /the compiler adds rev, a SHA-256 over the authored fields, the words and the claims the card cites/, 'rev: abc'],
    ['a kind of card that has no format yet', swap('kind: notional-machine', 'kind: in-production'), 'schema', /must be notional-machine: the other cards kept in a file arrive with W1-T13 \(In-production, Build-this\) and W3-T06 \(change\)/, 'kind: in-production'],
    ['a title that is blank', swap('title: A fixture world', 'title: "  "'), 'schema', /title: .*blank/, 'title:'],
    ['a world that is not a slug', swap('world: fixture', 'world: Step Loop'), 'schema', /world: /, 'world:'],
    ['a status that is not one of the three', swap('status: draft', 'status: done'), 'schema', /status: .*draft/, 'status:'],
    ['an id that is not a slug', swap('id: fixture-world', 'id: Fixture World'), 'schema', /id: /, 'id:'],
  ]
  for (const [name, edit, code, message, on] of schemaCases) {
    test(`${name} fails the front matter, on the line of the key`, () => {
      const result = broken(edit)
      const [found] = errors(result)
      expect(errors(result).length).toBe(1)
      expect(found).toMatchObject({ file: FILE, code, gate: 'content', line: lineOf(edit === null || typeof edit === 'string' ? card : edit(card), on) })
      expect(found.message).toMatch(message)
    })
  }

  /** A key that is missing is reported on the front matter's first line, where the author has to add it. */
  for (const [key, line] of [['kind: notional-machine\n', 'kind'], ['title: A fixture world\n', 'title'], ['world: fixture\n', 'world'], ['status: draft\n', 'status']] as const) {
    test(`a card with no ${line} fails the front matter`, () => {
      const result = broken(swap(key, ''))
      expect(errors(result).length).toBe(1)
      expect(errors(result)[0]).toMatchObject({ file: FILE, code: 'schema', line: 2 })
      expect(errors(result)[0].message).toMatch(new RegExp(`^${line}: `))
    })
  }

  test('a number in the title needs its tag, as a lesson\'s does', () => {
    const edit = swap('title: A fixture world', 'title: A world of 12 gears')
    expect(where(broken(edit), 'numbers')).toEqual([`${FILE}:${lineOf(edit(card), 'title:')} untagged-number`])
  })

  test('the front matter is the schema of packages/schema, which JSON Schema export reads', () => {
    expect(cardFrontMatterSchema.safeParse({ id: 'a', kind: 'notional-machine', title: 'T', world: 'w', status: 'live' }).success).toBe(true)
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The three parts                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the three parts', () => {
  const parts = /a notional-machine card has three parts, under ## headings and in this order: Models, Ignores, Calibrated against \(A§5\.9\)/

  test('a missing part is named, on the line of the first part', () => {
    const edit = swap('## Ignores\n\n- Everything else.\n\n', '')
    const result = broken(edit)
    expect(where(result)).toEqual([`${FILE}:${lineOf(edit(card), '## Models')} card-parts`])
    expect(errors(result)[0].message).toMatch(parts)
    expect(errors(result)[0].message).toContain('Ignores is missing, and it has Models, Calibrated against')
  })

  test('two missing parts are both named', () => {
    const edit = swap('## Ignores\n\n- Everything else.\n\n## Calibrated against\n\n- Nothing yet.\n', '')
    expect(errors(broken(edit))[0].message).toContain('Ignores, Calibrated against are missing, and it has Models')
  })

  test('a card with no part says it has none, and the error sits after the front matter', () => {
    const result = broken('---\nid: fixture-world\nkind: notional-machine\ntitle: A fixture world\nworld: fixture\nstatus: draft\n---\n\nJust words.\n')
    expect(where(result)).toEqual([`${FILE}:8 card-parts`])
    expect(errors(result)[0].message).toContain('Models, Ignores, Calibrated against are missing, and it has none')
  })

  test('parts out of order fail', () => {
    const edit = (text: string) => text.replace('## Models\n\n- The CPU\'s work for one step takes {{claim:sample.world.host-step-us}} in the sample world.\n\n## Ignores\n\n- Everything else.\n', '## Ignores\n\n- Everything else.\n\n## Models\n\n- The CPU\'s work for one step takes {{claim:sample.world.host-step-us}} in the sample world.\n')
    const result = broken(edit)
    expect(where(result)).toEqual([`${FILE}:${lineOf(edit(card), '## Ignores')} card-parts`])
    expect(errors(result)[0].message).toContain('they are repeated or out of order, and it has Ignores, Models, Calibrated against')
  })

  test('a part that appears twice fails', () => {
    const edit = swap('## Calibrated against', '## Ignores\n\n- Nothing more.\n\n## Calibrated against')
    expect(where(broken(edit))).toEqual([`${FILE}:${lineOf(edit(card), '## Models')} card-parts`])
  })

  test('a part with another name is not a part: the first part\'s heading is the line', () => {
    const edit = swap('## Calibrated against', '## Checked against')
    const result = broken(edit)
    expect(where(result)).toEqual([`${FILE}:${lineOf(edit(card), '## Models')} card-parts`])
    expect(errors(result)[0].message).toContain('Calibrated against is missing')
  })

  test('an empty part is named, on its own heading', () => {
    const edit = swap('## Ignores\n\n- Everything else.\n\n', '## Ignores\n\n')
    const result = broken(edit)
    expect(where(result)).toEqual([`${FILE}:${lineOf(edit(card), '## Ignores')} card-empty-part`])
    expect(errors(result)[0].message).toContain('the part Ignores is empty: list what the world leaves out')
  })

  test('a heading inside a part is ### or deeper, and a ## starts the next part', () => {
    const edit = swap('- Everything else.', '### What is left\n\n- Everything else.')
    expect(where(broken(edit))).toEqual([])
    const json = JSON.parse(output(broken(edit), JSON_FILE)) as CompiledCard
    expect(json.ignores[0]).toMatchObject({ type: 'heading', depth: 3 })
    // A one-level jump is refused, as it is in a lesson: a #### cannot follow the part's ##.
    const deep = swap('- Everything else.', '#### Too deep\n\n- Everything else.')
    expect(where(broken(deep))).toEqual([`${FILE}:${lineOf(deep(card), '#### Too deep')} bad-heading`])
  })

  test('the card\'s own title is front matter: a # heading in the words is refused as it is in a lesson', () => {
    const edit = swap('A world for a test.', '# A fixture world\n\nA world for a test.')
    expect(where(broken(edit))).toEqual([`${FILE}:${lineOf(edit(card), '# A fixture world')} bad-heading`])
  })

  test('a setext heading of the second level hides nothing: it is refused with the part it sits in', () => {
    const edit = swap('- Everything else.', 'Left\n----\n\n- Everything else.')
    expect(where(broken(edit))).toEqual([`${FILE}:${lineOf(edit(card), '## Ignores')} bad-heading`])
  })

  test('a card is prose only: a directive does not belong in it', () => {
    const edit = swap('## Ignores', ':::card\nkind: warning\nbody: Careful.\n:::\n\n## Ignores')
    expect(where(broken(edit))).toEqual([`${FILE}:${lineOf(edit(card), ':::card')} card-directive`])
  })
})

describe('splitCard', () => {
  const segment = (md: string, line = 10) => ({ kind: 'prose' as const, line, md })

  test('splits at the ## headings, with the intro first and the lines of each', () => {
    const chunks = splitCard([segment('Words.\n\n## Models\n\n- a\n\n## Ignores\n\n- b')])
    expect(chunks.map((chunk) => [chunk.name, chunk.headingLine, chunk.firstLine])).toEqual([
      [null, 10, 10],
      ['Models', 12, 13],
      ['Ignores', 16, 17],
    ])
    expect(chunks[1].md).toBe('\n- a\n')
  })

  test('a ## inside fenced code is code, and a ### is no part', () => {
    const chunks = splitCard([segment('## Models\n\n```text\n## Ignores\n```\n\n### Deeper\n\n- a')])
    expect(chunks.map((chunk) => chunk.name)).toEqual(['Models'])
    expect(chunks[0].md).toContain('## Ignores')
    expect(chunks[0].md).toContain('### Deeper')
  })

  test('a heading with trailing blanks is still a part, and a card with no words is no chunk at all', () => {
    expect(splitCard([segment('## Models   \n')]).map((chunk) => chunk.name)).toEqual(['Models'])
    expect(splitCard([])).toEqual([])
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Claims and the rules under Models                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('claims', () => {
  test('a card that cites no claim fails, on the line of Models (accept 1: every card cites claim ids)', () => {
    const edit = swap('{{claim:sample.world.host-step-us}}', 'a number of µs, which the course\'s own rule 3 sets (D-044) [estimated]')
    const result = broken(edit)
    expect(where(result)).toEqual([`${FILE}:${lineOf(edit(card), '## Models')} card-no-claims`])
    expect(errors(result)[0].message).toContain('the card cites no claim')
  })

  test('a claim that does not exist fails as it does in a lesson, and the card is not also told it cites none', () => {
    const edit = swap('{{claim:sample.world.host-step-us}}', '{{claim:sample.world.no-such}}')
    expect(where(broken(edit))).toEqual([`${FILE}:${lineOf(edit(card), 'no-such')} unknown-claim`])
  })

  test('a claim cited in the ignores or the calibration counts for the card, but a rule still needs its own', () => {
    const edit = swap('- Nothing yet.', '- Nothing yet. The decode step is {{claim:sample.world.decode-step-us}}.')
    expect(where(broken(edit))).toEqual([])
    const bare = swap('{{claim:sample.world.host-step-us}}', 'a number of µs [estimated]')
    const both = swap('- Nothing yet.', '- Nothing yet. The decode step is {{claim:sample.world.decode-step-us}}.')
    const result = broken((text) => both(bare(text)))
    expect(errors(result).map((d) => d.code)).toEqual(['card-rule-unsourced'])
  })

  test('every rule under Models names its source, and the one that does not is named by its line', () => {
    const edit = swap('in the sample world.\n', 'in the sample world.\n- The GPU waits for the CPU.\n')
    const result = broken(edit)
    expect(where(result)).toEqual([`${FILE}:${lineOf(edit(card), 'The GPU waits for the CPU.')} card-rule-unsourced`])
    expect(errors(result)[0].message).toContain('this rule names no source')
  })

  test('a decision record is a source for a rule that is the course\'s own, and so is a design section', () => {
    const edit = swap('in the sample world.\n', 'in the sample world.\n- Host work runs on the CPU lane (D-044).\n')
    expect(where(broken(edit))).toEqual([])
    for (const section of ['A§5.3', 'WORLD §2.6', 'GAMES.md §3.1', 'GAMES §3.1', 'ASSESSMENT §4.3']) {
      expect([section, where(broken(swap('in the sample world.\n', `in the sample world.\n- Host work runs on the CPU lane (${section}).\n`)))]).toEqual([section, []])
    }
  })

  test('a section number alone, or a document that is not the course\'s, is no source', () => {
    for (const vague of ['see A§', 'see the section on the CPU lane', 'see the TRACKER §5.3', 'see README §2']) {
      const edit = swap('in the sample world.\n', `in the sample world.\n- Host work runs on the CPU lane, ${vague}.\n`)
      expect([vague, where(broken(edit)).map((entry) => entry.split(' ')[1])]).toEqual([vague, ['card-rule-unsourced']])
    }
  })

  test('a rule over several lines, or with a nested list, is one rule, and a claim anywhere in it is its source', () => {
    const edit = swap(
      '- The CPU\'s work for one step takes {{claim:sample.world.host-step-us}} in the sample world.\n',
      '- The CPU works\n  in the sample world:\n  - for one step: {{claim:sample.world.host-step-us}}\n  - for a decode: {{claim:sample.world.decode-step-us}}\n- Another rule\n  that takes two lines (D-044).\n',
    )
    expect(where(broken(edit))).toEqual([])
    expect(unsourcedRules('- a\n  b\n- c {{claim:x.y}}\n- d D-044\n', 1)).toEqual({ lists: 1, rules: 3, unsourced: [1] })
  })

  test('Models states its rules as a list: a paragraph is no rule to check', () => {
    const edit = swap('- The CPU\'s work for one step takes {{claim:sample.world.host-step-us}} in the sample world.', 'The CPU\'s work for one step takes {{claim:sample.world.host-step-us}} in the sample world.')
    const result = broken(edit)
    expect(where(result)).toEqual([`${FILE}:${lineOf(edit(card), '## Models')} card-rules`])
    expect(errors(result)[0].message).toContain('one item for each rule, and each item names its source')
  })

  test('an ordered list is a list of rules too', () => {
    expect(where(broken(swap('- The CPU\'s work', '1. The CPU\'s work')))).toEqual([])
  })

  test('the lines of unsourcedRules follow the Markdown, a blank line between items included', () => {
    expect(unsourcedRules('- a (D-001)\n\n- b\n\n- c (D-002)\n', 20)).toEqual({ lists: 1, rules: 3, unsourced: [22] })
    expect(unsourcedRules('Words.\n\n- b\n', 5)).toEqual({ lists: 1, rules: 1, unsourced: [7] })
    expect(unsourcedRules('Only words.', 1)).toEqual({ lists: 0, rules: 0, unsourced: [] })
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The prose gates                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the prose gates apply to a card\'s words', () => {
  test('a number needs a tag, a claim or code, on its own line', () => {
    const edit = swap('- Everything else.', '- Everything else, from 12 sources.')
    expect(where(broken(edit), 'numbers')).toEqual([`${FILE}:${lineOf(edit(card), 'from 12 sources')} untagged-number`])
    expect(where(broken(swap('- Everything else.', '- Everything else, from 12 sources [estimated].')))).toEqual([])
    expect(where(broken(swap('- Everything else.', '- Everything else, from `12` sources.')))).toEqual([])
  })

  test('a tag holds nothing else: the source and the date belong in a claim', () => {
    const edit = swap('- Everything else.', '- Everything else [measured at v0.33.0].')
    expect(where(broken(edit), 'numbers')).toEqual([`${FILE}:${lineOf(edit(card), 'measured at')} bad-tag`])
  })

  test('HTML is refused, as it is everywhere in content', () => {
    const edit = swap('- Everything else.', '- Everything <b>else</b>.')
    expect(errors(broken(edit)).map((d) => d.code)).toContain('html')
  })

  test('a link out goes over https, to a route or to an anchor', () => {
    expect(where(broken(swap('- Everything else.', '- See [the docs](http://example.com).')))).toEqual([`${FILE}:${lineOf(card.replace('- Everything else.', '- See [the docs](http://example.com).'), 'the docs')} bad-link`])
    expect(where(broken(swap('- Everything else.', '- See [the docs](https://example.com/docs).')))).toEqual([])
  })

})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Blocks and modules that name a card                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('a block that names a card', () => {
  const lesson = read(LESSON)
  const WARNING = 'kind: warning\ntitle: A model\nbody: The browser world is a model, and the real engine is the judge.'
  const block = (kind: string, id: string) => swap(WARNING, `kind: ${kind}\nid: ${id}`)

  test('finds a card that compiled', () => {
    expect(where(compile({ [FILE]: card, [LESSON]: block('notional-machine', 'fixture-world') }))).toEqual([])
  })

  test('does not find a card that is not there, and says which file it would be', () => {
    const result = compile({ [LESSON]: block('notional-machine', 'fixture-world') })
    expect(where(result)).toEqual([`${LESSON}:${lineOf(block('notional-machine', 'fixture-world')(lesson), 'id: fixture-world')} unknown-card`])
    expect(errors(result)[0].message).toContain('content/cards/fixture-world.md')
  })

  test('refuses a card of another kind than the block says', () => {
    const result = compile({ [FILE]: card, [LESSON]: block('in-production', 'fixture-world') })
    expect(where(result)).toEqual([`${LESSON}:${lineOf(block('in-production', 'fixture-world')(lesson), 'kind: in-production')} card-kind`])
    expect(errors(result)[0].message).toContain('the card "fixture-world" is a notional-machine card, and this block says in-production')
  })

  test('does not also complain about a card whose own file is broken: the file is reported once', () => {
    const result = compile({ [FILE]: swap('status: draft', 'status: done')(card), [LESSON]: block('notional-machine', 'fixture-world') })
    expect(where(result)).toEqual([`${FILE}:${lineOf(card, 'status: draft')} schema`])
  })

  test('a README in content/cards is no card', () => {
    const result = compile({ 'content/cards/README.md': '# The cards\n\nNot a card.\n' })
    expect(where(result)).toEqual([])
    expect(result.outputs.some((o) => o.path.includes('README'))).toBe(false)
  })
})

describe('a part holds what prose holds', () => {
  test('a list, a table and a code block, as a lesson\'s prose does', () => {
    const edit = swap('- Everything else.', '- Everything else:\n\n| What | Why |\n|---|---|\n| time | `integer` |\n\n```text\nschedule -> launch\n```\n')
    const result = broken(edit)
    expect(where(result)).toEqual([])
    const json = JSON.parse(output(result, JSON_FILE)) as CompiledCard
    expect(json.ignores.map((flow: ProseFlow) => flow.type)).toEqual(['list', 'table', 'code'])
  })
})
