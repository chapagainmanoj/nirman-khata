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
