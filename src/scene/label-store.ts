/*
 * The handoff between the DOM labels and the projector that moves them (labels.ts): LabelLayer registers each label's node
 * and spec here, the projector inside the canvas reads them and writes each node's transform. Named frames (the time track)
 * register here too, so an anchor can ride along with a moving group. Plain mutable state, outside React's render: a
 * camera move rewrites a few style transforms and re-renders nothing.
 */
import type { Object3D } from 'three'
import type { LabelSpec } from './labels'

export class LabelStore {
  readonly nodes = new Map<string, HTMLElement>()
  readonly frames = new Map<string, Object3D>()
  specs: readonly LabelSpec[] = []
  /** Bumped when the specs change, so the projector knows to project again. */
  version = 0
  /** Asks the canvas for a frame; SceneCanvas sets it once the root exists. */
  private invalidate: () => void = () => undefined

  setInvalidate(invalidate: () => void): void {
    this.invalidate = invalidate
  }

  setSpecs(specs: readonly LabelSpec[]): void {
    this.specs = specs
    this.version += 1
    this.invalidate()
  }

  attach(id: string, node: HTMLElement | null): void {
    if (node) this.nodes.set(id, node)
    else this.nodes.delete(id)
  }

  registerFrame(name: string, object: Object3D): () => void {
    this.frames.set(name, object)
    this.version += 1
    return () => {
      if (this.frames.get(name) === object) this.frames.delete(name)
    }
  }
}
