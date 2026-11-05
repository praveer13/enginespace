import { DISPATCH_TABLES } from '@es/sim/steploop'
import { Ticket } from '@/design/components/Ticket'
import { ProductionLines } from './full/Production'
import { PRODUCTION } from './full/production-lines'

/*
 * The `keys` level's card (GAMES.md §3.2; D-041; Q-10): the level waits for the owner's dispatcher tables. It teaches which adapter counts
 * to capture under a memory budget, and so grades a learner against the model's port of vLLM's two dispatchers; a port that nothing has
 * held to the pinned code's own answers must not grade anyone. The card says so in the kitchen's words and the engine's, and shows the
 * facts the level's In-production card will cite, which are claims and wait for nothing.
 */
export function KeysWaiting() {
  return (
    <div className="flex max-w-3xl flex-col gap-6" data-keys-waiting={DISPATCH_TABLES.status}>
      <Ticket as="section" width="full" hole={false} head="Keys" meta="86'd tonight" titleAs="h2" title="Waiting for the owner's tables" lamp>
        <p className="es-type-body">
          This level drills routines per count of recipe kits: which adapter counts to capture as CUDA graphs when their space comes out of the reach-in before its pans are
          counted. Every fire looks its routine up by a key, and the key is the runner's: MRV2's descriptor, or the legacy runner's, with has_lora.
        </p>
        <p className="es-type-body">
          The level grades you against the model's port of vLLM's two dispatchers, and a port is only as good as the pinned code's own answers. Those answers come from the owner
          running <code>{DISPATCH_TABLES.script}</code> at {DISPATCH_TABLES.pin}, which writes <code>{DISPATCH_TABLES.table}</code>. Until the owner commits it ({DISPATCH_TABLES.question}), the level stays closed.
        </p>
      </Ticket>
      <Ticket as="section" width="full" hole={false} titleAs="h3" title="In production: the keys at the pins">
        <ProductionLines lines={PRODUCTION.keys} />
      </Ticket>
    </div>
  )
}
