import { useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useKit } from '../kit'

/*
 * Motion for the props (scene kit v1): every move runs on one of DESIGN.md's durations, starts on the bell (or the printer's feed),
 * and holds the frame loop only while it runs, so between bells the kitchen is still and draws nothing. Under reduced motion a move
 * is never started: the change is drawn at its end, as a cut.
 */

/** The printer's stepped feed: `steps(6, end)`, so the paper advances in line steps, never a glide. */
export const feedSteps = (t: number): number => (t >= 1 ? 1 : Math.floor(t * 6) / 6)

/** How far a move of `ms`, started at `start` after `delay`, has got at `now`: 0 before it starts, 1 when done. */
export function progress(now: number, start: number, ms: number, delay = 0): number {
  if (ms <= 0) return now >= start + delay ? 1 : 0
  return Math.min(1, Math.max(0, (now - start - delay) / ms))
}

/**
 * Calls `step(now)` every frame while it returns true, holding the loop for exactly that long. `wake()` (after a change that starts
 * a move) begins the frames. The callback is the component's latest, so it reads the latest props.
 */
export function useMotionLoop(step: (now: number) => boolean): () => void {
  const kit = useKit()
  const release = useRef<(() => void) | null>(null)
  const latest = useRef(step)
  const hold = useRef(kit.hold)
  useLayoutEffect(() => {
    latest.current = step
    hold.current = kit.hold
  })
  const wake = useCallback(() => {
    release.current ??= hold.current()
  }, [])
  useFrame(() => {
    if (!release.current) return
    if (!latest.current(performance.now())) {
      release.current()
      release.current = null
    }
  }, -1)
  useEffect(
    () => () => {
      release.current?.()
      release.current = null
    },
    [],
  )
  return wake
}
