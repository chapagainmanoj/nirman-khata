// On a worker's page (attendance): the crews they are on, each opening that crew's calendar with
// this worker chosen. Attendance is marked there and only there (GLOSSARY: Attendance); this page
// is who they are and what they are owed.
import { Link } from 'react-router'
import { Card, ErrorBanner, Spinner } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { useCurrentProject } from '../projects/current'
import { useWorkerMonth } from './api'

export function WorkerCrews({ workerId }: { workerId: string }) {
  const today = todayKathmandu()
  const card = useWorkerMonth(workerId, today, today)
  const current = useCurrentProject()
  if (card.isPending) return <Spinner />
  if (card.error) return <ErrorBanner onRetry={() => void card.refetch()}>{friendlyError(card.error)}</ErrorBanner>
  const crews = card.data.worker.crews
  const project = (pid: string | null) => {
    const p = pid && current.choices.find((x) => x.id === pid)
    return p ? `${p.code} · ${p.name}` : pid ? 'Another project' : 'Any project'
  }
  return (
    <Card title="Attendance" className="mb-4">
      {crews.length ? (
        <>
          <p className="text-sm text-subtle">Days are marked on the crew's page.</p>
          <ul className="mt-2">
            {crews.map((c) => (
              <li key={c.crew_id} className="border-b border-line last:border-0">
                <Link to={`/crews/${c.crew_id}?worker=${workerId}`} className="flex min-h-12 items-center justify-between gap-3 py-2 hover:bg-muted">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{c.crew_name}</span>
                    <span className="block text-xs text-subtle">{project(c.project_id)}</span>
                  </span>
                  <span className="shrink-0 text-sm font-medium text-slate">Open calendar</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-subtle">Not on a crew yet. Open a project's crew and use Add worker to mark their days.</p>
      )}
    </Card>
  )
}
