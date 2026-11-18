import { Legend } from '@/design/components/Legend'

/** The legend under the step loop's diagram: the code's colours as they are used there, and the marker. A file of its own, so the front
 * page's first paint, which draws the diagram and no legend, does not carry it. */
export function LoopLegend() {
  return (
    <Legend
      className="es-lanes__legend"
      label="Legend: step loop"
      entries={[
        { slot: 'blue', word: 'CPU work: schedule' },
        { slot: 'yellow', word: 'sync: tokens read back' },
        { slot: 'green', word: 'GPU work: a forward, a token per slot' },
        { slot: 'white', word: 'idle, or an empty slot' },
      ]}
      now="the CPU’s clock"
    />
  )
}
