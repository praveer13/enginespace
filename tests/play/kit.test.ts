/*
 * The kit's parts as markup (ARCHITECTURE §6.9, D-049): what the shell, the mirror table, the help list and the view switch put on
 * the page. They render on the server renderer, so these tests read the structure a screen reader and a stylesheet get; the
 * behaviour that needs a DOM (focus, key presses, the dialog) is exercised in a browser.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { keymapOf } from '@es/play'
import type { AnySession } from '@es/play'
import { GameShell, type GameShellProps, type RunApi } from '@/games/kit/GameShell'
import { KeysList } from '@/games/kit/KeysDialog'
import { MirrorTable, type MirrorColumn, type MirrorRow } from '@/games/kit/MirrorTable'
import { useRun } from '@/games/kit/useRun'
import { ViewSwitch } from '@/games/kit/ViewSwitch'
import { PRACTICE_SEED, TOY, TOY_3D, toySession, type ToyAction, type ToyAsk, type ToyLevel, type ToyScore, type ToyState, type ToyView } from './support'

type Props = GameShellProps<ToyLevel, ToyState, ToyAction, ToyView, ToyScore, ToyAsk>
type Api = RunApi<ToyAction, ToyView, ToyScore, ToyAsk>

/** The shell around the toy, with each slot marking itself so a test can see what was drawn. */
function shell(over: Partial<Props> = {}, session: Props['session'] = toySession): string {
  const props: Props = {
    game: TOY,
    session,
    level: 'pile',
    seed: PRACTICE_SEED,
    mode: 'practice',
    view2d: (run: Api) => h('div', { 'data-slot': 'view2d', 'data-mirror-id': run.mirrorId }, `target ${run.view.target}`),
    scene3d: undefined,
    controls: () => h('div', { 'data-slot': 'controls' }),
    mirror: (run: Api) => h('div', { 'data-slot': 'mirror', id: run.mirrorId }),
    debrief: () => h('div', { 'data-slot': 'debrief' }),
    ...over,
  }
  return renderToStaticMarkup(h(GameShell<ToyLevel, ToyState, ToyAction, ToyView, ToyScore, ToyAsk>, props))
}
const count = (markup: string, pattern: RegExp) => markup.match(pattern)?.length ?? 0

describe('the shell names the game as D-049 says: the display name over its engine concept', () => {
  test('the heading is the display name and the subtitle follows it', () => {
    const markup = shell()
    expect(markup).toMatch(/<h2 id="[^"]+" class="es-type-heading">Counting House<\/h2><p class="es-type-body[^"]*">adding up to a mark<\/p>/)
  })

  test('the section is a region named by that heading, and is the container the keys bind to', () => {
    const markup = shell()
    const id = /<h2 id="([^"]+)"/.exec(markup)?.[1]
    expect(markup).toContain(`<section tabindex="-1" aria-labelledby="${id}"`)
    expect(markup).toContain('data-game="toy"')
  })

  test('inside a lesson the heading is a level lower', () => {
    expect(shell({ headingLevel: 3 })).toMatch(/<h3 id="[^"]+" class="es-type-heading">Counting House<\/h3>/)
  })

  test('the working name is not shown', () => {
    expect(shell({ game: { ...TOY, title: 'Service', subtitle: 'the step loop' } })).not.toContain('The Loop')
  })

  test('the level and the mode are on a tape label', () => {
    expect(shell({ levelTitle: 'The pile' })).toContain('The pile · practice')
    expect(shell({ mode: 'graded' })).toMatch(/class="es-tape__text">graded</)
  })

  test('a game\'s own docket takes the tape\'s place, and the stages and the keys join it in one row in the header', () => {
    const markup = shell({ levelTitle: 'The pile', docket: h('div', { 'data-slot': 'docket' }) })
    expect(markup).not.toContain('The pile · practice')
    expect(markup).not.toContain('es-tape__text')
    const header = markup.slice(markup.indexOf('<header'), markup.indexOf('</header>'))
    expect(header.indexOf('data-slot="docket"')).toBeGreaterThan(header.indexOf('</h2>'))
    expect(header.indexOf('data-slot="docket"')).toBeLessThan(header.indexOf('aria-label="Stages of this game"'))
    expect(header).toContain('>Keys</button>')
    expect(count(markup, /aria-label="Stages of this game"/g)).toBe(1)
    // A game whose view leads keeps its own toolbar under the view: its docket stands alone under the name (Service's levels, W1-T13).
    const staged = shell({ stage: true, docket: h('div', { 'data-slot': 'docket' }) })
    const stagedHeader = staged.slice(staged.indexOf('<header'), staged.indexOf('</header>'))
    expect(stagedHeader).toContain('data-slot="docket"')
    expect(stagedHeader).not.toContain('aria-label="Stages of this game"')
    expect(count(staged, /aria-label="Stages of this game"/g)).toBe(1)
  })
})

