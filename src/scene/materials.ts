/*
 * The scene kit's one material (REDESIGN §2.8): the instanced marks of SpanInstances and BlockGrid, a matte standard material whose colour
 * comes per instance from a role, and whose forms the shader draws: solid, hollow (a rim, see-through), groove (a dark recess inside a
 * rim) and marked (hatched). Every colour comes from the token roles through scene-tokens.ts; no texture is made, so no image ships and
 * nothing is generated.
 */
import { Color, DoubleSide, MeshStandardMaterial } from 'three'
import type { SceneTokens } from '@/design/scene-tokens'
import { resolveColor, type ColorRoleName } from '@/design/tokens'

/** The rim of a hollow or grooved mark, in world units [estimated]. */
export const MARK_RIM = 0.014

export interface KitMaterials {
  readonly marks: MeshStandardMaterial
  dispose(): void
}

/** The mark shader's forms (marks.ts's MARK_FORMS): 0 solid, 1 hollow, 2 groove, 3 marked. */
function patchMarks(material: MeshStandardMaterial) {
  material.customProgramCacheKey = () => 'es-marks-v1'
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: MARK_RIM }
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
  if (form == 2.0 && axis.y > 0.5 && inner > rim) diffuseColor.rgb *= 0.34;
  if (form == 3.0 && axis.y > 0.5 && fract((vFaceUv.x * extent.x + vFaceUv.y * extent.y) * 16.0) < 0.5) diffuseColor.rgb *= 0.6;
}`,
      )
  }
}

export function createMaterials(): KitMaterials {
  // The identity tint: a mark's colour comes per instance from its role, which this multiplies by one. It is not a colour of the world.
  const marks = new MeshStandardMaterial({ name: 'marks', color: new Color(1, 1, 1), roughness: 0.62, metalness: 0, side: DoubleSide })
  patchMarks(marks)
  return {
    marks,
    dispose() {
      marks.dispose()
    },
  }
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/**
 * A colour role as three reads it: the page's computed sRGB value in, linear working space out. A system colour (forced
 * colours) is not one three can parse, so the role's light value stands in, as scene-tokens.ts does for the palette.
 */
export function roleColor(tokens: SceneTokens, role: ColorRoleName, out = new Color()): Color {
  const value = tokens.roles[role]
  return out.set(HEX.test(value) ? value : resolveColor(role))
}
