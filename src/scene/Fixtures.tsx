import { useEffect, useMemo } from 'react'
import { buildFixtures, type FixturePart, type SteelTone } from './fixture-geometry'
import { useKit } from './kit'
import { roleColor } from './materials'

/*
 * Fixtures: a scene's steel (the pass, its rail, the lane beds, the lamps' housings) in one draw call of brushed stainless.
 * They are the world's furniture that the marks sit on, never decoration: each is a place a game names (GAMES.md §2.6).
 */

const TONE_ROLE = { bright: 'surface-1', shaded: 'surface-2', deep: 'surface-3' } as const satisfies Record<SteelTone, string>

/** `grain`: the world size one tile of the brush covers (fixture-geometry.ts's STEEL_TILE by default); smaller is finer. */
export function Fixtures({ parts, grain }: { parts: readonly FixturePart[]; grain?: number }) {
  const kit = useKit()
  const geometry = useMemo(() => buildFixtures(parts, (tone) => roleColor(kit.tokens, TONE_ROLE[tone]), grain), [parts, kit.tokens, grain])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh name="fixtures" geometry={geometry} material={kit.materials.stainless} raycast={() => null} />
}
