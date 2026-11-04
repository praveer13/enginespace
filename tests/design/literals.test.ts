/*
 * W0-T05, accept 1: outside src/design, src/ holds no literal colour and no font-family name. Pages and games reach the
 * look only through the token roles and the components (the agent brief's rule 9).
 *
 * TypeScript files are read as syntax trees, so a slot's name passed as a prop (`slot="green"`) or a word in prose is not
 * a colour; a colour is a hex value, a colour function, a named colour or a Tailwind palette class in code, or a named
 * colour given to a style property. CSS files are read declaration by declaration. The scanner tests itself first, on
 * snippets that must and must not be caught.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'
import ts from 'typescript'

const root = path.resolve(import.meta.dirname, '../..')
const SRC = path.join(root, 'src')
const DESIGN = path.join(SRC, 'design')

/** The faces the design system self-hosts, and the platform families a stack could name. */
const FACES = ['Big Shoulders', 'Doto', 'Handjet', 'Permanent Marker', 'Atkinson Hyperlegible']
const FAMILY_WORDS = [
  ...FACES,
  'system-ui',
  '-apple-system',
  'BlinkMacSystemFont',
  'Segoe UI',
  'Helvetica',
  'Arial',
  'Roboto',
  'Inter',
  'Menlo',
  'Consolas',
  'Courier',
  'Times New Roman',
  'Georgia',
  'ui-monospace',
  'ui-sans-serif',
  'ui-serif',
]

