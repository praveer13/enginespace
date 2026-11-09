import { Fragment } from 'react'
import type { CompiledBlock, CompiledCard } from '@es/schema'
import { publicUrl, useClaims } from '../load'
import { useCard } from '../load-lessons'
import { ItemBlock } from '@/items/ItemBlock'
import { Icon } from '@/design/components/Glyph'
import { Stub } from '@/design/components/Stub'
import { TapeLabel } from '@/design/components/TapeLabel'
import './content.css'
import { Frame, PendingLine, Tapes, type Of } from './BlockFrame'
import { GameBlock } from './GameBlock'
import { cardClaimIds, laneName, PENDING, pendingLab, sections, type RenderEnv } from './model'
import { PredictTicket } from './Predict'
import { Inline, Prose } from './Prose'

/*
 * The eight block types (ARCHITECTURE §4.3, D-016), each drawn as what it is on The Pass (D-047): a run of tickets, one per
 * block. A prose block breaks into a ticket for each `##` section, with the heading as the ticket's stamped title. Every
 * other block is one ticket, headed by the page's id and its own, titled by its kind, with its facts on tape labels.
 *
 * Prose, a warning, an isomorphism, a notional-machine card, a figure, an item set (src/items, W1-T04), a game (GameBlock.tsx, W1b-T01)
 * and a prediction (Predict.tsx, W1b-T02) are complete. A block whose feature a later task builds (a trace, a lab that has no page yet,
 * the other cards kept in their own files, a game no task has built yet, a prediction that no run answers) prints what it is told, then
 * a red line naming the open task that builds the rest, and a stub for the action it will have, held down. A feature task replaces its
 * block's placeholder below and leaves the others alone.
 */

export interface BlocksProps {
  blocks: readonly CompiledBlock[]
  env: RenderEnv
  /** The page the blocks belong to (a lesson or module id), printed on each ticket's head line. */
  scope: string
  /** The page's content revision (A§4.2), which a game block's runs carry. */
  rev?: string
}

export function Blocks({ blocks, env, scope, rev }: BlocksProps) {
  return blocks.map((block, at) => <BlockTicket key={at} block={block} at={at} blocks={blocks} env={env} scope={scope} rev={rev} />)
}

