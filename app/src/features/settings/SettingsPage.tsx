// Settings: one column of cards in the order an owner sets things up. My account; the company (who
// it is: name, numbers, logo, colour, dates); how the company works (forms, slip approval, own
// labour: one tap each, saved at once); bills and VAT; and the full export. Each card saves on its
// own, so nothing typed in one is lost by saving another. Staff who are not admins see their account
// and the company read-only.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Button, Card, Checkbox, Detail, ErrorBanner, Field, Input, Notice, PageHeader, Select, Status } from '../../components/ui'
import { ACCENTS, applyAccent, isAccent, type AccentKey } from '../../lib/accents'
import { formatDual, formatDate, todayKathmandu, type DateDisplay } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { callFunction } from '../../lib/functions'
import { t } from '../../lib/i18n'
import { ROLE_LABELS } from '../../lib/labels'
import { formatPhone, parseLoginId } from '../../lib/login-id'
import { supabase, type Tables } from '../../lib/supabase'
import { platform } from '../../platform'
import { ColourField, LogoField } from './Branding'

const SECTIONS = [
  ['account', 'settings.section.account', false],
  ['company', 'settings.section.company', false],
  ['work', 'settings.section.work', true],
  ['vat', 'settings.section.vat', true],
  ['data', 'settings.section.data', true],
] as const

