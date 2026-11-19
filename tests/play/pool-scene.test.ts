/*
 * R-T41: the KV page pool's 3D rack (src/games/pool/scene-layout.ts, Scene3D.tsx; REDESIGN §2.8, §2.9). The scene draws a flat model of
 * the 2D diagram, made of the kit's flat-track primitives: a rack of page cells on a base plate, the running batch behind it, the waiting
 * queue in front. These tests hold it to the brief:
 *   - every page stands in its cell for its whole life: a page never moves, whatever the night does;
 *   - a page's state is a form as well as a colour: free hollow, in use solid, cached hatched, shared dotted, an adapter's grooved;
 *   - a selected page fans into the layers of its KV group, the padding layers last and hollow, and the page itself stays where it is;
 *   - a request shows a thread from its tile to each page of its block table, none across its name, and its page nearest the front fans
 *     (so the scene opens on both things depth shows); a selected page shows a thread from each holder;
 *   - every page carries the 2D cell's glyph for its state, so the legend under the scene is the 2D view's own;
 *   - the amber ring falls on what the open ask may take, and on nothing else;
 *   - every word is a label (DOM), in the engine's terms, and the scene imports nothing from src/scene/props;
 *   - the three cameras frame the batch, the rack, the queue and the level's tallest fan, and fill the box, at every pool size and at every
 *     canvas the 3D view is offered in (a phone gets no 3D switch).
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PerspectiveCamera, Vector3 } from 'three'
import type { PoolLevelId, PoolState, PoolView } from '@es/play/pool/types'
import { poolSession } from '@es/play/pool/session'
import { house } from '@es/play/pool/policy'
import { findBanned } from '@/copy/banned'
import { framingFor } from '@/scene/camera-rig'
import { morphModel, PX } from '@/scene/flat-track'
import { MARK_FORMS } from '@/scene/marks'
import { pageForm, pageRole, PAGE, PAGE_TOP, SHOTS, SLOT, THREAD, WAIT, WELL, fanOf, fanRoom, fanTop, framePoints, geometryOf, headPage, pageBox, presetsFor, rackOf, slotBox, threadedRequest, type Canvas } from '@/games/pool/scene-layout'
import { POOL_CAMERAS } from '@/games/pool/scene-presets'
import { tableFor } from '@/games/pool/focus'
import * as glyphWords from '@/games/pool/glyphs'
import { stateGlyph } from '@/games/pool/glyphs'
import * as stageWords from '@/games/pool/select-words'
import * as pageWords from '@/games/pool/words'
import { playThrough, practiceOf } from './pool-support'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')
/** A source without its comments, which say what the scene is not. */
const code = (file: string) => read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const view = (state: PoolState): PoolView => poolSession.view(state)
const night = (id: PoolLevelId): PoolState[] => playThrough(practiceOf(id), house).states
const NONE = { station: null, chosen: [], pointed: [], pick: null } as const
/** The threads of a model: every ink that is not straight up (the fan has no stem, and nothing else stands straight up). */
const threadsOf = <T extends { x0: number; x1: number; z0: number; z1: number }>(inks: readonly T[]): T[] => inks.filter((ink) => ink.x0 !== ink.x1 || ink.z0 !== ink.z1)

/** The pool sizes the levels have: their practice seeds, and the whole manager's three models. */
const POOLS = [44, 64, 96, 104, 112, 160, 208, 288]

describe('the rack: a page in every cell, each in its place for its whole life', () => {
  test('rows of `cols`, page 1 at the back on the left, each page on its pitch inside the well, and none of two in one cell', () => {
    for (const pages of POOLS) {
      const g = geometryOf(pages, 16, 4)
      expect(g.rows).toBe(Math.ceil(pages / 16))
      const keys = new Set<string>()
      for (let id = 0; id < pages; id++) {
        const box = pageBox(g, id)
        keys.add(`${box.x0},${box.z0}`)
        expect(box.x0).toBeGreaterThanOrEqual(g.rack.x0 + (PAGE.pitch - PAGE.size) / 2 - 1e-9)
        expect(box.x1).toBeLessThanOrEqual(g.rack.x1)
        expect(box.z1).toBeLessThanOrEqual(g.rack.z1)
        expect(box.x1 - box.x0).toBe(PAGE.size)
        if (id % 16 > 0) expect(box.x0 - pageBox(g, id - 1).x0).toBe(PAGE.pitch)
        if (id >= 16) expect(box.z0 - pageBox(g, id - 16).z0).toBe(PAGE.pitch)
      }
      expect(keys.size).toBe(pages)
      // The first page is the back row's first, as the 2D diagram draws it at the top on the left.
      expect(pageBox(g, 0).z0).toBe(Math.min(...Array.from({ length: pages }, (_, id) => pageBox(g, id).z0)))
      expect(pageBox(g, 0).x0).toBe(Math.min(...Array.from({ length: pages }, (_, id) => pageBox(g, id).x0)))
    }
  })

  test('the batch stands behind the rack with room for the threads, and the waiting queue in front of it', () => {
    const g = geometryOf(104, 16, 4)
    expect(g.slots.z1 + 40).toBeLessThan(g.rack.z0)
    expect(g.rack.z1).toBeLessThan(g.queue.z0)
    expect(g.queue.z1 + 10).toBeLessThan(g.depth)
    for (const cap of [3, 4, 8]) {
      const wide = geometryOf(104, 16, cap)
      expect(slotBox(wide, cap - 1).x1).toBeLessThanOrEqual(wide.rack.x1 + 1e-9)
      expect(wide.slots.width).toBeLessThanOrEqual(SLOT.widest)
    }
  })

  test("a page never moves: through a whole night, every page's box is the same box, its state changing where it stands", () => {
    for (const id of ['two-kinds', 'adapters', 'state'] as const) {
      const states = night(id)
      // A page is a solid, or a dashed wire while it is free: either way one box per cell, at the same place.
      const pagesOf = (model: ReturnType<typeof rackOf>['model']) => [...model.boxes, ...model.wires].filter((box) => box.id.startsWith('page/')).sort((a, b) => Number(a.id.slice(5)) - Number(b.id.slice(5)))
      const first = pagesOf(rackOf(view(states[0]), NONE).model)
      for (const state of states) {
        const v = view(state)
        const pages = pagesOf(rackOf(v, NONE).model)
        expect(pages).toHaveLength(v.pans.length)
        pages.forEach((box, i) => {
          for (const key of ['id', 'x0', 'x1', 'z0', 'z1', 'y0', 'height'] as const) expect(box[key]).toBe(first[i][key])
        })
      }
    }
  })

  test('a selection never moves a page either: the fan and the threads stand over it', () => {
    const states = night('two-kinds')
    const v = view(states[6])
    const plain = rackOf(v, NONE).model.boxes.filter((box) => box.id.startsWith('page/'))
    for (const pick of [{ kind: 'page', id: 3 }, { kind: 'request', id: v.running[0] }] as const) {
      const pages = rackOf(v, { ...NONE, pick }).model.boxes.filter((box) => box.id.startsWith('page/'))
      expect(pages).toEqual(plain)
    }
  })
})

