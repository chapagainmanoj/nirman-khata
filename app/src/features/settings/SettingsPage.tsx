import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useCompany } from '../../auth/AuthProvider'
import { Button, Card, Checkbox, Detail, ErrorBanner, Field, Input, Notice, PageHeader, Select, Status } from '../../components/ui'
import { formatDual, todayKathmandu, type DateDisplay } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { t } from '../../lib/i18n'
import { ROLE_LABELS } from '../../lib/labels'
import { supabase, type Tables } from '../../lib/supabase'
import { callFunction } from '../../lib/functions'
import { ACCENTS, isAccent } from '../../lib/accents'
import { BrandingCard } from './BrandingCard'

export function SettingsPage() {
  const auth = useCompany()
  return (
    <>
      <PageHeader title={t('settings.title')} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <MyProfileCard />
        {auth.isAdmin ? <CompanySettingsForm company={auth.company} /> : <CompanySettingsView company={auth.company} />}
        {auth.isAdmin && <BrandingCard />}
        {auth.isAdmin && <ExportCard />}
      </div>
    </>
  )
}

function MyProfileCard() {
  const auth = useCompany()
  const queryClient = useQueryClient()
  const [name, setName] = useState(auth.profile?.full_name ?? '')
  const [display, setDisplay] = useState<DateDisplay | ''>(auth.profile?.date_display ?? '')
  const [saved, setSaved] = useState(false)

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('profiles')
        .update({ full_name: name.trim(), date_display: display || null })
        .eq('id', auth.userId)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      setSaved(true)
    },
  })

  return (
    <Card title="My account">
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); setSaved(false); save.mutate() }} className="flex flex-col gap-4">
        <Detail label="Sign-in">{auth.profile?.phone ?? auth.profile?.email}</Detail>
        <Detail label="Roles">{auth.membership?.roles.map((r) => ROLE_LABELS[r]).join(', ')}</Detail>
        <Field label="Name" htmlFor="my-name"><Input id="my-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Show dates in" htmlFor="my-dates" hint={`Today: ${formatDual(todayKathmandu(), display || auth.company.default_date_display)}`}>
          <Select id="my-dates" value={display} onChange={(e) => setDisplay(e.target.value as DateDisplay | '')}>
            <option value="">Company default ({auth.company.default_date_display.toUpperCase()})</option>
            <option value="bs">BS (Bikram Sambat)</option>
            <option value="ad">AD (Gregorian)</option>
          </Select>
        </Field>
        <ErrorBanner>{save.error && friendlyError(save.error)}</ErrorBanner>
        <Status>{saved && <Notice>Saved.</Notice>}</Status>
        <div><Button type="submit" busy={save.isPending} disabled={!name.trim()}>{t('common.save')}</Button></div>
      </form>
    </Card>
  )
}

type CompanyValues = Pick<Tables<'companies'>,
  'name' | 'pan_vat' | 'address' | 'phone' | 'default_date_display' | 'slip_approval_required' | 'tax_fields_enabled' |
  'labour_module_enabled' | 'vat_treatment' | 'rate_variance_tolerance_pct' | 'simple_forms'>

