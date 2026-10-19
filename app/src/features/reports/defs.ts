// The 11 core reports (req §18.3) as data: filters, columns and how to load the rows.
// Every money figure comes from the same database readers as the dashboards and khata,
// so a report, a dashboard and a ledger agree for the same date (acceptance #14).
import { type DateDisplay, formatDate } from '../../lib/dates'
import { type MessageKey, t } from '../../lib/i18n'
import { PAYMENT_METHODS } from '../../lib/labels'
import type { XlsxColumn } from '../../lib/xlsx'
import { docPath, type PartyKind } from '../parties/kinds'
import { rpc } from '../supply/api'
import { quantityText } from './quantities'

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

// The reports below hold message keys; reportByKey and visibleReports hand out the words through
// t(), so the list is read in the current language rather than the one at load.
type ColSource = Omit<Col, 'label'> & { label: MessageKey }
type ReportSource = Omit<ReportDef, 'title' | 'description' | 'columns'> & { title: MessageKey; description: MessageKey; columns: ColSource[] }
const localize = (r: ReportSource): ReportDef => ({
  ...r, title: t(r.title), description: t(r.description), columns: r.columns.map((c) => ({ ...c, label: t(c.label) })),
})

const code = (ctx: Ctx, id: string | null) => ctx.projects.find((p) => p.id === id)?.code ?? ''
const proj = (f: Filters) => (f.project ? { p_project: f.project } : {})
const PROJECT: ColSource = { key: 'project', label: 'report.col.project', kind: 'text' }
const pct = (part: number, whole: number | null) => (whole ? (part / whole) * 100 : null)

const khata = (kind: PartyKind): ReportDef['load'] => async (f, ctx) => {
  if (!f.party) return { rows: [], note: t(kind === 'supplier' ? 'report.chooseParty.supplier' : 'report.chooseParty.subcontractor') }
  const rows = await rpc('party_khata', { p_party: f.party, p_from: f.from, p_to: f.to, ...proj(f) })
  return {
    rows: rows.map((r) => ({
      link: r.doc_kind === 'credit' ? null : docPath(r.doc_kind, r.doc_id, { projectId: r.project_id }),
      values: {
        date: r.business_date, entry: r.label, project: (r.project_ids ?? []).map((id) => code(ctx, id)).filter(Boolean).join(', '),
        charged: r.balance_paisa + r.cash_paisa || null,
        paid: r.cash_paisa || null, balance: r.running_balance_paisa,
      },
    })),
  }
}
const KHATA_COLS: ColSource[] = [
  { key: 'date', label: 'report.col.date', kind: 'date' }, { key: 'entry', label: 'report.col.entry', kind: 'text' }, PROJECT,
  { key: 'charged', label: 'report.col.tirnuParne', kind: 'money', total: true }, { key: 'paid', label: 'report.col.tireko', kind: 'money', total: true },
  { key: 'balance', label: 'report.col.baki', kind: 'money' },
]

