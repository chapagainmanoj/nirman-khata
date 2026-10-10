// A sent daily report. It is not changed after sending; photos can still be added.
import { Link, useParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Attachments } from '../../components/Attachments'
import { DateText } from '../../components/DateInput'
import { Card, Detail, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { formatDateTime } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { formatNPR } from '../../lib/money'
import { memberName, useMembers } from '../projects/api'
import { canEnter } from '../supply/permissions'
import { useDailyReport, useReportLabour } from './api'

export function ReportDetailPage() {
  const { reportId = '' } = useParams()
  const auth = useCompany()
  const report = useDailyReport(reportId)
  const labour = useReportLabour(reportId)
  const members = useMembers(auth.companyId)

  if (report.isPending) return <Spinner />
  if (report.error) return <ErrorBanner onRetry={() => void report.refetch()}>{friendlyError(report.error)}</ErrorBanner>
  if (!report.data) {
    return <EmptyState title="Report not found">It does not exist or you are not assigned to its project. <Link className="text-slate" to="/projects">Back to projects</Link></EmptyState>
  }
  const r = report.data
  const d = auth.dateDisplay
  const lines = [...r.daily_report_lines].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <>
      <PageHeader
        title="Daily report"
        crumbs={[{ to: '/projects', label: 'Projects' }, { to: `/projects/${r.project_id}?tab=site`, label: r.projects?.name ?? 'Project' }]}
        subtitle={<DateText value={r.work_date} display={d} dual />}
      />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title="Work done">
          <p className="text-sm whitespace-pre-line text-ink">{r.work_done}</p>
          {lines.length > 0 && (
            <ul className="mt-3">
              {lines.map((l) => (
                <li key={l.id} className="flex justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0">
                  <span>{l.description}</span>
                  <span className="shrink-0 tabular-nums text-subtle">{l.qty ?? ''} {l.units?.code ?? ''}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <Detail label="Stage">{r.stages?.name}</Detail>
            <Detail label="Area or floor">{r.area}</Detail>
            <Detail label="People on site">{r.headcount}</Detail>
            <Detail label="Labour note">{r.labour_note}</Detail>
            <Detail label="Equipment">{r.equipment}</Detail>
            <Detail label="Issues or delays">{r.issues}</Detail>
            <Detail label="Weather">{r.weather}</Detail>
            {labour.data && (
              <Detail label="Labour cost">
                {formatNPR(labour.data.amount_paisa)}{labour.data.crews?.name && ` · ${labour.data.crews.name}`}
              </Detail>
            )}
            <Detail label="Sent by">{memberName(members.data, r.created_by)}, {formatDateTime(r.submitted_at, d)}</Detail>
          </div>
        </Card>
        <Card title="Photos">
          <Attachments owner={{ daily_report_id: r.id }} canAdd={canEnter(auth)} label="Add site photo" />
        </Card>
      </div>
    </>
  )
}
