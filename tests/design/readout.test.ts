/*
 * W0-T05, accept 7: `Readout` prints a tick count with its synthetic label, and a number passed without a tag does not
 * type-check (nor does a tick count tagged anything but synthetic, D-048). The type checks compile fixtures under the
 * app's own compiler options.
 */
import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import ts from 'typescript'
import { Readout } from '@/design/components/Readout'
import { formatReadout } from '@/design/format'

const root = path.resolve(import.meta.dirname, '../..')
const fixture = (name: string) => path.join(root, 'tests/fixtures/design', name)

describe('Readout', () => {
  test('a tick count prints with its synthetic label', () => {
    const html = renderToString(createElement(Readout, { value: 7, unit: 'ticks', tag: 'synthetic' }))
    expect(html).toContain('<data class="es-readout__value" value="7">7</data>')
    expect(html).toContain('>ticks<')
    expect(html).toContain('data-tag="synthetic">synthetic<')
  })

  test('a measured number prints its tag with the date and SHA', () => {
    const html = renderToString(createElement(Readout, { value: 340, unit: 'µs', tag: 'measured', source: '2026-11-03 at 8f8fbe1' }))
    expect(html).toContain('>340<')
    expect(html).toContain('µs')
    expect(html).toContain('measured')
    expect(html).toContain('2026-11-03 at 8f8fbe1')
  })

  test('numbers print grouped, fixed and padded as the printer prints them', () => {
    expect(formatReadout(4096, 0)).toBe('4,096')
    expect(formatReadout(1.25, 1)).toBe('1.3')
    expect(formatReadout(12, 0, 4)).toBe('0012')
    expect(formatReadout(-3, 0)).toBe('−3')
    expect(formatReadout(Number.NaN)).toBe('—')
  })
})

describe('Readout’s tags are enforced by the type checker', () => {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    types: [],
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
    verbatimModuleSyntax: true,
    baseUrl: root,
    paths: { '@/*': ['./src/*'] },
  }
  const files = ['readout-tagged.tsx', 'readout-untagged.tsx', 'readout-ticks-not-synthetic.tsx'].map(fixture)
  const program = ts.createProgram(files, options)
  const errorsIn = (name: string) =>
    ts
      .getPreEmitDiagnostics(program, program.getSourceFile(fixture(name)))
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))

  test('a tagged number, and a tick count tagged synthetic, type-check', () => {
    expect(errorsIn('readout-tagged.tsx')).toEqual([])
  })

  test('a number passed without a tag fails to type-check', () => {
    const errors = errorsIn('readout-untagged.tsx')
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain("'tag'")
  })

  test('a tick count tagged anything but synthetic fails to type-check', () => {
    const errors = errorsIn('readout-ticks-not-synthetic.tsx')
    expect(errors.length).toBe(1)
    expect(errors[0]).toMatch(/"synthetic"|'synthetic'/)
  })
})
