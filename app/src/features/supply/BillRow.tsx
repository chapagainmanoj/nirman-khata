// One bill in a list: number, date, amount, status and how much is paid.
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateText } from '../../components/DateInput'
import { Badge } from '../../components/ui'
import { BILL_STATUS, billTitle, settlementLabel } from '../../lib/labels'
import { formatNPR } from '../../lib/money'
import type { useBills } from './api'

type Bill = NonNullable<ReturnType<typeof useBills>['data']>[number]

export function BillRow({ bill: b, showSupplier }: { bill: Bill; showSupplier?: boolean }) {
  const auth = useCompany()
  const [label, tone] = BILL_STATUS[b.status]
  const outstanding = b.payable_paisa - b.credited_paisa - b.settled_paisa
  const [paidLabel, paidTone] = settlementLabel(outstanding, b.settled_paisa)
  return (
    <li className="border-b border-line last:border-0">
      <Link to={`/bills/${b.id}`} className="flex items-start justify-between gap-3 py-2">
        <div className="min-w-0 text-sm">
          <div className="font-medium break-words text-ink">{billTitle(b.bill_no)}</div>
          <div className="text-xs text-subtle">
            {showSupplier && b.suppliers?.name && <>{b.suppliers.name} · </>}
            <DateText value={b.bill_date} display={auth.dateDisplay} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-sm tabular-nums">
          <span>{formatNPR(b.total_paisa ?? (b.status === 'posted' ? b.payable_paisa : b.lines_paisa))}</span>
          <span className="flex gap-1">
            <Badge tone={tone}>{label}</Badge>
            {b.status === 'posted' && <Badge tone={paidTone}>{paidLabel}</Badge>}
          </span>
        </div>
      </Link>
    </li>
  )
}
