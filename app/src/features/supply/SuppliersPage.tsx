// Suppliers shared across projects (req §8.2) with what is owed to each (req §12.2). The list opens
// on the sidebar's project, like Bills: suppliers with a slip, delivery or bill there, with "All
// projects" a tap away. "?add=1" (Getting started) opens the form to add one.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Input, PageHeader, Spinner } from '../../components/ui'
import { ChevronRightIcon } from '../../components/icons'
import { friendlyError } from '../../lib/errors'
import { t } from '../../lib/i18n'
import { newId } from '../../lib/ids'
import { usePartyBalances } from '../parties/api'
import { BalanceText } from '../parties/PartyParts'
import { useProjectFilter } from '../projects/ProjectFilter'
import { saveSupplier, useSupplierProjects, useSuppliers } from './api'
import { canManageSuppliers } from '../../data/permissions'
import { refresh } from '../../data/refresh'

export function SuppliersPage() {
  const auth = useCompany()
  const suppliers = useSuppliers(auth.companyId)
  const balances = usePartyBalances(auth.companyId, 'supplier', auth.canSeeFinance)
  const [params] = useSearchParams()
  const [adding, setAdding] = useState(params.get('add') === '1' && canManageSuppliers(auth))
  const [search, setSearch] = useState('')
  const byProject = useProjectFilter()
  const onProject = useSupplierProjects(byProject.projectId)
  const here = byProject.projectId ? onProject.data : null
  // Added just now: nothing recorded with them yet, but they stay in sight on the project's list.
  const [added, setAdded] = useState<string[]>([])
  const balance = new Map(balances.data?.map((b) => [b.party_id, b]))
  const companyLevel = balances.data?.[0]?.company_level ?? false
  const q = search.trim().toLowerCase()
  const list = suppliers.data?.filter((s) => (!byProject.projectId || !!here?.has(s.id) || added.includes(s.id))
    && (!q || s.name.toLowerCase().includes(q) || s.categories.join(' ').toLowerCase().includes(q)))
  const total = balances.data?.reduce((sum, b) => sum + b.balance_paisa, 0) ?? 0

  return (
    <>
      <PageHeader
        title={t('suppliers.suppliers')}
        subtitle={auth.canSeeFinance && balances.data ? <>{t('suppliers.total')}{' '}<BalanceText paisa={total} /></> : undefined}
        actions={canManageSuppliers(auth) && !adding && <Button variant="tonal" onClick={() => setAdding(true)}>{t('suppliers.addSupplier')}</Button>}
      />
      {adding && <SupplierForm onDone={(id) => { setAdding(false); if (id) setAdded((a) => [...a, id]) }} />}
      {byProject.chip}
      {auth.canSeeFinance && !companyLevel && balances.data && (
        <p className="mb-3 text-xs text-subtle">{t('suppliers.balancesIncludeOnlyThe')}</p>
      )}
      {(suppliers.data?.length ?? 0) > 8 && (
        <div className="mb-3">
          <Input aria-label={t('suppliers.searchSuppliers')} placeholder={t('suppliers.searchByNameOr')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}
      {suppliers.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void suppliers.refetch()}>{suppliers.error && friendlyError(suppliers.error)}</ErrorBanner>
      {/* Missing balances must never look like "nothing owed". */}
      <ErrorBanner onRetry={() => void balances.refetch()}>
        {balances.error && t('suppliers.balancesCouldNotBe', { error: friendlyError(balances.error) })}
      </ErrorBanner>
      <ErrorBanner onRetry={() => void onProject.refetch()}>{onProject.error && friendlyError(onProject.error)}</ErrorBanner>
      {here && !q && (suppliers.data?.length ?? 0) > 0 && list?.length === 0 && byProject.empty(t('suppliers.suppliers').toLowerCase(), null)}
      {q && list?.length === 0 && <p className="text-sm text-subtle">{t('suppliers.noSuppliersMatchValue', { value: search.trim() })}</p>}
      {suppliers.data?.length === 0 && (
        <EmptyState title={t('suppliers.noSuppliersYet')}>{t('suppliers.addTheShopsAnd')}</EmptyState>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {list?.map((s) => {
          const b = balance.get(s.id)
          return (
            <li key={s.id}>
              <Link to={`/suppliers/${s.id}`} className="block rounded-xl border border-line bg-surface p-4 hover:border-slate">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 font-semibold break-words text-ink">{s.name}</div>
                  {!s.active && <Badge>{t('suppliers.inactive')}</Badge>}
                </div>
                {s.categories.length > 0 && <div className="mt-1 text-sm text-subtle">{s.categories.join(' · ')}</div>}
                {b && auth.canSeeFinance && <div className="mt-2 text-sm"><BalanceText paisa={b.balance_paisa} /></div>}
                {!auth.canSeeFinance && s.phone && <div className="mt-2 text-sm text-subtle">{s.phone}</div>}
              </Link>
            </li>
          )
        })}
      </ul>
      {/* Other services (payees) live here rather than in the nav: JCB owners, tankers and
          others paid through other expenses, without order slips (GLOSSARY: Payee). */}
      <Link to="/payees" className="mt-4 flex min-h-14 items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-2 hover:border-slate">
        <span className="min-w-0">
          <span className="block font-medium text-ink">{t('nav.payees')}</span>
          <span className="block text-xs text-subtle">{t('suppliers.payees.hint')}</span>
        </span>
        <ChevronRightIcon className="shrink-0 text-subtle" />
      </Link>
    </>
  )
}

type SupplierValues = {
  name: string; contact_person: string; phone: string; address: string; pan_vat: string; categories: string; payment_terms: string
}

export function SupplierForm({ supplier, onDone }: {
  supplier?: { id: string } & Partial<Record<keyof SupplierValues, unknown>> & { categories: string[] }
  /** Called with the new supplier's id when one was added. */
  onDone: (addedId?: string) => void
}) {
  const auth = useCompany()
  const queryClient = useQueryClient()
  const [newSupplierId] = useState(newId)
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
      await saveSupplier(auth.companyId, supplier?.id ?? newSupplierId, row, !!supplier)
    },
    onSuccess: async () => {
      await refresh(queryClient, 'parties')
      onDone(supplier ? undefined : newSupplierId)
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (v.name.trim()) save.mutate()
  }

  // Editing has its own page, whose heading names it.
  return (
    <Card className="mb-4">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('suppliers.businessName')} htmlFor="sup-name"><Input id="sup-name" value={v.name} onChange={set('name')} required /></Field>
          <Field label={t('suppliers.materialsSupplied')} htmlFor="sup-cat" hint={t('suppliers.commaSeparatedEG')}>
            <Input id="sup-cat" value={v.categories} onChange={set('categories')} />
          </Field>
          <Field label={t('suppliers.contactPerson')} htmlFor="sup-contact"><Input id="sup-contact" value={v.contact_person} onChange={set('contact_person')} /></Field>
          <Field label={t('suppliers.phone')} htmlFor="sup-phone"><Input id="sup-phone" inputMode="tel" value={v.phone} onChange={set('phone')} /></Field>
          <Field label={t('suppliers.address')} htmlFor="sup-address"><Input id="sup-address" value={v.address} onChange={set('address')} /></Field>
          <Field label={t('suppliers.panVatNumber')} htmlFor="sup-pan"><Input id="sup-pan" inputMode="numeric" value={v.pan_vat} onChange={set('pan_vat')} /></Field>
          <Field label={t('suppliers.paymentTerms')} htmlFor="sup-terms" hint={t('suppliers.optionalEG30')}>
            <Input id="sup-terms" value={v.payment_terms} onChange={set('payment_terms')} />
          </Field>
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
