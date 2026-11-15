/*
 * verify:tokens (ARCHITECTURE §10.2, §11.2; W0-T05). The design system's gate.
 *
 *   bun scripts/verify-tokens.ts               check the tree, and list every role with its value
 *   bun scripts/verify-tokens.ts --css <file>  check <file> in place of src/design/tokens.css (a fixture)
 *   bun scripts/verify-tokens.ts --write       regenerate src/design/tokens.css from src/design/tokens.ts
 *
 * It fails when:
 *   - a value is a placeholder: a CSS system colour (Canvas, CanvasText, GrayText, Highlight, HighlightText, LinkText,
 *     Mark, ButtonFace, ButtonText, Field, FieldText and the rest) outside a `forced-colors` block, a system font stack
 *     standing in for a face, an empty value, or a `placeholder` marker, in any CSS under src/design or src/index.css;
 *   - a role in tokens.ts has no CSS variable, or a different value, in tokens.css, or tokens.css is not what tokens.ts
 *     generates;
 *   - a font role's first family is not a face that src/design/fonts.css self-hosts;
 *   - a declared contrast pair falls below its §11.2 threshold in any colour scheme the system ships.
 *
 * Exit status: 0 when every check passes, 1 when one fails, 2 for a usage error.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import postcss, { type AtRule, type Container, type Declaration } from 'postcss'
import { contrastRatio, formatRatio } from '../src/design/contrast.ts'
import {
  cssVar,
  FONT_PARTS,
  fontVar,
  isColorRole,
  PAIRS,
  ROLE_GROUPS,
  ROLE_NAMES,
  resolveColor,
  roleOf,
  rolesIn,
  SCHEME_NAMES,
  SCHEMES,
  THRESHOLDS,
  tokensCss,
  type RoleName,
} from '../src/design/tokens.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const DESIGN = path.join(ROOT, 'src/design')
export const TOKENS_CSS = path.join(DESIGN, 'tokens.css')

/** CSS system colours (CSS Color 4 §6.2, and the deprecated ones browsers still accept). */
export const SYSTEM_COLOURS = [
  'AccentColor',
  'AccentColorText',
  'ActiveText',
  'ButtonBorder',
  'ButtonFace',
  'ButtonText',
  'Canvas',
  'CanvasText',
  'Field',
  'FieldText',
  'GrayText',
  'Highlight',
  'HighlightText',
  'LinkText',
  'Mark',
  'MarkText',
  'SelectedItem',
  'SelectedItemText',
  'VisitedText',
  'ActiveBorder',
  'ActiveCaption',
  'AppWorkspace',
  'Background',
  'ButtonHighlight',
  'ButtonShadow',
  'CaptionText',
  'InactiveBorder',
  'InactiveCaption',
  'InactiveCaptionText',
  'InfoBackground',
  'InfoText',
  'Menu',
  'MenuText',
  'Scrollbar',
  'ThreeDDarkShadow',
  'ThreeDFace',
  'ThreeDHighlight',
  'ThreeDLightShadow',
  'ThreeDShadow',
  'Window',
  'WindowFrame',
  'WindowText',
]
const SYSTEM_COLOUR = new RegExp(`(?<![\\w-])(${SYSTEM_COLOURS.join('|')})(?![\\w-])`, 'i')
/** Properties whose values name properties, animations or text, never a colour: "background" there is not a colour. */
const COLOUR_FREE_PROPERTY =
  /^(transition(-property)?|will-change|animation(-name)?|font(-family)?|content|counter-(reset|increment|set)|grid(-[a-z-]+)?|contain|container(-name)?|view-transition-name)$/

/** Families that belong to the platform, not to the design: a stack that starts with one is a placeholder. */
export const SYSTEM_FAMILIES = [
  'system-ui',
  '-apple-system',
  'blinkmacsystemfont',
  'segoe ui',
  'roboto',
  'helvetica',
  'helvetica neue',
  'arial',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'ui-rounded',
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'fantasy',
  'menlo',
  'monaco',
  'consolas',
  'courier',
  'courier new',
  'times',
  'times new roman',
  'georgia',
  'noto sans',
  'liberation sans',
  'dejavu sans',
  'apple color emoji',
  'segoe ui emoji',
  'emoji',
  'math',
  'fangsong',
]

