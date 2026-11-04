// Passes: packages/sim imports kernelspace's vendored rng, and nothing else.
import { splitmix32 } from '../../vendor/kernelspace/src/lib/rng'

export const draw = (seed: number): number => splitmix32(seed)
