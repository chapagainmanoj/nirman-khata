import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateText } from '../../components/DateInput'
import { Badge, ButtonLink, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { t } from '../../lib/i18n'
import { STATUS_LABELS, STATUS_TONE } from '../../lib/labels'
import { formatNPR } from '../../lib/money'
import { useProjectCost } from '../supply/api'
import { useProjects } from './api'
import { GettingStarted } from './GettingStarted'

export function ProjectsPage() {
  const auth = useCompany()
  const projects = useProjects(auth.companyId)

  return (
    <>
      <PageHeader
        title={t('projects.title')}
        // With no projects yet, the button sits in the empty state instead.
        actions={auth.isAdmin && !!projects.data?.length && <ButtonLink variant="tonal" to="/projects/new">{t('projects.new')}</ButtonLink>}
      />
      <GettingStarted />
      {projects.isPending && <Spinner />}
      {projects.error && <ErrorBanner onRetry={() => void projects.refetch()}>{friendlyError(projects.error)}</ErrorBanner>}
      {projects.data?.length === 0 && (
        <EmptyState title={t('projects.empty')}>
          {auth.isAdmin ? 'Create your first project to start recording work.' : 'You are not assigned to any project yet.'}
          {auth.isAdmin && <div className="mt-3"><ButtonLink to="/projects/new">{t('projects.new')}</ButtonLink></div>}
        </EmptyState>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {projects.data?.map((p) => (
          <li key={p.id} className="min-w-0">
            <Link to={`/projects/${p.id}`} className="block rounded-xl border border-line bg-surface p-4 hover:border-slate">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-subtle">{p.code}</div>
                  <div className="truncate font-semibold text-ink">{p.name}</div>
                </div>
                <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABELS[p.status]}</Badge>
              </div>
              <div className="mt-2 text-sm text-subtle">
                {[p.municipality, p.district].filter(Boolean).join(', ') || 'No location'}
              </div>
              {auth.canSeeFinance && <ProjectMoney projectId={p.id} />}
              {p.planned_end && (
                <div className="mt-1 text-xs text-subtle">
                  Planned finish: <DateText value={p.planned_end} display={auth.dateDisplay} />
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

/** The owner's first question on the list: what has this site cost, and what is still owed? */
function ProjectMoney({ projectId }: { projectId: string }) {
  const cost = useProjectCost(projectId, todayKathmandu(), true)
  if (!cost.data) return null
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 text-sm tabular-nums">
      <span className="text-subtle">Cost <span className="font-semibold text-ink">{formatNPR(cost.data.cost_paisa)}</span></span>
      {cost.data.payable_paisa > 0 && (
        <span className="text-subtle">Owed <span className="font-semibold text-ink">{formatNPR(cost.data.payable_paisa)}</span></span>
      )}
    </div>
  )
}
