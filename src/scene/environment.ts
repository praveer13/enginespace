/*
 * The kitchen the steel reflects (TRACKER W0-T15): a procedural environment map, so the stainless has fluorescent tubes and
 * heat lamps to mirror without an image asset. A dim box of a room with a row of tube panels overhead, the warm glow of the
 * lamps in front, and the steel's own grey on the walls, rendered once into a prefiltered cube (PMREM) for image-based
 * light. Every colour is a role; the room is never drawn, only reflected.
 */
import { BackSide, BoxGeometry, Color, Mesh, MeshBasicMaterial, PMREMGenerator, Scene, type WebGLRenderer, type WebGLRenderTarget } from 'three'
import type { SceneTokens } from '@/design/scene-tokens'
import { roleColor } from './materials'

export interface KitchenEnvironment {
  readonly target: WebGLRenderTarget
  dispose(): void
}

/** How much brighter than white the tubes and lamps are in the reflected room [estimated]: they are light sources. */
const TUBE_GLOW = 5
const LAMP_GLOW = 7

export function kitchenEnvironment(renderer: WebGLRenderer, tokens: SceneTokens): KitchenEnvironment {
  const room = new Scene()
  const disposables: { dispose(): void }[] = []
  const box = (size: [number, number, number], at: [number, number, number], color: Color, back = false) => {
    const geometry = new BoxGeometry(...size)
    const material = new MeshBasicMaterial({ color })
    if (back) material.side = BackSide
    const mesh = new Mesh(geometry, material)
    mesh.position.set(...at)
    room.add(mesh)
    disposables.push(geometry, material)
  }

  // The room: steel-grey walls, a darker floor, a pale ceiling.
  box([24, 9, 30], [0, 3, -4], roleColor(tokens, 'surface-2').multiplyScalar(0.55), true)
  box([24, 0.2, 30], [0, -1.4, -4], roleColor(tokens, 'surface-3').multiplyScalar(0.5))
  // Fluorescent tube panels overhead, running down the line.
  for (const x of [-6, -2, 2, 6]) box([0.7, 0.12, 22], [x, 7.2, -6], roleColor(tokens, 'light-fluorescent').multiplyScalar(TUBE_GLOW))
  // A cross tube behind the expo, so the pass's top catches a long highlight.
  box([18, 0.12, 0.7], [0, 6.6, 7], roleColor(tokens, 'light-fluorescent').multiplyScalar(TUBE_GLOW * 0.8))
  // The heat lamps' glow, low and in front.
  for (const x of [-2.2, 0, 2.2]) box([0.9, 0.3, 0.9], [x, 3.4, 1.2], roleColor(tokens, 'lamp').multiplyScalar(LAMP_GLOW))

  const generator = new PMREMGenerator(renderer)
  const target = generator.fromScene(room, 0.035)
  generator.dispose()
  for (const item of disposables) item.dispose()
  return {
    target,
    dispose: () => target.dispose(),
  }
}
