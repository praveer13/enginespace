/** The printer at work: three dots fed one line at a time. Static, at full ink, under reduced motion. */
export function PrintingDots() {
  return (
    <span className="es-printing" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}
