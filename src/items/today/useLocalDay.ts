import { useEffect, useState } from 'react'
import { dayOf, systemClock } from '@es/ledger'
import type { LocalDay } from '@es/ledger'

/** The learner's calendar day now, in their zone now: how the ledger itself freezes the day of an event. */
export function localDayNow(): LocalDay {
  const at = systemClock.nowIso()
  return dayOf(at, systemClock.tzOffsetMinutes(at))
}

/**
 * Today's day, read when the page mounts and again whenever the tab comes back to the front, so that a page left open overnight
 * does not keep yesterday's list. A list that has been started is not changed by it: the session is held by the page.
 */
export function useLocalDay(): LocalDay {
  const [day, setDay] = useState(localDayNow)
  useEffect(() => {
    const refresh = () => setDay(localDayNow())
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [])
  return day
}