describe('the stages', () => {
  test('a game with only a debrief shows Play and Debrief, and Debrief is shut until the run is over', () => {
    const markup = shell()
    expect(markup).toMatch(/<nav aria-label="Stages of this game"><ol[^>]*><li><button[^>]*aria-current="step"[^>]*>Play<\/button><\/li><li><button[^>]*disabled=""[^>]*>Debrief<\/button><\/li><\/ol><\/nav>/)
    expect(count(markup, /<li>/g)).toBe(2)
  })

  test('Compose, In production and Build this appear for a game that has them, shut until the debrief has been seen', () => {
    const slot = () => h('p', null, 'x')
    const markup = shell({ compose: slot, production: slot, build: slot })
    for (const name of ['Play', 'Debrief', 'Compose', 'In production', 'Build this']) expect(markup).toContain(`>${name}</button>`)
    expect(count(markup, /<li>/g)).toBe(5)
    expect(count(markup, /disabled=""/g)).toBeGreaterThanOrEqual(4)
  })

  test('the first render is the Play stage, and its panel is a labelled group that can take focus', () => {
    const markup = shell()
    expect(markup).toContain('data-phase="play"')
    expect(markup).toMatch(/<div tabindex="-1" role="group" aria-label="Play" data-stage="play" class="outline-none">/)
  })

  test('nothing of the debrief is drawn while the run is on', () => {
    expect(shell()).not.toContain('data-slot="debrief"')
  })

  test('the reference is not run before the run is over', () => {
    let asked = 0
    const erased: AnySession = toySession
    const spy = { ...toySession, ghost: (level: ToyLevel) => (asked += 1, erased.ghost(level)) } as Props['session']
    shell({}, spy)
    expect(asked).toBe(0)
  })
})

