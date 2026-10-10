import { describe, expect, it } from 'vitest'
import { sheetRows } from './xlsx'

describe('report sheet rows', () => {
  const rows = sheetRows('Payment register', ['1 Asoj to 30 Asoj 2083'],
    [{ label: 'Date', kind: 'date' }, { label: 'Amount', kind: 'money' }, { label: 'Used', kind: 'pct' }],
    [['1 Asoj 2083', 1440000, 65], ['2 Asoj 2083', null, null]], [null, 1440000, null])

  it('starts with the title and filters, then a blank row and the header', () => {
    expect(rows[0][0]).toMatchObject({ value: 'Payment register', fontWeight: 'bold' })
    expect(rows[1][0]).toMatchObject({ value: '1 Asoj to 30 Asoj 2083' })
    expect(rows[2]).toEqual([null])
    expect(rows[3].map((c) => (c as { value: string }).value)).toEqual(['Date', 'Amount', 'Used'])
  })
  it('writes money in rupees and percent as a fraction, so Excel can add them', () => {
    expect(rows[4][1]).toMatchObject({ value: 14400, type: Number, format: '#,##0.00' })
    expect(rows[4][2]).toMatchObject({ value: 0.65, format: '0.0%' })
    expect(rows[5][1]).toBeNull()
  })
  it('ends with a bold totals row', () => {
    expect(rows.at(-1)?.[1]).toMatchObject({ value: 14400, fontWeight: 'bold' })
  })
})
