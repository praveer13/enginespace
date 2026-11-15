/*
 * W1b-T10: the scene kit's heat lamps light every 3D game as Back of House's round-2 fix first drew it, a cone of warm haze from the
 * shade's mouth and an edgeless pool where the light lands, with no spot light, so the amber lies on the steel and never as a disc; the
 * kitchen specimen on /design keeps scene kit v1's spot lamps and their shadow maps, outside the kit's props, so no game counts them.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { LAMP_GLOW } from '@/scene/props/Service'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')
const GAMES = ['loop', 'verifier', 'engine-floor', 'pool'] as const
/** The inside of the kit's heat-lamp shade's rolled lip, in metres (build.ts's heatLamp profile, at its narrowest under the roll). */
const LIP = 0.11

/** The light's side (uv.x 0) and its flat ends (uv.x 1): each vertex's height, its distance from the axis, and how much light it has. */
function vertices() {
  const position = LAMP_GLOW.getAttribute('position')
  const uv = LAMP_GLOW.getAttribute('uv')
  return Array.from({ length: position.count }, (_, i) => ({
    y: position.getY(i),
    r: Math.hypot(position.getX(i), position.getZ(i)),
    flat: uv.getX(i) === 1,
    light: uv.getY(i),
  }))
}

describe("the heat lamps' light (W1b-T10)", () => {
  test('a unit tall from the mouth to the surface: a cone of haze lit at its mouth and gone at its foot, and a pool lit in its middle and gone at its rim', () => {
    const all = vertices()
    expect(Math.max(...all.map((v) => v.y))).toBeCloseTo(0, 6)
    expect(Math.min(...all.map((v) => v.y))).toBeCloseTo(-1, 6)
    const side = all.filter((v) => !v.flat)
    const pool = all.filter((v) => v.flat && v.y < -0.5)
    const mouth = all.filter((v) => v.flat && v.y > -0.5)
    expect(side.length).toBeGreaterThan(0)
    expect(pool.length).toBeGreaterThan(0)
    for (const v of side) expect(v.light).toBeCloseTo(v.y > -0.5 ? 2.3 : 0, 5)
    // The pool: its middle lit, its rim at nothing, so it fades out inside its own size and has no edge (The Edgeless Pool Rule).
    for (const v of pool) expect(v.light).toBeCloseTo(v.r > 0.99 ? 0 : 3.3, 5)
    expect(Math.max(...pool.map((v) => v.r))).toBeCloseTo(1, 6)
    // The mouth's end draws no light: the shade's own bulb glows there, and a lit end showed past a wide shade's lip as a hard disc.
    for (const v of mouth) expect(v.light).toBe(0)
  })

  test("every game's pool keeps its cone's mouth inside the shade's lip, and every game takes the kit's light with its own spread", () => {
    const top = Math.max(...vertices().filter((v) => !v.flat && v.y > -0.5).map((v) => v.r))
    for (const game of GAMES) {
      const scene = read(`src/games/${game}/Scene3D.tsx`)
      const pool = /const POOL = \[([\d.]+), ([\d.]+)\] as const/.exec(scene)
      expect(pool, game).not.toBeNull()
      const [, along, across] = pool ?? []
      expect(top * Number(along), game).toBeLessThan(LIP)
      expect(top * Number(across), game).toBeLessThan(LIP)
      expect(scene, game).toMatch(/<LampLights lamps=\{[^}]+\}[^>]*spread=\{POOL\}/)
    }
  })

  test('no prop of the kit and no game makes a spot light; the specimen keeps its own, outside the kit', () => {
    const props = readdirSync(path.join(root, 'src/scene/props')).filter((file) => /\.tsx?$/.test(file))
    for (const file of props) expect(read(`src/scene/props/${file}`), file).not.toMatch(/SpotLight|PointLight|castShadow\s*=\s*true/)
    for (const game of GAMES) {
      const scene = read(`src/games/${game}/Scene3D.tsx`)
      expect(scene, game).not.toMatch(/SpotLight|PointLight/)
      // Nothing casts a shadow map, so no scene asks for them: every prop stands on its contact shadow at every tier instead.
      expect(scene, game).not.toMatch(/<SceneCanvas [^>]*\bshadows\b/)
    }
    expect(read('src/scene/spot-lamps.tsx')).toMatch(/new SpotLight\(/)
    expect(read('src/scene/spot-pools.ts')).toMatch(/countSpotSpecular/)
    expect(read('src/scene/KitchenScene3D.tsx')).toMatch(/<SpotLamps /)
  })
})
