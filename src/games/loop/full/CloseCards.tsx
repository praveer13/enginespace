import type { ReactNode } from 'react'
import type { CloseCards as Cards, FullView } from '@es/play/loop/full/types'
import { Readout } from '@/design/components/Readout'
import { Ticket } from '@/design/components/Ticket'
import { tagOf } from './tags'

/*
 * The cards of `close` (GAMES.md §3.2: "the configuration is chosen from the cards before a single run"): the four slips the learner works
 * the configuration from, printed under the view in place of the live readouts that a graded level hides. Each is the model's own
 * arithmetic on the seed's draws, and none is a reading of a run: the night's tickets, what the line charges for a fire, what the expo
 * charges tonight, and the backend and the room the reach-in has for routines. Every figure is a Readout with its tag (D-048): the
 * workload and the small model's line are synthetic, the 70B line is derived from S5's fit, the expo's µs are estimated, and the graph
 * memory model is estimated. Words come in pairs, the kitchen's and the engine's (GAMES.md §2.6, rule 2).
 */

const SUPPORT_WORDS: Readonly<Record<Cards['support'], string>> = {
  ALWAYS: 'it can replay a whole graph for any batch',
  UNIFORM_BATCH: 'it replays a whole graph only for a uniform batch, such as a plain decode',
  UNIFORM_SINGLE_TOKEN_DECODE: 'it replays a whole graph only for a decode of one token a row',
  NEVER: 'it replays no whole graph',
}

// The Readout's units are decimal: the graph memory model's 8 MiB is 8.389 MB, and 16 KiB is 16.384 KB.
const MB = 1e6
const KB = 1e3

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="es-close-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** Two figures of one row, the V2 runner's and the legacy runner's, each under its own name, so that a pair of equal figures is not read as one. */
function Pair({ mrv2, v1 }: { mrv2: ReactNode; v1: ReactNode }) {
  return (
    <>
      <span className="es-close-pair">
        <span className="text-text-2">MRV2</span> {mrv2}
      </span>
      <span className="es-close-pair">
        <span className="text-text-2">V1</span> {v1}
      </span>
    </>
  )
}

function Card({ head, title, children }: { head: string; title: string; children: ReactNode }) {
  return (
    <Ticket as="section" width="full" hole={false} compact head={head} titleAs="h4" title={title}>
      <dl className="es-close-card">{children}</dl>
    </Ticket>
  )
}

