import { useMemo } from 'react'
import type { FullLevelId } from '@es/play/loop/full/types'
import { useClaims } from '@/content/load'
import { ClaimChip } from '@/content/render/ClaimChip'
import { renderEnv, todayIso } from '@/content/render/model'
import { Ticket } from '@/design/components/Ticket'
import { PRODUCTION, type Line } from './production-lines'

/*
 * In production (GAMES.md §3, "Compose and In production"; D-041): the pinned engines' settings behind each lever the level plays, cited
 * as claims, each with its source and the day it was read, because an upstream fact belongs to a pin and not to this page. Each line says
 * what its claims say and no more; the claims hold the source's own words.
 */

export function ProductionLines({ lines }: { lines: readonly Line[] }) {
  const claims = useClaims(true)
  const env = useMemo(() => renderEnv([], claims.status === 'ready' ? claims.value : null, todayIso()), [claims])
  return (
    <>
      {claims.status === 'loading' ? <p role="status">Reading the sources…</p> : null}
      <ul className="es-full-production" data-claims={lines.flatMap((line) => line.claims).length}>
        {lines.map((line) => (
          <li key={line.setting}>
            <p>
              <code>{line.setting}</code>
            </p>
            <p>{line.says}</p>
            <ul className="es-full-production__claims">
              {line.claims.map((id) => (
                <li key={id}>
                  <ClaimChip id={id} env={env} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  )
}

export function Production({ level }: { level: FullLevelId }) {
  return (
    <Ticket as="section" width="full" hole={false} titleAs="h3" title="In production: the pinned engines' settings" data-full-production="">
      <p>The browser world is a model, and the real engines are the judge. These are the settings behind tonight's levers, as the engines stood at the pins on the day each claim was read.</p>
      <ProductionLines lines={PRODUCTION[level]} />
    </Ticket>
  )
}
