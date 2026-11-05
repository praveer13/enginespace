/*
 * The kitchen's materials (scene kit v1), one per surface, so a whole static set draws in a handful of calls:
 *
 *   metal     every metal of the line in one MeshPhysicalMaterial: brushed stainless, spun aluminium, chrome and cast iron differ
 *             per vertex by their finish (roughness, the brush's grain and anisotropy, metalness), on the kit's own brushed maps.
 *             The anisotropic lobe runs across the grain, so the highlights move along the steel as the camera does.
 *   ceramic   glazed ceramic: the plates, knobs and the fryer's oil, glossy with a clearcoat at T2.
 *   tile      the back wall's subway tile; floor, the sealed quarry tile; each with its generated normals and roughness.
 *   glow      what is lit: a station's element, a lamp's bulb, the heat strip, in the lamp's amber, each on its channel; a dark
 *             channel draws as cold deep steel. Lighting a station changes one uniform. Bloom catches it at T2.
 *   ticket    ticket paper with the print atlas, each ticket's cell from its instance.
 *   shadow    the contact shadows: a soft rounded rectangle under every prop, at every tier.
 *   cone      the light under a heat lamp, additive and soft, at T2.
 *   steam     soft puffs over a lit station when a fire lands, at T2.
 *
 * Every colour is a role, from the kit's tokens; every number is scene-tokens.ts's PROP_PARAMS [estimated].
 */
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DataTexture,
  DoubleSide,
  LinearMipmapLinearFilter,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  ShaderChunk,
  ShaderMaterial,
  SRGBColorSpace,
  UniformsLib,
  UniformsUtils,
  UnsignedByteType,
  Vector2,
  type Material,
  type Texture,
} from 'three'
import type { Kit } from '../kit'
import { drawPrint, floorMaps, FLOOR_MODULE, PRINT_CELLS, PRINT_SIZE, TILE_MODULE, tileMaps, type SurfaceMaps } from './surfaces'

export interface PropMaterials {
  readonly metal: MeshPhysicalMaterial
  readonly ceramic: MeshPhysicalMaterial
  readonly tile: MeshStandardMaterial
  readonly floor: MeshStandardMaterial
  readonly glow: MeshStandardMaterial
  readonly ticket: MeshStandardMaterial
  readonly shadow: ShaderMaterial
  readonly cone: ShaderMaterial
  readonly steam: ShaderMaterial
  /** Lights the glow channels in `mask` (bit n is channel n) and darkens the rest. */
  setLit(mask: number): void
  /** Asks for a redraw once the print's face has loaded (at once if it has); returns the unsubscribe. */
  onPrinted(redraw: () => void): () => void
  /** A metal of its own for one moving part, the same program as `metal`, whose emissive can flash amber (the bell's dome). */
  flashMetal(): MeshPhysicalMaterial
  dispose(): void
}

/** Replaces `find` in a shader chunk, and fails loudly if three's chunk no longer has it, so a patch never goes silently missing. */
function patched(chunk: string, find: string, replace: string): string {
  if (!chunk.includes(find)) throw new Error(`a prop material's patch no longer fits three's shader: ${find}`)
  return chunk.replace(find, replace)
}

/**
 * The brightest a lit surface may come out, in linear units [estimated]: white after the tone curve, a few times bloom's threshold,
 * and far below what a half-float target holds (65,504). The specular peak of a polished part at three's least roughness reaches tens
 * of thousands [estimated]: unclamped, it overflowed the composer's half-float target at some sizes of the canvas (Service's 870 by
 * 557 px at T2) and bloom's blur spread the overflow over the whole frame, which drew black; clamped at 4,096, bloom spread it into a
 * white haze over a corner of the frame [both measured 2026-11-04]. At this cap a glint blooms as a glint.
 */
const RADIANCE_CAP = '#include <opaque_fragment>\ngl_FragColor.rgb = min(gl_FragColor.rgb, vec3(16.0));'

