// Calendar months in BS or AD, as runs of AD dates (req §17). Used by the month grid.
import { addDays, adToBs, BS_FIRST_YEAR, BS_LAST_YEAR, BS_RANGE, bsMonthDays, bsToAd, BS_MONTHS, type DateDisplay, type IsoDate } from './dates'

export type MonthRef = { display: DateDisplay; year: number; month: number } // month 1-12

const AD_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function monthOf(iso: IsoDate, display: DateDisplay): MonthRef {
  if (display === 'bs') {
    const bs = adToBs(iso)
    return { display, year: bs.year, month: bs.month }
  }
  return { display, year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) }
}

/** Every day of the month, first to last, as AD dates. */
export function monthDays(m: MonthRef): IsoDate[] {
  if (m.display === 'bs') {
    const first = bsToAd({ year: m.year, month: m.month, day: 1 })
    return Array.from({ length: bsMonthDays(m.year, m.month) }, (_, i) => addDays(first, i))
  }
  const n = new Date(Date.UTC(m.year, m.month, 0)).getUTCDate()
  return Array.from({ length: n }, (_, i) => `${m.year}-${String(m.month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`)
}

export function shiftMonth(m: MonthRef, by: number): MonthRef {
  const index = m.year * 12 + (m.month - 1) + by
  return { ...m, year: Math.floor(index / 12), month: (index % 12) + 1 }
}

export function monthLabel(m: MonthRef): string {
  return m.display === 'bs' ? `${BS_MONTHS[m.month - 1]} ${m.year}` : `${AD_MONTHS[m.month - 1]} ${m.year}`
}


/** Whether the month lies inside the years the BS library covers (both calendars show BS days). */
export function monthInRange(m: MonthRef): boolean {
  if (m.display === 'bs') return m.year >= BS_FIRST_YEAR && m.year <= BS_LAST_YEAR
  const first = `${m.year}-${String(m.month).padStart(2, '0')}-01`
  const last = monthDays(m).at(-1)!
  return first >= BS_RANGE.first && last <= BS_RANGE.last
}
