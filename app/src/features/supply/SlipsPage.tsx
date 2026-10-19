// Order slips: drafts, waiting for approval, open (not fully received), all (req §9.3).
import { useState } from 'react'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateText } from '../../components/DateInput'
import { Badge, ButtonLink, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { ShowMore } from '../../components/ShowMore'
import { FULFILMENT, SLIP_STATUS } from '../../lib/labels'
import { useListFilters } from '../lists/ListFilters'
import { useProjectFilter } from '../lists/ProjectFilter'
import { useProjects } from '../projects/api'
import { useSlipCount, useSlips } from './api'
import { canEnter } from '../../data/permissions'
import { t, type MessageKey } from '../../lib/i18n'

type Filter = 'open' | 'pending' | 'draft' | 'all'
const FILTERS: Array<[Filter, MessageKey]> = [['open', 'slips.filter.open'], ['pending', 'slips.filter.pending'], ['draft', 'slips.filter.draft'], ['all', 'slips.filter.all']]
// Empty lists name the tab: "No order slips to approve on P-2 yet."
const WHAT: Record<Filter, MessageKey> = { open: 'slips.what.open', pending: 'slips.what.pending', draft: 'slips.what.draft', all: 'slips.what.all' }

/** How slips get to each tab, for a tab that is empty. */
function howSlipsGetHere(filter: Filter, approvalOn: boolean) {
  if (filter === 'open') return t('slips.approvedOrderSlipsStay')
  if (filter === 'pending') {
    return approvalOn
      ? t('slips.orderSlipsSentWith')
      : t('slips.approvalIsOffIn')
  }
  if (filter === 'draft') return t('slips.anOrderSlipSaved')
  return t('slips.createAnOrderSlip')
}

export function SlipsPage() {
  const auth = useCompany()
  const projects = useProjects(auth.companyId)
  const [filter, setFilter] = useState<Filter>('open')
  const code = (id: string) => projects.data?.find((p) => p.id === id)?.code
  const { projectId, chip, empty, recordProject, showProject } = useProjectFilter()
  const scope = { companyId: auth.companyId, projectId }
  const search = useListFilters({ placeholder: t('slips.searchSlipNumberOr') })
  const slips = useSlips({ ...scope, ...search.filter, tab: filter })
  const list = slips.data
  const counts = { pending: useSlipCount({ ...scope, tab: 'pending' }).data, draft: useSlipCount({ ...scope, tab: 'draft' }).data }
  const th = 'py-2 pr-3 font-medium'
  const count = (f: Filter) => (f === 'pending' || f === 'draft' ? counts[f] : 0)

  return (
    <>
      <PageHeader title={t('slips.orderSlips')} actions={canEnter(auth) && <ButtonLink variant="tonal" to={recordProject ? `/slips/new?project=${recordProject}` : '/slips/new'}>{t('slips.newOrderSlip')}</ButtonLink>} />
      {chip}
      {search.bar}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-track p-1" role="group" aria-label={t('slips.showOrderSlips')}>
        {FILTERS.map(([key, label]) => {
          const n = key === 'pending' || key === 'draft' ? count(key) : 0
          return (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
              className={`min-h-11 flex-1 rounded-md px-2 text-sm font-medium whitespace-nowrap ${filter === key ? 'bg-surface text-ink shadow-sm' : 'text-subtle'}`}>
              {t(label)}{n ? ` (${n})` : ''}
            </button>
          )
        })}
      </div>
      {slips.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void slips.refetch()}>{slips.error && friendlyError(slips.error)}</ErrorBanner>
      {list?.length === 0 && search.active && (
        <p className="text-sm text-subtle">
          {t('slips.noValueMatchValue2', { value: t(WHAT[filter]), value2: ' ' })}{/* A search usually means one slip, which may have left this tab already. */}
          {filter !== 'all' && <button type="button" onClick={() => setFilter('all')} className="font-medium text-slate underline underline-offset-4">{t('slips.searchAllOrderSlips')}</button>}
          {filter === 'all' && <button type="button" onClick={search.clear} className="font-medium text-slate underline underline-offset-4">{t('slips.clearSearch')}</button>}
        </p>
      )}
      {list?.length === 0 && !search.active && empty(t(WHAT[filter]), (
        <EmptyState title={t('slips.noValue', { value: t(WHAT[filter]) })}>{howSlipsGetHere(filter, auth.company.slip_approval_required)}</EmptyState>
      ))}
      {list && list.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-subtle">
                <th scope="col" className={`hidden pl-4 sm:table-cell ${th}`}>{t('slips.date')}</th>
                <th scope="col" className={`hidden md:table-cell ${th}`}>{t('slips.number')}</th>
                <th scope="col" className={`pl-4 sm:pl-0 ${th}`}>{t('common.supplier')}</th>
                {showProject && <th scope="col" className={`hidden md:table-cell ${th}`}>{t('slips.projects')}</th>}
                <th scope="col" className="py-2 pr-4 text-right font-medium">{t('slips.status')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const to = `/slips/${s.id}`
                const [statusLabel, statusTone] = SLIP_STATUS[s.status]
                const [fLabel, fTone] = FULFILMENT[s.fulfilment] ?? FULFILMENT.not_received
                const codes = s.project_ids.map((id) => code(id)).filter(Boolean).join(', ')
                return (
                  <tr key={s.id} className="border-b border-line align-middle last:border-0 hover:bg-muted">
                    <td className="hidden py-2 pr-3 pl-4 whitespace-nowrap text-subtle sm:table-cell"><DateText value={s.request_date} display={auth.dateDisplay} /></td>
                    <td className="hidden py-2 pr-3 whitespace-nowrap md:table-cell"><Link to={to} className="text-slate hover:underline">{s.number}</Link></td>
                    <td className="py-2 pr-3 pl-4 sm:pl-0">
                      {/* Smaller screens: the number is part of the link, the date and projects go under it. */}
                      <Link to={to} className="inline-flex min-h-11 min-w-11 [@media(pointer:fine)]:min-h-8 flex-col justify-center font-medium break-words text-ink hover:underline">
                        {s.suppliers?.name}<span className="text-xs font-semibold text-subtle md:hidden">{s.number}</span>
                      </Link>
                      <div className="text-xs text-subtle md:hidden">
                        <span className="sm:hidden"><DateText value={s.request_date} display={auth.dateDisplay} />{showProject && codes && ' · '}</span>
                        {showProject && codes}
                      </div>
                    </td>
                    {showProject && <td className="hidden py-2 pr-3 md:table-cell">{codes}</td>}
                    <td className="py-2 pr-4 text-right">
                      {/* Approved slips say how much has come; the others say where they are in approval. */}
                      <div className="flex flex-wrap justify-end gap-1">
                        {s.status === 'approved' ? <Badge tone={fTone}>{fLabel}</Badge> : <Badge tone={statusTone}>{statusLabel}</Badge>}
                        {s.status === 'approved' && !s.sent_at && <Badge tone="warn">{t('slips.notSent')}</Badge>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* The tab counts ignore the search, so they are no total for a searched list. */}
      <ShowMore list={slips} total={filter === 'all' || filter === 'open' || search.active ? null : count(filter)} />
    </>
  )
}
