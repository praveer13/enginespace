/*
 * scripts/pages/document.ts: what prepare-pages reads from a document and what it writes into one (ARCHITECTURE §3.2, W0-T19).
 * `render` changes three things of the template and leaves every other byte alone; `inspect` and `cspProblems` say what is wrong
 * with a document. The documents are small strings, and the oracle that reads them back is tests/pages/support.ts's own.
 */
import { describe, expect, test } from 'bun:test'
import { CSP, CSP_META } from '../../scripts/pages/csp'
import { cspProblems, decodeHtml, escapeHtml, inlineScriptProblems, inspect, MARK, policyProblems, policyTokens, render, shell } from '../../scripts/pages/document'
import type { HeadElement } from '../../scripts/pages/document'
import { headOf, templateHtml, titleOf } from './support'

const PAGE = { title: 'Course map · enginespace', heading: 'Course map', description: 'Every module, with its lanes.' }

describe('escaping', () => {
  const nasty = `Q&A <b> "quoted" 'single' &amp; · é`

  test('escapeHtml leaves nothing that a parser would read as markup, and decodeHtml undoes it', () => {
    const escaped = escapeHtml(nasty)
    expect(escaped).toBe('Q&amp;A &lt;b&gt; &quot;quoted&quot; &#39;single&#39; &amp;amp; · é')
    expect(escaped).not.toMatch(/[<>"']/)
    expect(decodeHtml(escaped)).toBe(nasty)
  })

  test('decodeHtml reads numeric references too, and leaves a reference it does not know as it is', () => {
    expect(decodeHtml('&#183; &#xB7; &#X41; &AMP; &nbsp;')).toBe('· · A & &nbsp;')
  })
})

describe('shell', () => {
  test('is a heading, the sentence, a way home under the base, and a note for a reader without scripts', () => {
    expect(shell(PAGE, '/enginespace/')).toBe(
      '<main><h1>Course map</h1><p>Every module, with its lanes.</p><p><a href="/enginespace/">Go to the front page</a></p>' +
        '<noscript><p>enginespace runs in your browser, so this page needs JavaScript.</p></noscript></main>',
    )
  })

  test('escapes what it is given, so that a title cannot break out of its element', () => {
    const html = shell({ heading: '<script>alert(1)</script>', description: 'a "b" & c' }, '/')
    expect(html).not.toContain('<script>')
    expect(html).toContain('<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>')
    expect(html).toContain('<p>a &quot;b&quot; &amp; c</p>')
  })

  test('carries no style and no colour or font of its own: the stylesheet dresses the bare elements', () => {
    expect(shell(PAGE, '/')).not.toMatch(/style=|class=|#[0-9a-f]{3,6}|font/i)
  })
})

describe('render', () => {
  const template = templateHtml('/enginespace/')

  test('changes the title, the description and the inside of the root, and nothing else of the template', async () => {
    const out = await render(template, PAGE, '/enginespace/')
    const expected = template
      .replace('<title>enginespace</title>', `<title>${escapeHtml(PAGE.title)}</title>`)
      .replace('<meta name="description" content="The front page of the course." />', `<meta name="description" content="${PAGE.description}" />`)
      .replace('<div id="root"><main><h1>Front page</h1></main></div>', `<div id="root">${shell(PAGE, '/enginespace/')}</div>`)
      .replace('  </body>', `  ${MARK}\n</body>`)
    expect(out).toBe(expected)
  })

  test('keeps the policy as the first element after the charset, and every asset at its path under the base', async () => {
    const out = await render(template, PAGE, '/enginespace/')
    const head = await headOf(out)
    expect(head[1].attrs['http-equiv']).toBe('Content-Security-Policy')
    expect(out).toContain(CSP_META)
    expect(out).toContain('src="/enginespace/assets/index-abc123.js"')
    expect(out).toContain('href="/enginespace/assets/index-abc123.css"')
  })

  test('writes a title and a description that a parser reads back as the text that was given, whatever it holds', async () => {
    const page = { title: `Q&A: <b> "x" 'y' · enginespace`, heading: 'h', description: `D&D <i> "z" 'w'` }
    const out = await render(template, page, '/')
    expect(await titleOf(out)).toBe(page.title)
    const info = await inspect(out)
    expect(info.title).toBe(page.title)
    expect(info.description).toBe(page.description)
    expect(out.match(/<title>/g)?.length).toBe(1)
  })

  test('adds a description at the end of the head when the template has none', async () => {
    const bare = template.replace(/ {4}<meta name="description"[^>]*>\n/, '')
    expect(bare).not.toContain('name="description"')
    const out = await render(bare, PAGE, '/')
    const head = await headOf(out)
    expect(head.at(-1)).toEqual({ tag: 'meta', attrs: { name: 'description', content: PAGE.description } })
    expect(head.filter((el) => el.attrs.name === 'description')).toHaveLength(1)
    expect(head.at(-2)?.attrs.rel).toBe('stylesheet')
  })

  test('replaces everything inside the root, however deep, and nothing outside it', async () => {
    const deep = templateHtml('/', { inside: '<section><div><div>inner-one</div></div><!-- </div> --><script>var s = "</div>"</script></section><p>inner-two</p>' })
    const out = await render(deep, PAGE, '/')
    expect(out).toContain(`<div id="root">${shell(PAGE, '/')}</div>`)
    expect(out).not.toContain('inner-')
    expect(out).not.toContain('var s')
  })

  test('is not fooled by a root, a title or a description in a comment', async () => {
    const tricky = templateHtml('/').replace('<head>', '<head>\n    <!-- <title>old</title> <meta name="description" content="old"> -->').replace('<body>', '<body>\n    <!-- <div id="root"></div> -->')
    const out = await render(tricky, PAGE, '/')
    expect(out).toContain('<!-- <title>old</title> <meta name="description" content="old"> -->')
    expect(out).toContain('<!-- <div id="root"></div> -->')
    expect((await inspect(out)).title).toBe(PAGE.title)
  })

  test("leaves alone a <title> or a description that is not the head's, such as the title of an SVG in the page", async () => {
    const poster = '<svg role="img" viewBox="0 0 10 10"><title>The poster</title><desc>d</desc></svg><meta name="description" content="not the document\'s">'
    const withPoster = templateHtml('/', { inside: `<main><h1>Front page</h1>${poster}</main>` })
    const info = await inspect(withPoster)
    expect(info.title).toBe('enginespace')
    expect(info.description).toBe('The front page of the course.')
    const out = await render(withPoster, PAGE, '/')
    expect((await inspect(out)).title).toBe(PAGE.title)
    expect(out).not.toContain('The poster')
  })

  test('marks the document as its own, once, before the end of the body', async () => {
    const out = await render(template, PAGE, '/')
    expect(out.split(MARK).length - 1).toBe(1)
    expect(out.indexOf(MARK)).toBeLessThan(out.indexOf('</body>'))
    // A document it wrote is one it may write again; the template is not.
    expect(template).not.toContain(MARK)
  })

  test('is a function of its inputs: rendering the same page twice gives the same bytes', async () => {
    expect(await render(template, PAGE, '/enginespace/')).toBe(await render(template, PAGE, '/enginespace/'))
  })

  test('throws when the template has no title, no root, or two roots', async () => {
    await expect(render(template.replace('<title>enginespace</title>', ''), PAGE, '/')).rejects.toThrow(/0 <title> elements/)
    await expect(render(template.replace('<div id="root">', '<div id="app">'), PAGE, '/')).rejects.toThrow(/0 <div id="root"> elements/)
    await expect(render(template.replace('</body>', '<div id="root"></div></body>'), PAGE, '/')).rejects.toThrow(/2 <div id="root"> elements/)
  })
})

describe('inspect', () => {
  test('lists the head in order, and reads the title, the description and the entry script', async () => {
    const info = await inspect(templateHtml('/enginespace/', { title: 'Q&amp;A', description: 'a &quot;b&quot;' }))
    expect(info.head.map((el) => el.tag)).toEqual(['meta', 'meta', 'meta', 'title', 'meta', 'script', 'link', 'link'])
    expect(info.head[0].attrs.charset).toBe('UTF-8')
    expect(info.title).toBe('Q&A')
    expect(info.description).toBe('a "b"')
    expect(info.entry).toBe('/enginespace/assets/index-abc123.js')
    expect(info.roots).toBe(1)
  })

  test('says what is missing as null, and counts the roots', async () => {
    const info = await inspect('<html><head><meta charset="UTF-8"></head><body><div id="root"></div><div id="root"></div></body></html>')
    expect([info.title, info.description, info.entry, info.roots]).toEqual([null, null, null, 2])
  })

  test('finds the text outside the root, and none that belongs to a script, a style, a template or <noscript>', async () => {
    const quiet = templateHtml('/').replace('<body>', '<body>\n    <script>var a = 1</script><style>b { c: d }</style><template><p>t</p></template><noscript>enable scripts</noscript>')
    expect((await inspect(quiet)).outside).toBe('')
    const loud = templateHtml('/').replace('<body>', '<body>\n    <header>Fire <b>the</b>\n next step</header>')
    expect((await inspect(loud)).outside).toBe('Fire the next step')
  })

  test('counts the scripts that run from their own text, and not the ones that load a file or only hold data', async () => {
    const withScripts = (...scripts: string[]) => templateHtml('/').replace('</head>', `${scripts.join('\n')}\n  </head>`)
    const count = async (...scripts: string[]) => (await inspect(withScripts(...scripts))).inlineScripts
    expect(await count()).toBe(0)
    expect(await count('<script src="/a.js"></script>', '<script type="module" src="/b.js"></script>')).toBe(0)
    expect(await count('<script type="application/json">{"a":1}</script>', '<script type="application/ld+json">{}</script>', '<script type="text/plain">x</script>')).toBe(0)
    expect(await count('<script>var a = 1</script>')).toBe(1)
    expect(await count('<script type="module">import "/x.js"</script>', '<script type="text/javascript">1</script>', '<SCRIPT TYPE="application/javascript">2</SCRIPT>', '<script type="importmap">{}</script>')).toBe(4)
    // The body counts too, and a script in a template or a comment is not run.
    expect((await inspect(templateHtml('/').replace('</body>', '<script>boot()</script></body>'))).inlineScripts).toBe(1)
    expect((await inspect(withScripts('<!-- <script>x</script> -->'))).inlineScripts).toBe(0)
  })

  test('leaves out what is inside the root, however much', async () => {
    expect((await inspect(templateHtml('/', { inside: '<main><h1>Front page</h1><p>Promise</p></main>' }))).outside).toBe('')
  })
})

describe('cspProblems', () => {
  const head = async (html: string): Promise<HeadElement[]> => (await inspect(html)).head

  test('has nothing to say about a document with the policy right after its charset', async () => {
    expect(cspProblems(await head(templateHtml('/')))).toEqual([])
  })

  test('says when there is no policy at all', async () => {
    expect(cspProblems(await head(templateHtml('/', { policy: false })))).toEqual(['it has no Content-Security-Policy <meta>'])
  })

  test('says when the policy is not the first element after the charset, and what is', async () => {
    const moved = templateHtml('/').replace(`    ${CSP_META}\n`, '').replace('    <title>', `    <title>x</title>\n    ${CSP_META}\n    <title>`)
    const problems = cspProblems(await head(moved))
    expect(problems[0]).toBe('the first element after <meta charset> is <meta>, and must be the Content-Security-Policy <meta>')
  })

  test('says when a script or a stylesheet comes ahead of the policy, which binds only what follows it', async () => {
    const late = templateHtml('/', { policy: false }).replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <script src="/early.js"></script>\n    <link rel="stylesheet" href="/early.css">\n    ${CSP_META}`)
    expect(cspProblems(await head(late))).toEqual([
      'the first element after <meta charset> is <script>, and must be the Content-Security-Policy <meta>',
      '<script>, <link> come before the policy, which binds only what follows it',
    ])
  })

  test('says when a document has no charset, or two policies', async () => {
    const noCharset = templateHtml('/').replace('<meta charset="UTF-8" />', '')
    expect(cspProblems(await head(noCharset))).toEqual(['it has no <meta charset>'])
    const twice = templateHtml('/').replace(CSP_META, `${CSP_META}\n    ${CSP_META}`)
    expect(cspProblems(await head(twice))).toEqual(['it has 2 Content-Security-Policy <meta> elements, and must have one'])
  })

  test("says when the policy allows 'unsafe-eval', and not for 'wasm-unsafe-eval'", async () => {
    const loose = templateHtml('/').replace("'wasm-unsafe-eval'", "'wasm-unsafe-eval' 'unsafe-eval'")
    expect(cspProblems(await head(loose))).toEqual(["the policy allows 'unsafe-eval'", 'the policy is not the one of ARCHITECTURE §12 (scripts/pages/csp.ts)'])
    expect(policyTokens(CSP)).toContain("'wasm-unsafe-eval'")
    expect(policyTokens(CSP)).not.toContain("'unsafe-eval'")
  })

  test("says when the policy is any other than §12's", async () => {
    const other = templateHtml('/').replace("connect-src 'self'", 'connect-src *')
    expect(cspProblems(await head(other))).toEqual(['the policy is not the one of ARCHITECTURE §12 (scripts/pages/csp.ts)'])
  })
})

describe('inlineScriptProblems and policyProblems', () => {
  test('say nothing about a document with no inline script, and how many when it has some', async () => {
    expect(inlineScriptProblems({ inlineScripts: 0 })).toEqual([])
    expect(inlineScriptProblems({ inlineScripts: 1 })).toEqual([
      "it has 1 inline script, which the policy blocks (script-src 'self' has no 'unsafe-inline'): put the code in a module file",
    ])
    expect(inlineScriptProblems({ inlineScripts: 3 })[0]).toContain('3 inline scripts')
  })

  test('policyProblems puts the placement first and the inline script after, and is empty for a sound document', async () => {
    expect(policyProblems(await inspect(templateHtml('/')))).toEqual([])
    const bad = templateHtml('/', { policy: false }).replace('</body>', '<script>boot()</script></body>')
    expect(policyProblems(await inspect(bad))).toEqual(['it has no Content-Security-Policy <meta>', expect.stringContaining('1 inline script')])
  })
})
