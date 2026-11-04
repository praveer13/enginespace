import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Matrix4, Vector3 } from 'three'
import type { LabelStore } from './label-store'
import { labelTransform, ndcToScreen } from './labels'

/*
 * Moves the DOM labels onto their anchors (labels.ts). It runs after the frame is drawn, and projects again only when the
 * camera, its projection, the canvas size, a named frame or the labels themselves changed, so a still scene touches no
 * style at all.
 */

/** How far off the canvas a label may still show, in px: one leaning in from the edge stays readable. */
const EDGE_MARGIN = 24

export function LabelProjector({ store }: { store: LabelStore }) {
  const seen = useRef({ view: new Matrix4(), projection: new Matrix4(), width: -1, height: -1, version: -1, frames: new Map<string, Matrix4>() })
  const point = useRef(new Vector3())

  useFrame((state) => {
    const last = seen.current
    const { camera, size } = state
    let moved = last.version !== store.version || last.width !== size.width || last.height !== size.height
    moved ||= !last.view.equals(camera.matrixWorld) || !last.projection.equals(camera.projectionMatrix)
    for (const [name, frame] of store.frames) {
      const known = last.frames.get(name)
      if (!known || !known.equals(frame.matrixWorld)) moved = true
    }
    if (!moved) return

    last.version = store.version
    last.width = size.width
    last.height = size.height
    last.view.copy(camera.matrixWorld)
    last.projection.copy(camera.projectionMatrix)
    last.frames.clear()
    for (const [name, frame] of store.frames) last.frames.set(name, frame.matrixWorld.clone())

    const v = point.current
    for (const spec of store.specs) {
      const node = store.nodes.get(spec.id)
      if (!node) continue
      v.set(spec.at[0], spec.at[1], spec.at[2])
      const frame = spec.frame ? store.frames.get(spec.frame) : undefined
      if (frame) v.applyMatrix4(frame.matrixWorld)
      v.project(camera)
      const screen = ndcToScreen([v.x, v.y, v.z], size, EDGE_MARGIN)
      const roomy = spec.minWidth === undefined || size.width >= spec.minWidth
      node.style.transform = labelTransform(screen, spec.place)
      node.style.visibility = screen.visible && roomy ? 'visible' : 'hidden'
    }
  }, 2)
  return null
}
