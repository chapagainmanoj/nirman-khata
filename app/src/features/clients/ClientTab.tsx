// The project's Client tab: what the client has paid against the contract, and each payment.
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateText } from '../../components/DateInput'
import { Badge, ButtonLink, Card, ErrorBanner, Spinner } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { CLIENT_RECEIPT_KINDS, PAYMENT_METHODS } from '../../lib/labels'
import { formatNPR } from '../../lib/money'
import { useAmountsAsOf } from '../projects/api'
import { canRecordPayments } from '../supply/permissions'
import { useClientReceipts, useClientReceived } from './api'

export function ClientTab({ projectId, clientName }: { projectId: string; clientName: string | null }) {
  const auth = useCompany()
  const today = todayKathmandu()
  const receipts = useClientReceipts(projectId)
  const received = useClientReceived(projectId, today, true)
  const amounts = useAmountsAsOf(projectId, today, true)
  const contract = amounts.data?.contract_paisa ?? null
  const got = received.data ?? 0
  const left = contract === null ? null : contract - got

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-subtle">
          Money {clientName ? clientName : 'the client'} paid you for this work. It is not part of your costs.
        </p>
        {canRecordPayments(auth) && <ButtonLink to={`/receipts/new?project=${projectId}`}>Record payment received</ButtonLink>}
      </div>
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-sm font-medium text-subtle">Received from client</div>
            <div className="text-2xl font-semibold text-ink tabular-nums">{formatNPR(got)}</div>
            {contract !== null && <div className="mt-1 text-sm text-subtle">of <span className="font-semibold text-ink tabular-nums">{formatNPR(contract)}</span> contract</div>}
          </div>
          <div>
            <div className="text-sm font-medium text-subtle">{left !== null && left < 0 ? 'Received more than the contract by' : 'Contract balance'}</div>
            <div className="text-2xl font-semibold text-ink tabular-nums">{left === null ? 'Not available' : formatNPR(Math.abs(left))}</div>
          </div>
        </div>
      </Card>
      <Card title="Payments received">
        {receipts.isPending && <Spinner />}
        <ErrorBanner onRetry={() => void receipts.refetch()}>{receipts.error && friendlyError(receipts.error)}</ErrorBanner>
        {receipts.data?.length === 0 && <p className="text-sm text-subtle">No payments from the client recorded yet.</p>}
        <ul>
          {receipts.data?.map((r) => (
            <li key={r.id} className="border-b border-line last:border-0">
              <Link to={`/receipts/${r.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm hover:bg-muted">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{r.number}</span>
                    <span className="text-subtle">{CLIENT_RECEIPT_KINDS[r.kind]}</span>
                    {r.status === 'reversed' && <Badge tone="bad">Reversed</Badge>}
                  </span>
                  <span className="block text-xs text-subtle">
                    <DateText value={r.receipt_date} display={auth.dateDisplay} /> · {PAYMENT_METHODS[r.method]}{r.reference ? ` · ${r.reference}` : ''}
                  </span>
                </span>
                <span className={`shrink-0 font-semibold tabular-nums ${r.status === 'reversed' ? 'text-subtle line-through' : 'text-ink'}`}>
                  {formatNPR(r.amount_paisa)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  )
}
