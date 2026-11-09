// Must not type-check: a number without its tag (tests/design/readout.test.ts).
import { Readout } from '@/design/components/Readout'

export const untagged = <Readout value={7} unit="steps" />
