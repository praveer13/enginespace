/*
 * The graded labs that have a page: one descriptor (types.ts) per lab of lane L or F, by lab id. src/pages/Lab.tsx draws a lab listed here
 * with GradedLabView.tsx, and a lab that is not listed keeps its "not published yet" page (src/unbuilt/copy.ts) until the task that builds
 * the lab adds its descriptor here and takes it out of the stub list.
 *
 * It is empty: no lab of lane L or F has its kit and its grader module yet. tests/labs/descriptors.test.ts holds every entry to the lab list,
 * the checks of each stage and the tag rule, and to `labName`, so that the page's heading and its served document's say the same thing.
 */
import type { GradedLab } from './types'

export const GRADED_LABS: Readonly<Record<string, GradedLab>> = {}

/**
 * The labs whose specimen (specimen.ts) the dev server and a test build (`VITE_ES_TEST_HOOKS=1`) draw in place of the stub, so the page can be
 * looked at and tested in a browser before any lab is published. A production build draws none of them.
 */
export const SPECIMEN_IDS: readonly string[] = ['tr0.forward']