const REPORTS: ReportSource[] = [
  {
    key: 'project-cost', title: 'report.projectCost.title', group: 'money', finance: true, period: 'asOf', asKnown: true,
    description: 'report.projectCost.description',
    columns: [
      PROJECT, { key: 'budget', label: 'report.col.budget', kind: 'money', total: true }, { key: 'cost', label: 'report.col.recordedCost', kind: 'money', total: true },
      { key: 'used', label: 'report.col.budgetUsed', kind: 'pct' }, { key: 'progress', label: 'report.col.workDone', kind: 'pct' },
      { key: 'cash', label: 'report.col.cashPaid', kind: 'money', total: true }, { key: 'owed', label: 'report.col.stillOwed', kind: 'money', total: true },
      { key: 'unbilled', label: 'report.col.unbilledItems', kind: 'qty', total: true },
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
    key: 'cost-by-heading', title: 'report.costByHeading.title', group: 'money', finance: true, period: 'asOf', asKnown: true,
    description: 'report.costByHeading.description',
    columns: [
      PROJECT, { key: 'heading', label: 'report.col.heading', kind: 'text' }, { key: 'qty', label: 'report.col.quantity', kind: 'text' },
      { key: 'cost', label: 'report.col.recordedCost', kind: 'money', total: true },
    ],
    load: async (f, ctx) => {
      const args = { p_company: ctx.companyId, p_as_of: f.asOf, p_as_known: f.asKnown, ...proj(f) }
      const [rows, quantities] = await Promise.all([rpc('report_cost_by_heading', args), rpc('report_heading_quantities', args)])
      const qty = quantityText(quantities)
      return {
        rows: rows.filter((r) => r.cost_paisa !== 0).map((r) => ({
          link: `/projects/${r.project_id}`,
          values: {
            project: code(ctx, r.project_id), heading: r.parent_heading ? `${r.parent_heading} › ${r.heading}` : r.heading,
            qty: qty.get(`${r.project_id}:${r.heading_id}`) ?? null, cost: r.cost_paisa,
          },
        })),
      }
    },
  },
  {
    key: 'budget-vs-cost', title: 'report.budgetVsCost.title', group: 'money', finance: true, period: 'asOf', asKnown: true,
    description: 'report.budgetVsCost.description',
    columns: [
      PROJECT, { key: 'heading', label: 'report.col.heading', kind: 'text' }, { key: 'budget', label: 'report.col.budget', kind: 'money', total: true },
      { key: 'cost', label: 'report.col.recordedCost', kind: 'money', total: true }, { key: 'remaining', label: 'report.col.remaining', kind: 'money', total: true },
      { key: 'used', label: 'report.col.used', kind: 'pct' },
    ],
    load: async (f, ctx) => {
      const rows = await rpc('report_cost_by_heading', { p_company: ctx.companyId, p_as_of: f.asOf, p_as_known: f.asKnown, ...proj(f) })
      const revisions = [...new Set(rows.map((r) => t('report.budgetRevisionOf', { code: code(ctx, r.project_id), date: formatDate(r.budget_effective_date, ctx.dateDisplay) })))]
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
    key: 'supplier-ledger', title: 'report.supplierLedger.title', group: 'money', finance: true, period: 'range', party: 'supplier',
    description: 'report.supplierLedger.description',
    columns: KHATA_COLS, load: khata('supplier'),
  },
  {
    key: 'subcontractor-ledger', title: 'report.subcontractorLedger.title', group: 'money', finance: true, period: 'range', party: 'subcontractor',
    description: 'report.subcontractorLedger.description',
    columns: KHATA_COLS, load: khata('subcontractor'),
  },
  {
    key: 'payments', title: 'report.payments.title', group: 'money', finance: true, period: 'range',
    description: 'report.payments.description',
    columns: [
      { key: 'date', label: 'report.col.date', kind: 'date' }, { key: 'number', label: 'report.col.number', kind: 'text' },
      { key: 'party', label: 'report.col.paidTo', kind: 'text' }, { key: 'method', label: 'report.col.how', kind: 'text' },
      { key: 'amount', label: 'report.col.amount', kind: 'money', total: true }, { key: 'settled', label: 'report.col.matchedToBills', kind: 'money', total: true },
      { key: 'reversed', label: 'report.col.reversedOn', kind: 'date' },
    ],
    load: async (f, ctx) => {
      const rows = await rpc('report_payments', { p_company: ctx.companyId, p_from: f.from, p_to: f.to, ...proj(f), ...(f.party ? { p_party: f.party } : {}) })
      return {
        rows: rows.map((r) => ({
          link: r.kind === 'refund' ? `/refunds/${r.payment_id}` : `/payments/${r.payment_id}`,
          values: {
            date: r.payment_date, number: r.kind === 'refund' ? t('report.refundNumber', { number: r.number }) : r.number, party: r.party_name,
            method: PAYMENT_METHODS[r.method as keyof typeof PAYMENT_METHODS] ?? r.method,
            // With a project chosen, the part of the payment that went to it.
            amount: f.project ? r.project_paisa : r.amount_paisa, settled: r.settled_paisa, reversed: r.reversed_on,
          },
        })),
      }
    },
  },
  {
    key: 'material-purchases', title: 'report.materialPurchases.title', group: 'money', finance: true, period: 'range', party: 'supplier',
    description: 'report.materialPurchases.description',
    columns: [
      PROJECT, { key: 'material', label: 'report.col.material', kind: 'text' }, { key: 'qty', label: 'report.col.quantity', kind: 'qty' },
      { key: 'unit', label: 'report.col.unit', kind: 'text' }, { key: 'cost', label: 'report.col.cost', kind: 'money', total: true },
      { key: 'avg', label: 'report.col.averageRate', kind: 'money' }, { key: 'suppliers', label: 'report.col.suppliers', kind: 'text' },
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
    key: 'pending', title: 'report.pending.title', group: 'site', finance: false, period: 'asOf',
    description: 'report.pending.description',
    columns: [
      { key: 'what', label: 'report.col.waitingFor', kind: 'text' }, PROJECT, { key: 'doc', label: 'report.col.orderSlipChallan', kind: 'text' },
      { key: 'date', label: 'report.col.date', kind: 'date' }, { key: 'supplier', label: 'report.col.supplier', kind: 'text' },
      { key: 'item', label: 'report.col.item', kind: 'text' }, { key: 'qty', label: 'report.col.quantity', kind: 'qty' }, { key: 'unit', label: 'report.col.unit', kind: 'text' },
      { key: 'age', label: 'report.col.days', kind: 'qty' },
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
    key: 'daily-activity', title: 'report.dailyActivity.title', group: 'site', finance: false, period: 'range',
    description: 'report.dailyActivity.description',
    columns: [
      { key: 'date', label: 'report.col.date', kind: 'date' }, PROJECT, { key: 'work', label: 'report.col.workDone', kind: 'text' },
      { key: 'stage', label: 'report.col.stage', kind: 'text' }, { key: 'people', label: 'report.col.people', kind: 'qty', total: true },
      { key: 'issues', label: 'report.col.issues', kind: 'text' }, { key: 'by', label: 'report.col.sentBy', kind: 'text' },
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
    key: 'progress', title: 'report.progress.title', group: 'site', finance: false, period: 'range',
    description: 'report.progress.description',
    columns: [
      { key: 'date', label: 'report.col.asOf', kind: 'date' }, PROJECT, { key: 'stage', label: 'report.col.stage', kind: 'text' },
      { key: 'before', label: 'report.col.before', kind: 'pct' }, { key: 'pct', label: 'report.col.progress', kind: 'pct' },
      { key: 'why', label: 'report.col.reasonOrNote', kind: 'text' }, { key: 'by', label: 'report.col.by', kind: 'text' },
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
    key: 'labour', title: 'report.labour.title', group: 'money', finance: true, labour: true, period: 'range', party: 'crew',
    description: 'report.labour.description',
    columns: [
      { key: 'date', label: 'report.col.date', kind: 'date' }, PROJECT, { key: 'crew', label: 'report.col.crew', kind: 'text' },
      { key: 'worker', label: 'report.col.worker', kind: 'text' },
      { key: 'type', label: 'report.col.work', kind: 'text' }, { key: 'people', label: 'report.col.people', kind: 'qty', total: true },
      { key: 'amount', label: 'report.col.amount', kind: 'money', total: true }, { key: 'paid', label: 'report.col.paid', kind: 'money', total: true },
      { key: 'reversed', label: 'report.col.reversedOn', kind: 'date' },
    ],
    load: async (f, ctx) => {
      const rows = await rpc('report_labour', {
        p_company: ctx.companyId, p_from: f.from, p_to: f.to, ...proj(f), ...(f.party ? { p_crew: f.party } : {}),
      })
      return {
        rows: rows.map((r) => ({
          link: r.daily_report_id ? `/daily/${r.daily_report_id}` : `/projects/${r.project_id}?tab=labour`,
          values: {
            date: r.work_date, project: code(ctx, r.project_id), crew: r.crew, worker: r.worker, type: r.work_type, people: r.headcount,
            amount: r.reversed_on ? 0 : r.amount_paisa, paid: r.paid_paisa, reversed: r.reversed_on,
          },
        })),
      }
    },
  },
]

export const reportByKey = (key: string) => {
  const r = REPORTS.find((x) => x.key === key)
  return r && localize(r)
}

/** Money reports only with finance access; labour only when the company tracks own labour. */
export const visibleReports = (who: { canSeeFinance: boolean; company: { labour_module_enabled: boolean } }) =>
  REPORTS.filter((r) => (!r.finance || who.canSeeFinance) && (!r.labour || who.company.labour_module_enabled)).map(localize)
