import { Readout } from '@/design/components/Readout'
import type { NumberTag } from '@/design/components/Readout'

/**
 * A size in bytes, printed through the readout in the largest decimal unit that keeps it above 1: `25.8 GB`, `987.7 MB`, `4.1 KB`, `12 B`.
 * The unit is decimal because the readout's units are (a gigabyte is 1,000 megabytes), so a card's 24 GiB prints as `25.8 GB`.
 */
export function Bytes({ value, tag = 'unverified', source }: { value: number; tag?: NumberTag; source?: string }) {
  if (value >= 1e9) return <Readout value={value / 1e9} digits={1} unit="GB" tag={tag} source={source} size="sm" />
  if (value >= 1e6) return <Readout value={value / 1e6} digits={1} unit="MB" tag={tag} source={source} size="sm" />
  if (value >= 1e3) return <Readout value={value / 1e3} digits={1} unit="KB" tag={tag} source={source} size="sm" />
  return <Readout value={value} unit="B" tag={tag} source={source} size="sm" />
}
