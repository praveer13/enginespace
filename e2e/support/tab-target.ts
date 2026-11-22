/*
 * The wait that a Tab walk owes the page before its first key: the control it walks to is there. A walk that starts while a lazy part of the
 * page is still coming counts its presses against a page that does not hold the control yet, and goes past where it will be. The specs whose
 * own `tabTo` finds a control by its name (pool, engine-floor, engine-floor-map, loop, broken-bench) wait here first; the walks that find a
 * locator wait for it to be attached (e2e/support/walks.ts, e2e/lesson-predict.spec.ts, e2e/lesson-games.spec.ts).
 */
import type { Page } from '@playwright/test'

/**
 * Waits until the page holds a control that Tab can stop on (not disabled, not `tabindex="-1"`, drawn) and that is named like `name`: its
 * `aria-label`, its field's label or its text, as each spec's `activeName` reads a name (with or without its runs of white space folded).
 */
export async function controlNamed(page: Page, name: RegExp): Promise<void> {
  await page.waitForFunction(
    ({ source, flags }) => {
      const wanted = new RegExp(source, flags)
      const controls = document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')
      return [...controls].some((control) => {
        if (control.tabIndex < 0 || control.matches(':disabled') || control.getClientRects().length === 0) return false
        const names = [control.getAttribute('aria-label'), (control as HTMLInputElement).labels?.[0]?.textContent, control.textContent]
        return names.some((named) => named != null && (wanted.test(named.trim()) || wanted.test(named.trim().replace(/\s+/g, ' '))))
      })
    },
    { source: name.source, flags: name.flags },
  )
}
