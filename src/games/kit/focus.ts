/**
 * Whether the learner's focus has nowhere useful to be: on the page itself, or on a control that can no longer hold it.
 *
 * A control that a move disables or removes (the bell at the end of a level, a ticket that was hung) still holds focus when React's
 * effects run. The browser moves it to the page only at its next rendering update, under the HTML focus fixup rule. Chrome 149 left
 * it on the disabled control long enough for a check of `document.body` to miss it; Chrome 153 does not [measured 2026-11-04,
 * e2e/keyboard-loop.spec.ts on Playwright's Chromium 1228 and 1243]. So a disabled, detached or inert element counts as lost too.
 */
export function focusIsLost(): boolean {
  const active = document.activeElement
  if (active === null || active === document.body || !active.isConnected) return true
  if ('disabled' in active && active.disabled === true) return true
  return active.closest('[inert]') !== null
}
