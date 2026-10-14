// Platform admin (superuser) screen: every company and how much it uses the app, and the
// allow list of logins that may register a new company. Lives outside the company frame,
// so a platform admin without a company can use it too.
import { Fragment, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { ChevronRightIcon } from '../../components/icons'
import { ShowMore } from '../../components/ShowMore'
import { Badge, Button, Card, ConfirmButton, EmptyState, ErrorBanner, Field, Input, PageHeader, Spinner, Status } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { t } from '../../lib/i18n'
import { ROLE_LABELS } from '../../lib/labels'
import { formatPhone, parseLoginId, PHONE_LOGIN_DOMAIN } from '../../lib/login-id'
import {
  useApprovalRequired, useApproveLogin, useCompanyUsage, useCompanyUsers, usePendingApprovals, useRemoveApproval, useUsedApprovals,
} from './api'

/** "9779841234567@phone…" as "+977 984-1234567"; an email as given. */
function showLogin(login: string | null): string {
  if (!login) return '—'
  return login.endsWith('@' + PHONE_LOGIN_DOMAIN) ? formatPhone('+' + login.split('@')[0]) : login
}

/** "today", "3 days ago", or "never". */
function ago(ts: string | null): string {
  if (!ts) return 'never'
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 60) return `${days} days ago`
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** /platform is a desktop page; in a narrow window the table scrolls sideways instead of squeezing. */
function Table({ head, children, minWidth = 'min-w-[40rem]' }: { head: ReactNode; children: ReactNode; minWidth?: string }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className={`w-full ${minWidth} text-sm`}>
        <thead className="border-b border-line text-left text-xs text-subtle">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  )
}

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return <th scope="col" className={`py-2 pr-3 font-medium whitespace-nowrap ${right ? 'text-right' : ''}`}>{children}</th>
}

const td = 'py-2 pr-3 align-top'
const num = `${td} text-right tabular-nums`

/** The search text, settled for 300 ms, so each keystroke is not a request. */
function useSettled(value: string): string {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value.trim()), 300)
    return () => clearTimeout(timer)
  }, [value])
  return settled
}

export function PlatformPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader
        title={t('platform.title')}
        subtitle={t('platform.subtitle')}
        actions={
          <>
            {auth.company && <Link to="/" className="flex min-h-11 items-center px-2 text-sm font-medium text-ink underline underline-offset-2">{t('platform.back')}</Link>}
            <Button variant="secondary" onClick={async () => { if (await auth.signOut()) navigate('/login') }}>{t('nav.signOut')}</Button>
          </>
        }
      />
      <div className="grid gap-6">
        <Companies />
        <AllowList />
      </div>
    </div>
  )
}

function Companies() {
  const [search, setSearch] = useState('')
  const settled = useSettled(search)
  const usage = useCompanyUsage(settled)
  const [open, setOpen] = useState<string | null>(null)

  return (
    <Card title={usage.total == null ? 'Companies' : `Companies (${usage.total})`}>
      <p className="mb-3 text-sm text-subtle">
        Most recently active first. “Changes” counts entries people saved (bills, payments, attendance, edits); opening a page is not counted.
      </p>
      <div className="mb-3 max-w-sm">
        <Field label="Search" htmlFor="company-search" hint="Company, owner, mobile number or email">
          <Input id="company-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
        </Field>
      </div>
      {usage.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void usage.refetch()}>{usage.error && friendlyError(usage.error)}</ErrorBanner>
      {usage.data?.length === 0 && <EmptyState title={settled ? 'No company matches' : 'No companies yet'} />}
      {!!usage.data?.length && (
        <Table head={<>
          <Th>Company</Th><Th>Last activity</Th><Th right>Changes, 7 days</Th><Th right>Changes, 30 days</Th>
          <Th right>Users</Th><Th right>Projects</Th><Th>Registered</Th>
        </>}>
          {usage.data.map((c) => (
            <Fragment key={c.company_id}>
              {/* The name's button covers the whole row, so any cell opens the user list. */}
              <tr className="relative hover:bg-muted/50">
                <td className={td}>
                  <button type="button" aria-expanded={open === c.company_id}
                    onClick={() => setOpen(open === c.company_id ? null : c.company_id)}
                    className="text-left font-medium text-ink underline underline-offset-2 after:absolute after:inset-0">
                    {c.name}
                  </button>
                  {c.changes_30d === 0 && <> <Badge tone="warn">Idle</Badge></>}
                  <div className="text-xs text-subtle">{c.owner_name || 'Owner'} · <span className="whitespace-nowrap">{showLogin(c.owner_login)}</span></div>
                </td>
                <td className={`${td} whitespace-nowrap`}>{ago(c.last_activity)}</td>
                <td className={num}>{c.changes_7d}</td>
                <td className={num}>{c.changes_30d}</td>
                <td className={num}>{c.active_users}</td>
                <td className={num}>{c.project_count}</td>
                <td className={`${td} whitespace-nowrap`}>{ago(c.created_at)}</td>
              </tr>
              {open === c.company_id && (
                <tr><td colSpan={7} className="bg-muted/50 px-3 pb-3"><CompanyUsers companyId={c.company_id} /></td></tr>
              )}
            </Fragment>
          ))}
        </Table>
      )}
      <ShowMore list={usage} total={usage.total} />
    </Card>
  )
}

