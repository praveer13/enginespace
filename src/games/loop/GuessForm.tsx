import { useState, type FormEvent } from 'react'
import { Button } from '@/design/components/Button'
import { Field } from '@/design/components/Field'

/*
 * The field and the reveal of demo level 3's view-only guess (Controls.tsx): a whole number of ticks, checked against the run's own count.
 * Nothing dispatches and nothing is stored; the guess goes with the level. A chunk of its own, loaded with that level.
 */
export default function GuessForm({ window, reveal }: { window: number; reveal: string }) {
  const [typed, setTyped] = useState('')
  const [said, setSaid] = useState<number | null>(null)
  const value = Number(typed)
  const valid = typed.trim() !== '' && Number.isInteger(value) && value >= 0 && value <= window
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (valid) setSaid(value)
  }
  if (said !== null)
    return (
      <p className="es-loopdock__reveal" role="status">
        You said {said}. {reveal}
      </p>
    )
  return (
    <form className="es-loopdock__guess-form" onSubmit={submit}>
      <Field label={`Ticks busy, 0 to ${window}`} numeric inputMode="numeric" value={typed} onChange={(event) => setTyped(event.target.value)} />
      <Button type="submit" variant="plate" disabled={!valid}>
        Check my guess
      </Button>
    </form>
  )
}
