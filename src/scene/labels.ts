/*
 * Scene labels (ARCHITECTURE §6.4, `LabelLayer`; D-021): all text in a scene is DOM, never painted in the canvas, so a
 * screen reader, the browser's zoom and the reader's own font settings reach it. A label is a DOM node anchored to a point
 * in the scene and moved to that point's projection on screen. It is re-projected only when the camera, the canvas size
 * or the anchor's frame moves, never on a clock.
 *
 * This file is the arithmetic and the label's shape. LabelLayer.tsx draws the nodes; LabelProjector.tsx moves them.
 */
import type { ReactNode } from 'react'
import type { Vec3 } from './camera-rig'

export interface LabelSpec {
  readonly id: string
  /** Where the label points, in the scene's units: in world space, or in the named frame's space. */
  readonly at: Vec3
  /** A named frame the anchor moves with, such as the time track ('track'). Default: the world. */
  readonly frame?: string
  /** Which side of the anchor the label sits on. */
  readonly place?: 'center' | 'above' | 'below' | 'left' | 'right'
  readonly content: ReactNode
  /** Extra classes for the label's box. */
  readonly className?: string
  /** Hidden in a canvas narrower than this, in CSS px: a label that needs room (the mirror and the 2D view still carry it). */
  readonly minWidth?: number
}

export interface ScreenPoint {
  readonly x: number
  readonly y: number
  /** False when the point is behind the camera or outside the canvas: the label hides. */
  readonly visible: boolean
}

/** A point in normalized device coordinates (each axis in [-1, 1] inside the view) to CSS pixels in a canvas this size. */
export function ndcToScreen(ndc: Vec3, size: { readonly width: number; readonly height: number }, marginPx = 0): ScreenPoint {
  const [x, y, z] = ndc
  const sx = ((x + 1) / 2) * size.width
  const sy = ((1 - y) / 2) * size.height
  const inside = sx >= -marginPx && sx <= size.width + marginPx && sy >= -marginPx && sy <= size.height + marginPx
  return { x: sx, y: sy, visible: z > -1 && z < 1 && inside }
}

/** The CSS transform that puts a label's box on its point, on the side it asks for. */
export function labelTransform(point: ScreenPoint, place: LabelSpec['place'] = 'center'): string {
  const shift = {
    center: '-50%, -50%',
    above: '-50%, calc(-100% - 6px)',
    below: '-50%, 6px',
    left: 'calc(-100% - 6px), -50%',
    right: '6px, -50%',
  }[place]
  // Whole pixels, so text never sits on a half pixel and blurs.
  return `translate3d(${Math.round(point.x)}px, ${Math.round(point.y)}px, 0) translate(${shift})`
}
