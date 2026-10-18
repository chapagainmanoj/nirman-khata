// One bill in a list: number, date, amount, status and how much is paid.
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateText } from '../../components/DateInput'
import { Badge } from '../../components/ui'
import { BILL_STATUS, billTitle, settlementLabel } from '../../lib/labels'
import { formatNPR } from '../../lib/money'
import { useProjects } from '../projects/api'
import type { useBills } from './api'

type Bill = NonNullable<ReturnType<typeof useBills>['data']>[number]

export function BillRow({ bill: b, showSupplier, showProject }: { bill: Bill; showSupplier?: boolean; showProject?: boolean }) {
  const auth = useCompany()
  const projects = useProjects(auth.companyId)
  const codes = showProject ? (b.project_ids ?? []).map((id) => projects.data?.find((p) => p.id === id)?.code).filter(Boolean) : []
  const [label, tone] = BILL_STATUS[b.status]
  const outstanding = b.payable_paisa - b.credited_paisa - b.settled_paisa
  const [paidLabel, paidTone] = settlementLabel(outstanding, b.settled_paisa)
  const total = b.total_paisa ?? (b.status === 'posted' ? b.payable_paisa : b.lines_paisa)
  return (
    <li className="border-b border-line last:border-0">
      <Link to={`/bills/${b.id}`} className="flex items-start justify-between gap-3 py-2">
        <div className="min-w-0 text-sm">
          <div className="font-medium break-words text-ink">{billTitle(b.bill_no)}</div>
          <div className="text-xs text-subtle">
            {showSupplier && b.suppliers?.name && <>{b.suppliers.name} · </>}
            <DateText value={b.bill_date} display={auth.dateDisplay} />
            {codes.length > 0 && <> · {codes.join(', ')}</>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-sm tabular-nums">
          {/* A posted bill that is part paid leads with what is still due. */}
          {b.status === 'posted' && outstanding > 0 && b.settled_paisa > 0 ? (
            <span><span className="font-semibold text-ink">{formatNPR(outstanding)} due</span> <span className="text-xs text-subtle">of {formatNPR(total)}</span></span>
          ) : (
            <span>{formatNPR(total)}</span>
          )}
          {/* Posted is the normal state, so it shows only how much is paid. */}
          {b.status === 'posted' ? <Badge tone={paidTone}>{paidLabel}</Badge> : <Badge tone={tone}>{label}</Badge>}
        </div>
      </Link>
    </li>
  )
}

/**
 * Bills as a compact table, as on Deliveries: one line a bill on a laptop. On a phone the date,
 * supplier and project move under the bill number. A part-paid bill shows what is still due.
 */
export function BillTable({ bills, showSupplier, showProject }: { bills: Bill[]; showSupplier?: boolean; showProject?: boolean }) {
  const auth = useCompany()
  const projects = useProjects(auth.companyId)
  const th = 'py-2 pr-3 font-medium'
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-subtle">
            <th scope="col" className={`hidden pl-4 sm:table-cell ${th}`}>Date</th>
            <th scope="col" className={`pl-4 sm:pl-0 ${th}`}>Bill</th>
            {showSupplier && <th scope="col" className={`hidden md:table-cell ${th}`}>Supplier</th>}
            {showProject && <th scope="col" className={`hidden md:table-cell ${th}`}>Project</th>}
            <th scope="col" className={`text-right ${th}`}>Total</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {bills.map((b) => {
            const codes = showProject ? (b.project_ids ?? []).map((id) => projects.data?.find((p) => p.id === id)?.code).filter(Boolean).join(', ') : ''
            const [label, tone] = BILL_STATUS[b.status]
            const outstanding = b.payable_paisa - b.credited_paisa - b.settled_paisa
            const [paidLabel, paidTone] = settlementLabel(outstanding, b.settled_paisa)
            const total = b.total_paisa ?? (b.status === 'posted' ? b.payable_paisa : b.lines_paisa)
            return (
              <tr key={b.id} className="border-b border-line align-middle last:border-0 hover:bg-muted">
                <td className="hidden py-2 pr-3 pl-4 whitespace-nowrap text-subtle sm:table-cell"><DateText value={b.bill_date} display={auth.dateDisplay} /></td>
                <td className="py-2 pr-3 pl-4 sm:pl-0">
                  <Link to={`/bills/${b.id}`} className="inline-flex min-h-8 items-center font-medium break-words text-ink hover:underline">{billTitle(b.bill_no)}</Link>
                  {/* Smaller screens: what the hidden columns say. */}
                  <div className="text-xs text-subtle md:hidden">
                    {showSupplier && b.suppliers?.name && <div className="break-words">{b.suppliers.name}</div>}
                    <span className="sm:hidden"><DateText value={b.bill_date} display={auth.dateDisplay} /></span>
                    {codes && <><span className="sm:hidden"> · </span>{codes}</>}
                  </div>
                </td>
                {showSupplier && <td className="hidden py-2 pr-3 break-words md:table-cell">{b.suppliers?.name}</td>}
                {showProject && <td className="hidden py-2 pr-3 md:table-cell">{codes}</td>}
                <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{formatNPR(total)}</td>
                <td className="py-2 pr-4 text-right">
                  {/* Posted is the normal state, so it shows only how much is paid. */}
                  {b.status === 'posted' ? <Badge tone={paidTone}>{paidLabel}</Badge> : <Badge tone={tone}>{label}</Badge>}
                  {b.status === 'posted' && outstanding > 0 && b.settled_paisa > 0 && (
                    <div className="mt-0.5 text-xs whitespace-nowrap text-ink tabular-nums">{formatNPR(outstanding)} due</div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
