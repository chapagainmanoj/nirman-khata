// Dates are stored as AD "YYYY-MM-DD" strings (Postgres `date`); BS is for
// display and input only (design §7). All conversions go through this module
// so the BS library can be replaced.
import NepaliDate from 'nepali-date-converter'
import { t } from './i18n'

export type DateDisplay = 'bs' | 'ad'
export type IsoDate = string // "YYYY-MM-DD" in AD

export const BS_MONTHS = [
  'Baishakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Asoj',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra',
] as const

const AD_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type BsDate = { year: number; month: number; day: number } // month 1-12

/** Years the BS library has month lengths for (nepali-date-converter: 2000-2090). */
export const BS_FIRST_YEAR = 2000
export const BS_LAST_YEAR = 2090

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function parseIso(iso: IsoDate): { y: number; m: number; d: number } {
  const match = ISO_RE.exec(iso)
  if (!match) throw new Error(`Invalid date: ${iso}`)
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
}

function pad(n: number, len = 2) {
  return String(n).padStart(len, '0')
}

/** Today's date in Asia/Kathmandu, whatever the device timezone is. */
export function todayKathmandu(now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

// The library works with local-time JS Dates; building them from (y, m, d)
// and reading back with getFullYear/getMonth/getDate avoids timezone drift.
export function adToBs(iso: IsoDate): BsDate {
  const { y, m, d } = parseIso(iso)
  const nd = new NepaliDate(new Date(y, m - 1, d))
  return { year: nd.getYear(), month: nd.getMonth() + 1, day: nd.getDate() }
}

export function bsToAd(bs: BsDate): IsoDate {
  const js = new NepaliDate(bs.year, bs.month - 1, bs.day).toJsDate()
  const iso = `${js.getFullYear()}-${pad(js.getMonth() + 1)}-${pad(js.getDate())}`
  const back = adToBs(iso)
  if (back.year !== bs.year || back.month !== bs.month || back.day !== bs.day) {
    throw new Error(`Invalid BS date: ${bs.year}-${bs.month}-${bs.day}`)
  }
  return iso
}

/** Number of days in a BS month (1-12). */
export function bsMonthDays(year: number, month: number): number {
  for (let day = 32; day >= 29; day--) {
    try {
      bsToAd({ year, month, day })
      return day
    } catch {
      // try a shorter month
    }
  }
  throw new Error(`Unknown BS month ${year}-${month}`)
}

/** First and last AD dates the BS calendar can show. */
export const BS_RANGE = { first: '1943-04-14', last: '2034-04-13' } as const

/** Whether a date can be shown in BS; outside it, dates show in AD only instead of failing. */
export const inBsRange = (iso: IsoDate) => iso >= BS_RANGE.first && iso <= BS_RANGE.last

export function formatBs(iso: IsoDate, style: 'numeric' | 'long' = 'numeric'): string {
  const bs = adToBs(iso)
  return style === 'numeric'
    ? `${bs.year}-${pad(bs.month)}-${pad(bs.day)}`
    : `${bs.day} ${BS_MONTHS[bs.month - 1]} ${bs.year}`
}

export function formatAd(iso: IsoDate): string {
  const { y, m, d } = parseIso(iso)
  return `${d} ${AD_MONTHS[m - 1]} ${y}`
}

/** One calendar, as the user prefers (lists). */
export function formatDate(iso: IsoDate | null | undefined, display: DateDisplay): string {
  if (!iso) return ''
  return display === 'bs' && inBsRange(iso) ? formatBs(iso, 'long') : formatAd(iso)
}

/** Both calendars, preferred first (documents, key screens): "23 Asoj 2083 · 9 Oct 2026". */
export function formatDual(iso: IsoDate | null | undefined, display: DateDisplay): string {
  if (!iso) return ''
  const ad = formatAd(iso)
  if (!inBsRange(iso)) return ad
  const bs = formatBs(iso, 'long')
  return display === 'bs' ? `${bs} · ${ad}` : `${ad} · ${bs}`
}

/** A moment in Kathmandu time, e.g. "24 Asoj 2083, 1:50 am". No seconds; day and month never ambiguous. */
export function formatDateTime(ts: string | null | undefined, display: DateDisplay): string {
  if (!ts) return ''
  const at = new Date(ts)
  const time = at.toLocaleTimeString('en-US', { timeZone: 'Asia/Kathmandu', hour: 'numeric', minute: '2-digit' }).toLowerCase()
  return `${formatDate(todayKathmandu(at), display)}, ${time}`
}

/** Nepali fiscal year (Shrawan 1 to Asar end), e.g. "2082/83". */
export function fiscalYear(iso: IsoDate): string {
  const bs = adToBs(iso)
  const start = bs.month >= 4 ? bs.year : bs.year - 1
  return `${start}/${pad((start + 1) % 100)}`
}

/** First and last AD dates of a fiscal year label like "2082/83". */
export function fiscalYearRange(label: string): { start: IsoDate; end: IsoDate } {
  const start = Number(label.slice(0, 4))
  return {
    start: bsToAd({ year: start, month: 4, day: 1 }),
    end: bsToAd({ year: start + 1, month: 3, day: bsMonthDays(start + 1, 3) }),
  }
}

/** The AD date n days after (or before, if negative) an AD date. */
export function addDays(iso: IsoDate, n: number): IsoDate {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** "today", "in 2 days", "3 days ago": how far a date is from today (Kathmandu). */
export function relativeDay(iso: IsoDate, today: IsoDate = todayKathmandu()): string {
  const n = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  if (n === 0) return t('date.rel.today')
  if (n === 1) return t('date.rel.tomorrow')
  if (n === -1) return t('date.rel.yesterday')
  return n > 0 ? t('date.rel.inDays', { n }) : t('date.rel.daysAgo', { n: -n })
}

/** Every AD date from `from` to `to`, inclusive; empty when `to` is before `from`. */
export function dateRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = []
  for (let d = from; d <= to && out.length < 366; d = addDays(d, 1)) out.push(d)
  return out
}
