// Suppliers shared across projects (req §8.2) with what is owed to each (req §12.2).
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Input, PageHeader, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { formatNPR } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { useSupplierBalances, useSuppliers } from './api'
import { canManageSuppliers } from './permissions'

/** Positive = we owe (baki), negative = advance with the supplier (peski). */
export function BalanceText({ paisa }: { paisa: number }) {
  if (paisa === 0) return <span className="text-subtle">Settled</span>
  return (
    <span className="tabular-nums">
      <span className="font-semibold text-ink">{formatNPR(Math.abs(paisa))}</span>{' '}
      <span className={paisa > 0 ? 'text-warn-ink' : 'text-good-ink'}>{paisa > 0 ? 'to pay (baki)' : 'advance (peski)'}</span>
    </span>
  )
}

export function SuppliersPage() {
  const auth = useCompany()
  const suppliers = useSuppliers(auth.companyId)
  const balances = useSupplierBalances(auth.companyId, auth.canSeeFinance)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const balance = new Map(balances.data?.map((b) => [b.supplier_id, b]))
  const companyLevel = balances.data?.[0]?.company_level ?? false
  const q = search.trim().toLowerCase()
  const list = suppliers.data?.filter((s) => !q || s.name.toLowerCase().includes(q) || s.categories.join(' ').toLowerCase().includes(q))
  const total = balances.data?.reduce((sum, b) => sum + b.balance_paisa, 0) ?? 0

  return (
    <>
      <PageHeader
        title="Suppliers"
        subtitle={auth.canSeeFinance && balances.data ? <>Total: <BalanceText paisa={total} /></> : undefined}
        actions={canManageSuppliers(auth) && !adding && <Button onClick={() => setAdding(true)}>Add supplier</Button>}
      />
      {adding && <SupplierForm onDone={() => setAdding(false)} />}
      {auth.canSeeFinance && !companyLevel && balances.data && (
        <p className="mb-3 text-xs text-subtle">Balances include only the projects you are assigned to.</p>
      )}
      {(suppliers.data?.length ?? 0) > 8 && (
        <div className="mb-3">
          <Input aria-label="Search suppliers" placeholder="Search by name or material" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}
      {suppliers.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void suppliers.refetch()}>{suppliers.error && friendlyError(suppliers.error)}</ErrorBanner>
      {/* Missing balances must never look like "nothing owed". */}
      <ErrorBanner onRetry={() => void balances.refetch()}>
        {balances.error && `Balances could not be loaded, so amounts owed are not shown. ${friendlyError(balances.error)}`}
      </ErrorBanner>
      {q && list?.length === 0 && <p className="text-sm text-subtle">No suppliers match “{search.trim()}”.</p>}
      {suppliers.data?.length === 0 && (
        <EmptyState title="No suppliers yet">Add the shops and dealers you buy cement, rod, sand and other materials from.</EmptyState>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {list?.map((s) => {
          const b = balance.get(s.id)
          return (
            <li key={s.id}>
              <Link to={`/suppliers/${s.id}`} className="block rounded-xl border border-line bg-surface p-4 hover:border-brand">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 font-semibold break-words text-ink">{s.name}</div>
                  {!s.active && <Badge>Inactive</Badge>}
                </div>
                {s.categories.length > 0 && <div className="mt-1 text-sm text-subtle">{s.categories.join(' · ')}</div>}
                {b && auth.canSeeFinance && <div className="mt-2 text-sm"><BalanceText paisa={b.balance_paisa} /></div>}
                {!auth.canSeeFinance && s.phone && <div className="mt-2 text-sm text-subtle">{s.phone}</div>}
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}

type SupplierValues = {
  name: string; contact_person: string; phone: string; address: string; pan_vat: string; categories: string; payment_terms: string
}

export function SupplierForm({ supplier, onDone }: {
  supplier?: { id: string } & Partial<Record<keyof SupplierValues, unknown>> & { categories: string[] }
  onDone: () => void
}) {
  const auth = useCompany()
  const queryClient = useQueryClient()
  const [v, setV] = useState<SupplierValues>({
    name: String(supplier?.name ?? ''), contact_person: String(supplier?.contact_person ?? ''), phone: String(supplier?.phone ?? ''),
    address: String(supplier?.address ?? ''), pan_vat: String(supplier?.pan_vat ?? ''),
    categories: supplier?.categories.join(', ') ?? '', payment_terms: String(supplier?.payment_terms ?? ''),
  })
  const set = (k: keyof SupplierValues) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })

  const save = useMutation({
    mutationFn: async () => {
      const row = {
        name: v.name.trim(), contact_person: v.contact_person.trim() || null, phone: v.phone.trim() || null,
        address: v.address.trim() || null, pan_vat: v.pan_vat.trim() || null, payment_terms: v.payment_terms.trim() || null,
        categories: v.categories.split(',').map((c) => c.trim()).filter(Boolean),
      }
      const { error } = supplier
        ? await supabase.from('suppliers').update(row).eq('id', supplier.id)
        : await supabase.from('suppliers').insert({ ...row, company_id: auth.companyId })
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      await queryClient.invalidateQueries({ queryKey: ['balances'] })
      onDone()
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (v.name.trim()) save.mutate()
  }

  return (
    <Card title={supplier ? 'Edit supplier' : 'New supplier'} className="mb-4">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Business name" htmlFor="sup-name"><Input id="sup-name" value={v.name} onChange={set('name')} required /></Field>
          <Field label="Materials supplied" htmlFor="sup-cat" hint="Comma separated, e.g. Cement, Rod">
            <Input id="sup-cat" value={v.categories} onChange={set('categories')} />
          </Field>
          <Field label="Contact person" htmlFor="sup-contact"><Input id="sup-contact" value={v.contact_person} onChange={set('contact_person')} /></Field>
          <Field label="Phone" htmlFor="sup-phone"><Input id="sup-phone" inputMode="tel" value={v.phone} onChange={set('phone')} /></Field>
          <Field label="Address" htmlFor="sup-address"><Input id="sup-address" value={v.address} onChange={set('address')} /></Field>
          <Field label="PAN / VAT number" htmlFor="sup-pan"><Input id="sup-pan" inputMode="numeric" value={v.pan_vat} onChange={set('pan_vat')} /></Field>
          <Field label="Payment terms" htmlFor="sup-terms" hint="Optional, e.g. 30 days credit">
            <Input id="sup-terms" value={v.payment_terms} onChange={set('payment_terms')} />
          </Field>
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
