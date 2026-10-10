import { describe, expect, it } from 'vitest'
import {
  addDays, adToBs, bsMonthDays, bsToAd, dateRange, fiscalYear, fiscalYearRange, formatAd, formatBs, formatDateTime, formatDual, todayKathmandu,
} from './dates'

// Reference dates from the official calendar (Nepali new year and fiscal-year start).
const KNOWN: Array<[string, { year: number; month: number; day: number }]> = [
  ['2023-04-14', { year: 2080, month: 1, day: 1 }],
  ['2024-04-13', { year: 2081, month: 1, day: 1 }],
  ['2024-07-16', { year: 2081, month: 4, day: 1 }],
  ['2025-04-14', { year: 2082, month: 1, day: 1 }],
  ['2025-07-17', { year: 2082, month: 4, day: 1 }],
  ['2026-04-14', { year: 2083, month: 1, day: 1 }],
]

describe('BS <-> AD conversion', () => {
  it.each(KNOWN)('%s AD is %o BS and back', (ad, bs) => {
    expect(adToBs(ad)).toEqual(bs)
    expect(bsToAd(bs)).toBe(ad)
  })

  it('round-trips every day across three years', () => {
    const start = new Date(Date.UTC(2024, 0, 1))
    for (let i = 0; i < 365 * 3; i++) {
      const d = new Date(start.getTime() + i * 86_400_000)
      const iso = d.toISOString().slice(0, 10)
      expect(bsToAd(adToBs(iso))).toBe(iso)
    }
  })

  it('rejects a BS day that does not exist', () => {
    const days = bsMonthDays(2083, 1)
    expect(() => bsToAd({ year: 2083, month: 1, day: days + 1 })).toThrow()
  })

  it('BS months have 29 to 32 days', () => {
    for (let m = 1; m <= 12; m++) {
      const n = bsMonthDays(2082, m)
      expect(n).toBeGreaterThanOrEqual(29)
      expect(n).toBeLessThanOrEqual(32)
    }
  })
})

describe('fiscal year', () => {
  it('changes on Shrawan 1', () => {
    expect(fiscalYear('2025-07-16')).toBe('2081/82')
    expect(fiscalYear('2025-07-17')).toBe('2082/83')
    expect(fiscalYear('2026-04-14')).toBe('2082/83') // new BS year, same fiscal year
  })

  it('gives the AD range of a fiscal year', () => {
    const range = fiscalYearRange('2082/83')
    expect(range.start).toBe('2025-07-17')
    expect(fiscalYear(range.end)).toBe('2082/83')
    const next = new Date(range.end + 'T00:00:00Z')
    next.setUTCDate(next.getUTCDate() + 1)
    expect(fiscalYear(next.toISOString().slice(0, 10))).toBe('2083/84')
  })
})

describe('formatting', () => {
  it('formats BS and AD', () => {
    expect(formatBs('2026-04-14')).toBe('2083-01-01')
    expect(formatBs('2026-04-14', 'long')).toBe('1 Baishakh 2083')
    expect(formatAd('2026-10-09')).toBe('9 Oct 2026')
  })

  it('shows both calendars with the preferred one first', () => {
    expect(formatDual('2026-04-14', 'bs')).toBe('1 Baishakh 2083 · 14 Apr 2026')
    expect(formatDual('2026-04-14', 'ad')).toBe('14 Apr 2026 · 1 Baishakh 2083')
  })

  it('shows a moment as a Kathmandu date and time without seconds', () => {
    // 20:05 UTC on 9 Oct is 1:50 am on 10 Oct in Kathmandu (UTC+5:45).
    expect(formatDateTime('2026-10-09T20:05:29Z', 'bs')).toBe('24 Asoj 2083, 1:50 am')
    expect(formatDateTime('2026-10-09T20:05:29Z', 'ad')).toBe('10 Oct 2026, 1:50 am')
  })
})

describe('todayKathmandu', () => {
  it('uses Nepal time, not the device timezone', () => {
    // 2026-10-09 20:00 UTC is already 10 Oct in Kathmandu (UTC+05:45).
    expect(todayKathmandu(new Date('2026-10-09T20:00:00Z'))).toBe('2026-10-10')
    expect(todayKathmandu(new Date('2026-10-09T18:00:00Z'))).toBe('2026-10-09')
  })
})

describe('addDays and dateRange', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('lists a week inclusive of both ends', () => {
    expect(dateRange('2026-05-11', '2026-05-17')).toHaveLength(7)
    expect(dateRange('2026-05-11', '2026-05-11')).toEqual(['2026-05-11'])
    expect(dateRange('2026-05-12', '2026-05-11')).toEqual([])
  })
})
