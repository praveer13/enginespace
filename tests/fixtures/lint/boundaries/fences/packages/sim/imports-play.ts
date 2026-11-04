// Must fail: packages/sim imports nothing outside itself. The relative path is what a lint pattern on `@es/play` misses.
import { loop } from '../play/index'

export const reverse = loop
