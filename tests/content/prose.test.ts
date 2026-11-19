/*
 * Prose (ARCHITECTURE §4.1, §4.4): the restricted token tree, what it refuses, the lines it reports, and the number gate.
 *
 * The tree is tested by what comes out of `compileProse`, and the gate by `untaggedNumbers` on sentences, so a rule of the
 * gate is a row of a table that anyone can read and argue with.
 */
import { describe, expect, test } from 'bun:test'
import { compileProse, countWords, numberMessage, sentences, untaggedNumbers, withoutCode } from '../../scripts/content/prose.ts'
import type { ProseContext } from '../../scripts/content/prose.ts'
import type { Diagnostic } from '../../scripts/content/parse.ts'

const CLAIMS = ['vllm.release.requires-python', 'sample.world.host-step-us']

/** Compiles Markdown that starts on `first`, and returns what came out, what was reported and which claims were cited. */
function prose(md: string, first = 1, claims: readonly string[] = CLAIMS) {
  const out: Diagnostic[] = []
  const ctx: ProseContext = { file: 'x.md', claims: new Set(claims), cited: new Set(), outline: { depth: 1 }, words: { count: 0 }, out }
  const body = compileProse(md, first, ctx)
  return { body, out, cited: [...ctx.cited].sort(), words: ctx.words.count, outline: ctx.outline.depth }
}

const text = (value: string) => ({ type: 'text', text: value })
const codes = (md: string, first = 1) => prose(md, first).out.map((d) => `${d.line} ${d.code}`)

