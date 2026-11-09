// Must fail: only the vendored rng and S5 card are pure. The forge is not.
import { run } from '../../vendor/kernelspace/src/lib/forge'

export const go = run
