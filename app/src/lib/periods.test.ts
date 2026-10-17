import { describe, expect, it } from 'vitest'
import { addDays, adToBs } from './dates'
import { periodLabel, periodRange } from './periods'
import { containsAny, searchTerm } from './search'

const today = '2026-10-17' // 31 Asoj 2083

describe('periodRange', () => {
  it('this month in BS runs from the 1st of Asoj to the last day of Asoj', () => {
    const { from, to } = periodRange('this-month', today, 'bs')
    expect(adToBs(from!)).toEqual({ year: 2083, month: 6, day: 1 })
    expect(adToBs(to!)).toMatchObject({ year: 2083, month: 6 })
    expect(adToBs(addDays(to!, 1))).toEqual({ year: 2083, month: 7, day: 1 })
    expect(from! <= today && today <= to!).toBe(true)
  })

  it('last month in BS is Bhadra, also across the year end', () => {
    const { from, to } = periodRange('last-month', today, 'bs')
    expect(adToBs(from!)).toEqual({ year: 2083, month: 5, day: 1 })
    expect(adToBs(addDays(to!, 1))).toEqual({ year: 2083, month: 6, day: 1 })
    expect(adToBs(periodRange('last-month', '2026-04-20', 'bs').from!)).toEqual({ year: 2082, month: 12, day: 1 })
  })

  it('AD months are calendar months', () => {
    expect(periodRange('this-month', today, 'ad')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(periodRange('last-month', '2026-01-05', 'ad')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })

  it('this fiscal year starts on 1 Shrawan', () => {
    const { from, to } = periodRange('this-year', today, 'bs')
    expect(adToBs(from!)).toEqual({ year: 2083, month: 4, day: 1 })
    expect(adToBs(addDays(to!, 1))).toEqual({ year: 2084, month: 4, day: 1 })
  })

  it('picked dates may be open-ended or reversed; any time has no limits', () => {
    expect(periodRange('custom', today, 'bs', { from: '2026-09-01' })).toEqual({ from: '2026-09-01', to: undefined })
    expect(periodRange('custom', today, 'bs', { from: '2026-10-01', to: '2026-09-01' })).toEqual({ from: '2026-09-01', to: '2026-10-01' })
    expect(periodRange('custom', today, 'bs', { from: '', to: '' })).toEqual({ from: undefined, to: undefined })
    expect(periodRange('any', today, 'bs')).toEqual({})
  })

  it('labels name the month in the company calendar', () => {
    expect(periodLabel('this-month', today, 'bs')).toBe('This month (Asoj 2083)')
    expect(periodLabel('last-month', today, 'ad')).toBe('Last month (September 2026)')
    expect(periodLabel('this-year', today, 'bs')).toBe('This fiscal year (2083/84)')
  })
})

describe('search', () => {
  it('drops wildcard and quoting characters, keeps the rest', () => {
    expect(searchTerm('  CH-501 ')).toBe('CH-501')
    expect(searchTerm('5*0%1"\\')).toBe('5 0 1')
    expect(searchTerm('Shrestha (Cement), Rod')).toBe('Shrestha (Cement), Rod')
  })

  it('builds a quoted PostgREST or filter, with matched ids when there are any', () => {
    expect(containsAny('22,31', ['challan_no'])).toBe('challan_no.ilike."*22,31*"')
    expect(containsAny('ab', ['number'], 'supplier_id', ['s1', 's2'])).toBe('number.ilike."*ab*",supplier_id.in.(s1,s2)')
    expect(containsAny('ab', ['number'], 'supplier_id', [])).toBe('number.ilike."*ab*"')
  })
})