describe('the nodes', () => {
  test('a paragraph holds text, emphasis, strong, code, a link, a claim, a kernelspace ref and a tag', () => {
    const { body, out, cited } = prose('Plain *soft* and **loud** with `code` and [a link](https://example.com/x) then {{claim:vllm.release.requires-python}} and {{ks:T5.L7}} [measured].')
    expect(out).toEqual([])
    expect(cited).toEqual(['vllm.release.requires-python'])
    expect(body).toEqual([
      {
        type: 'paragraph',
        children: [
          text('Plain '),
          { type: 'em', children: [text('soft')] },
          text(' and '),
          { type: 'strong', children: [text('loud')] },
          text(' with '),
          { type: 'code', text: 'code' },
          text(' and '),
          { type: 'link', href: 'https://example.com/x', children: [text('a link')] },
          text(' then '),
          { type: 'claim', id: 'vllm.release.requires-python' },
          text(' and '),
          { type: 'ks', ref: 'ks:T5.L7' },
          text(' '),
          { type: 'tag', tag: 'measured' },
          text('.'),
        ],
      },
    ])
  })

  test('all five tags are chips', () => {
    const { body } = prose('[measured] [derived] [estimated] [synthetic] [unverified]')
    expect(body[0]).toMatchObject({ children: ['measured', 'derived', 'estimated', 'synthetic', 'unverified'].flatMap((tag, i) => (i === 0 ? [{ type: 'tag', tag }] : [text(' '), { type: 'tag', tag }])) })
  })

  test('a kernelspace KC reads as a ref too', () => {
    expect(prose('{{ks:t5.kv-capacity}}').body).toEqual([{ type: 'paragraph', children: [{ type: 'ks', ref: 'ks:t5.kv-capacity' }] }])
  })

  test('whitespace folds to one space, so a rewrap changes nothing', () => {
    const wrapped = prose('one   two\nthree\n\tfour').body
    const flat = prose('one two three four').body
    expect(wrapped).toEqual(flat)
    expect(wrapped).toEqual([{ type: 'paragraph', children: [text('one two three four')] }])
  })

  test('an escape is text, and text on both sides of it is one node', () => {
    expect(prose('a \\* b').body).toEqual([{ type: 'paragraph', children: [text('a * b')] }])
  })

  test('a code span holds a reference, a tag and a number as they are', () => {
    const { body, out } = prose('Write `{{claim:nope.nope}}` and `[measured]` and `300` freely.')
    expect(out).toEqual([])
    expect(body[0]).toMatchObject({ children: [text('Write '), { type: 'code', text: '{{claim:nope.nope}}' }, text(' and '), { type: 'code', text: '[measured]' }, text(' and '), { type: 'code', text: '300' }, text(' freely.')] })
  })

  test('emphasis nests', () => {
    expect(prose('*a **b** c*').body).toEqual([{ type: 'paragraph', children: [{ type: 'em', children: [text('a '), { type: 'strong', children: [text('b')] }, text(' c')] }] }])
  })

  test('headings, lists, a table and a code block', () => {
    const md = [
      '## One',
      '',
      '### Two',
      '',
      '- tight *a*',
      '- tight b',
      '  - nested',
      '',
      '3. third',
      '4. fourth',
      '',
      '| a | b |',
      '|:--|--:|',
      '| `c` | {{claim:sample.world.host-step-us}} |',
      '',
      '```rust title=x',
      'let x = 1 < 2;',
      '```',
      '',
      '    indented code',
    ].join('\n')
    const { body, out } = prose(md)
    expect(out).toEqual([])
    expect(body.map((node) => node.type)).toEqual(['heading', 'heading', 'list', 'list', 'table', 'code', 'code'])
    expect(body[0]).toEqual({ type: 'heading', depth: 2, children: [text('One')] })
    expect(body[1]).toMatchObject({ type: 'heading', depth: 3 })
    expect(body[2]).toEqual({
      type: 'list',
      ordered: false,
      items: [
        [{ type: 'paragraph', children: [text('tight '), { type: 'em', children: [text('a')] }] }],
        [
          { type: 'paragraph', children: [text('tight b')] },
          { type: 'list', ordered: false, items: [[{ type: 'paragraph', children: [text('nested')] }]] },
        ],
      ],
    })
    expect(body[3]).toMatchObject({ type: 'list', ordered: true, start: 3 })
    expect(body[4]).toEqual({
      type: 'table',
      align: ['left', 'right'],
      head: [[text('a')], [text('b')]],
      rows: [[[{ type: 'code', text: 'c' }], [{ type: 'claim', id: 'sample.world.host-step-us' }]]],
    })
    expect(body[5]).toEqual({ type: 'code', lang: 'rust', text: 'let x = 1 < 2;' })
    expect(body[6]).toEqual({ type: 'code', text: 'indented code' })
  })

  test('an ordered list that starts at one carries no start', () => {
    expect(prose('1. a\n2. b').body[0]).not.toHaveProperty('start')
  })

  test('a loose list item keeps its paragraphs', () => {
    const { body } = prose('- first\n\n  more of first\n\n- second')
    expect(body[0]).toMatchObject({ type: 'list', items: [[{ type: 'paragraph' }, { type: 'paragraph' }], [{ type: 'paragraph' }]] })
  })
})

describe('headings', () => {
  test('start at two, and go one level deeper at a time', () => {
    expect(codes('# Title')).toEqual(['1 bad-heading'])
    expect(codes('### Skips two')).toEqual(['1 bad-heading'])
    expect(codes('## a\n\n#### skips')).toEqual(['3 bad-heading'])
    expect(codes('##### too deep')).toEqual(['1 bad-heading'])
  })

  test('may come back up from any depth', () => {
    expect(codes('## a\n\n### b\n\n#### c\n\n## d\n\n### e')).toEqual([])
  })

  test('are measured from the heading before, across the segments of one file', () => {
    const out: Diagnostic[] = []
    const ctx: ProseContext = { file: 'x.md', claims: new Set(), cited: new Set(), outline: { depth: 1 }, words: { count: 0 }, out }
    compileProse('## one', 1, ctx)
    compileProse('### two', 5, ctx)
    compileProse('##### lost', 9, ctx)
    expect(out.map((d) => d.line)).toEqual([9])
    expect(ctx.outline.depth).toBe(3)
  })
})

