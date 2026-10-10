// The 11 core reports (req §18.3) as data: filters, columns and how to load the rows.
// Every money figure comes from the same database readers as the dashboards and khata,
// so a report, a dashboard and a ledger agree for the same date (acceptance #14).
import { type DateDisplay, formatDate } from '../../lib/dates'
import type { XlsxColumn } from '../../lib/xlsx'
import { docPath, type PartyKind } from '../parties/kinds'
import { rpc } from '../supply/api'

export type Filters = { from: string; to: string; asOf: string; project: string; party: string; asKnown: boolean }
export type Project = { id: string; code: string; name: string }
export type Ctx = { companyId: string; dateDisplay: DateDisplay; projects: Project[]; memberName: (id: string | null) => string }
export type Col = { key: string; label: string; kind: XlsxColumn['kind']; total?: boolean }
export type Row = { values: Record<string, string | number | null>; link?: string | null }
export type Loaded = { rows: Row[]; note?: string }

export type ReportDef = {
  key: string
  title: string
  description: string
  group: 'money' | 'site'
  /** Needs finance access (amounts). */
  finance: boolean
  /** Only when the company tracks own labour. */
  labour?: boolean
  period: 'range' | 'asOf'
  /** Offers the "as known on that date" view (req §19.1). */
  asKnown?: boolean
  party?: PartyKind
  columns: Col[]
  load: (f: Filters, ctx: Ctx) => Promise<Loaded>
}

const code = (ctx: Ctx, id: string | null) => ctx.projects.find((p) => p.id === id)?.code ?? ''
const proj = (f: Filters) => (f.project ? { p_project: f.project } : {})
const PROJECT: Col = { key: 'project', label: 'Project', kind: 'text' }
const pct = (part: number, whole: number | null) => (whole ? (part / whole) * 100 : null)

const khata = (kind: PartyKind): ReportDef['load'] => async (f, ctx) => {
  if (!f.party) return { rows: [], note: `Choose a ${kind === 'supplier' ? 'supplier' : 'subcontractor'} to see the ledger.` }
  const rows = await rpc('party_khata', { p_party: f.party, p_from: f.from, p_to: f.to, ...proj(f) })
  return {
    rows: rows.map((r) => ({
      link: r.doc_kind === 'credit' ? null : docPath(r.doc_kind, r.doc_id, { projectId: r.project_id }),
      values: {
        date: r.business_date, entry: r.label, project: code(ctx, r.project_id),
        charged: r.balance_paisa + r.cash_paisa || null,
        paid: r.cash_paisa || null, balance: r.running_balance_paisa,
      },
    })),
  }
}
const KHATA_COLS: Col[] = [
  { key: 'date', label: 'Date', kind: 'date' }, { key: 'entry', label: 'Entry', kind: 'text' }, PROJECT,
  { key: 'charged', label: 'Charged', kind: 'money', total: true }, { key: 'paid', label: 'Paid', kind: 'money', total: true },
  { key: 'balance', label: 'Balance owed', kind: 'money' },
]

