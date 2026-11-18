/*
 * R-T06: the words for state, and the one way on (REDESIGN §2.4, P2).
 *
 *   - A skill reads not started, tried, passed or kept; an attempt not yet, passed in practice or passed; a lesson not started, started
 *     or done. They are the words of the course's naming table (src/copy/terms.ts, STATE_WORDS).
 *   - "Practised", "earned", "credited" and "part credit" are the ledger's and the code's words. They appear in no rendered string: the
 *     sources are read with TypeScript's parser, and every string literal, template and JSX text is checked, except a literal that is a
 *     state's id (compared, switched on, listed as an enum or used as a key or a data attribute), which never reaches the screen.
 *   - The words Continue and Start, as the way on, are said only by `nextStep` and the controls that show its answer: the header, the
 *     way on of Course and of a module, and every empty state, all from its answer or from the pointer that copies it. A move in hand
 *     ("Start a graded run", "Start questions") is a verb of the run, not the way on, and is not this check's business.
 *   - No other derivation of "next" is left: no `nextModule`, and no `LINK_TR2`.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { STATE_WORDS } from '@/copy/terms'
import { KC_STATES } from '@/progress/derive'
import { ATTEMPT_WORDS, LESSON_WORDS, SKILL_WORDS } from '@/progress/words'
import { root } from '../ci/support'

describe('the words for state', () => {
  test('a skill reads not started, tried, passed or kept, one word for each of KC_STATES', () => {
    expect(KC_STATES.map((state) => SKILL_WORDS[state])).toEqual(STATE_WORDS.skill.map((row) => row.word))
  })

  test('an attempt reads not yet, passed in practice or passed', () => {
    expect([ATTEMPT_WORDS.no, ATTEMPT_WORDS.practice, ATTEMPT_WORDS.yes]).toEqual(STATE_WORDS.attempt.map((row) => row.word))
  })

  test('a lesson reads not started, started or done', () => {
    expect(Object.values(LESSON_WORDS)).toEqual(STATE_WORDS.lesson.map((row) => row.word))
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The rendered strings                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Every source a learner's screen is drawn from: the app, and the pure packages that hand it words. */
const DIRS = ['src', 'packages/play', 'packages/verify']
const SKIP = /^src\/content\/generated\//

function sources(): string[] {
  return DIRS.flatMap((dir) =>
    readdirSync(path.join(root, dir), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts'))
      .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
      .filter((file) => !SKIP.test(file)),
  ).sort()
}

interface Said {
  file: string
  line: number
  text: string
}

/** A literal that is a state's id and never reaches the screen: compared, switched on, a key, a type, a data attribute or an enum. */
function isId(node: ts.Node): boolean {
  const parent = node.parent
  if (ts.isBinaryExpression(parent) || ts.isCaseClause(parent) || ts.isLiteralTypeNode(parent) || ts.isElementAccessExpression(parent)) return true
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true
  if (ts.isJsxAttribute(parent) && /^(data-|className$|key$|id$)/.test(parent.name.getText())) return true
  if (ts.isArrayLiteralExpression(parent) && parent.elements.every((element) => ts.isStringLiteral(element) && /^[a-z-]+$/.test(element.text))) return true
  // derive.ts names the states it returns by their ids, which only the words above turn into text.
  if (node.getSourceFile().fileName === 'src/progress/derive.ts' && ts.isStringLiteral(node) && (KC_STATES as readonly string[]).includes(node.text)) return true
  return false
}

/** Every piece of text in the sources that can reach a screen: string literals, templates and JSX text. */
function said(): Said[] {
  const out: Said[] = []
  for (const file of sources()) {
    const text = readFileSync(path.join(root, file), 'utf8')
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const visit = (node: ts.Node) => {
      let words: string | null = null
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) words = isId(node) || ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent) ? null : node.text
      else if (ts.isTemplateExpression(node)) words = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(' … ')
      else if (ts.isJsxText(node)) words = node.text
      if (words !== null && words.trim() !== '') out.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: words.replace(/\s+/g, ' ').trim() })
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return out
}

const SAID = said()

describe('the rendered strings', () => {
  test('read some thousands of strings, so the scan is a scan', () => {
    expect(SAID.length).toBeGreaterThan(2000)
  })

  test('say none of practised, earned, credited or part credit', () => {
    const hits = SAID.filter((one) => /\b(practised|earned|credited)\b|\bpart credit\b/i.test(one.text)).map((one) => `${one.file}:${one.line} ${one.text}`)
    expect(hits).toEqual([])
  })

  /*
   * The way on's words: Continue alone or with a colon, Start alone or with a colon, and the old ways of saying where to start ("Start
   * with TR2", "Start TR1", "Start the course"). A lone "Start" is a span's start in a trace, and not the way on. The files that make or copy `nextStep`'s answer may say them; /design shows the control's
   * specimens, and its own states, with made-up links.
   */
  const WAY = /^(Continue(:|$)|Start(:| with\b| TR\d| the course\b))/
  const MAKERS = new Set(['src/progress/next.ts', 'src/settings/store.ts', 'src/pages/Design.tsx', 'src/design/components/NextStep.tsx', 'src/design/components/Header.tsx'])

  test('Continue and Start, as the way on, are said only where nextStep is answered or shown', () => {
    const hits = SAID.filter((one) => WAY.test(one.text) && !MAKERS.has(one.file)).map((one) => `${one.file}:${one.line} ${one.text}`)
    expect(hits).toEqual([])
  })

  test('the header and the empty states take their words and link from the answer: no hand-written Continue or Start in a control', () => {
    for (const file of ['src/App.tsx', 'src/items/today/Tickets.tsx', 'src/map/CourseMap.tsx', 'src/pages/Module.tsx']) {
      const text = readFileSync(path.join(root, file), 'utf8')
      expect(text, file).not.toMatch(/>\s*(Continue|Start)\b/)
    }
  })
})

describe('one derivation of next', () => {
  const code = (file: string) =>
    readFileSync(path.join(root, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  test('no nextModule and no LINK_TR2 outside next.ts', () => {
    const files = [...sources(), ...readdirSync(path.join(root, 'tests'), { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name)).map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))]
    const hits = files.filter((file) => file !== 'src/progress/next.ts' && !file.endsWith('words.test.ts') && /\b(nextModule|LINK_TR2)\b/.test(code(file)))
    expect(hits).toEqual([])
  })
})
