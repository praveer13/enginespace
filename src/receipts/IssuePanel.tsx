import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ChallengeEvent } from '@es/ledger'
import { Button } from '@/design/components/Button'
import { Icon } from '@/design/components/Glyph'
import { PrimaryButton } from '@/design/components/PrimaryButton'
import { TextLink } from '@/design/components/TextLink'
import { Sheet, SheetLine } from '@/design/components/Sheet'
import { expiryOf, gradeCommand, gradeCommandParts } from './challenge'
import type { IssueOutcome } from './challenge'
import { selectContents, useCopy } from './clipboard'
import { ISSUE, stageNote, TICKET } from './copy'
import { labById, labForStage, LANE_NAME, RECEIPT_LABS, stageHeading, stageOf } from './labs'
import { SlipSelect } from './SlipSelect'
import { TokenText } from './TokenText'
import { formatWhen } from './when'

/*
 * "Get a challenge" (ARCHITECTURE §8.4; W2-T06): the learner chooses a lab and a stage and the page issues a token for it, writes it to
 * the ledger as a `challenge` event, and prints it on a ticket to copy. The deck is a form on a stainless panel, as the settings page's
 * controls are, and the ticket that it prints is under the heat lamp, because the next decision, copying the token to the machine that
 * will run it, acts there.
 *
 * The page does the issuing (it holds the ledger and the clock) and this panel asks for it with `issue`, so the panel can be drawn on
 * the server renderer with any outcome. Choosing is checked when the learner presses the button and not before: a button that is
 * disabled says nothing about what is missing, and the message that this one prints names the control to fix and moves focus to it.
 */

export interface IssuePanelProps {
  /** The ledger is open. Until it is, the button waits. */
  ready: boolean
  /** The ledger will take no write (a newer version of the site has it). */
  readOnly: boolean
  /** The ledger is in memory only: a challenge written now is gone with the tab. */
  memoryOnly: boolean
  /** A stage to start on, from the address (`?stage=tr8.replay.s2`). One that no lab lists is ignored. */
  preset?: string
  issue: (stage: string) => Promise<IssueOutcome>
}

/** The ticket that a new challenge prints on. Exported for the tests. */
export function ChallengeTicket({ event, durable, memoryOnly }: { event: ChallengeEvent; durable: boolean; memoryOnly: boolean }) {
  const { status, what, copy } = useCopy()
  const tokenRef = useRef<HTMLSpanElement>(null)
  const commandRef = useRef<HTMLElement>(null)
  const { token } = event.data
  const stage = event.ref.slice('challenge:'.length)
  const lab = labForStage(stage)
  const command = gradeCommand(stage, token)
  const parts = gradeCommandParts(stage)
  const seed = event.data.seed.toString(16).padStart(8, '0')
  return (
    <Sheet
      as="section"
      width="wide"
      lamp
      aria-label={`Challenge for ${stage}`}
      title={stageHeading(stage)}
      titleAs="h3"
      foot={[`Challenge ${seed}`, `issued ${formatWhen(event.at)}`]}
      stub={
        <PrimaryButton
          onClick={() => {
            void copy(token, TICKET.copiedToken, () => selectContents(tokenRef.current))
          }}
        >
          {TICKET.copyToken}
        </PrimaryButton>
      }
    >
      <SheetLine qty="stage">{stage}</SheetLine>
      <SheetLine qty="good until">{formatWhen(expiryOf(event.at))}</SheetLine>
      <div className="es-chit__block">
        <p className="es-chit__label">{TICKET.tokenLabel}</p>
        <p className="es-chit__token" data-token>
          <TokenText token={token} innerRef={tokenRef} />
        </p>
      </div>
      <div className="es-chit__block">
        <p className="es-chit__label">{TICKET.run}</p>
        <p className="es-chit__command">
          <code ref={commandRef}>
            {parts.before}
            <TokenText token={token} />
            {parts.after}
          </code>
        </p>
        <div className="es-chit__actions">
          <Button
            variant="plate"
            size="sm"
            onClick={() => {
              void copy(command, TICKET.copiedCommand, () => selectContents(commandRef.current))
            }}
          >
            {TICKET.copyCommand}
          </Button>
          {lab === undefined ? null : <TextLink to={`/labs/${lab.id}`}>{TICKET.labPage}</TextLink>}
        </div>
      </div>
      <p className="es-chit__status" role="status" data-status={status}>
        {status === 'copied' ? (
          <>
            <Icon name="check" className="es-chit__mark" />
            <span>{what}</span>
          </>
        ) : status === 'failed' ? (
          <>
            <Icon name="alert" className="es-chit__mark" />
            <span>{TICKET.refused}</span>
          </>
        ) : null}
      </p>
      {!durable && !memoryOnly ? (
        <p className="es-chit__warn">
          <Icon name="alert" className="es-chit__mark" />
          <span>{TICKET.notSaved}</span>
        </p>
      ) : null}
    </Sheet>
  )
}

