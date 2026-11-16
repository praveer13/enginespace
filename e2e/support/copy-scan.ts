/*
 * The copy guard over a rendered page (REDESIGN §2.7, R-T14): everything a learner reads or a reader says on the page as it stands, which
 * is its text, its labels (`aria-label`, `alt`, `title`) and the lines of its live regions, run through the guard of src/copy/banned.ts.
 * An element whose role is `img` has no accessible children, so its children's labels are not read; the page's own SVG drawings are such
 * an image, named by one label on the image itself.
 */
import type { Page } from '@playwright/test'
import { findBanned } from '../../src/copy/banned'

/** The strings a learner meets on the page now. */
export function readable(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'])
    const visit = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim() ?? ''
        if (text !== '') out.push(text)
        return
      }
      if (!(node instanceof Element) || skip.has(node.tagName)) return
      for (const name of ['aria-label', 'alt', 'title']) {
        const value = node.getAttribute(name)
        if (value !== null && value.trim() !== '') out.push(value)
      }
      // The children of an image are not exposed: only the image's own label is.
      if (node.getAttribute('role') === 'img' && node.tagName.toLowerCase() !== 'svg') return
      node.childNodes.forEach(visit)
    }
    visit(document.body)
    return out
  })
}

/** Every banned word and phrase on the page now, each with the text it is in. Empty when the page reads in the engine's words. */
export async function bannedOn(page: Page): Promise<string[]> {
  return (await readable(page)).flatMap((text) => findBanned(text).map((found) => `"${found.match}" (${found.rule}) in "${text.slice(0, 90)}"`))
}