export function SettingsPage() {
  const auth = useCompany()
  const sections = SECTIONS.filter(([, , adminOnly]) => auth.isAdmin || !adminOnly)
  return (
    <>
      <PageHeader title={t('settings.title')} />
      <div className="lg:grid lg:grid-cols-[11rem_minmax(0,44rem)] lg:gap-8">
        {/* Jump to a card: chips on a phone, a short menu beside the cards on a wide screen. */}
        <nav aria-label={t('settings.settingsSections')} className="-mx-4 mb-4 overflow-x-auto px-4 lg:mx-0 lg:mb-0 lg:overflow-visible lg:px-0">
          <ul className="flex gap-2 lg:sticky lg:top-6 lg:flex-col lg:gap-1">
            {sections.map(([id, label]) => (
              <li key={id} className="shrink-0">
                <a href={`#${id}`}
                  className="flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-medium whitespace-nowrap text-ink hover:bg-muted lg:rounded-md lg:border-0 lg:px-3">
                  {t(label)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex min-w-0 flex-col gap-4">
          <Section id="account"><MyAccountCard /></Section>
          <Section id="company">{auth.isAdmin ? <CompanyCard company={auth.company} /> : <CompanyView company={auth.company} />}</Section>
          {auth.isAdmin && (
            <>
              <Section id="work"><HowYouWorkCard company={auth.company} /></Section>
              <Section id="vat"><BillsVatCard company={auth.company} /></Section>
              <Section id="data"><ExportCard /></Section>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function Section({ id, children }: { id: string; children: ReactNode }) {
  return <div id={id} className="scroll-mt-20">{children}</div>
}

/** Save button with its result beside it, so "Saved" shows where the change was made. */
function SaveRow({ busy, disabled, saved, error, label = t('common.save') }: {
  busy: boolean; disabled?: boolean; saved: boolean; error: unknown; label?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <ErrorBanner>{error ? friendlyError(error) : null}</ErrorBanner>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" busy={busy} disabled={disabled}>{label}</Button>
        <Status>{saved && <Notice>{t('settings.saved')}</Notice>}</Status>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// My account
// ---------------------------------------------------------------------------
function MyAccountCard() {
  const auth = useCompany()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState(auth.profile?.full_name ?? '')
  const [display, setDisplay] = useState<DateDisplay | ''>(auth.profile?.date_display ?? '')
  const [saved, setSaved] = useState(false)
  const [changing, setChanging] = useState(false)

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

  const signIn = auth.profile?.phone ? formatPhone(auth.profile.phone) : auth.profile?.email
  return (
    <Card title={t('settings.myAccount')}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); setSaved(false); save.mutate() }} className="flex flex-col gap-4">
        <div>
          <Detail label={t('settings.signIn')}>{signIn}</Detail>
          <Detail label={t('settings.roles')}>{auth.membership?.roles.map((r) => ROLE_LABELS[r]).join(', ')}</Detail>
        </div>
        <Field label={t('settings.name')} htmlFor="my-name"><Input id="my-name" value={name} onChange={(e) => { setSaved(false); setName(e.target.value) }} /></Field>
        <Field label={t('settings.showDatesIn')} htmlFor="my-dates"
          hint={t('settings.onlyForYouToday', { value: formatDual(todayKathmandu(), display || auth.company.default_date_display) })}>
          <Select id="my-dates" value={display} onChange={(e) => { setSaved(false); setDisplay(e.target.value as DateDisplay | '') }}>
            <option value="">{t('settings.companyDefaultValue', { value: auth.company.default_date_display.toUpperCase() })}</option>
            <option value="bs">{t('settings.bsBikramSambat')}</option>
            <option value="ad">{t('settings.adGregorian')}</option>
          </Select>
        </Field>
        <SaveRow busy={save.isPending} disabled={!name.trim()} saved={saved} error={save.error} />
      </form>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        {!changing && <Button type="button" variant="secondary" onClick={() => setChanging(true)}>{t('settings.changePassword')}</Button>}
        <Button type="button" variant="ghost" onClick={async () => { if (await auth.signOut()) navigate('/login') }}>{t('nav.signOut')}</Button>
      </div>
      {changing && <ChangePassword login={auth.profile?.phone ?? auth.profile?.email ?? ''} onDone={() => setChanging(false)} />}
    </Card>
  )
}

const MIN_PASSWORD = 8

/** The current password is asked for first, so a phone left signed in cannot be taken over. */
function ChangePassword({ login, onDone }: { login: string; onDone: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => first.current?.focus(), [])

  const change = useMutation({
    mutationFn: async () => {
      const id = parseLoginId(login)
      if (!id) throw new Error(t('settings.yourSignInCould'))
      const check = await supabase.auth.signInWithPassword({ email: id.email, password: current })
      if (check.error) throw new Error(t('settings.theCurrentPasswordIs'))
      const { error } = await supabase.auth.updateUser({ password: next })
      if (error) throw new Error(error.message.includes('different') ? t('settings.chooseAPasswordDifferent') : t('settings.couldNotChangeThe'))
    },
    onSuccess: () => { setDone(true); setCurrent(''); setNext(''); setAgain('') },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const problem = !current ? t('settings.enterYourCurrentPassword')
      : next.length < MIN_PASSWORD ? t('settings.theNewPasswordMust', { minPassword: MIN_PASSWORD })
      : next !== again ? t('settings.theTwoNewPasswords')
      : ''
    setError(problem)
    setDone(false)
    if (!problem) change.mutate()
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3" aria-label={t('settings.changePassword')}>
      <Field label={t('settings.currentPassword')} htmlFor="pw-current">
        <Input ref={first} id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('settings.newPassword')} htmlFor="pw-new" hint={t('settings.atLeastMinpasswordCharacters', { minPassword: MIN_PASSWORD })}>
          <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label={t('settings.newPasswordAgain')} htmlFor="pw-again">
          <Input id="pw-again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </Field>
      </div>
      <ErrorBanner>{error || (change.error && (change.error as Error).message)}</ErrorBanner>
      <Status>{done && <Notice>{t('settings.passwordChangedUseThe')}</Notice>}</Status>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={change.isPending}>{t('settings.changePassword')}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>{done ? t('settings.close') : t('common.cancel')}</Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Company: who it is
// ---------------------------------------------------------------------------
type ProfileValues = Pick<Tables<'companies'>, 'name' | 'pan_vat' | 'address' | 'phone' | 'default_date_display'> & { accent: AccentKey }

function CompanyCard({ company }: { company: Tables<'companies'> }) {
  const queryClient = useQueryClient()
  const savedAccent: AccentKey = isAccent(company.accent) ? company.accent : 'teal'
  const [v, setV] = useState<ProfileValues>({
    name: company.name, pan_vat: company.pan_vat, address: company.address, phone: company.phone,
    default_date_display: company.default_date_display, accent: savedAccent,
  })
  const [saved, setSaved] = useState(false)
  const set = <K extends keyof ProfileValues>(k: K, value: ProfileValues[K]) => { setSaved(false); setV({ ...v, [k]: value }) }

  // Leaving the page with a colour picked but not saved puts the saved colour back.
  const savedRef = useRef(savedAccent)
  useEffect(() => { savedRef.current = savedAccent }, [savedAccent])
  useEffect(() => () => applyAccent(savedRef.current), [])

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
    <Card title={t('settings.company')}>
      <div className="flex flex-col gap-5">
        <LogoField />
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate() }} className="flex flex-col gap-4 border-t border-line pt-4" aria-label={t('settings.company')}>
          <Field label={t('settings.companyName')} htmlFor="co-name"><Input id="co-name" value={v.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('settings.panVatNumber')} htmlFor="co-pan"><Input id="co-pan" value={v.pan_vat ?? ''} onChange={(e) => set('pan_vat', e.target.value)} /></Field>
            <Field label={t('settings.phone')} htmlFor="co-phone"><Input id="co-phone" value={v.phone ?? ''} onChange={(e) => set('phone', e.target.value)} inputMode="tel" /></Field>
          </div>
          <Field label={t('settings.address')} htmlFor="co-address"><Input id="co-address" value={v.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label={t('settings.dates')} htmlFor="co-dates" hint={t('settings.howDatesShowFor')}>
            <Select id="co-dates" value={v.default_date_display} onChange={(e) => set('default_date_display', e.target.value as DateDisplay)}>
              <option value="bs">{t('settings.bsBikramSambat')}</option>
              <option value="ad">{t('settings.adGregorian')}</option>
            </Select>
          </Field>
          <ColourField value={v.accent} onChange={(k) => set('accent', k)} />
          <SaveRow busy={save.isPending} disabled={!v.name.trim()} saved={saved} error={save.error} />
        </form>
      </div>
    </Card>
  )
}

function CompanyView({ company: c }: { company: Tables<'companies'> }) {
  return (
    <Card title={t('settings.company')}>
      <Detail label={t('settings.name')}>{c.name}</Detail>
      <Detail label={t('settings.panVat')}>{c.pan_vat}</Detail>
      <Detail label={t('settings.phone')}>{c.phone}</Detail>
      <Detail label={t('settings.address')}>{c.address}</Detail>
      <Detail label={t('settings.forms')}>{c.simple_forms ? t('settings.simple') : t('settings.detailed')}</Detail>
      <Detail label={t('settings.orderSlipApproval')}>{c.slip_approval_required ? t('settings.required') : t('settings.notRequired')}</Detail>
      <Detail label={t('settings.colour')}>{t(ACCENTS[isAccent(c.accent) ? c.accent : 'teal'].label)}</Detail>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// How you work: one tap each, saved at once
// ---------------------------------------------------------------------------
type WorkValues = Pick<Tables<'companies'>,
  'simple_forms' | 'slip_approval_required' | 'labour_module_enabled' | 'labour_mode' | 'standard_day_minutes' | 'day_start' | 'day_end'>

function HowYouWorkCard({ company }: { company: Tables<'companies'> }) {
  const queryClient = useQueryClient()
  const [v, setV] = useState<WorkValues>({
    simple_forms: company.simple_forms, slip_approval_required: company.slip_approval_required, labour_module_enabled: company.labour_module_enabled,
    labour_mode: company.labour_mode, standard_day_minutes: company.standard_day_minutes, day_start: company.day_start, day_end: company.day_end,
  })
  const save = useMutation({
    mutationFn: async (change: Partial<WorkValues>) => {
      const { error } = await supabase.from('companies').update(change).eq('id', company.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
    // Put the switch back as it was, so it never shows a choice that was not saved.
    onError: (_, change) => setV((cur) => ({ ...cur, ...Object.fromEntries(Object.keys(change).map((k) => [k, company[k as keyof WorkValues]])) })),
  })
  const set = (change: Partial<WorkValues>) => { setV({ ...v, ...change }); save.mutate(change) }

  return (
    <Card title={t('settings.howYouWork')} actions={<Status>{save.isSuccess && !save.isPending && <span className="text-sm text-subtle">{t('settings.saved')}</span>}</Status>}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink">{t('settings.forms')}</span>
          <div className="flex gap-1 rounded-lg bg-track p-1" role="radiogroup" aria-label={t('settings.howFormsLook')}>
            {([[false, t('settings.detailed')], [true, t('settings.simple')]] as const).map(([k, label]) => (
              <button key={label} type="button" role="radio" aria-checked={v.simple_forms === k} disabled={save.isPending}
                onClick={() => v.simple_forms !== k && set({ simple_forms: k })}
                className={`min-h-11 flex-1 rounded-md px-1 text-sm font-medium ${v.simple_forms === k ? 'bg-surface text-ink shadow-sm' : 'text-subtle'}`}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-sm text-subtle">
            {v.simple_forms
              ? t('settings.simpleFormsShowThe')
              : t('settings.detailedFormsShowEvery')}
          </p>
        </div>
        <div className="border-t border-line pt-3">
          <Checkbox label={t('settings.orderSlipsNeedApproval')} disabled={save.isPending}
            hint={v.slip_approval_required ? t('settings.aSubmittedOrderSlip') : t('settings.offASubmittedOrder')}
            checked={v.slip_approval_required} onChange={(e) => set({ slip_approval_required: e.target.checked })} />
        </div>
        <div className="border-t border-line pt-3">
          <Checkbox label={t('settings.trackOwnLabourJyala')} hint={t('settings.dailyLabourCostFor')}
            disabled={save.isPending} checked={v.labour_module_enabled} onChange={(e) => set({ labour_module_enabled: e.target.checked })} />
          {v.labour_module_enabled && <LabourMode v={v} set={set} busy={save.isPending} />}
        </div>
        <ErrorBanner>{save.error && t('settings.notSavedError', { error: friendlyError(save.error) })}</ErrorBanner>
      </div>
    </Card>
  )
}

/** Day total (the day's cost is typed) or attendance (each worker's in, out and hours). */
function LabourMode({ v, set, busy }: { v: WorkValues; set: (change: Partial<WorkValues>) => void; busy: boolean }) {
  const hhmm = (t: string) => t.slice(0, 5)
  return (
    <div className="mt-2 flex flex-col gap-2 pl-8">
      <span className="text-sm font-medium text-ink">{t('settings.labourBy')}</span>
      <div className="flex gap-1 rounded-lg bg-track p-1" role="radiogroup" aria-label={t('settings.labourBy')}>
        {([['day_total', t('settings.dayTotal')], ['attendance', t('settings.attendance')]] as const).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={v.labour_mode === k} disabled={busy}
            onClick={() => v.labour_mode !== k && set({ labour_mode: k })}
            className={`min-h-11 flex-1 rounded-md px-1 text-sm font-medium ${v.labour_mode === k ? 'bg-surface text-ink shadow-sm' : 'text-subtle'}`}>
            {label}
          </button>
        ))}
      </div>
      <p className="text-sm text-subtle">
        {v.labour_mode === 'attendance'
          ? t('settings.attendanceMarkEachWorker')
          : t('settings.dayTotalTypeThe')}
      </p>
      {v.labour_mode === 'attendance' && (
        <div className="grid grid-cols-3 gap-2">
          <Field label={t('settings.dayStarts')} htmlFor="set-day-start">
            <Input id="set-day-start" type="time" disabled={busy} value={hhmm(v.day_start)}
              onChange={(e) => e.target.value && e.target.value < hhmm(v.day_end) && set({ day_start: e.target.value })} />
          </Field>
          <Field label={t('settings.dayEnds')} htmlFor="set-day-end">
            <Input id="set-day-end" type="time" disabled={busy} value={hhmm(v.day_end)}
              onChange={(e) => e.target.value && e.target.value > hhmm(v.day_start) && set({ day_end: e.target.value })} />
          </Field>
          <Field label={t('settings.paidHours')} htmlFor="set-day-hours">
            <Select id="set-day-hours" disabled={busy} value={v.standard_day_minutes}
              onChange={(e) => set({ standard_day_minutes: Number(e.target.value) })}>
              {[360, 420, 450, 480, 510, 540, 600].map((m) => <option key={m} value={m}>{m / 60} h</option>)}
            </Select>
          </Field>
          <p className="col-span-3 text-xs text-subtle">
            {t('settings.markEveryoneInMarks', { dayStart: hhmm(v.day_start), dayEnd: hhmm(v.day_end), value: v.standard_day_minutes / 60 })}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bills and VAT
// ---------------------------------------------------------------------------
type VatValues = Pick<Tables<'companies'>, 'tax_fields_enabled' | 'vat_treatment' | 'rate_variance_tolerance_pct'>

const VAT_TREATMENTS = [
  ['vat_as_cost', 'settings.vat.cost', 'settings.vat.cost.hint'],
  ['vat_recoverable', 'settings.vat.recoverable', 'settings.vat.recoverable.hint'],
] as const

function BillsVatCard({ company }: { company: Tables<'companies'> }) {
  const queryClient = useQueryClient()
  const [v, setV] = useState<VatValues>({
    tax_fields_enabled: company.tax_fields_enabled, vat_treatment: company.vat_treatment, rate_variance_tolerance_pct: company.rate_variance_tolerance_pct,
  })
  const [saved, setSaved] = useState(false)
  const set = <K extends keyof VatValues>(k: K, value: VatValues[K]) => { setSaved(false); setV({ ...v, [k]: value }) }
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('companies').update(v).eq('id', company.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      setSaved(true)
    },
  })
  const pct = v.rate_variance_tolerance_pct
  // An example a contractor recognises: a bag of cement ordered at Rs 850.
  const example = Math.round(850 * (1 + pct / 100))

  return (
    <Card title={t('settings.billsAndVat')}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate() }} className="flex flex-col gap-4" aria-label={t('settings.billsAndVat')}>
        <Checkbox label={t('settings.vatOnBills')} hint={t('settings.showsTheVatFields')}
          checked={v.tax_fields_enabled} onChange={(e) => set('tax_fields_enabled', e.target.checked)} />
        {v.tax_fields_enabled && (
          <fieldset className="flex flex-col gap-1 pl-8">
            <legend className="mb-1 text-sm font-medium text-ink">{t('settings.vatOnSupplierBills')}</legend>
            {VAT_TREATMENTS.map(([k, label, hint]) => (
              <label key={k} className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
                <input type="radio" name="vat" className="mt-1 size-5 shrink-0 accent-brand" checked={v.vat_treatment === k} onChange={() => set('vat_treatment', k)} />
                <span>
                  <span className="text-sm font-medium text-ink">{t(label)}</span>
                  <span className="block text-sm text-subtle">{t(hint)}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <Field label={t('settings.rateDifferenceWarning')} htmlFor="co-tolerance"
          hint={t('settings.warnWhenABill', { pct, example })}>
          <div className="flex w-32 items-center gap-2">
            <Input id="co-tolerance" type="number" min={0} step="0.5" value={pct}
              onChange={(e) => set('rate_variance_tolerance_pct', Number(e.target.value))} />
            <span aria-hidden className="text-sm text-subtle">%</span>
          </div>
        </Field>
        <SaveRow busy={save.isPending} saved={saved} error={save.error} />
      </form>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Your data
// ---------------------------------------------------------------------------
const LAST_EXPORT_KEY = (companyId: string) => `nk:last-export:${companyId}`

/** Full company export (req §22): every record and photo in one zip, for the owner to keep. */
function ExportCard() {
  const auth = useCompany()
  const [done, setDone] = useState('')
  const [last, setLast] = useState(() => platform.prefs.get(LAST_EXPORT_KEY(auth.companyId)))
  const run = useMutation({
    mutationFn: () => callFunction<Blob>('company-export', { company_id: auth.companyId }),
    onSuccess: (blob) => {
      const today = todayKathmandu()
      const name = `nirmankhata-export-${today}.zip`
      platform.download(blob, name)
      setDone(t('settings.downloadedNameValueMb', { name, value: (blob.size / 1024 / 1024).toFixed(1) }))
      platform.prefs.set(LAST_EXPORT_KEY(auth.companyId), today)
      setLast(today)
    },
  })
  return (
    <Card title={t('settings.yourData')}>
      <p className="text-sm text-subtle">
        {t('settings.oneZipWithA')}</p>
      <p className="mt-2 text-sm text-ink">
        {last ? <>{t('settings.lastDownloadedOnThis', { last: formatDate(last, auth.dateDisplay) })}</> : t('settings.notDownloadedOnThis')}
      </p>
      <div className="mt-3"><Button busy={run.isPending} onClick={() => { setDone(''); run.mutate() }}>{t('settings.downloadExport')}</Button></div>
      <Status>{done && <Notice>{done}</Notice>}</Status>
      <ErrorBanner>{run.error && friendlyError(run.error)}</ErrorBanner>
    </Card>
  )
}
