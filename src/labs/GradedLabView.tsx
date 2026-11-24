import { Fragment, useRef, type ReactNode } from 'react'
import { Button } from '@/design/components/Button'
import { Glyph, Icon } from '@/design/components/Glyph'
import { Readout } from '@/design/components/Readout'
import { Stamp } from '@/design/components/Stamp'
import { TextLink } from '@/design/components/TextLink'
import { printedId } from '@/map/summary'
import { selectContents, useCopy } from '@/receipts/clipboard'
import { labById, type ReceiptLab, type ReceiptStage } from '@/receipts/labs'
import { KIT_KIND, PAGE, STATE_WORD, stateLine } from './copy'
import { checkLineOf, kitFileUrl, type KitFileState } from './kit-files'
import type { GradedLab, KitRef, LabCheck, LabCommand, LabStagePage, StageState } from './types'

/*
 * A graded lab's page (REDESIGN 3.9; ARCHITECTURE §8.4; ASSESSMENT §5.2), for the labs of lane L (the laptop's CPU) and lane F (a GPU):
 * one ordered list of eight steps that a learner follows with a terminal beside it. Download the kit, fetch the inputs, get a challenge,
 * edit the named file, run the grader, bring the receipt back, read the checks, prove it. Above the first step there is only what the lab
 * builds and what it needs.
 *
 * Every command stands on its own paper with a button that copies it, and under it what the terminal shows when it worked. A line taken
 * from a pinned project's documents that the course has never run carries the tag unverified. Each stage says where it stands for the
 * course in one line of a fixed set (copy.ts), wherever the stage is named: in the step that runs it and, on a wide screen, in the list
 * of stages that stands beside the steps as the page scrolls.
 *
 * It takes the descriptor and what the site's list of files says of each kit file as props and starts nothing, so a test draws it on the
 * server renderer (tests/labs/view.test.ts). GradedLabPage.tsx joins it to the list.
 */

/** A receipt of this lab that the learner can defend: verified by this browser, of a stage whose questions are written (src/receipts/defend/registry.ts). */
export interface DefendLink {
  readonly stage: string
  readonly sha256: string
}

export interface GradedLabViewProps {
  lab: GradedLab
  /** What the site's list of files says of each file of `lab.kit`, in its order. */
  files: readonly KitFileState[]
  /** The newest verified receipt of each stage that can be defended, from the learner's ledger: the way in to "Defend your receipt". */
  defend?: readonly DefendLink[]
}

/** A sentence whose runs in backticks are set as code. */
export function Inline({ text }: { text: string }) {
  const parts = text.split('`')
  return (
    <>
      {parts.map((part, at) =>
        at % 2 === 1 ? (
          <code key={at}>{part}</code>
        ) : (
          <Fragment key={at}>{part}</Fragment>
        ),
      )}
    </>
  )
}

/** A line of shell as words that never break inside: a long command wraps between its words, so a flag is never cut from its name at `--`. */
function Words({ text }: { text: string }) {
  return (
    <>
      {text.split(' ').map((word, at) => (
        <Fragment key={at}>
          {at > 0 ? ' ' : null}
          <span className="es-glab-cmd__word">{word}</span>
        </Fragment>
      ))}
    </>
  )
}

/** The mark of a stage's state: a mark and a word, never a colour alone. */
function StateMark({ state }: { state: StageState }) {
  if (state.kind === 'verified') return <Icon name="check" className="es-glab-state__mark" />
  if (state.kind === 'awaiting-bank') return <Icon name="lock" className="es-glab-state__mark" />
  return <Glyph shape="ring" className="es-glab-state__mark" />
}

/** The one line that says where a stage stands for the course. A verified stage gives the commit the course ran it at, set as code, as a [measured] tag's date and commit are. */
export function StateLine({ state, compact = false }: { state: StageState; compact?: boolean }) {
  return (
    <p className="es-glab-state" data-state={state.kind} data-compact={compact || undefined}>
      <StateMark state={state} />
      <span>
        <span className="sr-only">{STATE_WORD[state.kind]}: </span>
        {stateLine(state)}
        {state.kind === 'verified' ? (
          <>
            {' '}
            at <code>{state.commit.slice(0, 12)}</code>
          </>
        ) : null}
      </span>
    </p>
  )
}