export interface Finding {
  file: string
  line: number
  message: string
}

/** The at-rules around a node, innermost first. */
function atRulesAround(node: Declaration): AtRule[] {
  const found: AtRule[] = []
  let parent: Container | undefined = node.parent as Container | undefined
  while (parent && parent.type !== 'root') {
    if (parent.type === 'atrule') found.push(parent as AtRule)
    parent = parent.parent as Container | undefined
  }
  return found
}

/** A value with its url(...) and quoted strings taken out, so a data URI or a font name cannot look like a keyword. */
const bareValue = (value: string) => value.replace(/url\((?:[^()]|\([^()]*\))*\)/gi, 'url()').replace(/(["'])(?:\\.|(?!\1).)*\1/g, '""')

/** The family names a font stack starts with, lower-cased and unquoted. */
export function firstFamily(stack: string): string {
  const first = stack.split(',')[0] ?? ''
  return first
    .trim()
    .replace(/^(["'])(.*)\1$/, '$2')
    .toLowerCase()
}

/** The families every @font-face in a stylesheet declares, lower-cased. */
export function declaredFaces(css: string): Set<string> {
  const faces = new Set<string>()
  postcss.parse(css).walkAtRules('font-face', (rule) => {
    rule.walkDecls('font-family', (decl) => {
      faces.add(firstFamily(decl.value))
    })
  })
  return faces
}

/**
 * Every placeholder in one stylesheet: a system colour outside a forced-colors block, a font stack that does not start
 * with a self-hosted face, an empty value, or a `placeholder` marker in a comment or a value.
 */
export function findPlaceholders(css: string, file: string, faces: ReadonlySet<string>): Finding[] {
  const findings: Finding[] = []
  const root = postcss.parse(css, { from: file })
  const at = (node: { source?: { start?: { line: number } } }) => node.source?.start?.line ?? 0

  root.walkComments((comment) => {
    if (/placeholder/i.test(comment.text))
      findings.push({ file, line: at(comment), message: `a "placeholder" marker in a comment: /* ${comment.text.trim()} */` })
  })
  root.walkDecls((decl) => {
    const where = atRulesAround(decl)
    const inFontFace = where.some((rule) => rule.name === 'font-face')
    const inForcedColors = where.some((rule) => rule.name === 'media' && /forced-colors/i.test(rule.params))
    const value = decl.value.trim()
    const name = `${decl.prop}: ${value}`
    if (value === '') {
      findings.push({ file, line: at(decl), message: `an empty value: ${decl.prop}` })
      return
    }
    if (/placeholder/i.test(value)) findings.push({ file, line: at(decl), message: `a "placeholder" marker in a value: ${name}` })
    const keyword = COLOUR_FREE_PROPERTY.test(decl.prop) ? null : SYSTEM_COLOUR.exec(bareValue(value))
    if (keyword && !inForcedColors && !inFontFace) {
      findings.push({ file, line: at(decl), message: `a CSS system colour outside a forced-colors block (${keyword[1]}): ${name}` })
    }
    const isStack = decl.prop === 'font-family' || /^--es-font-[a-z]+$/.test(decl.prop)
    if (isStack && !inFontFace && !value.startsWith('var(')) {
      const first = firstFamily(value)
      if (SYSTEM_FAMILIES.includes(first)) {
        findings.push({ file, line: at(decl), message: `a system font stack standing in for a face (${first}): ${name}` })
      } else if (!faces.has(first)) {
        findings.push({
          file,
          line: at(decl),
          message: `a font stack whose first family "${first}" is not self-hosted in src/design/fonts.css: ${name}`,
        })
      }
    }
  })
  return findings
}

/** The `--es-*` custom properties a stylesheet sets on `:root` outside any at-rule, in order. */
export function rootVariables(css: string): Map<string, string> {
  const variables = new Map<string, string>()
  postcss.parse(css).each((node) => {
    if (node.type !== 'rule' || node.selector.trim() !== ':root') return
    node.walkDecls(/^--es-/, (decl) => {
      variables.set(decl.prop, decl.value.trim())
    })
  })
  return variables
}

/** What tokens.ts says each variable must hold in the light scheme. */
export function expectedVariables(): Map<string, string> {
  const css = tokensCss()
  return rootVariables(css)
}

/** The CSS files the placeholder check reads: everything under src/design, and the stylesheet entry. */
function designStylesheets(): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.css')) files.push(full)
    }
  }
  walk(DESIGN)
  const entry = path.join(ROOT, 'src/index.css')
  if (existsSync(entry)) files.push(entry)
  return files.sort()
}

export interface Report {
  findings: Finding[]
  lines: string[]
}

/** Runs every check. `tokensFile` stands in for src/design/tokens.css (a fixture, under --css). */
export function verify(tokensFile = TOKENS_CSS): Report {
  const findings: Finding[] = []
  const lines: string[] = []
  const rel = (file: string) => path.relative(ROOT, file)

  // 1. Placeholders, in every design stylesheet with the checked tokens file in place of tokens.css.
  const stylesheets = designStylesheets().map((file) => (file === TOKENS_CSS ? tokensFile : file))
  if (!stylesheets.includes(tokensFile)) stylesheets.push(tokensFile)
  const sources = new Map(stylesheets.map((file) => [file, readFileSync(file, 'utf8')]))
  const faces = new Set([...sources.values()].flatMap((css) => [...declaredFaces(css)]))
  for (const [file, css] of sources) findings.push(...findPlaceholders(css, rel(file), faces))

  // 2. Every role has its variable(s) with the value tokens.ts gives, and the file is what tokens.ts generates.
  const tokensText = sources.get(tokensFile) ?? ''
  const actual = rootVariables(tokensText)
  const expected = expectedVariables()
  for (const [variable, value] of expected) {
    const found = actual.get(variable)
    if (found === undefined) findings.push({ file: rel(tokensFile), line: 0, message: `no CSS variable for ${variable} (tokens.ts: ${value})` })
    else if (found !== value) findings.push({ file: rel(tokensFile), line: 0, message: `${variable} is "${found}" here and "${value}" in tokens.ts` })
  }
  for (const variable of actual.keys()) {
    if (!expected.has(variable)) findings.push({ file: rel(tokensFile), line: 0, message: `${variable} is not a role in tokens.ts` })
  }
  if (tokensFile === TOKENS_CSS && tokensText !== tokensCss()) {
    findings.push({
      file: rel(tokensFile),
      line: 0,
      message: 'tokens.css is not what tokens.ts generates: run `bun scripts/verify-tokens.ts --write`',
    })
  }

  // 3. Every font role starts with a self-hosted face.
  for (const name of ROLE_NAMES) {
    const role = roleOf(name)
    if (role.kind !== 'font') continue
    const first = role.family[0]?.toLowerCase() ?? ''
    if (!faces.has(first))
      findings.push({ file: 'src/design/tokens.ts', line: 0, message: `${name} starts with "${role.family[0]}", which fonts.css does not self-host` })
  }

  // 4. The declared pairs, in every scheme.
  let checked = 0
  for (const scheme of SCHEME_NAMES) {
    for (const pair of PAIRS) {
      const ratio = contrastRatio(resolveColor(pair.fg, scheme), resolveColor(pair.bg, scheme))
      checked += 1
      if (ratio < THRESHOLDS[pair.kind]) {
        findings.push({
          file: 'src/design/tokens.ts',
          line: 0,
          message: `${pair.fg} on ${pair.bg} is ${formatRatio(ratio)} in ${scheme}, below ${pair.kind}'s ${THRESHOLDS[pair.kind]}:1 (${pair.use})`,
        })
      }
    }
  }

  // The listing: every role with its value, per scheme.
  lines.push(
    `verify:tokens: ${ROLE_NAMES.length} roles, ${SCHEME_NAMES.length} colour schemes (${SCHEME_NAMES.join(', ')}), ${PAIRS.length} declared pairs`,
  )
  for (const group of ROLE_GROUPS) {
    lines.push('', `${group.title}`)
    for (const name of rolesIn(group.id)) lines.push(`  ${describe(name)}`)
  }
  lines.push(
    '',
    `Contrast: ${checked} pair checks across ${SCHEME_NAMES.length} schemes (ARCHITECTURE §11.2: text ${THRESHOLDS.text}:1, non-text ${THRESHOLDS['non-text']}:1)`,
  )
  for (const pair of PAIRS) {
    const ratios = SCHEME_NAMES.map(
      (scheme) => `${scheme} ${formatRatio(contrastRatio(resolveColor(pair.fg, scheme), resolveColor(pair.bg, scheme)))}`,
    )
    lines.push(`  ${`${pair.fg} on ${pair.bg}`.padEnd(40)} ${pair.kind.padEnd(8)} ${ratios.join('  ')}`)
  }
  return { findings, lines }
}

/** One role's line: its variable and its value, with each scheme's override. */
function describe(name: RoleName): string {
  const role = roleOf(name)
  const label = `${name}`.padEnd(22)
  const variable = cssVar(name).padEnd(26)
  if (role.kind === 'color') {
    // `roleOf` does not tell the compiler that a role of kind 'color' is one of COLORS, and this does.
    if (!isColorRole(name)) throw new Error(`${name} is a colour that COLORS does not list`)
    const light = resolveColor(name)
    const shown = typeof role.value === 'string' ? light : `${light} (= ${role.value.ref})`
    const overrides = SCHEME_NAMES.filter((scheme) => scheme !== 'light' && resolveColor(name, scheme) !== light).map(
      (scheme) => `${scheme}: ${resolveColor(name, scheme)}`,
    )
    return `${label}${variable}${shown}${overrides.length ? `   [${overrides.join(', ')}]` : ''}`
  }
  if (role.kind === 'font') {
    const metrics = FONT_PARTS.map(
      (part) =>
        `${fontVar(name, part).replace(`--es-${name}-`, '')} ${part === 'size' ? role.size : part === 'leading' ? role.leading : part === 'tracking' ? role.tracking : part === 'weight' ? role.weight : role.case}`,
    )
    return `${label}${variable}${role.family.join(', ')}   (${metrics.join(', ')})`
  }
  const value = role.value.length > 72 ? `${role.value.slice(0, 69)}...` : role.value
  return `${label}${variable}${value}${role.kind === 'duration' ? '   [reduced motion: 0ms]' : ''}`
}

/** Runs the command line and returns the exit status. */
export function main(argv: readonly string[]): number {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('usage: bun scripts/verify-tokens.ts [--css <file>] | --write')
    return 0
  }
  if (argv.includes('--write')) {
    writeFileSync(TOKENS_CSS, tokensCss())
    console.log(`wrote ${path.relative(ROOT, TOKENS_CSS)}`)
    return 0
  }
  const cssIndex = argv.indexOf('--css')
  let tokensFile = TOKENS_CSS
  if (cssIndex >= 0) {
    const given = argv[cssIndex + 1]
    if (!given) {
      console.error('verify-tokens: --css needs a file')
      return 2
    }
    tokensFile = path.resolve(given)
    if (!existsSync(tokensFile)) {
      console.error(`verify-tokens: no such file: ${given}`)
      return 2
    }
  }
  const { findings, lines } = verify(tokensFile)
  for (const line of lines) console.log(line)
  console.log('')
  if (findings.length === 0) {
    console.log('verify:tokens passed: no placeholder, every role reaches CSS, every pair meets its threshold')
    return 0
  }
  for (const { file, line, message } of findings) console.error(`${file}${line ? `:${line}` : ''}: ${message}`)
  console.error(`verify:tokens failed: ${findings.length} finding${findings.length === 1 ? '' : 's'}`)
  return 1
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))

/** Every scheme's media query, for the tests. */
export const SCHEME_MEDIA = Object.fromEntries(SCHEME_NAMES.map((scheme) => [scheme, SCHEMES[scheme].media]))
