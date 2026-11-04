// Type-checks: every number carries its tag, and a tick count is synthetic (tests/design/readout.test.ts).
import { Readout } from '@/design/components/Readout'

export const ticks = <Readout value={7} unit="ticks" tag="synthetic" />
export const measured = <Readout value={340} unit="µs" tag="measured" source="2026-11-03 at 8f8fbe1" />
export const share = <Readout value={96.4} digits={1} unit="%" tag="derived" />
