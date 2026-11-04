/*
 * The Pass's materials as three materials (TRACKER W0-T15; GAMES.md §2.6, rule 4): brushed stainless, ticket paper, masking
 * tape, the heat lamp's glowing housing, and the instanced marks. Every colour comes from the token roles through
 * scene-tokens.ts; every normal and roughness map is generated in code (textures.ts), so no image ships.
 *
 *   stainless  MeshPhysicalMaterial, anisotropic: its highlights smear across the brush's grain, which is how the heat
 *              lamps' amber reaches the eye from a pass seen from above. A thin clearcoat at T2 and up. Its colour comes
 *              per vertex (the fixtures' bright and deep steel), so all the steel in a scene is one draw.
 *   paper      bond paper: matte, with the tooth and fibres of the sheet in its normal map.
 *   tape       masking tape: the crepe's ridges across the strip.
 *   lamp       the heat lamp's housing glow, emissive in the lamp role: what bloom catches at T2 and up.
 *   marks      the instanced marks of SpanInstances and BlockGrid, coloured per instance from a role, with each form drawn
 *              in the shader: solid, hollow (a rim, see-through), groove (a dark recess inside a rim), marked (hatched).
 *
 * Physical parameters (roughness, metalness, anisotropy) are scene-tokens.ts's MATERIAL_PARAMS, [estimated].
 */
import {
  Color,
  DataTexture,
  DoubleSide,
  LinearMipmapLinearFilter,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
  type Texture,
} from 'three'
import { MATERIAL_PARAMS, type SceneTokens } from '@/design/scene-tokens'
import { resolveColor, type ColorRoleName } from '@/design/tokens'
import type { Tier } from './tiers'
import { brushedField, crepeField, normalMap, paperField, roughnessMap } from './textures'

/** The maps' size in texels: a power of two, so they mip-map and wrap. */
export const MAP_SIZE = 256
/** The world size one tile of the steel's grain covers [estimated]: coarse enough that the brush strokes survive at a distance. */
export const STEEL_TILE = 2.6
/** How much brighter than its role the heat lamp's element burns [estimated]: enough that bloom catches it and nothing lit. */
export const BULB_GLOW = 3.2
/** The rim of a hollow or grooved mark, in world units [estimated]. */
export const MARK_RIM = 0.014
/**
 * The identity tint: a material whose colour comes per vertex or per instance (from the roles) multiplies it by one. It is
 * not a colour of the world, so it is not a role.
 */
const UNTINTED = () => new Color(1, 1, 1)

export interface KitMaterials {
  readonly stainless: MeshPhysicalMaterial
  readonly paper: MeshStandardMaterial
  readonly tape: MeshStandardMaterial
  readonly lamp: MeshStandardMaterial
  readonly marks: MeshStandardMaterial
  /** Re-reads the colours from the roles (a change of contrast preference). */
  update(tokens: SceneTokens): void
  dispose(): void
}

/** The generated maps, made once per page and shared by every scene: generating them costs a few milliseconds. */
interface Maps {
  steelNormal: Uint8Array
  steelRoughness: Uint8Array
  paperNormal: Uint8Array
  paperRoughness: Uint8Array
  tapeNormal: Uint8Array
}
let maps: Maps | null = null
function generatedMaps(): Maps {
  if (maps) return maps
  const steel = brushedField(MAP_SIZE, 7)
  const paper = paperField(MAP_SIZE, 11)
  const tape = crepeField(MAP_SIZE, 13)
  maps = {
    steelNormal: normalMap(steel, 2.2),
    steelRoughness: roughnessMap(steel, MATERIAL_PARAMS.stainless.roughness, 0.26),
    paperNormal: normalMap(paper, 1.4),
    paperRoughness: roughnessMap(paper, MATERIAL_PARAMS.paper.roughness, 0.06),
    tapeNormal: normalMap(tape, 3.2),
  }
  return maps
}