describe('what prose refuses, each on its line', () => {
  const refused: [string, string, string][] = [
    ['an image', 'Look: ![alt](a.png)', 'unsupported-markdown'],
    ['a quote', '> quoted', 'unsupported-markdown'],
    ['a rule', '---', 'unsupported-markdown'],
    ['a hard break', 'one  \ntwo', 'unsupported-markdown'],
    ['strikethrough', 'a ~~b~~ c', 'unsupported-markdown'],
    ['a task list', '- [ ] todo', 'unsupported-markdown'],
    ['a link definition', '[x]: https://example.com', 'unsupported-markdown'],
    ['inline HTML', 'a <b>b</b> c', 'html'],
    ['block HTML', '<div>x</div>', 'html'],
    ['an HTML comment', 'a <!-- x --> b', 'html'],
    ['an HTML entity', 'a &amp; b', 'html'],
    ['a javascript link', '[x](javascript:alert(1))', 'bad-link'],
    ['a plain http link', '[x](http://example.com)', 'bad-link'],
    ['a protocol-relative link', '[x](//example.com)', 'bad-link'],
    ['a mailto link', '[x](mailto:a@example.com)', 'bad-link'],
    ['a relative file link', '[x](other.md)', 'bad-link'],
    ['a code fence with a strange language', '```a/b\nx\n```', 'unsupported-markdown'],
  ]
  for (const [what, md, code] of refused) {
    test(what, () => {
      const found = codes(`Fine first line.\n\n${md}`, 10)
      expect(found.length).toBeGreaterThan(0)
      expect(found.every((entry) => entry.endsWith(code))).toBe(true)
      expect(found[0].startsWith('12 ')).toBe(true)
    })
  }

  test('a task list is one finding, at its list', () => {
    expect(codes('- [ ] todo\n- [x] done')).toEqual(['1 unsupported-markdown', '2 unsupported-markdown'])
  })

  test('a bad link leaves its words in the line, so the tree stays whole', () => {
    const { body, out } = prose('See [the words](javascript:alert(1)) here.')
    expect(out.map((d) => d.code)).toEqual(['bad-link'])
    expect(body).toEqual([{ type: 'paragraph', children: [text('See '), text('the words'), text(' here.')] }])
  })

  test('links that are allowed', () => {
    expect(codes('[a](https://example.com/p?q=1#h) [b](/map) [c](#why)')).toEqual([])
  })

  test('an open tag and its close tag are two findings in the compiler, and the compiler reports the line once', () => {
    expect(codes('a <b>b</b> c')).toEqual(['1 html', '1 html'])
  })
})

describe('references and tags', () => {
  test('an unknown claim is reported and not cited', () => {
    const { out, cited, body } = prose('Words {{claim:nope.nope}} words.')
    expect(out.map((d) => `${d.code}`)).toEqual(['unknown-claim'])
    expect(cited).toEqual([])
    expect(body[0]).toMatchObject({ children: [text('Words words.')] })
  })

  const bad: [string, string][] = [
    ['an unknown kind', '{{note:x}}'],
    ['a bare word', '{{x}}'],
    ['a claim id that is not dotted words', '{{claim:Not An Id}}'],
    ['a claim with a single word', '{{claim:single}}'],
    ['a kernelspace ref that is not one', '{{ks:nonsense}}'],
    ['an empty reference', '{{}}'],
    ['an unclosed reference', 'a {{claim:vllm.release.requires-python b'],
    ['a stray closing', 'a }} b'],
  ]
  for (const [what, md] of bad) {
    test(`${what} is a bad-ref`, () => {
      expect(codes(md)).toEqual(['1 bad-ref'])
    })
  }

  test('a tag must be the bare word in brackets', () => {
    expect(codes('x [measured 2026-11-03] y')).toEqual(['1 bad-tag'])
    expect(codes('x [measured: PyPI] y')).toEqual(['1 bad-tag'])
    expect(codes('x [Estimated] y')).toEqual(['1 bad-tag'])
    expect(codes('x [measured] y')).toEqual([])
  })

  test('a reference reports the line it is on, in a table, a list and a heading', () => {
    expect(codes('## head {{claim:nope.a}}\n\n- item\n- {{claim:nope.b}}\n\n| a |\n|---|\n| {{claim:nope.c}} |')).toEqual(['1 unknown-claim', '4 unknown-claim', '8 unknown-claim'])
  })

  test('a reference works inside emphasis and a link', () => {
    const { body, out, cited } = prose('*{{claim:sample.world.host-step-us}}* and [see {{claim:vllm.release.requires-python}}](/map)')
    expect(out).toEqual([])
    expect(cited).toEqual(['sample.world.host-step-us', 'vllm.release.requires-python'])
    expect(body[0]).toMatchObject({ children: [{ type: 'em', children: [{ type: 'claim' }] }, text(' and '), { type: 'link', children: [text('see '), { type: 'claim' }] }] })
  })
})

