// Search and date filter for long lists (deliveries, order slips, payments), plus one optional
// pick-list (who a payment went to). Kept in the URL, so coming back from a record keeps the search;
// typing waits a moment before asking the server.
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateInput } from '../../components/DateInput'
import { Field, Input, Select } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { isPeriod, periodLabel, periodRange, PERIODS, type DateRange, type Period } from '../../lib/periods'
import { searchTerm } from '../../lib/search'
import { useSuppliers } from '../supply/api'

const WAIT_MS = 400

export type ListSearch = DateRange & { search?: string; supplierMatch?: string[] }

/** A pick-list beside "When": `param` in the URL, `any` the label for no choice. */
export type ListChoice = { param: string; label: string; any: string; options: Array<[value: string, label: string]> }

export function useListFilters({ placeholder, choice }: { placeholder: string; choice?: ListChoice }) {
  const auth = useCompany()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const when: Period = isPeriod(params.get('when')) ? (params.get('when') as Period) : 'any'
  const chosen = choice && choice.options.some(([v]) => v === params.get(choice.param)) ? params.get(choice.param) : null
  const [typed, setTyped] = useState(q)
  const today = todayKathmandu()

  // One URL change per pause in typing, replacing the entry so Back leaves the list. Restarted on
  // every URL change: a timer from before "When" changed would write the old params back.
  useEffect(() => {
    if (typed.trim() === q) return
    const timer = setTimeout(() => set({ q: typed.trim() || null }), WAIT_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `set` is new with every `params`
  }, [typed, q, params])

  function set(changes: Record<string, string | null>) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v)
        else next.delete(k)
      }
      return next
    }, { replace: true })
  }

  // A supplier name matches through the suppliers already on the phone, so one request finds
  // a challan or slip number and a supplier's records together.
  const suppliers = useSuppliers(auth.companyId)
  const term = searchTerm(q)
  const filter = useMemo<ListSearch>(() => {
    const needle = term.toLowerCase()
    const supplierMatch = needle ? (suppliers.data ?? []).filter((s) => s.name.toLowerCase().includes(needle)).map((s) => s.id) : []
    const range = periodRange(when, today, auth.dateDisplay, { from: params.get('from') ?? undefined, to: params.get('to') ?? undefined })
    return { ...range, ...(term ? { search: term, supplierMatch } : {}) }
  }, [term, suppliers.data, when, today, auth.dateDisplay, params])

  const active = !!(filter.search || filter.from || filter.to || chosen)
  const clear = () => { setTyped(''); set({ q: null, when: null, from: null, to: null, ...(choice ? { [choice.param]: null } : {}) }) }

  const bar = (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input type="search" aria-label={t('filter.search')} placeholder={placeholder} value={typed} className="sm:flex-1"
          onChange={(e) => setTyped(e.target.value)} />
        <Select aria-label={t('filter.when')} value={when} className="sm:w-64"
          onChange={(e) => set({ when: e.target.value === 'any' ? null : e.target.value, ...(e.target.value === 'custom' ? {} : { from: null, to: null }) })}>
          {PERIODS.map((p) => <option key={p} value={p}>{periodLabel(p, today, auth.dateDisplay)}</option>)}
        </Select>
        {choice && (
          <Select aria-label={choice.label} value={chosen ?? ''} className="sm:w-48" onChange={(e) => set({ [choice.param]: e.target.value || null })}>
            <option value="">{choice.any}</option>
            {choice.options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </Select>
        )}
      </div>
      {when === 'custom' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label={t('filter.from')} htmlFor="list-from">
            <DateInput id="list-from" allowEmpty value={params.get('from') ?? ''} onChange={(v) => set({ from: v || null })} display={auth.dateDisplay} />
          </Field>
          <Field label={t('filter.to')} htmlFor="list-to">
            <DateInput id="list-to" allowEmpty value={params.get('to') ?? ''} onChange={(v) => set({ to: v || null })} display={auth.dateDisplay} />
          </Field>
        </div>
      )}
    </div>
  )

  /** Empty-list text when the filters hid everything, with the way out. */
  const noMatch = (what: string) => (
    <p className="text-sm text-subtle">
      {t('filter.noMatch', {
        what,
        search: filter.search ? t('filter.noMatch.search', { search: filter.search }) : '',
        dates: filter.from || filter.to ? t('filter.noMatch.dates') : '',
        choice: chosen ? ` (${choice?.options.find(([v]) => v === chosen)?.[1]})` : '',
      })}{' '}
      <button type="button" onClick={clear} className="inline-flex min-h-11 items-center font-medium text-slate underline underline-offset-4 [@media(pointer:fine)]:min-h-0">{t('filter.clear')}</button>
    </p>
  )

  return { filter, chosen, active, bar, noMatch, clear }
}