/** Adds the per-vertex finish to a physical material: roughness, the grain (normal map and anisotropy) and metalness. */
function patchFinish(material: MeshPhysicalMaterial) {
  material.customProgramCacheKey = () => 'es-prop-metal-v2'
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = patched(shader.vertexShader, '#include <common>', '#include <common>\nattribute vec3 aFinish;\nvarying vec3 vFinish;')
    shader.vertexShader = patched(shader.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\nvFinish = aFinish;')
    let fragment = patched(shader.fragmentShader, '#include <common>', '#include <common>\nvarying vec3 vFinish;')
    fragment = patched(fragment, '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * vFinish.x, 0.0, 1.0);')
    fragment = patched(fragment, '#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= vFinish.z;')
    fragment = patched(fragment, '#include <normal_fragment_maps>', patched(ShaderChunk.normal_fragment_maps, 'mapN.xy *= normalScale;', 'mapN.xy *= normalScale * vFinish.y;'))
    fragment = patched(
      fragment,
      '#include <lights_physical_fragment>',
      patched(ShaderChunk.lights_physical_fragment, 'vec2 anisotropyV = anisotropyVector;', 'vec2 anisotropyV = anisotropyVector * vFinish.y;'),
    )
    shader.fragmentShader = patched(fragment, '#include <opaque_fragment>', RADIANCE_CAP)
  }
}

/** The glaze's per-vertex sheen: roughness and clearcoat scaled, so bakelite, oil and paper share its draw. */
function patchSheen(material: MeshPhysicalMaterial) {
  material.customProgramCacheKey = () => 'es-prop-ceramic-v2'
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = patched(shader.vertexShader, '#include <common>', '#include <common>\nattribute vec3 aFinish;\nvarying vec3 vFinish;')
    shader.vertexShader = patched(shader.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\nvFinish = aFinish;')
    let fragment = patched(shader.fragmentShader, '#include <common>', '#include <common>\nvarying vec3 vFinish;')
    fragment = patched(fragment, '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * vFinish.x, 0.0, 1.0);')
    fragment = patched(fragment, '#include <lights_physical_fragment>', patched(ShaderChunk.lights_physical_fragment, 'material.clearcoat = clearcoat;', 'material.clearcoat = clearcoat * vFinish.y;'))
    shader.fragmentShader = patched(fragment, '#include <opaque_fragment>', RADIANCE_CAP)
  }
}

/** Lights or darkens each glowing part by its channel: lit is the lamp's amber and its glow, dark is cold deep steel. */
function patchGlow(material: MeshStandardMaterial, uniforms: { uLit: { value: number }; uCold: { value: Color } }) {
  material.customProgramCacheKey = () => 'es-prop-glow-v1'
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = patched(shader.vertexShader, '#include <common>', '#include <common>\nattribute vec3 aFinish;\nuniform int uLit;\nvarying float vLit;\nvarying float vStrength;')
    shader.vertexShader = patched(shader.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\nvLit = float((uLit >> int(aFinish.x + 0.5)) & 1);\nvStrength = aFinish.y;')
    let fragment = patched(shader.fragmentShader, '#include <common>', '#include <common>\nuniform vec3 uCold;\nvarying float vLit;\nvarying float vStrength;')
    fragment = patched(fragment, '#include <color_fragment>', '#include <color_fragment>\nvec3 esHeat = diffuseColor.rgb;\ndiffuseColor.rgb = mix(uCold, esHeat, vLit);')
    fragment = patched(fragment, '#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= esHeat * vStrength * vLit;')
    shader.fragmentShader = fragment
  }
}

/** The ticket's print: each instance (or each vertex, on the printer's strip) picks its cell of the atlas. */
function patchCells(material: MeshStandardMaterial) {
  material.customProgramCacheKey = () => 'es-prop-ticket-v1'
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCell = { value: new Vector2(1 / PRINT_CELLS.across, 1 / PRINT_CELLS.down) }
    shader.vertexShader = patched(shader.vertexShader, '#include <common>', '#include <common>\nattribute vec2 aCell;\nuniform vec2 uCell;')
    shader.vertexShader = patched(shader.vertexShader, '#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vMapUv * uCell + aCell;\n#endif')
  }
}

