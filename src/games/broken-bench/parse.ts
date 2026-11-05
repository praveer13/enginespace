/** Whole milliseconds, or a decimal one, as a person types it: commas and spaces allowed. Null for anything that is not a positive number. */
export function parseMs(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, '')
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) && value > 0 ? value : null
}