describe('a page is a form as well as a colour (WCAG 1.4.1)', () => {
  test('free is hollow, in use solid, cached hatched, shared dotted, an adapter\'s a groove: four different forms for the four states the brief names', () => {
    expect(pageForm.free).toBe('hollow')
    expect(pageForm.used).toBe('solid')
    expect(pageForm.cached).toBe('marked')
    expect(pageForm.shared).toBe('dotted')
    expect(pageForm.adapter).toBe('groove')
    expect(new Set([pageForm.free, pageForm.used, pageForm.cached, pageForm.shared, pageForm.adapter]).size).toBe(5)
    for (const form of Object.values(pageForm)) expect(MARK_FORMS).toContain(form)
  })

  test('colours are the memory roles of the design system, and a page is drawn in the form of its own state, through a whole night', () => {
    expect(pageRole.used).toBe('memory-used')
    expect(pageRole.cached).toBe('memory-cached')
    expect(pageRole.shared).toBe('memory-shared')
    expect(pageRole.adapter).toBe('memory-adapter')
    const seen = new Set<string>()
    for (const id of ['adapters', 'two-kinds'] as const) {
      for (const state of night(id)) {
        const v = view(state)
        const { boxes, wires } = rackOf(v, NONE).model
        for (const page of v.pans) {
          // A free page is empty, and empty in 3D is a dashed wire outline in the edge's colour (REDESIGN §2.8), never a solid.
          if (page.state === 'free') {
            expect(boxes.some((candidate) => candidate.id === `page/${page.id}`)).toBe(false)
            expect(wires.find((candidate) => candidate.id === `page/${page.id}`)).toMatchObject({ form: 'hollow', role: 'edge' })
            seen.add(page.state)
            continue
          }
          const box = boxes.find((candidate) => candidate.id === `page/${page.id}`)
          expect(box?.form).toBe(pageForm[page.state])
          expect(box?.role).toBe(pageRole[page.state])
          seen.add(page.state)
        }
      }
    }
    for (const state of ['free', 'used', 'cached', 'shared', 'adapter']) expect(seen.has(state), `a night shows ${state}`).toBe(true)
  })

  test('a page chosen to be evicted is drawn in the evicted colour, and rung in amber with its edge', () => {
    const states = night('evict')
    const state = states.find((candidate) => view(candidate).ask?.kind === 'evict') as PoolState
    const v = view(state)
    const ask = v.ask
    if (ask?.kind !== 'evict') throw new Error('an eviction is open')
    const chosen = ask.candidates.slice(0, 2)
    const model = rackOf(v, { ...NONE, chosen }).model
    for (const id of chosen) expect(model.boxes.find((box) => box.id === `page/${id}`)?.role).toBe('memory-evicted')
    // Every candidate is ringed, in the marker and its edge, and nothing else is.
    const ringed = new Set(model.boxes.filter((box) => box.id.startsWith('candidate/') && box.id.endsWith('/lamp')).map((box) => Number(box.id.split('/')[1])))
    expect([...ringed].sort((a, b) => a - b)).toEqual([...ask.candidates].sort((a, b) => a - b))
    expect(model.boxes.filter((box) => box.id.startsWith('candidate/') && box.id.endsWith('/edge')).every((box) => box.role === 'marker-edge')).toBe(true)
    const none = rackOf(view(states[0]), NONE).model
    expect(none.boxes.some((box) => box.role === 'marker')).toBe(false)
  })

  test('a row the dock points at is ringed too', () => {
    const v = view(night('two-kinds')[4])
    const model = rackOf(v, { ...NONE, pointed: [5, 6] }).model
    expect(model.boxes.filter((box) => box.id.startsWith('pointed/') && box.id.endsWith('/lamp')).map((box) => box.id)).toEqual(['pointed/5/lamp', 'pointed/6/lamp'])
  })
})

