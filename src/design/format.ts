/** The printed form of a number: grouped by thousands, fixed digits, zero-padded when asked (the printer numbers its tickets). */
export function formatReadout(value: number, digits = 0, pad?: number): string {
  if (!Number.isFinite(value)) return '—'
  const negative = value < 0
  const fixed = Math.abs(value).toFixed(digits)
  const [whole, fraction] = fixed.split('.')
  const padded = pad ? whole.padStart(pad, '0') : whole
  const grouped = pad ? padded : padded.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '−' : ''}${grouped}${fraction ? `.${fraction}` : ''}`
}
