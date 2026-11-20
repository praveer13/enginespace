import { Fragment, lazy, Suspense } from 'react'
import type { CompiledBlock, CompiledCard } from '@es/schema'
import { publicUrl, useClaims } from '../load'
import { useCard } from '../load-lessons'
import { ItemBlock } from '@/items/ItemBlock'
import { Icon } from '@/design/components/Glyph'
import { PrimaryButton } from '@/design/components/PrimaryButton'
import { Label } from '@/design/components/Label'
import { ClaimChip } from './ClaimChip'
import './content.css'
import { Frame, PendingLine, Tapes, type Of } from './BlockFrame'
import { GameBlock } from './GameBlock'
import { useKept } from './kept'
import { BuildThisBody, InProductionBody } from './KeptCards'
import { cardClaimIds, laneName, PENDING, pendingLab, sections, type RenderEnv } from './model'
import { Inline, Prose } from './Prose'
import { PredictLoading } from './PredictLoading'
import { Tagged } from './Tagged'
import { TraceRun } from './TraceRun'

/*
 * The eight block types (ARCHITECTURE §4.3, D-016), each drawn as what it is on The Pass (D-047): a run of tickets, one per
 * block. A prose block breaks into a ticket for each `##` section, with the heading as the ticket's stamped title. Every
 * other block is one ticket, titled by its kind, with its facts on tape labels and the page's id and its own on its foot line.
 * The title leads the paper; the prose before a page's first heading, which has none, opens on the page's id (BlockFrame.tsx).
 *
 * Prose, a warning, an isomorphism, a notional-machine card, an In-production card, a Build-this card, a trace (TraceRun.tsx, W2-T42), a
 * figure, an item set (src/items, W1-T04), a game (GameBlock.tsx, W1b-T01) and a prediction (Predict.tsx, W1b-T02) are complete. A block
 * whose feature a later task builds (a lab that has no page yet, the change card, a game no task has built yet, a prediction that no run answers) prints what it is told, then
 * a red line naming the open task that builds the rest, and a stub for the action it will have, held down. A feature task replaces its
 * block's placeholder below and leaves the others alone.
 */

/* A module page's blocks are prose, cards and figures: a prediction there is rare, so its code loads only where one is drawn. */
const PredictTicket = lazy(() => import('./Predict').then((module) => ({ default: module.PredictTicket })))

export interface BlocksProps {
  blocks: readonly CompiledBlock[]
  env: RenderEnv
  /** The page the blocks belong to (a lesson or module id), printed on each ticket's foot line, or its head line when it has no title. */
  scope: string
  /** The page's content revision (A§4.2), which a game block's runs carry. */
  rev?: string
}

export function Blocks({ blocks, env: given, scope, rev }: BlocksProps) {
  const env = withChips(given)
  return blocks.map((block, at) => <BlockTicket key={at} block={block} at={at} blocks={blocks} env={env} scope={scope} rev={rev} />)
}

/** On a page of tickets a claim is a chip with its source under it (ClaimChip.tsx). */
function withChips(env: RenderEnv): RenderEnv {
  if (env.claim !== undefined) return env
  const chips: RenderEnv = { ...env }
  chips.claim = (id) => <ClaimChip id={id} env={chips} />
  return chips
}

