// App frame (UX review, nav). Sections come from nav.ts, grouped by job.
//   desktop (lg+): sidebar with account, "+ Record", current project, sections and counts
//   tablet (md-lg): top bar with the main sections, "+ Record", setup, bell, account
//   phone: slim header and a bottom bar chosen by role, with "+" in the centre
import { Suspense, type ComponentType } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useCompany } from '../auth/AuthProvider'
import { CurrentProjectProvider } from '../features/projects/current'
import { t } from '../lib/i18n'
import {
  BellIcon, BillIcon, CalendarIcon, CatalogIcon, DashboardIcon, DeliveryIcon, MoreIcon, PaymentIcon, ProjectsIcon, ReportIcon, SettingsIcon, SlipIcon, StaffIcon, SupplierIcon,
} from './icons'
import { AccountMenu, ProjectSwitcher, RecordMenu, RecordSheetButton, SetupMenu } from './menus'
import { activeSection, navItem, phoneBarFor, recordActionsFor, sectionsFor, type NavKey } from './nav'
import { useNavCounts, useUnreadCount } from './navCounts'
import { Spinner } from './ui'
import { useNavRole } from './useNavRole'

const ICONS: Record<NavKey, ComponentType> = {
  dashboard: DashboardIcon, projects: ProjectsIcon, calendar: CalendarIcon, reports: ReportIcon, slips: SlipIcon, deliveries: DeliveryIcon, bills: BillIcon, payments: PaymentIcon,
  parties: SupplierIcon, staff: StaffIcon, catalog: CatalogIcon, settings: SettingsIcon,
}

function Count({ n, label }: { n?: number; label: string }) {
  if (!n) return null
  return (
    <span className="ml-auto min-w-5 rounded-full bg-brand px-1.5 text-center text-[11px] leading-5 font-bold text-white" aria-label={label}>
      {n}
    </span>
  )
}

const countLabel = (key: NavKey, n: number) => (key === 'bills' ? `${n} to post` : key === 'slips' ? `${n} to approve` : `${n}`)

export function Layout() {
  return (
    <CurrentProjectProvider>
      <Frame />
    </CurrentProjectProvider>
  )
}

