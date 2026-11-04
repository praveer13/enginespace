import { Fragment, type ReactNode } from 'react'
import type { CompiledBlock, CompiledCard } from '@es/schema'
import { publicUrl, useCard, useClaims } from '../load'
import { Icon } from '@/design/components/Glyph'
import { Readout } from '@/design/components/Readout'
import { Stub } from '@/design/components/Stub'
import { TapeLabel } from '@/design/components/TapeLabel'
import { Ticket, TicketLine, type TicketState } from '@/design/components/Ticket'
import './content.css'
import { cardClaimIds, decimals, laneName, PENDING, pendingGame, pendingLab, readoutUnit, sections, type Pending, type RenderEnv } from './model'
import { Scope } from './Page'
import { Inline, Prose } from './Prose'

/*
 * The eight block types (ARCHITECTURE §4.3, D-016), each drawn as what it is on The Pass (D-047): a run of tickets, one per
 * block. A prose block breaks into a ticket for each `##` section, with the heading as the ticket's stamped title. Every
 * other block is one ticket, headed by the page's id and its own, titled by its kind, with its facts on tape labels.
 *
 * Prose, a warning, an isomorphism, a notional-machine card and a figure are complete. A block whose feature a later task
 * builds (a prediction, an item set, a game, a trace, a lab page, the other cards kept in their own files) prints what it is
 * told, then a red line naming the task that builds the rest, and a stub for the action it will have, held down. A feature
 * task replaces its block's placeholder below and leaves the others alone.
 */

export interface BlocksProps {
  blocks: readonly CompiledBlock[]
  env: RenderEnv
  /** The page the blocks belong to (a lesson or module id), printed on each ticket's head line. */
  scope: string
}

export function Blocks({ blocks, env, scope }: BlocksProps) {
  return blocks.map((block, at) => <BlockTicket key={at} block={block} env={env} scope={scope} />)
}

type Of<Type extends CompiledBlock['type']> = Extract<CompiledBlock, { type: Type }>

function BlockTicket({ block, env, scope }: { block: CompiledBlock; env: RenderEnv; scope: string }) {
  switch (block.type) {
    case 'prose':
      return <ProseTickets block={block} env={env} scope={scope} />
    case 'predict':
      return <PredictTicket block={block} scope={scope} />
    case 'item':
      return <ItemTicket block={block} scope={scope} />
    case 'game':
      return <GameTicket block={block} scope={scope} />
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
/* The ticket every block is printed on                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

interface FrameProps {
  /** The block type, for tests and for the task that replaces a placeholder. */
  block: CompiledBlock['type']
  kind?: string
  scope: string
  /** The block's own id, on the right of the head line. */
  meta?: string
  title?: ReactNode
  /** The anchor a link to this section jumps to. */
  anchor?: string
  /** The task that builds what this ticket stands in for, when it is a placeholder. */
  pending?: string
  stub?: ReactNode
  /** The ticket's state: a block that waits for a file prints as loading, and one that did not load as an error or as blank. */
  state?: TicketState
  loadingLabel?: string
  error?: ReactNode
  empty?: ReactNode
  children?: ReactNode
}

function Frame({ block, kind, scope, meta, title, anchor, pending, stub, state, loadingLabel, error, empty, children }: FrameProps) {
  return (
    <Ticket
      as="section"
      id={anchor}
      className="es-c-block"
      data-block={block}
      data-kind={kind}
      data-placeholder={pending}
      width="wide"
      head={<Scope id={scope} />}
      meta={meta}
      title={title}
      titleAs="h2"
      stub={stub}
      state={state}
      loadingLabel={loadingLabel}
      error={error}
      empty={empty}
    >
      {children}
    </Ticket>
  )
}

/** The facts of a block on strips of masking tape. */
function Tapes({ label, items }: { label: string; items: readonly string[] }) {
  return (
    <ul className="es-c-tapes" aria-label={label}>
      {items.map((item) => (
        <TapeLabel key={item} as="li" size="sm" tilt="none">
          {item}
        </TapeLabel>
      ))}
    </ul>
  )
}

/** The red line that says what is missing and which task builds it. */
function PendingLine({ task, what }: Pending) {
  return (
    <p className="es-c-pending">
      <TicketLine tone="ink-2" qty={<Icon name="lock" className="es-c-pending__mark" />} note={task}>
        Not built yet: {what}
      </TicketLine>
    </p>
  )
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
/* predict                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** 0.15 as 15, without the 15.000000000000002 that multiplying gives. */
const percent = (ratio: number): number => Number((ratio * 100).toPrecision(12))

function PredictTicket({ block, scope }: { block: Of<'predict'>; scope: string }) {
  const { answer } = block
  const pending = PENDING.predict
  const unit = answer.kind === 'choice' ? undefined : (readoutUnit(answer.unit) ?? answer.unit)
  return (
    <Frame block="predict" scope={scope} meta={block.id} title="Predict" pending={pending.task} stub={<Stub disabled>Commit answer</Stub>}>
      <p>{block.prompt}</p>
      {answer.kind === 'choice' ? (
        <ol className="es-c-options">
          {answer.options.map((option) => (
            <li key={option.id}>{option.text}</li>
          ))}
        </ol>
      ) : null}
      <Tapes
        label="About this prediction"
        items={[`answer · ${answer.kind}`, ...(unit === undefined ? [] : [`unit · ${unit}`]), `reveal · ${block.reveal}`, ...block.kcs]}
      />
      {answer.kind === 'numeric' ? (
        <p className="es-c-line">
          {answer.rel_tol === 0 ? (
            <TicketLine>tolerance: the exact value</TicketLine>
          ) : (
            <TicketLine qty={<Readout value={percent(answer.rel_tol)} digits={decimals(percent(answer.rel_tol))} unit="%" tag="estimated" size="sm" />}>
              tolerance
            </TicketLine>
          )}
        </p>
      ) : null}
      <PendingLine {...pending} />
    </Frame>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* item, game, trace                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

function ItemTicket({ block, scope }: { block: Of<'item'>; scope: string }) {
  const pending = PENDING.item
  return (
    <Frame block="item" scope={scope} meta={block.family} title="Items" pending={pending.task} stub={<Stub disabled>Start items</Stub>}>
      <p className="es-c-line">
        <TicketLine qty={`${block.count}x`} note={`level ${block.level}`}>
          {block.family}
        </TicketLine>
      </p>
      <p>Drawn on fresh seeds when you start.</p>
      <PendingLine {...pending} />
    </Frame>
  )
}

function GameTicket({ block, scope }: { block: Of<'game'>; scope: string }) {
  const pending = pendingGame(block.id)
  return (
    <Frame block="game" scope={scope} meta={`${block.id} · ${block.level}`} title="Play" pending={pending.task} stub={<Stub disabled>Start level</Stub>}>
      <Tapes label="About this game" items={[block.id, `level · ${block.level}`, block.mode]} />
      <PendingLine {...pending} />
    </Frame>
  )
}

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
  const pending = pendingLab(block.id)
  return (
    <Frame block="lab" scope={scope} meta={block.id} title="Build" pending={pending.task} stub={<Stub to={`/labs/${block.id}`}>Open lab</Stub>}>
      <Tapes label="About this lab" items={[`lane · ${block.lane} ${laneName(block.lane)}`, ...block.stages.map((stage) => `stage · ${stage}`)]} />
      <PendingLine {...pending} />
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
