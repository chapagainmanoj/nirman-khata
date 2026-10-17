// Subcontractors, labour crews and other services (payees): lightweight parties shared across projects
// (req §4.3, §13-§15), with what is owed to each (req §12.2).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Input, PageHeader, Select, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { useProjects } from '../projects/api'
import { canManageSuppliers } from '../supply/permissions'
import { usePartyBalances } from './api'
import { PARTY, partyCrumbs, type PartyKind } from './kinds'
import { BalanceText } from './PartyParts'

type Row = {
  id: string; name: string; active: boolean; phone: string | null
  work_types?: string[]; project_id?: string | null; is_default?: boolean; kind?: string | null
  contact_person?: string | null; address?: string | null; pan_vat?: string | null; notes?: string | null
  promoted_supplier_id?: string | null
  is_cash?: boolean
}

const EMPTY: Record<PartyKind, string> = {
  supplier: '',
  subcontractor: 'Add the petty contractors who do plaster, masonry, electrical, plumbing and other work.',
  crew: 'Every project has a "Site crew". Add more crews if you pay groups separately, e.g. "Ram\'s crew".',
  payee: 'They are added when an other expense is entered: JCB owners, tankers, transporters.',
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
  if (kind === 'crew') return r.project_id ? projectCode(r.project_id) : 'Any project'
  if (kind === 'payee') return r.kind ?? undefined
  return undefined
}

