// Project calendar (req §17): one place to see what happened on a day, by business date
// (acceptance #11). Reports, progress, deliveries and slips for everyone; costs and payments
// with amounts only for those who may see money (the database leaves amounts out otherwise).
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { MonthGrid } from '../../components/MonthGrid'
import { monthDays, monthOf, type MonthRef } from '../../lib/months'
import { Badge, Card, ErrorBanner, Field, PageHeader, Select, Spinner } from '../../components/ui'
import { formatDual, todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { formatNPR } from '../../lib/money'
import { memberName, useMembers, useProjects } from '../projects/api'
import { useCurrentProject } from '../projects/current'
import { type CalendarEvent, useCalendarEvents } from '../site/api'

type Kind = 'all' | 'site' | 'money'
const SITE_KINDS = new Set(['report', 'progress', 'delivery', 'slip', 'slip_sent'])

const MONEY_TONE: Record<string, ['warn' | 'good' | 'info', string]> = {
  cost: ['warn', 'Cost'], payment: ['good', 'Payment'], advance: ['info', 'Advance'], refund: ['info', 'Refund'],
}

/** Where an event opens. Records without a page of their own open on their project. */
function href(e: CalendarEvent): string | null {
  const project = e.project_id ? `/projects/${e.project_id}` : null
  switch (e.link_kind) {
    case 'bill': return `/bills/${e.link_id}`
    case 'payment': return `/payments/${e.link_id}`
    case 'refund': return `/refunds/${e.link_id}`
    case 'slip': return `/slips/${e.link_id}`
    case 'report': return `/daily/${e.link_id}`
    case 'progress': return project && `${project}?tab=site`
    case 'delivery': return project && `${project}?tab=deliveries`
    case 'labour': case 'expense': return project && `${project}?tab=labour`
    case 'charge': return project && `${project}?tab=subcontract`
    default: return project
  }
}

/** "6.5L" or "40K": enough to spot a heavy day in a small cell. */
function short(paisa: number): string {
  const rs = Math.abs(paisa) / 100
  if (rs >= 100_000) return `${(rs / 100_000).toFixed(1).replace(/\.0$/, '')}L`
  if (rs >= 1_000) return `${Math.round(rs / 1_000)}K`
  return String(Math.round(rs))
}

export function CalendarPage() {
  const auth = useCompany()
  const current = useCurrentProject()
  const [params, setParams] = useSearchParams()
  const projects = useProjects(auth.companyId)
  const members = useMembers(auth.companyId)
  const today = todayKathmandu()
  const [selected, setSelected] = useState(today)
  const [month, setMonth] = useState<MonthRef>(() => monthOf(today, auth.dateDisplay))
  const [kind, setKind] = useState<Kind>('all')
  const [party, setParty] = useState('')
  const [staff, setStaff] = useState('')
  const projectId = params.has('project') ? params.get('project') || null : current.projectId
  const days = monthDays(month)
  const events = useCalendarEvents(auth.companyId, days[0], days[days.length - 1], projectId)
  const showMoney = auth.canSeeFinance

  const shown = (events.data ?? []).filter((e) =>
    (kind === 'all' || (kind === 'site') === SITE_KINDS.has(e.kind))
    && (!party || e.party_name === party)
    && (!staff || e.created_by === staff))
  const byDay = new Map<string, CalendarEvent[]>()
  for (const e of shown) byDay.set(e.event_date, [...(byDay.get(e.event_date) ?? []), e])
  const parties = [...new Set((events.data ?? []).map((e) => e.party_name).filter(Boolean))].sort()
  const people = [...new Set((events.data ?? []).map((e) => e.created_by).filter(Boolean))]
  const sum = (list: CalendarEvent[], k: 'cost_paisa' | 'cash_paisa') => list.reduce((s, e) => s + (e[k] ?? 0), 0)
  const dayEvents = (byDay.get(selected) ?? []).sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''))
  const projectName = (id: string | null) => {
    const p = projects.data?.find((x) => x.id === id)
    return p ? `${p.code} · ${p.name}` : ''
  }

  return (
    <>
      <PageHeader title="Calendar" subtitle="What happened each day: site work, deliveries, costs and payments." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field label="Project" htmlFor="cal-project">
          <Select id="cal-project" value={projectId ?? ''} onChange={(e) => setParams({ project: e.target.value }, { replace: true })}>
            <option value="">All projects</option>
            {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </Select>
        </Field>
        <Field label="Show" htmlFor="cal-kind">
          <Select id="cal-kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="all">Everything</option>
            <option value="site">Site work, deliveries, slips</option>
            <option value="money">Costs and payments</option>
          </Select>
        </Field>
        <Field label="Party" htmlFor="cal-party">
          <Select id="cal-party" value={party} onChange={(e) => setParty(e.target.value)}>
            <option value="">Any</option>
            {parties.map((p) => <option key={p} value={p!}>{p}</option>)}
          </Select>
        </Field>
        <Field label="Entered by" htmlFor="cal-staff">
          <Select id="cal-staff" value={staff} onChange={(e) => setStaff(e.target.value)}>
            <option value="">Anyone</option>
            {people.map((u) => <option key={u} value={u!}>{memberName(members.data, u)}</option>)}
          </Select>
        </Field>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <div className="mb-2 flex justify-end">
            <div className="flex gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Calendar">
              {(['bs', 'ad'] as const).map((d) => (
                <button key={d} type="button" role="radio" aria-checked={month.display === d}
                  onClick={() => setMonth(monthOf(selected, d))}
                  className={`min-h-9 rounded-md px-3 text-xs font-semibold ${month.display === d ? 'bg-surface text-ink shadow-sm' : 'text-subtle'}`}>
                  {d.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <MonthGrid month={month} onMonth={setMonth} selected={selected} onSelect={setSelected}
            dayLabel={(iso) => {
              const n = byDay.get(iso)?.length ?? 0
              return `${formatDual(iso, month.display)}${n ? `, ${n} ${n === 1 ? 'entry' : 'entries'}` : ''}`
            }}
            renderDay={(iso) => {
              const list = byDay.get(iso)
              if (!list) return null
              const cost = showMoney ? sum(list, 'cost_paisa') : 0
              const site = list.some((e) => SITE_KINDS.has(e.kind))
              const paid = list.some((e) => e.money === 'payment' || e.money === 'advance' || e.money === 'refund')
              return (
                <>
                  <span aria-hidden className="flex gap-0.5">
                    {site && <span className="size-1.5 rounded-full bg-brand" />}
                    {list.some((e) => e.money === 'cost') && <span className="size-1.5 rounded-full bg-warn" />}
                    {paid && <span className="size-1.5 rounded-full bg-good-ink" />}
                  </span>
                  {cost !== 0 && <span aria-hidden className="hidden text-[10px] leading-none tabular-nums sm:block">{short(cost)}</span>}
                </>
              )
            }} />
          {showMoney && events.data && (
            <p className="mt-3 text-sm text-subtle">
              This month: cost <span className="font-semibold text-ink tabular-nums">{formatNPR(sum(shown, 'cost_paisa'))}</span>,
              paid <span className="font-semibold text-ink tabular-nums">{formatNPR(sum(shown, 'cash_paisa'))}</span>
            </p>
          )}
        </Card>

        <Card title={formatDual(selected, month.display)}>
          {events.isPending && <Spinner />}
          <ErrorBanner onRetry={() => void events.refetch()}>{events.error && friendlyError(events.error)}</ErrorBanner>
          {showMoney && dayEvents.some((e) => e.cost_paisa || e.cash_paisa) && (
            <p className="mb-2 text-sm">
              Cost <span className="font-semibold tabular-nums">{formatNPR(sum(dayEvents, 'cost_paisa'))}</span>
              {' · '}Paid <span className="font-semibold tabular-nums">{formatNPR(sum(dayEvents, 'cash_paisa'))}</span>
            </p>
          )}
          {events.data && dayEvents.length === 0 && <p className="text-sm text-subtle">Nothing recorded on this day.</p>}
          <ul>
            {dayEvents.map((e, i) => {
              const to = href(e)
              const tone = e.money ? MONEY_TONE[e.money] : null
              const body = (
                <>
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span className="min-w-0 text-sm font-medium text-ink">{e.label}</span>
                    {tone && <Badge tone={tone[0]}>{tone[1]}</Badge>}
                  </span>
                  <span className="block text-xs text-subtle">
                    {[e.party_name, e.detail, !projectId && projectName(e.project_id), e.created_by && memberName(members.data, e.created_by)].filter(Boolean).join(' · ')}
                  </span>
                  {(e.cost_paisa || e.cash_paisa) ? (
                    <span className="block text-sm tabular-nums">
                      {e.cost_paisa ? `Cost ${formatNPR(e.cost_paisa)}` : ''}{e.cost_paisa && e.cash_paisa ? ' · ' : ''}{e.cash_paisa ? (e.cash_paisa < 0 ? `Received back ${formatNPR(-e.cash_paisa)}` : `Paid ${formatNPR(e.cash_paisa)}`) : ''}
                    </span>
                  ) : null}
                </>
              )
              return (
                <li key={`${e.kind}-${e.link_id}-${e.project_id}-${i}`} className="border-b border-line last:border-0">
                  {to ? <Link to={to} className="block min-h-11 py-2 hover:bg-muted">{body}</Link> : <div className="py-2">{body}</div>}
                </li>
              )
            })}
          </ul>
        </Card>
      </div>
    </>
  )
}
