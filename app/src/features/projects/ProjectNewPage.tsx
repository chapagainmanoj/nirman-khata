import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { useCompany } from '../../auth/AuthProvider'
import { DateInput } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { Button, Card, ErrorBanner, Field, Notice, PageHeader } from '../../components/ui'
import { formatDual, todayKathmandu } from '../../lib/dates'
import { useFormDraft } from '../../lib/drafts'
import { friendlyError } from '../../lib/errors'
import { t } from '../../lib/i18n'
import { formatNPR, parseNPR } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { useMembers } from './api'
import { ProjectDetailsFields } from './ProjectDetailsFields'
import { detailsSchema, detailsToRow, emptyDetails } from './projectDetails'

const amount = z.string().refine((s) => parseNPR(s) !== null && parseNPR(s)! >= 0, 'Enter a valid amount')

const schema = detailsSchema.extend({
  contract: amount,
  budget: amount,
  budget_edited: z.boolean(),
  effective_date: z.string().min(1, 'Date is required'),
})
type Values = z.infer<typeof schema>

export function ProjectNewPage() {
  const auth = useCompany()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const members = useMembers(auth.companyId)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { ...emptyDetails, contract: '', budget: '', budget_edited: false, effective_date: todayKathmandu() },
  })
  const draft = useFormDraft(form, { userId: auth.userId, companyId: auth.companyId, formKey: 'project-new' })
  const { register, control, watch, setValue, handleSubmit, formState: { errors } } = form

  // Budget starts equal to the contract amount until the user changes it (req v1.1 §6).
  const contract = watch('contract')
  const budget = watch('budget')
  const budgetEdited = watch('budget_edited')
  useEffect(() => {
    if (!budgetEdited) setValue('budget', contract)
  }, [contract, budgetEdited, setValue])

  const contractPaisa = parseNPR(contract)
  const budgetPaisa = parseNPR(budget)

  const create = useMutation({
    mutationFn: async (v: Values) => {
      const row = detailsToRow(v)
      const { code, name, ...details } = row
      const { data, error } = await supabase.rpc('create_project', {
        p_company: auth.companyId,
        p_code: code,
        p_name: name,
        p_contract_paisa: parseNPR(v.contract)!,
        p_budget_paisa: parseNPR(v.budget)!,
        p_effective_date: v.effective_date,
        p_details: details,
      })
      if (error) throw error
      return data
    },
    onSuccess: async (projectId) => {
      await draft.clear()
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      navigate(`/projects/${projectId}`, { replace: true })
    },
  })

  return (
    <>
      <PageHeader title={t('projects.new')} />
      {draft.restoredAt && <div className="mb-4"><Notice>Restored your unsaved draft.</Notice></div>}
      <form onSubmit={handleSubmit((v) => create.mutate(v))} className="flex flex-col gap-4">
        <Card title={t('project.details')}>
          <ProjectDetailsFields form={form} members={members.data ?? []} display={auth.dateDisplay} />
        </Card>

        <Card title={t('project.amounts')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contract amount (Thekka Rakam)" htmlFor="contract" error={errors.contract?.message}
              hint="What the client pays for the job">
              <MoneyInput id="contract" {...register('contract')} value={contract} />
            </Field>
            <Field label="Spending budget (Lagat Anuman)" htmlFor="budget" error={errors.budget?.message}
              hint={budgetEdited ? 'What you plan to spend' : 'Same as the contract amount. Change it if you plan to spend less.'}>
              <MoneyInput id="budget" {...register('budget', { onChange: () => setValue('budget_edited', true) })} value={budget} />
            </Field>
            <Field label="Effective from" htmlFor="effective_date" error={errors.effective_date?.message}>
              <Controller control={control} name="effective_date" render={({ field }) => (
                <DateInput id="effective_date" value={field.value} onChange={field.onChange} display={auth.dateDisplay} />
              )} />
            </Field>
            <div className="rounded-lg bg-muted p-3 text-sm">
              <div className="text-subtle">Planned margin (contract − budget)</div>
              <div className="text-lg font-semibold text-ink">
                {contractPaisa !== null && budgetPaisa !== null ? formatNPR(contractPaisa - budgetPaisa) : '—'}
              </div>
              <div className="text-xs text-subtle">
                Recorded cost is compared with the budget. Profit is shown only when the project is completed or closed.
              </div>
            </div>
          </div>
          {watch('effective_date') && (
            <div className="mt-2 text-xs text-subtle">Recorded as of {formatDual(watch('effective_date'), auth.dateDisplay)}</div>
          )}
        </Card>

        <ErrorBanner>{create.error && friendlyError(create.error)}</ErrorBanner>
        <div className="flex gap-2">
          <Button type="submit" busy={create.isPending}>Create project</Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/projects')}>{t('common.cancel')}</Button>
        </div>
      </form>
    </>
  )
}
