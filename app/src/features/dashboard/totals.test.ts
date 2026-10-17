import { describe, expect, it } from 'vitest'
import { runningTotals } from './totals'

const p = (code: string, status: 'planned' | 'active' | 'on_hold' | 'completed', cost: number, budget: number | null) => ({
  code, status, cost_paisa: cost, budget_paisa: budget,
})

describe('runningTotals', () => {
  it('adds up active and on-hold projects only', () => {
    const t = runningTotals([p('P-1', 'active', 600, 1000), p('P-2', 'on_hold', 100, 500), p('P-3', 'planned', 0, 9000), p('P-4', 'completed', 800, 800)])
    expect(t).toMatchObject({ count: 2, spent: 700, budget: 1500, left: 800, noBudget: [] })
  })

  it('counts a Planned project once money has been spent on it', () => {
    const t = runningTotals([p('P-1', 'planned', 600, 1000), p('P-2', 'planned', 0, 5000)])
    expect(t).toMatchObject({ count: 1, spent: 600, budget: 1000, left: 400 })
  })

  it('counts a project without a budget in spent, not in left, and names it', () => {
    const t = runningTotals([p('P-1', 'active', 600, 1000), p('P-2', 'active', 300, null)])
    expect(t).toMatchObject({ spent: 900, budget: 1000, left: 400, noBudget: ['P-2'] })
  })

  it('goes negative when over budget', () => {
    expect(runningTotals([p('P-1', 'active', 1200, 1000)]).left).toBe(-200)
  })

  it('has no budget or left without any budget', () => {
    expect(runningTotals([p('P-1', 'active', 600, null)])).toMatchObject({ budget: 0, left: 0, noBudget: ['P-1'] })
    expect(runningTotals([]).count).toBe(0)
  })

  it('adds up where the money went over the running projects only', () => {
    const src = (materials: number, labour: number) => ({ materials, subcontract: 0, labour, other: 0 })
    const t = runningTotals([
      { ...p('P-1', 'active', 600, 1000), by_source: src(500, 100) },
      { ...p('P-2', 'on_hold', 100, 500), by_source: src(0, 100) },
      { ...p('P-3', 'completed', 800, 800), by_source: src(800, 0) },
    ])
    expect(t.bySource).toEqual({ materials: 500, subcontract: 0, labour: 200, other: 0 })
    expect(runningTotals([{ ...p('P-1', 'active', 600, 1000), by_source: null }]).bySource).toBeNull()
  })
})
