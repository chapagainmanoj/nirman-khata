// The crew page's members, when the company works by attendance: who is on the crew and their rate.
import { useState } from 'react'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Badge, Button, Card, ErrorBanner, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { formatNPR } from '../../lib/money'
import { rateText, useCrewMembers, useSaveMember } from './api'
import { MemberForm } from './MemberForm'

export function MembersCard({ crewId, projectId }: { crewId: string; projectId: string | null }) {
  const auth = useCompany()
  const members = useCrewMembers(crewId)
  const save = useSaveMember()
  const [editing, setEditing] = useState<string | null>(null)

  return (
    <Card title="Workers" actions={editing !== 'new' && <Button variant="tonal" onClick={() => setEditing('new')}>Add worker</Button>}>
      {members.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void members.refetch()}>{members.error && friendlyError(members.error)}</ErrorBanner>
      {editing === 'new' && <div className="mb-3 rounded-lg border border-line p-3"><MemberForm crewId={crewId} onDone={() => setEditing(null)} /></div>}
      {members.data?.length === 0 && editing !== 'new' && (
        <p className="text-sm text-subtle">No workers yet. Add each worker with their rate to mark their attendance.</p>
      )}
      <ul>
        {members.data?.map((m) => (
          <li key={m.id} className="border-b border-line py-2 last:border-0">
            {editing === m.id ? (
              <MemberForm crewId={crewId} member={m} onDone={() => setEditing(null)} />
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{m.name} {!m.active && <Badge>Inactive</Badge>}</span>
                  <span className="block text-xs text-subtle">{[m.work_type, rateText(m as { rate_kind: 'daily' | 'hourly'; rate_paisa: number }, formatNPR), m.phone].filter(Boolean).join(' · ')}</span>
                </span>
                <Button variant="ghost" onClick={() => setEditing(m.id)}>Edit</Button>
                <Button variant="ghost" disabled={save.isPending}
                  onClick={() => save.mutate({ id: m.id, companyId: auth.companyId, values: { active: !m.active } })}>
                  {m.active ? 'Remove from crew' : 'Put back'}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <ErrorBanner>{save.error && friendlyError(save.error)}</ErrorBanner>
      {projectId && !!members.data?.some((m) => m.active) && (
        <p className="mt-2 text-sm"><Link className="text-slate" to={`/labour/attendance?project=${projectId}&crew=${crewId}`}>Mark today's attendance</Link></p>
      )}
    </Card>
  )
}
