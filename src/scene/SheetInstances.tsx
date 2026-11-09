import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Euler, Matrix4, PlaneGeometry, Quaternion, Vector3, type InstancedMesh } from 'three'
import type { Vec3 } from './camera-rig'
import { useKit } from './kit'
import { capacityFor } from './marks'
import { pickedId } from './selection'
import type { ThreeEvent } from '@react-three/fiber'

/*
 * Paper and tape in the scene (GAMES.md §2.6): the tickets on the rail and the masking-tape strips on the pans and the
 * pass, as instanced sheets of the paper or tape material. A sheet carries no print: its number and words are DOM labels
 * anchored to it (rule 7, D-021). A ticket's sheet curls a little at the foot, as one does off the printer.
 */

export interface Sheet {
  readonly id: string
  readonly center: Vec3
  /** Width and height, in scene units. */
  readonly size: readonly [number, number]
  /** Rotation in radians about x, y and z, in that order. Default: facing +z, upright. */
  readonly rotation?: Vec3
}

export interface SheetInstancesProps {
  sheets: readonly Sheet[]
  kind: 'paper' | 'tape'
  /** How far the sheet's foot curls toward its front, as a share of its height. */
  curl?: number
  onPick?: (id: string) => void
  name?: string
}

/** A plane whose lower half curls forward along a parabola. */
function sheetGeometry(curl: number): PlaneGeometry {
  const plane = new PlaneGeometry(1, 1, 1, curl > 0 ? 10 : 1)
  if (curl > 0) {
    const position = plane.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      const below = Math.max(0, -position.getY(i)) * 2
      position.setZ(i, curl * below * below)
    }
    plane.computeVertexNormals()
  }
  return plane
}

export function SheetInstances({ sheets, kind, curl = 0, onPick, name }: SheetInstancesProps) {
  const kit = useKit()
  const capacity = capacityFor(sheets.length)
  const geometry = useMemo(() => sheetGeometry(curl), [curl])
  useEffect(() => () => geometry.dispose(), [geometry])
  const mesh = useRef<InstancedMesh>(null)
  const ids = useMemo(() => sheets.map((sheet) => sheet.id), [sheets])

  useLayoutEffect(() => {
    const instanced = mesh.current
    if (!instanced) return
    const matrix = new Matrix4()
    const quaternion = new Quaternion()
    const euler = new Euler()
    const position = new Vector3()
    const scale = new Vector3()
    sheets.forEach((sheet, i) => {
      const [rx, ry, rz] = sheet.rotation ?? [0, 0, 0]
      quaternion.setFromEuler(euler.set(rx, ry, rz))
      matrix.compose(position.set(...sheet.center), quaternion, scale.set(sheet.size[0], sheet.size[1], 1))
      instanced.setMatrixAt(i, matrix)
    })
    instanced.count = sheets.length
    instanced.instanceMatrix.needsUpdate = true
    instanced.computeBoundingSphere()
    kit.invalidate()
  }, [sheets, geometry, capacity, kit])

  const pick = onPick
    ? (event: ThreeEvent<MouseEvent>) => {
        const id = pickedId(ids, event.instanceId)
        if (id === null) return
        event.stopPropagation()
        onPick(id)
      }
    : undefined

  return <instancedMesh ref={mesh} name={name ?? kind} args={[geometry, kind === 'paper' ? kit.materials.paper : kit.materials.tape, capacity]} onClick={pick} />
}