describe('a selected page fans into the layers it serves', () => {
  const states = night('same-size')
  const withFan = states.map(view).find((v) => v.pans.some((page) => page.station !== null && v.stations[page.station].padLayers > 0 && page.state !== 'free'))
  test('the level has a group with padding layers, which is the case worth drawing', () => {
    expect(withFan).toBeDefined()
  })

  test('a tray for each layer of its group, the padding layers last and hollow, each over the one under it, and the page does not move', () => {
    const v = withFan as PoolView
    const page = v.pans.find((candidate) => candidate.station !== null && v.stations[candidate.station].padLayers > 0 && candidate.state !== 'free')
    if (page === undefined || page.station === null) throw new Error('a page of a padded group')
    const group = v.stations[page.station]
    const rack = rackOf(v, { ...NONE, pick: { kind: 'page', id: page.id } })
    expect(rack.fan).toEqual({ page: page.id, layers: group.layers, pads: group.padLayers, state: page.state })
    const layers = rack.model.boxes.filter((box) => box.id.startsWith('fan/'))
    expect(layers).toHaveLength(group.layers + group.padLayers)
    layers.forEach((box, k) => {
      expect(box.form).toBe(k < group.layers ? pageForm[page.state] : 'hollow')
      expect(box.y0 ?? 0).toBeGreaterThan(PAGE_TOP)
      if (k > 0) expect(box.y0 ?? 0).toBeGreaterThan(layers[k - 1].y0 ?? 0)
      // Each layer is an even slab, over the page's own cell or beside it, never under another page's footprint on the sheet: it stands in the air.
      expect(box.x1 - box.x0).toBeLessThanOrEqual(PAGE.size)
    })
    // The page is the same box as without the fan.
    const g = rack.geometry
    const at = pageBox(g, page.id)
    expect(rack.model.boxes.find((box) => box.id === `page/${page.id}`)).toMatchObject({ x0: at.x0, z0: at.z0, y0: WELL.height })
    // A pick on a layer is a pick on its page, so the same pick closes the fan.
    for (const box of layers) expect(box.pick).toBe(`page:${page.id}`)
    // Closed, the layers lie on the page: the move that opens them starts from there.
    const shut = rack.closed.boxes.filter((box) => box.id.startsWith('fan/'))
    expect(shut).toHaveLength(layers.length)
    for (const box of shut) {
      expect(box.y0).toBe(PAGE_TOP)
      expect((box.x0 + box.x1) / 2).toBeCloseTo((at.x0 + at.x1) / 2)
    }
    // Its words: how many layers, and how many of them padding, as one label.
    expect(rack.model.labels.find((label) => label.id === 'fan/words')?.text).toBe(`${group.layers} layers + ${group.padLayers} padding`)
    // No stem stands beside the fan (it read as a stray thread), and no layer throws a contact shadow on the cells under it (the Flat Paper
    // Rule): the first layer rises out of the page itself.
    expect(rack.model.inks.some((ink) => ink.x0 === ink.x1 && ink.z0 === ink.z1 && ink.y1 !== undefined && ink.y1 > PAGE_TOP)).toBe(false)
    expect(rack.model.boxes.filter((box) => box.id.startsWith('fan/')).every((box) => box.shadow === false)).toBe(true)
  })

  test('the move opens the layers: halfway, they are between the page and where they rest, and at its end they are where they rest', () => {
    const v = withFan as PoolView
    const page = v.pans.find((candidate) => candidate.station !== null && candidate.state !== 'free')
    const rack = rackOf(v, { ...NONE, pick: { kind: 'page', id: page?.id ?? 0 } })
    const half = morphModel(rack.closed, rack.model, 0.5).boxes.filter((box) => box.id.startsWith('fan/'))
    const open = rack.model.boxes.filter((box) => box.id.startsWith('fan/'))
    const shut = rack.closed.boxes.filter((box) => box.id.startsWith('fan/'))
    half.forEach((box, k) => {
      expect(box.y0 ?? 0).toBeGreaterThan(shut[k].y0 ?? 0)
      expect(box.y0 ?? 0).toBeLessThan(open[k].y0 ?? 0)
    })
    expect(morphModel(rack.closed, rack.model, 1).boxes.filter((box) => box.id.startsWith('fan/'))).toEqual(open)
  })

  test("a free page and an adapter's page have no layers, and nothing is selected without a fan", () => {
    const v = view(night('adapters').find((state) => view(state).pans.some((page) => page.kit !== null)) as PoolState)
    const free = v.pans.find((page) => page.station === null && page.kit === null) as PoolView['pans'][number]
    const kit = v.pans.find((page) => page.kit !== null) as PoolView['pans'][number]
    expect(fanOf(v, { kind: 'page', id: free.id })).toBeNull()
    expect(fanOf(v, { kind: 'page', id: kit.id })).toBeNull()
    expect(fanOf(v, null)).toBeNull()
    expect(fanOf(v, { kind: 'request', id: 0 })).toBeNull()
    expect(rackOf(v, { ...NONE, pick: { kind: 'page', id: kit.id } }).model.boxes.some((box) => box.id.startsWith('fan/'))).toBe(false)
  })

  test('the moment changes when the fan does, and only then', () => {
    const v = withFan as PoolView
    const ids = v.pans.filter((page) => page.station !== null).map((page) => page.id)
    const a = rackOf(v, { ...NONE, pick: { kind: 'page', id: ids[0] } })
    const again = rackOf(v, { ...NONE, pick: { kind: 'page', id: ids[0] }, chosen: [ids[1]], pointed: [ids[2]] })
    const other = rackOf(v, { ...NONE, pick: { kind: 'page', id: ids[1] } })
    expect(again.moment).toBe(a.moment)
    expect(other.moment).not.toBe(a.moment)
  })
})

