// Order slips: drafts, waiting for approval, open (not fully received), all (req §9.3).
import { useState } from 'react'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateText } from '../../components/DateInput'
import { Badge, ButtonLink, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { ShowMore } from '../../components/ShowMore'
import { FULFILMENT, SLIP_STATUS } from '../../lib/labels'
import { useProjectFilter } from '../lists/ProjectFilter'
import { useProjects } from '../projects/api'
import { useSlipCount, useSlips } from './api'
import { canEnter } from './permissions'

type Filter = 'open' | 'pending' | 'draft' | 'all'
const FILTERS: Array<[Filter, string]> = [['open', 'Open'], ['pending', 'To approve'], ['draft', 'Drafts'], ['all', 'All']]
// Empty lists name the tab: "No slips to approve on P-2 yet."
const WHAT: Record<Filter, string> = { open: 'open slips', pending: 'slips to approve', draft: 'draft slips', all: 'slips' }

/** How slips get to each tab, for a tab that is empty. */
function howSlipsGetHere(filter: Filter, approvalOn: boolean) {
  if (filter === 'open') return 'Approved slips stay here until everything ordered has arrived; a part delivery keeps them open.'
  if (filter === 'pending') {
    return approvalOn
      ? 'Slips sent with "Submit for approval" wait here until someone who may approve them approves or rejects them.'
      : 'Approval is off in Settings, so a submitted slip is approved straight away.'
  }
  if (filter === 'draft') return 'A slip saved with "Save draft" waits here until it is submitted.'
  return 'Create a slip to order material from a supplier for one or more projects.'
}

export function SlipsPage() {
  const auth = useCompany()
  const projects = useProjects(auth.companyId)
  const [filter, setFilter] = useState<Filter>('open')
  const code = (id: string) => projects.data?.find((p) => p.id === id)?.code
  const { projectId, chip, empty, recordProject } = useProjectFilter()
  const scope = { companyId: auth.companyId, projectId }
  const slips = useSlips({ ...scope, tab: filter })
  const list = slips.data
  const counts = { pending: useSlipCount({ ...scope, tab: 'pending' }).data, draft: useSlipCount({ ...scope, tab: 'draft' }).data }
  const count = (f: Filter) => (f === 'pending' || f === 'draft' ? counts[f] : 0)

  return (
    <>
      <PageHeader title="Order slips" actions={canEnter(auth) && <ButtonLink variant="tonal" to={recordProject ? `/slips/new?project=${recordProject}` : '/slips/new'}>New slip</ButtonLink>} />
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
      {list?.length === 0 && empty(WHAT[filter], (
        <EmptyState title={`No ${WHAT[filter]}`}>{howSlipsGetHere(filter, auth.company.slip_approval_required)}</EmptyState>
      ))}
      <ul className="grid gap-3 sm:grid-cols-2">
        {list?.map((s) => {
          const [statusLabel, statusTone] = SLIP_STATUS[s.status]
          const [fLabel, fTone] = FULFILMENT[s.fulfilment] ?? FULFILMENT.not_received
          const codes = s.project_ids.map((id) => code(id)).filter(Boolean)
          return (
            <li key={s.id}>
              <Link to={`/slips/${s.id}`} className="block rounded-xl border border-line bg-surface p-4 hover:border-slate">
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
      <ShowMore list={slips} total={filter === 'all' || filter === 'open' ? null : count(filter)} />
    </>
  )
}
