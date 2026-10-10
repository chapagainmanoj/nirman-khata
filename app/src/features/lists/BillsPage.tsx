// Every supplier bill the person can see. Accounts open on "To post": the bills site staff
// photographed or entered and sent on.
import { useState } from 'react'
import { useCompany } from '../../auth/AuthProvider'
import { ButtonLink, Card, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { formatNPR } from '../../lib/money'
import { Tabs } from '../parties/PartyParts'
import { useBills } from '../supply/api'
import { BillRow } from '../supply/BillRow'
import { canEnter, canPost } from '../supply/permissions'
import { useProjectFilter } from './ProjectFilter'

type Tab = 'to_post' | 'drafts' | 'posted' | 'all'
const STATUSES = {
  to_post: ['under_review'],
  drafts: ['draft'],
  posted: ['posted'],
  all: undefined,
} as const

const EMPTY: Record<Tab, string> = {
  to_post: 'Nothing waiting to be posted.',
  drafts: 'No drafts.',
  posted: 'No posted bills.',
  all: 'No bills yet.',
}

export function BillsPage() {
  const auth = useCompany()
  const posts = canPost(auth)
  const [tab, setTab] = useState<Tab>(posts ? 'to_post' : 'drafts')
  const { projectId, chip, empty, recordProject, showProject } = useProjectFilter()
  // One query for every tab, so each tab can say how many bills it holds.
  const all = useBills({ companyId: auth.companyId, projectId: projectId ?? undefined })
  const inTab = (t: Tab) => (all.data ?? []).filter((b) => !STATUSES[t] || (STATUSES[t] as readonly string[]).includes(b.status))
  const shown = all.data && inTab(tab)
  const named = (t: Tab, text: string): [Tab, string] => [t, all.data && t !== 'all' ? `${text} (${inTab(t).length})` : text]
  const tabs: Array<[Tab, string]> = posts
    ? [named('to_post', 'To post'), named('drafts', 'Drafts'), named('posted', 'Posted'), ['all', 'All']]
    : auth.canSeeFinance
      ? [named('drafts', 'My drafts'), named('posted', 'Posted'), ['all', 'All']]
      : [named('drafts', 'My drafts')]
  const owed = (shown ?? []).filter((b) => b.status === 'posted')
    .reduce((t, b) => t + Math.max(0, b.payable_paisa - b.credited_paisa - b.settled_paisa), 0)

  return (
    <>
      <PageHeader title="Bills" subtitle={posts ? 'Post bills sent from site, and see what is still unpaid.' : undefined}
        actions={canEnter(auth) && <ButtonLink to={recordProject ? `/bills/new?project=${recordProject}` : '/bills/new'}>{posts ? 'Enter bill' : 'Bill photo'}</ButtonLink>} />
      {chip}
      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Bills">
        <Card>
          {all.isPending && <Spinner />}
          <ErrorBanner onRetry={() => void all.refetch()}>{all.error && friendlyError(all.error)}</ErrorBanner>
          {shown?.length === 0 && empty('bills here', <EmptyState title={EMPTY[tab]} />)}
          {owed > 0 && (tab === 'posted' || tab === 'all') && (
            <p className="mb-2 border-b border-line pb-2 text-sm text-subtle">Still owed on these bills: <span className="font-semibold text-ink tabular-nums">{formatNPR(owed)}</span></p>
          )}
          <ul>{shown?.map((b) => <BillRow key={b.id} bill={b} showSupplier showProject={showProject} />)}</ul>
        </Card>
      </Tabs>
    </>
  )
}
