/*
 * Linting a .tsx file loads eslint-plugin-react-hooks' React Compiler rules, and with them @babel/core, which replaces
 * Error.prepareStackTrace with its stack trace rewriter the first time, once a process, and never puts it back. Under that rewriter
 * Bun refuses Error.captureStackTrace on an object that is not an Error, and Vite's bundled follow-redirects calls it so when Vite
 * loads. `bun test` runs a shard's files in one process, so a file that loads Vite after a file that linted could not load it, in
 * whichever shard put the two together (CI's second shard on PR #6, 2026-11-10). A test file that lints holds the hook and releases it
 * when it is done: the release puts back the hook it found, and keeps Babel's rewriter for a test that needs it.
 */

// @types/node declares prepareStackTrace as a method that is always there; here it is a value that may be undefined, as in
// scripts/content/parse.ts.
const errorHook = Error as unknown as { prepareStackTrace: unknown }

/** Babel's rewriter, once a hold of this process has seen a lint install it. */
let babelRewriter: unknown

export interface StackHookHold {
  /** Babel's rewriter: the one a lint installed during this hold, or the one an earlier hold of this process kept. */
  rewriter(): unknown
  /** Puts back the hook that was there when the hold began, keeping Babel's rewriter if a lint installed it since. */
  release(): void
}

/** Notes the hook that is there now, so that a test file which lints can put it back when it is done. */
export function holdStackHook(): StackHookHold {
  const before = errorHook.prepareStackTrace
  const installed = (): unknown => (errorHook.prepareStackTrace === before ? undefined : errorHook.prepareStackTrace)
  return {
    rewriter: () => installed() ?? babelRewriter,
    release: () => {
      babelRewriter = installed() ?? babelRewriter
      errorHook.prepareStackTrace = before
    },
  }
}

/** Sets Error.prepareStackTrace, for a test that needs a given hook in place under its hold. */
export function setStackHook(hook: unknown): void {
  errorHook.prepareStackTrace = hook
}
