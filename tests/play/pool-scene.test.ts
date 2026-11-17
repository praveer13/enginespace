/*
 * R-T41: the KV page pool's 3D rack (src/games/pool/scene-layout.ts, Scene3D.tsx; REDESIGN §2.8, §2.9). The scene draws a flat model of
 * the 2D diagram, made of the kit's flat-track primitives: a rack of page cells on a base plate, the running batch behind it, the waiting
 * queue in front. These tests hold it to the brief:
 *   - every page stands in its cell for its whole life: a page never moves, whatever the night does;
 *   - a page's state is a form as well as a colour: free hollow, in use solid, cached hatched, shared dotted, an adapter's grooved;
 *   - a selected page fans into the layers of its KV group, the padding layers last and hollow, and the page itself stays where it is;
 *   - a selected request shows a thread from its tile to each page of its block table, and a selected page a thread from each holder;
 *   - the amber ring falls on what the open ask may take, and on nothing else;
 *   - every word is a label (DOM), in the engine's terms, and the scene imports nothing from src/scene/props;
 *   - the three cameras hold the whole sheet at every pool size, at 1440 and at 390 px.
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
import { pageForm, pageRole, PAGE, PAGE_TOP, SHOTS, SLOT, THREAD, WAIT, WELL, fanOf, geometryOf, pageBox, presetsFor, rackOf, slotBox, threadedRequest, type Canvas } from '@/games/pool/scene-layout'
import { POOL_CAMERAS } from '@/games/pool/scene-presets'
import { tableFor } from '@/games/pool/focus'
import * as glyphWords from '@/games/pool/glyphs'
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
      const first = rackOf(view(states[0]), NONE).model.boxes.filter((box) => box.id.startsWith('page/'))
      for (const state of states) {
        const v = view(state)
        const pages = rackOf(v, NONE).model.boxes.filter((box) => box.id.startsWith('page/'))
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
        const boxes = rackOf(v, NONE).model.boxes
        for (const page of v.pans) {
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
    expect(model.boxes.filter((box) => box.id.startsWith('candidate/') && box.id.endsWith('/edge')).every((box) => box.role === 'lamp-ring')).toBe(true)
    const none = rackOf(view(states[0]), NONE).model
    expect(none.boxes.some((box) => box.role === 'lamp')).toBe(false)
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
    // A stem joins the page to its top layer.
    expect(rack.model.inks.some((ink) => ink.x0 === ink.x1 && ink.z0 === ink.z1 && ink.y1 !== undefined && ink.y1 > PAGE_TOP)).toBe(true)
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
    expect(rack.model.inks).toHaveLength(pages.length * THREAD.pieces)
    const g = rack.geometry
    const tile = slotBox(g, busy.running.indexOf(req))
    for (let i = 0; i < pages.length; i++) {
      const pieces = rack.model.inks.slice(i * THREAD.pieces, (i + 1) * THREAD.pieces)
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
    const whole = rackOf(busy, { ...NONE, pick: { kind: 'request', id: req } }).model.inks.length
    const counts = busy.stations.map((_, g) => rackOf(busy, { ...NONE, station: g, pick: { kind: 'request', id: req } }).model.inks.length)
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

  test("a request's tile can be picked, and so can a page; nothing else can", () => {
    const v = view(night('two-kinds')[6])
    const model = rackOf(v, NONE).model
    const picks = model.boxes.filter((box) => box.pick !== undefined).map((box) => box.pick as string)
    expect(picks.filter((pick) => pick.startsWith('page:'))).toHaveLength(v.pans.length)
    expect(picks.filter((pick) => pick.startsWith('req:'))).toHaveLength(v.running.length)
    expect(picks).toHaveLength(v.pans.length + v.running.length)
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

  test('the scene is a flat model on the kit: a Stage3D that says what is selected, and a key to the forms, in DOM', () => {
    expect(sources[3]).toMatch(/data-pool-key/)
    expect(sources[3]).toMatch(/data-pool-fan/)
    for (const words of ['hollow: free', 'solid: in use', 'hatched: cached', 'dotted: a prefix hit waits on it']) expect(sources[3]).toContain(words)
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
  const CANVASES: readonly Canvas[] = [
    { width: 870, height: 557 },
    { width: 356, height: 464 },
  ]

  test("the page's plates and the scene's presets are the same three, in the same order", () => {
    expect(presetsFor({ x0: 0, x1: 600, z0: 0, z1: 600 }, CANVASES[0]).map((preset) => preset.id)).toEqual(POOL_CAMERAS.map((camera) => camera.id))
    expect([...SHOTS]).toEqual(POOL_CAMERAS.map((camera) => camera.id))
    expect(POOL_CAMERAS.map((camera) => camera.label)).toEqual(['Front of the page pool', 'One KV group', 'From above'])
  })

  for (const canvas of CANVASES) {
    test(`at ${canvas.width} by ${canvas.height} px, every preset holds the whole sheet and the batch's tiles, at every pool size`, () => {
      for (const pages of POOLS) {
        const g = geometryOf(pages, 16, 4)
        const bounds = { x0: 0, x1: g.width, z0: 0, z1: g.depth }
        for (const preset of presetsFor(bounds, canvas)) {
          const framing = framingFor(preset, canvas.width)
          const camera = new PerspectiveCamera(framing.fov, canvas.width / canvas.height, 0.05, 200)
          camera.position.set(...framing.position)
          camera.up.set(0, 1, 0)
          camera.lookAt(...framing.target)
          camera.updateProjectionMatrix()
          camera.updateMatrixWorld()
          const at = (x: number, y: number, z: number) => {
            const v = new Vector3(x / PX, y / PX, z / PX).project(camera)
            return { x: ((v.x + 1) / 2) * canvas.width, y: ((1 - v.y) / 2) * canvas.height }
          }
          for (const [x, z] of [[0, 0], [g.width, 0], [0, g.depth], [g.width, g.depth]]) {
            const p = at(x, 0, z)
            expect(p.x, `${preset.id} ${pages} ${x},${z}`).toBeGreaterThanOrEqual(0)
            expect(p.x).toBeLessThanOrEqual(canvas.width)
            expect(p.y).toBeGreaterThanOrEqual(0)
            expect(p.y).toBeLessThanOrEqual(canvas.height)
          }
        }
      }
    })
  }

  test('on a phone a page of the largest pool that the front shot shows is 6 px or more across, and of the usual ones 12 px', () => {
    const canvas = CANVASES[1]
    const size = (pages: number) => {
      const g = geometryOf(pages, 16, 4)
      const front = presetsFor({ x0: 0, x1: g.width, z0: 0, z1: g.depth }, canvas)[0]
      const framing = framingFor(front, canvas.width)
      const camera = new PerspectiveCamera(framing.fov, canvas.width / canvas.height, 0.05, 200)
      camera.position.set(...framing.position)
      camera.up.set(0, 1, 0)
      camera.lookAt(...framing.target)
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
      const a = new Vector3(g.width / 2 / 1 / PX, PAGE_TOP / PX, g.depth / 2 / PX).project(camera)
      const b = new Vector3((g.width / 2 + PAGE.size) / PX, PAGE_TOP / PX, g.depth / 2 / PX).project(camera)
      return Math.abs(b.x - a.x) * canvas.width * 0.5
    }
    expect(size(44)).toBeGreaterThanOrEqual(12)
    expect(size(288)).toBeGreaterThanOrEqual(6)
  })

  test('a fan of the most layers a level has stands within the frame in the front shot', () => {
    const v = view(night('same-size')[0])
    expect(Math.max(...v.stations.map((group) => group.layers + group.padLayers))).toBeLessThanOrEqual(40)
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
