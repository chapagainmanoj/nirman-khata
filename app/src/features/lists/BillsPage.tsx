// Every supplier bill the person can see. Accounts open on "To post": the bills site staff
// photographed or entered and sent on.
import { useState } from 'react'
import { useCompany } from '../../auth/AuthProvider'
import { ButtonLink, Card, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
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
  const { projectId, chip } = useProjectFilter()
  const statuses = STATUSES[tab]
  const bills = useBills({ companyId: auth.companyId, projectId: projectId ?? undefined, statuses: statuses && [...statuses] })
  const tabs: Array<[Tab, string]> = posts
    ? [['to_post', 'To post'], ['drafts', 'Drafts'], ['posted', 'Posted'], ['all', 'All']]
    : auth.canSeeFinance
      ? [['drafts', 'My drafts'], ['posted', 'Posted'], ['all', 'All']]
      : [['drafts', 'My drafts']]

  return (
    <>
      <PageHeader title="Bills" subtitle={posts ? 'Post bills sent from site, and see what is still unpaid.' : undefined}
        actions={canEnter(auth) && <ButtonLink to={projectId ? `/bills/new?project=${projectId}` : '/bills/new'}>{posts ? 'Enter bill' : 'Bill photo'}</ButtonLink>} />
      {chip}
      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Bills">
        <Card>
          {bills.isPending && <Spinner />}
          <ErrorBanner onRetry={() => void bills.refetch()}>{bills.error && friendlyError(bills.error)}</ErrorBanner>
          {bills.data?.length === 0 && <EmptyState title={EMPTY[tab]} />}
          <ul>{bills.data?.map((b) => <BillRow key={b.id} bill={b} showSupplier />)}</ul>
        </Card>
      </Tabs>
    </>
  )
}
