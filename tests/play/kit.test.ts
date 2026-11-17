/*
 * The kit's parts as markup (ARCHITECTURE §6.9, D-049): what the mirror table, the help list and the view switch put on
 * the page. They render on the server renderer, so these tests read the structure a screen reader and a stylesheet get; the
 * behaviour that needs a DOM (focus, key presses, the dialog) is exercised in a browser.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { keymapOf } from '@es/play'
import { KeysList } from '@/games/kit/KeysDialog'
import { MirrorTable, type MirrorColumn, type MirrorRow } from '@/games/kit/MirrorTable'
import { useRun } from '@/games/kit/useRun'
import { ViewSwitch } from '@/games/kit/ViewSwitch'
import { PRACTICE_SEED, TOY, toySession } from './support'

const count = (markup: string, pattern: RegExp) => markup.match(pattern)?.length ?? 0

describe('the view switch', () => {
  test('the reason is only shown while 3D is unavailable', () => {
    const on = renderToStaticMarkup(h(ViewSwitch, { view: '2d', onViewChange: () => undefined, available3d: true, unavailableReason: 'never shown' }))
    expect(on).not.toContain('never shown')
    const off = renderToStaticMarkup(h(ViewSwitch, { view: '2d', onViewChange: () => undefined, available3d: false, unavailableReason: 'WebGL2 is missing.' }))
    expect(off).toContain('WebGL2 is missing.')
    const bare = renderToStaticMarkup(h(ViewSwitch, { view: '2d', onViewChange: () => undefined, available3d: false }))
    expect(bare).not.toContain('aria-describedby')
  })

  test('a 3D game has the switch with both views on offer, 2D pressed to begin with', () => {
    const markup = renderToStaticMarkup(h(ViewSwitch, { view: '2d', onViewChange: () => undefined, available3d: true }))
    expect(markup).toMatch(/role="group" aria-label="View"/)
    expect(markup).toMatch(/aria-pressed="true"[^>]*aria-keyshortcuts="V"[^>]*>2D view/)
    expect(markup).toMatch(/aria-pressed="false"[^>]*aria-keyshortcuts="V"[^>]*>3D view/)
    expect(markup).not.toMatch(/disabled=""[^>]*>3D view/)
  })
})

describe('the keys', () => {
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
    expect(markup).toMatch(/class="es-sheet[ "]/)
    expect(markup).toContain('Mirror')
  })

  test('prints the ticket\'s name on its foot line, under the table, and not as a row above it', () => {
    const markup = table({ head: 'Mirror · the night so far' })
    expect(markup).not.toContain('es-sheet__head')
    expect(markup.indexOf('es-sheet__foot')).toBeGreaterThan(markup.indexOf('</table>'))
    expect(markup).toMatch(/class="es-sheet__foot"><span>Mirror · the night so far<\/span>/)
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