describe('the slots', () => {
  test('the play stage draws the 2D view, the controls and the mirror, and hands each the run', () => {
    const markup = shell()
    for (const slot of ['view2d', 'controls', 'mirror']) expect(markup).toContain(`data-slot="${slot}"`)
    expect(markup).toMatch(/data-slot="view2d"[^>]*>target [1-9]</)
  })

  test('the controls follow the mirror when a game asks, so a narrow screen reads the view, the mirror and then the controls', () => {
    const before = shell()
    expect(before.indexOf('data-slot="controls"')).toBeLessThan(before.indexOf('data-slot="mirror"'))
    const after = shell({ mirrorFirst: true })
    expect(after.indexOf('data-slot="view2d"')).toBeLessThan(after.indexOf('data-slot="mirror"'))
    expect(after.indexOf('data-slot="mirror"')).toBeLessThan(after.indexOf('data-slot="controls"'))
    expect(after.indexOf('data-slot="controls"')).toBeLessThan(after.indexOf('>Undo</button>'))
  })

  test('with the view leading, what stands beside the controls follows them, and the mirror joins the grid under the view\'s switches', () => {
    const plain = shell({ stage: true })
    expect(plain).not.toContain('data-shell-column')
    const markup = shell({ stage: true, beside: () => h('div', { 'data-slot': 'beside' }) })
    // One order for a narrow screen and for the keyboard: the view, the controls, what stands beside them, the switches, the mirror.
    const at = ['data-slot="view2d"', 'data-shell-column="controls"', 'data-slot="controls"', 'data-slot="beside"', 'aria-label="Stages of this game"', 'data-stage="play"', 'data-slot="mirror"'].map((text) => markup.indexOf(text))
    expect(at.every((index, i) => index > -1 && (i === 0 || index > at[i - 1]))).toBe(true)
    // On a wide screen the controls' column spans the view's row, the switches' and the mirror's, and only the mirror's row is flexible.
    expect(markup).toContain('lg:grid-rows-[auto_auto_1fr]')
    expect(markup).toMatch(/class="[^"]*lg:row-span-3[^"]*" data-shell-column="controls"/)
    expect(markup).toMatch(/data-stage="play" class="min-w-0 outline-none lg:col-start-1 lg:row-start-3"/)
    expect(count(markup, /data-stage="/g)).toBe(1)
  })

  test('a sticky stage keeps the view\'s switches under it everywhere, and its column spans the controls\' rows on a wide screen, so it can stay in sight', () => {
    const plain = shell({ stage: true })
    // The plain stage: the switches stand in a cell of their own, after the controls.
    expect(plain.indexOf('aria-label="Stages of this game"')).toBeGreaterThan(plain.indexOf('data-slot="controls"'))
    expect(plain).toContain('lg:col-start-1 lg:row-start-2')
    const markup = shell({ stage: 'sticky' })
    // One order for a narrow screen and for the keyboard: the view, its switches, the controls, the mirror.
    const at = ['data-slot="view2d"', 'aria-label="Stages of this game"', 'data-slot="controls"', 'data-slot="mirror"'].map((text) => markup.indexOf(text))
    expect(at.every((index, i) => index > -1 && (i === 0 || index > at[i - 1]))).toBe(true)
    expect(markup).not.toContain('lg:col-start-1 lg:row-start-2')
    expect(markup).toMatch(/class="flex min-w-0 flex-col gap-4 lg:row-span-2">/)
    // The 2D view does not stick: a drawing can be taller than the screen. (The 3D view's column takes `lg:sticky lg:top-4`.)
    expect(markup).not.toContain('lg:sticky')
  })

  test('the mirror\'s id is the one the shell gives the run, so a view can point at its table', () => {
    const markup = shell()
    const mirrorId = /data-mirror-id="([^"]+)"/.exec(markup)?.[1]
    expect(mirrorId).toBeTruthy()
    expect(markup).toContain(`id="${mirrorId}"`)
  })

  test('the 2D view is a labelled group that a hidden note describes; the note says the table lists everything', () => {
    const markup = shell()
    const note = /aria-describedby="([^"]+)"/.exec(markup)?.[1]
    expect(markup).toContain('role="group" aria-label="2D view"')
    expect(markup).toContain(`<p id="${note}" class="sr-only">This view is a drawing. The table below lists everything it shows.</p>`)
  })

  test('the live region and the status region are in the page from the start, empty', () => {
    const markup = shell()
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toMatch(/role="status"[^>]*><\/div>/)
  })

  test('the notional-machine card is kept to hand in a disclosure, and absent when the game gives none', () => {
    expect(shell({ card: h('p', null, 'It models the pile.') })).toMatch(/<details[^>]*><summary[^>]*><svg[^>]*>.*?<\/svg>What this world models<\/summary><div[^>]*><p>It models the pile\.<\/p>/)
    expect(shell()).not.toContain('<details')
  })

  test('the disclosure is the system\'s own: a drawn arrow that turns when it opens, never the browser\'s triangle', () => {
    const summary = /<summary([^>]*)>(.*?)<\/summary>/.exec(shell({ card: h('p', null, 'It models the pile.') }))
    expect(summary?.[1]).toContain('list-none')
    expect(summary?.[1]).toContain('[&amp;::-webkit-details-marker]:hidden')
    expect(summary?.[2]).toMatch(/^<svg[^>]*class="[^"]*group-open:rotate-90[^>]*data-icon="arrow"/)
  })
})

