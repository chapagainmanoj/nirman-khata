import { describe, expect, it } from 'vitest'
import { adToBs } from './dates'
import { monthDays, monthInRange, monthLabel, monthOf, shiftMonth } from './months'

describe('calendar months', () => {
  it('lays out a BS month as its AD dates, first to last', () => {
    const m = monthOf('2026-05-04', 'bs')
    const days = monthDays(m)
    expect(adToBs(days[0])).toEqual({ year: m.year, month: m.month, day: 1 })
    expect(days).toContain('2026-05-04')
    expect(adToBs(days[days.length - 1]).day).toBe(days.length)
    expect(adToBs(days[days.length - 1]).month).toBe(m.month)
  })
  it('lays out an AD month', () => {
    expect(monthDays(monthOf('2026-02-10', 'ad'))).toHaveLength(28)
    expect(monthDays(monthOf('2026-02-10', 'ad'))[0]).toBe('2026-02-01')
  })
  it('steps across the year end', () => {
    expect(shiftMonth({ display: 'bs', year: 2082, month: 12 }, 1)).toEqual({ display: 'bs', year: 2083, month: 1 })
    expect(shiftMonth({ display: 'ad', year: 2026, month: 1 }, -1)).toEqual({ display: 'ad', year: 2025, month: 12 })
  })
  it('names the month in its own calendar', () => {
    expect(monthLabel({ display: 'ad', year: 2026, month: 5 })).toBe('May 2026')
    expect(monthLabel(monthOf('2026-05-04', 'bs'))).toBe('Baishakh 2083')
  })
})

describe('months the BS library covers', () => {
  it('stops at Chaitra 2090 and Baishakh 2000', () => {
    expect(monthInRange({ display: 'bs', year: 2090, month: 12 })).toBe(true)
    expect(monthInRange(shiftMonth({ display: 'bs', year: 2090, month: 12 }, 1))).toBe(false)
    expect(monthInRange({ display: 'bs', year: 1999, month: 12 })).toBe(false)
  })
  it('stops AD months that run past the last BS day', () => {
    expect(monthInRange({ display: 'ad', year: 2034, month: 3 })).toBe(true)
    expect(monthInRange({ display: 'ad', year: 2034, month: 4 })).toBe(false)
  })
})
