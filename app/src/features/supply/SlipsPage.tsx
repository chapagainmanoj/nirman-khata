// Order slips: drafts, waiting for approval, open (not fully received), all (req §9.3).
import { useState } from 'react'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateText } from '../../components/DateInput'
import { Badge, ButtonLink, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { FULFILMENT, SLIP_STATUS } from '../../lib/labels'
import { useProjectFilter } from '../lists/ProjectFilter'
import { useProjects } from '../projects/api'
import { useSlips } from './api'
import { canEnter } from './permissions'

type Filter = 'open' | 'pending' | 'draft' | 'all'
const FILTERS: Array<[Filter, string]> = [['open', 'Open'], ['pending', 'To approve'], ['draft', 'Drafts'], ['all', 'All']]

export function SlipsPage() {
  const auth = useCompany()
  const slips = useSlips(auth.companyId)
  const projects = useProjects(auth.companyId)
  const [filter, setFilter] = useState<Filter>('open')
  const code = (id: string) => projects.data?.find((p) => p.id === id)?.code
  const { projectId, chip } = useProjectFilter()
  const mine = slips.data?.filter((s) => !projectId || s.order_slip_lines.some((l) => l.project_id === projectId))

  const list = mine?.filter((s) => {
    if (filter === 'open') return s.status === 'approved' && !['fully_received', 'closed_short'].includes(s.fulfilment)
    if (filter === 'pending') return s.status === 'pending'
    if (filter === 'draft') return s.status === 'draft' || s.status === 'rejected'
    return true
  })
  const count = (f: Filter) => mine?.filter((s) => (f === 'pending' ? s.status === 'pending' : f === 'draft' ? ['draft', 'rejected'].includes(s.status) : false)).length

  return (
    <>
      <PageHeader title="Order slips" actions={canEnter(auth) && <ButtonLink to={projectId ? `/slips/new?project=${projectId}` : '/slips/new'}>New slip</ButtonLink>} />
      {chip}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1" role="group" aria-label="Show slips">
        {FILTERS.map(([key, label]) => {
          const n = key === 'pending' || key === 'draft' ? count(key) : 0
          return (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
              className={`min-h-11 flex-1 rounded-md px-2 text-sm font-medium whitespace-nowrap ${filter === key ? 'bg-surface text-ink shadow-sm' : 'text-subtle'}`}>
              {label}{n ? ` (${n})` : ''}
            </button>
          )
        })}
      </div>
      {slips.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void slips.refetch()}>{slips.error && friendlyError(slips.error)}</ErrorBanner>
      {list?.length === 0 && (
        <EmptyState title="No slips here">Create a slip to order material from a supplier for one or more projects.</EmptyState>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {list?.map((s) => {
          const [statusLabel, statusTone] = SLIP_STATUS[s.status]
          const [fLabel, fTone] = FULFILMENT[s.fulfilment] ?? FULFILMENT.not_received
          const codes = [...new Set(s.order_slip_lines.map((l) => code(l.project_id)).filter(Boolean))]
          return (
            <li key={s.id}>
              <Link to={`/slips/${s.id}`} className="block rounded-xl border border-line bg-surface p-4 hover:border-brand">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-subtle">{s.number}</div>
                    <div className="font-semibold break-words text-ink">{s.suppliers?.name}</div>
                  </div>
                  <Badge tone={statusTone}>{statusLabel}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-subtle">
                  <DateText value={s.request_date} display={auth.dateDisplay} />
                  {codes.length > 0 && <span>· {codes.join(', ')}</span>}
                  {s.status === 'approved' && <Badge tone={fTone}>{fLabel}</Badge>}
                  {s.status === 'approved' && !s.sent_at && <Badge tone="warn">Not sent</Badge>}
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
