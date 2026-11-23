import { lazy, Suspense, type ReactNode } from 'react'
import type { Sha256, VerificationReport } from '@es/ledger'
import type { Receipt } from '@es/schema/receipt'
import { readStoredReport, RULES_IN_ALL, rulesOnRead, verdictOfStored } from '@es/verify'
import { Icon } from '@/design/components/Glyph'
import { Readout } from '@/design/components/Readout'
import { TextLink } from '@/design/components/TextLink'
import { Sheet } from '@/design/components/Sheet'
import { Bytes } from './Bytes'
import type { HeldChallenge } from './challenge'
import { RECEIPTS, REPORTS } from './copy'
import { SITE_DATA } from './credit'
import { canDefend } from './defend/registry'
import { stageOf } from './labs'
import { gpuLine } from './records'
import type { HeldReceipt } from './records'
import { RuleList, VerdictLine } from './Rules'
import { TokenText } from './TokenText'
import { formatWhen } from './when'

/*
 * One receipt, opened at /receipts#<sha256> (ARCHITECTURE §3.1, §9.6; W2-T06). It lays out what the receipt says: the run, where it ran,
 * the pins, the inputs and the artifacts it hashed, the checks that the grader ran, what the run claimed, and how the learner says they
 * worked. Everything is text: a receipt comes from a file, and its strings go on the page as strings (A§12).
 *
 * Nothing above the last part is a verdict. A figure is the grader's own, and prints with the tag `unverified` that a screen reader hears
 * and a single stamp that the eye reads, until this browser has recomputed it. The checks are the grader's attestations. How this browser
 * checked the receipt is its own section, the last: each check that the receipt has had, with the rules it ran and what they came to, and the verdict
 * check by check. Rules 1 to 6 are W2-T07's. Rules 7 to 9 (W2-T08) recompute what the run claimed from the raw records, and print the bound of each check.
 *
 * A receipt of a stage that can be defended (src/receipts/defend/registry.ts) has one more part, after the run: "Defend your receipt" (ASSESSMENT §7.2),
 * questions that only the run's own artifacts answer. Its code is a chunk of its own that loads with such a receipt, so the page carries none of it
 * otherwise; the part's head is drawn here, so the page does not move when the chunk comes.
 */

const Defend = lazy(() => import('./defend/Defend'))

/** "Defend your receipt": the part's head, and the step itself once its chunk has come. */
function DefendPart({ receipt, sha256, reports }: { receipt: Receipt; sha256: Sha256; reports: readonly VerificationReport[] }) {
  return (
    <section className="es-receipt__part es-defend-part" aria-labelledby="rc-defend" data-defend-part="">
      <h3 id="rc-defend" className="es-receipt__heading">
        {RECEIPTS.defend}
      </h3>
      <Suspense fallback={<p className="es-receipt__lead">{RECEIPTS.defendLoading}</p>}>
        <Defend receipt={receipt} sha256={sha256} reports={reports} />
      </Suspense>
    </section>
  )
}

const none = <span className="es-receipt__none">none</span>

/** A figure of the receipt as the grader reported it: through the readout, with the tag a number that nobody has checked carries. */
function Figure({ value, unit, digits }: { value: number; unit?: 'MB' | 'GB' | 'KB' | 'B' | 'ms' | 's' | 'tokens' | 'x' | '%'; digits?: number }) {
  const places = digits ?? Math.min(6, (String(value).split('.')[1] ?? '').length)
  return <Readout value={value} unit={unit} digits={places} tag="unverified" size="sm" />
}

const yes = (value: boolean): string => (value ? 'yes' : 'no')

