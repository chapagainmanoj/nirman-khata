// The bill form's arithmetic and payload, pinned to what BillEditPage did before it was moved here.
import { describe, expect, it } from 'vitest'
import { autoLineAmount, billTotals, linesFromDeliveries, matchedQty, toPayload, vatOn, type BillLine, type BillValues } from './billForm'

const line = (over: Partial<BillLine> = {}): BillLine => ({
  id: 'l1', line_type: 'material', project_id: 'p1', heading_id: '', material_id: 'm1', description: '', qty: '2', unit_id: 'u-kg',
  unit_note: '', rate: '', amount: '', amount_edited: false, unmatched_reason: '', rate_variance_reason: '', matches: [], ...over,
})

describe('line amount', () => {
  it('follows qty × rate, rounded half up, exactly', () => {
    expect(autoLineAmount(line({ rate: '125.50', qty: '2.5' }))).toBe('313.75')
  })
  it('leaves an amount typed from the paper bill alone', () => {
    expect(autoLineAmount(line({ rate: '125.50', qty: '2.5', amount_edited: true }))).toBeNull()
  })
  it('needs a rate, a quantity above zero, and at most 3 decimals', () => {
    expect(autoLineAmount(line({ rate: '', qty: '2' }))).toBeNull()
    expect(autoLineAmount(line({ rate: '10', qty: '0' }))).toBeNull()
    expect(autoLineAmount(line({ rate: '10', qty: '1.2345' }))).toBeNull()
  })
})

describe('totals', () => {
  it('lines, less discount, plus transport and VAT; blank amounts count as zero', () => {
    const v = { lines: [line({ amount: '1,000' }), line({ amount: '500.50' }), line({ amount: '' })], discount: '50', transport: '100', vat: '13' }
    expect(billTotals(v)).toEqual({ subtotal: 150050, total: 156350 })
  })
  it('VAT is worked out on lines less discount plus transport, 13% unless set', () => {
    expect(vatOn(100000, '', '', '')).toBe('130')
    expect(vatOn(12345, '', '', '13')).toBe('16.05')
    expect(vatOn(100000, '100', '200', '10')).toBe('110')
  })
  it('the quantity matched to deliveries', () => {
    expect(matchedQty([{ delivery_line_id: 'a', billed_qty: '2.5' }, { delivery_line_id: 'b', billed_qty: '' }])).toBe(2.5)
  })
})

describe('lines from unbilled deliveries', () => {
  const unbilled = [
    { id: 'dl1', delivery_id: 'd1', project_id: 'p1', billable_qty: 5 },
    { id: 'dl2', delivery_id: 'd2', project_id: 'p2', billable_qty: 3 },
    { id: 'dl3', delivery_id: 'd1', project_id: 'p1', billable_qty: 2 },
  ]
  const deliveries = new Map([
    ['dl1', { material_id: 'm1', unit_id: 'u-kg', unit_note: null }],
    ['dl2', { material_id: 'm2', unit_id: 'u-bag', unit_note: 'of 50 kg' }],
    ['dl3', { material_id: null, unit_id: 'u-kg', unit_note: null }],
  ])
  const materials = [{ id: 'm1', default_heading_id: 'h-cement' }, { id: 'm2', default_heading_id: null }]
  let n = 0
  const ids = () => `new${++n}`

  it('only the bill\'s project: the first delivery chooses it; lines without a material are skipped', () => {
    n = 0
    const r = linesFromDeliveries({ lines: [], project: '', unbilled, deliveries, materials, newId: ids })
    expect(r.project).toBe('p1')
    expect(r.lines).toEqual([line({
      id: 'new1', heading_id: 'h-cement', qty: '5', matches: [{ delivery_line_id: 'dl1', billed_qty: '5' }],
    })])
  })

  it('one delivery: its own project, and lines already on the bill are not added again', () => {
    n = 0
    const taken = [line({ matches: [{ delivery_line_id: 'dl1', billed_qty: '5' }] })]
    expect(linesFromDeliveries({ lines: taken, project: '', onlyDelivery: 'd1', unbilled, deliveries, materials, newId: ids }).lines).toEqual([])
    const r = linesFromDeliveries({ lines: [], project: '', onlyDelivery: 'd2', unbilled, deliveries, materials, newId: ids })
    expect(r.project).toBe('p2')
    expect(r.lines).toEqual([line({
      id: 'new1', project_id: 'p2', material_id: 'm2', qty: '3', unit_id: 'u-bag', unit_note: 'of 50 kg',
      matches: [{ delivery_line_id: 'dl2', billed_qty: '3' }],
    })])
  })

  it('no unbilled deliveries: nothing, and no project chosen', () => {
    expect(linesFromDeliveries({ lines: [], project: '', unbilled: undefined, deliveries: undefined, materials: undefined, newId: ids }))
      .toEqual({ lines: [], project: '' })
  })
})

describe('payload', () => {
  const v: BillValues = {
    id: 'b1', supplier_id: 's1', project_id: 'p1', bill_no: ' 42 ', bill_date: '2026-10-10', cost_date: '', due_date: '', notes: '',
    discount: '', transport: '1,000', vat: '130', vat_rate: '', split_charges: false,
    overrides: [{ charge: 'transport', project_id: 'p2', amount: '1,000' }],
    lines: [
      line({ rate: '100', amount: '200', matches: [{ delivery_line_id: 'dl1', billed_qty: '2' }, { delivery_line_id: 'dl9', billed_qty: '0' }] }),
      line({ id: 'l2', line_type: 'charge', project_id: '', heading_id: 'h-tr', material_id: 'm1', description: 'Transport', qty: '3', unit_id: 'u-kg', amount: '50' }),
    ],
    paper_total: '', photos: [], post_key: 'k',
  }

  it('sends paisa, the bill\'s project on every line, and blanks as null', () => {
    expect(toPayload(v)).toEqual({
      id: 'b1', supplier_id: 's1', bill_no: '42', bill_date: '2026-10-10', cost_date: '2026-10-10', paper_total_paisa: null,
      due_date: null, notes: null, discount_paisa: 0, transport_paisa: 100000, vat_paisa: 13000, vat_rate_pct: 13,
      lines: [
        { id: 'l1', line_type: 'material', project_id: 'p1', heading_id: null, material_id: 'm1', description: null, qty: 2, unit_id: 'u-kg',
          unit_note: null, rate_paisa: 10000, amount_paisa: 20000, unmatched_reason: null, rate_variance_reason: null,
          matches: [{ delivery_line_id: 'dl1', billed_qty: 2 }] },
        { id: 'l2', line_type: 'charge', project_id: 'p1', heading_id: 'h-tr', material_id: null, description: 'Transport', qty: null, unit_id: null,
          unit_note: null, rate_paisa: null, amount_paisa: 5000, unmatched_reason: null, rate_variance_reason: null, matches: [] },
      ],
      overrides: [],
    })
  })

  it('charge splits only when chosen; an older bill with several projects keeps each line\'s own', () => {
    const p = toPayload({ ...v, project_id: '', split_charges: true })
    expect(p.overrides).toEqual([{ charge: 'transport', project_id: 'p2', amount_paisa: 100000 }])
    expect(p.lines.map((l) => l.project_id)).toEqual(['p1', ''])
  })
})
