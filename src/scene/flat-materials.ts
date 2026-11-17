/*
 * Data Book's materials in 3D (REDESIGN §2.8, Materials: "3D is a model of the same diagram"): matte, flat-shaded solids in the code's
 * colours on a pale base plate, each on a soft contact shadow; idle and empty as dashed wire outlines; the now cursor a thin amber sheet,
 * the only thing that glows. No steel, no texture, no environment map, and nothing here asks for bloom. Every colour is a role, read
 * through scene-tokens.ts; the physical numbers are [estimated], set by eye at 1440 and 390 in Lifted and Side.
 *
 *   solid     MeshLambertMaterial, flat-shaded, coloured per instance from a role. Each form is drawn in the shader as the kit's marks are
 *             (marks.ts): solid, hollow (a rim, see-through), groove (a pale recess inside a rim) and marked (hatched). Its sides carry
 *             baked occlusion: darker toward the foot, where the plate shades them, so a slab sits on the paper at every tier, with no
 *             shadow map.
 *   shadow    the contact shadow under each solid: a soft-edged footprint in `text-1`, its falloff in world units so a long slab and a
 *             short chip darken the paper alike.
 *   wire      dashed lines in `edge`; `rule` the graticule in `paper-rule`; `ink` dimension lines and the axis in `edge`.
 *   cursor    the marker, unlit: amber with its edge (`lamp`, `lamp-ring`), never tone-mapped, so it reads as the one light in the scene.
 */
import { Color, DoubleSide, LineBasicMaterial, LineDashedMaterial, MeshBasicMaterial, MeshLambertMaterial, ShaderMaterial } from 'three'
import type { SceneTokens } from '@/design/scene-tokens'
import { roleColor } from './materials'

/** A hollow or grooved box's rim, in world units [estimated]: about 1.5 px of the diagram. */
export const FLAT_RIM = 0.015
/** The contact shadow's darkest, and how far past a footprint it fades, in world units [estimated]. */
export const SHADOW = { strength: 0.5, reach: 0.14 } as const
/** Baked occlusion at a solid's foot, as a share of its colour [estimated]: the sides go from this at the foot to full at the top. */
export const FOOT_SHADE = 0.66
/** The dashes of a wire outline, in world units [estimated]: 4 px on, 3 px off, as the 2D diagram's dashed boxes. */
export const DASH = { dash: 0.04, gap: 0.03 } as const

export interface FlatMaterials {
  readonly solid: MeshLambertMaterial
  readonly shadow: ShaderMaterial
  readonly wire: LineDashedMaterial
  readonly rule: LineBasicMaterial
  readonly ink: LineBasicMaterial
  readonly cursor: MeshBasicMaterial
  readonly cursorEdge: MeshBasicMaterial
  dispose(): void
}

/** The identity tint: a solid's colour comes per instance, from its role, and multiplies this. */
const UNTINTED = () => new Color(1, 1, 1)

/** The forms and the baked occlusion, patched into the Lambert material's colour. */
function patchSolid(material: MeshLambertMaterial) {
  material.customProgramCacheKey = () => 'es-flat-solid-v2'
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: FLAT_RIM }
    shader.uniforms.uFoot = { value: FOOT_SHADE }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aForm;