describe('lines', () => {
  test('are counted from the first line of the segment, through blank lines, lists, tables and code', () => {
    const md = ['First.', '', 'Second {{claim:nope.a}}.', '', '- a', '- b {{claim:nope.b}}', '', '```', '{{claim:nope.not-read}}', '```', '', 'Last {{claim:nope.c}}.'].join('\n')
    expect(codes(md, 40)).toEqual(['42 unknown-claim', '45 unknown-claim', '51 unknown-claim'])
  })

  test('are counted through a wrapped paragraph', () => {
    expect(codes('one\ntwo\nthree {{claim:nope.a}}\nfour {{claim:nope.b}}', 7)).toEqual(['9 unknown-claim', '10 unknown-claim'])
  })

  test('are right after emphasis that spans a line', () => {
    expect(codes('*one\ntwo* then\n{{claim:nope.a}}')).toEqual(['3 unknown-claim'])
  })
})

describe("the number gate: a model's number is [synthetic], never [measured]", () => {
  test('a sentence that names the course\'s model as the source and tags a number [measured] is refused', () => {
    expect(codes("The course's sim printed 957 µs [measured] on that card.")).toEqual(['1 model-number-measured'])
    expect(codes("Printed by the course's model on 2026-11-08, the step takes 957 µs [measured].")).toEqual(['1 model-number-measured'])
  })

  test('the same sentence is fine as [synthetic], and a source that was read is still [measured]', () => {
    expect(codes("The course's sim printed 957 µs [synthetic] on that card.")).toEqual([])
    expect(codes('The scheduler is 92 lines [measured] at `bb823b3`, read on 2026-11-05.')).toEqual([])
  })

  test('a table whose caption says the model printed it cannot tag a column [measured]', () => {
    const table = '| Step | Time, µs [measured] |\n|---|---|\n| one | 957 |'
    expect(codes(`Printed by the course's model on 2026-11-08 at \`b5fb81a\`.\n\n${table}`).map((code) => code.split(' ')[1])).toEqual(['model-number-measured'])
    expect(codes(`Printed by the course's model on 2026-11-08 at \`b5fb81a\`.\n\n${table.replace('measured', 'synthetic')}`)).toEqual([])
    expect(codes(`The lines of each file at a pin.\n\n${table}`)).toEqual([])
  })

  test('the forms the lessons use for the model are read as the model: its sim, step loop, port, model and own world', () => {
    for (const sentence of [
      'The step loop gives 860 µs [measured] for that grammar.',
      'The step loop measures 860 µs [measured] for that grammar.',
      'The sim counts 12 bubbles [measured].',
      'The port printed 5 rows [measured].',
      'The model counts it as 29 replays and 28 attention launches [measured].',
      'The model prices a page at 16 tokens [measured].',
      "Here is the effect in the course's own world, which holds 1,159 requests [measured].",
      "That is two stages [measured], counted in the course's lifecycle model on 2026-11-05.",
      'Here the course’s sim prints 860 µs [measured], with a curly apostrophe.',
      'The step loop reports 860 µs [measured] for that grammar.',
      'The simulation gives 860 µs [measured] for that grammar.',
    ]) {
      expect([sentence, codes(sentence)]).toEqual([sentence, ['1 model-number-measured']])
    }
  })

  test('the gate does not refuse a source that was read, a quoted run or a count of a fixture', () => {
    for (const sentence of [
      'The scheduler is 92 lines [measured] at `bb823b3`, read on 2026-11-05.',
      "The README's second example shows the size of the effect, in a run with one pause of 1.4 s [measured] on the server.",
      'The S-LoRA paper reports up to 4 times the throughput [measured].',
      'It has been held to a second port of the same Python, written separately, on 6,400 [measured] drawn cases for each runner.',
      'The model has 28 layers [measured] in its config.',
    ]) {
      expect([sentence, codes(sentence)]).toEqual([sentence, []])
    }
  })

  test("the model of a sentence is the course's only where the words say so, and a quote of the model's table is refused with both ways out", () => {
    // "The model" as the LLM, after "of", and a network port that gives a number, are not the course's model.
    expect(codes('The tokenizer of the model counts 32,000 entries [measured] in its config at the pin.')).toEqual([])
    expect(codes('The README says the port gives 8000 by default [measured].')).toEqual([])
    // The price of letting a network port give a number: write 'the course's port'.
    expect(codes('The port gave 86 graphs [measured] on that seed.')).toEqual([])
    // A source's number that equals a cell of the model's table, in the same `##` part, is still refused: the gate reads words and
    // cannot tell a source's 957 from the model's. The message says how to keep it [measured].
    const part = [
      "The table is one steady step. Printed by the course's model on 2026-11-08 at `b5fb81a`.",
      '',
      '| The phase | 70B on H100, µs [synthetic] | Batch [synthetic] |',
      '|---|---|---|',
      '| The CPU work | 957 | 24 |',
      '',
    ].join('\n')
    for (const sentence of ['The pinned scheduler file is 957 lines [measured] at `4ba787e`.', 'vLLM caps the batch at 24 requests [measured] at `4ba787e`.']) {
      const out = prose(`${part}\n${sentence}`).out
      expect([sentence, out.map((d) => `${d.line} ${d.code}`)]).toEqual([sentence, ['7 model-number-measured']])
      expect(out[0].message).toContain("or, if the number is a source's own and only equals the table's, name the source in another `##` part")
    }
    // The caption's own [measured] sentence gets its way out too.
    const caption = prose("The server finishes 8.6 requests a second [measured]. Printed by the course's model on 2026-11-04 at `fd168df`.\n\n| Load [estimated] | p50, ms [synthetic] |\n|---|---|\n| 0.5 | 63 |").out
    expect(caption.map((d) => d.code)).toEqual(['model-number-measured'])
    expect(caption[0].message).toContain("or, if the number is a source's own, name the source in another `##` part")
  })

  test("a caption that names the model makes its own sentences, its table, a later table of the part and a sentence quoting the table the model's", () => {
    const caption = "Every row uses the same server, which is 8.6 requests a second [measured]. Printed by the course's model on 2026-11-04 at `fd168df`."
    expect(codes(`${caption}\n\n| Load [estimated] | p50, ms [synthetic] |\n|---|---|\n| 0.5 | 63 |`)).toEqual(['1 model-number-measured'])
    const part = [
      '## The same rule on two cards',
      '',
      "The table is one steady step. Printed by the course's model on 2026-11-08 at `b5fb81a`.",
      '',
      '| The phase | 70B on H100, µs [synthetic] | Small model, µs [synthetic] |',
      '|---|---|---|',
      '| The CPU work | 957 | 764 |',
      '',
      "Two things stand out. The GPU's idle time before a step is its CPU's work, row for row: 957 µs and 764 µs [measured].",
      '',
      'The same runs, read another way.',
      '',
      '| Load [estimated] | In flight, L [measured] |',
      '|---|---|',
      '| 0.5 | 16.7 |',
    ].join('\n')
    expect(codes(part)).toEqual(['9 model-number-measured', '13 model-number-measured'])
    // A cell of the model's own table tagged [measured] is the table's error.
    expect(codes(part.replace('| The CPU work | 957 | 764 |', '| The CPU work | 957 [measured] | 764 |')).map((code) => code.split(' ')[1])).toEqual(['model-number-measured', 'model-number-measured', 'model-number-measured'])
    // A sentence of the part that names its own source and quotes none of the table's numbers stays [measured].
    expect(codes(part.split('\n').slice(0, 7).join('\n') + '\n\nThe pinned file is 8,090 lines [measured].')).toEqual([])
  })

  test('a ## heading ends the part: a table under a caption of its own that does not name the model is read by its own words', () => {
    const md = [
      "Printed by the course's model on 2026-11-04 at `fd168df`.",
      '',
      '| Load [estimated] | Met, requests/s [synthetic] |',
      '|---|---|',
      '| 0.5 | 8.05 |',
      '',
      "## Little's law",
      '',
      'The lines of each file at a pin, 8.05 of them [measured].',
      '',
      '| File | Lines [measured] |',
      '|---|---|',
      '| core.py | 1,240 |',
    ].join('\n')
    expect(codes(md)).toEqual([])
  })

  test("each of the check's mutations of the lessons is refused, as the lesson stands with it", () => {
    const mutations: [string, string][] = [
      // 1. tr2 lesson 1: a header under its "Printed by the course's model" caption.
      ['tr2.l1 header', "The table is one steady step. Printed by the course's model on 2026-11-08 at `b5fb81a`.\n\n| The step's phase | 70B on H100, µs [measured] | Small model, µs [synthetic] |\n|---|---|---|\n| `schedule` | 883 | 510 |"],
      // 2. tr5a lesson 1: a sentence that names the course's model.
      ['tr5a.l1 S', "The course's model keeps `S` of 2 [measured]: the newest page holds the state being updated."],
      // 3. tr1 lesson 3: the lifecycle model's count.
      ['tr1.l3 stages', "That is two stages [measured], counted in the course's lifecycle model on 2026-11-05 at `905b782`."],
      // 4. tr2 lesson 1: the two idle times, after the model's table in the same part.
      ['tr2.l1 idle', "Printed by the course's model on 2026-11-08 at `b5fb81a`.\n\n| The step's phase | 70B on H100, µs [synthetic] | Small model, µs [synthetic] |\n|---|---|---|\n| The GPU's idle time before the step | 957 | 764 |\n\nTwo things stand out. The GPU's idle time before a step is its CPU's work, row for row: 957 µs and 764 µs [measured]."],
      // 5. tr8 lesson 1: a rate in the caption of the model's table.
      ['tr8.l1 rate', "The open loop sends 1,500 requests [estimated] at half of what the server can finish, which is 8.6 requests a second [measured]. Printed by the course's model on 2026-11-04 at `fd168df`, with the seed `7`.\n\n| Harness | p99, ms [synthetic] |\n|---|---|\n| open | 140 |"],
      // 6. tr6 lesson 5: the step loop's gap.
      ['tr6.l5 gap', 'The overlapped gap is then 860 µs [derived], and the step loop measures 860 µs [measured], against 160 µs [measured] for the same grammar without drafts.'],
      // 7. tr2 lesson 5: the model's count of the piecewise launch.
      ['tr2.l5 count', 'The model counts it as 29 replays and 28 attention launches [measured], which is the second row of the figure above.'],
      // 8. tr8 lesson 4: the second table of the goodput runs, whose caption names the model.
      ['tr8.l4 law', "The same four runs of the course's model, read through the law, over their arrival windows and counting a request from its send.\n\n| Load, times capacity [estimated] | In flight, L [measured] | Throughput times mean latency [synthetic] | Residual [synthetic] |\n|---|---|---|---|\n| 0.5 | 16.7 | 16.4 | 1.8% |"],
    ]
    for (const [name, md] of mutations) expect([name, codes(md).map((code) => code.split(' ')[1])]).toEqual([name, ['model-number-measured']])
  })
})

