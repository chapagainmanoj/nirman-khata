import { describe, expect, it } from 'vitest'
import { runningTotals } from './totals'

const p = (code: string, status: 'planned' | 'active' | 'on_hold' | 'completed', cost: number, budget: number | null) => ({
  code, status, cost_paisa: cost, budget_paisa: budget,
})

describe('runningTotals', () => {
  it('adds up active and on-hold projects only', () => {
    const t = runningTotals([p('P-1', 'active', 600, 1000), p('P-2', 'on_hold', 100, 500), p('P-3', 'planned', 0, 9000), p('P-4', 'completed', 800, 800)])
    expect(t).toMatchObject({ count: 2, spent: 700, budget: 1500, left: 800, noBudget: [] })
    expect(t.usedPct).toBeCloseTo(46.67, 1)
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

  it('has no share without any budget', () => {
    expect(runningTotals([p('P-1', 'active', 600, null)]).usedPct).toBeNull()
    expect(runningTotals([]).count).toBe(0)
  })
})
