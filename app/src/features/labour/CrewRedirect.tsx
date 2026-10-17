// "Attendance" from "+ Record", a project or a daily report: the project's crew page, the one place
// its workers' days are marked. A project with several crews opens its main crew; without a project,
// the crew list. The old day roster's address (/labour/attendance?project=&crew=&date=) lands here too.
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { ErrorBanner, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { useCrews } from '../costs/api'
import { useCurrentProject } from '../projects/current'

export function CrewRedirect() {
  const auth = useCompany()
  const [params] = useSearchParams()
  const current = useCurrentProject()
  const crews = useCrews(auth.companyId)
  const projectId = params.get('project') || current.project?.id || ''
  const crewId = params.get('crew')
  const date = params.get('date')
  const query = date ? `?date=${date}` : ''
  if (crewId) return <Navigate to={`/crews/${crewId}${query}`} replace />
  if (!projectId) return <Navigate to="/crews" replace />
  if (crews.isPending) return <Spinner />
  if (crews.error) return <ErrorBanner onRetry={() => void crews.refetch()}>{friendlyError(crews.error)}</ErrorBanner>
  const list = crews.data.filter((c) => c.active && c.project_id === projectId)
  const crew = list.find((c) => c.is_default) ?? list[0]
  return <Navigate to={crew ? `/crews/${crew.id}${query}` : '/crews'} replace />
}

/** The old time card address: the worker's page, which links to the crews where their days are marked. */
export function TimeCardRedirect() {
  const { id = '' } = useParams()
  const { search } = useLocation()
  return <Navigate to={`/workers/${id}${search}`} replace />
}