describe('threads run from a request\'s block table to its pages', () => {
  const states = night('two-kinds').map(view)
  const busy = states.find((v) => v.running.length >= 2 && v.stations.length > 1) as PoolView

  test('a selected request: one thread to each page it holds, in as many pieces as a thread has, starting on its tile and ending on the page\'s top', () => {
    const req = busy.running[0]
    const rack = rackOf(busy, { ...NONE, pick: { kind: 'request', id: req } })
    const pages = tableFor(busy, req, null).flat()
    expect(pages.length).toBeGreaterThan(1)
    expect(rack.request).toBe(req)
    const inks = threadsOf(rack.model.inks)
    expect(inks).toHaveLength(pages.length * THREAD.pieces)
    const g = rack.geometry
    const tile = slotBox(g, busy.running.indexOf(req))
    for (let i = 0; i < pages.length; i++) {
      const pieces = inks.slice(i * THREAD.pieces, (i + 1) * THREAD.pieces)
      const first = pieces[0]
      const last = pieces[pieces.length - 1]
      expect(first.x0).toBeGreaterThanOrEqual(tile.x0)
      expect(first.x0).toBeLessThanOrEqual(tile.x1)
      expect(first.y).toBe(SLOT.height)
      expect(first.z0).toBe(tile.z1)
      const at = pageBox(g, pages[i].id)
      expect(last.x1).toBeCloseTo((at.x0 + at.x1) / 2)
      expect(last.z1).toBeCloseTo((at.z0 + at.z1) / 2)
      expect(last.y1).toBeCloseTo(PAGE_TOP)
      // The pieces join end to end, and arch over the straight line between: the depth the 2D diagram cannot draw.
      pieces.forEach((piece, k) => k > 0 && expect([piece.x0, piece.z0, piece.y]).toEqual([pieces[k - 1].x1, pieces[k - 1].z1, pieces[k - 1].y1 as number]))
      expect(Math.max(...pieces.map((piece) => piece.y ?? 0))).toBeGreaterThan(Math.max(SLOT.height, PAGE_TOP) + THREAD.arch / 2)
    }
    expect([...rack.threaded].sort((a, b) => a - b)).toEqual(pages.map((page) => page.id).sort((a, b) => a - b))
  })

  test('One KV group keeps that group\'s threads alone', () => {
    const req = busy.running[0]
    const whole = threadsOf(rackOf(busy, { ...NONE, pick: { kind: 'request', id: req } }).model.inks).length
    const counts = busy.stations.map((_, g) => threadsOf(rackOf(busy, { ...NONE, station: g, pick: { kind: 'request', id: req } }).model.inks).length)
    expect(counts.reduce((a, b) => a + b, 0)).toBe(whole)
    expect(Math.min(...counts)).toBeLessThan(whole)
  })

  test('with nothing selected, the request hung last shows; with a page selected, none does but a thread from each holder ends on the page', () => {
    expect(threadedRequest(busy, null)).toBe(busy.running[busy.running.length - 1])
    expect(rackOf(busy, NONE).request).toBe(busy.running[busy.running.length - 1])
    const held = busy.pans.find((page) => page.holders.length > 0 && page.station !== null) as PoolView['pans'][number]
    const rack = rackOf(busy, { ...NONE, pick: { kind: 'page', id: held.id } })
    expect(rack.request).toBeNull()
    const threads = rack.model.inks.filter((ink) => ink.x0 !== ink.x1 || ink.z0 !== ink.z1)
    expect(threads).toHaveLength(held.holders.length * THREAD.pieces)
  })

  test('nothing is on the line, nothing is threaded; a request that has left the line is not drawn', () => {
    const first = view(night('two-kinds')[0])
    expect(rackOf(first, NONE).model.inks).toEqual([])
    expect(rackOf(first, NONE).request).toBeNull()
    // A pick that no longer stands (the request was served) is dropped: the scene falls back to the request hung last.
    expect(rackOf(busy, { ...NONE, pick: { kind: 'request', id: 9999 } }).model.inks).toEqual(rackOf(busy, NONE).model.inks)
  })

  test('a page two requests hold has a thread from each: depth shows what a flat drawing cannot', () => {
    const shared = states.flatMap((v) => v.pans.filter((page) => page.holders.length > 1).map((page) => ({ v, page }))).at(0)
    expect(shared, 'a night where two requests hold one page').toBeDefined()
    if (shared === undefined) return
    const rack = rackOf(shared.v, { ...NONE, pick: { kind: 'page', id: shared.page.id } })
    expect(rack.model.inks.filter((ink) => ink.y1 === PAGE_TOP || ink.y1 !== undefined).length).toBeGreaterThanOrEqual(shared.page.holders.length * THREAD.pieces)
    const starts = new Set(rack.model.inks.filter((ink) => ink.z0 === rack.geometry.slots.z1).map((ink) => Math.round(ink.x0)))
    expect(starts.size).toBe(shared.page.holders.length)
  })
})

