/*
 * W0-T19's meta CSP (ARCHITECTURE §12, D-033): the policy is the one the document prints, it has no 'unsafe-eval', and the
 * Vite plugin puts it right behind <meta charset>. That a real build does so in every document is tests/pages/site.test.ts's.
 */
import { describe, expect, test } from 'bun:test'
import { CSP, CSP_DIRECTIVES, CSP_META, insertCsp, metaCsp } from '../../scripts/pages/csp'
import { between, read } from '../ci/support'
import { headOf, templateHtml } from './support'

/** The tokens of a policy, directive names included. 'wasm-unsafe-eval' is one token, and not 'unsafe-eval'. */
const tokens = (policy: string) => policy.split(/[\s;]+/).filter(Boolean)

describe('the policy', () => {
  /** §12's code block, which wraps across lines. */
  const documented = between(read('docs/ARCHITECTURE.md'), '- **Meta CSP** in every document:\n  ```\n', '\n  ```')
    .replace(/\s+/g, ' ')
    .trim()

  test('is the one that ARCHITECTURE §12 prints, directive for directive', () => {
    expect(documented).toContain("default-src 'self'")
    expect(CSP).toBe(documented)
    expect(CSP_DIRECTIVES.join('; ')).toBe(documented)
  })

  test("has no 'unsafe-eval', and has 'wasm-unsafe-eval' for the forge", () => {
    expect(tokens(CSP)).not.toContain("'unsafe-eval'")
    expect(tokens(CSP)).toContain("'wasm-unsafe-eval'")
  })

  test('keeps the site on its own origin (D-033): self for connections, fonts and scripts, and no plug-in, form or <base> escape', () => {
    const directive = (name: string) => CSP_DIRECTIVES.find((entry) => entry.startsWith(`${name} `))
    expect(directive('connect-src')).toBe("connect-src 'self'")
    expect(directive('font-src')).toBe("font-src 'self'")
    expect(directive('script-src')).toBe("script-src 'self' 'wasm-unsafe-eval'")
    expect(directive('object-src')).toBe("object-src 'none'")
    expect(directive('form-action')).toBe("form-action 'none'")
    expect(directive('base-uri')).toBe("base-uri 'self'")
    // No source in the whole policy names another origin: no host, no scheme but data: and blob:.
    expect(tokens(CSP).filter((token) => /^(?:https?:|wss?:|\*|[a-z0-9-]+\.[a-z]{2,})/i.test(token))).toEqual([])
  })

  test('is one <meta http-equiv> element that a double-quoted attribute holds without escaping', () => {
    expect(CSP_META).toBe(`<meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
    expect(CSP).not.toContain('"')
    expect(CSP).not.toContain('&')
  })
})

describe('insertCsp', () => {
  const PLAIN = '<!doctype html>\n<html>\n  <head>\n    <meta charset="UTF-8" />\n    <title>x</title>\n  </head>\n  <body></body>\n</html>\n'

  test('puts the policy on a line of its own right after <meta charset>, indented like it', () => {
    expect(insertCsp(PLAIN)).toBe(`<!doctype html>\n<html>\n  <head>\n    <meta charset="UTF-8" />\n    ${CSP_META}\n    <title>x</title>\n  </head>\n  <body></body>\n</html>\n`)
  })

  test('changes nothing else: taking the line out gives back the document', () => {
    expect(insertCsp(PLAIN).replace(`    ${CSP_META}\n`, '')).toBe(PLAIN)
  })

  test('makes the policy the first element after the charset, for a parser', async () => {
    const head = await headOf(insertCsp(templateHtml('/', { policy: false })))
    expect(head[0].attrs.charset).toBe('UTF-8')
    expect(head[1].attrs['http-equiv']).toBe('Content-Security-Policy')
    expect(head[1].attrs.content).toBe(CSP)
  })

  test('takes the charset in any quoting and case, and with or without the closing slash', () => {
    for (const charset of ['<meta charset=UTF-8>', "<meta charset='utf-8'>", '<META CHARSET="UTF-8"/>', '<meta  charset = "utf-8" />']) {
      const out = insertCsp(`<head>${charset}<title>x</title></head>`)
      expect(out).toBe(`<head>${charset}\n${CSP_META}<title>x</title></head>`)
    }
  })

  test('skips a charset that sits in a comment', () => {
    const html = '<head><!-- <meta charset="UTF-8"> -->\n<meta charset="UTF-8"><title>x</title></head>'
    const out = insertCsp(html)
    expect(out.indexOf(CSP_META)).toBeGreaterThan(out.lastIndexOf('<meta charset="UTF-8">'))
    expect(out).toBe(`<head><!-- <meta charset="UTF-8"> -->\n<meta charset="UTF-8">\n${CSP_META}<title>x</title></head>`)
  })

  test('throws when there is no charset to anchor to, and when a charset is only in a comment', () => {
    expect(() => insertCsp('<head><title>x</title></head>')).toThrow(/no <meta charset="UTF-8">/)
    expect(() => insertCsp('<head><!-- <meta charset="UTF-8"> --><title>x</title></head>')).toThrow(/no <meta charset="UTF-8">/)
  })

  test('throws when the document already has a policy, because the plugin owns it', () => {
    const once = insertCsp(PLAIN)
    expect(() => insertCsp(once)).toThrow(/already has a Content-Security-Policy/)
    expect(() => insertCsp(PLAIN.replace('<title>', "<meta http-equiv='content-security-policy' content=\"default-src *\"><title>"))).toThrow(/already has/)
  })

  test('does not mind a policy that only a comment mentions', () => {
    const html = PLAIN.replace('<title>', '<!-- <meta http-equiv="Content-Security-Policy" content="x"> --><title>')
    expect(insertCsp(html)).toContain(CSP_META)
  })
})

describe('the Vite plugin', () => {
  const plugin = metaCsp()

  test('runs in a build only: the dev server injects inline scripts that the policy would block', () => {
    expect(plugin.apply).toBe('build')
  })

  test('runs after the other transforms, so that nothing lands ahead of the policy', () => {
    const hook = plugin.transformIndexHtml
    expect(typeof hook === 'object' && hook !== null && 'order' in hook ? hook.order : undefined).toBe('post')
  })

  test('hands the transformed document to insertCsp', () => {
    const hook = plugin.transformIndexHtml
    if (typeof hook !== 'object' || hook === null || !('handler' in hook)) throw new Error('the plugin has no transformIndexHtml handler')
    const html = templateHtml('/', { policy: false })
    expect((hook.handler as (html: string) => string)(html)).toBe(insertCsp(html))
  })
})
