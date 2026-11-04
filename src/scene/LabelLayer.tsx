import clsx from 'clsx'
import { useLayoutEffect } from 'react'
import type { LabelStore } from './label-store'
import type { LabelSpec } from './labels'

/*
 * LabelLayer (ARCHITECTURE §6.4): the scene's text, as DOM over the canvas. Each label is a node the projector places on
 * its anchor's projection; it renders hidden until it has been placed, so no label ever flashes at the corner. The layer
 * takes no pointer events, so picks reach the canvas beneath. It sits inside the Stage's aria-hidden scene box: the mirror
 * carries every number the scene draws, so the labels are for the eye.
 */

export interface LabelLayerProps {
  store: LabelStore
  labels: readonly LabelSpec[]
}

export function LabelLayer({ store, labels }: LabelLayerProps) {
  useLayoutEffect(() => {
    store.setSpecs(labels)
  }, [store, labels])
  return (
    <div className="es-labels">
      {labels.map((label) => (
        <div key={label.id} ref={(node) => store.attach(label.id, node)} className={clsx('es-label', label.className)} data-place={label.place ?? 'center'}>
          {label.content}
        </div>
      ))}
    </div>
  )
}
