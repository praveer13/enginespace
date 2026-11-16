import { BuildThis } from './full/BuildThis'
import { Compose } from './full/Compose'
import { Production } from './full/Production'
import type { FullRun } from './full/types'

/*
 * What follows a full level's result (GAMES.md §3, "Compose and In production"): your configuration as the pinned engines read it, run on
 * fresh numbers beside the reference; the engines' own settings behind each lever, cited as claims; and what to run on a real engine. Each
 * is a disclosure under the debrief, shut until the learner opens it, and this whole part is a chunk of its own, loaded with the result.
 */
export default function After({ run }: { run: FullRun }) {
  return (
    <div className="es-fd-after" data-full-after="">
      <details className="es-fd-after__item" data-full-compose-details="">
        <summary>Your configuration, as the engines read it</summary>
        <Compose run={run} />
      </details>
      <details className="es-fd-after__item" data-full-production-details="">
        <summary>In production: the pinned engines’ settings</summary>
        <Production level={run.view.level} />
      </details>
      <details className="es-fd-after__item" data-full-build-details="">
        <summary>Build this on a real engine</summary>
        <BuildThis level={run.view.level} />
      </details>
    </div>
  )
}
