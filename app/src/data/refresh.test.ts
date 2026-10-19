import { describe, expect, it } from 'vitest'
import { PARTY } from '../features/parties/kinds'
import { SHOWS, familiesFor, type Data } from './refresh'

// Every source file under src/ as text (Vite reads them at build time of the test).
const SOURCES = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.ts', '!../lib/database.types.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** Every string that starts a query key in the app: queries, paged lists, key constants, invalidations. */
function familiesInCode(): Map<string, string> {
  const found = new Map<string, string>()
  const patterns = [
    /queryKey: \[\s*'([a-z-]+)'/g,
    /usePaged\(\[\s*'([a-z-]+)'/g,
    /(?:const|let) \w*[kK]ey\w* = \[\s*'([a-z-]+)'/g,
  ]
  for (const [file, text] of Object.entries(SOURCES)) {
    for (const re of patterns) for (const m of text.matchAll(re)) found.set(m[1], file)
  }
  for (const p of Object.values(PARTY)) found.set(p.table, 'features/parties/kinds.ts')
  return found
}

describe('SHOWS', () => {
  it('declares every query family the app uses (add a line to SHOWS for a new query)', () => {
    const missing = [...familiesInCode()].filter(([family]) => !(family in SHOWS)).map(([f, file]) => `${f} (${file})`)
    expect(missing).toEqual([])
  })

  it('found the families (the scan still matches how keys are written)', () => {
    expect(familiesInCode().size).toBeGreaterThan(50)
  })
})

describe('familiesFor', () => {
  const after = (...changed: Data[]) => familiesFor(changed)

  it('a delivery refreshes everything that shows deliveries, calendar and day report included', () => {
    expect(after('deliveries')).toEqual(expect.arrayContaining(['deliveries', 'delivery-lines', 'slip', 'slips', 'bill-preview', 'calendar', 'report-day', 'project-dashboard', 'report']))
  })

  it('a money posting refreshes balances, khata, dashboards and lists', () => {
    expect(after('ledger')).toEqual(expect.arrayContaining(['payments', 'payment', 'khata', 'balances', 'open-items', 'project-cost', 'bills', 'labour', 'expenses', 'attendance', 'dashboard', 'calendar']))
  })

  it('a client receipt does not refetch the supplier side', () => {
    const r = after('clientMoney')
    expect(r).toEqual(expect.arrayContaining(['client-receipts', 'client-receipt', 'client-received', 'dashboard', 'project-dashboard', 'calendar']))
    expect(r).not.toContain('bills')
    expect(r).not.toContain('balances')
  })

  it('platform changes stay on the platform page', () => {
    expect(after('platform').every((f) => f.startsWith('platform') || f === 'is-platform-admin')).toBe(true)
  })
})
