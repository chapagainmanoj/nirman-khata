// "Needs attention" rows (req §18.1), pure so the order can be tested. Two kinds:
//   decide: the owner acts (approve, deal with an over-budget project), always shown first
//   record: the books are incomplete (no bill yet, not posted, money not placed), folded after three
// Company-wide counts open their lists on "All projects" (?all=1): the sidebar's "Working on"
// project must not hide the very item the count is about.
import { relativeDay } from '../../lib/dates'
import { formatNPR } from '../../lib/money'
import { PARTY, type PartyKind } from '../parties/kinds'
import type { ProjectFigures } from './parts'

export type AttentionRow = { key: string; kind: 'decide' | 'record'; text: string; action: string; to: string }

export type AttentionData = {
  projects: Array<Pick<ProjectFigures, 'cost_paisa' | 'budget_paisa' | 'by_heading'> & { id: string; code: string; name: string }>
  counts: { slips_to_approve: number; slips_waiting: number; unbilled_lines: number; bills_to_post: number }
  unallocated_paisa?: number
  overpaid_parties?: Array<{ party_id: string; kind: PartyKind; name: string; overpaid_paisa: number }>
  unbilled_by_supplier?: Array<{ supplier_id: string; name: string; lines: number; first_item: string; oldest_date: string }>
}

/** What this person may do; the action word only for someone who may, and the database checks again. */
export type AttentionPerms = { enter: boolean; approve: boolean; post: boolean; pay: boolean }

/** "1 slip", "2 slips". */
export const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function attentionRows(d: AttentionData, can: AttentionPerms, today: string): AttentionRow[] {
  const over = d.projects.filter((p) => p.budget_paisa && Number(p.cost_paisa) > p.budget_paisa)
  const headingOver = d.projects.filter((p) => !over.includes(p) && p.by_heading?.some((h) => h.over))

  const decide: AttentionRow[] = [
    ...(d.counts.slips_to_approve ? [{
      key: 'approve', kind: 'decide' as const, text: `${count(d.counts.slips_to_approve, 'order slip', 'order slips')} waiting for approval`,
      action: can.approve ? 'Approve' : 'See order slips', to: '/slips?all=1',
    }] : []),
    ...over.map((p) => ({
      key: `over:${p.id}`, kind: 'decide' as const,
      text: `${p.code} · ${p.name} is over budget by ${formatNPR(Number(p.cost_paisa) - p.budget_paisa!)} (spent ${formatNPR(Number(p.cost_paisa))} of ${formatNPR(p.budget_paisa!)})`,
      action: 'See project', to: `/projects/${p.id}`,
    })),
    ...headingOver.map((p) => {
      const names = p.by_heading!.filter((h) => h.over).map((h) => h.name)
      return {
        key: `heading:${p.id}`, kind: 'decide' as const,
        text: `${p.code} · ${p.name}: ${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} over the heading budget`,
        action: 'See report', to: '/reports/budget-vs-cost',
      }
    }),
  ]

  // Missing bills first: they leave cost understated.
  const unbilled: AttentionRow[] = d.unbilled_by_supplier
    ? d.unbilled_by_supplier.map((u) => ({
      key: `unbilled:${u.supplier_id}`, kind: 'record' as const,
      text: `${u.first_item}${u.lines > 1 ? ` and ${u.lines - 1} more` : ''} from ${u.name}, came ${relativeDay(u.oldest_date, today)}; no bill yet, so cost is incomplete`,
      action: can.enter ? 'Enter bill' : 'See supplier',
      to: can.enter ? `/bills/new?supplier=${u.supplier_id}` : `/suppliers/${u.supplier_id}`,
    }))
    // A dashboard from before the supplier list came with only the count.
    : d.counts.unbilled_lines ? [{
      key: 'unbilled', kind: 'record', text: `${count(d.counts.unbilled_lines, 'received item', 'received items')} not billed yet, so cost is incomplete`,
      action: 'See list', to: '/reports/pending',
    }] : []

  const record: AttentionRow[] = [
    ...unbilled,
    ...(d.counts.bills_to_post ? [{
      key: 'post', kind: 'record' as const, text: `${count(d.counts.bills_to_post, 'bill', 'bills')} sent to Accounts to post`,
      action: can.post ? 'Post' : 'See bills', to: '/bills?all=1',
    }] : []),
    ...((d.unallocated_paisa ?? 0) > 0 ? [{
      key: 'unallocated', kind: 'record' as const, text: `${formatNPR(d.unallocated_paisa!)} paid, project not chosen yet`,
      action: can.pay ? 'Assign' : 'See payments', to: '/payments?all=1',
    }] : []),
    ...(d.overpaid_parties ?? []).map((p) => ({
      key: `overpaid:${p.party_id}`, kind: 'record' as const,
      text: `${p.name} has ${formatNPR(p.overpaid_paisa)} extra from you; it comes off their next bills`,
      action: `See ${PARTY[p.kind].one.toLowerCase()}`, to: `${PARTY[p.kind].path}/${p.party_id}`,
    })),
    ...(d.counts.slips_waiting ? [{
      key: 'waiting', kind: 'record' as const,
      text: `${count(d.counts.slips_waiting, 'approved order slip', 'approved order slips')} still to be delivered`,
      action: 'See list', to: '/reports/pending',
    }] : []),
  ]
  return [...decide, ...record]
}

export const DECIDE_SHOWN = 5
export const RECORD_SHOWN = 3

/** The short list: every decision (up to five) and the first three records; the rest wait behind "Show more". */
export function foldAttention(rows: AttentionRow[]) {
  const decide = rows.filter((r) => r.kind === 'decide')
  const record = rows.filter((r) => r.kind === 'record')
  return {
    decide: decide.slice(0, DECIDE_SHOWN),
    record: record.slice(0, RECORD_SHOWN),
    hidden: [...decide.slice(DECIDE_SHOWN), ...record.slice(RECORD_SHOWN)],
  }
}
