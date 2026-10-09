import { describe, expect, it } from 'vitest'
import { formatNPR, formatNPRShort, paisaToInput, parseNPR, percent, splitEvenly, splitProRata } from './money'

describe('formatNPR', () => {
  it('uses lakh/crore grouping (acceptance #15)', () => {
    expect(formatNPR(123456700)).toBe('Rs. 12,34,567')
    expect(formatNPR(1234567800)).toBe('Rs. 1,23,45,678')
    expect(formatNPR(99900)).toBe('Rs. 999')
    expect(formatNPR(100000)).toBe('Rs. 1,000')
    expect(formatNPR(0)).toBe('Rs. 0')
  })

  it('shows paisa only when present', () => {
    expect(formatNPR(123450)).toBe('Rs. 1,234.50')
    expect(formatNPR(5)).toBe('Rs. 0.05')
  })

  it('handles negatives and missing values', () => {
    expect(formatNPR(-50000)).toBe('-Rs. 500')
    expect(formatNPR(null)).toBe('Not available')
  })

  it('rejects non-integer paisa', () => {
    expect(() => formatNPR(1.5)).toThrow()
  })
})

describe('formatNPRShort', () => {
  it('uses lakh and crore', () => {
    expect(formatNPRShort(4500000)).toBe('Rs. 45,000')
    expect(formatNPRShort(123500000)).toBe('Rs. 12.35 lakh')
    expect(formatNPRShort(500000000)).toBe('Rs. 50 lakh')
    expect(formatNPRShort(1200000000)).toBe('Rs. 1.2 crore')
  })
})

describe('parseNPR', () => {
  it('parses to integer paisa without float error', () => {
    expect(parseNPR('12,34,567')).toBe(123456700)
    expect(parseNPR('1234.5')).toBe(123450)
    expect(parseNPR('0.07')).toBe(7)
    expect(parseNPR('Rs. 500')).toBe(50000)
    expect(parseNPR('1.1')).toBe(110)
  })

  it('rejects invalid input', () => {
    expect(parseNPR('')).toBeNull()
    expect(parseNPR('12.345')).toBeNull()
    expect(parseNPR('abc')).toBeNull()
  })

  it('round-trips with paisaToInput', () => {
    for (const v of [0, 5, 123450, 500000000]) expect(parseNPR(paisaToInput(v))).toBe(v)
  })
})

describe('splitProRata', () => {
  it('always adds up exactly', () => {
    const parts = splitProRata(100, [1, 1, 1])
    expect(parts).toEqual([34, 33, 33])
    expect(parts.reduce((a, b) => a + b)).toBe(100)
  })

  it('splits a transport charge by line amount', () => {
    // Rs. 1,000 transport over lines of Rs. 6,000 and Rs. 3,000
    expect(splitProRata(100000, [600000, 300000])).toEqual([66667, 33333])
  })

  it('handles negative totals (discounts)', () => {
    const parts = splitProRata(-1000, [1, 2])
    expect(parts.reduce((a, b) => a + b)).toBe(-1000)
    expect(parts).toEqual([-333, -667])
  })

  it('keeps every random split exact', () => {
    for (let i = 0; i < 500; i++) {
      const total = Math.floor(Math.random() * 1e9)
      const weights = Array.from({ length: 1 + Math.floor(Math.random() * 6) }, () => 1 + Math.floor(Math.random() * 1e6))
      expect(splitProRata(total, weights).reduce((a, b) => a + b, 0)).toBe(total)
    }
  })
})

describe('percent', () => {
  it('handles missing denominators (req §19)', () => {
    expect(percent(70, 100)).toBe('70%') // acceptance #9: 7 lakh of 10 lakh
    expect(percent(1, 0)).toBe('Not available')
    expect(percent(1, null)).toBe('Not available')
  })
})

describe('splitEvenly', () => {
  it('splits a week of labour exactly (acceptance #18)', () => {
    expect(splitEvenly(7000000, 7)).toEqual(Array(7).fill(1000000))
  })
  it('gives leftover paisa to the first days, totalling exactly', () => {
    expect(splitEvenly(1000001, 3)).toEqual([333334, 333334, 333333])
    expect(splitEvenly(5, 0)).toEqual([])
  })
})
