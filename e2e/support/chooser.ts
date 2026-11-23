/*
 * The file chooser that a key opens. Playwright starts to take a page's chooser when a listener first asks for one, by a message that it does
 * not wait for, and drops a chooser that opens before that message has landed: the page had clicked its input, and the test waited for an
 * event that never came [measured 2026-11-19 at b5bf755: 14 such waits in three runs of e2e/receipts-import.spec.ts, a different test each
 * time; none in three runs with the listener put on first. The nightly run of 2026-11-20 at the tip of wave 1a lost the same wait in
 * e2e/forge.spec.ts]. So each page gets a listener of its own once, and a round trip to the page before the key.
 */
import type { FileChooser, Locator, Page } from '@playwright/test'

/** The pages whose file chooser Playwright already takes. */
const taken = new WeakSet<Page>()

/** Focuses `control`, presses Enter on it as a keyboard does, and returns the chooser that its page opens. */
export async function chooserOpenedByEnter(page: Page, control: Locator): Promise<FileChooser> {
  if (!taken.has(page)) {
    taken.add(page)
    page.on('filechooser', () => undefined)
    await page.evaluate(() => undefined)
  }
  await control.focus()
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('Enter')
  return chooser
}
