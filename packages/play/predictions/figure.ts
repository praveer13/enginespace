/**
 * How a working line writes a number: thousands in groups of three, as the page's readouts group them, and a decimal point with at most
 * two places. Shared by the parts that hold the at-commit workings (D-067), so that a line reads the same in every module.
 */
export function figure(value: number): string {
  const whole = Number(value.toFixed(2))
  const [integer, fraction] = Math.abs(whole).toString().split('.')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${whole < 0 ? '−' : ''}${grouped}${fraction === undefined ? '' : `.${fraction}`}`
}