/**
 * A line of shell on its own paper, a button that copies it, and what the terminal shows when it worked. Where the browser will not copy,
 * the line is selected for the learner's own Ctrl+C. The prompt mark is drawn and is never part of the copy. The button's name starts with
 * the words it shows (WCAG 2.5.3) and says which line it copies, so a list of the page's buttons tells them apart.
 */
export function Command({ command, label }: { command: LabCommand; label: string }) {
  const code = useRef<HTMLElement>(null)
  const { status, copy } = useCopy()
  const unverified = command.from === 'pin' && command.ran === undefined
  return (
    <div className="es-glab-cmd" data-unverified={unverified || undefined}>
      <div className="es-glab-cmd__paper">
        <pre className="es-glab-cmd__line">
          <code ref={code} data-command-line="">
            <Words text={command.line} />
          </code>
        </pre>
        <Button variant="plate" size="sm" className="es-glab-cmd__copy" aria-label={label} onClick={() => void copy(command.line, label, () => selectContents(code.current))}>
          {PAGE.copy}
        </Button>
      </div>
      <p className="es-glab-cmd__said" role="status">
        {status === 'copied' ? PAGE.copied : status === 'failed' ? PAGE.refused : ''}
      </p>
      {unverified ? (
        <p className="es-glab-cmd__unverified">
          <Stamp word="unverified" />
          <span>{PAGE.unverified}</span>
        </p>
      ) : null}
      <div className="es-glab-cmd__then">
        <p className="es-glab-cmd__then-head">{PAGE.then}</p>
        <p>
          <Inline text={command.then} />
        </p>
      </div>
    </div>
  )
}

/** One file of the kit: the link, its size and its SHA-256, and the line that checks a download behind a disclosure. */
function KitFileBlock({ item: kitRef, state }: { item: KitRef; state: KitFileState }) {
  const kind = KIT_KIND[kitRef.kind]
  const file = state.status === 'ready' ? state.file : null
  return (
    <div className="es-glab-file" data-kit-kind={kitRef.kind} data-kit-file={file?.name}>
      <p className="es-glab-file__kind">{kind.name}</p>
      {file === null ? null : (
        <p className="es-glab-file__link">
          <TextLink file={kitFileUrl(file.name)}>{file.name}</TextLink>
          <Readout value={file.bytes} unit="B" tag="measured" size="sm" />
        </p>
      )}
      <p className="es-glab-file__is">
        <Inline text={kind.is} />
      </p>
      {file === null ? (
        <p className="es-glab-hint">{state.status === 'loading' ? PAGE.kitLoading : PAGE.kitMissing}</p>
      ) : (
        <>
          <div className="es-glab-hash">
            <span className="es-glab-hash__name">SHA-256</span>
            <code className="es-glab-hash__digits" data-kit-sha256="">
              {file.sha256}
            </code>
          </div>
          <details className="es-glab-file__check">
            <summary>{PAGE.checkSummary}</summary>
            <p>
              <Inline text={PAGE.checkNote} />
            </p>
            <Command command={{ line: checkLineOf(file), then: `\`${file.name}: OK\``, from: 'course' }} label={`${PAGE.copy}: check ${file.name}`} />
          </details>
        </>
      )}
    </div>
  )
}

