import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Color, InstancedBufferAttribute, type InstancedMesh } from 'three'
import type { ColorRoleName } from '@/design/tokens'
import { useKit } from './kit'
import { capacityFor, formIndex, writeMatrix, type MarkBox } from './marks'
import { roleColor } from './materials'
import { pickedId } from './selection'
import { useTrack } from './track'

/*
 * The instanced core under SpanInstances and BlockGrid (ARCHITECTURE §6.4): one InstancedMesh of unit boxes, so a scene's
 * slabs are one draw call however many there are, and its cells another. Each instance carries a matrix (scale and
 * position, no rotation), a colour resolved from its role, and its form, which the marks material draws (materials.ts).
 *
 * Inside a TimeTrack, a mark later than the sweeping present is cut off at it, frame by frame, so a step extrudes out of
 * the pass. Only the marks a sweep reaches are rewritten, and only while it sweeps.
 */

export interface MarkInstancesProps {
  boxes: readonly MarkBox[]
  /** A pick on a mark: its id. The DOM list takes focus from here (selection.ts). */
  onPick?: (id: string) => void
  name?: string
}

export function MarkInstances({ boxes, onPick, name = 'marks' }: MarkInstancesProps) {
  const kit = useKit()
  const track = useTrack()
  const capacity = capacityFor(boxes.length)
  const geometry = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1)
    box.setAttribute('aForm', new InstancedBufferAttribute(new Float32Array(capacity), 1))
    return box
  }, [capacity])
  useEffect(() => () => geometry.dispose(), [geometry])
  const mesh = useRef<InstancedMesh>(null)
  const ids = useMemo(() => boxes.map((box) => box.id), [boxes])
  const sweep = useRef<{ boxes: readonly MarkBox[]; from: number; indices: number[]; active: boolean }>({ boxes: [], from: Number.NaN, indices: [], active: false })

  useLayoutEffect(() => {
    const instanced = mesh.current
    if (!instanced) return
    const matrices = instanced.instanceMatrix.array as Float32Array
    const forms = geometry.getAttribute('aForm') as InstancedBufferAttribute
    const colours = new Map<ColorRoleName, Color>()
    const clip = track?.moving() ? track.presentZ() : Number.POSITIVE_INFINITY
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]
      writeMatrix(box, matrices, i * 16, clip)
      ;(forms.array as Float32Array)[i] = formIndex(box.form)
      let colour = colours.get(box.role)
      if (!colour) {
        colour = roleColor(kit.tokens, box.role)
        colours.set(box.role, colour)
      }
      instanced.setColorAt(i, colour)
    }
    instanced.count = boxes.length
    instanced.instanceMatrix.clearUpdateRanges()
    instanced.instanceMatrix.needsUpdate = true
    forms.needsUpdate = true
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true
    instanced.computeBoundingSphere()
    sweep.current = { boxes: [], from: Number.NaN, indices: [], active: false }
    kit.invalidate()
  }, [boxes, geometry, kit, track])

  useFrame(() => {
    const instanced = mesh.current
    if (!instanced || !track) return
    const state = sweep.current
    const moving = track.moving()
    if (!moving && !state.active) return
    // The marks a sweep reaches: those whose near face lies past where the present started from.
    if (state.boxes !== boxes || state.from !== track.sweepFromZ()) {
      const from = track.sweepFromZ()
      const indices: number[] = []
      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i]
        if (box.center[2] + box.size[2] / 2 > from - 1e-6) indices.push(i)
      }
      sweep.current = { boxes, from, indices, active: true }
    }
    const clip = moving ? track.presentZ() : Number.POSITIVE_INFINITY
    const matrices = instanced.instanceMatrix.array as Float32Array
    instanced.instanceMatrix.clearUpdateRanges()
    for (const i of sweep.current.indices) {
      writeMatrix(boxes[i], matrices, i * 16, clip)
      instanced.instanceMatrix.addUpdateRange(i * 16, 16)
    }
    instanced.instanceMatrix.needsUpdate = true
    if (!moving) sweep.current = { ...sweep.current, active: false }
  }, -1)

  const pick = onPick
    ? (event: ThreeEvent<MouseEvent>) => {
        const id = pickedId(ids, event.instanceId)
        if (id === null) return
        event.stopPropagation()
        onPick(id)
      }
    : undefined

  return <instancedMesh ref={mesh} name={name} args={[geometry, kit.materials.marks, capacity]} onClick={pick} />
}
