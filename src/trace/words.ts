/*
 * The viewer's words for the DOM: what a lane is called in the kitchen, what a kind of span is called in the engine's terms, and the
 * slot of the categorical code that each kind of span and each category takes (so that the table and the labels draw the same
 * glyph the canvas's colour stands for, WCAG 1.4.1: a category is never colour alone).
 */
import type { Slot } from '@/design/code'
import type { TraceTrackKind } from '@es/sim/trace'
import type { Category } from './marks'
import type { SpanStyle } from './model'
import { CATEGORY_ROLE, slotOfRole, STYLE_ROLE } from './theme'

/** A lane's name in the kitchen (GAMES.md §2.6, The Tape); the engine's own term for it is the track's name. */
export const LANE_WORDS: Readonly<Record<TraceTrackKind, string>> = {
  'cpu-thread': "expo's lane",
  'cuda-api': 'the calls',
  'gpu-stream': 'the line',
  marker: 'the notes',
}

/** What a kind of span is called, for the table: the engine's term. */
export const STYLE_WORDS: Readonly<Record<SpanStyle, string>> = {
  frame: 'frame',
  launch: 'call',
  kernel: 'kernel',
  copy: 'copy',
  sync: 'sync',
  note: 'note',
}

export const slotOfStyle = (style: SpanStyle): Slot => slotOfRole(STYLE_ROLE[style])
export const slotOfCategory = (category: Category): Slot => slotOfRole(CATEGORY_ROLE[category])