/** One step of the list: its number is the list's own, and its heading names the work. */
function Step({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const heading = `glab-step-${id}`
  return (
    <li className="es-glab-step" aria-labelledby={heading} data-step-id={id}>
      <h2 id={heading} className="es-glab-step__title">
        {title}
      </h2>
      <div className="es-glab-step__body">{children}</div>
    </li>
  )
}

/** A stage's name as a heading takes it: `s2 · the full forward pass`, with `optional` where the module does not need it. */
function StageName({ stage, as: Tag = 'h3' }: { stage: ReceiptStage; as?: 'h3' | 'p' }) {
  return (
    <Tag className="es-glab-stage__name">
      <span className="es-glab-stage__n">s{stage.n}</span>
      <span>{stage.name}</span>
      {stage.optional ? <span className="es-glab-stage__optional">{PAGE.optional}</span> : null}
    </Tag>
  )
}

function CheckItem({ check }: { check: LabCheck }) {
  return (
    <li className="es-glab-check" data-by={check.by}>
      <p className="es-glab-check__label">
        <Inline text={check.label} /> <code className="es-glab-check__id">{check.id}</code>
      </p>
      <p className="es-glab-check__meta">
        <span>
          {PAGE.checkedBy} {check.by === 'grader' ? PAGE.byGrader : PAGE.byBrowser}
        </span>
        {check.optional ? <span className="es-glab-stage__optional">{PAGE.optional}</span> : null}
      </p>
      <p className="es-glab-check__catches">
        <span className="es-glab-check__catches-word">{PAGE.catches}</span> <Inline text={check.catches} />
      </p>
    </li>
  )
}

/** The stages of the lab, each with its state, beside the steps on a wide screen and held in view as they scroll. */
function StageList({ stages }: { stages: readonly { page: LabStagePage; stage: ReceiptStage }[] }) {
  return (
    <aside className="es-glab-stages" aria-labelledby="glab-stages-title">
      <h2 id="glab-stages-title" className="es-glab-stages__title">
        {PAGE.stagesTitle}
      </h2>
      <p className="es-glab-hint">{PAGE.stagesLead}</p>
      <ol className="es-glab-stages__list" role="list">
        {stages.map(({ page, stage }) => (
          <li key={page.id} className="es-glab-stages__item">
            <StageName stage={stage} as="p" />
            <StateLine state={page.state} compact />
            <TextLink to={`/receipts?stage=${page.id}`}>{PAGE.challengeLink(`s${stage.n}`)}</TextLink>
          </li>
        ))}
      </ol>
    </aside>
  )
}

/** The stages of the descriptor, each with the lab list's entry for it. A stage the list does not have is left out (a test holds the two together). */
function stagesOf(lab: GradedLab, listed: ReceiptLab | undefined) {
  return lab.stages.flatMap((page) => {
    const stage = listed?.stages.find((entry) => entry.id === page.id)
    return stage === undefined ? [] : [{ page, stage }]
  })
}

export function GradedLabView({ lab, files, defend = [] }: GradedLabViewProps) {
  const listed = labById(lab.id)
  const module = listed?.module ?? lab.id.slice(0, lab.id.indexOf('.'))
  const stages = stagesOf(lab, listed)
  return (
    <div className="es-glab" data-page="graded-lab" data-lab={lab.id}>
      <header className="es-glab__head">
        <nav aria-label="Breadcrumb" className="es-glab__crumbs">
          <ol>
            <li>
              <TextLink to="/map">{PAGE.crumbCourse}</TextLink>
            </li>
            <li>
              <TextLink to={`/m/${module}`}>{printedId(module)}</TextLink>
            </li>
            <li aria-current="page">{lab.title}</li>
          </ol>
        </nav>
        <h1 className="es-glab__title">{lab.title}</h1>
        <p className="es-glab__lead">
          <Inline text={lab.builds} />
        </p>
        <section className="es-glab-needs" aria-labelledby="glab-needs-title">
          <h2 id="glab-needs-title" className="es-glab-needs__title">
            {PAGE.needs}
          </h2>
          <dl className="es-glab-needs__list">
            {lab.needs.map((need) => (
              <div key={need.term} className="es-glab-needs__row">
                <dt>{need.term}</dt>
                <dd>
                  <Inline text={need.detail} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </header>

      <div className="es-glab__layout">
        <ol className="es-glab-steps" role="list">
          <Step id="kit" title={PAGE.steps.kit}>
            <p className="es-glab-step__lead">{PAGE.kitLead}</p>
            <div className="es-glab-files">
              {lab.kit.map((kitRef, at) => (
                <KitFileBlock key={`${kitRef.kind}-${at}`} item={kitRef} state={files[at] ?? { status: 'loading' }} />
              ))}
            </div>
          </Step>

          <Step id="inputs" title={PAGE.steps.inputs}>
            <p className="es-glab-step__lead">{PAGE.inputsLead}</p>
            {lab.inputs.map((command, at) => (
              <Command key={command.line} command={command} label={`${PAGE.copy}: ${PAGE.steps.inputs.toLowerCase()}, line ${at + 1}`} />
            ))}
          </Step>

          <Step id="challenge" title={PAGE.steps.challenge}>
            <p className="es-glab-step__lead">{PAGE.challengeLead}</p>
            <ul className="es-glab-links" role="list">
              {stages.map(({ page, stage }) => (
                <li key={page.id}>
                  <TextLink to={`/receipts?stage=${page.id}`}>{PAGE.challengeLink(`s${stage.n}, ${stage.name}`)}</TextLink>
                  {stage.optional ? <span className="es-glab-stage__optional">{PAGE.optional}</span> : null}
                </li>
              ))}
            </ul>
          </Step>

          <Step id="edit" title={PAGE.steps.edit}>
            <p>
              <Inline text={PAGE.editLead(lab.folder)} />
            </p>
            <p className="es-glab-edit">
              <code data-edit-file="">{lab.edit.file}</code>
            </p>
            <p className="es-glab-hint">
              <Inline text={lab.edit.note} />
            </p>
          </Step>

          <Step id="run" title={PAGE.steps.run}>
            <p className="es-glab-step__lead">
              <Inline text={PAGE.runLead} />
            </p>
            {stages.map(({ page, stage }) => (
              <section key={page.id} className="es-glab-stage" aria-labelledby={`glab-run-${stage.n}-name`} data-stage={page.id}>
                <p id={`glab-run-${stage.n}-name`} className="sr-only">
                  {PAGE.runOf(`s${stage.n}`)}
                </p>
                <StageName stage={stage} />
                <StateLine state={page.state} />
                <p>
                  <span className="es-glab-stage__asks">{PAGE.asks}</span> <Inline text={page.asks} />
                </p>
                <Command command={page.run} label={`${PAGE.copy}: grade s${stage.n}`} />
              </section>
            ))}
          </Step>

          <Step id="import" title={PAGE.steps.import}>
            <p>
              <Inline text={PAGE.importLead} />
            </p>
            <p>
              <TextLink to="/receipts">{PAGE.importLink}</TextLink>
            </p>
          </Step>

          <Step id="checks" title={PAGE.steps.checks}>
            <p className="es-glab-step__lead">{PAGE.checksLead}</p>
            {stages.map(({ page, stage }) => (
              <section key={page.id} className="es-glab-stage" aria-labelledby={`glab-checks-${stage.n}-name`} data-stage={page.id}>
                <p id={`glab-checks-${stage.n}-name`} className="sr-only">
                  {PAGE.checksOf(`s${stage.n}`)}
                </p>
                <StageName stage={stage} />
                <ul className="es-glab-checks" role="list">
                  {page.checks.map((check) => (
                    <CheckItem key={check.id} check={check} />
                  ))}
                </ul>
              </section>
            ))}
          </Step>

          <Step id="prove" title={PAGE.steps.prove}>
            <p className="es-glab-step__lead">{PAGE.proveLead}</p>
            <p>
              <Inline text={lab.prove.asks} />
            </p>
            {lab.prove.open ? (
              defend.length === 0 ? (
                <p>
                  <TextLink to="/receipts">{PAGE.proveOpen}</TextLink>
                </p>
              ) : (
                <ul className="es-glab-links" role="list" data-defend-links="">
                  {defend.map((link) => {
                    const named = stages.find(({ page }) => page.id === link.stage)
                    return (
                      <li key={link.sha256}>
                        <TextLink to={{ pathname: '/receipts', hash: link.sha256 }}>{PAGE.defendLink(named === undefined ? link.stage : `s${named.stage.n}, ${named.stage.name}`)}</TextLink>
                      </li>
                    )
                  })}
                </ul>
              )
            ) : (
              <p className="es-glab-pending">{PAGE.proveClosed}</p>
            )}
          </Step>
        </ol>

        <StageList stages={stages} />
      </div>
    </div>
  )
}
