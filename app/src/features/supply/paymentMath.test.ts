// The payment form's arithmetic, pinned to what PaymentNewPage did before it was moved here.
import { describe, expect, it } from 'vitest'
import {
  docKey, fillOldestFirst, hasUnpaid, heldAndCash, payableDocs, projectSplit, tickedEntries, untickedOldestFirst, workerDays,
  type OpenItem,
} from './paymentMath'

const item = (doc_id: string, project_id: string, amount_paisa: number, kind = 'bill', doc_date = '2026-10-01'): OpenItem =>
  ({ kind, doc_id, project_id, amount_paisa, doc_date })

describe('open items', () => {
  const items = [item('b1', 'p1', 1000), item('c1', 'p1', 500, 'charge'), item('h1', 'p1', 300, 'held'), item('x', 'p2', 50, 'opening')]

  it('keeps what is owed (bill, charge, labour, expense)', () => {
    expect(payableDocs(items, '', new Set()).map((d) => d.doc_id)).toEqual(['b1', 'c1'])
  })
  it('a package payment can only clear that package\'s charges', () => {
    expect(payableDocs(items, 'pkg', new Set(['c1'])).map((d) => d.doc_id)).toEqual(['c1'])
  })
  it('anything unpaid at all blocks peski; still loading counts as unpaid', () => {
    expect(hasUnpaid(items)).toBe(true)
    expect(hasUnpaid([item('h1', 'p1', 300, 'held')])).toBe(false)
    expect(hasUnpaid(undefined)).toBe(true)
  })
  it('a document on a project is keyed "doc:project"', () => {
    expect(docKey(item('b1', 'p1', 1))).toBe('b1:p1')
  })
})

describe('ticked bills', () => {
  it('counts only shown documents with an amount', () => {
    const shown = new Set(['b1:p1', 'b2:p1'])
    expect(tickedEntries({ 'b1:p1': '100', 'b2:p1': '', 'gone:p9': '50', 'b2:x': '0' }, shown)).toEqual([['b1:p1', '100']])
  })

  it('offers the unticked bills oldest first', () => {
    const docs = [item('b3', 'p1', 10, 'bill', '2026-10-03'), item('b1', 'p1', 10, 'bill', '2026-10-01'), item('b2', 'p1', 10, 'bill', '2026-10-02')]
    expect(untickedOldestFirst(docs, { 'b2:p1': '10' }).map((d) => d.doc_id)).toEqual(['b1', 'b3'])
  })

  it('money beyond the ticked bills pays the next ones, oldest first, as far as it goes', () => {
    const next = fillOldestFirst({ 'b0:p1': '5.00' }, [item('b1', 'p1', 1000), item('b2', 'p2', 3000), item('b3', 'p1', 9000)], 2500)
    expect(next).toEqual({ 'b0:p1': '5.00', 'b1:p1': '10', 'b2:p2': '15' })
  })
  it('nothing extra fills nothing', () => {
    expect(fillOldestFirst({}, [item('b1', 'p1', 1000)], 0)).toEqual({})
  })
})

describe('project split', () => {
  const base = { amount: 10000, packageId: '', pkgProject: '', billsMode: false, allocations: [], ticked: [], tickedSum: 0, extraProject: '' }

  it('a package payment goes wholly to the package\'s project', () => {
    expect(projectSplit({ ...base, packageId: 'k', pkgProject: 'p1' })).toEqual([{ project_id: 'p1', amount_paisa: 10000 }])
    expect(projectSplit({ ...base, packageId: 'k', pkgProject: '' })).toEqual([])
  })
  it('with nothing to tick, the typed split, without empty rows', () => {
    const allocations = [{ project_id: 'p1', amount: '60' }, { project_id: 'p2', amount: '' }, { project_id: 'p3', amount: '0' }]
    expect(projectSplit({ ...base, allocations })).toEqual([{ project_id: 'p1', amount_paisa: 6000 }])
  })
  it('bills: by the ticked bills\' projects, and the extra on its project', () => {
    const ticked: Array<[string, string]> = [['b1:p1', '30'], ['b2:p2', '20'], ['b3:p1', '10']]
    expect(projectSplit({ ...base, billsMode: true, ticked, tickedSum: 6000, extraProject: 'p2' })).toEqual([
      { project_id: 'p1', amount_paisa: 4000 }, { project_id: 'p2', amount_paisa: 6000 },
    ])
  })
  it('bills: extra with no project chosen is left out (the form then asks for one)', () => {
    expect(projectSplit({ ...base, billsMode: true, ticked: [['b1:p1', '30']], tickedSum: 3000 })).toEqual([{ project_id: 'p1', amount_paisa: 3000 }])
  })
})

describe('a worker\'s days', () => {
  const rows = [
    { key: 'doc:a', project_id: 'p1', date: '2026-10-01' as const, amount: 1000, doc_id: 'a' },
    { key: 'doc:b', project_id: 'p2', date: '2026-10-02' as const, amount: 2500, doc_id: 'b' },
  ]
  it('the advance they hold comes off the ticked days', () => {
    expect(workerDays(rows, ['doc:a', 'doc:b'], 1200)).toEqual({ tickedTotal: 3500, less: 1200, due: 2300, allDays: 3500 })
  })
  it('an advance larger than the days leaves nothing to pay', () => {
    expect(workerDays(rows, ['doc:a'], 5000)).toEqual({ tickedTotal: 1000, less: 1000, due: 0, allDays: 3500 })
  })
  it('none ticked yet (null) is nothing to pay', () => {
    expect(workerDays(rows, null, 300)).toEqual({ tickedTotal: 0, less: 0, due: 0, allDays: 3500 })
  })
})

describe('what they hold, and the cash', () => {
  const none = { subMode: false, direct: false, usable: 0, tickedOwed: 0, amountPaisa: null, cashSent: null }

  it('ticked work: what they hold pays first, the cash the rest', () => {
    expect(heldAndCash({ ...none, subMode: true, usable: 3000, tickedOwed: 10000 })).toEqual({ heldLess: 3000, cashDue: 7000, directCash: 0, directHeld: 3000 })
    expect(heldAndCash({ ...none, subMode: true, usable: 30000, tickedOwed: 10000 })).toEqual({ heldLess: 10000, cashDue: 0, directCash: 0, directHeld: 10000 })
  })
  it('paid directly: the work done, less what they hold', () => {
    expect(heldAndCash({ ...none, direct: true, usable: 2000000, amountPaisa: 5000000 })).toEqual({ heldLess: 2000000, cashDue: 3000000, directCash: 3000000, directHeld: 2000000 })
  })
  it('paid directly and already sent: the cash it was sent with, whatever they hold now', () => {
    expect(heldAndCash({ ...none, direct: true, usable: 0, amountPaisa: 5000000, cashSent: 3000000 })).toEqual({ heldLess: 0, cashDue: 5000000, directCash: 3000000, directHeld: 2000000 })
  })
  it('neither: nothing held, nothing due', () => {
    expect(heldAndCash({ ...none, usable: 999, amountPaisa: 100 })).toEqual({ heldLess: 0, cashDue: 0, directCash: 0, directHeld: 0 })
  })
})