describe('the number gate: which digit runs need a tag', () => {
  /** A sentence and the numbers in it that the gate finds. */
  const table: [string, string[]][] = [
    // Tagged: any one of the four tags in the sentence covers every number in it.
    ['A 300 µs host step [unverified] hides behind a 2.1 ms decode step [estimated].', []],
    ['It takes 300 µs, 5 of them, [measured].', []],
    ['[derived] It takes 300 µs.', []],
    // Identifiers are not quantities.
    ['Use H100 or A100 or L40S or B200 or p99 or p50.', []],
    ['The bf16, fp8, FP8 and int4 formats, and x86_64.', []],
    ['See tr2.l3, T5.L7, ks:t5.kv-capacity and tr2.bubble-width.', []],
    ['D-014, W0-T13, A§4.2, §4.2, #12, v0.33.0, Llama-3-70B, Qwen3-0.6B and gpt-4o.', []],
    ['TR2 and T5 and L7 come first.', []],
    // Dates and ordinals.
    ['It shipped on 2026-11-03, and in 2026-11, at 2026-11-03T12:00:00Z.', []],
    ['The 1st, 2nd, 3rd and 4th, and the 21st.', []],
    // A full stop after an abbreviation does not end a sentence.
    ['An engine, e.g. 300 µs of host work [measured], i.e. no more.', []],
    ['Lists, etc. Then 5 here [measured].', []],
    ['Lists and so on, etc. And 5 here.', ['5']],
    // Quantities.
    ['It takes 300 µs.', ['300']],
    ['Between 5-10 requests.', ['5', '10']],
    ['Between 5–10 requests, or 5—10.', ['5', '10', '5', '10']],
    ['It has 80GB, runs 300µs and gains 2x.', ['80', '300', '2']],
    ['With k=4 draft tokens, 5/10 of them, at 3:1.', ['4', '5', '10', '3', '1']],
    ['About 20% faster, 1,024 sequences, 0.33.0, $24-54 and −5.', ['20', '1,024', '0.33.0', '24', '54', '5']],
    ['Step 1: do x.', ['1']],
    ['The RTX 4090 and the rtx 4090.', ['4090', '4090']],
    ['See Fig. 3.', ['3']],
    ['A hash 4ba787ec9959 is not an id.', ['4']],
    ['A lone 7', ['7']],
    // A tag in another sentence does not cover this one.
    ['Two sentences. The second has 7 [estimated]. The third has 8.', ['8']],
    ['It costs 5. Really [measured].', ['5']],
    ['Does it help? Maybe 3! Or 4 [measured].', ['3']],
    // Lines break inside a sentence, and not between sentences of one paragraph.
    ['Hello\nworld has 12\nlines.', ['12']],
    ['Hello\nworld has 12\nlines [measured].', []],
    // The stand-in for code and references holds nothing.
    ['The \uFFFC items, and 3 more.', ['3']],
    ['The \uFFFC items.', []],
  ]
  for (const [sentence, expected] of table) {
    test(JSON.stringify(sentence), () => {
      expect(untaggedNumbers(sentence).flatMap((finding) => finding.numbers)).toEqual(expected)
    })
  }

  test('a finding says where its first number starts and which sentence it is in', () => {
    const [finding] = untaggedNumbers('Nothing here. But 12 here [estimated]. And 34 here.')
    const sentence = 'Nothing here. But 12 here [estimated]. And 34 here.'
    expect(finding).toEqual({ index: sentence.indexOf('34'), numbers: ['34'], sentence: 'And 34 here.' })
  })

  test('one finding per sentence, listing every number', () => {
    expect(untaggedNumbers('Has 1 and 2. Has 3.').map((finding) => finding.numbers)).toEqual([['1', '2'], ['3']])
  })

  test('sentences split after a stop, a mark and an ellipsis, and not inside a number or after an abbreviation', () => {
    expect(sentences('One. Two! Three? Four… Five.').map((s) => s.text.trim())).toEqual(['One.', 'Two!', 'Three?', 'Four…', 'Five.'])
    expect(sentences('Version 2.1 is out. e.g. this one.').map((s) => s.text.trim())).toEqual(['Version 2.1 is out.', 'e.g. this one.'])
    expect(sentences('A (closing paren.) Next.').map((s) => s.text.trim())).toEqual(['A (closing paren.)', 'Next.'])
    expect(sentences('')).toEqual([])
  })

  test('the message names the numbers and the way out', () => {
    const [finding] = untaggedNumbers('It takes 300 µs and 12 steps.')
    expect(numberMessage(finding)).toBe(
      'untagged numbers "300", "12" in "It takes 300 µs and 12 steps.": tag the sentence [measured], [derived], [estimated], [synthetic] or [unverified], replace the number with a {{claim:id}}, or put an identifier in backticks',
    )
  })

  test('a long sentence is cut in the message', () => {
    const [finding] = untaggedNumbers(`${'word '.repeat(60)}12.`)
    expect(numberMessage(finding)).toContain('…": tag the sentence')
  })

  test('code is taken out of a plain string before it is read', () => {
    expect(untaggedNumbers(withoutCode('Set `n_tokens = 512` and `k` to 4 `x`.')).flatMap((f) => f.numbers)).toEqual(['4'])
  })

  test('the words of a text are counted without the stand-ins', () => {
    expect(countWords('one two\n  three \uFFFC four')).toBe(4)
    expect(countWords('')).toBe(0)
  })
})