describe('practice and graded', () => {
  test('a practice level has an Undo, disabled until there is a move to undo', () => {
    expect(shell()).toMatch(/<button[^>]*disabled=""[^>]*aria-keyshortcuts=","[^>]*>Undo<\/button>/)
  })

  test('a graded level has no Undo', () => {
    expect(shell({ mode: 'graded' })).not.toContain('Undo')
  })
})

describe('the view switch', () => {
  const scene = () => h('canvas')

  test('a game without a 3D scene has no switch and one view', () => {
    const markup = shell()
    expect(markup).not.toContain('aria-label="View"')
    expect(markup).toContain('data-view="2d"')
  })

  test('a 3D game has the switch with both views on offer, 2D pressed to begin with', () => {
    const markup = shell({ game: TOY_3D, scene3d: scene })
    expect(markup).toMatch(/role="group" aria-label="View"/)
    expect(markup).toMatch(/aria-pressed="true"[^>]*aria-keyshortcuts="V"[^>]*>2D view/)
    expect(markup).toMatch(/aria-pressed="false"[^>]*aria-keyshortcuts="V"[^>]*>3D view/)
    expect(markup).not.toMatch(/disabled=""[^>]*>3D view/)
  })

  test('in 3D the scene is drawn inside a labelled group that the drawing note describes, and the 2D view is not drawn', () => {
    // The group is not hidden: the scene's Stage hides its own canvas, and keeps its 2D first paint, its notes and their buttons
    // where assistive technology can reach them (W0-T17). A focusable control must never sit inside a hidden box.
    const markup = shell({ game: TOY_3D, scene3d: scene, defaultView: '3d' })
    expect(markup).toContain('data-view="3d"')
    expect(markup).toMatch(/<p id="([^"]+)" class="sr-only">This view is a drawing\. The table below lists everything it shows\.<\/p><div data-surface="3d" role="group" aria-label="3D view" aria-describedby="\1"><canvas><\/canvas><\/div>/)
    expect(markup).not.toContain('data-surface="3d" aria-hidden')
    expect(markup).not.toContain('data-slot="view2d"')
  })

  test('when 3D is not allowed the 3D button is disabled and says why, and the game shows 2D whatever view was asked for', () => {
    const markup = shell({ game: TOY_3D, scene3d: scene, allow3d: false, unavailable3d: '3D is off in Settings.', defaultView: '3d' })
    expect(markup).toContain('data-view="2d"')
    expect(markup).toMatch(/aria-describedby="[^"]+"[^>]*disabled=""[^>]*>3D view|disabled=""[^>]*aria-describedby="[^"]+"[^>]*>3D view/)
    expect(markup).toContain('3D is off in Settings.')
  })

  test('a game that has 3D but gives no scene to the shell stays in 2D', () => {
    expect(shell({ game: TOY_3D, defaultView: '3d' })).toContain('data-view="2d"')
  })

  test('ViewSwitch alone: the reason is only shown while 3D is unavailable', () => {
    const on = renderToStaticMarkup(h(ViewSwitch, { view: '2d', onViewChange: () => undefined, available3d: true, unavailableReason: 'never shown' }))
    expect(on).not.toContain('never shown')
    const off = renderToStaticMarkup(h(ViewSwitch, { view: '2d', onViewChange: () => undefined, available3d: false, unavailableReason: 'WebGL2 is missing.' }))
    expect(off).toContain('WebGL2 is missing.')
    const bare = renderToStaticMarkup(h(ViewSwitch, { view: '2d', onViewChange: () => undefined, available3d: false }))
    expect(bare).not.toContain('aria-describedby')
  })
})

