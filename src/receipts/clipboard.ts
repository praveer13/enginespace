/*
 * Copying a token or a command to the clipboard (W2-T06): the Clipboard API where the browser has it, and the learner's own hands where
 * it does not.
 *
 * `navigator.clipboard` exists only in a secure context, and the browser refuses `writeText` when the page is not focused or the
 * learner has denied it. The site is served over HTTPS and from localhost, so those are rare, and the page then selects the text it
 * could not copy, so that the learner's own Ctrl+C (or a long press) finishes the job. Nothing is stored and nothing is sent: the
 * clipboard is the learner's, and a token is not secret in any case (A§8.2: "unseen, though not secret").
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** Puts text on the clipboard, and says whether the browser let it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Selects everything inside an element, as a triple click would. */
export function selectContents(element: Element | null): void {
  const selection = typeof window === 'undefined' ? null : window.getSelection()
  if (element === null || selection === null) return
  const range = document.createRange()
  range.selectNodeContents(element)
  selection.removeAllRanges()
  selection.addRange(range)
}

export type CopyStatus = 'idle' | 'copied' | 'failed'

/** How long "copied" stays on the page [estimated]: long enough to be read, short enough that the next copy is not met by a stale word. */
export const COPIED_MS = 4000

/**
 * The state of one copy button: what it last did. `copy` writes the text and, if the browser refuses, calls `onRefused` so that the page
 * can select the text for the learner. A status that says "copied" fades back to idle by itself.
 */
export function useCopy(): { status: CopyStatus; what: string; copy: (text: string, what: string, onRefused?: () => void) => Promise<void> } {
  const [state, setState] = useState<{ status: CopyStatus; what: string }>({ status: 'idle', what: '' })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )
  const copy = useCallback(async (text: string, what: string, onRefused?: () => void) => {
    if (timer.current !== null) clearTimeout(timer.current)
    const ok = await copyText(text)
    if (!ok) onRefused?.()
    setState({ status: ok ? 'copied' : 'failed', what })
    if (ok) timer.current = setTimeout(() => setState({ status: 'idle', what: '' }), COPIED_MS)
  }, [])
  return { ...state, copy }
}
