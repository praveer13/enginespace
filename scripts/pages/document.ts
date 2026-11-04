/*
 * Reading and rewriting the documents of a build (ARCHITECTURE §3.2, W0-T19), with Bun's HTMLRewriter: lol-html, a streaming
 * HTML5 parser, so a `<div id="root">` in a comment or a `>` in an attribute cannot fool it.
 *
 *   inspect   what a document has: its head elements in order, its title and description, its entry script, its roots, and any
 *             text outside the root;
 *   render    the document for one page, made from the document that Vite built from index.html: its own <title>, its own
 *             description and its own static shell in place of whatever sat inside <div id="root">;
 *   problems  what is wrong with a document of the build under the policy, as sentences.
 *
 * Everything the module inserts it escapes itself. HTMLRewriter's setAttribute escapes quotes and not ampersands, so no text
 * goes through it: an element that changes is replaced whole, and an inner content is passed as already-escaped HTML.
 *
 * The title and the description are the head's own: an SVG inside the page may carry a <title> of its own (the front page's
 * poster does, for a screen reader), and it is not the document's.
 *
 * Only the scripts that prepare and verify a build use this module, and they run under Bun.
 */
import { CSP } from './csp.ts'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Text                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Text for an element's content or an attribute's value in double quotes. */
export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => ESCAPES[char])

const NAMED: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/**
 * The text an escaped string stands for: the five named references that `escapeHtml` writes and any numeric one. A document's
 * own title and description may spell others (`&nbsp;`), and those stay as written, which is enough to compare what this module wrote.
 */
export const decodeHtml = (text: string): string =>
  text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos));/gi, (_, decimal?: string, hex?: string, name?: string) =>
    decimal !== undefined ? String.fromCodePoint(Number(decimal)) : hex !== undefined ? String.fromCodePoint(Number.parseInt(hex, 16)) : NAMED[(name ?? '').toLowerCase()],
  )

/* ------------------------------------------------------------------------------------------------------------------ */
/* Inspecting                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface HeadElement {
  /** Lower case: `meta`, `link`, `script`. */
  tag: string
  /** Attribute names in lower case, and their values with references decoded. */
  attrs: Readonly<Record<string, string>>
}

export interface Inspection {
  /** The elements directly inside <head>, in document order. */
  head: HeadElement[]
  /** The text of <title> with references decoded, or null when the document has none. */
  title: string | null
  /** The `content` of <meta name="description">, or null. */
  description: string | null
  /** The `src` of the first module script, which Vite gives the base path: `/enginespace/assets/index-x.js`. */
  entry: string | null
  /** How many `<div id="root">` the document has. A page has one. */
  roots: number
  /** How many scripts it has that run from their own text and not from a file: the policy has no 'unsafe-inline' for scripts. */
  inlineScripts: number
  /** The text of <body> outside #root, once scripts, styles, templates and <noscript> are taken out, and white space is squeezed. */
  outside: string
}

const drain = (rewriter: HTMLRewriter, html: string): Promise<string> => rewriter.transform(new Response(html)).text()

/** The `type` of a script that a browser runs: none, a module, an import map or a JavaScript MIME type. A JSON data block is not one. */
const RUNS = /^\s*(?:|module|importmap|(?:text|application)\/(?:x-)?(?:java|ecma)script)\s*$/i

