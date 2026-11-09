/*
 * W0-T15: the /design specimen's layout, which both the 3D scene and its 2D twin draw. Every mark is the step-loop model's
 * own output on the synthetic tick card, so these tests hold the drawing to the run: one place per clip per fire, the
 * forms counted from the run's steps, and the long night's instance count that the draw-call check needs.
 */
import { describe, expect, test } from 'bun:test'
import { initialFired, LONG_NIGHT_FIRES, SPECIMEN_PRESETS, specimenLayout, specimenRun, specimenWorkload, type SpecimenSettings } from '@/scene/specimen-layout'

const SHORT_OFF: SpecimenSettings = { clips: 4, overlap: false }
const SHORT_ON: SpecimenSettings = { clips: 4, overlap: true }
const NIGHT: SpecimenSettings = { clips: 64, overlap: false }

describe('the specimen runs the model', () => {
  test('the same settings give the same run, byte for byte', () => {
    expect(JSON.stringify(specimenRun(SHORT_OFF))).toBe(JSON.stringify(specimenRun(SHORT_OFF)))
    expect(JSON.stringify(specimenWorkload(64))).toBe(JSON.stringify(specimenWorkload(64)))
  })

  test('the workloads are synthetic, and say so', () => {
    expect(specimenWorkload(4).origin).toEqual({ kind: 'synthetic' })
    expect(specimenWorkload(64).origin).toEqual({ kind: 'synthetic' })
  })

  test('without overlap the line goes dark before fires; with it the dark closes and EOS stops bin a token', () => {
    const off = specimenLayout(specimenRun(SHORT_OFF), SHORT_OFF, 12)
    const on = specimenLayout(specimenRun(SHORT_ON), SHORT_ON, 12)
    expect(off.totals.dark).toBeGreaterThan(0)
    expect(on.totals.dark).toBeLessThan(off.totals.dark)
    expect(off.totals.binned).toBe(0)
    expect(on.totals.binned).toBeGreaterThan(0)
  })
})

describe('the layout draws the run', () => {
  const run = specimenRun(SHORT_OFF)
  const fired = initialFired(4, run)
  const layout = specimenLayout(run, SHORT_OFF, fired)

  test('one place per clip on every fire on screen, in the form the run says', () => {
    const places = layout.cells
    expect(places).toHaveLength(layout.fires.length * 4)
    for (const fire of layout.fires) {
      const mine = places.filter((cell) => cell.id.startsWith(`${fire.id}/`))
      expect(mine.filter((cell) => cell.form === 'solid')).toHaveLength(fire.plates)
      expect(mine.filter((cell) => cell.form === 'hollow')).toHaveLength(fire.binned)
      expect(mine.filter((cell) => cell.form === 'groove')).toHaveLength(fire.empty)
      expect(fire.plates + fire.binned + fire.empty).toBe(4)
    }
  })

  test('each fire is a slab on the line, as long as its forward; dark stretches are hollow', () => {
    for (const fire of layout.fires) {
      const slab = layout.spans.find((span) => span.id === fire.id)
      expect(slab).toBeDefined()
      expect(slab?.role).toBe('lane-gpu')
      expect((slab?.end ?? 0) - (slab?.start ?? 0)).toBe(fire.ticks)
    }
    for (const dark of layout.spans.filter((span) => span.id.startsWith('dark-'))) expect(dark.form).toBe('hollow')
    expect(layout.spans.some((span) => span.role === 'lane-cpu')).toBe(true)
  })

  test('the fires on screen are the first `fired` steps, and the clock is where the last one ended', () => {
    expect(layout.fires.at(-1)?.index).toBe(fired - 1)
    expect(layout.window.now).toBe(layout.totals.clock)
  })

  test('the forward tick card: 4 ticks a fire, one more when it admits a request (GAMES.md §3.1)', () => {
    for (const fire of layout.fires) expect([4, 5]).toContain(fire.ticks)
  })

  test("the rail holds one ticket per plate of the latest fire, each labelled with a request's number", () => {
    const last = layout.fires.at(-1)
    expect(layout.tickets).toHaveLength(last?.plates ?? 0)
    const labels = layout.anchors.filter((anchor) => anchor.kind === 'ticket')
    expect(labels).toHaveLength(layout.tickets.length)
    for (const label of labels) expect(label.text).toMatch(/^\d{2,}$/)
  })

  test('the legend tray holds the four forms', () => {
    expect(layout.legend.map((cell) => cell.form)).toEqual(['solid', 'groove', 'hollow', 'marked'])
  })

  test('three heat lamps hang over the pass, above the rail, and the tick labels ride the track', () => {
    expect(layout.lamps).toHaveLength(3)
    for (const lamp of layout.lamps) expect(lamp.at[1]).toBeGreaterThan(1)
    for (const tick of layout.anchors.filter((anchor) => anchor.kind === 'tick')) expect(tick.frame).toBe('track')
  })
})

describe('the long night', () => {
  const run = specimenRun(NIGHT)
  const layout = specimenLayout(run, NIGHT, initialFired(64, run))

  test(`shows ${LONG_NIGHT_FIRES} fires of 64 clips: more than 10,000 instances for the draw-call check`, () => {
    expect(layout.fires).toHaveLength(LONG_NIGHT_FIRES)
    expect(layout.cells.length).toBe(LONG_NIGHT_FIRES * 64)
    expect(layout.cells.length + layout.spans.length).toBeGreaterThanOrEqual(10_000)
  })

  test('hangs no tickets: 64 would not read, and the mirror lists every fire', () => {
    expect(layout.tickets).toHaveLength(0)
  })
})

describe('the camera presets', () => {
  test("GAMES.md §2.6's three shots of Service, the Compare shot orthographic", () => {
    expect(SPECIMEN_PRESETS.map((preset) => preset.label)).toEqual(['Over the shoulder', 'Side of the pass', 'Under the lamps'])
    expect(SPECIMEN_PRESETS.map((preset) => preset.projection)).toEqual(['perspective', 'orthographic', 'perspective'])
    expect(SPECIMEN_PRESETS[0].shot).toBe('establish')
  })

  test('the establishing shot looks down on the pass at about 25 degrees', () => {
    const { position, target } = SPECIMEN_PRESETS[0]
    const elevation = (Math.atan2(position[1] - target[1], Math.hypot(position[0] - target[0], position[2] - target[2])) * 180) / Math.PI
    expect(elevation).toBeGreaterThan(20)
    expect(elevation).toBeLessThan(32)
  })
})
