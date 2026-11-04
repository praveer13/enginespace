/*
 * The meta CSP (ARCHITECTURE §12, D-033) and the Vite plugin that puts it in every document the build writes (W0-T19).
 *
 * The policy is the code block of §12, one directive per entry below, and tests/pages/csp.test.ts holds the two equal:
 *   - `script-src 'self' 'wasm-unsafe-eval'`: the forge instantiates learner wasm (§8.3), and nothing else may run. There is no
 *     'unsafe-eval' and no inline script, so a page that needs a script ships it as a module file.
 *   - `style-src 'self' 'unsafe-inline'`: Radix and React write style attributes at run time, as they do in kernelspace.
 *   - `connect-src 'self'`, `font-src 'self'` and `img-src 'self' data: blob:`: the site makes no request outside its own
 *     origin and loads no third-party face or picture (D-033). An e2e test fails on any request that leaves the origin.
 *   - `object-src 'none'`, `base-uri 'self'` and `form-action 'none'`: no plug-in, no <base> redirect, no form post.
 * A policy in a <meta> cannot set `frame-ancestors` and does not govern workers (§12), so workers fetch nothing.
 *
 * The plugin runs in `vite build` only. The dev server injects inline scripts (the React refresh preamble) that this policy
 * would block, which is kernelspace's reason too. `vite preview` serves the built files, so the e2e specs run under the policy.
 *
 * A meta policy binds only what comes after it, so it sits right behind `<meta charset>` (which belongs first in the head)
 * and ahead of every script, stylesheet and preload. prepare-pages checks every document of the build for this placement.
 */
import type { Plugin } from 'vite'

/** §12's directives, in its order. */
export const CSP_DIRECTIVES: readonly string[] = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
]

export const CSP: string = CSP_DIRECTIVES.join('; ')

/** The element itself. The policy holds single quotes only, so a double-quoted attribute needs no escaping. */
export const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`

/** `<meta charset="UTF-8">`, in either quoting and with or without the closing slash. */
const CHARSET = /<meta\s+charset\s*=\s*(?:"utf-8"|'utf-8'|utf-8)\s*\/?>/i
const COMMENT = /<!--[\s\S]*?-->/g
const POLICY = /http-equiv\s*=\s*["']?\s*content-security-policy/i

/** `html` with every comment blanked out to spaces, so that a pattern cannot match inside one and offsets stay valid. */
const withoutComments = (html: string): string => html.replace(COMMENT, (comment) => ' '.repeat(comment.length))

/**
 * Puts the policy's <meta> on a line of its own right after the document's `<meta charset>`, indented like it. A charset that
 * sits in a comment does not count. It throws when there is no charset to anchor to, and when the document already has a
 * policy: the plugin owns the policy, so a second one in index.html would only hide behind it.
 */
export function insertCsp(html: string): string {
  const visible = withoutComments(html)
  if (POLICY.test(visible)) {
    throw new Error('meta-csp: the document already has a Content-Security-Policy <meta>; remove it, because the build adds the policy of ARCHITECTURE §12')
  }
  const charset = CHARSET.exec(visible)
  if (charset === null) {
    throw new Error('meta-csp: the document has no <meta charset="UTF-8">; the policy goes right after it, so that it governs everything that follows')
  }
  const end = charset.index + charset[0].length
  const indent = /(?:^|\n)([ \t]*)$/.exec(html.slice(0, charset.index))?.[1] ?? ''
  return `${html.slice(0, end)}\n${indent}${CSP_META}${html.slice(end)}`
}

/** Adds the policy to every HTML document that the build transforms. After the other transforms, so that nothing lands ahead of it. */
export function metaCsp(): Plugin {
  return {
    name: 'enginespace:meta-csp',
    apply: 'build',
    transformIndexHtml: { order: 'post', handler: (html) => insertCsp(html) },
  }
}