export function IssuePanel({ ready, readOnly, memoryOnly, preset, issue }: IssuePanelProps) {
  const start = preset === undefined ? undefined : stageOf(preset)
  const [labId, setLabId] = useState(start === undefined ? '' : (labForStage(start.id)?.id ?? ''))
  const [stageId, setStageId] = useState(start?.id ?? '')
  const [problem, setProblem] = useState<{ field: 'lab' | 'stage' | 'issue'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [fresh, setFresh] = useState<{ event: ChallengeEvent; durable: boolean } | null>(null)
  const labSelect = useRef<HTMLSelectElement>(null)
  const stageSelect = useRef<HTMLSelectElement>(null)
  const printed = useRef<HTMLDivElement>(null)
  const lab = labById(labId)

  // The ticket that has just been printed comes into view, under a phone's first screen, without taking focus: a keyboard that is in the
  // middle of a task keeps its place, and the ticket's controls are the next stops in the page's order, as they stand on the paper.
  const issued = fresh?.event.id
  useEffect(() => {
    if (issued !== undefined) printed.current?.scrollIntoView({ block: 'nearest' })
  }, [issued])

  const chooseLab = (id: string) => {
    setLabId(id)
    if (labForStage(stageId)?.id !== id) setStageId('')
    setProblem(null)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (labId === '') {
      setProblem({ field: 'lab', text: ISSUE.labMissing })
      labSelect.current?.focus()
      return
    }
    if (stageId === '') {
      setProblem({ field: 'stage', text: ISSUE.stageMissing })
      stageSelect.current?.focus()
      return
    }
    setProblem(null)
    setBusy(true)
    try {
      const outcome = await issue(stageId)
      if (outcome.ok) setFresh({ event: outcome.event, durable: outcome.durable })
      else setProblem({ field: 'issue', text: outcome.detail })
    } catch {
      setProblem({ field: 'issue', text: ISSUE.refused })
    } finally {
      setBusy(false)
    }
  }

  const note = stageNote(stageId)
  return (
    <section aria-labelledby="rc-issue" className="es-panel">
      <h2 id="rc-issue" className="es-panel__title">
        {ISSUE.title}
      </h2>
      <p className="es-panel__lead">{ISSUE.lead}</p>
      <form className="es-deck es-issue" onSubmit={(event) => void submit(event)} noValidate>
        <div className="es-issue__fields">
          <SlipSelect
            label={ISSUE.labLabel}
            selectRef={labSelect}
            value={labId}
            onChange={(event) => chooseLab(event.target.value)}
            error={problem?.field === 'lab' ? problem.text : undefined}
          >
            <option value="">{ISSUE.labPlaceholder}</option>
            {RECEIPT_LABS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.id} · {LANE_NAME[entry.lane]}
              </option>
            ))}
          </SlipSelect>
          <SlipSelect
            label={ISSUE.stageLabel}
            selectRef={stageSelect}
            value={stageId}
            hint={note === '' ? undefined : note}
            disabled={lab === undefined}
            onChange={(event) => {
              setStageId(event.target.value)
              setProblem(null)
            }}
            error={problem?.field === 'stage' ? problem.text : undefined}
          >
            <option value="">{lab === undefined ? ISSUE.labMissing : ISSUE.stagePlaceholder}</option>
            {lab?.stages.map((entry) => (
              <option key={entry.id} value={entry.id}>
                s{entry.n} · {entry.name}
                {entry.optional ? ' (optional)' : ''}
              </option>
            ))}
          </SlipSelect>
        </div>
        {memoryOnly ? (
          <p className="es-issue__warn">
            <Icon name="alert" className="es-issue__mark" />
            <span>{ISSUE.memoryOnly}</span>
          </p>
        ) : null}
        {readOnly ? (
          <p className="es-issue__warn">
            <Icon name="alert" className="es-issue__mark" />
            <span>{ISSUE.readOnly}</span>
          </p>
        ) : null}
        <div className="es-issue__row">
          <Button type="submit" variant="ink" loading={busy} disabled={!ready || readOnly} error={problem?.field === 'issue' ? problem.text : undefined}>
            {ISSUE.action}
          </Button>
        </div>
      </form>
      <div ref={printed} className="es-chit">
        {fresh === null ? null : <ChallengeTicket key={fresh.event.id} event={fresh.event} durable={fresh.durable} memoryOnly={memoryOnly} />}
      </div>
      <p className="sr-only" role="status">
        {fresh === null ? '' : `Challenge issued for ${fresh.event.ref.slice('challenge:'.length)}.`}
      </p>
    </section>
  )
}
