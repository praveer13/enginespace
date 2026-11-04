import { useState, type ReactNode } from 'react'
import '@/design/specimens.css'
import { contrastRatio } from '@/design/contrast'
import { Bell } from '@/design/components/Bell'
import { Board, MenuLink } from '@/design/components/Board'
import { Button } from '@/design/components/Button'
import { Field } from '@/design/components/Field'
import { Glyph, Icon, type IconName } from '@/design/components/Glyph'
import { Pan } from '@/design/components/Pan'
import { PrinterTape } from '@/design/components/PrinterTape'
import { Rail } from '@/design/components/Rail'
import { Readout } from '@/design/components/Readout'
import { StationLight } from '@/design/components/StationLight'
import { Stub } from '@/design/components/Stub'
import { TapeLabel } from '@/design/components/TapeLabel'
import { TextLink } from '@/design/components/TextLink'
import { Ticket, TicketLine } from '@/design/components/Ticket'
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
          The Pass: a line kitchen and its expo pass. The ground is brushed stainless under fluorescent tubes, the text you read is printed on ticket
          paper, the heat lamp falls only on the present, masking tape and marker label the objects, and the cutting-board colours are the one
          categorical code. Every role below reaches a CSS variable, a Tailwind key and the scenes, and pages use nothing else.
        </p>
      </header>

      <section aria-labelledby="roles" className="es-spec__section">
        <h2 id="roles">Roles</h2>
        {ROLE_GROUPS.map((group) => (
          <RoleGroup key={group.id} title={group.title} names={rolesIn(group.id)} />
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
          The parts every 3D game is built from, on one pass: the step-loop model&apos;s own run of a short service, drawn in brushed steel under the heat
          lamps, beside its 2D twin. Ring the bell, turn overlap on, switch to the long night, and the tapes print what this browser measures.
        </p>
        <SceneSpecimen />
      </section>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------ roles

function RoleGroup({ title, names }: { title: string; names: RoleName[] }) {
  return (
    <section className="es-spec__group" aria-label={title}>
      <h3 className="es-spec__group-title">{title}</h3>
      <ul className="es-spec__roles">
        {names.map((name) => (
          <RoleEntry key={name} name={name} />
        ))}
      </ul>
    </section>
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
    <Ticket key={key} head={head} compact hole={false} width="full">
      <TicketLine qty={qty}>{item}</TicketLine>
    </Ticket>
  )
}

function ComponentSpecimens() {
  const [step, setStep] = useState(12)
  const [overlap, setOverlap] = useState(true)
  return (
    <div className="es-spec__components">
      <Specimen
        title="Ticket"
        about="Bond paper off the impact printer, with its clip hole and a perforated stub: the surface the text you read sits on."
      >
        <State label="default">
          <Ticket head="No. 0042" meta="TBL 7" title="Fire the next step.">
            <TicketLine qty="1x">PREFILL</TicketLine>
            <TicketLine qty="3x">DECODE</TicketLine>
          </Ticket>
        </State>
        <State label="under the lamp">
          <Ticket head="No. 0043" meta="TBL 2" title="On the pass" lamp>
            <TicketLine qty="2x">DECODE</TicketLine>
          </Ticket>
        </State>
        {FORCED.map((force) => (
          <State key={force} label={`a ticket you pick up: ${force}`}>
            <Ticket as="button" head={`No. 004${FORCED.indexOf(force) + 4}`} meta="TBL 5" data-force={force}>
              <TicketLine qty="1x">PREFILL</TicketLine>
            </Ticket>
          </State>
        ))}
        <State label="loading">
          <Ticket head="No. 0047" state="loading">
            <TicketLine qty="2x">DECODE</TicketLine>
          </Ticket>
        </State>
        <State label="error">
          <Ticket head="No. 0048" state="error" error="PAPER OUT. LOAD A ROLL, THEN PRINT AGAIN.">
            <TicketLine qty="2x">DECODE</TicketLine>
          </Ticket>
        </State>
        <State label="empty">
          <Ticket head="No. 0000" state="empty" empty="NO TICKETS YET" />
        </State>
        <State label="disabled">
          <Ticket as="button" head="No. 0049" state="disabled">
            <TicketLine qty="1x">PREFILL</TicketLine>
          </Ticket>
        </State>
      </Specimen>

      <Specimen title="Stub" about="The tear-off primary action, printed in the ribbon's red below the perforations.">
        {(['default', ...FORCED] as const).map((force) => (
          <State key={force} label={force}>
            <Stub standalone onClick={() => undefined} data-force={force === 'default' ? undefined : force}>
              Start service
            </Stub>
          </State>
        ))}
        <State label="disabled">
          <Stub standalone disabled>
            Start service
          </Stub>
        </State>
        <State label="loading">
          <Stub standalone loading>
            Start service
          </Stub>
        </State>
        <State label="error">
          <Stub standalone onClick={() => undefined} error="The line did not answer. Pull the stub again.">
            Start service
          </Stub>
        </State>
        <State label="on a ticket, as a link">
          <Ticket head="No. 0050" meta="TBL 1" title="First service" stub={<Stub to="/play/loop">Start service</Stub>}>
            <TicketLine qty="4">CLIPS ON THE RAIL</TicketLine>
          </Ticket>
        </State>
      </Specimen>

      <Specimen title="Rail" about="A stainless bar with a fixed number of clips, one per batch slot. An empty clip says so in words." wide>
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

      <Specimen title="Printer tape" about="The live readout: the printer feeds one line at a time, and its housing carries the menu link.">
        <State label="default">
          <PrinterTape
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
          <PrinterTape label="The printer, warming up" state="loading" lines={[]} />
        </State>
        <State label="error">
          <PrinterTape label="The printer, jammed" state="error" error="Paper jam. Open the printer and pull the tape." lines={[]} />
        </State>
        <State label="empty">
          <PrinterTape label="The printer, idle" lines={[]} empty="No fires yet" />
        </State>
      </Specimen>

      <Specimen title="Readout" about="Every number passes through it in the printer's dots, with its tag. Ticks are always synthetic.">
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

      <Specimen title="Tape label" about="Masking tape and marker, torn off the roll: names on pans and objects, and the label of a field.">
        <State label="plain">
          <TapeLabel>prep · KV page</TapeLabel>
        </State>
        <State label="with a station's code">
          <TapeLabel slot="green">grp 2 · 0x3f</TapeLabel>
        </State>
        <State label="tilted the other way">
          <TapeLabel tilt="right" slot="yellow">
            cached
          </TapeLabel>
        </State>
        <State label="small and straight">
          <TapeLabel size="sm" tilt="none" slot="brown">
            kit lora-7
          </TapeLabel>
        </State>
      </Specimen>

      <Specimen title="Pan" about="A hotel pan in the reach-in: one KV page. It never moves; its state is its fill, its pattern and its tape." wide>
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

      <Specimen title="Station light" about="A station's pilot light: lit in its lane's colour while it cooks, an open dark ring while it waits.">
        <State label="busy, the line">
          <StationLight lit label="Station 1" />
        </State>
        <State label="busy, the expo">
          <StationLight lit lane="cpu" label="The expo" words={{ lit: 'writing', dark: 'idle', fault: 'fault' }} />
        </State>
        <State label="dark">
          <StationLight lit={false} label="Station 2" />
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

      <Specimen title="Button" about="A stamped steel plate. The ink plate is the control a game leans on; the quiet stamp has no plate." wide>
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
        <State label="another site" ground="paper">
          <TextLink href="https://docs.vllm.ai/">the vLLM docs</TextLink>
        </State>
      </Specimen>

      <Specimen title="Toggle" about="An equipment switch: the lever, the stamped word, and a pilot light that burns green when it is on.">
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

      <Specimen title="Field" about="Masking tape over a slip of ticket paper with a ruled line. A number field types in the printer's dots." wide>
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
        about="The navigation: the board along the top with the house's nameplate, the page you are on under the lamp, and the kick-plate below. The menu is the kitchen's word for the course map."
        wide
      >
        <State label="the board" span>
          <Board
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
          <Board
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