function BlockTicket({ block, at, blocks, env, scope, rev }: { block: CompiledBlock; at: number; blocks: readonly CompiledBlock[]; env: RenderEnv; scope: string; rev?: string }) {
  switch (block.type) {
    case 'prose':
      return <ProseTickets block={block} env={env} scope={scope} />
    case 'predict':
      return <PredictTicket block={block} scope={scope} at={at} blocks={blocks} rev={rev} />
    case 'item':
      return <ItemBlock block={block} scope={scope} />
    case 'game':
      return <GameBlock block={block} scope={scope} at={at} rev={rev} />
    case 'trace':
      return <TraceTicket block={block} scope={scope} />
    case 'lab':
      return <LabTicket block={block} scope={scope} />
    case 'card':
      return <CardTicket block={block} env={env} scope={scope} />
    case 'figure':
      return <FigureTicket block={block} scope={scope} />
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Prose                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

function ProseTickets({ block, env, scope }: { block: Of<'prose'>; env: RenderEnv; scope: string }) {
  return sections(block.body).map(({ heading, flows }, at) => (
    <Frame
      key={at}
      block="prose"
      scope={scope}
      anchor={heading === null ? undefined : env.headings.get(heading)}
      title={heading === null ? undefined : <Inline nodes={heading.children} env={env} />}
    >
      <Prose body={flows} env={env} />
    </Frame>
  ))
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* trace (the game block is GameBlock.tsx, the prediction is Predict.tsx)                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

function TraceTicket({ block, scope }: { block: Of<'trace'>; scope: string }) {
  const pending = PENDING.trace
  // A seed draws a synthetic trace, and the site labels every synthetic trace as one (PRODUCT.md, "Evidence on Hand").
  const origin = block.seed === undefined ? ['pinned'] : ['synthetic', `seed · ${block.seed}`]
  return (
    <Frame block="trace" scope={scope} meta={block.id} title="Trace" pending={pending.task} stub={<Stub disabled>Open trace</Stub>}>
      <Tapes label="About this trace" items={[...origin, ...block.tasks.map((task) => `task · ${task}`)]} />
      <PendingLine {...pending} />
    </Frame>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* lab                                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

function LabTicket({ block, scope }: { block: Of<'lab'>; scope: string }) {
  // A lab with a page of its own prints no placeholder; one that W2 or W3 builds names the open task that does.
  const pending = pendingLab(block.id)
  return (
    <Frame block="lab" scope={scope} meta={block.id} title="Build" pending={pending?.task} stub={<Stub to={`/labs/${block.id}`}>Open lab</Stub>}>
      <Tapes label="About this lab" items={[`lane · ${block.lane} ${laneName(block.lane)}`, ...block.stages.map((stage) => `stage · ${stage}`)]} />
      {pending === null ? null : <PendingLine {...pending} />}
    </Frame>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* card                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

const CARD_TITLES = {
  'notional-machine': 'Notional machine',
  'in-production': 'In production',
  'build-this': 'Build this',
  change: 'Change',
  isomorphism: 'Isomorphism',
  warning: 'Warning',
} as const

function CardTicket({ block, env, scope }: { block: Of<'card'>; env: RenderEnv; scope: string }) {
  switch (block.kind) {
    case 'warning':
      return (
        <Frame block="card" kind="warning" scope={scope} title={block.title ?? CARD_TITLES.warning}>
          <p className="es-c-warning">
            <Icon name="alert" className="es-c-warning__mark" />
            <span>{block.body}</span>
          </p>
        </Frame>
      )
    case 'isomorphism':
      return (
        <Frame block="card" kind="isomorphism" scope={scope} title={block.title ?? CARD_TITLES.isomorphism}>
          <p>{block.body}</p>
          <p className="es-c-breaks">
            <TapeLabel size="sm" tilt="none">
              where it breaks
            </TapeLabel>
            <span>{block.breaks}</span>
          </p>
        </Frame>
      )
    case 'notional-machine':
      return <NotionalMachine id={block.id} env={env} scope={scope} />
    default: {
      // The other three are cards kept in their own files, whose formats a later task decides (the compiler refuses a file of another kind).
      const pending = PENDING[block.kind]
      return (
        <Frame block="card" kind={block.kind} scope={scope} meta={block.id} title={CARD_TITLES[block.kind]} pending={pending.task}>
          <Tapes label="About this card" items={[block.id]} />
          <PendingLine {...pending} />
        </Frame>
      )
    }
  }
}

/**
 * A world's notional-machine card (A§5.9, D-012), loaded from the file the compiler wrote and drawn as one ticket: the card's
 * name and its few words, then its three parts, each under a strip of tape. Every claim in it is a chip with its source, so a
 * rule is never a bare assertion. The card is a lazy chunk, and so are the claims when the page has not fetched them yet.
 */
function NotionalMachine({ id, env, scope }: { id: string; env: RenderEnv; scope: string }) {
  const card = useCard(id)
  const loaded = card.status === 'ready' ? card.value : null
  const needsClaims = loaded !== null && env.claims === null && cardClaimIds(loaded).size > 0
  const claims = useClaims(needsClaims)
  const frame = { block: 'card', kind: 'notional-machine', scope, meta: id, title: CARD_TITLES['notional-machine'] } as const

  if (card.status === 'error') {
    return <Frame {...frame} state="error" error="The card would not print. Check your connection and reload the page." />
  }
  if (card.status === 'loading' || (needsClaims && claims.status === 'loading')) {
    return <Frame {...frame} state="loading" loadingLabel="Printing the card" />
  }
  if (loaded === null) return <Frame {...frame} state="empty" empty={`No card called ${id}.`} />
  return <NotionalMachineView card={loaded} env={claims.status === 'ready' ? { ...env, claims: claims.value } : env} scope={scope} />
}

/** The parts of a card, in order, with the field of the compiled card that holds each (`CARD_PARTS` in packages/schema). */
const CARD_PARTS = [
  ['Models', 'models'],
  ['Ignores', 'ignores'],
  ['Calibrated against', 'calibrated'],
] as const

/** A compiled card on its ticket. `NotionalMachine` loads the card and the claims it needs; this draws them. */
export function NotionalMachineView({ card, env, scope }: { card: CompiledCard; env: RenderEnv; scope: string }) {
  // A card's headings are its three parts and nothing deeper, so the page's heading ids are not the card's to make.
  return (
    <Frame block="card" kind="notional-machine" scope={scope} meta={card.id} title={CARD_TITLES['notional-machine']}>
      <p className="es-c-card__name">{card.title}</p>
      <Prose body={card.intro} env={env} />
      {CARD_PARTS.map(([part, field]) => (
        <Fragment key={part}>
          <h3 className="es-c-part" data-part={field}>
            <TapeLabel size="sm" tilt="none">
              {part}
            </TapeLabel>
          </h3>
          <Prose body={card[field]} env={env} />
        </Fragment>
      ))}
      <Tapes label="About this card" items={[`world · ${card.world}`, `status · ${card.status}`]} />
    </Frame>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* figure                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

function FigureTicket({ block, scope }: { block: Of<'figure'>; scope: string }) {
  return (
    <Frame block="figure" scope={scope} meta="figure">
      <figure className="es-c-figure">
        {/* An image, never injected markup (D-016): the file is a path in public/, so the figure makes no request off this site. */}
        <img src={publicUrl(block.src)} alt={block.alt} loading="lazy" decoding="async" />
        <figcaption>{block.description}</figcaption>
      </figure>
      <Tapes label="About this figure" items={[block.origin]} />
    </Frame>
  )
}
