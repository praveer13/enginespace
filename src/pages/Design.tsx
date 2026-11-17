import { useState, type ReactNode } from 'react'
import '@/design/specimens.css'
import { contrastRatio } from '@/design/contrast'
import { Bell } from '@/design/components/Bell'
import { Header, MenuLink } from '@/design/components/Header'
import { Button } from '@/design/components/Button'
import { Callout } from '@/design/components/Callout'
import { DeltaChip } from '@/design/components/DeltaChip'
import { Field } from '@/design/components/Field'
import { GoalLine } from '@/design/components/GoalLine'
import { Legend } from '@/design/components/Legend'
import { LevelMenu, type LevelOption } from '@/design/components/LevelMenu'
import { Marker } from '@/design/components/Marker'
import { NextStep } from '@/design/components/NextStep'
import { Note } from '@/design/components/Note'
import { NumberLine } from '@/design/components/NumberLine'
import { PartsList, type PartRow } from '@/design/components/PartsList'
import { Popover } from '@/design/components/Popover'
import { SectionRail, type RailSection } from '@/design/components/SectionRail'
import { Stamp } from '@/design/components/Stamp'
import { TitleBlock } from '@/design/components/TitleBlock'
import { Glyph, Icon, type IconName } from '@/design/components/Glyph'
import { Pan } from '@/design/components/Pan'
import { ReadoutStrip } from '@/design/components/ReadoutStrip'
import { Rail } from '@/design/components/Rail'
import { Readout } from '@/design/components/Readout'
import { StationLight } from '@/design/components/StationLight'
import { PrimaryButton } from '@/design/components/PrimaryButton'
import { Label } from '@/design/components/Label'
import { TextLink } from '@/design/components/TextLink'
import { Sheet, SheetLine } from '@/design/components/Sheet'
import { Toggle } from '@/design/components/Toggle'
import { SceneSpecimen } from '@/scene/SceneSpecimen'
import { effectiveMotion } from '@/settings/rules'
import { useSettings, useSystemReducedMotion } from '@/settings/useSettings'
import {
  cssVar,
  fontVar,
  MEMORY_STATES,
  PAIRS,
  ROLE_GROUPS,
  resolveColor,
  roleOf,
  rolesIn,
  SCHEME_NAMES,
  SCHEMES,
  SLOT_MARKS,
  SLOTS,
  slotOf,
  type ColorRoleName,
  type RoleName,
} from '@/design/tokens'

/*
 * /design: the design system's own page (ARCHITECTURE §3.1). It lists every token role in src/design/tokens.ts with its
 * value, the declared contrast pairs with their ratios, every component in each of its states, the motion roles at work, and
 * the scene kit on one pass. Each motion and each scene stands beside its 2D twin: the curve a motion draws, the SVG a scene
 * falls back to. Every value here is read from tokens.ts, never written into this page.
 */

const ICON_NAMES: IconName[] = ['arrow', 'alert', 'check', 'lock', 'pin', 'hash', 'external', 'strike']
const FORCED = ['hover', 'focus', 'active'] as const