describe('the queue and the batch', () => {
  test('a tile for each request on the line, a dashed wire for each empty slot, and a wire for each waiting request shown', () => {
    for (const state of night('same-size')) {
      const v = view(state)
      const model = rackOf(v, NONE).model
      expect(model.boxes.filter((box) => box.id.startsWith('slot/'))).toHaveLength(v.running.length)
      expect(model.wires.filter((box) => box.id.startsWith('slot/'))).toHaveLength(v.cap - v.running.length)
      expect(model.wires.filter((box) => box.id.startsWith('wait/'))).toHaveLength(Math.min(v.waiting.length, WAIT.shown))
      expect(model.wires.every((box) => box.form === 'hollow')).toBe(true)
    }
  })

  test("a request's tile can be picked, and so can a page that holds something; nothing else can", () => {
    const v = view(night('two-kinds')[6])
    const model = rackOf(v, NONE).model
    // The fan's layers take a pick on their page; the pages and the tiles are counted here.
    const picks = model.boxes.filter((box) => box.pick !== undefined && !box.id.startsWith('fan/')).map((box) => box.pick as string)
    // A free page is an empty cell's wire, with nothing in it to pick.
    const held = v.pans.filter((page) => page.state !== 'free').length
    expect(picks.filter((pick) => pick.startsWith('page:'))).toHaveLength(held)
    expect(picks.filter((pick) => pick.startsWith('req:'))).toHaveLength(v.running.length)
    expect(picks).toHaveLength(held + v.running.length)
    expect(model.plates.every((box) => box.pick === undefined)).toBe(true)
  })
})

describe('every word is DOM', () => {
  test('the labels name the regions, the requests and the fan, in the engine\'s own terms', () => {
    const states = night('two-kinds')
    for (const state of states) {
      const v = view(state)
      const model = rackOf(v, { ...NONE, pick: { kind: 'page', id: 0 } }).model
      for (const label of model.labels) expect(findBanned(label.text), `${label.id}: ${label.text}`).toEqual([])
      expect(model.labels.map((label) => label.id)).toEqual(expect.arrayContaining(['name/batch', 'name/pool', 'name/queue']))
      for (const id of v.running) expect(model.labels.find((label) => label.id === `chip/${id}`)?.text).toBe(`R${id + 1}`)
    }
  })

  const sources = ['src/games/pool/Scene3D.tsx', 'src/games/pool/scene-layout.ts', 'src/games/pool/Stage3D.tsx', 'src/games/pool/Select3D.tsx'].map(code)
  test('the canvas prints nothing, and no kitchen word or tracker word is in the scene', () => {
    for (const source of sources) {
      expect(source).not.toMatch(/fillText|strokeText|TextGeometry|FontLoader/)
      expect(source).not.toMatch(/\b(ticket|tickets|kitchen|reach-in|expo)\b|R-T\d|D-0\d\d/i)
    }
  })

  test('the scene imports nothing from src/scene/props, and no kitchen file is left in the pool', () => {
    for (const source of sources) expect(source).not.toMatch(/scene\/props|scene\/Lights|scene\/materials|scene\/environment|scene\/textures/)
    expect(existsSync(path.join(root, 'src/games/pool/cabinet.ts'))).toBe(false)
    // The kit has no environment map and no bloom to ask for (R-T44): the canvas takes neither prop, and the scene passes neither.
    expect(sources[0]).not.toMatch(/environment=|bloom=/)
    expect(sources[0]).toMatch(/fog=\{null\}/)
  })

  test('the scene reaches three only through the kit and its own lazy chunk, and the page holds it behind React.lazy', () => {
    const game = read('src/games/pool/Game.tsx')
    expect(game).toMatch(/lazy\(\(\) => import\('\.\/Scene3D'\)\)/)
    // A type is erased; a value imported from the scene's modules would pull them into the page's chunk.
    expect(game).not.toMatch(/^import (?!type )[^\n]*from '\.\/(Scene3D|scene-layout)'/m)
    expect(sources[1]).not.toMatch(/from 'three'/)
  })

  test('the scene is a flat model on the kit: a panel that says what is selected, in DOM, and under it the 2D view\'s own legend', () => {
    expect(sources[3]).toMatch(/data-pool-fan/)
    // One legend: the panel draws no key of its own, and the page puts the diagram's legend under the 3D view as under the 2D one.
    expect(sources[3]).not.toMatch(/data-pool-key|es-pool3d-swatch/)
    const game = code('src/games/pool/Game.tsx')
    const legend = game.slice(game.indexOf('legend={'), game.indexOf('dock={'))
    expect(legend.match(/<PoolLegend view=\{run\.view\} \/>/g)).toHaveLength(2)
  })
})

describe("the selection panel's words are the page's", () => {
  test("a copy of glyphs.ts's and words.ts's, held equal, so the panel's chunk folds none of the page's in", () => {
    expect(stageWords.STATE_WORDS).toEqual(glyphWords.STATE_WORDS)
    expect(stageWords.KIND_WORDS).toEqual(glyphWords.KIND_WORDS)
    for (const n of [0, 1, 2, 9]) {
      expect(stageWords.pagesWord(n)).toBe(pageWords.pagesWord(n))
      expect(stageWords.reqName(n)).toBe(pageWords.reqName(n))
    }
  })

  test('the panel imports no value from the page: only the scene, its words and the design system', () => {
    const imports = [...read('src/games/pool/Select3D.tsx').matchAll(/^import (?!type )[^\n]*from '([^']+)'/gm)].map((match) => match[1])
    for (const from of imports) expect(from, from).not.toMatch(/^\.\/(glyphs|words|kit|View2D|Controls|Game)$/)
  })
})

