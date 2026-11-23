/*
 * The specimens of graded lab pages: the descriptor of a lab whose page is wanted in the dev server and in a test build (`VITE_ES_TEST_HOOKS=1`) before
 * the lab is published (published.ts). A production build holds none of it (GradedLabPage.tsx reads it only behind the same constant that
 * src/pages/TraceRoom.tsx's specimen uses). TR0's forward pass was the first specimen and is published now, so there is none: the next lab's
 * descriptor goes here while its kit is built, and moves to published.ts with the kit.
 */
import type { GradedLab } from './types'

export const SPECIMENS: Readonly<Record<string, GradedLab>> = {}
