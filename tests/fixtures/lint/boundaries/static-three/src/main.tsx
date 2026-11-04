// Fixture for tests/lint/boundaries.test.ts. The entry reaches a page that imports three at the top of the file, so three
// would load before the first paint. verify:boundaries must fail on this tree.
import { Page } from './pages/Page'

console.log(Page)
