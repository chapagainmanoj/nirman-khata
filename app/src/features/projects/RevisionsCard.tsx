// Contract and budget revision history, plus admin forms to add a revision (req §6).
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useCompany } from '../../auth/AuthProvider'
import { DateInput, DateText } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { Badge, Button, Card, Checkbox, ErrorBanner, Field, Input, Notice, Spinner } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { t } from '../../lib/i18n'
import { formatNPR, parseNPR } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { memberName, useHeadings, useRevisions, type Member } from './api'
import { refresh } from '../../data/refresh'

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

/** `scrollTo`: opened from "See changes", so scroll here once the history has loaded (and the page is tall enough). */
export function RevisionsCard({ projectId, members, scrollTo }: { projectId: string; members: Member[]; scrollTo?: boolean }) {
  const auth = useCompany()
  const revisions = useRevisions(projectId, true)
  const box = useRef<HTMLDivElement>(null)
  const loaded = !revisions.isPending
  useEffect(() => {
    if (scrollTo && loaded) box.current?.scrollIntoView({ block: 'start' })
  }, [scrollTo, loaded])
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

  const headingName = (id: string) => headings.data?.find((h) => h.id === id)?.name ?? t('revisionsCard.heading')

  return (
    <div ref={box} className="scroll-mt-4">
      <Card
        title={t('project.revisions')}
        className="lg:col-span-2"
        actions={auth.isAdmin && !form && (
          <div className="flex gap-1">
            <Button variant="ghost" onClick={() => setForm('contract')}>{t('revisionsCard.reviseContract')}</Button>
            <Button variant="ghost" onClick={() => setForm('budget')}>{t('revisionsCard.reviseBudget')}</Button>
          </div>
        )}
      >
        {form && <RevisionForm kind={form} projectId={projectId} onDone={() => setForm(null)} />}
        {revisions.isPending && <Spinner />}
        <ErrorBanner onRetry={() => void revisions.refetch()}>{revisions.error && friendlyError(revisions.error)}</ErrorBanner>
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="border-b border-line py-3 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{r.kind === 'Contract' ? t('revisionsCard.contract') : t('revisionsCard.budget')}</Badge>
                  <span className="font-semibold text-ink tabular-nums">{formatNPR(r.amount)}</span>
                </div>
                <span className="text-sm text-subtle">{t('revisionsCard.from')}{' '}<DateText value={r.effective_date} display={auth.dateDisplay} dual /></span>
              </div>
              <div className="mt-1 break-words text-sm text-ink">{r.reason}</div>
              {r.lines && r.lines.length > 0 && (
                <ul className="mt-1 text-xs text-subtle">
                  {r.lines.map((l) => <li key={l.heading_id}>{headingName(l.heading_id)}: {formatNPR(l.amount_paisa)}</li>)}
                </ul>
              )}
              <div className="mt-1 text-xs text-subtle">{t('revisionsCard.byMembers', { name: memberName(members, r.created_by) })}</div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
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
      // Contract and budget feed both dashboards too (to collect, budget used, over budget).
      await refresh(queryClient, 'budget')
      if (result && !result.lines_match_total) {
        setWarning(t('revisionsCard.savedNoteTheHeading'))
        return
      }
      onDone()
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (totalPaisa === null || totalPaisa < 0) return setError(t('revisionsCard.enterAValidAmount'))
    if (!reason.trim()) return setError(t('revisionsCard.giveAReasonFor'))
    save.mutate()
  }

  if (warning) {
    return (
      <div className="mb-4 flex flex-col gap-2">
        <Notice>{warning}</Notice>
        <Button variant="secondary" onClick={onDone}>{t('revisionsCard.ok')}</Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mb-4 flex flex-col gap-3 rounded-lg bg-muted p-3">
      <div className="font-semibold text-ink">{kind === 'contract' ? t('revisionsCard.newContractAmount') : t('revisionsCard.newSpendingBudget')}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={kind === 'contract' ? t('revisionsCard.contractAmount') : t('revisionsCard.totalBudget')} htmlFor="rev-amount">
          <MoneyInput id="rev-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t('revisionsCard.effectiveFrom')} htmlFor="rev-date">
          <DateInput id="rev-date" value={date} onChange={setDate} display={auth.dateDisplay} allowFuture />
        </Field>
      </div>
      <Field label={t('revisionsCard.reason')} htmlFor="rev-reason" hint={t('revisionsCard.eg.variationExtraFloor')}>
        <Input id="rev-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {kind === 'budget' && (
        <Checkbox label={t('revisionsCard.splitByCostHeading')} checked={split} onChange={(e) => setSplit(e.target.checked)} />
      )}
      {kind === 'budget' && split && (
        <div className="grid gap-2 sm:grid-cols-2">
          {topHeadings.map((h) => (
            <Field key={h.id} label={h.name} htmlFor={`line-${h.id}`}>
              <MoneyInput id={`line-${h.id}`} value={lines[h.id] ?? ''} onChange={(e) => setLines({ ...lines, [h.id]: e.target.value })} />
            </Field>
          ))}
          <div className={`text-sm sm:col-span-2 ${totalPaisa !== null && linesSum !== totalPaisa ? 'font-medium text-warn-ink' : 'text-subtle'}`}>
            {t('revisionsCard.headingsTotalLinessum', { linesSum: formatNPR(linesSum) })}{totalPaisa !== null && linesSum !== totalPaisa && t('revisionsCard.differsBy', { amount: formatNPR(totalPaisa - linesSum) })}
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