export function PartiesPage({ kind }: { kind: PartyKind }) {
  const auth = useCompany()
  const rows = usePartyRows(kind)
  const projects = useProjects(auth.companyId)
  const balances = usePartyBalances(auth.companyId, kind, auth.canSeeFinance)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const balance = new Map(balances.data?.map((b) => [b.party_id, b]))
  const companyLevel = balances.data?.[0]?.company_level ?? false
  const code = (id: string | null | undefined) => projects.data?.find((p) => p.id === id)?.code
  const q = search.trim().toLowerCase()
  const list = rows.data?.filter((r) => !q || r.name.toLowerCase().includes(q) || (subtitleOf(kind, r, code) ?? '').toLowerCase().includes(q))
  const total = balances.data?.reduce((sum, b) => sum + b.balance_paisa, 0) ?? 0
  const canAdd = canManageSuppliers(auth)

  return (
    <>
      <PageHeader
        title={PARTY[kind].many}
        crumbs={kind === 'payee' ? partyCrumbs(kind).slice(0, 1) : undefined}
        subtitle={auth.canSeeFinance && balances.data ? <>Total: <BalanceText paisa={total} /></> : undefined}
        actions={canAdd && !adding && <Button variant="tonal" onClick={() => setAdding(true)}>Add {PARTY[kind].one.toLowerCase()}</Button>}
      />
      {adding && <PartyForm kind={kind} onDone={() => setAdding(false)} />}
      {auth.canSeeFinance && !companyLevel && balances.data && (
        <p className="mb-3 text-xs text-subtle">Balances include only the projects you are assigned to.</p>
      )}
      {((rows.data?.length ?? 0) > 8 || (kind === 'payee' && (rows.data?.length ?? 0) > 1)) && (
        <div className="mb-3">
          <Input aria-label={`Search ${PARTY[kind].many.toLowerCase()}`} placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}
      {rows.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void rows.refetch()}>{rows.error && friendlyError(rows.error)}</ErrorBanner>
      {/* Missing balances must never look like "nothing owed". */}
      <ErrorBanner onRetry={() => void balances.refetch()}>
        {balances.error && `Balances could not be loaded, so amounts owed are not shown. ${friendlyError(balances.error)}`}
      </ErrorBanner>
      {q && list?.length === 0 && <p className="text-sm text-subtle">Nothing matches “{search.trim()}”.</p>}
      {rows.data?.length === 0 && <EmptyState title={`No ${PARTY[kind].many.toLowerCase()} yet`}>{EMPTY[kind]}</EmptyState>}
      {kind === 'payee' && list && list.length > 0 ? (
        <PayeeTable rows={list} balance={(id) => balance.get(id)?.balance_paisa} showBalance={auth.canSeeFinance && !!balances.data} />
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
                  {!r.active && <Badge>{r.promoted_supplier_id ? 'Now a supplier' : 'Inactive'}</Badge>}
                </div>
                {sub && <div className="mt-1 text-sm text-subtle">{sub}</div>}
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
            <th scope="col" className="px-4 py-2 font-medium">Name</th>
            <th scope="col" className="hidden py-2 pr-3 font-medium sm:table-cell">Type of service</th>
            <th scope="col" className="hidden py-2 pr-3 font-medium md:table-cell">Phone</th>
            {showBalance && <th scope="col" className="py-2 pr-4 text-right font-medium">Balance</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-b border-line align-middle last:border-0 hover:bg-muted">
              <td className="px-4 py-2">
                <Link to={`${PARTY.payee.path}/${r.id}`} className="inline-flex min-h-8 items-center font-medium break-words text-ink hover:underline">{r.name}</Link>
                {!r.active && <span className="ml-2"><Badge>{r.promoted_supplier_id ? 'Now a supplier' : 'Inactive'}</Badge></span>}
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

export function PartyForm({ kind, party, onDone }: { kind: PartyKind; party?: Row; onDone: () => void }) {
  const auth = useCompany()
  const queryClient = useQueryClient()
  const projects = useProjects(auth.companyId)
  const [v, setV] = useState({
    name: party?.name ?? '', phone: party?.phone ?? '', contact_person: party?.contact_person ?? '',
    address: party?.address ?? '', pan_vat: party?.pan_vat ?? '', notes: party?.notes ?? '',
    work_types: party?.work_types?.join(', ') ?? '', project_id: party?.project_id ?? '', kind: party?.kind ?? '',
    active: party?.active ?? true,
  })
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  const t = (x: string) => x.trim() || null

  const save = useMutation({
    mutationFn: async () => {
      const common = { name: v.name.trim(), phone: t(v.phone), active: v.active }
      const row =
        kind === 'subcontractor' ? {
          ...common, contact_person: t(v.contact_person), address: t(v.address), pan_vat: t(v.pan_vat), notes: t(v.notes),
          work_types: v.work_types.split(',').map((c) => c.trim()).filter(Boolean),
        }
        : kind === 'crew' ? { ...common, notes: t(v.notes), ...(party?.is_default ? {} : { project_id: v.project_id || null }) }
        : { ...common, kind: t(v.kind), notes: t(v.notes) }
      const table = PARTY[kind].table as 'subcontractors' | 'crews' | 'payees'
      const { error } = party
        ? await supabase.from(table).update(row as never).eq('id', party.id)
        : await supabase.from(table).insert({ ...row, company_id: auth.companyId } as never)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [PARTY[kind].table] })
      await queryClient.invalidateQueries({ queryKey: ['balances'] })
      onDone()
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (v.name.trim()) save.mutate()
  }

  const one = PARTY[kind].one
  return (
    <Card title={party ? `Edit ${one.toLowerCase()}` : `New ${one.toLowerCase()}`} className="mb-4">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="pt-name" hint={kind === 'crew' ? 'e.g. Ram\'s crew, Local jyami' : undefined}>
            <Input id="pt-name" value={v.name} onChange={set('name')} required />
          </Field>
          {kind === 'subcontractor' && (
            <Field label="Work types" htmlFor="pt-types" hint="Comma separated, e.g. Plaster, Tiling">
              <Input id="pt-types" value={v.work_types} onChange={set('work_types')} />
            </Field>
          )}
          {kind === 'crew' && !party?.is_default && (
            <Field label="Project" htmlFor="pt-project">
              <Select id="pt-project" value={v.project_id} onChange={set('project_id')}>
                <option value="">Any project</option>
                {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </Select>
            </Field>
          )}
          {kind === 'payee' && (
            <Field label="Type" htmlFor="pt-kind" hint="e.g. JCB owner, transporter, shop"><Input id="pt-kind" value={v.kind} onChange={set('kind')} /></Field>
          )}
          {kind === 'subcontractor' && (
            <Field label="Contact person" htmlFor="pt-contact"><Input id="pt-contact" value={v.contact_person} onChange={set('contact_person')} /></Field>
          )}
          <Field label="Phone" htmlFor="pt-phone"><Input id="pt-phone" inputMode="tel" value={v.phone} onChange={set('phone')} /></Field>
          {kind === 'subcontractor' && (
            <>
              <Field label="Address" htmlFor="pt-address"><Input id="pt-address" value={v.address} onChange={set('address')} /></Field>
              <Field label="PAN number" htmlFor="pt-pan" hint="Optional"><Input id="pt-pan" inputMode="numeric" value={v.pan_vat} onChange={set('pan_vat')} /></Field>
            </>
          )}
          <Field label="Notes" htmlFor="pt-notes"><Input id="pt-notes" value={v.notes} onChange={set('notes')} /></Field>
          {party && (
            <Field label="Status" htmlFor="pt-active">
              <Select id="pt-active" value={v.active ? 'yes' : 'no'} onChange={(e) => setV({ ...v, active: e.target.value === 'yes' })}>
                <option value="yes">Active</option>
                <option value="no">Inactive (kept in history)</option>
              </Select>
            </Field>
          )}
        </div>
        <ErrorBanner>{save.error && friendlyError(save.error)}</ErrorBanner>
        <div className="flex gap-2">
          <Button type="submit" busy={save.isPending} disabled={!v.name.trim()}>Save</Button>
          <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        </div>
      </form>
    </Card>
  )
}
