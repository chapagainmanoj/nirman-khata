import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateText } from '../../components/DateInput'
import { Badge, ButtonLink, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { t } from '../../lib/i18n'
import { STATUS_LABELS, STATUS_TONE } from '../../lib/labels'
import { useProjects } from './api'

export function ProjectsPage() {
  const auth = useCompany()
  const projects = useProjects(auth.companyId)

  return (
    <>
      <PageHeader
        title={t('projects.title')}
        actions={auth.isAdmin && <ButtonLink to="/projects/new">{t('projects.new')}</ButtonLink>}
      />
      {projects.isPending && <Spinner />}
      {projects.error && <ErrorBanner onRetry={() => void projects.refetch()}>{friendlyError(projects.error)}</ErrorBanner>}
      {projects.data?.length === 0 && (
        <EmptyState title={t('projects.empty')}>
          {auth.isAdmin ? 'Create your first project to start recording work.' : 'You are not assigned to any project yet.'}
        </EmptyState>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {projects.data?.map((p) => (
          <li key={p.id} className="min-w-0">
            <Link to={`/projects/${p.id}`} className="block rounded-xl border border-line bg-surface p-4 hover:border-brand">
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
