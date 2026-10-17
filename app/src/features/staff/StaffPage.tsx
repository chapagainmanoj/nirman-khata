import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useCompany } from '../../auth/AuthProvider'
import { Badge, Button, Card, Checkbox, ConfirmButton, ErrorBanner, Field, Input, Notice, PageHeader, Spinner, Status } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { callFunction } from '../../lib/functions'
import { t } from '../../lib/i18n'
import { ROLE_LABELS } from '../../lib/labels'
import { parseLoginId } from '../../lib/login-id'
import { supabase, type AppRole } from '../../lib/supabase'
import { useMembers, useProjects, type Member } from '../projects/api'

const ALL_ROLES: AppRole[] = ['admin', 'project_manager', 'site_staff', 'accounts', 'viewer']
const MIN_PASSWORD = 8

type Permissions = { can_view_finance: boolean; can_record_payments: boolean; can_approve_slips: boolean }

export function StaffPage() {
  const auth = useCompany()
  const members = useMembers(auth.companyId)
  const [adding, setAdding] = useState(false)

  return (
    <>
      <PageHeader title={t('staff.title')} actions={!adding && <Button variant="tonal" onClick={() => setAdding(true)}>{t('staff.add')}</Button>} />
      {adding && <AddStaffForm onDone={() => setAdding(false)} />}
      {members.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void members.refetch()}>{members.error && friendlyError(members.error)}</ErrorBanner>
      <div className="grid gap-3">
        {members.data?.map((m) => <MemberCard key={m.id} member={m} isSelf={m.user_id === auth.userId} />)}
      </div>
    </>
  )
}

function RolePicker({ roles, onChange }: { roles: AppRole[]; onChange: (roles: AppRole[]) => void }) {
  return (
    <div className="grid gap-1 sm:grid-cols-2">
      {ALL_ROLES.map((r) => (
        <Checkbox
          key={r}
          label={ROLE_LABELS[r]}
          checked={roles.includes(r)}
          onChange={(e) => onChange(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))}
        />
      ))}
    </div>
  )
}

function PermissionPicker({ value, onChange, roles }: { value: Permissions; onChange: (p: Permissions) => void; roles: AppRole[] }) {
  const allMoney = roles.includes('admin') || roles.includes('accounts')
  return (
    <div className="grid gap-1">
      <Checkbox
        label="Can see money amounts"
        hint={allMoney ? 'Admin and Accounts always see amounts.' : 'Contract, budget, bills and payments on their assigned projects.'}
        checked={allMoney || value.can_view_finance}
        disabled={allMoney}
        onChange={(e) => onChange({ ...value, can_view_finance: e.target.checked })}
      />
      <Checkbox
        label="Can record payments"
        checked={value.can_record_payments}
        onChange={(e) => onChange({ ...value, can_record_payments: e.target.checked })}
      />
      <Checkbox
        label="Can approve order slips"
        hint="Project managers need this to approve order slips for their projects."
        checked={value.can_approve_slips}
        onChange={(e) => onChange({ ...value, can_approve_slips: e.target.checked })}
      />
    </div>
  )
}