/** The CSS named colours (CSS Color 4), except the keywords that are not colours of their own. */
const NAMED_COLOURS = `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue
chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta
darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink
deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey
honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow
lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime
limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen
mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue
saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle
tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(/\s+/)
const NAMED = new RegExp(`^(?:${NAMED_COLOURS.join('|')})$`, 'i')

const HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-zA-Z_-])/
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\(/i
const TAILWIND_PALETTE =
  /(?:^|[\s"'`:])(?:[a-z]+:)*(?:bg|text|border|ring|ring-offset|fill|stroke|from|via|to|outline|decoration|shadow|accent|caret|divide|placeholder)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|black|white)(?:\/\d+)?(?=$|[\s"'`])/
const TAILWIND_ARBITRARY = /(?:^|[\s"'`:])(?:font-\[|(?:bg|text|border|fill|stroke|from|via|to|shadow)-\[(?:#|rgb|hsl|oklch|color))/
const STYLE_PROPERTY =
  /^(?:color|background|backgroundColor|border|borderColor|border[A-Z]\w*Color|outline|outlineColor|fill|stroke|stopColor|floodColor|lightingColor|textDecorationColor|caretColor|accentColor|columnRuleColor|boxShadow|textShadow)$/
const FAMILY_PROPERTY = /^(?:fontFamily|font|font-family)$/

export interface Hit {
  file: string
  line: number
  what: string
}

/** The literal colours and font names in one TypeScript source. */
export function scanTypeScript(file: string, text: string): Hit[] {
  const hits: Hit[] = []
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const line = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
  const hit = (node: ts.Node, what: string) => hits.push({ file, line: line(node), what })

  const checkText = (node: ts.Node, value: string) => {
    if (HEX.test(value)) hit(node, `a hex colour in "${value}"`)
    if (COLOUR_FUNCTION.test(value)) hit(node, `a colour function in "${value}"`)
    if (TAILWIND_PALETTE.test(value)) hit(node, `a Tailwind palette class in "${value}"`)
    if (TAILWIND_ARBITRARY.test(value)) hit(node, `a Tailwind arbitrary colour or face in "${value}"`)
    for (const word of FACES) if (value.includes(word)) hit(node, `the face "${word}" in "${value}"`)
  }

  /** The name a value is assigned to: an object property or a JSX attribute. */
  const assignedTo = (node: ts.Node): string | undefined => {
    const parent = node.parent
    if (ts.isPropertyAssignment(parent) && parent.initializer === node) return parent.name.getText(source).replace(/['"]/g, '')
    if (ts.isJsxAttribute(parent)) return parent.name.getText(source)
    if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) return parent.parent.name.getText(source)
    return undefined
  }

  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const value = node.text
      checkText(node, value)
      const property = assignedTo(node)
      if (property && STYLE_PROPERTY.test(property) && value.split(/[\s,()]+/).some((word) => NAMED.test(word)))
        hit(node, `a named colour given to ${property}: "${value}"`)
      if (property && FAMILY_PROPERTY.test(property) && !/^var\(/.test(value)) hit(node, `a font family given to ${property}: "${value}"`)
    } else if (ts.isJsxText(node)) {
      if (HEX.test(node.text) || COLOUR_FUNCTION.test(node.text)) hit(node, `a colour in JSX text "${node.text.trim()}"`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return hits
}

/** The literal colours and font names in one stylesheet outside the design system. */
export function scanCss(file: string, text: string): Hit[] {
  const hits: Hit[] = []
  postcss.parse(text, { from: file }).walkDecls((decl) => {
    const line = decl.source?.start?.line ?? 0
    const value = decl.value
    if (HEX.test(value) || COLOUR_FUNCTION.test(value)) hits.push({ file, line, what: `a colour in ${decl.prop}: ${value}` })
    if (value.split(/[\s,()]+/).some((word) => NAMED.test(word)) && !/^(?:transition|animation|will-change|content)/.test(decl.prop))
      hits.push({ file, line, what: `a named colour in ${decl.prop}: ${value}` })
    const familyDeclared = /^font(?:-family)?$/.test(decl.prop) && !/^var\(/.test(value.trim())
    if (familyDeclared || FAMILY_WORDS.some((word) => value.includes(word)))
      hits.push({ file, line, what: `a font family in ${decl.prop}: ${value}` })
  })
  return hits
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return full === DESIGN ? [] : filesUnder(full)
    return /\.(tsx?|css)$/.test(entry.name) ? [full] : []
  })
}

describe('the scanner', () => {
  const caught = (snippet: string, file = 'probe.tsx') => scanTypeScript(file, snippet).length > 0

  test.each([
    ['a hex colour', `const c = '#c8102e'`],
    ['a short hex colour', `<div style={{ color: '#fff' }} />`],
    ['rgb()', `const shadow = 'rgb(0 0 0 / 0.5)'`],
    ['hsl()', `const c = \`hsl(\${h} 50% 50%)\``],
    ['oklch()', `const c = 'oklch(0.7 0.1 30)'`],
    ['a named colour in a style object', `<p style={{ color: 'red' }} />`],
    ['a named colour as an SVG fill', `<path fill="black" />`],
    ['a Tailwind palette class', `<p className="text-red-600" />`],
    ['a Tailwind white', `<p className="p-4 bg-white" />`],
    ['a Tailwind arbitrary colour', `<p className="bg-[#123456]" />`],
    ['a Tailwind arbitrary face', `<p className="font-['Inter']" />`],
    ['a self-hosted face by name', `const f = 'Doto'`],
    ['a font family in a style object', `<p style={{ fontFamily: 'Georgia, serif' }} />`],
  ])('catches %s', (_, snippet) => {
    expect(caught(snippet)).toBe(true)
  })

  test.each([
    ['a slot named as a prop', `<TapeLabel slot="green">grp 2</TapeLabel>`],
    ['a fragment link', `<a href="#main">Skip</a>`],
    ['a token in a style object', `<p style={{ color: 'var(--es-text-1)' }} />`],
    ['a token as a face', `<p style={{ fontFamily: 'var(--es-font-body)' }} />`],
    ['a ticket number', `<Ticket head="No. 0042" />`],
    ['a word in prose', `<p>The red board, and the white one.</p>`],
    ['a token class', `<p className="bg-paper text-paper-ink font-display" />`],
  ])('passes %s', (_, snippet) => {
    expect(scanTypeScript('probe.tsx', snippet)).toEqual([])
  })

  test('catches colours and faces in a stylesheet, and passes tokens', () => {
    expect(scanCss('probe.css', 'p { color: #fff; }').length).toBe(1)
    expect(scanCss('probe.css', 'p { background: white; }').length).toBe(1)
    expect(scanCss('probe.css', "p { font-family: 'Inter', sans-serif; }").length).toBe(1)
    expect(scanCss('probe.css', 'p { color: var(--es-text-1); font-family: var(--es-font-body); }')).toEqual([])
  })
})

describe('src/ outside src/design', () => {
  const files = filesUnder(SRC)

  test('the scan covers the app: pages, the shell and the stylesheet entry', () => {
    const relative = files.map((file) => path.relative(root, file))
    expect(relative).toContain('src/App.tsx')
    expect(relative).toContain('src/pages/Design.tsx')
    expect(relative).toContain('src/index.css')
    expect(relative.some((file) => file.startsWith('src/design/'))).toBe(false)
  })

  test('holds no literal colour and no font-family name', () => {
    const hits = files.flatMap((file) => {
      const text = readFileSync(file, 'utf8')
      const relative = path.relative(root, file)
      return file.endsWith('.css') ? scanCss(relative, text) : scanTypeScript(relative, text)
    })
    expect(hits.map(({ file, line, what }) => `${file}:${line}: ${what}`)).toEqual([])
  })
})
