// Must fail: nothing imports content/ (only the content compiler reads it).
import tr2 from '../content/modules/tr2/module.md?raw'

export { tr2 }
