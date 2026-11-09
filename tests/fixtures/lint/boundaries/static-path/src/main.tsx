// Fixture: src/scene may import three, so the fence passes. The entry still reaches the scene along a static import, so the
// walk from the entry must fail, and it must print the chain.
import { Stage } from './scene/Stage'

console.log(Stage)