describe('the keys', () => {
  test('the Keys button is in the header, a plain button that opens the dialog', () => {
    expect(shell()).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"[^>]*>Keys<\/button>/)
  })

  test('the help lists the keys common to every game and then the game\'s own, each with its key cap', () => {
    const markup = renderToStaticMarkup(h(KeysList, { keys: keymapOf(TOY) }))
    expect(markup).toMatch(/<section aria-label="In every game"[^>]*>.*<section aria-label="In this game"/s)
    for (const label of ['Space', '.', ',', '[', ']', 'C', 'V', '?', 'A']) expect(markup).toContain(`>${label}</kbd>`)
    expect(markup).toContain('Add three')
    expect(markup).toContain('Switch between the 2D and 3D views')
    expect(count(markup, /<kbd /g)).toBe(9)
  })

  test('a game with no keys of its own has no second group', () => {
    const markup = renderToStaticMarkup(h(KeysList, { keys: keymapOf({ keys: [] }) }))
    expect(markup).not.toContain('In this game')
    expect(count(markup, /<kbd /g)).toBe(8)
  })
})

describe('the mirror table', () => {
  const columns: MirrorColumn[] = [
    { key: 'step', head: 'step' },
    { key: 'slots', head: 'slots', numeric: true },
    { key: 'busy', head: 'GPU busy', numeric: true },
  ]
  const rows: MirrorRow[] = [
    { id: 's1', cells: { step: 'Step 1', slots: '4', busy: '4' } },
    { id: 's2', cells: { step: 'Step 2', slots: '3', busy: '4' }, lamp: true },
    { id: 's3', cells: { step: 'Step 3', slots: '4' } },
  ]
  const table = (over: Partial<Parameters<typeof MirrorTable>[0]> = {}) =>
    renderToStaticMarkup(h(MirrorTable, { id: 'mirror-1', caption: 'Every step so far', columns, rows, ...over }))

  test('is a table with a caption, column heads and a row header, on the ticket paper', () => {
    const markup = table()
    expect(markup).toContain('<table id="mirror-1"')
    expect(markup).toMatch(/<caption id="[^"]+"[^>]*>Every step so far<\/caption>/)
    expect(count(markup, /<th scope="col"/g)).toBe(3)
    expect(count(markup, /<th scope="row"/g)).toBe(3)
    expect(markup).toMatch(/class="es-ticket[ "]/)
    expect(markup).toContain('Mirror')
  })

  test('prints the ticket\'s name on its foot line, under the table, and not as a row above it', () => {
    const markup = table({ head: 'Mirror · the night so far' })
    expect(markup).not.toContain('es-ticket__head')
    expect(markup.indexOf('es-ticket__foot')).toBeGreaterThan(markup.indexOf('</table>'))
    expect(markup).toMatch(/class="es-ticket__foot"><span>Mirror · the night so far<\/span>/)
  })

  test('keeps the table\'s roles on its elements, and gives every cell its column\'s name, for a row printed as a block', () => {
    const markup = table({ columns: [...columns.slice(0, 2), { key: 'busy', head: 'GPU busy', label: 'GPU busy, synthetic ticks', numeric: true }] })
    expect(markup).toContain('<table id="mirror-1" role="table"')
    expect(count(markup, /role="columnheader"/g)).toBe(3)
    expect(count(markup, /role="rowheader"/g)).toBe(3)
    expect(count(markup, /role="cell"/g)).toBe(6)
    expect(count(markup, /data-label="slots"/g)).toBe(3)
    expect(count(markup, /data-label="GPU busy, synthetic ticks"/g)).toBe(3)
  })

  test('marks the selected row by its print, bold and underlined, and never by a stripe down its side', () => {
    const markup = table({ selectedId: 's1' })
    expect(markup).not.toMatch(/border-l-\d/)
    expect(markup).toMatch(/<th scope="row" class="[^"]*font-bold underline[^"]*"[^>]*>Step 1/)
  })

  test('numeric columns align right, and a missing cell is empty and not "undefined"', () => {
    const markup = table()
    expect(markup).toMatch(/<th scope="col" class="[^"]*text-right[^"]*"[^>]*>slots<\/th>/)
    expect(markup).not.toContain('undefined')
    expect(markup).toMatch(/<td class="[^"]*text-right[^"]*"[^>]*><\/td>/)
  })

  test('a scroll region on a narrow screen is labelled by the caption and can take focus', () => {
    const markup = table()
    const caption = /<caption id="([^"]+)"/.exec(markup)?.[1]
    expect(markup).toContain(`role="region" aria-labelledby="${caption}" tabindex="0"`)
  })

  test('the summary line sits above the table', () => {
    const markup = table({ summary: 'Step 3: 4 of 4 slots live.' })
    expect(markup.indexOf('Step 3: 4 of 4 slots live.')).toBeGreaterThan(-1)
    expect(markup.indexOf('Step 3: 4 of 4 slots live.')).toBeLessThan(markup.indexOf('<table'))
    expect(table()).not.toContain('data-mirror-summary')
  })

  test('the lamp falls on the present row alone, and the selected row says so', () => {
    const markup = table({ selectedId: 's3' })
    expect(count(markup, /data-lamp="true"/g)).toBe(1)
    expect(markup).toMatch(/<tr[^>]*data-lamp="true"[^>]*><th scope="row"[^>]*>Step 2/)
    expect(count(markup, /aria-current="true"/g)).toBe(1)
    expect(markup).toMatch(/<tr aria-current="true" data-selected="true"[^>]*><th[^>]*>Step 3/)
  })

  test('an empty table says so in a row of its own', () => {
    expect(table({ rows: [], empty: 'No steps yet' })).toMatch(/<td colSpan="3"[^>]*>No steps yet<\/td>|<td colspan="3"[^>]*>No steps yet<\/td>/)
    expect(table({ rows: [] })).toContain('Nothing to list yet')
  })

  test('with onSelect each row\'s first cell is a button, and one of them is the tab stop', () => {
    const markup = table({ onSelect: () => undefined })
    expect(count(markup, /<button type="button" data-row-button=""/g)).toBe(3)
    expect(count(markup, /tabindex="0"[^>]*>Step|data-row-button="" aria-pressed="[a-z]+" tabindex="0"/g)).toBeGreaterThanOrEqual(1)
    const stops = [...markup.matchAll(/data-row-button="" aria-pressed="(true|false)" tabindex="(-?\d)"/g)].map((match) => match[2])
    expect(stops).toEqual(['0', '-1', '-1'])
    expect(markup).toContain('data-native-keys="ArrowUp ArrowDown Home End"')
  })

  test('the tab stop follows the selected row', () => {
    const markup = table({ onSelect: () => undefined, selectedId: 's2' })
    const stops = [...markup.matchAll(/data-row-button="" aria-pressed="(true|false)" tabindex="(-?\d)"/g)].map((match) => [match[1], match[2]])
    expect(stops).toEqual([['false', '-1'], ['true', '0'], ['false', '-1']])
  })

  test('without onSelect there are no buttons and the arrows are not claimed', () => {
    const markup = table()
    expect(markup).not.toContain('data-row-button')
    expect(markup).not.toContain('data-native-keys')
  })
})

describe('a page that frames the views itself builds on useRun', () => {
  /** A bare frame: no shell, only the run, as the front page may build it. */
  function Bare({ mode }: { mode: 'practice' | 'graded' }) {
    const run = useRun({ session: toySession, game: 'toy', level: 'pile', seed: PRACTICE_SEED, mode })
    return h('p', { 'data-run': '' }, [run.view.target, run.turns, run.done, run.canUndo, run.outcome === null, run.announcement === null, run.ask?.choices.length].join(','))
  }

  test('the run starts on the level and the seed, with an empty log, no outcome and nothing announced', () => {
    const target = toySession.level('pile', PRACTICE_SEED).target
    expect(renderToStaticMarkup(h(Bare, { mode: 'practice' }))).toBe(`<p data-run="">${target},0,false,false,true,true,3</p>`)
  })

  test('a graded run cannot undo, and a practice one can once it has moved (the log is empty here, so neither can yet)', () => {
    expect(renderToStaticMarkup(h(Bare, { mode: 'graded' }))).toContain(',0,false,false,')
  })
})
