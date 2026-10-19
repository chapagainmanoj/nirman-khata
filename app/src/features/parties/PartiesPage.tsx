// Subcontractors, labour crews, workers and other services (payees): lightweight parties shared
// across projects (req §4.3, §13-§15), with what is owed to each (req §12.2). When the company works
// by attendance, Labour crews has two lists: the crews (one per project) and the workers.
// Subcontractors open on the sidebar's project, like Bills: those with work there (their work
// packages are what ties them to a project), with "All projects" a tap away.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Input, PageHeader, Select, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { supabase } from '../../lib/supabase'
import { useProjects } from '../projects/api'
import { useProjectFilter } from '../projects/ProjectFilter'
import { useWorkPackages } from '../subcontract/api'
import { useCurrentProject } from '../projects/current'
import { canManageSuppliers } from '../../data/permissions'
import { useCrewBalances, usePartyBalances } from './api'
import { rateText, type RateKind } from '../labour/api'
import { WorkerForm } from '../labour/WorkerForm'
import { formatNPR } from '../../lib/money'
import { PARTY, partyCrumbs, type PartyKind, type PaysBy } from './kinds'
import { BalanceText } from './PartyParts'
import { t, type MessageKey } from '../../lib/i18n'
import { refresh } from '../../data/refresh'

type Row = {
  id: string; name: string; active: boolean; phone: string | null
  work_types?: string[]; project_id?: string | null; is_default?: boolean; kind?: string | null
  contact_person?: string | null; address?: string | null; pan_vat?: string | null; notes?: string | null
  promoted_supplier_id?: string | null
  is_cash?: boolean
  pays_by?: PaysBy
  work_type?: string | null; rate_kind?: RateKind; rate_paisa?: number
}

const EMPTY: Record<PartyKind, MessageKey | null> = {
  supplier: null,
  subcontractor: 'parties.empty.subcontractor',
  crew: 'parties.empty.crew',
  payee: 'parties.empty.payee',
  worker: 'parties.empty.worker',
}

export function usePartyRows(kind: PartyKind) {
  const auth = useCompany()
  return useQuery({
    queryKey: [PARTY[kind].table, auth.companyId, 'full'],
    queryFn: async () => {
      const { data, error } = await supabase.from(PARTY[kind].table).select('*').eq('company_id', auth.companyId).order('name')
      if (error) throw error
      return data as Row[]
    },
  })
}

export function subtitleOf(kind: PartyKind, r: Row, projectCode: (id: string | null | undefined) => string | undefined) {
  if (kind === 'subcontractor') return r.work_types?.join(' · ')
  if (kind === 'crew') return r.project_id ? projectCode(r.project_id) : t('parties.anyProject')
  if (kind === 'payee') return r.kind ?? undefined
  if (kind === 'worker') return [r.work_type, r.rate_paisa != null && rateText({ rate_kind: r.rate_kind ?? 'daily', rate_paisa: r.rate_paisa }, formatNPR)].filter(Boolean).join(' · ')
  return undefined
}

