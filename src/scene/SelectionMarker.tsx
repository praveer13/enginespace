import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, MeshBasicMaterial, type InstancedMesh } from 'three'
import { useKit } from './kit'
import { writeMatrix, type MarkBox } from './marks'
import { roleColor } from './materials'

/*
 * The selection in 3D (ARCHITECTURE §6.4, `Selection`): a frame of bars around the selected mark's top, in the focus ink, because
 * focus is ink in Data Book (REDESIGN §2.8) as it is in the page. The selection itself lives in selection.ts and the DOM list; this only draws it. It sits in the same frame as the mark (put
 * it inside the TimeTrack for a span).
 */

export interface SelectionMarkerProps {
  /** The selected mark's box, or null. */
  box: MarkBox | null
  /** How far the frame stands off the mark, in scene units. */
  inset?: number
}

const BAR = 0.022

export function SelectionMarker({ box, inset = 0.03 }: SelectionMarkerProps) {
  const kit = useKit()
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  const material = useMemo(() => new MeshBasicMaterial({ color: roleColor(kit.tokens, 'focus') }), [kit.tokens])
  useEffect(() => () => material.dispose(), [material])
  const mesh = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const instanced = mesh.current
    if (!instanced) return
    if (!box) {
      instanced.count = 0
      kit.invalidate()
      return
    }
    const [cx, cy, cz] = box.center
    const [sx, sy, sz] = box.size
    const top = cy + sy / 2 + BAR / 2
    const w = sx + 2 * inset
    const d = sz + 2 * inset
    const bars: MarkBox[] = [
      { id: 'near', center: [cx, top, cz + d / 2], size: [w + BAR, BAR, BAR], role: 'focus', form: 'solid' },
      { id: 'far', center: [cx, top, cz - d / 2], size: [w + BAR, BAR, BAR], role: 'focus', form: 'solid' },
      { id: 'left', center: [cx - w / 2, top, cz], size: [BAR, BAR, d], role: 'focus', form: 'solid' },
      { id: 'right', center: [cx + w / 2, top, cz], size: [BAR, BAR, d], role: 'focus', form: 'solid' },
    ]
    const matrices = instanced.instanceMatrix.array as Float32Array
    bars.forEach((bar, i) => writeMatrix(bar, matrices, i * 16))
    instanced.count = bars.length
    instanced.instanceMatrix.needsUpdate = true
    instanced.computeBoundingSphere()
    kit.invalidate()
  }, [box, inset, kit])

  return <instancedMesh ref={mesh} name="selection" args={[geometry, material, 4]} raycast={() => null} />
}
