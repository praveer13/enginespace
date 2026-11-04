// Must not type-check: ticks are always synthetic (D-048; tests/design/readout.test.ts).
import { Readout } from '@/design/components/Readout'

export const ticks = <Readout value={7} unit="ticks" tag="estimated" />
