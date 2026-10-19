// Every other expense the person can see (req §15), under Money. "On projects" follows the
// Working on project like the other lists; "Company" holds company expenses, which belong to no
// project. RLS decides the rows: finance users see all, others their own last 7 days (X2).
import { useState } from 'react'
import { useCompany } from '../../auth/AuthProvider'
import { ButtonLink, Card, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { ShowMore } from '../../components/ShowMore'
import { friendlyError } from '../../lib/errors'
import { t } from '../../lib/i18n'
import { ExpenseTable } from '../costs/CostLists'
import { useExpenseCount, useExpenses } from '../costs/api'
import { Tabs } from '../parties/PartyParts'
import { useProjects } from '../projects/api'
import { canEnter } from '../supply/permissions'
import { useProjectFilter } from './ProjectFilter'

type Tab = 'project' | 'company'

export function ExpensesPage() {
  const auth = useCompany()
  const projects = useProjects(auth.companyId)
  const [tab, setTab] = useState<Tab>('project')
  const { projectId, chip, empty, recordProject, showProject } = useProjectFilter()
  const filter = tab === 'company' ? { kind: 'company' as const } : { kind: 'project' as const, projectId: projectId ?? undefined }
  const shown = useExpenses(filter)
  const total = useExpenseCount(filter).data
  const code = (id: string | null) => projects.data?.find((p) => p.id === id)?.code ?? null
  const newHref = tab === 'company' ? '/expenses/new?for=company' : recordProject ? `/expenses/new?project=${recordProject}` : '/expenses/new'

  return (
    <>
      <PageHeader title={t('expenses.title')} subtitle={t('expenses.subtitle')}
        actions={canEnter(auth) && <ButtonLink variant="tonal" to={newHref}>{t('record.expense')}</ButtonLink>} />
      {tab === 'project' && chip}
      <Tabs tabs={[['project', t('expenses.tab.project')], ['company', t('expenses.tab.company')]]} value={tab} onChange={setTab} label={t('expenses.title')}>
        {/* The table is its own box; a card around it would only add a second border. */}
        <div>
          {!auth.canSeeFinance && <p className="mb-2 text-xs text-subtle">{t('expenses.mine')}</p>}
          {shown.isPending && <Spinner />}
          <ErrorBanner onRetry={() => void shown.refetch()}>{shown.error && friendlyError(shown.error)}</ErrorBanner>
          {shown.data?.length === 0 && (
            <Card>
              {tab === 'company'
                ? <EmptyState title={t('expenses.empty.company')}>{t('expenses.for.companyHint')}</EmptyState>
                : empty(t('expenses.what'), <EmptyState title={t('expenses.empty')}>{t('expenses.empty.how')}</EmptyState>)}
            </Card>
          )}
          {shown.data && shown.data.length > 0 && (
            <ExpenseTable rows={shown.data} projectCode={tab === 'project' && showProject ? code : undefined} />
          )}
          <ShowMore list={shown} total={total} />
        </div>
      </Tabs>
    </>
  )
}