function texture(bytes: Uint8Array, anisotropy: number, repeat: [number, number] = [1, 1]): DataTexture {
  const map = new DataTexture(bytes, MAP_SIZE, MAP_SIZE, RGBAFormat, UnsignedByteType)
  map.colorSpace = NoColorSpace
  map.wrapS = RepeatWrapping
  map.wrapT = RepeatWrapping
  map.generateMipmaps = true
  map.minFilter = LinearMipmapLinearFilter
  map.anisotropy = anisotropy
  map.repeat.set(repeat[0], repeat[1])
  map.needsUpdate = true
  return map
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

export function createMaterials(tokens: SceneTokens, tier: Tier, maxAnisotropy: number): KitMaterials {
  const m = generatedMaps()
  const anisotropy = Math.max(1, Math.min(maxAnisotropy, tier >= 2 ? 8 : 2))
  const steelNormal = texture(m.steelNormal, anisotropy, [1, 1])
  const steelRoughness = texture(m.steelRoughness, anisotropy, [1, 1])
  const paperNormal = texture(m.paperNormal, anisotropy, [1.5, 2])
  const paperRoughness = texture(m.paperRoughness, anisotropy, [1.5, 2])
  const tapeNormal = texture(m.tapeNormal, anisotropy, [1, 1])
  const textures: Texture[] = [steelNormal, steelRoughness, paperNormal, paperRoughness, tapeNormal]

  const { stainless: steelParams } = tokens.materials
  // Anisotropy at every tier: it is what carries the heat lamps' amber along the pass toward the eye, so a phone sees the
  // present lit too. The clearcoat's second lobe is a T2 luxury.
  const stainless = new MeshPhysicalMaterial({
    color: UNTINTED(),
    vertexColors: true,
    metalness: steelParams.metalness,
    roughness: 1,
    roughnessMap: steelRoughness,
    normalMap: steelNormal,
    normalScale: new Vector2(0.9, 0.9),
    anisotropy: steelParams.anisotropy,
    // The grain runs along each face's u (fixture-geometry.ts). Brushed metal smears a highlight across its grooves, and three
    // stretches the lobe along the anisotropy direction, so that direction is a quarter turn from the grain.
    anisotropyRotation: steelParams.anisotropyRotation + Math.PI / 2,
    clearcoat: tier >= 2 ? steelParams.clearcoat : 0,
    clearcoatRoughness: steelParams.clearcoatRoughness,
  })
  stainless.name = 'stainless'

  const paper = new MeshStandardMaterial({
    name: 'paper',
    roughness: 1,
    roughnessMap: paperRoughness,
    metalness: tokens.materials.paper.metalness,
    normalMap: paperNormal,
    normalScale: new Vector2(0.3, 0.3),
    side: DoubleSide,
  })
  const tape = new MeshStandardMaterial({
    name: 'tape',
    roughness: tokens.materials.tape.roughness,
    metalness: tokens.materials.tape.metalness,
    normalMap: tapeNormal,
    normalScale: new Vector2(0.65, 0.65),
  })
  const lamp = new MeshStandardMaterial({
    name: 'lamp',
    roughness: tokens.materials.heatLampBulb.roughness,
    metalness: tokens.materials.heatLampBulb.metalness,
    emissiveIntensity: tokens.materials.heatLampBulb.emissiveIntensity * BULB_GLOW,
  })
  const marks = new MeshStandardMaterial({ name: 'marks', color: UNTINTED(), roughness: 0.62, metalness: 0, side: DoubleSide })
  patchMarks(marks)

  const update = (next: SceneTokens) => {
    paper.color.set(next.materials.paper.color)
    tape.color.set(next.materials.tape.color)
    lamp.color.set(next.materials.heatLampBulb.color)
    lamp.emissive.set(next.materials.heatLampBulb.emissive)
  }
  update(tokens)

  return {
    stainless,
    paper,
    tape,
    lamp,
    marks,
    update,
    dispose() {
      for (const material of [stainless, paper, tape, lamp, marks]) material.dispose()
      for (const map of textures) map.dispose()
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
