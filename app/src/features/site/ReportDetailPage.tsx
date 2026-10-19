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
import { canEnter } from '../../data/permissions'
import { useDailyReport, useReportLabour, weatherLabel } from './api'
import { t } from '../../lib/i18n'

export function ReportDetailPage() {
  const { reportId = '' } = useParams()
  const auth = useCompany()
  const report = useDailyReport(reportId)
  const labour = useReportLabour(reportId)
  const members = useMembers(auth.companyId)

  if (report.isPending) return <Spinner />
  if (report.error) return <ErrorBanner onRetry={() => void report.refetch()}>{friendlyError(report.error)}</ErrorBanner>
  if (!report.data) {
    return <EmptyState title={t('reportDetail.reportNotFound')}>{t('reportDetail.itDoesNotExist')}{' '}<Link className="text-slate" to="/projects">{t('reportDetail.backToProjects')}</Link></EmptyState>
  }
  const r = report.data
  const d = auth.dateDisplay
  const lines = [...r.daily_report_lines].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <>
      <PageHeader
        title={t('reportDetail.dailyReport')}
        crumbs={[{ to: '/projects', label: t('reportDetail.projects') }, { to: `/projects/${r.project_id}?tab=site`, label: r.projects?.name ?? t('reportDetail.project') }]}
        subtitle={<DateText value={r.work_date} display={d} dual />}
      />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title={t('reportDetail.workDone')}>
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
            <Detail label={t('reportDetail.stage')}>{r.stages?.name}</Detail>
            <Detail label={t('reportDetail.areaOrFloor')}>{r.area}</Detail>
            <Detail label={t('reportDetail.peopleOnSite')}>{r.headcount}</Detail>
            <Detail label={t('reportDetail.labourNote')}>{r.labour_note}</Detail>
            <Detail label={t('reportDetail.equipment')}>{r.equipment}</Detail>
            <Detail label={t('reportDetail.issuesOrDelays')}>{r.issues}</Detail>
            <Detail label={t('reportDetail.weather')}>{r.weather && weatherLabel(r.weather)}</Detail>
            {labour.data && (
              <Detail label={t('reportDetail.labourCost')}>
                {formatNPR(labour.data.amount_paisa)}{labour.data.crews?.name && ` · ${labour.data.crews.name}`}
              </Detail>
            )}
            <Detail label={t('reportDetail.sentBy')}>{memberName(members.data, r.created_by)}, {formatDateTime(r.submitted_at, d)}</Detail>
          </div>
        </Card>
        <Card title={t('reportDetail.photos')}>
          <Attachments owner={{ daily_report_id: r.id }} canAdd={canEnter(auth)} label={t('reportDetail.addSitePhoto')} />
        </Card>
      </div>
    </>
  )
}
