// Dates are stored as AD "YYYY-MM-DD" strings (Postgres `date`); BS is for
// display and input only (design §7). All conversions go through this module
// so the BS library can be replaced.
import NepaliDate from 'nepali-date-converter'

export type DateDisplay = 'bs' | 'ad'
export type IsoDate = string // "YYYY-MM-DD" in AD

export const BS_MONTHS = [
  'Baishakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Asoj',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra',
] as const

const AD_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type BsDate = { year: number; month: number; day: number } // month 1-12

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
  return display === 'bs' ? `${formatBs(iso)} BS` : formatAd(iso)
}

/** Both calendars, preferred first (documents, key screens): "2083-06-23 BS · 9 Oct 2026". */
export function formatDual(iso: IsoDate | null | undefined, display: DateDisplay): string {
  if (!iso) return ''
  const bs = `${formatBs(iso)} BS`
  const ad = formatAd(iso)
  return display === 'bs' ? `${bs} · ${ad}` : `${ad} · ${bs}`
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
