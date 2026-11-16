/*
 * The viewer's words for the DOM: what a lane is called, what a kind of span is called, and the slot of the one colour code that each
 * kind of span and each category takes (so that the table, the legend and the labels draw the same glyph the canvas's colour stands
 * for, WCAG 1.4.1: a category is never colour alone). All of them are the engine's own terms (REDESIGN 2.7).
 */
import type { Slot } from '@/design/code'
import type { TraceTrackKind } from '@es/sim/trace'
import type { Category } from './marks'
import type { SpanStyle } from './model'
import { CATEGORY_ROLE, slotOfRole, STYLE_ROLE } from './theme'

/** A lane's name: the engine's term for the kind of track. The track's own name, as the profiler wrote it, follows it. */
export const LANE_WORDS: Readonly<Record<TraceTrackKind, string>> = {
  'cpu-thread': 'CPU lane',
  'cuda-api': 'CUDA calls',
  'gpu-stream': 'GPU lane',
  marker: 'Notes',
}

/** The kind of span a lane mainly holds, which gives its label the glyph of that kind's colour. */
export const LANE_STYLE: Readonly<Record<TraceTrackKind, SpanStyle>> = {
  'cpu-thread': 'frame',
  'cuda-api': 'launch',
  'gpu-stream': 'kernel',
  marker: 'note',
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
export const slotOfLane = (kind: TraceTrackKind): Slot => slotOfStyle(LANE_STYLE[kind])
export const slotOfCategory = (category: Category): Slot => slotOfRole(CATEGORY_ROLE[category])