describe('the number gate on prose', () => {
  test('reads emphasis, links and headings, and skips code', () => {
    expect(codes('*about 5 steps* and [12 more](/map) and `7` and **9**.')).toEqual(['1 untagged-number'])
    expect(codes('## Step 2 here\n\nFine.')).toEqual(['1 untagged-number'])
  })

  test('counts a claim as holding no digit, and a tag as covering its sentence', () => {
    expect(codes('{{claim:sample.world.host-step-us}} against 300 µs [estimated].')).toEqual([])
    expect(codes('{{claim:sample.world.host-step-us}} against 300 µs.')).toEqual(['1 untagged-number'])
  })

  test('reads a list item and a table cell as sentences of their own', () => {
    expect(codes('- one 1\n- two 2 [measured]\n- three')).toEqual(['1 untagged-number'])
    expect(codes('| n | m |\n|---|---|\n| 4 | 5 [measured] |')).toEqual(['3 untagged-number'])
  })

  test('a tag in a column header covers that column\'s cells', () => {
    expect(codes('| n [estimated] | m |\n|---|---|\n| 4 | 5 |\n| 6 | 7 |')).toEqual(['3 untagged-number', '4 untagged-number'])
    expect(codes('| n [estimated] | m [measured] |\n|---|---|\n| 4 | 5 |')).toEqual([])
  })

  test('a code block holds any number', () => {
    expect(codes('```text\nstep 1 takes 300 us\n```')).toEqual([])
  })

  test('counts the words that are read: prose and code blocks, and not code spans or references', () => {
    expect(prose('One two three.\n\n```\nfour five\n```\n\n- six `seven` {{claim:sample.world.host-step-us}}').words).toBe(6)
  })
})
