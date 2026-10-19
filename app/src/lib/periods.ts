// Date filters for long lists: this month, last month, this fiscal year or picked dates, in the
// company's calendar (a BS month is not an AD month). Dates are AD, inclusive (req §18).
import { fiscalYear, fiscalYearRange, type DateDisplay, type IsoDate } from './dates'
import { t } from './i18n'
import { monthDays, monthLabel, monthOf, shiftMonth } from './months'

export type Period = 'any' | 'this-month' | 'last-month' | 'this-year' | 'custom'
export const PERIODS: Period[] = ['any', 'this-month', 'last-month', 'this-year', 'custom']

export type DateRange = { from?: IsoDate; to?: IsoDate }

export const isPeriod = (v: string | null): v is Period => PERIODS.includes(v as Period)

/** The AD dates a period covers; picked dates may leave either end open. */
export function periodRange(p: Period, today: IsoDate, display: DateDisplay, picked: DateRange = {}): DateRange {
  if (p === 'this-month' || p === 'last-month') {
    const days = monthDays(shiftMonth(monthOf(today, display), p === 'last-month' ? -1 : 0))
    return { from: days[0], to: days.at(-1) }
  }
  if (p === 'this-year') {
    const { start, end } = fiscalYearRange(fiscalYear(today))
    return { from: start, to: end }
  }
  if (p === 'custom') {
    const { from, to } = picked
    // Dates picked the wrong way round still mean the days between them.
    return from && to && from > to ? { from: to, to: from } : { from: from || undefined, to: to || undefined }
  }
  return {}
}

/** "This month (Kartik 2083)": the name says which month, so nobody has to work it out. */
export function periodLabel(p: Period, today: IsoDate, display: DateDisplay): string {
  if (p === 'this-month') return t('period.thisMonth', { month: monthLabel(monthOf(today, display)) })
  if (p === 'last-month') return t('period.lastMonth', { month: monthLabel(shiftMonth(monthOf(today, display), -1)) })
  if (p === 'this-year') return t('period.thisYear', { year: fiscalYear(today) })
  if (p === 'custom') return t('period.custom')
  return t('period.any')
}