export function Component() {
  return (
    <div className="es-spec">
      <header className="es-spec__intro">
        <h1>Design system</h1>
        <p className="es-prose">
          Data Book: the engine drawn as engineers already draw it, on flat paper, with one amber mark that means now. The ground is flat, the text
          you read and every diagram sit on paper, focus is ink, and six fills, each with its glyph, are the one colour code. Every role below
          reaches a CSS variable, a Tailwind key and the scenes, and pages use nothing else.
        </p>
      </header>

      <section aria-labelledby="roles" className="es-spec__section">
        <h2 id="roles">Roles</h2>
        {ROLE_GROUPS.map((group) => (
          <RoleGroup key={group.id} id={group.id} title={group.title} names={rolesIn(group.id)} />
        ))}
      </section>

      <section aria-labelledby="contrast" className="es-spec__section">
        <h2 id="contrast">Contrast</h2>
        <p className="es-prose">
          Every pair a component may draw, in every scheme the system ships, against WCAG 2.2 AA as ARCHITECTURE §11.2 sets it: 4.5:1 for text and 3:1
          for large text and marks. Each ratio is computed from the values above.
        </p>
        <ContrastList />
      </section>

      <section aria-labelledby="components" className="es-spec__section">
        <h2 id="components">Components</h2>
        <p className="es-prose">
          First the parts a lesson and an instrument are made of: the marker, the callouts and the parts list, the legend, the notes, the
          popover and the stamp, the title block, the section rail, the level menu, the goal line, the delta, the number line and the way
          on. Each is shown in its states, and each works by keyboard. Then the components every page is drawn with today.
        </p>
        <PartSpecimens />
        <ComponentSpecimens />
      </section>

      <section aria-labelledby="motion" className="es-spec__section">
        <h2 id="motion">Motion</h2>
        <p className="es-prose">
          Everything on the pass moves on the bell, and between bells only the printer feeds. Ring it, and each of the four motions below runs once with
          its own duration and its own easing, so the quick press is done before the course has left the pass. Nothing moves until you ring. Beside each
          is its twin: the curve it follows, which is all there is to see when motion is reduced.
        </p>
        <MotionBoard />
      </section>

      <section aria-labelledby="scene-kit" className="es-spec__section">
        <h2 id="scene-kit">Scene kit</h2>
        <p className="es-prose">
          The parts every 3D game is built from, on the lanes: the step-loop model&apos;s own run of a short service, drawn as matte slabs on flat ground
          under one key light, beside its 2D twin. Run the next step, turn overlap on, switch to the long run, and the tape prints what this browser measures.
        </p>
        <SceneSpecimen />
      </section>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------ roles

/**
 * A group named by its own heading, and not a region: a region is a landmark, and a landmark needs a name that no other landmark on the
 * page has (the page's own "Motion" section is one, which is what axe's landmark-unique found). Fourteen lists of roles are not places
 * to navigate by landmark, and the headings already are.
 */
function RoleGroup({ id, title, names }: { id: string; title: string; names: RoleName[] }) {
  const headingId = `roles-${id}`
  return (
    <div className="es-spec__group" role="group" aria-labelledby={headingId}>
      <h3 className="es-spec__group-title" id={headingId}>
        {title}
      </h3>
      <ul className="es-spec__roles">
        {names.map((name) => (
          <RoleEntry key={name} name={name} />
        ))}
      </ul>
    </div>
  )
}

function RoleEntry({ name }: { name: RoleName }) {
  const role = roleOf(name)
  return (
    <li className="es-spec__role" data-kind={role.kind} data-role={name}>
      <RoleSample name={name} />
      <span className="es-spec__role-text">
        <code className="es-spec__role-name">{name}</code>
        <code className="es-spec__role-var">{cssVar(name)}</code>
        <RoleValue name={name} />
        <span className="es-spec__role-note">{role.note}</span>
      </span>
    </li>
  )
}

function RoleValue({ name }: { name: RoleName }) {
  const role = roleOf(name)
  if (role.kind === 'color') {
    const color = name as ColorRoleName
    const light = resolveColor(color)
    const others = SCHEME_NAMES.filter((scheme) => scheme !== 'light' && resolveColor(color, scheme) !== light)
    return (
      <span className="es-spec__role-value">
        <code>{light}</code>
        {typeof role.value === 'string' ? null : <span> = {role.value.ref}</span>}
        {others.map((scheme) => (
          <span key={scheme} className="es-spec__role-scheme">
            {SCHEMES[scheme].label}: <code>{resolveColor(color, scheme)}</code>
          </span>
        ))}
      </span>
    )
  }
  if (role.kind === 'font') {
    return (
      <span className="es-spec__role-value">
        <code>{role.family.join(', ')}</code>
        <span className="es-spec__role-scheme">
          <code>{role.size}</code> / <code>{role.leading}</code>, weight <code>{role.weight}</code>, tracking <code>{role.tracking}</code>
          {role.case === 'uppercase' ? ', capitals' : ''}
        </span>
      </span>
    )
  }
  return (
    <span className="es-spec__role-value">
      <code className="es-spec__long-value">{role.value}</code>
      {role.kind === 'duration' ? <span className="es-spec__role-scheme">0ms under reduced motion</span> : null}
    </span>
  )
}

/** A role drawn as the object it is: steel as a plate, paper as a ticket corner, the code as a cutting board. */
function RoleSample({ name }: { name: RoleName }) {
  const role = roleOf(name)
  const variable = `var(${cssVar(name)})`
  if (role.kind === 'color') {
    const slot = slotOf(name as ColorRoleName)
    const isBoard = role.group === 'categorical' && /^cat-[a-z]+$/.test(name)
    if (slot && (isBoard || role.group === 'lane' || role.group === 'memory' || role.group === 'probability')) {
      return (
        <span className="es-spec__board" style={{ background: variable, borderColor: `var(--es-cat-${slot}-edge)` }} aria-hidden="true">
          <Glyph shape={SLOT_MARKS[slot].glyph} className="es-spec__board-glyph" style={{ color: `var(--es-cat-${slot}-ink)` }} />
        </span>
      )
    }
    return <span className="es-spec__swatch" data-group={role.group} style={{ background: variable }} aria-hidden="true" />
  }
  if (role.kind === 'font') {
    const sample =
      name === 'font-numeric'
        ? '0123 µs'
        : name === 'font-ticket'
          ? '2x FIRE'
          : name === 'font-label'
            ? 'grp 2'
            : name === 'font-mono'
              ? 'step()'
              : 'Fire'
    return (
      <span
        className="es-spec__type"
        aria-hidden="true"
        style={{
          fontFamily: variable,
          fontWeight: `var(${fontVar(name, 'weight')})`,
          letterSpacing: `var(${fontVar(name, 'tracking')})`,
          textTransform: role.case,
        }}
      >
        {sample}
      </span>
    )
  }
  if (role.kind === 'size')
    return (
      <span className="es-spec__size" style={{ fontSize: variable }} aria-hidden="true">
        Aa
      </span>
    )
  if (role.kind === 'shadow') return <span className="es-spec__shadow" style={{ boxShadow: variable }} aria-hidden="true" />
  if (role.kind === 'texture')
    return <span className="es-spec__swatch es-spec__swatch--texture" style={{ backgroundImage: variable }} aria-hidden="true" />
  if (role.kind === 'radius') return <span className="es-spec__radius" style={{ borderRadius: variable }} aria-hidden="true" />
  if (role.kind === 'space') return <span className="es-spec__space" style={{ width: variable }} aria-hidden="true" />
  if (role.kind === 'easing') return <EasingCurve value={role.value} />
  return (
    <span className="es-spec__duration" aria-hidden="true">
      <span style={{ animationDuration: variable }} />
    </span>
  )
}

/** An easing drawn as its curve: progress against time. */
function EasingCurve({ value }: { value: string }) {
  const bezier = /cubic-bezier\(([^)]+)\)/.exec(value)
  const steps = /steps\((\d+)/.exec(value)
  let path = 'M0 40 L40 0'
  if (bezier) {
    const [x1, y1, x2, y2] = bezier[1].split(',').map((part) => Number(part.trim()))
    path = `M0 40 C${x1 * 40} ${40 - y1 * 40} ${x2 * 40} ${40 - y2 * 40} 40 0`
  } else if (steps) {
    const count = Number(steps[1])
    const width = 40 / count
    const stairs = Array.from(
      { length: count },
      (_, index) => `L${index * width} ${40 - ((index + 1) * 40) / count} L${(index + 1) * width} ${40 - ((index + 1) * 40) / count}`,
    )
    path = `M0 40 ${stairs.join(' ')}`
  }
  return (
    <svg className="es-spec__easing" viewBox="-4 -14 48 60" aria-hidden="true" focusable="false">
      <path className="es-spec__easing-axes" d="M0 0 V40 H40" />
      <path className="es-spec__easing-curve" d={path} />
    </svg>
  )
}

// ------------------------------------------------------------------------------------------------ contrast

function ContrastList() {
  return (
    <ul className="es-spec__pairs">
      {PAIRS.map((pair) => (
        <li key={`${pair.fg}/${pair.bg}`} className="es-spec__pair">
          <span
            className="es-spec__pair-sample"
            style={{ background: `var(${cssVar(pair.bg)})`, color: `var(${cssVar(pair.fg)})` }}
            aria-hidden="true"
          >
            {pair.kind === 'text' ? 'Aa' : <span className="es-spec__pair-mark" style={{ background: `var(${cssVar(pair.fg)})` }} />}
          </span>
          <span className="es-spec__pair-text">
            <span className="es-spec__pair-name">
              <code>{pair.fg}</code> on <code>{pair.bg}</code>
            </span>
            <span className="es-spec__pair-use">
              {pair.use}, {pair.kind}
            </span>
          </span>
          <span className="es-spec__pair-ratios">
            {SCHEME_NAMES.map((scheme) => (
              <span key={scheme} className="es-spec__pair-ratio">
                <span className="es-spec__pair-scheme">{SCHEMES[scheme].label}</span>
                <Readout
                  value={contrastRatio(resolveColor(pair.fg, scheme), resolveColor(pair.bg, scheme))}
                  digits={2}
                  unit=":1"
                  tag="derived"
                  size="sm"
                />
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  )
}

// ------------------------------------------------------------------------------------------------ components

function Specimen({ title, about, children, wide = false }: { title: string; about: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <section className="es-spec__component" data-wide={wide || undefined} aria-label={title}>
      <h3 className="es-spec__component-title">{title}</h3>
      <p className="es-spec__component-about es-prose">{about}</p>
      <div className="es-spec__states">{children}</div>
    </section>
  )
}

function State({
  label,
  children,
  ground = 'steel',
  span = false,
}: {
  label: string
  children: ReactNode
  ground?: 'steel' | 'paper'
  span?: boolean
}) {
  return (
    <figure className="es-spec__state" data-ground={ground} data-span={span || undefined}>
      <div className="es-spec__state-stage">{children}</div>
      <figcaption className="es-spec__state-label">{label}</figcaption>
    </figure>
  )
}

function railTicket(key: string, head: string, qty: string, item: string) {
  return (
    <Sheet key={key} head={head} compact hole={false} width="full">
      <SheetLine qty={qty}>{item}</SheetLine>
    </Sheet>
  )
}

// ------------------------------------------------------------------------------------------------ the lesson's and the instrument's parts

const STATES = ['default', ...FORCED] as const
const forced = (state: (typeof STATES)[number]) => (state === 'default' ? undefined : state)

const POOL_PARTS: PartRow[] = [
  { id: 'pool', name: 'KV page pool', sentence: 'The GPU memory set aside for the KV cache, cut into pages of one size. vLLM’s class for it is BlockPool.' },
  { id: 'page', name: 'page', sentence: 'Holds the keys and values of a fixed number of tokens for one request.' },
  { id: 'request', name: 'request', sentence: 'A conversation waiting for pages. Its tokens decide how many it needs.' },
  { id: 'cached', name: 'cached page', sentence: 'A page no request holds that still keeps its tokens, so a request with the same prefix can reuse it.', isNew: true },
  { id: 'blocks', name: 'num_gpu_blocks', code: true, sentence: 'How many pages the pool holds, as vLLM’s cache config names it.' },
]

const POOL_LEVELS: LevelOption[] = [
  { id: 'one-group', title: 'One KV group', mode: 'practice' },
  { id: 'two-kinds', title: 'Two kinds of KV cache', mode: 'practice' },
  { id: 'evict', title: 'Evict the right pages', mode: 'graded' },
  { id: 'same-size', title: 'One page size', mode: 'practice' },
  { id: 'adapters', title: 'Adapter pages', mode: 'graded' },
  { id: 'manager', title: 'The whole manager', mode: 'graded', unavailable: true },
]

const LESSON = '/m/tr5a/l1-why-one-model-needs-several-kv-caches'
const RAIL: RailSection[] = [
  { id: 'run', title: 'Run', href: '#run', state: 'done', answers: ['you said 300 pages', 'recomputed 93 tokens, reference 93'] },
  {
    id: 'read',
    title: 'Read',
    href: '#read',
    parts: [
      { id: 'read-1', title: 'Two kinds of layer', href: '#two-kinds-of-layer', seen: true },
      { id: 'read-2', title: 'The gap, and its name', href: '#the-gap' },
      { id: 'read-3', title: 'Two kinds of KV cache', href: '#two-kinds', run: true },
    ],
  },
  { id: 'test', title: 'Test', href: '#test', state: '1 of 3: not yet' },
  { id: 'keep', title: 'Keep', href: '#keep' },
]

/** A strip of paper with a baseline, for the marker's "now" cursor to stand on. */
function Plot({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        position: 'relative',
        display: 'block',
        width: '100%',
        height: '4rem',
        marginTop: 'var(--es-space-6)',
        borderBottom: '2px solid var(--es-text-1)',
      }}
    >
      {children}
    </span>
  )
}

/** Room under an open popover, so its sheet sits inside its own specimen. */
function Room({ children, height }: { children: ReactNode; height: string }) {
  return <div style={{ minHeight: height, width: '100%' }}>{children}</div>
}

function PartSpecimens() {
  const [selected, setSelected] = useState('page')
  const [served, setServed] = useState({ count: 12, delta: 0, key: 0 })
  const [level, setLevel] = useState('one-group')
  return (
    <div className="es-spec__components" data-parts="">
      <Specimen
        title="Marker"
        about="Amber means now, and nothing else. It is always the amber with its dark edge, a shape and a word: a pennant in a rail, a cursor on a diagram, or a ring on the one control an intro points at."
      >
        <State label="mark, the current place" ground="paper">
          <Marker />
        </State>
        <State label="cursor, the current tick on a diagram" ground="paper">
          <Plot>
            <Marker kind="cursor" at={0.6} />
          </Plot>
        </State>
        <State label="ring, the first move pointed at">
          <Marker kind="ring" word="your first move">
            <Button variant="ink">Admit</Button>
          </Marker>
        </State>
      </Specimen>

      <Specimen
        title="Callout"
        about="An ink disc with a numeral, laid on a diagram's object in a game's first run. The parts list in the dock carries the same numerals, so the number links the drawing and the words. Selecting one opens its part."
      >
        <State label="still, on a drawing" ground="paper">
          <Callout n={1} name="KV page pool" />
          <Callout n={2} name="page" />
        </State>
        {STATES.map((state) => (
          <State key={state} label={state} ground="paper">
            <Callout n={3} name="request" onSelect={() => undefined} data-force={forced(state)} />
          </State>
        ))}
        <State label="selected" ground="paper">
          <Callout n={4} name="cached page" onSelect={() => undefined} selected />
        </State>
        <State label="disabled" ground="paper">
          <Callout n={5} name="num_gpu_blocks" onSelect={() => undefined} disabled />
        </State>
      </Specimen>

      <Specimen
        title="Parts list"
        about="What the drawing shows, by the engine's names: the callouts' numerals, each part's name (as code when it is an identifier) and one sentence. A part not met before says new, and comes first in the game."
        wide
      >
        <State label="live: select a part" ground="paper" span>
          <PartsList label="Parts of the KV page pool" parts={POOL_PARTS} selected={selected} onSelect={setSelected} />
        </State>
        {FORCED.map((state) => (
          <State key={state} label={state} ground="paper">
            <PartsList
              label={`Parts, ${state}`}
              parts={[{ ...POOL_PARTS[1], force: state }]}
              onSelect={() => undefined}
            />
          </State>
        ))}
        <State label="disabled" ground="paper">
          <PartsList label="Parts, disabled" parts={[POOL_PARTS[2]]} onSelect={() => undefined} disabled />
        </State>
        <State label="a list to read, not to select" ground="paper">
          <PartsList label="Parts, to read" parts={POOL_PARTS.slice(0, 2)} />
        </State>
        <State label="empty" ground="paper">
          <PartsList label="Parts, none" parts={[]} />
        </State>
      </Specimen>

      <Specimen title="Legend" about="Under every diagram: the colour and glyph of each state it draws, in the engine's words, then the marker.">
        <State label="KV page pool" ground="paper" span>
          <Legend
            label="Legend: KV page pool"
            entries={[
              { slot: 'white', word: 'free' },
              { slot: 'blue', word: 'a page in use' },
              { slot: 'green', word: 'a page shared by a prefix hit' },
              { slot: 'yellow', word: 'a cached page' },
              { slot: 'brown', word: 'an adapter’s page' },
              { slot: 'red', word: 'evicted' },
            ]}
          />
        </State>
        <State label="step loop, with its cursor" ground="paper" span>
          <Legend
            label="Legend: step loop"
            entries={[
              { slot: 'blue', word: 'CPU work' },
              { slot: 'green', word: 'GPU work' },
              { slot: 'yellow', word: 'a sync' },
              { slot: 'white', word: 'idle' },
            ]}
            now="the current tick"
          />
        </State>
        <State label="on the ground" span>
          <Legend label="Legend: rejection sampler" entries={[{ slot: 'blue', word: 'the target p' }, { slot: 'yellow', word: 'the draft q' }, { slot: 'green', word: 'the accepted overlap' }]} />
        </State>
      </Specimen>

      <Specimen title="Note" about="An inline note in the reading: paper edged all round, a drawn mark and its heading, ink text. The heading says the kind; no colour does." wide>
        <State label="watch out" ground="paper">
          <Note kind="watch">
            <p>A page freed by a finished request is not empty. It keeps its tokens until the pool hands it to another request.</p>
          </Note>
        </State>
        <State label="the same idea in the OS" ground="paper">
          <Note kind="same-idea" breaks="An operating system can write a page out and read it back. This pool drops an evicted page’s tokens, and the request recomputes them.">
            <p>The KV page pool is a page frame allocator: requests ask for pages of one size, and none needs its pages side by side.</p>
          </Note>
        </State>
        <State label="in vLLM today" ground="paper">
          <Note kind="in-engine">
            <p>
              The pool is <code>BlockPool</code>. A freed page stays in the prefix cache until a new allocation evicts it.
            </p>
          </Note>
        </State>
      </Specimen>

      <Specimen
        title="Popover"
        about="A small sheet that opens from its trigger on a click, Enter or Space, never on focus alone. Escape, a press outside or Close shuts it and hands focus back. Nothing behind it is disabled."
        wide
      >
        {STATES.map((state) => (
          <State key={state} label={state} ground="paper">
            <Popover trigger="Parts" title="Parts of the KV page pool" data-force={forced(state)}>
              <p>Five parts are drawn on this level.</p>
            </Popover>
          </State>
        ))}
        <State label="disabled" ground="paper">
          <Popover trigger="Parts" title="Parts" disabled>
            <p>No parts.</p>
          </Popover>
        </State>
        <State label="a claim's mark in a sentence" ground="paper">
          <p className="es-prose" style={{ margin: 0 }}>
            This level&apos;s pool holds 64 pages
            <Popover inline variant="mark" trigger="1" triggerLabel="Source 1" title="Pages in this level’s pool">
              <span>64 pages, synthetic: set by the level&apos;s seed, not measured on an engine.</span>
            </Popover>
            , and each page holds the KV of 16 tokens.
          </p>
        </State>
        <State label="open: a part and its source" ground="paper" span>
          <Room height="17rem">
            <Popover trigger="page" title="page" defaultOpen>
              <p>Holds the keys and values of a fixed number of tokens for one request.</p>
              <p>
                <strong>16 tokens</strong> a page on this level, synthetic.
              </p>
              <p>A model object: the engine&apos;s own name for it is a block.</p>
            </Popover>
          </Room>
        </State>
      </Specimen>

      <Specimen
        title="Stamp"
        about="A small bordered word that says where a number comes from, once per instrument, table or figure and never inside a sentence. Every stamp opens the tag legend. Unverified is in the alert ink."
        wide
      >
        {(['synthetic', 'measured', 'derived', 'estimated', 'unverified'] as const).map((word) => (
          <State key={word} label={word} ground="paper">
            <Stamp word={word} source={word === 'measured' ? '2026-11-03 at 8f8fbe1' : undefined} />
          </State>
        ))}
        {FORCED.map((state) => (
          <State key={state} label={state} ground="paper">
            <Stamp word="synthetic" data-force={state} />
          </State>
        ))}
        <State label="disabled" ground="paper">
          <Stamp word="derived" disabled />
        </State>
        <State label="on the ground">
          <Stamp word="estimated" />
        </State>
        <State label="open: the tag legend" ground="paper" span>
          <Room height="28rem">
            <Stamp word="unverified" defaultOpen />
          </Room>
        </State>
      </Specimen>

      <Specimen title="Title block" about="One quiet line under an instrument: what it is a model of, its clock, and what the model leaves out, which opens the full card." wide>
        <State label="default" ground="paper" span>
          <TitleBlock
            model="Model of the KV page pool: one pool, pages of one size, no network"
            clock="Clock: synthetic steps"
            leavesOut={
              <>
                <p>It leaves out the attention kernels, the copy of a page between host and GPU, and the scheduler&apos;s token budget.</p>
                <p>Pages are freed and evicted at once; a real engine frees them at the end of a step.</p>
              </>
            }
          />
        </State>
        <State label="on the ground" span>
          <TitleBlock model="Model of the step loop: one GPU, one CPU thread" clock="Clock: synthetic ticks" />
        </State>
      </Specimen>

      <Specimen
        title="Section rail"
        about="Where you are in a lesson: a nav with an ordered list of its sections, each with its state and your own answers, Read's parts under it, and the minutes left. The current entry carries the marker and aria-current. Below 64rem it folds into a strip."
        wide
      >
        <State label="the rail, reading part 2" ground="paper">
          <SectionRail label="This lesson" sections={RAIL} current="read-2" minutesLeft={40} />
        </State>
        <State label="the rail, at its run" ground="paper">
          <SectionRail label="This lesson, at its run" sections={RAIL.map((section) => (section.id === 'run' ? { ...section, state: undefined, answers: undefined } : section))} current="run" minutesLeft={95} />
        </State>
        {FORCED.map((state) => (
          <State key={state} label={`an entry: ${state}`} ground="paper">
            <SectionRail label={`This lesson, ${state}`} sections={RAIL.slice(2)} current="keep" data-force={{ id: 'test', state }} />
          </State>
        ))}
        <State label="the strip, closed" ground="paper">
          <SectionRail label="This lesson, as a strip" variant="strip" summary="Lesson 1 · Read 2 of 3" sections={RAIL} current="read-2" minutesLeft={40} />
        </State>
        <State label="the strip, open" ground="paper">
          <SectionRail label="This lesson, as an open strip" variant="strip" summary="Lesson 1 · Read 2 of 3" sections={RAIL} current="read-2" minutesLeft={40} defaultOpen />
        </State>
      </Specimen>

      <Specimen title="Level menu" about="One control for a game's levels, never a row of chips. Its face says the level's number, title and kind in words. It is the platform's select, so every key works." wide>
        <State label="live" ground="paper" span>
          <LevelMenu levels={POOL_LEVELS} value={level} onChange={setLevel} />
        </State>
        {FORCED.map((state) => (
          <State key={state} label={state} ground="paper">
            <LevelMenu label={`Level, ${state}`} levels={POOL_LEVELS} value="evict" data-force={state} />
          </State>
        ))}
        <State label="disabled" ground="paper">
          <LevelMenu label="Level, disabled" levels={POOL_LEVELS} value="one-group" disabled />
        </State>
      </Specimen>

      <Specimen title="Goal line" about="Always visible under a game's title strip: the aim, what you control, the number to beat or the pass rule, then when the level ends." wide>
        <State label="practice" ground="paper" span>
          <GoalLine
            aim="Serve all 15 requests and recompute as few tokens as you can."
            control="You choose which request to admit and which page to evict."
            target="The reference's cost is the number to beat."
            ends="Ends when all 15 are served."
          />
        </State>
        <State label="graded, with its pass rule" ground="paper" span>
          <GoalLine
            aim="Evict so that the pool never refuses a request."
            control="You choose the page to evict at each decision."
            target="You pass at or under the reference's recompute cost, on 3 new scenarios."
            ends="Ends when every request is served."
          />
        </State>
        <State label="met" ground="paper" span>
          <GoalLine
            aim="Serve all 15 requests and recompute as few tokens as you can."
            control="You choose which request to admit and which page to evict."
            target="The reference's cost is the number to beat."
            ends="Ends when all 15 are served."
            met="All 15 served."
          />
        </State>
      </Specimen>

      <Specimen title="Delta" about="What an action just changed, beside the readout it changed. The readout steps at once; the delta stays for one second, then fades. Under reduced motion it stays until the next one.">
        <State label="live: admit a request" ground="paper" span>
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--es-space-4)' }}>
            <Button variant="ink" onClick={() => setServed((current) => ({ count: current.count + 4, delta: 4, key: current.key + 1 }))}>
              Admit request
            </Button>
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 'var(--es-space-2)' }}>
              <Readout value={served.count} unit="pages" tag="synthetic" />
              {served.key > 0 ? <DeltaChip key={served.key} value={served.delta} unit="pages" /> : null}
            </span>
          </span>
        </State>
        <State label="a gain" ground="paper">
          <DeltaChip value={4} unit="tokens" hold />
        </State>
        <State label="a named change" ground="paper">
          <DeltaChip value={3} unit="ticks" what="idle" hold />
        </State>
        <State label="a fall" ground="paper">
          <DeltaChip value={-2} unit="pages" hold />
        </State>
      </Specimen>

      <Specimen title="Number line" about="The reveal: your guess and the run's result as pins on one axis, with the reference when there is one. Each pin has its own shape and its word." wide>
        <State label="a guess and the model's answer" ground="paper" span>
          <NumberLine
            caption="Pages request 1 holds in each KV group"
            min={0}
            max={400}
            unit="pages"
            pins={[
              { id: 'guess', kind: 'guess', value: 300, label: 'you said' },
              { id: 'result', kind: 'result', value: 260, label: 'the model' },
            ]}
            stamp={<Stamp word="synthetic" />}
          />
        </State>
        <State label="your run against the reference" ground="paper" span>
          <NumberLine
            caption="Tokens recomputed"
            min={0}
            max={120}
            unit="tokens"
            pins={[
              { id: 'guess', kind: 'guess', value: 20, label: 'you said' },
              { id: 'result', kind: 'result', value: 94, label: 'your run' },
              { id: 'reference', kind: 'reference', value: 93, label: 'the reference' },
            ]}
            stamp={<Stamp word="synthetic" />}
          />
        </State>
      </Specimen>

      <Specimen
        title="The way on"
        about="What to do next, from one function: the amber button where a page has no move in hand, an outline beside a local way on, and the sentence that tells your progress back. Reviews due sit beside it and never replace it."
        wide
      >
        <State label="first visit" ground="paper" span>
          <NextStep to="/m/tr1/l1-five-mechanisms" label="Start: TR1 lesson 1" minutes={35} />
        </State>
        <State label="returning, with progress told back" ground="paper" span>
          <NextStep
            to={LESSON}
            lastTime="Last time: you ran KV page pool, One KV group (passed in practice) and tried 3 questions in TR5a lesson 1."
            label="Continue: retry the questions"
            minutes={5}
            reviews="3 reviews due, about 4 min"
            skipped="2 earlier lessons not finished"
          />
        </State>
        {STATES.map((state) => (
          <State key={state} label={state} ground="paper">
            <NextStep to="/m/tr2/l1-one-step-five-calls" label="Continue: TR2 lesson 1, read why" data-force={forced(state)} />
          </State>
        ))}
        <State label="outline" ground="paper">
          <NextStep to="/m/tr2/l1-one-step-five-calls" label="Continue: TR2 lesson 1, read why" emphasis="outline" />
        </State>
        <State label="unavailable" ground="paper">
          <NextStep to="/m/tr3" label="TR3 lesson 1" unavailable />
        </State>
      </Specimen>
    </div>
  )
}

function ComponentSpecimens() {
  const [step, setStep] = useState(12)
  const [overlap, setOverlap] = useState(true)
  return (
    <div className="es-spec__components">
      <Specimen
        title="Sheet"
        about="A sheet: a plain paper panel, cut square, with a soft shadow and a title. The surface the text you read sits on."
      >
        <State label="default">
          <Sheet head="No. 0042" meta="TBL 7" title="Fire the next step.">
            <SheetLine qty="1x">PREFILL</SheetLine>
            <SheetLine qty="3x">DECODE</SheetLine>
          </Sheet>
        </State>
        <State label="under the lamp">
          <Sheet head="No. 0043" meta="TBL 2" title="On the pass" lamp>
            <SheetLine qty="2x">DECODE</SheetLine>
          </Sheet>
        </State>
        {FORCED.map((force) => (
          <State key={force} label={`a ticket you pick up: ${force}`}>
            <Sheet as="button" head={`No. 004${FORCED.indexOf(force) + 4}`} meta="TBL 5" data-force={force}>
              <SheetLine qty="1x">PREFILL</SheetLine>
            </Sheet>
          </State>
        ))}
        <State label="loading">
          <Sheet head="No. 0047" state="loading">
            <SheetLine qty="2x">DECODE</SheetLine>
          </Sheet>
        </State>
        <State label="error">
          <Sheet head="No. 0048" state="error" error="This sheet could not load. Reload the page to try again.">
            <SheetLine qty="2x">DECODE</SheetLine>
          </Sheet>
        </State>
        <State label="empty">
          <Sheet head="No. 0000" state="empty" empty="Nothing here yet" />
        </State>
        <State label="disabled">
          <Sheet as="button" head="No. 0049" state="disabled">
            <SheetLine qty="1x">PREFILL</SheetLine>
          </Sheet>
        </State>
      </Specimen>

      <Specimen title="Primary button" about="The primary button: amber with its dark edge and an ink label, the control to act on now. Held down, it is a well with no amber.">
        {(['default', ...FORCED] as const).map((force) => (
          <State key={force} label={force}>
            <PrimaryButton standalone onClick={() => undefined} data-force={force === 'default' ? undefined : force}>
              Start service
            </PrimaryButton>
          </State>
        ))}
        <State label="disabled">
          <PrimaryButton standalone disabled>
            Start service
          </PrimaryButton>
        </State>
        <State label="loading">
          <PrimaryButton standalone loading>
            Start service
          </PrimaryButton>
        </State>
        <State label="error">
          <PrimaryButton standalone onClick={() => undefined} error="The line did not answer. Pull the stub again.">
            Start service
          </PrimaryButton>
        </State>
        <State label="on a ticket, as a link">
          <Sheet head="No. 0050" meta="TBL 1" title="First service" stub={<PrimaryButton to="/play/loop">Start service</PrimaryButton>}>
            <SheetLine qty="4">CLIPS ON THE RAIL</SheetLine>
          </Sheet>
        </State>
      </Specimen>

      <Specimen title="Rail" about="A row of slots under a hairline, one per batch slot. An empty slot is a dashed box that says so in words." wide>
        <State label="two tickets hung, two clips paid for and empty" span>
          <Rail
            clips={4}
            label="The rail: 4 clips"
            tickets={[railTicket('a', 'No. 12', '2x', 'DECODE'), railTicket('b', 'No. 13', '1x', 'PREFILL')]}
          />
        </State>
        <State label="under the lamp, every clip live" span>
          <Rail
            clips={4}
            label="The rail under the lamp"
            lamp
            tickets={[
              railTicket('a', 'No. 14', '1x', 'DECODE'),
              railTicket('b', 'No. 15', '1x', 'DECODE'),
              railTicket('c', 'No. 16', '1x', 'DECODE'),
              railTicket('d', 'No. 17', '1x', 'DECODE'),
            ]}
          />
        </State>
        <State label="empty">
          <Rail clips={2} label="An empty rail" />
        </State>
        <State label="disabled">
          <Rail clips={2} label="A rail not taking tickets" state="disabled" />
        </State>
      </Specimen>

      <Specimen title="Readout strip" about="The readout strip: terms and their values on one paper strip, a ruled row each. A value changes at once.">
        <State label="default">
          <ReadoutStrip
            label="The printer"
            housing={<MenuLink />}
            lines={[
              { id: 'step', label: 'fire', value: <Readout value={step} pad={4} tag="synthetic" size="sm" /> },
              { id: 'clock', label: 'clock', value: <Readout value={7} unit="ticks" tag="synthetic" size="sm" /> },
              { id: 'busy', label: 'busy', value: <Readout value={3} unit="stations" tag="synthetic" size="sm" /> },
            ]}
          />
        </State>
        <State label="loading">
          <ReadoutStrip label="The printer, warming up" state="loading" lines={[]} />
        </State>
        <State label="error">
          <ReadoutStrip label="The printer, jammed" state="error" error="Paper jam. Open the printer and pull the tape." lines={[]} />
        </State>
        <State label="empty">
          <ReadoutStrip label="The printer, idle" lines={[]} empty="No fires yet" />
        </State>
      </Specimen>

      <Specimen title="Readout" about="Every number passes through it in the mono face with tabular figures, and its tag. Ticks are always synthetic.">
        <State label="ticks, synthetic" ground="paper">
          <Readout value={7} unit="ticks" tag="synthetic" size="lg" />
        </State>
        <State label="measured, with date and SHA" ground="paper">
          <Readout value={340} unit="µs" tag="measured" source="2026-11-03 at 8f8fbe1" />
        </State>
        <State label="estimated, in red ink" ground="paper">
          <Readout value={1.2} digits={1} unit="ms" tag="estimated" tone="ink-2" />
        </State>
        <State label="derived" ground="paper">
          <Readout value={96.4} digits={1} unit="%" tag="derived" />
        </State>
        <State label="unverified, on steel">
          <Readout value={4096} unit="tokens" tag="unverified" />
        </State>
        <State label="extra large">
          <Readout value={step} pad={4} tag="synthetic" size="xl" />
        </State>
      </Specimen>

      <Specimen title="Label" about="A plain label: the name of a part, a state word, and the label of a field. It never moves and never lights.">
        <State label="plain">
          <Label>prep · KV page</Label>
        </State>
        <State label="with a station's code">
          <Label slot="green">grp 2 · 0x3f</Label>
        </State>
        <State label="tilted the other way">
          <Label tilt="right" slot="yellow">
            cached
          </Label>
        </State>
        <State label="small and straight">
          <Label size="sm" tilt="none" slot="brown">
            kit lora-7
          </Label>
        </State>
      </Specimen>

      <Specimen title="Pan" about="A KV page as a square cell. It never moves; its state is its fill, its pattern, its glyph and its label." wide>
        {MEMORY_STATES.map((state) => (
          <State key={state} label={state}>
            <Pan
              state={state}
              name={`Pan, ${state}`}
              tape={state === 'free' ? undefined : state === 'adapter' ? 'kit 7' : '0x3f'}
              station={state === 'free' || state === 'evicted' ? undefined : 'green'}
            />
          </State>
        ))}
        {FORCED.map((force) => (
          <State key={force} label={force}>
            <Pan state="used" name={`Pan, ${force}`} tape="0x40" station="blue" onSelect={() => undefined} data-force={force} />
          </State>
        ))}
        <State label="under the lamp">
          <Pan state="cached" name="Pan, a candidate" tape="0x41" station="yellow" lamp />
        </State>
        <State label="disabled">
          <Pan state="used" name="Pan, disabled" tape="0x42" station="blue" onSelect={() => undefined} disabled />
        </State>
        <State label="sixteen to a row at phone width" span>
          <span className="es-spec__pan-row">
            {Array.from({ length: 16 }, (_, index) => (
              <Pan
                key={index}
                size="sm"
                state={MEMORY_STATES[index % MEMORY_STATES.length]}
                name={`Pan ${index + 1}`}
                station={index % 3 === 0 ? 'green' : undefined}
              />
            ))}
          </span>
        </State>
      </Specimen>

      <Specimen
        title="Station light"
        about="Busy or idle as a shape and a word: a solid ink disc while it works, an open ring while it waits. The lane it belongs to is a mark beside its name, the same either way."
      >
        <State label="busy">
          <StationLight lit label="Station 1" />
        </State>
        <State label="busy, in the line's lane">
          <StationLight lit lane="gpu" label="The line" />
        </State>
        <State label="busy, in the expo's lane">
          <StationLight lit lane="cpu" label="The expo" words={{ lit: 'writing', dark: 'idle', fault: 'fault' }} />
        </State>
        <State label="dark, the lane's mark stays">
          <StationLight lit={false} lane="gpu" label="The line" />
        </State>
        <State label="fault">
          <StationLight lit={false} fault label="Station 3" />
        </State>
        <State label="under the lamp">
          <StationLight lit lamp label="Station 4" />
        </State>
        <State label="disabled">
          <StationLight lit={false} disabled label="Station 5" />
        </State>
      </Specimen>

      <Specimen title="Bell" about="The step mark. Each step strikes it once; with a handler it is the control that fires the next step.">
        <State label="ring it">
          <Bell step={step} onRing={() => setStep((current) => current + 1)} />
        </State>
        {FORCED.map((force) => (
          <State key={force} label={force}>
            <Bell step={12} onRing={() => undefined} data-force={force} />
          </State>
        ))}
        <State label="still">
          <Bell step={12} />
        </State>
        <State label="disabled">
          <Bell step={12} onRing={() => undefined} disabled />
        </State>
        <State label="loading">
          <Bell step={12} onRing={() => undefined} loading />
        </State>
      </Specimen>

      <Specimen title="Button" about="Flat, with a 1 px edge and a 3 px radius: the outline, the ink button an instrument leans on, and the quiet label alone." wide>
        {(['plate', 'ink', 'quiet'] as const).flatMap((variant) => [
          ...(['default', ...FORCED] as const).map((force) => (
            <State key={`${variant}-${force}`} label={`${variant}, ${force}`}>
              <Button variant={variant} data-force={force === 'default' ? undefined : force}>
                Ring the bell
              </Button>
            </State>
          )),
          <State key={`${variant}-disabled`} label={`${variant}, disabled`}>
            <Button variant={variant} disabled>
              Ring the bell
            </Button>
          </State>,
          <State key={`${variant}-loading`} label={`${variant}, loading`}>
            <Button variant={variant} loading>
              Ring the bell
            </Button>
          </State>,
        ])}
        <State label="error" span>
          <Button error="Not saved: the disk is full. Free some space, then export again." icon="arrow">
            Export
          </Button>
        </State>
      </Specimen>

      <Specimen title="Link" about="A link in running text: underlined below the descenders, thicker under the hand.">
        {(['default', ...FORCED] as const).map((force) => (
          <State key={force} label={force} ground="paper">
            <span>
              Read{' '}
              <TextLink to="/m/tr2" data-force={force === 'default' ? undefined : force}>
                the step loop
              </TextLink>{' '}
              next.
            </span>
          </State>
        ))}
        <State label="unavailable" ground="paper">
          <span>
            Then{' '}
            <TextLink to="/m/tr3" disabled disabledReason="TR3 is not built yet">
              profile a real engine
            </TextLink>
            .
          </span>
        </State>
        <State label="a file of the site" ground="paper">
          <TextLink file={`${import.meta.env.BASE_URL ?? '/'}third-party-licenses.txt`}>the licence file</TextLink>
        </State>
        <State label="another site" ground="paper">
          <TextLink href="https://docs.vllm.ai/">the vLLM docs</TextLink>
        </State>
      </Specimen>

      <Specimen title="Toggle" about="A switch: a flat track, a square thumb, and the state as a word. On, the track is dark. No light.">
        <State label="live">
          <Toggle label="Write the next call during this fire" hint="overlap (async scheduling)" checked={overlap} onCheckedChange={setOverlap} />
        </State>
        <State label="off">
          <Toggle label="Overlap" defaultChecked={false} />
        </State>
        {FORCED.map((force) => (
          <State key={force} label={force}>
            <Toggle label="Overlap" defaultChecked data-force={force} />
          </State>
        ))}
        <State label="disabled">
          <Toggle label="Overlap" disabled />
        </State>
        <State label="loading">
          <Toggle label="Overlap" defaultChecked loading />
        </State>
        <State label="error">
          <Toggle label="Overlap" error="Not switched: the run is replaying. Pause it, then switch." />
        </State>
      </Specimen>

      <Specimen title="Field" about="A plain label over a paper slip with a 2 px foot line. A number field types in the mono face." wide>
        <State label="empty">
          <Field label="Your prediction" placeholder="ticks per step" hint="Commit it before the reveal." numeric />
        </State>
        <State label="filled">
          <Field label="Seed" defaultValue="631f6361" />
        </State>
        <State label="hover">
          <Field label="Seed" defaultValue="631f6361" data-force="hover" />
        </State>
        <State label="focus">
          <Field label="Seed" defaultValue="631f6361" data-force="focus" />
        </State>
        <State label="disabled">
          <Field label="Seed" defaultValue="631f6361" disabled />
        </State>
        <State label="loading">
          <Field label="Receipt" defaultValue="receipt-0042.json.gz" loading />
        </State>
        <State label="error">
          <Field label="Your prediction" defaultValue="-4" numeric error="A step takes at least 1 tick. Enter a whole number of ticks." />
        </State>
      </Specimen>

      <Specimen
        title="The board and the menu"
        about="The navigation: the header along the top with the site's name, the page you are on marked in ink, and the footer below."
        wide
      >
        <State label="the board" span>
          <Header
            label="Specimen board"
            brand={{ to: '/', label: 'enginespace' }}
            links={[
              { to: '/map', label: 'Map' },
              { to: '/design', label: 'Design' },
              { to: '/play', label: 'Play' },
            ]}
          />
        </State>
        <State label="the kick-plate" span>
          <Header
            label="Specimen kick-plate"
            variant="kickplate"
            links={[
              { to: '/about', label: 'About' },
              { to: '/design', label: 'Design' },
            ]}
          />
        </State>
        <State label="the menu link" ground="paper">
          <MenuLink />
        </State>
      </Specimen>

      <Specimen title="Marks" about="The code's shapes, which every category carries beside its colour, and the system's drawn icons.">
        {SLOTS.map((slot) => (
          <State key={slot} label={`${slot}: ${SLOT_MARKS[slot].glyph}`}>
            <Glyph shape={SLOT_MARKS[slot].glyph} size="2.25rem" style={{ color: `var(--es-cat-${slot})` }} edge={`var(--es-cat-${slot}-edge)`} />
          </State>
        ))}
        {ICON_NAMES.map((name) => (
          <State key={name} label={name}>
            <Icon name={name} size="1.75rem" />
          </State>
        ))}
      </Specimen>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------ motion

/** The four motions the roles name, in the order of their durations (tokens.ts: "Motion"). */
const MOTIONS = [
  { id: 'press', title: 'A press', about: 'A hand on a plate or a hover over a ticket: the system answers at once.', duration: 'dur-quick', easing: 'ease-settle' },
  { id: 'strike', title: 'The bell strike', about: 'One step. The plunger drops, and the dome rings past its mark and settles.', duration: 'dur-bell', easing: 'ease-strike' },
  { id: 'feed', title: "The printer's feed", about: 'One ticket line. The printer advances in steps and never glides.', duration: 'dur-feed', easing: 'ease-feed' },
  { id: 'course', title: 'A course down the pass', about: 'A plate sliding to its place and coming to rest: fast away, long rest.', duration: 'dur-settle', easing: 'ease-settle' },
] as const satisfies readonly { id: string; title: string; about: string; duration: RoleName; easing: RoleName }[]

/** A role's value as a number of milliseconds: `240ms` is 240. */
function milliseconds(name: RoleName): number {
  const role = roleOf(name)
  return role.kind === 'duration' ? Number.parseFloat(role.value) : 0
}

/** An easing role's value, as the stylesheet writes it: `cubic-bezier(…)` or `steps(…)`. */
function curveOf(name: RoleName): string {
  const role = roleOf(name)
  return role.kind === 'easing' ? role.value : ''
}

/** What motion is on this page right now, and who decides: the same answer the document and the scenes follow. */
function MotionStatus() {
  const settings = useSettings()
  const motion = effectiveMotion(settings.motion, useSystemReducedMotion())
  return (
    <p className="es-spec__motion-status" data-motion-status={motion.reduced ? 'reduced' : 'full'}>
      Motion on this page is <strong>{motion.reduced ? 'reduced' : 'full'}</strong>:{' '}
      {motion.source === 'settings' ? 'you chose it in Settings' : motion.reduced ? 'your system asks for it' : 'your system does not ask for less'}.{' '}
      <TextLink to="/settings">Change it in Settings</TextLink>
    </p>
  )
}

function MotionBoard() {
  const [rung, setRung] = useState(0)
  const motion = effectiveMotion(useSettings().motion, useSystemReducedMotion())
  return (
    <div className="es-spec__motions">
      <div className="es-spec__motion-deck">
        <Button variant="ink" onClick={() => setRung((count) => count + 1)}>
          Ring the bell
        </Button>
        <MotionStatus />
        <p role="status" className="sr-only">
          {rung === 0 ? '' : motion.reduced ? 'Motion is reduced, so the four motions went straight to their end.' : 'The four motions ran.'}
        </p>
      </div>
      <ul className="es-spec__motion-list" aria-label="The four motions">
        {MOTIONS.map((entry) => (
          <li key={entry.id} className="es-spec__motion" data-motion-row={entry.id}>
            <div className="es-spec__motion-head">
              <h3 className="es-spec__motion-title">{entry.title}</h3>
              <p className="es-spec__motion-about">{entry.about}</p>
              <dl className="es-spec__motion-facts">
                <div>
                  <dt>duration</dt>
                  <dd>
                    <code>{entry.duration}</code> <Readout value={milliseconds(entry.duration)} unit="ms" tag="estimated" size="sm" />
                  </dd>
                </div>
                <div>
                  <dt>easing</dt>
                  <dd>
                    <code>{entry.easing}</code> <code className="es-spec__motion-curve-value">{curveOf(entry.easing)}</code>
                  </dd>
                </div>
              </dl>
            </div>
            <figure className="es-spec__motion-live">
              <div className="es-spec__motion-stage" data-ran={rung > 0 || undefined}>
                <span className="es-spec__motion-track" aria-hidden="true">
                  <span
                    key={rung}
                    className="es-spec__motion-puck"
                    style={{ animationDuration: `var(${cssVar(entry.duration)})`, animationTimingFunction: `var(${cssVar(entry.easing)})` }}
                  />
                </span>
              </div>
              <figcaption className="es-spec__state-label">live: rings with the bell</figcaption>
            </figure>
            <figure className="es-spec__motion-twin">
              <div className="es-spec__motion-stage" data-ground="paper">
                <EasingCurve value={curveOf(entry.easing)} />
              </div>
              <figcaption className="es-spec__state-label">2D twin: the curve, progress against time</figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </div>
  )
}
