// Every supplier bill the person can see. It opens on the person's queue when something waits in
// it (Accounts: "To post", the bills site staff photographed or entered and sent on), else on All.
import { useState } from 'react'
import { useCompany } from '../../auth/AuthProvider'
import { ButtonLink, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { formatNPR } from '../../lib/money'
import { ShowMore } from '../../components/ShowMore'
import { Tabs } from '../parties/PartyParts'
import { useBillCount, useBills, useBillsOwed } from '../supply/api'
import { BillTable } from '../supply/BillRow'
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
  const [chosen, setTab] = useState<Tab | null>(null)
  const { projectId, chip, empty, recordProject, showProject } = useProjectFilter()
  const scope = { companyId: auth.companyId, projectId: projectId ?? undefined }
  // Tab counts come from the server, so they cover every bill, not just the loaded ones.
  const counts = {
    to_post: useBillCount({ ...scope, statuses: STATUSES.to_post }, posts),
    drafts: useBillCount({ ...scope, statuses: STATUSES.drafts }),
    posted: useBillCount({ ...scope, statuses: STATUSES.posted }, auth.canSeeFinance),
  }
  // Until a tab is tapped: the person's own queue when something waits in it (Accounts: To post,
  // then drafts), otherwise All. Site staff without finance see only their drafts.
  const queue = (posts ? (['to_post', 'drafts'] as const) : (['drafts'] as const))
  const waiting = queue.find((t) => (counts[t].data ?? 0) > 0)
  // A count that failed counts as known, so the page never waits on it.
  const known = queue.every((t) => counts[t].data !== undefined || counts[t].isError)
  const settling = chosen === null && !known
  const tab: Tab = chosen ?? (!auth.canSeeFinance && !posts ? 'drafts' : waiting ?? (known ? 'all' : queue[0]))
  const shown = useBills({ ...scope, statuses: STATUSES[tab] })
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
        {(settling || shown.isPending) && <Spinner />}
        <ErrorBanner onRetry={() => void shown.refetch()}>{shown.error && friendlyError(shown.error)}</ErrorBanner>
        {!settling && shown.data?.length === 0 && empty('bills here', <EmptyState title={EMPTY[tab]}>{HOW[tab]}</EmptyState>)}
        {owed > 0 && (tab === 'posted' || tab === 'all') && (
          <p className="mb-2 text-sm text-subtle">Still owed on these bills: <span className="font-semibold text-ink tabular-nums">{formatNPR(owed)}</span></p>
        )}
        {!settling && !!shown.data?.length && <BillTable bills={shown.data} showSupplier showProject={showProject} />}
        <ShowMore list={shown} total={total} />
      </Tabs>
    </>
  )
}
