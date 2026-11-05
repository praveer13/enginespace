import type { PanView, PoolPredict, PoolView, StationView } from '@es/play/pool/types'

/** The glyph that draws a station: a circle for full attention, a square for a sliding window, a hexagon for state. The kind is the code. */
const KIND_GLYPH = { full: 'circle', sliding: 'square', state: 'hexagon' } as const

export function stationGlyph(station: StationView) {
  return KIND_GLYPH[station.kind]
}

const STATE_WORDS: Record<PanView['state'], string> = {
  free: 'bare',
  used: 'held',
  cached: 'cached',
  shared: 'shared',
  adapter: "a kit's",
  evicted: 'dumped',
}

/** What a pan says about itself, for the pointer: its place, form, tape and station. */
export function panTitle(pan: PanView, view: PoolView): string {
  const where = `pan ${pan.id + 1}`
  const station = pan.station === null ? '' : `, station ${view.stations[pan.station].id}`
  const tape = pan.tape === null ? '' : `, tape ${pan.tape}`
  return `${where}: ${STATE_WORDS[pan.state]}${station}${tape}`
}

/** What a prediction counts, in the kitchen's word: the engine's pages are pans. */
export const unitWord = (unit: PoolPredict['unit']): string => (unit === 'pages' ? 'pans' : unit)
