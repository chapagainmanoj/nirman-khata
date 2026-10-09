// Contract and budget revision history, plus admin forms to add a revision (req §6).
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useCompany } from '../../auth/AuthProvider'
import { DateInput, DateText } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { Badge, Button, Card, ErrorBanner, Field, Input, Notice, Spinner } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { t } from '../../lib/i18n'
import { formatNPR, parseNPR } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { memberName, useHeadings, useRevisions, type Member } from './api'

type Row = {
  id: string
  kind: 'Contract' | 'Budget'
  effective_date: string
  amount: number
  reason: string | null
  created_by: string | null
  created_at: string
  lines?: Array<{ heading_id: string; amount_paisa: number }>
}

export function RevisionsCard({ projectId, members }: { projectId: string; members: Member[] }) {
  const auth = useCompany()
  const revisions = useRevisions(projectId, true)
  const headings = useHeadings(auth.companyId)
  const [form, setForm] = useState<'contract' | 'budget' | null>(null)

  const rows: Row[] = [
    ...(revisions.data?.contract ?? []).map((r) => ({
      id: r.id, kind: 'Contract' as const, effective_date: r.effective_date, amount: r.amount_paisa,
      reason: r.reason, created_by: r.created_by, created_at: r.created_at,
    })),
    ...(revisions.data?.budget ?? []).map((r) => ({
      id: r.id, kind: 'Budget' as const, effective_date: r.effective_date, amount: r.total_paisa,
      reason: r.reason, created_by: r.created_by, created_at: r.created_at, lines: r.budget_lines,
    })),
  ].sort((a, b) => b.effective_date.localeCompare(a.effective_date) || b.created_at.localeCompare(a.created_at))

  const headingName = (id: string) => headings.data?.find((h) => h.id === id)?.name ?? 'Heading'

  return (
    <Card
      title={t('project.revisions')}
      className="lg:col-span-2"
      actions={auth.isAdmin && !form && (
        <div className="flex gap-1">
          <Button variant="ghost" onClick={() => setForm('contract')}>Revise contract</Button>
          <Button variant="ghost" onClick={() => setForm('budget')}>Revise budget</Button>
        </div>
      )}
    >
      {form && <RevisionForm kind={form} projectId={projectId} onDone={() => setForm(null)} />}
      {revisions.isPending && <Spinner />}
      <ErrorBanner>{revisions.error && friendlyError(revisions.error)}</ErrorBanner>
      <ul>
        {rows.map((r) => (
          <li key={r.id} className="border-b border-line py-3 last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge tone={r.kind === 'Contract' ? 'info' : 'neutral'}>{r.kind}</Badge>
                <span className="font-semibold text-ink">{formatNPR(r.amount)}</span>
              </div>
              <span className="text-sm text-subtle">from <DateText value={r.effective_date} display={auth.dateDisplay} dual /></span>
            </div>
            <div className="mt-1 text-sm text-ink">{r.reason}</div>
            {r.lines && r.lines.length > 0 && (
              <ul className="mt-1 text-xs text-subtle">
                {r.lines.map((l) => <li key={l.heading_id}>{headingName(l.heading_id)}: {formatNPR(l.amount_paisa)}</li>)}
              </ul>
            )}
            <div className="mt-1 text-xs text-subtle">By {memberName(members, r.created_by)}</div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function RevisionForm({ kind, projectId, onDone }: { kind: 'contract' | 'budget'; projectId: string; onDone: () => void }) {
  const auth = useCompany()
  const queryClient = useQueryClient()
  const headings = useHeadings(auth.companyId)
  const [date, setDate] = useState(todayKathmandu())
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [split, setSplit] = useState(false)
  const [lines, setLines] = useState<Record<string, string>>({})
  const [warning, setWarning] = useState('')
  const [error, setError] = useState('')

  const topHeadings = headings.data?.filter((h) => !h.parent_id && h.active) ?? []
  const totalPaisa = parseNPR(amount)
  const linePaisa = Object.values(lines).map((v) => parseNPR(v) ?? 0)
  const linesSum = linePaisa.reduce((a, b) => a + b, 0)

  const save = useMutation({
    mutationFn: async () => {
      if (kind === 'contract') {
        const { error } = await supabase.rpc('add_contract_revision', {
          p_project: projectId, p_effective_date: date, p_amount_paisa: totalPaisa!, p_reason: reason,
        })
        if (error) throw error
        return null
      }
      const payload = split
        ? Object.entries(lines)
            .filter(([, v]) => (parseNPR(v) ?? 0) > 0)
            .map(([heading_id, v]) => ({ heading_id, amount_paisa: parseNPR(v)! }))
        : []
      const { data, error } = await supabase.rpc('add_budget_revision', {
        p_project: projectId, p_effective_date: date, p_total_paisa: totalPaisa!, p_reason: reason, p_lines: payload,
      })
      if (error) throw error
      return data as { lines_match_total: boolean } | null
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['revisions', projectId] })
      await queryClient.invalidateQueries({ queryKey: ['amounts', projectId] })
      if (result && !result.lines_match_total) {
        setWarning('Saved. Note: the heading budgets do not add up to the total budget.')
        return
      }
      onDone()
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (totalPaisa === null || totalPaisa < 0) return setError('Enter a valid amount.')
    if (!reason.trim()) return setError('Give a reason for the change.')
    save.mutate()
  }

  if (warning) {
    return (
      <div className="mb-4 flex flex-col gap-2">
        <Notice>{warning}</Notice>
        <Button variant="secondary" onClick={onDone}>OK</Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mb-4 flex flex-col gap-3 rounded-lg bg-muted p-3">
      <div className="font-semibold text-ink">{kind === 'contract' ? 'New contract amount' : 'New spending budget'}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={kind === 'contract' ? 'Contract amount' : 'Total budget'} htmlFor="rev-amount">
          <MoneyInput id="rev-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Effective from" htmlFor="rev-date">
          <DateInput id="rev-date" value={date} onChange={setDate} display={auth.dateDisplay} />
        </Field>
      </div>
      <Field label="Reason" htmlFor="rev-reason" hint="e.g. Variation: extra floor approved by client">
        <Input id="rev-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {kind === 'budget' && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-brand" checked={split} onChange={(e) => setSplit(e.target.checked)} />
          Split by cost heading (optional)
        </label>
      )}
      {kind === 'budget' && split && (
        <div className="grid gap-2 sm:grid-cols-2">
          {topHeadings.map((h) => (
            <Field key={h.id} label={h.name} htmlFor={`line-${h.id}`}>
              <MoneyInput id={`line-${h.id}`} value={lines[h.id] ?? ''} onChange={(e) => setLines({ ...lines, [h.id]: e.target.value })} />
            </Field>
          ))}
          <div className={`text-sm sm:col-span-2 ${totalPaisa !== null && linesSum !== totalPaisa ? 'text-warn' : 'text-subtle'}`}>
            Headings total {formatNPR(linesSum)}
            {totalPaisa !== null && linesSum !== totalPaisa && ` — differs from the total budget by ${formatNPR(totalPaisa - linesSum)}`}
          </div>
        </div>
      )}
      <ErrorBanner>{error || (save.error && friendlyError(save.error))}</ErrorBanner>
      <div className="flex gap-2">
        <Button type="submit" busy={save.isPending}>{t('common.save')}</Button>
        <Button type="button" variant="secondary" onClick={onDone}>{t('common.cancel')}</Button>
      </div>
    </form>
  )
}