function CompanyUsers({ companyId }: { companyId: string }) {
  const users = useCompanyUsers(companyId)
  if (users.isPending) return <Spinner />
  if (users.error) return <ErrorBanner onRetry={() => void users.refetch()}>{friendlyError(users.error)}</ErrorBanner>
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-subtle">
        <tr><Th>User</Th><Th>Role</Th><Th>Last change</Th><Th right>Changes, 30 days</Th><Th>Signed in</Th></tr>
      </thead>
      <tbody className="divide-y divide-line">
        {users.data.map((u) => (
          <tr key={u.user_id}>
            <td className={td}>
              <span className="font-medium text-ink">{u.full_name || showLogin(u.login)}</span>
              {!u.active && <> <Badge>Inactive</Badge></>}
              <div className="text-xs whitespace-nowrap text-subtle">{showLogin(u.login)}</div>
            </td>
            <td className={td}>{u.roles.map((r) => ROLE_LABELS[r]).join(', ')}</td>
            <td className={`${td} whitespace-nowrap`}>{ago(u.last_activity)}</td>
            <td className={num}>{u.changes_30d}</td>
            <td className={`${td} whitespace-nowrap`}>{ago(u.last_sign_in)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function AllowList() {
  const approval = useApprovalRequired()
  const pending = usePendingApprovals()
  const used = useUsedApprovals()
  const approve = useApproveLogin()
  const remove = useRemoveApproval()
  const [login, setLogin] = useState('')
  const [note, setNote] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [added, setAdded] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const id = parseLoginId(login)
    setInvalid(!id)
    setAdded('')
    if (!id) return
    approve.mutate({ login_email: id.email, note: note.trim() || null }, {
      onSuccess: () => {
        setAdded(`${showLogin(id.email)} can now register.`)
        setLogin('')
        setNote('')
      },
    })
  }

  return (
    <Card
      title="Who can register"
      actions={approval.data !== undefined && (
        <Badge tone={approval.data ? 'good' : 'warn'}>{approval.data ? 'Approval required' : 'Approval off (anyone can register)'}</Badge>
      )}>
      <p className="mb-3 text-sm text-subtle">
        {approval.data === false
          ? 'Approval is off here, so anyone can register. Where it is on (the live app), only an approved mobile number or email can register a new company.'
          : 'A new company can only be registered from an approved mobile number or email.'}
        {' '}Each approval works once. Staff that a company adds never need approval.
      </p>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" noValidate>
        <Field label={t('auth.loginId')} htmlFor="approve-login" error={invalid ? 'Enter a valid Nepali mobile number (98XXXXXXXX) or email' : undefined}>
          <Input id="approve-login" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" inputMode="email" />
        </Field>
        <Field label="Note (optional)" htmlFor="approve-note">
          <Input id="approve-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who is this?" />
        </Field>
        <Button type="submit" busy={approve.isPending}>Approve</Button>
      </form>
      <ErrorBanner>{approve.error && friendlyError(approve.error)}</ErrorBanner>
      <Status className="mt-2 text-sm text-good-ink">{added}</Status>

      <h3 className="mt-5 mb-1 text-sm font-semibold text-ink">Waiting to register{pending.data ? ` (${pending.data.length})` : ''}</h3>
      {pending.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void pending.refetch()}>{(pending.error || remove.error) && friendlyError(pending.error ?? remove.error)}</ErrorBanner>
      {pending.data?.length === 0 && <p className="text-sm text-subtle">Nobody is waiting.</p>}
      {!!pending.data?.length && (
        <Table minWidth="min-w-[32rem]" head={<><Th>Mobile number or email</Th><Th>Note</Th><Th>Approved</Th><Th><span className="sr-only">Actions</span></Th></>}>
          {pending.data.map((a) => (
            <tr key={a.id}>
              <td className={`${td} font-medium text-ink`}>{showLogin(a.login_email)}</td>
              <td className={td}>{a.note}</td>
              <td className={`${td} whitespace-nowrap`}>{ago(a.created_at)}</td>
              <td className="py-1 text-right">
                <ConfirmButton confirmLabel="Remove" label={`Remove ${showLogin(a.login_email)}`} onConfirm={() => remove.mutate(a.id)}>
                  Remove
                </ConfirmButton>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <details className="group mt-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
          <ChevronRightIcon size={16} className="shrink-0 text-subtle transition-transform group-open:rotate-90" />
          Already registered{used.total != null ? ` (${used.total})` : ''}
        </summary>
        {used.isPending && <Spinner />}
        <ErrorBanner onRetry={() => void used.refetch()}>{used.error && friendlyError(used.error)}</ErrorBanner>
        {!!used.data?.length && (
          <Table minWidth="min-w-[32rem]" head={<><Th>Mobile number or email</Th><Th>Company</Th><Th>Registered</Th><Th>Note</Th></>}>
            {used.data.map((a) => (
              <tr key={a.id}>
                <td className={`${td} font-medium text-ink`}>{showLogin(a.login_email)}</td>
                <td className={td}>{a.company_name}</td>
                <td className={`${td} whitespace-nowrap`}>{ago(a.used_at)}</td>
                <td className={`${td} text-subtle`}>{a.note}</td>
              </tr>
            ))}
          </Table>
        )}
        <ShowMore list={used} total={used.total} />
      </details>
    </Card>
  )
}
