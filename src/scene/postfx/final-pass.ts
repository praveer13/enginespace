/*
 * The composer's last pass (ARCHITECTURE §6.5): tone mapping and the sRGB encoding that three's OutputPass does, with FXAA
 * folded in, so anti-aliasing costs no full-screen pass of its own and T2 stays within its one effect pass (plan.ts).
 *
 * FXAA runs on the tone-mapped, encoded colour, where edges have the contrast the eye sees: each sample is tone-mapped
 * before its luma is compared. The edge search is the console variant of Timothy Lottes's FXAA 3.11: four diagonal samples
 * give the edge's direction, two taps along it blend the edge, and a wider pair is kept only if it stays within the local
 * luma range. The tone-mapping and colour-space defines follow the renderer, as OutputPass's do.
 */
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  CineonToneMapping,
  ColorManagement,
  LinearToneMapping,
  NeutralToneMapping,
  RawShaderMaterial,
  ReinhardToneMapping,
  SRGBTransfer,
  Vector2,
  type ToneMapping,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three'
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js'

const VERTEX = /* glsl */ `
precision highp float;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 texel;
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
varying vec2 vUv;

vec3 toneMapped(vec3 color) {
  #if defined( LINEAR_TONE_MAPPING )
    return LinearToneMapping(color);
  #elif defined( REINHARD_TONE_MAPPING )
    return ReinhardToneMapping(color);
  #elif defined( CINEON_TONE_MAPPING )
    return CineonToneMapping(color);
  #elif defined( ACES_FILMIC_TONE_MAPPING )
    return ACESFilmicToneMapping(color);
  #elif defined( AGX_TONE_MAPPING )
    return AgXToneMapping(color);
  #elif defined( NEUTRAL_TONE_MAPPING )
    return NeutralToneMapping(color);
  #else
    return color;
  #endif
}

vec3 encoded(vec3 color) {
  #ifdef SRGB_TRANSFER
    return sRGBTransferOETF(vec4(color, 1.0)).rgb;
  #else
    return color;
  #endif
}

vec3 tap(vec2 at) {
  return encoded(toneMapped(texture2D(tDiffuse, at).rgb));
}

float luma(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec3 middle = tap(vUv);
  #ifdef USE_FXAA
    vec3 nw = tap(vUv + vec2(-1.0, 1.0) * texel);
    vec3 ne = tap(vUv + vec2(1.0, 1.0) * texel);
    vec3 sw = tap(vUv + vec2(-1.0, -1.0) * texel);
    vec3 se = tap(vUv + vec2(1.0, -1.0) * texel);
    float lnw = luma(nw);
    float lne = luma(ne);
    float lsw = luma(sw);
    float lse = luma(se);
    float lm = luma(middle);
    float lmin = min(lm, min(min(lnw, lne), min(lsw, lse)));
    float lmax = max(lm, max(max(lnw, lne), max(lsw, lse)));
    vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));
    float reduce = max((lnw + lne + lsw + lse) * (0.25 / 8.0), 1.0 / 128.0);
    float scale = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
    dir = clamp(dir * scale, vec2(-8.0), vec2(8.0)) * texel;
    vec3 near = 0.5 * (tap(vUv - dir / 6.0) + tap(vUv + dir / 6.0));
    vec3 far = 0.5 * near + 0.25 * (tap(vUv - dir * 0.5) + tap(vUv + dir * 0.5));
    float lfar = luma(far);
    gl_FragColor = vec4((lfar < lmin || lfar > lmax) ? near : far, 1.0);
  #else
    gl_FragColor = vec4(middle, 1.0);
  #endif
}`

const TONE_DEFINES: ReadonlyArray<[ToneMapping, string]> = [
  [LinearToneMapping, 'LINEAR_TONE_MAPPING'],
  [ReinhardToneMapping, 'REINHARD_TONE_MAPPING'],
  [CineonToneMapping, 'CINEON_TONE_MAPPING'],
  [ACESFilmicToneMapping, 'ACES_FILMIC_TONE_MAPPING'],
  [AgXToneMapping, 'AGX_TONE_MAPPING'],
  [NeutralToneMapping, 'NEUTRAL_TONE_MAPPING'],
]

export class FinalPass extends Pass {
  readonly material: RawShaderMaterial
  private readonly quad: FullScreenQuad
  private readonly fxaa: boolean
  private lastTone: ToneMapping | null = null
  private lastSpace: string | null = null

  constructor(fxaa: boolean) {
    super()
    this.fxaa = fxaa
    this.material = new RawShaderMaterial({
      name: 'FinalPass',
      uniforms: { tDiffuse: { value: null }, texel: { value: new Vector2(1, 1) }, toneMappingExposure: { value: 1 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    })
    this.quad = new FullScreenQuad(this.material)
  }

  setSize(width: number, height: number): void {
    ;(this.material.uniforms.texel.value as Vector2).set(1 / Math.max(1, width), 1 / Math.max(1, height))
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void {
    this.material.uniforms.tDiffuse.value = readBuffer.texture
    this.material.uniforms.toneMappingExposure.value = renderer.toneMappingExposure
    if (this.lastTone !== renderer.toneMapping || this.lastSpace !== renderer.outputColorSpace) {
      this.lastTone = renderer.toneMapping
      this.lastSpace = renderer.outputColorSpace
      const defines: Record<string, string> = {}
      if (ColorManagement.getTransfer(renderer.outputColorSpace) === SRGBTransfer) defines.SRGB_TRANSFER = ''
      const tone = TONE_DEFINES.find(([mapping]) => mapping === renderer.toneMapping)
      if (tone) defines[tone[1]] = ''
      if (this.fxaa) defines.USE_FXAA = ''
      this.material.defines = defines
      this.material.needsUpdate = true
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    if (!this.renderToScreen && this.clear) renderer.clear()
    this.quad.render(renderer)
  }

  dispose(): void {
    this.material.dispose()
    this.quad.dispose()
  }
}
