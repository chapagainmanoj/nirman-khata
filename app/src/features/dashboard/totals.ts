// The company's running projects added up for the dashboard's top block: spent so far and left to
<<<<<<< HEAD
// spend against budget, and where that money went. Running = Active or On hold, or Planned once it has any cost (the status is
// often left at Planned after work starts). A Planned project with no cost stays out, since its
// budget would only inflate "left"; Completed is done. Never called profit (req §19).
=======
// spend against budget, and where that money went. Running = Active or On hold; Completed is done.
// (Planned is retired; an old row that still has it counts once money is spent on it.) Never
// called profit (req §19).
>>>>>>> develop
import type { ProjectStatus } from '../../lib/supabase'
import type { ProjectFigures } from './parts'

type Project = Pick<ProjectFigures, 'cost_paisa' | 'budget_paisa'> & Partial<Pick<ProjectFigures, 'by_source'>> & { code: string; status: ProjectStatus }

const RUNNING: ProjectStatus[] = ['active', 'on_hold']

export function runningTotals(projects: Project[]) {
  const cost = (p: Project) => Number(p.cost_paisa ?? 0)
  const running = projects.filter((p) => RUNNING.includes(p.status) || (p.status === 'planned' && cost(p) > 0))
  const budgeted = running.filter((p) => p.budget_paisa)
  const budget = budgeted.reduce((s, p) => s + p.budget_paisa!, 0)
  // "Left" only over projects with a budget; a project without one still counts in "spent".
  const spentBudgeted = budgeted.reduce((s, p) => s + cost(p), 0)
  return {
    count: running.length,
    spent: running.reduce((s, p) => s + cost(p), 0),
    budget,
    left: budget - spentBudgeted,
    /** Share of the budget used, for the bar; null with no budget at all. */
    usedPct: budget ? (spentBudgeted / budget) * 100 : null,
    noBudget: running.filter((p) => !p.budget_paisa).map((p) => p.code),
    /** Where the money went, the same lines as "spent"; null when the amounts are hidden. */
    bySource: running.length && running.every((p) => p.by_source)
      ? running.reduce((s, p) => ({
        materials: s.materials + Number(p.by_source!.materials), subcontract: s.subcontract + Number(p.by_source!.subcontract),
        labour: s.labour + Number(p.by_source!.labour), other: s.other + Number(p.by_source!.other),
      }), { materials: 0, subcontract: 0, labour: 0, other: 0 })
      : null,
  }
}