function Facts({ rows }: { rows: readonly (readonly [label: string, value: ReactNode])[] }) {
  return (
    <dl className="es-facts">
      {rows.map(([label, value]) => (
        <div key={label} className="es-facts__row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A part of the receipt under its own heading. It is a block and not a landmark: a receipt has nine of them, and a reader lists landmarks to get about, not to hear the same page nine times. */
function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="es-receipt__part">
      <h3 className="es-receipt__heading">{title}</h3>
      {children}
    </div>
  )
}

interface Column<T> {
  name: string
  /** The cell's content, or null for a cell with nothing in it, which prints as `none` and is left off a narrow screen. */
  cell: (row: T) => ReactNode
}

/**
 * A table of the receipt's lists. Wide, it is a table. Narrow, each row prints as a block of its own: the row's header first, then each
 * cell after its column's name (the cell's `data-label`), as the mirror's table does (src/design/components.css), so nothing is cut off at
 * the paper's edge and nothing scrolls sideways. The column heads stay in the document for a screen reader, and the roles are written on
 * the elements, so it reads as a table in either layout.
 */
function DataTable<T>({ label, headName, head, columns, rows, rowKey }: { label: string; headName: string; head: (row: T) => ReactNode; columns: readonly Column<T>[]; rows: readonly T[]; rowKey: (row: T) => string }) {
  return (
    <table className="es-receipt__table" role="table" aria-label={label}>
      <thead role="rowgroup">
        <tr role="row">
          <th scope="col" role="columnheader">
            {headName}
          </th>
          {columns.map((column) => (
            <th key={column.name} scope="col" role="columnheader">
              {column.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody role="rowgroup">
        {rows.map((row) => (
          <tr key={rowKey(row)} role="row">
            <th scope="row" role="rowheader">
              {head(row)}
            </th>
            {columns.map((column) => {
              const content = column.cell(row)
              return (
                <td key={column.name} role="cell" data-label={column.name} data-empty={content === null || undefined}>
                  {content ?? none}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The state of the challenge a receipt names, in this ledger. */
function challengeLine(held: HeldChallenge | undefined, sha: Sha256): ReactNode {
  if (held === undefined) return 'This ledger holds no challenge with this token.'
  if (held.state === 'used') return held.usedBy === sha || held.usedBy === undefined ? 'Used by this receipt.' : `Used by receipt ${held.usedBy.slice(0, 8)}.`
  if (held.state === 'open') return 'Open: no receipt has used it yet.'
  return `Expired ${formatWhen(held.expiresAt)}.`
}

function mark(pass: boolean): ReactNode {
  return pass ? (
    <span className="es-receipt__result" data-pass>
      <Icon name="check" className="es-receipt__mark" />
      pass
    </span>
  ) : (
    <span className="es-receipt__result" data-fail>
      <Icon name="alert" className="es-receipt__mark" />
      fail
    </span>
  )
}

function Run({ receipt, sha256, challenge }: { receipt: Receipt; sha256: Sha256; challenge: HeldChallenge | undefined }) {
  const named = stageOf(receipt.stage)
  return (
    <Part title="The run">
      <Facts
        rows={[
          ['Lab', receipt.lab],
          ['Stage', named === undefined ? receipt.stage : `${receipt.stage}, ${named.name}`],
          ['Made', <time dateTime={receipt.createdAt}>{formatWhen(receipt.createdAt)}</time>],
          ['Receipt hash', <code className="es-receipt__hash">{sha256}</code>],
          [
            'Challenge',
            <span className="es-receipt__stack">
              <TokenText token={receipt.challenge.token} className="es-receipt__token" />
              <span>{challengeLine(challenge, sha256)}</span>
            </span>,
          ],
          [
            'Grader',
            <span className="es-receipt__stack">
              <span>
                {receipt.grader.name} {receipt.grader.version}
              </span>
              <code className="es-receipt__hash">{receipt.grader.sourceSha256}</code>
            </span>,
          ],
          ['How you worked', `assisted: ${receipt.provenance.assisted}; agent: ${yes(receipt.provenance.agent)}; guard: ${receipt.provenance.guard}. You declared this, and nothing checks it.`],
        ]}
      />
    </Part>
  )
}

function Environment({ receipt }: { receipt: Receipt }) {
  const { environment: env } = receipt
  const { host, driver, torch, engine, engineConfig } = env
  return (
    <Part title="Where it ran">
      <Facts
        rows={[
          ['Host', `${host.kind}, declared by the learner${host.container === undefined ? '' : host.container ? ', in a container' : ', not in a container'}`],
          ['System', [host.os, host.kernel, host.arch].filter(Boolean).join(', ') || none],
          [
            'Processor',
            host.cpu === undefined && host.cores === undefined && host.ramBytes === undefined ? (
              none
            ) : (
              <span className="es-receipt__inline">
                {host.cpu === undefined ? null : <span>{host.cpu}</span>}
                {host.cores === undefined ? null : (
                  <span>
                    <Figure value={host.cores} /> cores
                  </span>
                )}
                {host.ramBytes === undefined ? null : (
                  <span>
                    <Bytes value={host.ramBytes} /> of memory
                  </span>
                )}
              </span>
            ),
          ],
          ['GPUs', gpuLine(receipt)],
          ...(driver === undefined ? [] : ([['Driver', `${driver.version}${driver.cudaVersion === undefined ? '' : `, CUDA ${driver.cudaVersion}`}`]] as const)),
          ['Python', env.python],
          ['torch', `${torch.version}${torch.cuda === undefined ? ', no CUDA' : `, CUDA ${torch.cuda}`}${torch.cudnn === undefined ? '' : `, cuDNN ${torch.cudnn}`}`],
          ...(engine === undefined
            ? []
            : ([
                [
                  'Engine',
                  <span className="es-receipt__stack">
                    <span>
                      {engine.name} {engine.version}
                      {engine.commit === undefined ? '' : `, commit ${engine.commit.slice(0, 12)}`}
                    </span>
                    {engine.recordSha256 === undefined ? null : <code className="es-receipt__hash">RECORD {engine.recordSha256}</code>}
                  </span>,
                ],
              ] as const)),
          ...(engineConfig === undefined
            ? []
            : ([
                [
                  'What it ran with',
                  <span className="es-receipt__stack">
                    <span>
                      {engineConfig.runner}, graphs {engineConfig.graphMode}, async scheduling {engineConfig.asyncScheduling ? 'on' : 'off'}, attention {engineConfig.attentionBackend}
                    </span>
                    <span className="es-receipt__inline">
                      <span>
                        up to <Figure value={engineConfig.maxNumBatchedTokens} unit="tokens" /> a step
                      </span>
                      <span>
                        <Figure value={engineConfig.maxNumSeqs} /> sequences
                      </span>
                    </span>
                  </span>,
                ],
              ] as const)),
          ['Libraries', env.libs.length === 0 ? none : env.libs.map((lib) => `${lib.name} ${lib.version}`).join(', ')],
          ['Variables', Object.keys(env.envVars).length === 0 ? none : Object.entries(env.envVars).map(([name, value]) => `${name}=${value}`).join(', ')],
        ]}
      />
      {env.gpus.map((gpu, at) => (
        <Facts
          key={at}
          rows={[
            [`GPU ${at + 1}`, gpu.name],
            ['Memory', <Bytes value={gpu.memoryBytes} />],
            ...(gpu.computeCapability === undefined ? [] : ([['Compute capability', gpu.computeCapability]] as const)),
            ...(gpu.smCount === undefined ? [] : ([['Multiprocessors', <Figure value={gpu.smCount} />]] as const)),
            ...(gpu.maxSmClockMhz === undefined && gpu.maxMemClockMhz === undefined
              ? []
              : ([
                  [
                    'Clocks',
                    <span className="es-receipt__inline">
                      {gpu.maxSmClockMhz === undefined ? null : (
                        <span>
                          cores <Figure value={gpu.maxSmClockMhz} /> MHz
                        </span>
                      )}
                      {gpu.maxMemClockMhz === undefined ? null : (
                        <span>
                          memory <Figure value={gpu.maxMemClockMhz} /> MHz
                        </span>
                      )}
                    </span>,
                  ],
                ] as const)),
            ...(gpu.powerLimitMw === undefined ? [] : ([['Power limit', <span className="es-receipt__inline"><Figure value={gpu.powerLimitMw / 1000} /> W</span>]] as const)),
            ...(gpu.pcieGen === undefined ? [] : ([['PCIe', `generation ${gpu.pcieGen}${gpu.pcieWidth === undefined ? '' : `, ${gpu.pcieWidth} lanes`}`]] as const)),
            ['Modes', [gpu.mig === undefined ? null : `MIG ${gpu.mig}`, gpu.ecc === undefined ? null : `ECC ${gpu.ecc}`, gpu.virtualization === undefined ? null : `virtualization ${gpu.virtualization}`].filter(Boolean).join(', ') || none],
          ]}
        />
      ))}
    </Part>
  )
}

function Pins({ receipt }: { receipt: Receipt }) {
  const { pins } = receipt
  return (
    <Part title="Pins">
      <Facts
        rows={[
          ['On the pins', pins.onPin ? 'yes: the engine and its libraries are the ones the course pins' : `no: ${pins.offPin.join(', ')} are off the pins, and the run is shown and labelled`],
          ['Course lock', <code className="es-receipt__hash">{pins.lockSha256}</code>],
          ['Environment lock', <code className="es-receipt__hash">{pins.envLockSha256}</code>],
        ]}
      />
    </Part>
  )
}

function Files({ receipt }: { receipt: Receipt }) {
  return (
    <>
      <Part title="Inputs">
        {receipt.inputs.length === 0 ? (
          <p className="es-receipt__empty">{none}</p>
        ) : (
          <DataTable
            label="Inputs of the run"
            headName="Name"
            rows={receipt.inputs}
            rowKey={(input) => input.name}
            head={(input) => (
              <>
                {input.name}
                {input.revision === undefined ? null : <span className="es-receipt__sub">revision {input.revision}</span>}
              </>
            )}
            columns={[
              { name: 'Kind', cell: (input) => input.kind },
              { name: 'Size', cell: (input) => <Bytes value={input.bytes} /> },
              { name: 'SHA-256', cell: (input) => <code className="es-receipt__hash">{input.sha256}</code> },
            ]}
          />
        )}
      </Part>
      <Part title="Artifacts">
        {receipt.artifacts.length === 0 ? (
          <p className="es-receipt__empty">{none}</p>
        ) : (
          <DataTable
            label="Artifacts of the run"
            headName="Id"
            rows={receipt.artifacts}
            rowKey={(artifact) => artifact.id}
            head={(artifact) => (
              <>
                {artifact.id}
                <span className="es-receipt__sub">{artifact.format}</span>
              </>
            )}
            columns={[
              { name: 'Kind', cell: (artifact) => artifact.kind },
              { name: 'Size', cell: (artifact) => <Bytes value={artifact.bytes} /> },
              { name: 'In the bundle', cell: (artifact) => (artifact.inBundle ? 'yes' : 'no: kept by the learner') },
              { name: 'SHA-256', cell: (artifact) => <code className="es-receipt__hash">{artifact.sha256}</code> },
            ]}
          />
        )}
      </Part>
    </>
  )
}

function Checks({ receipt }: { receipt: Receipt }) {
  return (
    <Part title="What the grader checked">
      <p className="es-receipt__lead">These are the grader&apos;s own results. This browser re-runs the ones it can, and the part at the foot of the page lists them with their bounds.</p>
      {receipt.checks.length === 0 ? (
        <p className="es-receipt__empty">{none}</p>
      ) : (
        <DataTable
          label="Checks that the grader ran"
          headName="Check"
          rows={receipt.checks}
          rowKey={(check) => check.id}
          head={(check) => (
            <>
              {check.id}
              <span className="es-receipt__sub">{check.kind}</span>
              {check.detail === '' ? null : <span className="es-receipt__sub es-receipt__detail">{check.detail}</span>}
            </>
          )}
          columns={[
            { name: 'Result', cell: (check) => mark(check.pass) },
            { name: 'Value', cell: (check) => (check.value === undefined ? null : <Figure value={check.value} />) },
            { name: 'Bound', cell: (check) => (check.bound === undefined ? null : <Figure value={check.bound} />) },
            { name: 'Tolerance', cell: (check) => (check.tolerance === undefined ? null : <Figure value={check.tolerance} />) },
            { name: 'Samples', cell: (check) => (check.n === undefined ? null : <Figure value={check.n} />) },
          ]}
        />
      )}
    </Part>
  )
}

/** What a run claimed, one key at a time: a number through the readout, a word as a word, and anything else as its JSON, cut short. */
function claimedValue(value: unknown): ReactNode {
  if (typeof value === 'number' && Number.isFinite(value)) return <Figure value={value} />
  if (typeof value === 'string') return value.length > 160 ? `${value.slice(0, 157)}...` : value
  if (typeof value === 'boolean') return yes(value)
  const text = JSON.stringify(value) ?? String(value)
  return <code>{text.length > 160 ? `${text.slice(0, 157)}...` : text}</code>
}

/** How many keys of a claim are laid out [estimated]: the schema bounds every list of a receipt but this one, whose keys are the grader's own. */
const CLAIMED_SHOWN = 40

function Claimed({ receipt }: { receipt: Receipt }) {
  if (receipt.performance === undefined) return null
  const entries = Object.entries(receipt.performance.claimed)
  return (
    <Part title="What the run claimed">
      <p className="es-receipt__lead">
        A {receipt.performance.kind} run. A claim is never trusted: this browser recomputes it from the raw records, and prints what it finds.
      </p>
      {entries.length === 0 ? (
        <p className="es-receipt__empty">{none}</p>
      ) : (
        <Facts rows={entries.slice(0, CLAIMED_SHOWN).map(([key, value]) => [key, claimedValue(value)] as const)} />
      )}
      {entries.length > CLAIMED_SHOWN ? (
        <p className="es-receipt__lead">
          And <Readout value={entries.length - CLAIMED_SHOWN} tag="unverified" size="sm" /> more keys, which are not laid out here.
        </p>
      ) : null}
    </Part>
  )
}

function Notes({ receipt }: { receipt: Receipt }) {
  if (receipt.notes === undefined || receipt.notes === '') return null
  return (
    <Part title="Notes">
      <p className="es-receipt__notes">{receipt.notes}</p>
    </Part>
  )
}

/** One check of the receipt: when it was made, the rules it ran, and what they came to. The newest is open, and an earlier one folds. */
function Check({ report, newest, receipt }: { report: VerificationReport; newest: boolean; receipt: Receipt }) {
  const read = readStoredReport(report.report)
  const heading = (
    <>
      Checked <time dateTime={report.at}>{formatWhen(report.at)}</time>
    </>
  )
  if (read === null) {
    return (
      <li className="es-receipt__check">
        <p>
          {heading}. {REPORTS.unreadable}
        </p>
      </li>
    )
  }
  const body = (
    <>
      {read.ran < RULES_IN_ALL ? (
        <p className="es-receipt__lead">
          <Readout value={read.ran} tag="measured" size="sm" /> of the ten verification rules ran in this check, because an earlier version of the site made it. Bring the receipt&apos;s file back, and
          all of them run.
        </p>
      ) : null}
      <RuleList rules={rulesOnRead(receipt, read, SITE_DATA)} label={`How this browser checked the receipt, ${formatWhen(report.at)}`} checks={false} />
      <VerdictLine verdict={verdictOfStored(receipt, read, SITE_DATA)} grader={receipt.grader.version} />
    </>
  )
  return newest ? (
    <li className="es-receipt__check">
      <p>{heading}</p>
      {body}
    </li>
  ) : (
    <li>
      <details className="es-receipt__earlier">
        <summary>{heading}</summary>
        {body}
      </details>
    </li>
  )
}

function Reports({ reports, receipt }: { reports: readonly VerificationReport[]; receipt: Receipt }) {
  const newestFirst = [...reports].sort((a, b) => (a.at < b.at ? 1 : -1))
  return (
    <Part title={REPORTS.title}>
      {newestFirst.length === 0 ? (
        <p className="es-receipt__lead">{REPORTS.none}</p>
      ) : (
        <ul className="es-receipt__checks">
          {newestFirst.map((report, at) => (
            <Check key={`${report.at}#${at}`} report={report} newest={at === 0} receipt={receipt} />
          ))}
        </ul>
      )}
    </Part>
  )
}

/** A record that is not a receipt this build can read: its hash, and why. */
export function UnreadableReceipt({ held }: { held: Extract<HeldReceipt, { ok: false }> }) {
  return (
    <Sheet as="article" width="full" title={RECEIPTS.unreadable} titleAs="h2" foot={[`Record ${held.sha256.slice(0, 8)}`]} className="es-receipt" aria-label={`Record ${held.sha256.slice(0, 8)}, not a receipt this build can read`} tabIndex={-1} data-opened="" data-readable="false">
      <p>This record is in your ledger, and it is not a receipt of the format this build reads, so it is not shown. Its first problems were:</p>
      <p className="es-receipt__problem">
        <Icon name="alert" className="es-receipt__mark" />
        <span>{held.problem}</span>
      </p>
      <p>
        Hash <code className="es-receipt__hash">{held.sha256}</code>
      </p>
    </Sheet>
  )
}

/** One receipt, laid out. Exported for the tests. */
export function ReceiptDetail({ held, challenges }: { held: Extract<HeldReceipt, { ok: true }>; challenges: readonly HeldChallenge[] }) {
  const { receipt, sha256, reports } = held
  const challenge = challenges.find((entry) => entry.token === receipt.challenge.token)
  return (
    <Sheet
      as="article"
      width="full"
      title={receipt.stage}
      titleAs="h2"
      foot={[`Receipt ${sha256.slice(0, 8)}`, `made ${formatWhen(receipt.createdAt)}`]}
      className="es-receipt"
      aria-label={`Receipt for ${receipt.stage}`}
      tabIndex={-1}
      data-opened=""
      data-readable="true"
    >
      <p className="es-receipt__stamp">Reported by the grader{reports.length === 0 ? ', not checked here' : ''}</p>
      <Run receipt={receipt} sha256={sha256} challenge={challenge} />
      {canDefend(receipt.stage) ? <DefendPart receipt={receipt} sha256={sha256} reports={reports} /> : null}
      <Environment receipt={receipt} />
      <Pins receipt={receipt} />
      <Files receipt={receipt} />
      <Checks receipt={receipt} />
      <Claimed receipt={receipt} />
      <Notes receipt={receipt} />
      <Reports reports={reports} receipt={receipt} />
    </Sheet>
  )
}

/** The way back to the lists. */
export function BackLink() {
  return (
    <p className="es-receipt__back">
      <TextLink to="/receipts">{RECEIPTS.back}</TextLink>
    </p>
  )
}