export async function inspect(html: string): Promise<Inspection> {
  const head: HeadElement[] = []
  let title: string | null = null
  let description: string | null = null
  let entry: string | null = null
  let roots = 0
  let inlineScripts = 0
  await drain(
    new HTMLRewriter()
      .on('head > *', {
        element(el) {
          head.push({ tag: el.tagName.toLowerCase(), attrs: Object.fromEntries([...el.attributes].map(([name, value]) => [name.toLowerCase(), decodeHtml(value)])) })
        },
      })
      .on('head > title', {
        element() {
          title ??= ''
        },
        text(chunk) {
          title = (title ?? '') + chunk.text
        },
      })
      .on('head > meta[name="description"]', {
        element(el) {
          description ??= decodeHtml(el.getAttribute('content') ?? '')
        },
      })
      .on('script[type="module"][src]', {
        element(el) {
          entry ??= decodeHtml(el.getAttribute('src') ?? '')
        },
      })
      .on('div#root', {
        element() {
          roots += 1
        },
      })
      .on('script', {
        element(el) {
          if (el.getAttribute('src') === null && RUNS.test(el.getAttribute('type') ?? '')) inlineScripts += 1
        },
      }),
    html,
  )

  const bare = await drain(new HTMLRewriter().on('div#root, script, style, noscript, template', { element: (el) => void el.remove() }), html)
  let outside = ''
  await drain(
    new HTMLRewriter().on('body', {
      text(chunk) {
        outside += chunk.text
      },
    }),
    bare,
  )
  return { head, title: title === null ? null : decodeHtml(title), description, entry, roots, inlineScripts, outside: outside.replace(/\s+/g, ' ').trim() }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Rendering a page                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What a document needs of a page to be rendered for it. */
export interface PageText {
  title: string
  heading: string
  description: string
}

/** Closes every document that prepare-pages writes, so that a rerun may replace its own files and never anyone else's. */
export const MARK = '<!-- prepared by scripts/prepare-pages.ts -->'

/**
 * The static shell of a page (ARCHITECTURE §3.2): what a visitor without JavaScript, and a reader that does not run it, finds
 * inside <div id="root"> until the app takes over. A heading, the page's one sentence, a way home, and a note that the app needs
 * scripts. It carries no style of its own: the document's stylesheet dresses the bare elements, and the design system decides how.
 * `base` is the path the site is served under (`/` or `/enginespace/`).
 */
export function shell(page: Pick<PageText, 'heading' | 'description'>, base: string): string {
  return [
    '<main>',
    `<h1>${escapeHtml(page.heading)}</h1>`,
    `<p>${escapeHtml(page.description)}</p>`,
    `<p><a href="${escapeHtml(base)}">Go to the front page</a></p>`,
    '<noscript><p>enginespace runs in your browser, so this page needs JavaScript.</p></noscript>',
    '</main>',
  ].join('')
}

const descriptionMeta = (description: string): string => `<meta name="description" content="${escapeHtml(description)}" />`

/**
 * The document for `page`, from `template`, the document that Vite built from index.html. Everything but three things is the
 * template's own, byte for byte, which is how the policy stays ahead of every script and every asset keeps its hashed path:
 * the <title>, the description (added at the end of the head if the template has none), and the inside of <div id="root">.
 * It throws when the template has no <title> or no root to fill.
 */
export async function render(template: string, page: PageText, base: string): Promise<string> {
  let titles = 0
  let roots = 0
  let described = false
  const out = await drain(
    new HTMLRewriter()
      .on('head > title', {
        element(el) {
          titles += 1
          el.setInnerContent(escapeHtml(page.title), { html: true })
        },
      })
      .on('head > meta[name="description"]', {
        element(el) {
          described = true
          el.replace(descriptionMeta(page.description), { html: true })
        },
      })
      .on('head', {
        element(el) {
          el.onEndTag((end) => {
            if (!described) end.before(descriptionMeta(page.description), { html: true })
          })
        },
      })
      .on('div#root', {
        element(el) {
          roots += 1
          el.setInnerContent(shell(page, base), { html: true })
        },
      })
      .on('body', {
        element(el) {
          el.onEndTag((end) => end.before(`${MARK}\n`, { html: true }))
        },
      }),
    template,
  )
  if (titles !== 1) throw new Error(`the template has ${titles} <title> elements, and a document needs exactly one`)
  if (roots !== 1) throw new Error(`the template has ${roots} <div id="root"> elements, and a document needs exactly one to hold its shell`)
  return out
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* What is wrong with a document                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The problem of a document that has a script running from its own text, or none. `script-src 'self'` has no 'unsafe-inline', so
 * such a script works on the dev server, which has no policy, and does nothing on Pages. The way out is a module file.
 */
export function inlineScriptProblems(info: Pick<Inspection, 'inlineScripts'>): string[] {
  return info.inlineScripts === 0
    ? []
    : [`it has ${info.inlineScripts} inline ${info.inlineScripts === 1 ? 'script' : 'scripts'}, which the policy blocks (script-src 'self' has no 'unsafe-inline'): put the code in a module file`]
}

/** What is wrong with a document under the policy of ARCHITECTURE §12: `cspProblems`, then `inlineScriptProblems`. */
export const policyProblems = (info: Pick<Inspection, 'head' | 'inlineScripts'>): string[] => [...cspProblems(info.head), ...inlineScriptProblems(info)]

/** Elements that fetch or run something, and so must not come before the policy. */
const ACTIVE = new Set(['script', 'link', 'style', 'base', 'iframe', 'object', 'embed'])

/** The policy's content split into its tokens, directive names included: `script-src`, `'self'`, `'wasm-unsafe-eval'`. */
export const policyTokens = (policy: string): string[] => policy.split(/[\s;]+/).filter(Boolean)

/**
 * What is wrong with how a document carries the policy of ARCHITECTURE §12, as sentences: no <meta charset>; no policy; the
 * policy not the first element after the charset; an element that loads or runs something ahead of it; a second policy; a
 * policy that is not §12's; and 'unsafe-eval' (the token itself: 'wasm-unsafe-eval' is another).
 */
export function cspProblems(head: readonly HeadElement[]): string[] {
  const problems: string[] = []
  const isPolicy = (el: HeadElement) => el.tag === 'meta' && el.attrs['http-equiv']?.toLowerCase() === 'content-security-policy'
  const charset = head.findIndex((el) => el.tag === 'meta' && el.attrs.charset !== undefined)
  const policies = head.filter(isPolicy)
  if (charset < 0) problems.push('it has no <meta charset>')
  if (policies.length === 0) {
    problems.push('it has no Content-Security-Policy <meta>')
    return problems
  }
  if (policies.length > 1) problems.push(`it has ${policies.length} Content-Security-Policy <meta> elements, and must have one`)
  const at = head.findIndex(isPolicy)
  if (charset >= 0 && at !== charset + 1) {
    const next = head[charset + 1]
    problems.push(`the first element after <meta charset> is ${next === undefined ? 'nothing' : `<${next.tag}>`}, and must be the Content-Security-Policy <meta>`)
  }
  const ahead = head.slice(0, at).filter((el) => ACTIVE.has(el.tag))
  if (ahead.length > 0) problems.push(`${ahead.map((el) => `<${el.tag}>`).join(', ')} come before the policy, which binds only what follows it`)
  const content = policies[0].attrs.content ?? ''
  if (policyTokens(content).includes("'unsafe-eval'")) problems.push("the policy allows 'unsafe-eval'")
  if (content !== CSP) problems.push("the policy is not the one of ARCHITECTURE §12 (scripts/pages/csp.ts)")
  return problems
}
