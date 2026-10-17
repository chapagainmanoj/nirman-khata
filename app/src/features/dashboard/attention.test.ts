import { describe, expect, it } from 'vitest'
import { type AttentionData, attentionRows, foldAttention } from './attention'

const can = { enter: true, approve: true, post: true, pay: true }
const today = '2026-10-17'
const project = (id: string, cost: number, budget: number | null, over = false) => ({
  id, code: id.toUpperCase(), name: `Site ${id}`, cost_paisa: cost, budget_paisa: budget,
  by_heading: over ? [{ heading_id: 'h', name: 'Cement', parent: null, budget_paisa: 1, cost_paisa: 2, over: true }] : null,
})
const empty: AttentionData = { projects: [], counts: { slips_to_approve: 0, slips_waiting: 0, unbilled_lines: 0, bills_to_post: 0 } }
const busy: AttentionData = {
  projects: [project('p1', 500, 400), project('p2', 100, 400, true), project('p3', 100, 400)],
  counts: { slips_to_approve: 2, slips_waiting: 1, unbilled_lines: 3, bills_to_post: 1 },
  unallocated_paisa: 1_000_000,
  overpaid_parties: [{ party_id: 'c1', kind: 'subcontractor', name: 'New contractor', overpaid_paisa: 1_000_000 }],
  unbilled_by_supplier: [
    { supplier_id: 's1', name: 'Shrestha', lines: 2, first_item: 'Cement', oldest_date: '2026-10-15' },
    { supplier_id: 's2', name: 'Gurung', lines: 1, first_item: 'Sand', oldest_date: '2026-10-16' },
  ],
}

describe('attentionRows', () => {
  it('is empty when nothing waits', () => {
    expect(attentionRows(empty, can, today)).toEqual([])
  })

  it('puts the owner\'s decisions first, then the records, in a fixed order', () => {
    expect(attentionRows(busy, can, today).map((r) => `${r.kind}:${r.key}`)).toEqual([
      'decide:approve', 'decide:over:p1', 'decide:heading:p2',
      'record:unbilled:s1', 'record:unbilled:s2', 'record:post', 'record:unallocated', 'record:overpaid:c1', 'record:waiting',
    ])
  })

  it('opens company-wide counts on all projects', () => {
    const to = Object.fromEntries(attentionRows(busy, can, today).map((r) => [r.key, r.to]))
    expect(to.approve).toBe('/slips?all=1')
    expect(to.post).toBe('/bills?all=1')
    expect(to.unallocated).toBe('/payments?all=1')
    expect(to['over:p1']).toBe('/projects/p1')
  })

  it('names the action only for someone who may do it', () => {
    const rows = attentionRows(busy, { enter: false, approve: false, post: false, pay: false }, today)
    expect(rows.find((r) => r.key === 'approve')?.action).toBe('See order slips')
    expect(rows.find((r) => r.key === 'unbilled:s1')).toMatchObject({ action: 'See supplier', to: '/suppliers/s1' })
  })

  it('speaks plainly about extra money and unplaced payments', () => {
    const text = Object.fromEntries(attentionRows(busy, can, today).map((r) => [r.key, r.text]))
    expect(text['overpaid:c1']).toBe('New contractor has Rs. 10,000 extra from you; it comes off their next bills')
    expect(text.unallocated).toBe('Rs. 10,000 paid, project not chosen yet')
  })

  it('falls back to the bare count from an older dashboard', () => {
    const rows = attentionRows({ ...empty, counts: { ...empty.counts, unbilled_lines: 3 } }, can, today)
    expect(rows).toMatchObject([{ key: 'unbilled', kind: 'record', to: '/reports/pending' }])
  })
})

describe('foldAttention', () => {
  it('shows every decision and the first three records', () => {
    const fold = foldAttention(attentionRows(busy, can, today))
    expect(fold.decide).toHaveLength(3)
    expect(fold.record.map((r) => r.key)).toEqual(['unbilled:s1', 'unbilled:s2', 'post'])
    expect(fold.hidden.map((r) => r.key)).toEqual(['unallocated', 'overpaid:c1', 'waiting'])
  })

  it('caps decisions at five, folding the rest', () => {
    const many = { ...empty, projects: Array.from({ length: 7 }, (_, i) => project(`p${i}`, 500, 400)) }
    const fold = foldAttention(attentionRows(many, can, today))
    expect(fold.decide).toHaveLength(5)
    expect(fold.hidden).toHaveLength(2)
  })
})