describe('the cameras: front, one KV group, from above', () => {
  // The canvases the 3D view is offered in: /play/pool at a desk, the same below 64rem with the dock under it (768 px wide, the narrowest
  // window that has a 3D switch), and a lesson's column. A phone has no 3D switch (e2e/pool-scene.spec.ts holds that at 390 px).
  const CANVASES: readonly Canvas[] = [
    { width: 782, height: 382 },
    { width: 736, height: 374 },
    { width: 645, height: 557 },
  ]
  const cameraFor = (preset: ReturnType<typeof presetsFor>[number], canvas: Canvas) => {
    const framing = framingFor(preset, canvas.width)
    const camera = new PerspectiveCamera(framing.fov, canvas.width / canvas.height, 0.05, 200)
    camera.position.set(...framing.position)
    camera.up.set(0, 1, 0)
    camera.lookAt(...framing.target)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    return (x: number, y: number, z: number) => {
      const v = new Vector3(x, y, z).project(camera)
      return { x: ((v.x + 1) / 2) * canvas.width, y: ((1 - v.y) / 2) * canvas.height }
    }
  }
  const ROOM = fanTop(40) + 22

  test("the page's plates and the scene's presets are the same three, in the same order", () => {
    expect(presetsFor(geometryOf(44, 16, 3), CANVASES[0], ROOM).map((preset) => preset.id)).toEqual(POOL_CAMERAS.map((camera) => camera.id))
    expect([...SHOTS]).toEqual(POOL_CAMERAS.map((camera) => camera.id))
    expect(POOL_CAMERAS.map((camera) => camera.label)).toEqual(['Front of the page pool', 'One KV group', 'From above'])
  })

  for (const canvas of CANVASES) {
    test(`at ${canvas.width} by ${canvas.height} px, every preset holds the batch, the rack, the queue and the tallest fan, and fills the box, at every pool size`, () => {
      for (const pages of POOLS) {
        const g = geometryOf(pages, 16, 4)
        for (const preset of presetsFor(g, canvas, ROOM)) {
          const at = cameraFor(preset, canvas)
          const shown = framePoints(g, ROOM).map(([x, y, z]) => at(x, y, z))
          for (const p of shown) {
            expect(p.x, `${preset.id} ${pages}`).toBeGreaterThanOrEqual(0)
            expect(p.x).toBeLessThanOrEqual(canvas.width)
            expect(p.y).toBeGreaterThanOrEqual(0)
            expect(p.y).toBeLessThanOrEqual(canvas.height)
          }
          // It fills the box: across or down, the drawing spans nine tenths of it or more, and stands in its middle.
          const xs = shown.map((p) => p.x)
          const ys = shown.map((p) => p.y)
          const wide = (Math.max(...xs) - Math.min(...xs)) / canvas.width
          const tall = (Math.max(...ys) - Math.min(...ys)) / canvas.height
          expect(Math.max(wide, tall), `${preset.id} ${pages} fills ${wide.toFixed(2)} x ${tall.toFixed(2)}`).toBeGreaterThanOrEqual(0.9)
          expect(Math.abs((Math.max(...xs) + Math.min(...xs)) / 2 - canvas.width / 2)).toBeLessThan(canvas.width * 0.02)
          expect(Math.abs((Math.max(...ys) + Math.min(...ys)) / 2 - canvas.height / 2)).toBeLessThan(canvas.height * 0.02)
        }
      }
    })
  }

  test('the frame is the level\'s: it holds the tallest fan the level has, and no decision moves it', () => {
    for (const id of ['two-kinds', 'same-size'] as const) {
      const states = night(id).map(view)
      const room = fanRoom(states[0])
      for (const v of states) expect(fanRoom(v)).toBe(room)
      const most = Math.max(...states[0].stations.map((group) => group.layers + group.padLayers))
      expect(room).toBeGreaterThan(fanTop(most))
    }
  })

  test('in the narrowest canvas, a page of the largest pool that the front shot shows is 8 px or more across, and of the usual ones 20 px', () => {
    const canvas = CANVASES[1]
    const size = (pages: number) => {
      const g = geometryOf(pages, 16, 4)
      const at = cameraFor(presetsFor(g, canvas, ROOM)[0], canvas)
      const a = at(g.width / 2 / PX, PAGE_TOP / PX, g.rack.z1 / PX)
      const b = at((g.width / 2 + PAGE.size) / PX, PAGE_TOP / PX, g.rack.z1 / PX)
      return Math.abs(b.x - a.x)
    }
    expect(size(44)).toBeGreaterThanOrEqual(20)
    expect(size(288)).toBeGreaterThanOrEqual(8)
  })

  test('a fan of the most layers a level has stands within the frame in the front shot', () => {
    const v = view(night('same-size')[0])
    expect(Math.max(...v.stations.map((group) => group.layers + group.padLayers))).toBeLessThanOrEqual(40)
  })
})