export function CloseCards({ view }: { view: FullView }) {
  const cards = view.stage.cards
  if (cards === null) return null
  const line = tagOf(view, 'line')
  const expo = tagOf(view, 'expo')
  const model = tagOf(view, 'count')
  const range = (pair: readonly [number, number], unit: 'tokens') => (
    <>
      <Readout value={pair[0]} unit={unit} tag="synthetic" size="sm" /> to <Readout value={pair[1]} unit={unit} tag="synthetic" size="sm" />
    </>
  )
  return (
    <div className="es-close-cards" data-close-cards="">
      <Card head="Card 1" title="Tonight's tickets">
        <Row label={<>Tickets, all due at once <span className="text-text-2">· a burst</span></>}>
          <Readout value={cards.requests} unit="requests" tag="synthetic" size="sm" />
        </Row>
        <Row label="Prompt of each">{range(cards.prompts, 'tokens')}</Row>
        <Row label="Courses each table asks for">{range(cards.outputs, 'tokens')}</Row>
        <Row label={<>The rail <span className="text-text-2">· max_num_seqs</span></>}>
          <Readout value={cards.slots} unit="slots" tag="synthetic" size="sm" />
        </Row>
        <Row label={<>Most a fire carries <span className="text-text-2">· max_num_batched_tokens</span></>}>
          <Readout value={cards.budget} unit="tokens" tag="synthetic" size="sm" />
        </Row>
      </Card>
      <Card head="Card 2" title="What the line charges">
        <Row label="The model's layers">
          <Readout value={cards.layers} tag={model} size="sm" />
        </Row>
        {cards.decodeUs.map((row) => (
          <Row key={row.rows} label={<>A decode fire of {row.rows} {row.rows === 1 ? 'row' : 'rows'}, at a context of {cards.context} tokens</>}>
            <Readout value={row.us} unit="µs" tag={line} size="sm" />
          </Row>
        ))}
        <Row label="A fire that fills the budget with one prompt's chunk">
          <Readout value={cards.fullBudgetUs} unit="µs" tag={line} size="sm" />
        </Row>
      </Card>
      <Card head="Card 3" title="What the expo charges tonight">
        <Row label={<>Launching one kernel <span className="text-text-2">· both runners</span></>}>
          <Readout value={cards.launchUs} unit="µs" tag={expo} size="sm" />
        </Row>
        <Row label="Kernels in a layer, launched one by one">
          <Readout value={cards.kernels} tag={expo} size="sm" />
        </Row>
        <Row label="Every kernel of a fire, one by one">
          <Readout value={cards.eagerLaunchUs} unit="µs" tag="derived" size="sm" />
        </Row>
        <Row label="Replaying one graph">
          <Readout value={cards.replayUs} unit="µs" tag={expo} size="sm" />
        </Row>
        <Row label="Writing the next call">
          <Pair
            mrv2={<Readout value={cards.mrv2.scheduleBaseUs} unit="µs" tag={expo} size="sm" />}
            v1={<Readout value={cards.v1.scheduleBaseUs} unit="µs" tag={expo} size="sm" />}
          />
        </Row>
        <Row label={<span className="text-text-2">and, for each sequence</span>}>
          <Pair
            mrv2={<Readout value={cards.mrv2.schedulePerSeqUs} unit="µs" tag={expo} size="sm" />}
            v1={<Readout value={cards.v1.schedulePerSeqUs} unit="µs" tag={expo} size="sm" />}
          />
        </Row>
        <Row label="Preparing the inputs, a token">
          <Pair
            mrv2={<Readout value={cards.mrv2.prepPerTokenUs} unit="µs" tag={expo} size="sm" />}
            v1={<Readout value={cards.v1.prepPerTokenUs} unit="µs" tag={expo} size="sm" />}
          />
        </Row>
        <Row label="Reading the fire back">
          <Pair
            mrv2={<Readout value={cards.mrv2.syncUs} unit="µs" tag={expo} size="sm" />}
            v1={<Readout value={cards.v1.syncUs} unit="µs" tag={expo} size="sm" />}
          />
        </Row>
        <Row label={<span className="text-text-2">and, for each sequence</span>}>
          <Pair
            mrv2={<Readout value={cards.mrv2.samplePerSeqUs} unit="µs" tag={expo} size="sm" />}
            v1={<Readout value={cards.v1.samplePerSeqUs} unit="µs" tag={expo} size="sm" />}
          />
        </Row>
      </Card>
      <Card head="Card 4" title="The backend and the reach-in">
        <Row label={<>The attention backend's graph support <span className="text-text-2">· </span><code>{cards.support}</code></>}>
          <span className="es-close-words">{SUPPORT_WORDS[cards.support]}.</span>
        </Row>
        <Row label="A drilled routine takes">
          <Readout value={cards.graphBaseBytes / MB} unit="MB" digits={3} tag="estimated" size="sm" />
        </Row>
        <Row label={<span className="text-text-2">and, for each token of its size</span>}>
          <Readout value={cards.graphTokenBytes / KB} unit="KB" digits={3} tag="estimated" size="sm" />
        </Row>
        <Row label={<>The reach-in can spare for routines <span className="text-text-2">· before its pans are counted</span></>}>
          <Readout value={cards.roomBytes / MB} unit="MB" digits={3} tag="estimated" size="sm" />
        </Row>
      </Card>
    </div>
  )
}