export function PartiesPage({ kind }: { kind: PartyKind }) {
  const auth = useCompany()
  const rows = usePartyRows(kind)
  const projects = useProjects(auth.companyId)
  // With attendance a crew's labour is owed to its workers: the crew list shows what they are owed.
  const crewView = kind === 'crew' && auth.company.labour_mode === 'attendance'
  const partyBalances = usePartyBalances(auth.companyId, kind, auth.canSeeFinance && !crewView)
  const crewBalances = useCrewBalances(auth.companyId, auth.canSeeFinance && crewView)
  const balances = crewView ? crewBalances : partyBalances
  const workerCount = new Map(crewBalances.data?.map((b) => [b.crew_id, b.workers]))
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const balance = new Map<string, { balance_paisa: number }>(crewView ? crewBalances.data?.map((b) => [b.crew_id, b]) : partyBalances.data?.map((b) => [b.party_id, b]))
  const companyLevel = crewView || (partyBalances.data?.[0]?.company_level ?? false)
  const code = (id: string | null | undefined) => projects.data?.find((p) => p.id === id)?.code
  const byProject = useProjectFilter()
  const onProject = kind === 'subcontractor' ? byProject.projectId : null
  const work = useWorkPackages({ projectId: onProject ?? undefined }, !!onProject)
  // Added just now: no work yet, but they stay in sight on the project's list.
  const [added, setAdded] = useState<string[]>([])
  const workingHere = onProject ? new Set([...(work.data?.map((w) => w.subcontractor_id) ?? []), ...added]) : null
  const q = search.trim().toLowerCase()
  const list = rows.data?.filter((r) => (!workingHere || workingHere.has(r.id))
    && (!q || r.name.toLowerCase().includes(q) || (subtitleOf(kind, r, code) ?? '').toLowerCase().includes(q)))
  const total = balances.data?.reduce((sum, b) => sum + b.balance_paisa, 0) ?? 0
  const canAdd = canManageSuppliers(auth)

  return (
    <>
      <PageHeader
        title={PARTY[kind].many}
        crumbs={kind === 'payee' ? partyCrumbs(kind).slice(0, 1) : undefined}
        subtitle={auth.canSeeFinance && balances.data ? <>{t('parties.total')}{' '}<BalanceText paisa={total} /></> : undefined}
        actions={canAdd && !adding && <Button variant="tonal" onClick={() => setAdding(true)}>{t('parties.addValue', { value: PARTY[kind].one.toLowerCase() })}</Button>}
      />
      {(kind === 'crew' || kind === 'worker') && auth.company.labour_mode === 'attendance' && <LabourLists current={kind} />}
      {kind === 'subcontractor' && byProject.chip}
      {adding && (kind === 'worker'
        ? <Card title={t('parties.newWorker')} className="mb-4"><WorkerForm onDone={() => setAdding(false)} /></Card>
        : <PartyForm kind={kind} onDone={(id) => { setAdding(false); if (id) setAdded((a) => [...a, id]) }} />)}
      {auth.canSeeFinance && !companyLevel && balances.data && (
        <p className="mb-3 text-xs text-subtle">{t('parties.balancesIncludeOnlyThe')}</p>
      )}
      {((rows.data?.length ?? 0) > 8 || (kind === 'payee' && (rows.data?.length ?? 0) > 1)) && (
        <div className="mb-3">
          <Input aria-label={t('parties.searchValue', { value: PARTY[kind].many.toLowerCase() })} placeholder={t('parties.searchByName')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}
      {rows.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void rows.refetch()}>{rows.error && friendlyError(rows.error)}</ErrorBanner>
      {/* Missing balances must never look like "nothing owed". */}
      <ErrorBanner onRetry={() => void balances.refetch()}>
        {balances.error && t('parties.balancesCouldNotBe', { error: friendlyError(balances.error) })}
      </ErrorBanner>
      {onProject && !q && work.data && rows.data && rows.data.length > 0 && list?.length === 0 && byProject.empty(PARTY[kind].many.toLowerCase(), null)}
      {q && list?.length === 0 && <p className="text-sm text-subtle">{t('parties.nothingMatchesValue', { value: search.trim() })}</p>}
      {rows.data?.length === 0 && <EmptyState title={t('parties.noValueYet', { value: PARTY[kind].many.toLowerCase() })}>{EMPTY[kind] && t(EMPTY[kind])}</EmptyState>}
      {kind === 'payee' && list && list.length > 0 ? (
        <PayeeTable rows={list} balance={(id) => balance.get(id)?.balance_paisa} showBalance={auth.canSeeFinance && !!balances.data} />
      ) : kind === 'worker' && list && list.length > 0 ? (
        <WorkerTable rows={list} balance={(id) => balance.get(id)?.balance_paisa} showBalance={auth.canSeeFinance && !!balances.data} />
      ) : (
      <ul className="grid gap-3 sm:grid-cols-2">
        {list?.map((r) => {
          const b = balance.get(r.id)
          const sub = subtitleOf(kind, r, code)
          return (
            <li key={r.id}>
              <Link to={`${PARTY[kind].path}/${r.id}`} className="block rounded-xl border border-line bg-surface p-4 hover:border-slate">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 font-semibold break-words text-ink">{r.name}</div>
                  {!r.active && <Badge>{r.promoted_supplier_id ? t('parties.nowASupplier') : t('parties.inactive')}</Badge>}
                </div>
                {sub && <div className="mt-1 text-sm text-subtle">{crewView && workerCount.has(r.id) ? `${sub} · ${workerCount.get(r.id)} ${workerCount.get(r.id) === 1 ? 'worker' : 'workers'}` : sub}</div>}
                {b && auth.canSeeFinance && <div className="mt-2 text-sm"><BalanceText paisa={b.balance_paisa} /></div>}
                {!auth.canSeeFinance && r.phone && <div className="mt-2 text-sm text-subtle">{r.phone}</div>}
              </Link>
            </li>
          )
        })}
      </ul>
      )}
    </>
  )
}

/**
 * Workers as a table (attendance): name, work, rate, phone and what each is owed, everywhere. On a
 * phone the work moves under the name and the phone column is dropped.
 */
function WorkerTable({ rows, balance, showBalance }: {
  rows: Row[]; balance: (id: string) => number | undefined; showBalance: boolean
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-subtle">
            <th scope="col" className="px-4 py-2 font-medium">{t('parties.name')}</th>
            <th scope="col" className="hidden py-2 pr-3 font-medium sm:table-cell">{t('parties.work')}</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">{t('parties.rate')}</th>
            <th scope="col" className="hidden py-2 pr-3 font-medium md:table-cell">{t('parties.phone')}</th>
            {showBalance && <th scope="col" className="py-2 pr-4 text-right font-medium">{t('parties.toPay')}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const owed = balance(r.id) ?? 0
            return (
              <tr key={r.id} className="border-b border-line align-middle last:border-0 hover:bg-muted">
                <td className="px-4 py-2">
                  <Link to={`${PARTY.worker.path}/${r.id}`} className="inline-flex min-h-11 min-w-11 [@media(pointer:fine)]:min-h-8 items-center font-medium break-words text-ink hover:underline">{r.name}</Link>
                  {!r.active && <span className="ml-2"><Badge>{t('parties.left')}</Badge></span>}
                  {r.work_type && <div className="text-xs text-subtle sm:hidden">{r.work_type}</div>}
                </td>
                <td className="hidden py-2 pr-3 text-subtle sm:table-cell">{r.work_type}</td>
                <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">
                  {r.rate_paisa != null && rateText({ rate_kind: r.rate_kind ?? 'daily', rate_paisa: r.rate_paisa }, formatNPR)}
                </td>
                <td className="hidden py-2 pr-3 whitespace-nowrap text-subtle md:table-cell">{r.phone}</td>
                {showBalance && (
                  <td className="py-2 pr-4 text-right whitespace-nowrap tabular-nums">
                    {owed === 0 ? <span className="text-subtle">—</span>
                      : <span className={owed > 0 ? 'font-semibold text-ink' : 'text-good-ink'}>{formatNPR(Math.abs(owed))}{owed < 0 && ' held'}</span>}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Labour crews and workers: two lists of one section, a link each so Back works. */
function LabourLists({ current }: { current: 'crew' | 'worker' }) {
  return (
    <nav aria-label={t('parties.labour')} className="mb-4 flex w-fit gap-1 rounded-lg bg-track p-1">
      {(['crew', 'worker'] as const).map((k) => (
        <Link key={k} to={PARTY[k].path} aria-current={current === k ? 'page' : undefined}
          className={`inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium ${current === k ? 'bg-surface text-ink shadow-sm' : 'text-subtle'}`}>
          {k === 'crew' ? t('parties.crews') : t('parties.workers')}
        </Link>
      ))}
    </nav>
  )
}

/**
 * Other services (payees) as a table: a company can collect many of them through other
 * expenses. Those still owed come first, largest first; the Cash payee last. On a phone the type
 * of service moves under the name and the phone column is dropped.
 */
function PayeeTable({ rows, balance, showBalance }: { rows: Row[]; balance: (id: string) => number | undefined; showBalance: boolean }) {
  const owed = (r: Row) => (showBalance ? balance(r.id) ?? 0 : 0)
  const sorted = [...rows].sort((a, b) =>
    Number(!!a.is_cash) - Number(!!b.is_cash) || Number(owed(b) > 0) - Number(owed(a) > 0) || owed(b) - owed(a) || a.name.localeCompare(b.name))
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-subtle">
            <th scope="col" className="px-4 py-2 font-medium">{t('parties.name')}</th>
            <th scope="col" className="hidden py-2 pr-3 font-medium sm:table-cell">{t('parties.typeOfService')}</th>
            <th scope="col" className="hidden py-2 pr-3 font-medium md:table-cell">{t('parties.phone')}</th>
            {showBalance && <th scope="col" className="py-2 pr-4 text-right font-medium">{t('parties.balance')}</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-b border-line align-middle last:border-0 hover:bg-muted">
              <td className="px-4 py-2">
                <Link to={`${PARTY.payee.path}/${r.id}`} className="inline-flex min-h-11 min-w-11 [@media(pointer:fine)]:min-h-8 items-center font-medium break-words text-ink hover:underline">{r.name}</Link>
                {!r.active && <span className="ml-2"><Badge>{r.promoted_supplier_id ? t('parties.nowASupplier') : t('parties.inactive')}</Badge></span>}
                {r.kind && <div className="text-xs text-subtle sm:hidden">{r.kind}</div>}
              </td>
              <td className="hidden py-2 pr-3 text-subtle sm:table-cell">{r.kind}</td>
              <td className="hidden py-2 pr-3 whitespace-nowrap text-subtle md:table-cell">{r.phone}</td>
              {showBalance && (
                <td className="py-2 pr-4 text-right">
                  {owed(r) === 0 ? <span className="text-subtle">—</span> : <BalanceText paisa={owed(r)} />}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** onDone gets the new party's id when one was added. */
export function PartyForm({ kind, party, onDone }: { kind: PartyKind; party?: Row; onDone: (addedId?: string) => void }) {
  const auth = useCompany()
  const [newPartyId] = useState(newId)
  const queryClient = useQueryClient()
  const projects = useProjects(auth.companyId)
  const current = useCurrentProject()
  // By attendance, a crew is a project's: its page is where that project's days are marked. A crew
  // from before, without a project, keeps working (GLOSSARY: Crew).
  const needsProject = kind === 'crew' && auth.company.labour_mode === 'attendance' && !(party && !party.project_id)
  const [v, setV] = useState({
    name: party?.name ?? '', phone: party?.phone ?? '', contact_person: party?.contact_person ?? '',
    address: party?.address ?? '', pan_vat: party?.pan_vat ?? '', notes: party?.notes ?? '',
    work_types: party?.work_types?.join(', ') ?? '', project_id: party?.project_id ?? (needsProject ? current.project?.id ?? '' : ''), kind: party?.kind ?? '',
    active: party?.active ?? true, pays_by: party?.pays_by ?? 'direct' as PaysBy,
  })
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  const orNull = (x: string) => x.trim() || null

  const save = useMutation({
    mutationFn: async () => {
      const common = { name: v.name.trim(), phone: orNull(v.phone), active: v.active }
      const row =
        kind === 'subcontractor' ? {
          ...common, contact_person: orNull(v.contact_person), address: orNull(v.address), pan_vat: orNull(v.pan_vat), notes: orNull(v.notes),
          work_types: v.work_types.split(',').map((c) => c.trim()).filter(Boolean), pays_by: v.pays_by,
        }
        : kind === 'crew' ? { ...common, notes: orNull(v.notes), ...(party?.is_default ? {} : { project_id: v.project_id || null }) }
        : { ...common, kind: orNull(v.kind), notes: orNull(v.notes) }
      const table = PARTY[kind].table as 'subcontractors' | 'crews' | 'payees'
      const { error } = party
        ? await supabase.from(table).update(row as never).eq('id', party.id)
        : await supabase.from(table).insert({ ...row, id: newPartyId, company_id: auth.companyId } as never)
      if (error) throw error
    },
    onSuccess: async () => {
      await refresh(queryClient, 'parties')
      onDone(party ? undefined : newPartyId)
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (v.name.trim() && (!needsProject || v.project_id)) save.mutate()
  }

  const one = PARTY[kind].one
  // Editing has its own page, whose heading names it.
  return (
    <Card title={party ? undefined : t('parties.newValue', { value: one.toLowerCase() })} className="mb-4">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('parties.name')} htmlFor="pt-name" hint={kind === 'crew' ? t('parties.eg.crewName') : undefined}>
            <Input id="pt-name" value={v.name} onChange={set('name')} required />
          </Field>
          {kind === 'subcontractor' && (
            <Field label={t('parties.workTypes')} htmlFor="pt-types" hint={t('parties.commaSeparatedEG')}>
              <Input id="pt-types" value={v.work_types} onChange={set('work_types')} />
            </Field>
          )}
          {kind === 'crew' && !party?.is_default && (
            <Field label={t('parties.project')} htmlFor="pt-project" hint={needsProject ? t('parties.itsWorkersDaysAre') : undefined}>
              <Select id="pt-project" value={v.project_id} onChange={set('project_id')} required={needsProject}>
                {needsProject ? <option value="" disabled>{t('parties.chooseAProject')}</option> : <option value="">{t('parties.anyProject')}</option>}
                {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </Select>
            </Field>
          )}
          {kind === 'payee' && (
            <Field label={t('parties.type')} htmlFor="pt-kind" hint={t('parties.eg.jcbOwnerTransporter')}><Input id="pt-kind" value={v.kind} onChange={set('kind')} /></Field>
          )}
          {kind === 'subcontractor' && (
            <Field label={t('parties.contactPerson')} htmlFor="pt-contact"><Input id="pt-contact" value={v.contact_person} onChange={set('contact_person')} /></Field>
          )}
          <Field label={t('parties.phone')} htmlFor="pt-phone"><Input id="pt-phone" inputMode="tel" value={v.phone} onChange={set('phone')} /></Field>
          {kind === 'subcontractor' && (
            <>
              <Field label={t('parties.address')} htmlFor="pt-address"><Input id="pt-address" value={v.address} onChange={set('address')} /></Field>
              <Field label={t('parties.panNumber')} htmlFor="pt-pan" hint={t('common.optional')}><Input id="pt-pan" inputMode="numeric" value={v.pan_vat} onChange={set('pan_vat')} /></Field>
            </>
          )}
          <Field label={t('parties.notes')} htmlFor="pt-notes"><Input id="pt-notes" value={v.notes} onChange={set('notes')} /></Field>
          {kind === 'subcontractor' && (
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-sm font-medium text-ink">{t('parties.howDoYouPay')}</legend>
              {(['direct', 'bills'] as const).map((mode) => (
                <label key={mode} className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm">
                  <input type="radio" name="pays_by" className="mt-0.5 size-5 shrink-0 accent-brand" checked={v.pays_by === mode}
                    onChange={() => setV({ ...v, pays_by: mode })} />
                  <span>
                    <span className="block font-medium text-ink">{t(mode === 'direct' ? 'parties.paysBy.direct' : 'parties.paysBy.bills')}</span>
                    <span className="block text-xs text-subtle">{t(mode === 'direct' ? 'parties.paysBy.directHint' : 'parties.paysBy.billsHint')}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {party && (
            <Field label={t('parties.status')} htmlFor="pt-active">
              <Select id="pt-active" value={v.active ? 'yes' : 'no'} onChange={(e) => setV({ ...v, active: e.target.value === 'yes' })}>
                <option value="yes">{t('parties.active')}</option>
                <option value="no">{t('parties.inactiveKeptInHistory')}</option>
              </Select>
            </Field>
          )}
        </div>
        <ErrorBanner>{save.error && friendlyError(save.error)}</ErrorBanner>
        <div className="flex gap-2">
          <Button type="submit" busy={save.isPending} disabled={!v.name.trim()}>{t('common.save')}</Button>
          <Button type="button" variant="secondary" onClick={() => onDone()}>{t('common.cancel')}</Button>
        </div>
      </form>
    </Card>
  )
}