function texture(maps: SurfaceMaps, which: 'normal' | 'roughness' | 'albedo', repeat: [number, number], anisotropy: number): DataTexture {
  const map = new DataTexture(maps[which], maps.width, maps.height, RGBAFormat, UnsignedByteType)
  map.colorSpace = NoColorSpace
  map.wrapS = RepeatWrapping
  map.wrapT = RepeatWrapping
  map.generateMipmaps = true
  map.minFilter = LinearMipmapLinearFilter
  map.anisotropy = anisotropy
  map.repeat.set(...repeat)
  map.needsUpdate = true
  return map
}

/** The surfaces' maps, generated once per page: they depend on the grout's colour only through a ratio, cached by it. */
const mapCache = new Map<string, SurfaceMaps>()
function cached(key: string, make: () => SurfaceMaps): SurfaceMaps {
  let maps = mapCache.get(key)
  if (!maps) {
    maps = make()
    mapCache.set(key, maps)
  }
  return maps
}

/** The fog's own uniforms and a shader's colour and opacity, for the kit's three soft effects. */
function softUniforms(color: Color, opacity: number) {
  return UniformsUtils.merge([UniformsLib.fog, { uColor: { value: color }, uOpacity: { value: opacity } }])
}

/** A fog-aware fade for the soft effects: far off, an effect thins into the haze rather than taking the fog's colour. */
const FOG_FADE = `
#ifdef USE_FOG
  gl_FragColor.a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
#endif`

const SHADOW_VERTEX = `
#include <common>
#include <fog_pars_vertex>
attribute vec4 aRect;
attribute float aShade;
varying vec2 vLocal;
varying vec4 vRect;
varying float vShade;
void main() {
  vRect = aRect;
  vShade = aShade;
  vLocal = (uv - 0.5) * 2.0 * (aRect.xy + aRect.w);
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`

const SHADOW_FRAGMENT = `
uniform vec3 uColor;
uniform float uOpacity;
#include <common>
#include <fog_pars_fragment>
varying vec2 vLocal;
varying vec4 vRect;
varying float vShade;
void main() {
  vec2 q = abs(vLocal) - (vRect.xy - vRect.z);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - vRect.z;
  float a = 1.0 - smoothstep(-vRect.w * 0.6, vRect.w, d);
  gl_FragColor = vec4(uColor, a * a * uOpacity * vShade);
  ${FOG_FADE}
  #include <colorspace_fragment>
}`

const CONE_VERTEX = `
#include <common>
#include <fog_pars_vertex>
varying float vAlong;
varying float vEdge;
void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vEdge = abs(dot(n, normalize(cameraPosition - world.xyz)));
  vAlong = uv.y;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`

const CONE_FRAGMENT = `
uniform vec3 uColor;
uniform float uOpacity;
#include <common>
#include <fog_pars_fragment>
varying float vAlong;
varying float vEdge;
void main() {
  float a = uOpacity * pow(vAlong, 1.2) * vEdge * vEdge;
  gl_FragColor = vec4(uColor * a, a);
  ${FOG_FADE}
  #include <colorspace_fragment>
}`

const STEAM_VERTEX = `
#include <common>
#include <fog_pars_vertex>
attribute vec4 aPuff;
attribute float aSeed;
uniform float uNow;
uniform float uLife;
uniform float uRise;
uniform float uSize;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
void main() {
  float age = (uNow - aPuff.w) / uLife;
  vAge = clamp(age, 0.0, 1.0);
  vSeed = aSeed;
  vUv = uv;
  vec3 drift = vec3(sin(aSeed * 6.3 + vAge * 2.2) * 0.04 * vAge, uRise * (vAge + 0.15 * vAge * vAge), cos(aSeed * 4.1 + vAge) * 0.03 * vAge);
  float size = uSize * (0.45 + 1.3 * vAge);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 world = aPuff.xyz + drift + (right * position.x + up * position.y) * size;
  if (aPuff.w < 0.0 || age < 0.0 || age >= 1.0) world = vec3(0.0, -1000.0, 0.0);
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`

