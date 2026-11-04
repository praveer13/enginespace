// Must fail: packages/play imports only the types in packages/schema, never its values.
import { schema } from '../schema/index'

export const kind = schema.kind