function AddStaffForm({ onDone }: { onDone: () => void }) {
  const auth = useCompany()
  const queryClient = useQueryClient()
  const projects = useProjects(auth.companyId)
  const [name, setName] = useState('')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [roles, setRoles] = useState<AppRole[]>(['site_staff'])
  const [perms, setPerms] = useState<Permissions>({ can_view_finance: false, can_record_payments: false, can_approve_slips: false })
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [error, setError] = useState('')

  const create = useMutation({
    mutationFn: () =>
      callFunction<{ user_id: string; warning?: string }>('admin-users', {
        action: 'create_staff', company_id: auth.companyId, full_name: name, login, password, roles, ...perms, project_ids: projectIds,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['members'] })
      onDone()
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError('Enter the staff member’s name.')
    if (!parseLoginId(login)) return setError('Enter a mobile number (98XXXXXXXX) or email.')
    if (password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters.`)
    if (roles.length === 0) return setError('Choose at least one role.')
    create.mutate()
  }

  const seesAll = roles.includes('admin') || roles.includes('accounts')

  return (
    <Card title={t('staff.add')} className="mb-4">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="staff-name"><Input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label={t('auth.loginId')} htmlFor="staff-login" hint="They sign in with this.">
            <Input id="staff-login" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="98XXXXXXXX" />
          </Field>
          <Field label="Starting password" htmlFor="staff-password" hint="Tell them this password. You can reset it later.">
            <Input id="staff-password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        <Field label="Roles"><RolePicker roles={roles} onChange={setRoles} /></Field>
        <Field label="Permissions"><PermissionPicker value={perms} onChange={setPerms} roles={roles} /></Field>
        {!seesAll && (
          <Field label="Projects" hint="They only see the projects they are assigned to.">
            <div className="grid gap-1 sm:grid-cols-2">
              {projects.data?.map((p) => (
                <Checkbox
                  key={p.id}
                  label={`${p.code} · ${p.name}`}
                  checked={projectIds.includes(p.id)}
                  onChange={(e) => setProjectIds(e.target.checked ? [...projectIds, p.id] : projectIds.filter((x) => x !== p.id))}
                />
              ))}
            </div>
          </Field>
        )}
        <ErrorBanner>{error || (create.error && friendlyError(create.error))}</ErrorBanner>
        <div className="flex gap-2">
          <Button type="submit" busy={create.isPending}>{t('staff.add')}</Button>
          <Button type="button" variant="secondary" onClick={onDone}>{t('common.cancel')}</Button>
        </div>
      </form>
    </Card>
  )
}

function MemberCard({ member: m, isSelf }: { member: Member; isSelf: boolean }) {
  const auth = useCompany()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'view' | 'edit' | 'password'>('view')
  const [roles, setRoles] = useState<AppRole[]>(m.roles)
  const [perms, setPerms] = useState<Permissions>({
    can_view_finance: m.can_view_finance, can_record_payments: m.can_record_payments, can_approve_slips: m.can_approve_slips,
  })
  const [password, setPassword] = useState('')
  const [done, setDone] = useState('')

  const update = useMutation({
    mutationFn: async (patch: Partial<Permissions & { roles: AppRole[]; active: boolean }>) => {
      const { error } = await supabase.from('memberships').update(patch).eq('id', m.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['members'] })
      setMode('view')
    },
  })

  const reset = useMutation({
    mutationFn: () => callFunction('admin-users', { action: 'reset_password', company_id: auth.companyId, user_id: m.user_id, password }),
    onSuccess: () => {
      setPassword('')
      setMode('view')
      setDone('Password reset. Tell them the new password.')
    },
  })

  const contact = m.profiles?.phone ?? m.profiles?.email ?? ''
  const name = m.profiles?.full_name ?? 'Staff member'
  const error = update.error || reset.error

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 break-words">
          <div className="font-semibold text-ink">{name} {isSelf && <span className="text-xs text-subtle">(you)</span>}</div>
          <div className="text-sm text-subtle">{contact}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {m.roles.map((r) => <Badge key={r} tone="info">{ROLE_LABELS[r]}</Badge>)}
            {!m.active && <Badge tone="bad">Inactive</Badge>}
            {m.can_view_finance && <Badge>Sees amounts</Badge>}
            {m.can_record_payments && <Badge>Records payments</Badge>}
            {m.can_approve_slips && <Badge>Approves order slips</Badge>}
          </div>
        </div>
        {mode === 'view' && (
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" aria-label={`Edit ${name}`} onClick={() => setMode('edit')}>{t('common.edit')}</Button>
            <Button variant="ghost" aria-label={`Reset password for ${name}`} onClick={() => { setDone(''); setMode('password') }}>Reset password</Button>
            {!isSelf && m.active && (
              // Deactivating blocks their sign-in straight away, so it asks first.
              <ConfirmButton label={`Deactivate ${name}`} confirmLabel="Yes, deactivate" disabled={update.isPending}
                onConfirm={() => update.mutate({ active: false })}>
                Deactivate
              </ConfirmButton>
            )}
            {!isSelf && !m.active && (
              <Button variant="ghost" aria-label={`Reactivate ${name}`} onClick={() => update.mutate({ active: true })} disabled={update.isPending}>
                Reactivate
              </Button>
            )}
          </div>
        )}
      </div>

      <Status className="mt-3">{done && <Notice>{done}</Notice>}</Status>

      {mode === 'edit' && (
        <div className="mt-4 flex flex-col gap-4">
          <Field label="Roles"><RolePicker roles={roles} onChange={setRoles} /></Field>
          <Field label="Permissions"><PermissionPicker value={perms} onChange={setPerms} roles={roles} /></Field>
          <div className="flex gap-2">
            <Button busy={update.isPending} disabled={roles.length === 0} onClick={() => update.mutate({ roles, ...perms })}>{t('common.save')}</Button>
            <Button variant="secondary" onClick={() => setMode('view')}>{t('common.cancel')}</Button>
          </div>
        </div>
      )}

      {mode === 'password' && (
        <div className="mt-4 flex flex-col gap-3">
          <Field label="New password" htmlFor={`pw-${m.id}`} hint={`At least ${MIN_PASSWORD} characters.`}>
            <Input id={`pw-${m.id}`} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <div className="flex gap-2">
            <Button busy={reset.isPending} disabled={password.length < MIN_PASSWORD} onClick={() => reset.mutate()}>Reset password</Button>
            <Button variant="secondary" onClick={() => setMode('view')}>{t('common.cancel')}</Button>
          </div>
        </div>
      )}

      <div className="mt-2"><ErrorBanner>{error && friendlyError(error)}</ErrorBanner></div>
    </Card>
  )
}
