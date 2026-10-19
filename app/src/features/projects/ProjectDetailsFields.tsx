// Project fields shared by "new project" and "edit project".
import { Controller, type UseFormReturn } from 'react-hook-form'
import { DateInput } from '../../components/DateInput'
import { useSimpleForms } from '../../auth/useSimpleForms'
import { More } from '../../components/More'
import { Field, Input, Select } from '../../components/ui'
import type { DateDisplay } from '../../lib/dates'
import { PICK_STATUSES, ROLE_LABELS, STATUS_LABELS } from '../../lib/labels'
import type { Member } from './api'
import type { DetailsValues } from './projectDetails'
import { t } from '../../lib/i18n'

export function ProjectDetailsFields<T extends DetailsValues>({
  form, members, display, showActualDates,
}: { form: UseFormReturn<T>; members: Member[]; display: DateDisplay; showActualDates?: boolean }) {
  // The generic form is narrowed to the shared fields here.
  const f = form as unknown as UseFormReturn<DetailsValues>
  const { register, control, formState: { errors } } = f
  const simple = useSimpleForms()
  const managers = members.filter((m) => m.active && (m.roles.includes('project_manager') || m.roles.includes('admin')))

  // Simple forms keep the status up with the main fields; Detailed keeps the original order.
  // Only Active, On hold and Completed are picked here. Books closed and Cancelled come from their
  // own actions on the project page, so they show as text. (An old draft's Planned is created Active.)
  const status = f.watch('status')
  const fixed = status === 'closed' || status === 'cancelled'
  const statusField = fixed ? (
    <Field label={t('projectDetailsFields.status')} hint={status === 'closed' ? t('projectDetailsFields.useReopenBooksOn') : t('projectDetailsFields.useRestoreProjectOn')}>
      <p className="py-2 text-sm font-medium text-ink">{STATUS_LABELS[status]}</p>
    </Field>
  ) : (
    <Field label={t('projectDetailsFields.status')} htmlFor="status">
      <Select id="status" {...register('status')}>
        {PICK_STATUSES.map((value) => (
          <option key={value} value={value}>{STATUS_LABELS[value]}</option>
        ))}
      </Select>
    </Field>
  )

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('projectDetailsFields.projectCode')} htmlFor="code" error={errors.code?.message} hint={t('projectDetailsFields.shortAndUniqueE')}>
        <Input id="code" {...register('code')} autoCapitalize="characters" />
      </Field>
      <Field label={t('projectDetailsFields.projectName')} htmlFor="name" error={errors.name?.message}>
        <Input id="name" {...register('name')} />
      </Field>
      <Field label={t('projectDetailsFields.clientName')} htmlFor="client_name">
        <Input id="client_name" {...register('client_name')} />
      </Field>
      {simple && statusField}
      {/* Simple forms fold the rest; the edit links (?edit=planned_end) open the fold first. */}
      <More className="sm:col-span-2" label={t('projectDetailsFields.clientPhoneLocationManager')}>
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
          <Field label={t('projectDetailsFields.clientPhone')} htmlFor="client_phone">
            <Input id="client_phone" {...register('client_phone')} inputMode="tel" />
          </Field>
          <Field label={t('projectDetailsFields.district')} htmlFor="district">
            <Input id="district" {...register('district')} />
          </Field>
          <Field label={t('projectDetailsFields.municipality')} htmlFor="municipality">
            <Input id="municipality" {...register('municipality')} />
          </Field>
          <Field label={t('projectDetailsFields.ward')} htmlFor="ward">
            <Input id="ward" {...register('ward')} inputMode="numeric" />
          </Field>
          <Field label={t('projectDetailsFields.locationDetails')} htmlFor="location_note">
            <Input id="location_note" {...register('location_note')} />
          </Field>
          <Field label={t('projectDetailsFields.projectManager')} htmlFor="manager_id">
            <Select id="manager_id" {...register('manager_id')}>
              <option value="">{t('projectDetailsFields.notSet')}</option>
              {managers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.profiles?.full_name} ({m.roles.map((r) => ROLE_LABELS[r]).join(', ')})
                </option>
              ))}
            </Select>
          </Field>
          {!simple && statusField}
          <Field label={t('projectDetailsFields.plannedStart')} htmlFor="planned_start">
            <Controller control={control} name="planned_start" render={({ field }) => (
              <DateInput id="planned_start" value={field.value} onChange={field.onChange} display={display} allowEmpty />
            )} />
          </Field>
          <Field label={t('projectDetailsFields.plannedCompletion')} htmlFor="planned_end">
            <Controller control={control} name="planned_end" render={({ field }) => (
              <DateInput id="planned_end" value={field.value} onChange={field.onChange} display={display} allowEmpty />
            )} />
          </Field>
          {showActualDates && (
            <>
              <Field label={t('projectDetailsFields.actualStart')} htmlFor="actual_start">
                <Controller control={control} name="actual_start" render={({ field }) => (
                  <DateInput id="actual_start" value={field.value} onChange={field.onChange} display={display} allowEmpty />
                )} />
              </Field>
              <Field label={t('projectDetailsFields.actualCompletion')} htmlFor="actual_end">
                <Controller control={control} name="actual_end" render={({ field }) => (
                  <DateInput id="actual_end" value={field.value} onChange={field.onChange} display={display} allowEmpty />
                )} />
              </Field>
            </>
          )}
        </div>
      </More>
    </div>
  )
}
