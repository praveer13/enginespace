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

  test('all four tags are chips', () => {
    const { body } = prose('[measured] [derived] [estimated] [unverified]')
    expect(body[0]).toMatchObject({ children: ['measured', 'derived', 'estimated', 'unverified'].flatMap((tag, i) => (i === 0 ? [{ type: 'tag', tag }] : [text(' '), { type: 'tag', tag }])) })
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
      'untagged numbers "300", "12" in "It takes 300 µs and 12 steps.": tag the sentence [measured], [derived], [estimated] or [unverified], replace the number with a {{claim:id}}, or put an identifier in backticks',
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