function CompanySettingsForm({ company }: { company: Tables<'companies'> }) {
  const queryClient = useQueryClient()
  const [v, setV] = useState<CompanyValues>({
    name: company.name, pan_vat: company.pan_vat, address: company.address, phone: company.phone,
    default_date_display: company.default_date_display, slip_approval_required: company.slip_approval_required,
    tax_fields_enabled: company.tax_fields_enabled, labour_module_enabled: company.labour_module_enabled,
    vat_treatment: company.vat_treatment, rate_variance_tolerance_pct: company.rate_variance_tolerance_pct,
    simple_forms: company.simple_forms,
  })
  const [saved, setSaved] = useState(false)
  const set = <K extends keyof CompanyValues>(k: K, value: CompanyValues[K]) => { setSaved(false); setV({ ...v, [k]: value }) }

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('companies').update({
        ...v, name: v.name.trim(), pan_vat: v.pan_vat?.trim() || null, address: v.address?.trim() || null, phone: v.phone?.trim() || null,
      }).eq('id', company.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      setSaved(true)
    },
  })

  return (
    <Card title="Company">
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate() }} className="flex flex-col gap-5">
        <Group title="Company profile">
          <Field label="Company name" htmlFor="co-name"><Input id="co-name" value={v.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="PAN / VAT number" htmlFor="co-pan"><Input id="co-pan" value={v.pan_vat ?? ''} onChange={(e) => set('pan_vat', e.target.value)} /></Field>
            <Field label="Phone" htmlFor="co-phone"><Input id="co-phone" value={v.phone ?? ''} onChange={(e) => set('phone', e.target.value)} inputMode="tel" /></Field>
          </div>
          <Field label="Address" htmlFor="co-address"><Input id="co-address" value={v.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
        </Group>
        <Group title="Forms">
          <div className="flex gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="How forms look">
            {([[false, 'Detailed'], [true, 'Simple']] as const).map(([k, label]) => (
              <button key={label} type="button" role="radio" aria-checked={v.simple_forms === k} onClick={() => set('simple_forms', k)}
                className={`min-h-11 flex-1 rounded-md px-1 text-sm font-medium ${v.simple_forms === k ? 'bg-surface text-ink shadow-sm' : 'text-subtle'}`}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-sm text-subtle">
            {v.simple_forms
              ? 'Forms show the main fields. Less-used ones (VAT, discount, references, extra details) are under "More", one tap away. Records and rules stay the same.'
              : 'Forms show every field. Good for a firm with an accountant.'}
          </p>
        </Group>
        <Group title="Dates">
          <Field label="Default date display" htmlFor="co-dates" hint="Each person can change this for themselves.">
            <Select id="co-dates" value={v.default_date_display} onChange={(e) => set('default_date_display', e.target.value as DateDisplay)}>
              <option value="bs">BS (Bikram Sambat)</option>
              <option value="ad">AD (Gregorian)</option>
            </Select>
          </Field>
        </Group>
        <Group title="Bills and VAT">
          <Checkbox label="Show tax fields (VAT) on bills" checked={v.tax_fields_enabled} onChange={(e) => set('tax_fields_enabled', e.target.checked)} />
          <Field label="VAT on supplier bills" htmlFor="co-vat">
            <Select id="co-vat" value={v.vat_treatment} onChange={(e) => set('vat_treatment', e.target.value as CompanyValues['vat_treatment'])}>
              <option value="vat_as_cost">VAT is part of project cost (not claiming input VAT)</option>
              <option value="vat_recoverable">VAT is recoverable (kept out of project cost)</option>
            </Select>
          </Field>
          <Field label="Rate difference warning" htmlFor="co-tolerance" hint="Warn when a billed rate differs from the order slip rate by more than this.">
            <div className="flex w-32 items-center gap-2">
              <Input id="co-tolerance" type="number" min={0} step="0.5" value={v.rate_variance_tolerance_pct}
                onChange={(e) => set('rate_variance_tolerance_pct', Number(e.target.value))} />
              <span aria-hidden className="text-sm text-subtle">%</span>
            </div>
          </Field>
        </Group>
        <Group title="Order slips">
          <Checkbox label="Order slips need approval" hint="If off, a submitted slip counts as approved."
            checked={v.slip_approval_required} onChange={(e) => set('slip_approval_required', e.target.checked)} />
        </Group>
        <Group title="Modules">
          <Checkbox label="Track own labour (jyala)" hint="Daily labour cost for your own crews."
            checked={v.labour_module_enabled} onChange={(e) => set('labour_module_enabled', e.target.checked)} />
        </Group>
        <ErrorBanner>{save.error && friendlyError(save.error)}</ErrorBanner>
        <Status>{saved && <Notice>Saved.</Notice>}</Status>
        <div><Button type="submit" busy={save.isPending} disabled={!v.name.trim()}>{t('common.save')}</Button></div>
      </form>
    </Card>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 border-t border-line pt-4 first:border-0 first:pt-0">
      <legend className="float-left mb-1 text-sm font-semibold text-ink">{title}</legend>
      <div className="clear-left flex flex-col gap-3">{children}</div>
    </fieldset>
  )
}

function CompanySettingsView({ company: c }: { company: Tables<'companies'> }) {
  return (
    <Card title="Company">
      <Detail label="Name">{c.name}</Detail>
      <Detail label="PAN / VAT">{c.pan_vat}</Detail>
      <Detail label="Phone">{c.phone}</Detail>
      <Detail label="Address">{c.address}</Detail>
      <Detail label="Forms">{c.simple_forms ? 'Simple' : 'Detailed'}</Detail>
      <Detail label="Order slip approval">{c.slip_approval_required ? 'Required' : 'Not required'}</Detail>
      <Detail label="Colour">{ACCENTS[isAccent(c.accent) ? c.accent : 'teal'].label}</Detail>
    </Card>
  )
}

/** Full company export (req §22): every record and photo in one zip, for the owner to keep. */
function ExportCard() {
  const auth = useCompany()
  const [done, setDone] = useState('')
  const run = useMutation({
    mutationFn: () => callFunction<Blob>('company-export', { company_id: auth.companyId }),
    onSuccess: (blob) => {
      const name = `nirmankhata-export-${todayKathmandu()}.zip`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setDone(`Downloaded ${name} (${(blob.size / 1024 / 1024).toFixed(1)} MB).`)
    },
  })
  return (
    <Card title="Export all company data">
      <p className="text-sm text-subtle">
        One zip with a spreadsheet (CSV) for every kind of record, your staff list, all photos, and a manifest
        to check nothing is missing. Keep it somewhere safe; it holds all your figures.
      </p>
      <div className="mt-3"><Button busy={run.isPending} onClick={() => { setDone(''); run.mutate() }}>Download export</Button></div>
      <Status>{done && <Notice>{done}</Notice>}</Status>
      <ErrorBanner>{run.error && friendlyError(run.error)}</ErrorBanner>
    </Card>
  )
}
