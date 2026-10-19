// Cost headings, materials and units (req §7, §8.1, §3.2). Admins edit; everyone reads.
// Nothing is deleted: used entries stay visible in history, so they are deactivated instead.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useCompany } from '../../auth/AuthProvider'
import { Badge, Button, Card, Checkbox, ErrorBanner, Field, Input, PageHeader, Select, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { t, type MessageKey } from '../../lib/i18n'
import { supabase, type Tables } from '../../lib/supabase'
import { useHeadings } from '../projects/api'
import { useMaterials, useUnits } from './api'
import { ChevronRightIcon } from '../../components/icons'
import { refresh } from '../../data/refresh'

type Tab = 'headings' | 'materials' | 'units'

const TABS: Array<[Tab, MessageKey]> = [['headings', 'catalog.tab.headings'], ['materials', 'catalog.tab.materials'], ['units', 'catalog.tab.units']]

export function CatalogPage() {
  const [tab, setTab] = useState<Tab>('headings')
  const ids = useId()
  const tabId = (key: Tab) => `${ids}-tab-${key}`

  // Arrow keys move between tabs (WAI-ARIA tabs pattern); Tab moves into the panel.
  function onKeyDown(e: KeyboardEvent) {
    const i = TABS.findIndex(([key]) => key === tab)
    const step: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }
    if (!(e.key in step)) return
    e.preventDefault()
    const [next] = TABS[(step[e.key] + TABS.length) % TABS.length]
    setTab(next)
    document.getElementById(tabId(next))?.focus()
  }

  return (
    <>
      <PageHeader title={t('catalog.title')} />
      <div className="mb-4 flex gap-1 rounded-lg bg-track p-1" role="tablist" aria-label={t('catalog.catalogSections')} onKeyDown={onKeyDown}>
        {TABS.map(([key, label]) => (
          <button key={key} id={tabId(key)} type="button" role="tab" aria-selected={tab === key} aria-controls={`${ids}-panel`}
            tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)}
            className={`min-h-11 flex-1 rounded-md px-1 text-sm font-medium ${tab === key ? 'bg-surface text-ink shadow-sm' : 'text-subtle'}`}>
            {t(label)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${ids}-panel`} aria-labelledby={tabId(tab)}>
        {tab === 'headings' && <HeadingsTab />}
        {tab === 'materials' && <MaterialsTab />}
        {tab === 'units' && <UnitsTab />}
      </div>
    </>
  )
}

/** Insert/update on a catalog table, then refresh its list. */
function useCatalogWrite(table: 'cost_headings' | 'materials' | 'units') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (op: { id?: string; values: Record<string, unknown> }) => {
      const q = op.id
        ? supabase.from(table).update(op.values as never).eq('id', op.id)
        : supabase.from(table).insert(op.values as never)
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => refresh(queryClient, 'catalog'),
  })
}

// Each top heading is a group ("Materials (7)") that folds; tap a name to rename or deactivate it.
// Adding sits at the end of each group, where the new heading will appear.
function HeadingsTab() {
  const auth = useCompany()
  const headings = useHeadings(auth.companyId)
  const write = useCatalogWrite('cost_headings')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [adding, setAdding] = useState<{ parentId: string | null; name: string } | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const ids = useId()
  const toggle = (id: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const top = headings.data?.filter((h) => !h.parent_id) ?? []
  const children = (id: string) => headings.data?.filter((h) => h.parent_id === id) ?? []

  function add(e: FormEvent) {
    e.preventDefault()
    if (!adding) return
    const parent = headings.data?.find((h) => h.id === adding.parentId)
    write.mutate(
      { values: { company_id: auth.companyId, name: adding.name.trim(), parent_id: adding.parentId, kind: parent?.kind ?? 'other', sort_order: 100 } },
      { onSuccess: () => setAdding(null) },
    )
  }

  const addForm = (parentId: string | null, label: string) => adding?.parentId === parentId ? (
    <form onSubmit={add} className="flex flex-wrap items-end gap-2 py-2">
      <Field label={label} htmlFor={`h-add-${parentId ?? 'top'}`}>
        <Input id={`h-add-${parentId ?? 'top'}`} value={adding.name} onChange={(e) => setAdding({ parentId, name: e.target.value })} autoFocus />
      </Field>
      <Button type="submit" disabled={!adding.name.trim()} busy={write.isPending}>{t('common.add')}</Button>
      <Button type="button" variant="secondary" onClick={() => setAdding(null)}>{t('common.cancel')}</Button>
    </form>
  ) : null

  const row = (h: Tables<'cost_headings'>) => (
    <li key={h.id} className="border-b border-line last:border-0">
      {editing?.id === h.id ? (
        <form className="flex flex-wrap items-center gap-2 py-2"
          onSubmit={(e) => { e.preventDefault(); write.mutate({ id: h.id, values: { name: editing.name.trim() } }, { onSuccess: () => setEditing(null) }) }}>
          <Input aria-label={t('catalog.newNameForName', { name: h.name })} value={editing.name} onChange={(e) => setEditing({ id: h.id, name: e.target.value })} autoFocus className="min-w-0 basis-full sm:basis-48 sm:flex-1" />
          <Button type="submit" disabled={!editing.name.trim()} busy={write.isPending}>{t('common.save')}</Button>
          <Button type="button" variant="secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
          <Button type="button" variant="ghost" disabled={write.isPending}
            onClick={() => write.mutate({ id: h.id, values: { active: !h.active } }, { onSuccess: () => setEditing(null) })}>
            {h.active ? t('catalog.deactivate') : t('catalog.activate')}
          </Button>
        </form>
      ) : auth.isAdmin ? (
        <button type="button" onClick={() => setEditing({ id: h.id, name: h.name })} aria-label={t('catalog.editName', { name: h.name })}
          className="flex min-h-11 w-full items-center justify-between gap-2 py-2 text-left text-sm text-ink hover:bg-muted">
          <span className={`min-w-0 break-words ${h.active ? '' : 'text-subtle line-through'}`}>{h.name}</span>
          {!h.active && <Badge>{t('catalog.inactive')}</Badge>}
        </button>
      ) : (
        <div className={`py-2 text-sm ${h.active ? 'text-ink' : 'text-subtle line-through'}`}>{h.name}</div>
      )}
    </li>
  )

  return (
    <div className="grid gap-4">
      <ErrorBanner>{write.error && friendlyError(write.error)}</ErrorBanner>
      {headings.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void headings.refetch()}>{headings.error && friendlyError(headings.error)}</ErrorBanner>
      {headings.data?.length === 0 && <p className="text-sm text-subtle">{t('catalog.noCostHeadingsYet')}</p>}
      {top.map((h) => {
        const kids = children(h.id)
        return (
          // A real toggle button with Edit beside it, not inside: a <summary> holding a button
          // is a nested control that screen readers skip or misread (WCAG 4.1.2).
          <section key={h.id} className="rounded-xl border border-line bg-surface px-4">
            <div className="flex items-center gap-2">
              <button type="button" aria-expanded={!collapsed.has(h.id)} aria-controls={`${ids}-${h.id}`} onClick={() => toggle(h.id)}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-2 py-2 text-left">
                <ChevronRightIcon size={16} className={`shrink-0 text-subtle transition-transform ${collapsed.has(h.id) ? '' : 'rotate-90'}`} />
                <span className={`min-w-0 font-semibold break-words ${h.active ? 'text-ink' : 'text-subtle line-through'}`}>{h.name}</span>
                <span className="shrink-0 text-sm text-subtle">({kids.length})</span>
              </button>
              {auth.isAdmin && editing?.id !== h.id && (
                <Button variant="ghost" className="shrink-0" aria-label={t('catalog.editName', { name: h.name })}
                  onClick={() => setEditing({ id: h.id, name: h.name })}>{t('common.edit')}</Button>
              )}
            </div>
            <div id={`${ids}-${h.id}`} hidden={collapsed.has(h.id)}>
              {editing?.id === h.id && <ul>{row(h)}</ul>}
              <ul className="border-t border-line">{kids.map(row)}</ul>
              {auth.isAdmin && (addForm(h.id, t('catalog.newHeadingUnderName', { name: h.name })) ?? (
                <Button variant="ghost" className="my-1" onClick={() => setAdding({ parentId: h.id, name: '' })}>{t('catalog.addUnderName', { name: h.name })}</Button>
              ))}
            </div>
          </section>
        )
      })}
      {auth.isAdmin && (addForm(null, t('catalog.newTopLevelHeading')) ?? (
        <div><Button variant="secondary" onClick={() => setAdding({ parentId: null, name: '' })}>{t('catalog.addHeadingGroup')}</Button></div>
      ))}
    </div>
  )
}

function MaterialsTab() {
  const auth = useCompany()
  const materials = useMaterials(auth.companyId)
  const units = useUnits(auth.companyId)
  const headings = useHeadings(auth.companyId)
  const write = useCatalogWrite('materials')
  const empty = { name: '', local_name: '', spec: '', default_unit_id: '', default_heading_id: '' }
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const editing = materials.data?.find((m) => m.id === editId)
  const close = () => { setForm(empty); setEditId(null); setFormOpen(false) }

  const unitName = (id: string) => units.data?.find((u) => u.id === id)?.name ?? ''
  const headingName = (id: string | null) => {
    const h = headings.data?.find((x) => x.id === id)
    const parent = headings.data?.find((x) => x.id === h?.parent_id)
    return h ? (parent ? `${parent.name} › ${h.name}` : h.name) : ''
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const values = {
      name: form.name.trim(), local_name: form.local_name.trim() || null, spec: form.spec.trim() || null,
      default_unit_id: form.default_unit_id, default_heading_id: form.default_heading_id || null,
    }
    write.mutate(
      editId ? { id: editId, values } : { values: { ...values, company_id: auth.companyId } },
      { onSuccess: close },
    )
  }

  return (
    <div className="grid gap-4">
      {auth.isAdmin && !formOpen && <div><Button variant="secondary" onClick={() => setFormOpen(true)}>{t('catalog.addMaterial')}</Button></div>}
      {auth.isAdmin && formOpen && (
        <Card title={editId ? t('catalog.editMaterial') : t('catalog.addAMaterial')}>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <Field label={t('catalog.name')} htmlFor="m-name"><Input id="m-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label={t('catalog.localName')} htmlFor="m-local"><Input id="m-local" value={form.local_name} onChange={(e) => setForm({ ...form, local_name: e.target.value })} placeholder={t('catalog.eg.chhad')} /></Field>
            <Field label={t('catalog.specification')} htmlFor="m-spec"><Input id="m-spec" value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} placeholder={t('catalog.eg.12mmFe500Opc')} /></Field>
            <Field label={t('catalog.defaultUnit')} htmlFor="m-unit">
              <Select id="m-unit" value={form.default_unit_id} onChange={(e) => setForm({ ...form, default_unit_id: e.target.value })}>
                <option value="">{t('catalog.chooseAUnit')}</option>
                {units.data?.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>
            <Field label={t('catalog.defaultCostHeading')} htmlFor="m-heading">
              <Select id="m-heading" value={form.default_heading_id} onChange={(e) => setForm({ ...form, default_heading_id: e.target.value })}>
                <option value="">{t('catalog.none')}</option>
                {headings.data?.filter((h) => h.active && h.parent_id).map((h) => (
                  // Always the full path: "Electrical" exists under both Materials and Subcontract.
                  <option key={h.id} value={h.id}>{headings.data?.find((p) => p.id === h.parent_id)?.name} › {h.name}</option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={!form.name.trim() || !form.default_unit_id} busy={write.isPending}>{editId ? t('common.save') : t('common.add')}</Button>
              <Button type="button" variant="secondary" onClick={close}>{t('common.cancel')}</Button>
              {editing && (
                <Button type="button" variant="ghost" disabled={write.isPending}
                  onClick={() => write.mutate({ id: editing.id, values: { active: !editing.active } }, { onSuccess: close })}>
                  {editing.active ? t('catalog.deactivate') : t('catalog.activate')}
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}
      <ErrorBanner>{write.error && friendlyError(write.error)}</ErrorBanner>
      <Card>
        {materials.isPending && <Spinner />}
        <ErrorBanner onRetry={() => { void materials.refetch(); void units.refetch() }}>
          {(materials.error || units.error) && friendlyError(materials.error || units.error)}
        </ErrorBanner>
        {materials.data?.length === 0 && <p className="text-sm text-subtle">{t('catalog.noMaterialsYet')}</p>}
        <ul>
          {materials.data?.map((m) => (
            <li key={m.id} className="border-b border-line last:border-0">
              {(() => {
                const body = (
                  <div className={`min-w-0 break-words ${m.active ? '' : 'opacity-60'}`}>
                    <div className="text-sm font-medium text-ink">
                      {m.name}{m.local_name && m.local_name !== m.name && <span className="text-subtle"> ({m.local_name})</span>}
                      {!m.active && <> <Badge>{t('catalog.inactive')}</Badge></>}
                    </div>
                    <div className="text-xs text-subtle">{[m.spec, unitName(m.default_unit_id), headingName(m.default_heading_id)].filter(Boolean).join(' · ')}</div>
                  </div>
                )
                return auth.isAdmin ? (
                  <button type="button" aria-label={t('catalog.editName', { name: m.name })} className="block min-h-11 w-full py-2 text-left hover:bg-muted"
                    onClick={() => {
                      setEditId(m.id)
                      setFormOpen(true)
                      setForm({ name: m.name, local_name: m.local_name ?? '', spec: m.spec ?? '', default_unit_id: m.default_unit_id, default_heading_id: m.default_heading_id ?? '' })
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}>{body}</button>
                ) : <div className="py-2">{body}</div>
              })()}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function UnitsTab() {
  const auth = useCompany()
  const units = useUnits(auth.companyId)
  const write = useCatalogWrite('units')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [needsNote, setNeedsNote] = useState(false)
  const [formOpen, setFormOpen] = useState(false)

  function add(e: FormEvent) {
    e.preventDefault()
    write.mutate(
      { values: { company_id: auth.companyId, code: code.trim().toLowerCase(), name: name.trim(), needs_note: needsNote } },
      { onSuccess: () => { setCode(''); setName(''); setNeedsNote(false); setFormOpen(false) } },
    )
  }

  return (
    <div className="grid gap-4">
      {auth.isAdmin && !formOpen && <div><Button variant="secondary" onClick={() => setFormOpen(true)}>{t('catalog.addUnit')}</Button></div>}
      {auth.isAdmin && formOpen && (
        <Card title={t('catalog.addAUnit')}>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
            <Field label={t('catalog.name')} htmlFor="u-name"><Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('catalog.eg.unitName')} /></Field>
            <Field label={t('catalog.shortCode')} htmlFor="u-code"><Input id="u-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('catalog.eg.unitCode')} /></Field>
            <Checkbox label={t('catalog.needsADescription')} hint={t('catalog.likeTripOrLoad')}
              checked={needsNote} onChange={(e) => setNeedsNote(e.target.checked)} />
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={!code.trim() || !name.trim()} busy={write.isPending}>{t('common.add')}</Button>
              <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>{t('common.cancel')}</Button>
            </div>
          </form>
        </Card>
      )}
      <ErrorBanner>{write.error && friendlyError(write.error)}</ErrorBanner>
      <Card>
        {units.isPending && <Spinner />}
        <ErrorBanner onRetry={() => void units.refetch()}>{units.error && friendlyError(units.error)}</ErrorBanner>
        {units.data?.length === 0 && <p className="text-sm text-subtle">{t('catalog.noUnitsYet')}</p>}
        <ul>
          {units.data?.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-2 border-b border-line py-2 last:border-0">
              <div className={`min-w-0 break-words ${u.active ? '' : 'opacity-60'}`}>
                <span className="text-sm font-medium text-ink">{u.name}</span>
                <span className="ml-2 text-xs text-subtle">{u.code}</span>
                {u.needs_note && <> <Badge>{t('catalog.needsDescription')}</Badge></>}
              </div>
              {auth.isAdmin && (
                <Button variant="ghost" aria-label={`${u.active ? t('catalog.deactivate') : t('catalog.activate')} ${u.name}`} disabled={write.isPending}
                  onClick={() => write.mutate({ id: u.id, values: { active: !u.active } })}>{u.active ? t('catalog.deactivate') : t('catalog.activate')}</Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
