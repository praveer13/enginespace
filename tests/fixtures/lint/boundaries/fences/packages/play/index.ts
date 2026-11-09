// Passes: packages/play imports packages/sim and the types of packages/schema.
import type { Schema } from '../schema/index'
import { draw } from '../sim/index'

export const loop = (seed: number, schema: Schema): number => draw(seed) + Object.keys(schema).length
