// Cost headings, materials and units (req §7, §8.1, §3.2). Admins edit; everyone reads.
// Nothing is deleted: used entries stay visible in history, so they are deactivated instead.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useCompany } from '../../auth/AuthProvider'
import { Badge, Button, Card, Checkbox, ErrorBanner, Field, Input, PageHeader, Select, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { t } from '../../lib/i18n'
import { supabase, type Tables } from '../../lib/supabase'
import { useHeadings } from '../projects/api'

type Tab = 'headings' | 'materials' | 'units'

export function CatalogPage() {
  const [tab, setTab] = useState<Tab>('headings')
  const tabs: Array<[Tab, string]> = [['headings', 'Cost headings'], ['materials', 'Materials'], ['units', 'Units']]
  return (
    <>
      <PageHeader title={t('catalog.title')} />
      <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`min-h-10 flex-1 rounded-md text-sm font-medium ${tab === key ? 'bg-surface text-ink shadow-sm' : 'text-subtle'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'headings' && <HeadingsTab />}
      {tab === 'materials' && <MaterialsTab />}
      {tab === 'units' && <UnitsTab />}
    </>
  )
}

function useUnits(companyId: string) {
  return useQuery({
    queryKey: ['units', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('units').select('*').eq('company_id', companyId).order('name')
      if (error) throw error
      return data
    },
  })
}

function useMaterials(companyId: string) {
  return useQuery({
    queryKey: ['materials', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('materials').select('*').eq('company_id', companyId).order('name')
      if (error) throw error
      return data
    },
  })
}

/** Insert/update on a catalog table, then refresh its list. */
function useCatalogWrite(table: 'cost_headings' | 'materials' | 'units', queryKey: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (op: { id?: string; values: Record<string, unknown> }) => {
      const q = op.id
        ? supabase.from(table).update(op.values as never).eq('id', op.id)
        : supabase.from(table).insert(op.values as never)
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
  })
}

function HeadingsTab() {
  const auth = useCompany()
  const headings = useHeadings(auth.companyId)
  const write = useCatalogWrite('cost_headings', 'headings')
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)

  const top = headings.data?.filter((h) => !h.parent_id) ?? []
  const children = (id: string) => headings.data?.filter((h) => h.parent_id === id) ?? []

  function add(e: FormEvent) {
    e.preventDefault()
    const parent = headings.data?.find((h) => h.id === parentId)
    write.mutate(
      { values: { company_id: auth.companyId, name: name.trim(), parent_id: parentId || null, kind: parent?.kind ?? 'other', sort_order: 100 } },
      { onSuccess: () => setName('') },
    )
  }

  const row = (h: Tables<'cost_headings'>, indent: boolean) => (
    <li key={h.id} className={`flex items-center justify-between gap-2 border-b border-line py-2 last:border-0 ${indent ? 'pl-5' : ''}`}>
      {editing?.id === h.id ? (
        <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); write.mutate({ id: h.id, values: { name: editing.name.trim() } }, { onSuccess: () => setEditing(null) }) }}>
          <Input value={editing.name} onChange={(e) => setEditing({ id: h.id, name: e.target.value })} autoFocus />
          <Button type="submit" disabled={!editing.name.trim()}>{t('common.save')}</Button>
        </form>
      ) : (
        <span className={`text-sm ${indent ? 'text-ink' : 'font-semibold text-ink'} ${h.active ? '' : 'line-through opacity-60'}`}>{h.name}</span>
      )}
      {auth.isAdmin && editing?.id !== h.id && (
        <span className="flex shrink-0 gap-1">
          <Button variant="ghost" onClick={() => setEditing({ id: h.id, name: h.name })}>Rename</Button>
          <Button variant="ghost" onClick={() => write.mutate({ id: h.id, values: { active: !h.active } })}>{h.active ? 'Deactivate' : 'Activate'}</Button>
        </span>
      )}
    </li>
  )

  return (
    <div className="grid gap-4">
      {auth.isAdmin && (
        <Card title="Add a heading">
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Name" htmlFor="h-name"><Input id="h-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Under" htmlFor="h-parent">
              <Select id="h-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">Top level</option>
                {top.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </Select>
            </Field>
            <Button type="submit" disabled={!name.trim()} busy={write.isPending}>{t('common.add')}</Button>
          </form>
        </Card>
      )}
      <ErrorBanner>{write.error && friendlyError(write.error)}</ErrorBanner>
      <Card>
        {headings.isPending && <Spinner />}
        <ul>{top.flatMap((h) => [row(h, false), ...children(h.id).map((c) => row(c, true))])}</ul>
      </Card>
    </div>
  )
}

function MaterialsTab() {
  const auth = useCompany()
  const materials = useMaterials(auth.companyId)
  const units = useUnits(auth.companyId)
  const headings = useHeadings(auth.companyId)
  const write = useCatalogWrite('materials', 'materials')
  const empty = { name: '', local_name: '', spec: '', default_unit_id: '', default_heading_id: '' }
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState<string | null>(null)

  const unitName = (id: string) => units.data?.find((u) => u.id === id)?.name ?? ''
  const headingName = (id: string | null) => headings.data?.find((h) => h.id === id)?.name ?? ''

  function submit(e: FormEvent) {
    e.preventDefault()
    const values = {
      name: form.name.trim(), local_name: form.local_name.trim() || null, spec: form.spec.trim() || null,
      default_unit_id: form.default_unit_id, default_heading_id: form.default_heading_id || null,
    }
    write.mutate(
      editId ? { id: editId, values } : { values: { ...values, company_id: auth.companyId } },
      { onSuccess: () => { setForm(empty); setEditId(null) } },
    )
  }

  return (
    <div className="grid gap-4">
      {auth.isAdmin && (
        <Card title={editId ? 'Edit material' : 'Add a material'}>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="m-name"><Input id="m-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Local name" htmlFor="m-local"><Input id="m-local" value={form.local_name} onChange={(e) => setForm({ ...form, local_name: e.target.value })} placeholder="e.g. Chhad" /></Field>
            <Field label="Specification" htmlFor="m-spec"><Input id="m-spec" value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} placeholder="e.g. 12mm Fe500, OPC 43" /></Field>
            <Field label="Default unit" htmlFor="m-unit">
              <Select id="m-unit" value={form.default_unit_id} onChange={(e) => setForm({ ...form, default_unit_id: e.target.value })}>
                <option value="">Choose a unit</option>
                {units.data?.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>
            <Field label="Default cost heading" htmlFor="m-heading">
              <Select id="m-heading" value={form.default_heading_id} onChange={(e) => setForm({ ...form, default_heading_id: e.target.value })}>
                <option value="">None</option>
                {headings.data?.filter((h) => h.active).map((h) => <option key={h.id} value={h.id}>{h.parent_id ? '  ' : ''}{h.name}</option>)}
              </Select>
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={!form.name.trim() || !form.default_unit_id} busy={write.isPending}>{editId ? t('common.save') : t('common.add')}</Button>
              {editId && <Button type="button" variant="secondary" onClick={() => { setEditId(null); setForm(empty) }}>{t('common.cancel')}</Button>}
            </div>
          </form>
        </Card>
      )}
      <ErrorBanner>{write.error && friendlyError(write.error)}</ErrorBanner>
      <Card>
        {materials.isPending && <Spinner />}
        <ul>
          {materials.data?.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 border-b border-line py-2 last:border-0">
              <div className={m.active ? '' : 'opacity-60'}>
                <div className="text-sm font-medium text-ink">
                  {m.name}{m.local_name && m.local_name !== m.name && <span className="text-subtle"> ({m.local_name})</span>}
                  {!m.active && <> <Badge>Inactive</Badge></>}
                </div>
                <div className="text-xs text-subtle">{[m.spec, unitName(m.default_unit_id), headingName(m.default_heading_id)].filter(Boolean).join(' · ')}</div>
              </div>
              {auth.isAdmin && (
                <span className="flex shrink-0 gap-1">
                  <Button variant="ghost" onClick={() => {
                    setEditId(m.id)
                    setForm({ name: m.name, local_name: m.local_name ?? '', spec: m.spec ?? '', default_unit_id: m.default_unit_id, default_heading_id: m.default_heading_id ?? '' })
                  }}>{t('common.edit')}</Button>
                  <Button variant="ghost" onClick={() => write.mutate({ id: m.id, values: { active: !m.active } })}>{m.active ? 'Deactivate' : 'Activate'}</Button>
                </span>
              )}
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
  const write = useCatalogWrite('units', 'units')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [needsNote, setNeedsNote] = useState(false)

  function add(e: FormEvent) {
    e.preventDefault()
    write.mutate(
      { values: { company_id: auth.companyId, code: code.trim().toLowerCase(), name: name.trim(), needs_note: needsNote } },
      { onSuccess: () => { setCode(''); setName(''); setNeedsNote(false) } },
    )
  }

  return (
    <div className="grid gap-4">
      {auth.isAdmin && (
        <Card title="Add a unit">
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="u-name"><Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Drum" /></Field>
            <Field label="Short code" htmlFor="u-code"><Input id="u-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. drum" /></Field>
            <Checkbox label="Needs a description" hint="Like trip or load, where size depends on the vehicle (tipper, tractor)."
              checked={needsNote} onChange={(e) => setNeedsNote(e.target.checked)} />
            <div className="flex items-end"><Button type="submit" disabled={!code.trim() || !name.trim()} busy={write.isPending}>{t('common.add')}</Button></div>
          </form>
        </Card>
      )}
      <ErrorBanner>{write.error && friendlyError(write.error)}</ErrorBanner>
      <Card>
        {units.isPending && <Spinner />}
        <ul>
          {units.data?.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-2 border-b border-line py-2 last:border-0">
              <div className={u.active ? '' : 'opacity-60'}>
                <span className="text-sm font-medium text-ink">{u.name}</span>
                <span className="ml-2 text-xs text-subtle">{u.code}</span>
                {u.needs_note && <> <Badge>needs description</Badge></>}
              </div>
              {auth.isAdmin && (
                <Button variant="ghost" onClick={() => write.mutate({ id: u.id, values: { active: !u.active } })}>{u.active ? 'Deactivate' : 'Activate'}</Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
