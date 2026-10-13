// Project fields shared by "new project" and "edit project".
import { Controller, type UseFormReturn } from 'react-hook-form'
import { DateInput } from '../../components/DateInput'
import { More } from '../../components/More'
import { Field, Input, Select } from '../../components/ui'
import type { DateDisplay } from '../../lib/dates'
import { ROLE_LABELS, STATUS_LABELS } from '../../lib/labels'
import type { Member } from './api'
import type { DetailsValues } from './projectDetails'

export function ProjectDetailsFields<T extends DetailsValues>({
  form, members, display, showActualDates,
}: { form: UseFormReturn<T>; members: Member[]; display: DateDisplay; showActualDates?: boolean }) {
  // The generic form is narrowed to the shared fields here.
  const f = form as unknown as UseFormReturn<DetailsValues>
  const { register, control, formState: { errors } } = f
  const managers = members.filter((m) => m.active && (m.roles.includes('project_manager') || m.roles.includes('admin')))

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Project code" htmlFor="code" error={errors.code?.message} hint="Short and unique, e.g. P-01">
        <Input id="code" {...register('code')} autoCapitalize="characters" />
      </Field>
      <Field label="Project name" htmlFor="name" error={errors.name?.message}>
        <Input id="name" {...register('name')} />
      </Field>
      <Field label="Client name" htmlFor="client_name">
        <Input id="client_name" {...register('client_name')} />
      </Field>
      <Field label="Status" htmlFor="status">
        <Select id="status" {...register('status')}>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </Field>
      {/* Simple forms fold the rest; the edit links (?edit=planned_end) open the fold first. */}
      <More className="sm:col-span-2" label="Client phone, location, manager, dates">
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
            <Field label="Client phone" htmlFor="client_phone">
              <Input id="client_phone" {...register('client_phone')} inputMode="tel" />
            </Field>
            <Field label="District" htmlFor="district">
              <Input id="district" {...register('district')} />
            </Field>
            <Field label="Municipality" htmlFor="municipality">
              <Input id="municipality" {...register('municipality')} />
            </Field>
            <Field label="Ward" htmlFor="ward">
              <Input id="ward" {...register('ward')} inputMode="numeric" />
            </Field>
            <Field label="Location details" htmlFor="location_note">
              <Input id="location_note" {...register('location_note')} />
            </Field>
            <Field label="Project manager" htmlFor="manager_id">
              <Select id="manager_id" {...register('manager_id')}>
                <option value="">Not set</option>
                {managers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.profiles?.full_name} ({m.roles.map((r) => ROLE_LABELS[r]).join(', ')})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Planned start" htmlFor="planned_start">
              <Controller control={control} name="planned_start" render={({ field }) => (
                <DateInput id="planned_start" value={field.value} onChange={field.onChange} display={display} allowEmpty />
              )} />
            </Field>
            <Field label="Planned completion" htmlFor="planned_end">
              <Controller control={control} name="planned_end" render={({ field }) => (
                <DateInput id="planned_end" value={field.value} onChange={field.onChange} display={display} allowEmpty />
              )} />
            </Field>
            {showActualDates && (
              <>
                <Field label="Actual start" htmlFor="actual_start">
                  <Controller control={control} name="actual_start" render={({ field }) => (
                    <DateInput id="actual_start" value={field.value} onChange={field.onChange} display={display} allowEmpty />
                  )} />
                </Field>
                <Field label="Actual completion" htmlFor="actual_end">
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
