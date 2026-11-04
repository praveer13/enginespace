// Must fail: packages/verify imports packages/sim and packages/schema, not packages/play.
import { loop } from '../play/index'

export const replay = loop