const STEAM_FRAGMENT = `
uniform vec3 uColor;
uniform float uOpacity;
#include <common>
#include <fog_pars_fragment>
varying vec2 vUv;
varying float vAge;
varying float vSeed;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float wisp = 0.7 + 0.3 * sin(p.x * 5.0 + vSeed * 9.0 + vAge * 4.0) * sin(p.y * 4.0 - vAge * 3.0 + vSeed * 3.0);
  float a = (1.0 - smoothstep(0.15, 1.0, r)) * wisp * uOpacity * sin(PI * vAge);
  gl_FragColor = vec4(uColor, a);
  ${FOG_FADE}
  #include <colorspace_fragment>
}`

/** What the props' materials are made from: the tokens, the tier's class and the kit's own materials (their maps). */
export interface MaterialSource {
  readonly tokens: Kit['tokens']
  readonly tier: number
  readonly base: Kit['materials']
}

export function createPropMaterials(source: MaterialSource, maxAnisotropy: number): PropMaterials {
  const { tokens, tier } = source
  const inputs = tokens.materials.props
  const params = tokens.materials.propParams
  const t2 = tier >= 2
  const anisotropy = Math.max(1, Math.min(maxAnisotropy, t2 ? 8 : 2))
  const steel = source.base.stainless
  const owned: Texture[] = []

  const makeMetal = () => {
    const metal = new MeshPhysicalMaterial({
      name: 'prop-metal',
      vertexColors: true,
      metalness: params.metal.metalness,
      roughness: 1,
      roughnessMap: steel.roughnessMap,
      normalMap: steel.normalMap,
      normalScale: new Vector2(0.38, 0.38),
      anisotropy: params.metal.anisotropy,
      // As the kit's stainless: three stretches the lobe along the anisotropy direction, a quarter turn from the grain along u.
      anisotropyRotation: Math.PI / 2,
      clearcoat: t2 ? params.metal.clearcoat : 0,
      clearcoatRoughness: params.metal.clearcoatRoughness,
    })
    patchFinish(metal)
    return metal
  }
  const metal = makeMetal()
  const flashes: MeshPhysicalMaterial[] = []

  const ceramic = new MeshPhysicalMaterial({
    name: 'prop-ceramic',
    vertexColors: true,
    roughness: params.ceramic.roughness,
    metalness: 0,
    clearcoat: t2 ? params.ceramic.clearcoat : 0,
    clearcoatRoughness: params.ceramic.clearcoatRoughness,
  })
  patchSheen(ceramic)

  // The tile's grout and the floor's joints take their own colour as a ratio over the body's role.
  const tileColor = new Color(inputs.tile)
  const groutColor = new Color(inputs.grout)
  const grout = [groutColor.r / Math.max(1e-3, tileColor.r), groutColor.g / Math.max(1e-3, tileColor.g), groutColor.b / Math.max(1e-3, tileColor.b)] as const
  const tileKey = `tile:${grout.map((v) => v.toFixed(3)).join(',')}`
  const tileSurface = cached(tileKey, () => tileMaps(256, grout, { glaze: params.tile.roughness, grout: params.tile.groutRoughness }))
  const tileRepeat: [number, number] = [1 / TILE_MODULE.width, 1 / TILE_MODULE.height]
  const tileMapsOwned = (['albedo', 'normal', 'roughness'] as const).map((which) => texture(tileSurface, which, tileRepeat, anisotropy))
  owned.push(...tileMapsOwned)
  const tile = new MeshStandardMaterial({
    name: 'prop-tile',
    vertexColors: true,
    map: tileMapsOwned[0],
    normalMap: tileMapsOwned[1],
    roughnessMap: tileMapsOwned[2],
    roughness: 1,
    metalness: 0,
  })

  const floorSurface = cached('floor', () => floorMaps(256, 0.55, params.floor.roughness))
  const floorRepeat: [number, number] = [1 / FLOOR_MODULE, 1 / FLOOR_MODULE]
  const floorMapsOwned = (['albedo', 'normal', 'roughness'] as const).map((which) => texture(floorSurface, which, floorRepeat, anisotropy))
  owned.push(...floorMapsOwned)
  const floor = new MeshStandardMaterial({
    name: 'prop-floor',
    vertexColors: true,
    map: floorMapsOwned[0],
    normalMap: floorMapsOwned[1],
    roughnessMap: floorMapsOwned[2],
    roughness: 1,
    metalness: 0,
  })

  const glowUniforms = { uLit: { value: 0 }, uCold: { value: new Color(inputs.cold) } }
  const glow = new MeshStandardMaterial({ name: 'prop-glow', vertexColors: true, roughness: 0.45, metalness: 0.2, emissive: new Color(1, 1, 1), emissiveIntensity: params.glow.emissiveIntensity })
  patchGlow(glow, glowUniforms)

  // The print atlas: paper and rules now, the dot-matrix face once it has loaded.
  const canvas = document.createElement('canvas')
  canvas.width = PRINT_SIZE.width
  canvas.height = PRINT_SIZE.height
  const inks = { paper: inputs.paper, ink: inputs.ink, rule: tokens.colors['paper-rule'], family: tokens.roles['font-ticket'] }
  drawPrint(canvas, inks, false)
  const print = new CanvasTexture(canvas)
  print.colorSpace = SRGBColorSpace
  print.anisotropy = anisotropy
  print.wrapS = RepeatWrapping
  print.wrapT = RepeatWrapping
  owned.push(print)
  let alive = true
  let printed = false
  let redraw: (() => void) | null = null
  const face = `900 24px ${inks.family}`
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined
  void (fonts ? fonts.load(face) : Promise.resolve([]))
    .catch(() => [])
    .then(() => {
      if (!alive) return
      drawPrint(canvas, inks, true)
      print.needsUpdate = true
      printed = true
      redraw?.()
    })
  const paper = source.base.paper
  const ticket = new MeshStandardMaterial({
    name: 'prop-ticket',
    map: print,
    roughness: 1,
    roughnessMap: paper.roughnessMap,
    normalMap: paper.normalMap,
    normalScale: new Vector2(0.3, 0.3),
    metalness: 0,
    side: DoubleSide,
  })
  patchCells(ticket)

  const shadow = new ShaderMaterial({
    name: 'prop-shadow',
    uniforms: softUniforms(new Color(inputs.shadow), params.shadow.opacity),
    vertexShader: SHADOW_VERTEX,
    fragmentShader: SHADOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true,
    // A constant nudge only: the quad already lies 1.5 mm above its surface. An offset that grows with the slope (a factor) pulled a
    // plate's shadow through the plate's own well, a few millimetres above it, at a grazing view, and darkened the glaze.
    polygonOffset: true,
    polygonOffsetFactor: 0,
    polygonOffsetUnits: -4,
  })
  const cone = new ShaderMaterial({
    name: 'prop-cone',
    uniforms: softUniforms(new Color(inputs.glow), params.cone.opacity),
    vertexShader: CONE_VERTEX,
    fragmentShader: CONE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    fog: true,
  })
  const steam = new ShaderMaterial({
    name: 'prop-steam',
    uniforms: UniformsUtils.merge([softUniforms(new Color(inputs.steam), params.steam.opacity), { uNow: { value: 0 }, uLife: { value: 1 }, uRise: { value: 0.45 }, uSize: { value: 0.22 } }]),
    vertexShader: STEAM_VERTEX,
    fragmentShader: STEAM_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true,
  })

  const all: Material[] = [metal, ceramic, tile, floor, glow, ticket, shadow, cone, steam]
  return {
    metal,
    ceramic,
    tile,
    floor,
    glow,
    ticket,
    shadow,
    cone,
    steam,
    setLit(mask) {
      glowUniforms.uLit.value = mask | 0
    },
    onPrinted(next) {
      redraw = next
      if (printed) next()
      return () => {
        if (redraw === next) redraw = null
      }
    },
    flashMetal() {
      const material = makeMetal()
      material.emissive.set(inputs.glow)
      material.emissiveIntensity = 0
      flashes.push(material)
      return material
    },
    dispose() {
      alive = false
      for (const material of [...all, ...flashes]) material.dispose()
      for (const map of owned) map.dispose()
    },
  }
}
