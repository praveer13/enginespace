import { useId } from 'react'
import { CONFIDENCE_NAMES, CONFIDENCES } from '@es/play/items/types'
import type { Confidence } from '@es/play/items/types'
import { Button } from '@/design/components/Button'

/** How sure the learner is, said before a guess is committed: three plates, one pressed in. Optional, and never a gate. */
export function SurePlates({ value, onChange }: { value: Confidence | null; onChange: (value: Confidence | null) => void }) {
  const label = useId()
  return (
    <div className="es-guess__sure">
      <span className="es-guess__sure-label" id={label}>
        How sure are you?
      </span>
      <div role="group" aria-labelledby={label} className="es-guess__plates">
        {CONFIDENCES.map((tap) => (
          <Button key={tap} variant={value === tap ? 'ink' : 'plate'} aria-pressed={value === tap} onClick={() => onChange(value === tap ? null : tap)}>
            {CONFIDENCE_NAMES[tap]}
          </Button>
        ))}
      </div>
    </div>
  )
}
