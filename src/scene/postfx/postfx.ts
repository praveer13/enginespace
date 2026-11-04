/*
 * The `postfx` chunk (ARCHITECTURE §6.5, §6.10): three's own post-processing addons, locked to three 0.185.1 (D-021), loaded
 * only when a plan at T2 or above asks for a composer. The scene renders into a half-float target; bloom at half resolution
 * catches the heat lamps' glow; the final pass tone-maps, encodes and anti-aliases.
 *
 * The scene render's own draw calls are read between the scene pass and the effects, so the kit's draw-call budget counts
 * the scene and not the fixed cost of the passes after it.
 */
import { HalfFloatType, Vector2, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { FinalPass } from './final-pass'
import { BLOOM, type PostFxPlan } from './plan'

export interface PostFx {
  /** Renders a frame through the passes. Returns the scene render's own draw calls and triangles. */
  render(delta: number): { calls: number; triangles: number }
  setSize(width: number, height: number, dpr: number): void
  setCamera(camera: Camera): void
  readonly plan: PostFxPlan
  dispose(): void
}

export function createPostFx(renderer: WebGLRenderer, scene: Scene, camera: Camera, plan: PostFxPlan, size: { width: number; height: number; dpr: number }): PostFx {
  const target = new WebGLRenderTarget(Math.max(1, size.width * size.dpr), Math.max(1, size.height * size.dpr), { type: HalfFloatType })
  const composer = new EffectComposer(renderer, target)
  composer.setPixelRatio(size.dpr)
  composer.setSize(size.width, size.height)

  const scenePass = new RenderPass(scene, camera)
  let sceneCounts = { calls: 0, triangles: 0 }
  const renderScene = scenePass.render.bind(scenePass)
  scenePass.render = (...args: Parameters<RenderPass['render']>) => {
    renderScene(...args)
    sceneCounts = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }
  }
  composer.addPass(scenePass)

  const bloom = plan.bloom ? new UnrealBloomPass(new Vector2(size.width, size.height), BLOOM.strength, BLOOM.radius, BLOOM.threshold) : null
  if (bloom) composer.addPass(bloom)
  const final = new FinalPass(plan.fxaa)
  composer.addPass(final)

  return {
    plan,
    render(delta) {
      composer.render(delta)
      return sceneCounts
    },
    setSize(width, height, dpr) {
      composer.setPixelRatio(dpr)
      composer.setSize(width, height)
    },
    setCamera(next) {
      scenePass.camera = next
    },
    dispose() {
      bloom?.dispose()
      final.dispose()
      scenePass.dispose()
      composer.dispose()
      target.dispose()
    },
  }
}