describe("what depth shows, without a click: the request admitted last threads its pages, and one of them stands open", () => {
  const states = night('two-kinds').map(view)
  const busy = states.find((v) => v.running.length >= 2 && v.stations.length > 1) as PoolView

  // Of a request's pages, the first in its table's order among those in the frontmost row it holds.
  const nearest = (req: number, station: number | null) => {
    const pages = tableFor(busy, req, station).flat()
    const row = Math.max(...pages.map((page) => Math.floor(page.id / busy.cols)))
    return pages.find((page) => Math.floor(page.id / busy.cols) === row)
  }

  test('with nothing selected, the last request\'s page nearest the front fans; a request selected fans its own; a page selected fans itself', () => {
    const last = busy.running[busy.running.length - 1]
    const head = nearest(last, null) as PoolView['pans'][number]
    expect(headPage(busy, last, null)).toBe(head.id)
    expect(rackOf(busy, NONE).fan?.page).toBe(head.id)
    const first = busy.running[0]
    expect(rackOf(busy, { ...NONE, pick: { kind: 'request', id: first } }).fan?.page).toBe(nearest(first, null)?.id)
    const other = busy.pans.find((page) => page.station !== null && page.id !== head.id) as PoolView['pans'][number]
    expect(rackOf(busy, { ...NONE, pick: { kind: 'page', id: other.id } }).fan?.page).toBe(other.id)
    // One KV group: the first page the request holds in the group shown.
    for (let g = 0; g < busy.stations.length; g++) {
      expect(rackOf(busy, { ...NONE, station: g }).fan?.page ?? null).toBe(nearest(last, g)?.id ?? null)
    }
    // Nothing on the line, nothing open.
    expect(rackOf(states[0], NONE).fan).toBeNull()
  })

  test('the fan opens again when a selection takes it over, even on the same page', () => {
    const last = busy.running[busy.running.length - 1]
    const head = headPage(busy, last, null) as number
    expect(rackOf(busy, { ...NONE, pick: { kind: 'page', id: head } }).moment).not.toBe(rackOf(busy, NONE).moment)
  })

  test("a fan steps toward the middle of the rack, so its layers stay over the rack and clear of the region names at its left", () => {
    for (const v of states.filter((candidate) => candidate.pans.some((page) => page.station !== null))) {
      for (const page of v.pans.filter((candidate) => candidate.station !== null)) {
        const rack = rackOf(v, { ...NONE, pick: { kind: 'page', id: page.id } })
        const layers = rack.model.boxes.filter((box) => box.id.startsWith('fan/'))
        const at = pageBox(rack.geometry, page.id)
        expect((layers[0].x0 + layers[0].x1) / 2).toBeCloseTo((at.x0 + at.x1) / 2)
        for (const box of layers) {
          expect(box.x0).toBeGreaterThanOrEqual(rack.geometry.rack.x0 - PAGE.size)
          expect(box.x1).toBeLessThanOrEqual(rack.geometry.rack.x1 + PAGE.size)
        }
        // Its words stand over its top layer.
        const words = rack.model.labels.find((label) => label.id === 'fan/words')
        expect(words?.place).toBe('above')
        expect(words?.at[1]).toBeGreaterThanOrEqual(Math.max(...layers.map((box) => (box.y0 ?? 0) + box.height)))
      }
    }
  })

  test("no thread crosses a request's name: the name stands over its tile's far edge, every thread leaves the near edge, and an arch rises with the run toward the front, never with the run across", () => {
    for (const v of states.filter((candidate) => candidate.running.length > 0)) {
      for (const req of v.running) {
        const rack = rackOf(v, { ...NONE, pick: { kind: 'request', id: req } })
        const tile = slotBox(rack.geometry, v.running.indexOf(req))
        const name = rack.model.labels.find((label) => label.id === `chip/${req}`)
        expect(name?.place).toBe('above')
        expect(name?.at).toEqual([(tile.x0 + tile.x1) / 2, SLOT.height, tile.z0])
        const threads = threadsOf(rack.model.inks)
        for (let i = 0; i < threads.length; i += THREAD.pieces) {
          const first = threads[i]
          expect(first.z0).toBe(tile.z1)
          // The arch is the run toward the front's share: a thread to the far side of the rack rises no higher than one straight ahead.
          const last = threads[i + THREAD.pieces - 1]
          const top = Math.max(...threads.slice(i, i + THREAD.pieces).map((piece) => piece.y ?? 0))
          expect(top).toBeLessThanOrEqual(Math.max(SLOT.height, PAGE_TOP) + THREAD.arch + THREAD.perPx * (last.z1 - first.z0) + 1e-6)
        }
      }
    }
  })
})

