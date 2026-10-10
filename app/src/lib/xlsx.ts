// Report export to Excel (req §18.3). The library is loaded only when someone exports.
// Money is written as rupees (numbers, so Excel can add them up); dates as the text the
// person reads on screen (BS or AD), since Excel has no BS calendar.
export type XlsxColumn = { label: string; kind: 'text' | 'date' | 'money' | 'qty' | 'pct' }
export type XlsxValue = string | number | null

const WIDTH: Record<XlsxColumn['kind'], number> = { text: 32, date: 16, money: 16, qty: 12, pct: 10 }

/** Sheet rows: title, filter lines, a blank row, the header, the data, then the totals row. */
export function sheetRows(title: string, notes: string[], columns: XlsxColumn[], rows: XlsxValue[][], totals?: XlsxValue[]) {
  const cell = (v: XlsxValue, kind: XlsxColumn['kind']) => {
    if (v === null || v === '') return null
    if (kind === 'money' && typeof v === 'number') return { value: v / 100, type: Number, format: '#,##0.00' }
    if (kind === 'pct' && typeof v === 'number') return { value: v / 100, type: Number, format: '0.0%' }
    if (kind === 'qty' && typeof v === 'number') return { value: v, type: Number, format: '#,##0.###' }
    return { value: String(v), type: String }
  }
  return [
    [{ value: title, type: String, fontWeight: 'bold' as const, fontSize: 14 }],
    ...notes.map((n) => [{ value: n, type: String }]),
    [null],
    columns.map((c) => ({ value: c.label, type: String, fontWeight: 'bold' as const })),
    ...rows.map((r) => r.map((v, i) => cell(v, columns[i].kind))),
    ...(totals ? [totals.map((v, i) => {
      const c = cell(v, columns[i].kind)
      return c && { ...c, fontWeight: 'bold' as const }
    })] : []),
  ]
}

export async function downloadXlsx(fileName: string, title: string, notes: string[], columns: XlsxColumn[], rows: XlsxValue[][], totals?: XlsxValue[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const data = sheetRows(title, notes, columns, rows, totals)
  await writeXlsxFile(data as never, { columns: columns.map((c) => ({ width: WIDTH[c.kind] })), sheet: 'Report' }).toFile(fileName)
}