function Frame() {
  const auth = useCompany()
  const role = useNavRole()
  const { pathname } = useLocation()
  const active = activeSection(pathname)
  const groups = sectionsFor(role)
  const counts = useNavCounts(auth.companyId, role)
  const unread = useUnreadCount(auth.userId).data ?? 0
  const work = groups.filter((g) => g.key !== 'setup')
  const setup = groups.find((g) => g.key === 'setup')
  const bar = phoneBarFor(role)
  const hasRecord = recordActionsFor(role).length > 0
  const moreActive = pathname.startsWith('/more') || pathname.startsWith('/notifications') || (active !== null && !bar.includes(active))
  const bellLabel = unread ? `${t('nav.notifications')}, ${unread} new` : t('nav.notifications')

  const sideLink = (key: NavKey) => {
    const item = navItem(key)
    const Icon = ICONS[key]
    const n = counts[key]
    return (
      <NavLink key={key} to={item.to} aria-current={active === key ? 'page' : undefined}
        className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${active === key ? 'bg-brand-soft text-brand-dark' : 'text-subtle hover:bg-muted hover:text-ink'}`}>
        <Icon />{t(item.label)}<Count n={n} label={countLabel(key, n ?? 0)} />
      </NavLink>
    )
  }

  const bell = (
    <Link to="/notifications" aria-label={bellLabel}
      className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-subtle hover:bg-muted hover:text-ink">
      <BellIcon />
      {unread > 0 && (
        <span className="absolute top-1.5 right-1.5 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] leading-4 font-bold text-white">{unread}</span>
      )}
    </Link>
  )

  return (
    <div className="min-h-dvh bg-page pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0 lg:flex print:bg-white print:pb-0">
      {/* Desktop sidebar */}
      {/* Only the section list scrolls, so the menus at the top can open past the sidebar's edge. */}
      <aside className="sticky top-0 z-30 hidden h-dvh print:hidden w-64 shrink-0 flex-col gap-3 border-r border-line bg-surface p-3 lg:flex">
        <AccountMenu />
        <RecordMenu role={role} />
        <ProjectSwitcher />
        <div className="-mx-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3">
        <nav aria-label="Main" className="flex flex-col gap-4">
          {work.map((g) => (
            <div key={g.key}>
              <div className="px-3 pb-1 text-xs font-semibold tracking-wide text-subtle uppercase">{t(g.label)}</div>
              <div className="flex flex-col gap-0.5">{g.items.map((i) => sideLink(i.key))}</div>
            </div>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-3">
          {setup?.items.map((i) => sideLink(i.key))}
          <NavLink to="/notifications" aria-label={bellLabel}
            className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${pathname.startsWith('/notifications') ? 'bg-brand-soft text-brand-dark' : 'text-subtle hover:bg-muted hover:text-ink'}`}>
            <BellIcon />{t('nav.notifications')}<Count n={unread} label={`${unread} new`} />
          </NavLink>
        </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Phone and tablet header */}
        <header className="sticky top-0 z-20 border-b border-line bg-surface lg:hidden print:hidden [@media(max-height:500px)]:static">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-2 md:px-4">
            <div className="min-w-0 flex-1 md:hidden"><AccountMenu /></div>
            <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
              {work.flatMap((g) => g.items).map((i) => (
                <NavLink key={i.key} to={i.to} aria-current={active === i.key ? 'page' : undefined}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium ${active === i.key ? 'bg-brand-soft text-brand-dark' : 'text-subtle hover:text-ink'}`}>
                  {t(i.label)}<Count n={counts[i.key]} label={countLabel(i.key, counts[i.key] ?? 0)} />
                </NavLink>
              ))}
            </nav>
            <div className="hidden md:block"><RecordMenu role={role} className="w-auto" alignRight /></div>
            <div className="hidden md:block"><SetupMenu role={role} icon={<SettingsIcon />} /></div>
            {bell}
          </div>
          <ProjectBar />
        </header>

        <main className="mx-auto max-w-5xl px-4 py-5 lg:px-8">
          <Suspense fallback={<Spinner />}><Outlet /></Suspense>
        </main>
      </div>

      {/* Phone bottom bar */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface md:hidden print:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {bar.slice(0, 2).map((key) => <BarLink key={key} navKey={key} active={active === key} count={counts[key]} />)}
        {hasRecord ? <RecordSheetButton role={role} /> : <span aria-hidden />}
        <BarLink navKey={bar[2]} active={active === bar[2]} count={counts[bar[2]]} />
        <NavLink to="/more" aria-current={moreActive ? 'page' : undefined}
          className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium active:bg-muted ${moreActive ? 'font-semibold text-brand' : 'text-subtle'}`}>
          <MoreIcon />{t('nav.more')}
        </NavLink>
      </nav>
    </div>
  )
}

function BarLink({ navKey, active, count }: { navKey: NavKey; active: boolean; count?: number }) {
  const item = navItem(navKey)
  const Icon = ICONS[navKey]
  return (
    <NavLink to={item.to} aria-current={active ? 'page' : undefined}
      className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium active:bg-muted ${active ? 'font-semibold text-brand' : 'text-subtle'}`}>
      <Icon />{t(item.label)}
      {!!count && (
        <span className="absolute top-1 left-1/2 ml-2 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] leading-4 font-bold text-white"
          aria-label={countLabel(navKey, count)}>{count}</span>
      )}
    </NavLink>
  )
}

/**
 * Second header row. Phone: the current project, only when there is a choice.
 * Tablet: the project switcher and the account menu (the first row is full of sections).
 */
function ProjectBar() {
  return (
    <div className="mx-auto flex max-w-5xl items-center gap-2 px-2 md:px-4">
      <div className="min-w-0 flex-1 pb-2 empty:hidden md:max-w-sm"><ProjectSwitcher caption="md" /></div>
      <div className="ml-auto hidden w-56 shrink-0 pb-2 md:block"><AccountMenu alignRight /></div>
    </div>
  )
}