function BlockTicket({ block, at, blocks, env, scope, rev }: { block: CompiledBlock; at: number; blocks: readonly CompiledBlock[]; env: RenderEnv; scope: string; rev?: string }) {
  switch (block.type) {
    case 'prose':
      return <ProseTickets block={block} env={env} scope={scope} />
    case 'predict':
      return (
        <Suspense fallback={<PredictLoading block={block} />}>
          <PredictTicket block={block} scope={scope} at={at} blocks={blocks} rev={rev} />
        </Suspense>
      )
    case 'item':
      return <ItemBlock block={block} scope={scope} />
    case 'game':
      return <GameBlock block={block} scope={scope} at={at} rev={rev} />
    case 'trace':
      return <TraceTicket block={block} scope={scope} rev={rev} />
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

function TraceTicket({ block, scope, rev }: { block: Of<'trace'>; scope: string; rev?: string }) {
  // A seed draws a synthetic trace, and the site labels every synthetic trace as one (PRODUCT.md, "Evidence on Hand").
  const origin = block.seed === undefined ? ['pinned'] : ['synthetic', `seed · ${block.seed}`]
  return (
    <Frame block="trace" scope={scope} meta={block.id} title="Trace">
      <Tapes label="About this trace" items={[...origin, ...block.tasks.map((task) => `task · ${task}`)]} />
      <TraceRun block={block} scope={scope} rev={rev} bare />
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
    <Frame block="lab" scope={scope} meta={block.id} title="Build" pending={pending?.task} stub={<PrimaryButton to={`/labs/${block.id}`}>Open lab</PrimaryButton>}>
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
            <span>
              <Tagged text={block.body} />
            </span>
          </p>
        </Frame>
      )
    case 'isomorphism':
      return (
        <Frame block="card" kind="isomorphism" scope={scope} title={block.title ?? CARD_TITLES.isomorphism}>
          <p>
            <Tagged text={block.body} />
          </p>
          <p className="es-c-breaks">
            <Label size="sm" tilt="none">
              where it breaks
            </Label>
            <span>
              <Tagged text={block.breaks} />
            </span>
          </p>
        </Frame>
      )
    case 'notional-machine':
      return <NotionalMachine id={block.id} env={env} scope={scope} />
    case 'in-production':
      return <InProductionTicket id={block.id} env={env} scope={scope} />
    case 'build-this':
      return <BuildThisTicket id={block.id} env={env} scope={scope} />
    default: {
      // The change card is kept in a file of its own, whose format W3-T06 decides (the compiler refuses a file of that kind).
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

/** "In vLLM today" on a page of tickets: the lever's words, then the flags and source lines of each pinned engine, each cited as a chip. */
function InProductionTicket({ id, env: given, scope }: { id: string; env: RenderEnv; scope: string }) {
  const env = withChips(given)
  const kept = useKept(id, 'in-production', env)
  const frame = { block: 'card', kind: 'in-production', scope, meta: id, title: CARD_TITLES['in-production'] } as const
  if (kept.status === 'error') return <Frame {...frame} state="error" error="The card would not print. Check your connection and reload the page." />
  if (kept.status === 'loading') return <Frame {...frame} state="loading" loadingLabel="Printing the card" />
  if (kept.status === 'empty') return <Frame {...frame} state="empty" empty={`No card called ${id}.`} />
  return (
    <Frame {...frame} title={`In ${kept.card.engines[0].engine} today`}>
      <p className="es-c-card__name">{kept.card.title}</p>
      <InProductionBody card={kept.card} env={withChips(kept.env)} />
    </Frame>
  )
}

/** The Build row on a page of tickets: the lab, its stages and the way in. */
function BuildThisTicket({ id, env: given, scope }: { id: string; env: RenderEnv; scope: string }) {
  const env = withChips(given)
  const kept = useKept(id, 'build-this', env)
  const frame = { block: 'card', kind: 'build-this', scope, meta: id, title: CARD_TITLES['build-this'] } as const
  if (kept.status === 'error') return <Frame {...frame} state="error" error="The card would not print. Check your connection and reload the page." />
  if (kept.status === 'loading') return <Frame {...frame} state="loading" loadingLabel="Printing the card" />
  if (kept.status === 'empty') return <Frame {...frame} state="empty" empty={`No card called ${id}.`} />
  return (
    <Frame {...frame}>
      <BuildThisBody card={kept.card} env={withChips(kept.env)} heading={(name) => <p className="es-c-card__name">{name}</p>} />
      <Tapes label="About this card" items={[`lab · ${kept.card.lab}`, ...kept.card.stages.map((stage) => `stage · ${stage}`)]} />
    </Frame>
  )
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
  return <NotionalMachineView card={loaded} env={claims.status === 'ready' ? { ...env, claims: claims.value, claim: undefined } : env} scope={scope} />
}

/** The parts of a card, in order, with the field of the compiled card that holds each (`CARD_PARTS` in packages/schema). */
const CARD_PARTS = [
  ['Models', 'models'],
  ['Ignores', 'ignores'],
  ['Calibrated against', 'calibrated'],
] as const

/** A compiled card on its ticket. `NotionalMachine` loads the card and the claims it needs; this draws them. */
export function NotionalMachineView({ card, env: given, scope }: { card: CompiledCard; env: RenderEnv; scope: string }) {
  const env = withChips(given)
  // A card's headings are its three parts and nothing deeper, so the page's heading ids are not the card's to make.
  return (
    <Frame block="card" kind="notional-machine" scope={scope} meta={card.id} title={CARD_TITLES['notional-machine']}>
      <p className="es-c-card__name">{card.title}</p>
      <Prose body={card.intro} env={env} />
      {CARD_PARTS.map(([part, field]) => (
        <Fragment key={part}>
          <h3 className="es-c-part" data-part={field}>
            <Label size="sm" tilt="none">
              {part}
            </Label>
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
