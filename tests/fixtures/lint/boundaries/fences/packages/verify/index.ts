// Passes: packages/verify imports packages/sim and packages/schema, values and types.
import { schema } from '../schema/index'
import { draw } from '../sim/index'

export const check = (seed: number): boolean => draw(seed) > 0 && schema.kind === 'schema'