export const REPORTS: ReportDef[] = [
  {
    key: 'project-cost', title: 'Project cost summary', group: 'money', finance: true, period: 'asOf', asKnown: true,
    description: 'Recorded cost, budget used, cash paid and what is owed, per project.',
    columns: [
      PROJECT, { key: 'budget', label: 'Budget', kind: 'money', total: true }, { key: 'cost', label: 'Recorded cost', kind: 'money', total: true },
      { key: 'used', label: 'Budget used', kind: 'pct' }, { key: 'progress', label: 'Work done', kind: 'pct' },
      { key: 'cash', label: 'Cash paid', kind: 'money', total: true }, { key: 'owed', label: 'Still owed', kind: 'money', total: true },
      { key: 'unbilled', label: 'Unbilled items', kind: 'qty', total: true },
    ],
    load: async (f, ctx) => {
      const list = f.project ? ctx.projects.filter((p) => p.id === f.project) : ctx.projects
      const dash = await Promise.all(list.map((p) => rpc('project_dashboard', { p_project: p.id, p_as_of: f.asOf, p_as_known: f.asKnown })))
      return {
        rows: dash.flatMap((d, i) => {
          const x = d as Record<string, number | null> | null
          if (!x) return []
          return [{
            link: `/projects/${list[i].id}`,
            values: {
              project: `${list[i].code} · ${list[i].name}`, budget: x.budget_paisa, cost: x.cost_paisa,
              used: pct(Number(x.cost_paisa), x.budget_paisa), progress: x.progress_pct, cash: x.cash_paid_paisa,
              owed: x.payable_paisa, unbilled: x.unbilled_lines,
            },
          }]
        }),
      }
    },
  },
  {
    key: 'cost-by-heading', title: 'Cost by heading', group: 'money', finance: true, period: 'asOf', asKnown: true,
    description: 'Recorded cost under each cost heading.',
    columns: [PROJECT, { key: 'heading', label: 'Heading', kind: 'text' }, { key: 'cost', label: 'Recorded cost', kind: 'money', total: true }],
    load: async (f, ctx) => {
      const rows = await rpc('report_cost_by_heading', { p_company: ctx.companyId, p_as_of: f.asOf, p_as_known: f.asKnown, ...proj(f) })
      return {
        rows: rows.filter((r) => r.cost_paisa !== 0).map((r) => ({
          link: `/projects/${r.project_id}`,
          values: { project: code(ctx, r.project_id), heading: r.parent_heading ? `${r.parent_heading} › ${r.heading}` : r.heading, cost: r.cost_paisa },
        })),
      }
    },
  },
  {
    key: 'budget-vs-cost', title: 'Budget vs recorded cost', group: 'money', finance: true, period: 'asOf', asKnown: true,
    description: 'Each heading against its budget, using the budget revision in force on the date.',
    columns: [
      PROJECT, { key: 'heading', label: 'Heading', kind: 'text' }, { key: 'budget', label: 'Budget', kind: 'money', total: true },
      { key: 'cost', label: 'Recorded cost', kind: 'money', total: true }, { key: 'remaining', label: 'Remaining', kind: 'money', total: true },
      { key: 'used', label: 'Used', kind: 'pct' },
    ],
    load: async (f, ctx) => {
      const rows = await rpc('report_cost_by_heading', { p_company: ctx.companyId, p_as_of: f.asOf, p_as_known: f.asKnown, ...proj(f) })
      const revisions = [...new Set(rows.map((r) => `${code(ctx, r.project_id)}: budget revision of ${formatDate(r.budget_effective_date, ctx.dateDisplay)}`))]
      return {
        note: revisions.length ? revisions.join('; ') : undefined,
        rows: rows.map((r) => ({
          link: `/projects/${r.project_id}`,
          values: {
            project: code(ctx, r.project_id), heading: r.parent_heading ? `${r.parent_heading} › ${r.heading}` : r.heading,
            budget: r.budget_paisa, cost: r.cost_paisa,
            remaining: r.budget_paisa === null ? null : r.budget_paisa - r.cost_paisa, used: pct(r.cost_paisa, r.budget_paisa),
          },
        })),
      }
    },
  },
  {
    key: 'supplier-ledger', title: 'Supplier ledger (khata)', group: 'money', finance: true, period: 'range', party: 'supplier',
    description: 'Bills, credits and payments with one supplier, and the running balance.',
    columns: KHATA_COLS, load: khata('supplier'),
  },
  {
    key: 'subcontractor-ledger', title: 'Subcontractor ledger', group: 'money', finance: true, period: 'range', party: 'subcontractor',
    description: 'Approved work charges and payments with one subcontractor.',
    columns: KHATA_COLS, load: khata('subcontractor'),
  },
  {
    key: 'payments', title: 'Payment register', group: 'money', finance: true, period: 'range',
    description: 'Every payment in the period, what it settled, and any reversal.',
    columns: [
      { key: 'date', label: 'Date', kind: 'date' }, { key: 'number', label: 'Number', kind: 'text' },
      { key: 'party', label: 'Paid to', kind: 'text' }, { key: 'method', label: 'How', kind: 'text' },
      { key: 'amount', label: 'Amount', kind: 'money', total: true }, { key: 'settled', label: 'Matched to bills', kind: 'money', total: true },
      { key: 'reversed', label: 'Reversed on', kind: 'date' },
    ],
    load: async (f, ctx) => {
      const rows = await rpc('report_payments', { p_company: ctx.companyId, p_from: f.from, p_to: f.to, ...proj(f), ...(f.party ? { p_party: f.party } : {}) })
      return {
        rows: rows.map((r) => ({
          link: `/payments/${r.payment_id}`,
          values: {
            date: r.payment_date, number: r.number, party: r.party_name, method: r.method.replace('_', ' '),
            // With a project chosen, the part of the payment that went to it.
            amount: f.project ? r.project_paisa : r.amount_paisa, settled: r.settled_paisa, reversed: r.reversed_on,
          },
        })),
      }
    },
  },
  {
    key: 'material-purchases', title: 'Material purchases', group: 'money', finance: true, period: 'range', party: 'supplier',
    description: 'Quantity and cost of each material bought, per project, from posted bills.',
    columns: [
      PROJECT, { key: 'material', label: 'Material', kind: 'text' }, { key: 'qty', label: 'Quantity', kind: 'qty' },
      { key: 'unit', label: 'Unit', kind: 'text' }, { key: 'cost', label: 'Cost', kind: 'money', total: true },
      { key: 'avg', label: 'Average rate', kind: 'money' }, { key: 'suppliers', label: 'Suppliers', kind: 'text' },
    ],
    load: async (f, ctx) => {
      const rows = await rpc('report_material_purchases', {
        p_company: ctx.companyId, p_from: f.from, p_to: f.to, ...proj(f), ...(f.party ? { p_supplier: f.party } : {}),
      })
      return {
        rows: rows.map((r) => ({
          values: {
            project: code(ctx, r.project_id), material: r.material, qty: Number(r.qty), unit: r.unit, cost: r.cost_paisa,
            avg: Number(r.qty) > 0 ? Math.round(r.cost_paisa / Number(r.qty)) : null, suppliers: r.suppliers,
          },
        })),
      }
    },
  },
  {
    key: 'pending', title: 'Pending orders and deliveries', group: 'site', finance: false, period: 'asOf',
    description: 'Ordered but not yet received, and received but not yet billed.',
    columns: [
      { key: 'what', label: 'Waiting for', kind: 'text' }, PROJECT, { key: 'doc', label: 'Slip / challan', kind: 'text' },
      { key: 'date', label: 'Date', kind: 'date' }, { key: 'supplier', label: 'Supplier', kind: 'text' },
      { key: 'item', label: 'Item', kind: 'text' }, { key: 'qty', label: 'Quantity', kind: 'qty' }, { key: 'unit', label: 'Unit', kind: 'text' },
      { key: 'age', label: 'Days', kind: 'qty' },
    ],
    load: async (f, ctx) => {
      const rows = await rpc('report_pending_orders', { p_company: ctx.companyId, ...proj(f) })
      return {
        rows: rows.map((r) => ({
          link: r.kind === 'to_receive' ? `/slips/${r.doc_id}` : `/projects/${r.project_id}?tab=deliveries`,
          values: {
            what: r.kind === 'to_receive' ? 'Delivery' : 'Bill', project: code(ctx, r.project_id), doc: r.doc_number,
            date: r.doc_date, supplier: r.supplier_name, item: r.item, qty: Number(r.qty), unit: r.unit, age: r.age_days,
          },
        })),
      }
    },
  },
  {
    key: 'daily-activity', title: 'Daily activity', group: 'site', finance: false, period: 'range',
    description: 'The daily site reports sent in the period.',
    columns: [
      { key: 'date', label: 'Date', kind: 'date' }, PROJECT, { key: 'work', label: 'Work done', kind: 'text' },
      { key: 'stage', label: 'Stage', kind: 'text' }, { key: 'people', label: 'People', kind: 'qty', total: true },
      { key: 'issues', label: 'Issues', kind: 'text' }, { key: 'by', label: 'Sent by', kind: 'text' },
    ],
    load: async (f, ctx) => {
      const rows = await rpc('report_daily_activity', { p_company: ctx.companyId, p_from: f.from, p_to: f.to, ...proj(f) })
      return {
        rows: rows.map((r) => ({
          link: `/daily/${r.report_id}`,
          values: {
            date: r.work_date, project: code(ctx, r.project_id), work: r.work_done, stage: r.stage, people: r.headcount,
            issues: r.issues, by: ctx.memberName(r.created_by),
          },
        })),
      }
    },
  },
  {
    key: 'progress', title: 'Progress history', group: 'site', finance: false, period: 'range',
    description: 'Every progress update, with the figure before it and the reason when it went down.',
    columns: [
      { key: 'date', label: 'As of', kind: 'date' }, PROJECT, { key: 'stage', label: 'Stage', kind: 'text' },
      { key: 'before', label: 'Before', kind: 'pct' }, { key: 'pct', label: 'Progress', kind: 'pct' },
      { key: 'why', label: 'Reason or note', kind: 'text' }, { key: 'by', label: 'By', kind: 'text' },
    ],
    load: async (f, ctx) => {
      const rows = await rpc('report_progress_history', { p_company: ctx.companyId, p_from: f.from, p_to: f.to, ...proj(f) })
      return {
        rows: rows.filter((r) => r.effective_date >= f.from).map((r) => ({
          link: `/projects/${r.project_id}?tab=site`,
          values: {
            date: r.effective_date, project: code(ctx, r.project_id), stage: r.stage, before: r.previous_pct === null ? null : Number(r.previous_pct),
            pct: Number(r.pct), why: r.reason ?? r.notes, by: ctx.memberName(r.created_by),
          },
        })),
      }
    },
  },
  {
    key: 'labour', title: 'Labour cost', group: 'money', finance: true, labour: true, period: 'range', party: 'crew',
    description: 'Each day of own labour, what is paid, and reversals.',
    columns: [
      { key: 'date', label: 'Date', kind: 'date' }, PROJECT, { key: 'crew', label: 'Crew', kind: 'text' },
      { key: 'type', label: 'Work', kind: 'text' }, { key: 'people', label: 'People', kind: 'qty', total: true },
      { key: 'amount', label: 'Amount', kind: 'money', total: true }, { key: 'paid', label: 'Paid', kind: 'money', total: true },
      { key: 'reversed', label: 'Reversed on', kind: 'date' },
    ],
    load: async (f, ctx) => {
      const rows = await rpc('report_labour', {
        p_company: ctx.companyId, p_from: f.from, p_to: f.to, ...proj(f), ...(f.party ? { p_crew: f.party } : {}),
      })
      return {
        rows: rows.map((r) => ({
          link: r.daily_report_id ? `/daily/${r.daily_report_id}` : `/projects/${r.project_id}?tab=labour`,
          values: {
            date: r.work_date, project: code(ctx, r.project_id), crew: r.crew, type: r.work_type, people: r.headcount,
            amount: r.reversed_on ? 0 : r.amount_paisa, paid: r.paid_paisa, reversed: r.reversed_on,
          },
        })),
      }
    },
  },
]

export const reportByKey = (key: string) => REPORTS.find((r) => r.key === key)

/** Money reports only with finance access; labour only when the company tracks own labour. */
export const visibleReports = (who: { canSeeFinance: boolean; company: { labour_module_enabled: boolean } }) =>
  REPORTS.filter((r) => (!r.finance || who.canSeeFinance) && (!r.labour || who.company.labour_module_enabled))