describe('every label can be read: none lies on another, on a tile, or under a thread, from the front shot', () => {
  // The label boxes on the screen, from the label layer's places (src/scene/labels.ts) and the label styles' sizes (pool3d.css) [estimated:
  // 6.6 px a character for the label face, 7.2 for the fan's mono words on their paper slip, 15 px a line].
  type Box = readonly [number, number, number, number]
  const hit = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]
  const CANVASES: readonly Canvas[] = [
    { width: 782, height: 382 },
    { width: 782, height: 294 },
    { width: 736, height: 374 },
    { width: 645, height: 557 },
  ]

  for (const id of ['one-group', 'two-kinds', 'evict', 'same-size', 'state', 'adapters', 'manager'] as const) {
    test(`${id}: the opening shot and every page of the back row selected, at every canvas`, () => {
      const states = night(id).map(view)
      const first = states[0]
      const g = geometryOf(first.pans.length, first.cols, first.cap)
      for (const canvas of CANVASES) {
        const framing = framingFor(presetsFor(g, canvas, fanRoom(first))[0], canvas.width)
        const camera = new PerspectiveCamera(framing.fov, canvas.width / canvas.height, 0.05, 200)
        camera.position.set(...framing.position)
        camera.lookAt(...framing.target)
        camera.updateProjectionMatrix()
        camera.updateMatrixWorld()
        const at = (x: number, y: number, z: number): [number, number] => {
          const p = new Vector3(x / PX, y / PX, z / PX).project(camera)
          return [((p.x + 1) / 2) * canvas.width, ((1 - p.y) / 2) * canvas.height]
        }
        const boxOf = (label: { at: readonly number[]; text: string; place?: string; kind: string }): Box => {
          const [x, y] = at(label.at[0], label.at[1], label.at[2])
          const w = label.text.length * (label.kind === 'dim' ? 7.2 : 6.6) + (label.kind === 'dim' ? 8 : 0)
          const h = 15
          if (label.place === 'right') return [x + 6, y - h / 2, x + 6 + w, y + h / 2]
          if (label.place === 'left') return [x - 6 - w, y - h / 2, x - 6, y + h / 2]
          if (label.place === 'above') return [x - w / 2, y - 6 - h, x + w / 2, y - 6]
          return [x - w / 2, y - h / 2, x + w / 2, y + h / 2]
        }
        const picks = [null, ...first.pans.filter((page) => page.id < first.cols).map((page) => ({ kind: 'page' as const, id: page.id }))]
        states.forEach((v, s) => {
          if (s % 3 !== 0) return
          for (const pick of picks) {
            if (pick !== null && v.pans[pick.id].station === null) continue
            const where = `${canvas.width}x${canvas.height}, state ${s}, ${pick === null ? 'nothing selected' : `page ${pick.id + 1}`}`
            const model = rackOf(v, { ...NONE, pick }).model
            const boxes = model.labels.map((label) => [label.id, boxOf(label)] as const)
            for (const [label, box] of boxes) {
              expect(box[1], `${where}: ${label} under the box's top`).toBeGreaterThanOrEqual(0)
              expect(box[3], `${where}: ${label} over the box's foot`).toBeLessThanOrEqual(canvas.height)
            }
            for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) expect(hit(boxes[a][1], boxes[b][1]), `${where}: ${boxes[a][0]} on ${boxes[b][0]}`).toBe(false)
            const fan = boxes.find(([label]) => label === 'fan/words')
            if (fan !== undefined) {
              expect(fan[1][1], `${where}: the fan's words in the box`).toBeGreaterThanOrEqual(0)
              v.running.forEach((_, i) => {
                const tile = slotBox(g, i)
                const corners = [at(tile.x0, SLOT.height, tile.z0), at(tile.x1, SLOT.height, tile.z0), at(tile.x0, SLOT.height, tile.z1), at(tile.x1, SLOT.height, tile.z1)]
                const box: Box = [Math.min(...corners.map((p) => p[0])), Math.min(...corners.map((p) => p[1])), Math.max(...corners.map((p) => p[0])), Math.max(...corners.map((p) => p[1]))]
                expect(hit(fan[1], box), `${where}: the fan's words on tile ${i + 1}`).toBe(false)
              })
            }
            for (const [label, box] of boxes.filter(([label]) => label.startsWith('chip/'))) {
              for (const ink of model.inks) {
                for (const t of [0, 0.25, 0.5, 0.75, 1]) {
                  const [x, y] = at(ink.x0 + (ink.x1 - ink.x0) * t, (ink.y ?? 0) + ((ink.y1 ?? ink.y ?? 0) - (ink.y ?? 0)) * t, ink.z0 + (ink.z1 - ink.z0) * t)
                  expect(x > box[0] && x < box[2] && y > box[1] && y < box[3], `${where}: a thread through ${label}`).toBe(false)
                }
              }
            }
          }
        })
      }
    })
  }
})

describe("every page carries the 2D cell's glyph", () => {
  test('one glyph a page, the shape the 2D diagram and its legend give its state, on its top, or a free page\'s ring on its cell\'s floor', () => {
    for (const id of ['adapters', 'evict'] as const) {
      for (const state of night(id)) {
        const v = view(state)
        const rack = rackOf(v, NONE)
        expect(rack.glyphs).toHaveLength(v.pans.length)
        for (const glyph of rack.glyphs) {
          const page = v.pans[glyph.id]
          expect(glyph.shape).toBe(stateGlyph(page.state))
          const at = pageBox(rack.geometry, page.id)
          expect(glyph.x).toBeCloseTo((at.x0 + at.x1) / 2)
          expect(glyph.z).toBeCloseTo((at.z0 + at.z1) / 2)
          expect(glyph.y).toBeGreaterThan(page.state === 'free' ? WELL.height : PAGE_TOP)
          expect(glyph.size).toBeLessThan(PAGE.size)
        }
      }
    }
    // A page chosen to be evicted carries the evicted glyph, as its 2D cell does.
    const state = night('evict').find((candidate) => view(candidate).ask?.kind === 'evict') as PoolState
    const v = view(state)
    const ask = v.ask
    if (ask?.kind !== 'evict') throw new Error('an eviction is open')
    const glyph = rackOf(v, { ...NONE, chosen: [ask.candidates[0]] }).glyphs.find((candidate) => candidate.id === ask.candidates[0])
    expect(glyph?.shape).toBe(stateGlyph('evicted'))
  })
})

describe('the instances of the largest pool stay far under the tier caps (A§6.6: 10k at T1)', () => {
  test('boxes, wires, rules and segments of a whole night on the largest pool', () => {
    let most = 0
    for (const state of night('same-size')) {
      const v = view(state)
      const rack = rackOf(v, { ...NONE, pick: { kind: 'request', id: v.running[0] ?? 0 } })
      const m = rack.model
      most = Math.max(most, m.plates.length + m.boxes.length + m.wires.length * 6 + m.rules.length + m.inks.length)
    }
    expect(most).toBeLessThan(1500)
  })
})
