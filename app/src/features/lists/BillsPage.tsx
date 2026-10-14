// Every supplier bill the person can see. Accounts open on "To post": the bills site staff
// photographed or entered and sent on.
import { useState } from 'react'
import { useCompany } from '../../auth/AuthProvider'
import { ButtonLink, Card, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { formatNPR } from '../../lib/money'
import { ShowMore } from '../../components/ShowMore'
import { Tabs } from '../parties/PartyParts'
import { useBillCount, useBills, useBillsOwed } from '../supply/api'
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

// How bills get to each tab, for a tab that is empty: an owner who posts their own bills may never
// have seen To post or Drafts fill up.
const HOW: Record<Tab, string> = {
  to_post: 'Bills entered by site staff or a project manager and sent with "Send to Accounts" wait here to be checked and posted. Bills entered by Admin or Accounts are posted straight away.',
  drafts: 'A bill saved with "Save draft" waits here until it is finished.',
  posted: 'Posted bills count in cost and in what is owed to the supplier.',
  all: 'Enter a bill when a supplier sends one.',
}

export function BillsPage() {
  const auth = useCompany()
  const posts = canPost(auth)
  const [tab, setTab] = useState<Tab>(posts ? 'to_post' : 'drafts')
  const { projectId, chip, empty, recordProject, showProject } = useProjectFilter()
  const scope = { companyId: auth.companyId, projectId: projectId ?? undefined }
  const shown = useBills({ ...scope, statuses: STATUSES[tab] })
  // Tab counts come from the server, so they cover every bill, not just the loaded ones.
  const counts = {
    to_post: useBillCount({ ...scope, statuses: STATUSES.to_post }, posts),
    drafts: useBillCount({ ...scope, statuses: STATUSES.drafts }),
    posted: useBillCount({ ...scope, statuses: STATUSES.posted }, auth.canSeeFinance),
  }
  const named = (t: Exclude<Tab, 'all'>, text: string): [Tab, string] => [t, counts[t].data !== undefined ? `${text} (${counts[t].data})` : text]
  const tabs: Array<[Tab, string]> = posts
    ? [named('to_post', 'To post'), named('drafts', 'Drafts'), named('posted', 'Posted'), ['all', 'All']]
    : auth.canSeeFinance
      ? [named('drafts', 'My drafts'), named('posted', 'Posted'), ['all', 'All']]
      : [named('drafts', 'My drafts')]
  const owed = useBillsOwed(auth.companyId, { projectId: projectId ?? undefined }, auth.canSeeFinance && (tab === 'posted' || tab === 'all')).data ?? 0
  const total = tab === 'all' ? null : counts[tab].data

  return (
    <>
      <PageHeader title="Bills" subtitle={posts ? 'Post bills sent from site, and see what is still unpaid.' : undefined}
        actions={canEnter(auth) && <ButtonLink variant="tonal" to={recordProject ? `/bills/new?project=${recordProject}` : '/bills/new'}>{posts ? 'Enter bill' : 'Bill photo'}</ButtonLink>} />
      {chip}
      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Bills">
        <Card>
          {shown.isPending && <Spinner />}
          <ErrorBanner onRetry={() => void shown.refetch()}>{shown.error && friendlyError(shown.error)}</ErrorBanner>
          {shown.data?.length === 0 && empty('bills here', <EmptyState title={EMPTY[tab]}>{HOW[tab]}</EmptyState>)}
          {owed > 0 && (tab === 'posted' || tab === 'all') && (
            <p className="mb-2 border-b border-line pb-2 text-sm text-subtle">Still owed on these bills: <span className="font-semibold text-ink tabular-nums">{formatNPR(owed)}</span></p>
          )}
          <ul>{shown.data?.map((b) => <BillRow key={b.id} bill={b} showSupplier showProject={showProject} />)}</ul>
          <ShowMore list={shown} total={total} />
        </Card>
      </Tabs>
    </>
  )
}
