import type { CompiledBuildThis, CompiledInProduction, CompiledKeptCard } from '@es/schema'
import { useClaims } from '../load'
import { useKeptCard } from '../load-lessons'
import { cardClaimIds, type RenderEnv } from './model'

/* What KeptCards.tsx reads: a card of one kind with the claims it needs, and the words that name it. */

export type KeptState<Card extends CompiledKeptCard> = { status: 'loading' } | { status: 'error' } | { status: 'empty' } | { status: 'ready'; card: Card; env: RenderEnv }

/** The card `id` of the kind asked for, with the claims it needs: the page's own where it has them, or the claims file fetched for this card alone. */
export function useKept<Kind extends CompiledKeptCard['kind']>(id: string, kind: Kind, env: RenderEnv): KeptState<Extract<CompiledKeptCard, { kind: Kind }>> {
  const loaded = useKeptCard(id)
  const card = loaded.status === 'ready' && loaded.value !== null && loaded.value.kind === kind ? (loaded.value as Extract<CompiledKeptCard, { kind: Kind }>) : null
  const needsClaims = card !== null && env.claims === null && cardClaimIds(card).size > 0
  const claims = useClaims(needsClaims)
  if (loaded.status === 'error' || (needsClaims && claims.status === 'error')) return { status: 'error' }
  if (loaded.status === 'loading' || (needsClaims && claims.status === 'loading')) return { status: 'loading' }
  if (card === null) return { status: 'empty' }
  return { status: 'ready', card, env: claims.status === 'ready' ? { ...env, claims: claims.value } : env }
}

/** The heading of the note: the first engine it speaks of, and "today". */
export const inProductionTitle = (card: CompiledInProduction): string => `In ${card.engines[0].engine} today`

/** The stages a Build-this card prepares, in words. */
export const stagesSentence = (card: CompiledBuildThis): string => `This lesson prepares ${card.stages.length === 1 ? 'stage' : 'stages'} ${card.stages.join(', ')}.`
