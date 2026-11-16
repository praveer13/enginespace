/**
 * A count of the learner's own events: a number in the figure face, and a dash where there is none. It counts what this browser holds and
 * measures nothing, so it carries no tag and no stamp (REDESIGN 2.4: "A count of the learner's own events carries no tag").
 */
export function Count({ value }: { value: number }) {
  if (value === 0) {
    return (
      <data className="es-count es-count--none" value="0">
        <span aria-hidden="true">—</span>
        <span className="sr-only">none</span>
      </data>
    )
  }
  return (
    <data className="es-count" value={String(value)}>
      {value.toLocaleString('en-US')}
    </data>
  )
}