varying float vForm;
varying vec3 vFaceNormal;
varying vec2 vFaceUv;
varying vec3 vBoxScale;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vForm = aForm;
vFaceNormal = normal;
vFaceUv = uv;
#ifdef USE_INSTANCING
vBoxScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
#else
vBoxScale = vec3(1.0);
#endif`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uRim;
uniform float uFoot;
varying float vForm;
varying vec3 vFaceNormal;
varying vec2 vFaceUv;
varying vec3 vBoxScale;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float form = floor(vForm + 0.5);
  vec3 axis = abs(vFaceNormal);
  vec2 extent = axis.y > 0.5 ? vBoxScale.xz : (axis.x > 0.5 ? vBoxScale.zy : vBoxScale.xy);
  vec2 edge = min(vFaceUv, 1.0 - vFaceUv) * extent;
  float inner = min(edge.x, edge.y);
  float rim = min(uRim, 0.3 * min(extent.x, extent.y));
  if (form == 1.0 && inner > rim) discard;
  if (form == 2.0 && axis.y > 0.5 && inner > rim) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), 0.55);
  if (form == 3.0 && axis.y > 0.5 && fract((vFaceUv.x * extent.x + vFaceUv.y * extent.y) * 16.0) < 0.42) diffuseColor.rgb *= 0.55;
  if (axis.y < 0.5) diffuseColor.rgb *= mix(uFoot, 1.0, smoothstep(0.0, 0.9, vFaceUv.y));
}`,
      )
      // A solid's top is the diagram's own colour, as the 2D view fills it: unlit, so the code's colours do not drift; its sides take the
      // light and the baked occlusion, which is where the depth reads.
      .replace(
        '#include <opaque_fragment>',
        `if (abs(vFaceNormal.y) > 0.5) outgoingLight = diffuseColor.rgb;
#include <opaque_fragment>`,
      )
  }
}

/** The contact shadow: an instanced quad lying on the plate, as wide as its footprint plus its reach on every side. */
function shadowMaterial(tokens: SceneTokens): ShaderMaterial {
  return new ShaderMaterial({
    name: 'flat-shadow',
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: roleColor(tokens, 'text-1') }, uStrength: { value: SHADOW.strength }, uReach: { value: SHADOW.reach } },
    vertexShader: `
varying vec2 vLocal;
varying vec2 vHalf;
void main() {
  vec3 scale = vec3(length(instanceMatrix[0].xyz), 1.0, length(instanceMatrix[2].xyz));
  vLocal = position.xz * scale.xz;
  vHalf = scale.xz * 0.5;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `
uniform vec3 uColor;
uniform float uStrength;
uniform float uReach;
varying vec2 vLocal;
varying vec2 vHalf;
void main() {
  vec2 inside = max(abs(vLocal) - (vHalf - vec2(uReach)), 0.0);
  float fall = 1.0 - smoothstep(0.0, uReach, length(inside));
  gl_FragColor = vec4(uColor, uStrength * fall * fall);
  #include <colorspace_fragment>
}`,
  })
}

export function createFlatMaterials(tokens: SceneTokens): FlatMaterials {
  // Not tone-mapped: a top is the role's colour exactly (#237a37 is #237a37), and the lit sides stay matte.
  const solid = new MeshLambertMaterial({ name: 'flat-solid', color: UNTINTED(), flatShading: true, side: DoubleSide, toneMapped: false })
  patchSolid(solid)
  const shadow = shadowMaterial(tokens)
  const wire = new LineDashedMaterial({ name: 'flat-wire', color: roleColor(tokens, 'edge'), dashSize: DASH.dash, gapSize: DASH.gap })
  const rule = new LineBasicMaterial({ name: 'flat-rule', color: roleColor(tokens, 'paper-rule') })
  const ink = new LineBasicMaterial({ name: 'flat-ink', color: roleColor(tokens, 'edge') })
  // The cursor's colour comes per instance, from its role (the marker, #ffb547, and its edge), so the material only multiplies it by white.
  const cursor = new MeshBasicMaterial({ name: 'flat-cursor', color: UNTINTED(), toneMapped: false })
  const cursorEdge = new MeshBasicMaterial({ name: 'flat-cursor-edge', color: UNTINTED(), toneMapped: false })
  const all = [solid, shadow, wire, rule, ink, cursor, cursorEdge]
  return {
    solid,
    shadow,
    wire,
    rule,
    ink,
    cursor,
    cursorEdge,
    dispose() {
      for (const material of all) material.dispose()
    },
  }
}
