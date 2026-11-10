import { Color, ShaderChunk, Vector3 } from 'three'
import { patched, type MetalPatch } from './props/materials'

/*
 * The pools of scene kit v1's spot lamps (spot-lamps.tsx), which the kitchen specimen on /design keeps: the metal's patch that turns a spot
 * light's own reflection off the counter into the steel's warmed sheen and streak, and the uniforms a scene sets. No game's scene counts
 * it: the games' lamps are the kit's cone of haze and pool, with no spot light.
 */

/** The heat lamps' pools, shared by every metal of one kitchen: each pool's (x, z, radius), the surface's height, the lamps' height over it, and the colour. */
interface PoolUniforms {
  uPools: { value: Vector3[] }
  uPoolY: { value: number }
  uPoolH: { value: number }
  uPoolColor: { value: Color }
}

/**
 * A lamp's light on the counter, on an upward face within a few centimetres of the pools' height. No colour is laid on the steel: the
 * lamp brightens what the steel already reflects. The lamps' own reflection off the steel there (their spot lights' specular, which
 * three draws as one smooth lobe in the lamp's full amber, bright enough to clip) is taken off, and the steel's own sheen (its specular
 * without the lamps, with the grain and the highlights that the room and the tubes put there) is brightened and warmed in its place,
 * as much as the lamps' reflection was strong: so the warm light keeps that reflection's footprint, its cone and penumbra, the way it
 * leans as the camera moves and, from T2, the shadows that the plates cast in it, falling off softly. Over it lies the steel's streak,
 * a lobe narrow along the brush and long across it from each lamp toward the eye, following the brush's lines (read from the steel's own
 * roughness, so its smoother lines catch more of the lamp). A spot's size is the lamp's cone where it lands, so the warm light stays on
 * the pass.
 */
const POOL_VERTEX = `
vec4 esWorld = vec4(transformed, 1.0);
vec4 esUp = vec4(objectNormal, 0.0);
#ifdef USE_INSTANCING
esWorld = instanceMatrix * esWorld;
esUp = instanceMatrix * esUp;
#endif
vPoolAt = (modelMatrix * esWorld).xyz;
vPoolUp = normalize((modelMatrix * esUp).xyz).y;`

export const POOL_FRAGMENT = `
float esFlat = smoothstep(0.7, 0.95, vPoolUp) * (1.0 - smoothstep(0.008, 0.03, abs(vPoolAt.y - uPoolY)));
if (esFlat > 0.0 && uPools[0].z > 0.0) {
  vec3 esOwn = totalSpecular - esSpot;
  vec3 esEye = normalize(cameraPosition - vPoolAt);
  float esStreak = 0.0;
  for (int i = 0; i < 3; i++) {
    vec3 p = uPools[i];
    if (p.z <= 0.0) continue;
    vec2 d = (vPoolAt.xz - p.xy) / p.z;
    vec3 h = normalize(normalize(vec3(p.x, uPoolY + uPoolH, p.y) - vPoolAt) + esEye);
    esStreak += exp(-(h.x * h.x / 0.003 + h.z * h.z / 0.35) / (h.y * h.y) - 0.5 * d.x * d.x - 0.1 * d.y * d.y);
  }
  float esSheen = 1.0 - exp(-1.6 * dot(esSpot, vec3(0.2126, 0.7152, 0.0722)));
  float esGrain = clamp(2.3 - 4.2 * roughnessFactor, 0.3, 1.5);
  outgoingLight += esFlat * (uPoolColor * esOwn * (esSheen * 1.6 + esStreak * esGrain * 3.2) - esSpot);
}
`

/**
 * three's lights, with the specular each spot light adds counted into `esSpot`: the heat lamps' own reflection, which the counter's
 * pool takes off and gives back as the steel's warmed sheen. Found by the spot loop's shadow line and its call, so a patch that no
 * longer fits fails loudly.
 */
export function countSpotSpecular(chunk: string): string {
  const shadowed = chunk.indexOf('vSpotLightCoord[ i ] ) : 1.0;')
  const call = chunk.indexOf('RE_Direct(', shadowed)
  const end = chunk.indexOf(';', call) + 1
  if (shadowed < 0 || call < 0 || end <= 0) throw new Error("a prop material's patch no longer fits three's shader: the spot lights' loop")
  return `vec3 esSpot = vec3(0.0);\nvec3 esBefore = vec3(0.0);\n${chunk.slice(0, call)}esBefore = reflectedLight.directSpecular;\n${chunk.slice(call, end)}\nesSpot += reflectedLight.directSpecular - esBefore;${chunk.slice(end)}`
}

export interface LampPools {
  /** The metal's patch, for `<Kitchen metal>`: the pools on its counter. */
  readonly patch: MetalPatch
  /** Each pool's (x, z, radius) in metres, on the level surface at `y`, lit from `height` above it, in `color`. An empty list lifts them. */
  set(pools: readonly (readonly [number, number, number])[], y?: number, color?: Color, height?: number): void
}

/** The pools of one kitchen's spot lamps, made once with the scene. */
export function lampPools(): LampPools {
  const uniforms: PoolUniforms = { uPools: { value: [new Vector3(), new Vector3(), new Vector3()] }, uPoolY: { value: 0 }, uPoolH: { value: 1 }, uPoolColor: { value: new Color() } }
  return {
    patch(shader) {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = patched(shader.vertexShader, '#include <common>', '#include <common>\nvarying vec3 vPoolAt;\nvarying float vPoolUp;')
      shader.vertexShader = patched(shader.vertexShader, '#include <begin_vertex>', `#include <begin_vertex>${POOL_VERTEX}`)
      let fragment = patched(shader.fragmentShader, '#include <common>', '#include <common>\nvarying vec3 vPoolAt;\nvarying float vPoolUp;\nuniform vec3 uPools[3];\nuniform float uPoolY;\nuniform float uPoolH;\nuniform vec3 uPoolColor;')
      fragment = patched(fragment, '#include <lights_fragment_begin>', countSpotSpecular(ShaderChunk.lights_fragment_begin))
      shader.fragmentShader = patched(fragment, '#include <opaque_fragment>', `${POOL_FRAGMENT}#include <opaque_fragment>`)
    },
    set(list, y = 0, color, height = 1) {
      uniforms.uPools.value.forEach((pool, i) => {
        const [x, z, radius] = list[i] ?? [0, 0, 0]
        pool.set(x, z, radius)
      })
      uniforms.uPoolY.value = y
      uniforms.uPoolH.value = height
      if (color) uniforms.uPoolColor.value.copy(color)
    },
  }
}
