// App frame (UX review, nav). Sections come from nav.ts, grouped by job.
//   desktop (lg+): sidebar with the brand (home), "+ Record", current project, sections and
//     counts, then the account and bell at the foot
//   tablet (md-lg): top bar with the brand mark, main sections, "+ Record", setup, bell; account below
//   phone: slim header (brand, bell) and a bottom bar chosen by role, with "+" in the centre;
//     the account lives in More
import { Suspense, useEffect, useRef, type ComponentType } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useCompany } from '../auth/AuthProvider'
import { PhotosWaitingNotice } from '../features/photos/WaitingPhotosPage'
import { CurrentProjectProvider } from '../features/projects/current'
import { t } from '../lib/i18n'
import {
  BellIcon, BillIcon, CalendarIcon, CatalogIcon, DashboardIcon, DeliveryIcon, MoreIcon, PartiesIcon, PaymentIcon, ProjectsIcon, ReportIcon, SettingsIcon, SlipIcon, StaffIcon,
} from './icons'
import { CompanyMark } from './CompanyMark'
import { AccountMenu, ProjectSwitcher, RecordMenu, RecordSheetButton, SetupMenu } from './menus'
import { activeSection, navItem, phoneBarFor, recordActionsFor, sectionsFor, type NavKey } from './nav'
import { useNavCounts, useUnreadCount } from './navCounts'
import { Spinner } from './ui'
import { useNavRole } from './useNavRole'

const ICONS: Record<NavKey, ComponentType> = {
  dashboard: DashboardIcon, projects: ProjectsIcon, calendar: CalendarIcon, reports: ReportIcon, slips: SlipIcon, deliveries: DeliveryIcon, bills: BillIcon, payments: PaymentIcon,
  parties: PartiesIcon, staff: StaffIcon, catalog: CatalogIcon, settings: SettingsIcon,
}

/** Work waiting, in the accent: something to act on. */
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
  const onNotifications = pathname.startsWith('/notifications')
  const moreActive = pathname.startsWith('/more') || onNotifications || (active !== null && !bar.includes(active))
  // Tablet: keep the current section in view when the link strip has scrolled.
  const strip = useRef<HTMLElement>(null)
  useEffect(() => {
    strip.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])
  const bellLabel = unread ? `${t('nav.notifications')}, ${unread} new` : t('nav.notifications')

  const sideLink = (key: NavKey) => {
    const item = navItem(key)
    const Icon = ICONS[key]
    const n = counts[key]
    return (
      <NavLink key={key} to={item.to} aria-current={active === key ? 'page' : undefined}
        className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium [@media(pointer:fine)]:min-h-9 ${active === key ? 'bg-brand-soft text-brand-dark' : 'text-subtle hover:bg-muted hover:text-ink'}`}>
        <Icon />{t(item.label)}<Count n={n} label={countLabel(key, n ?? 0)} />
      </NavLink>
    )
  }

  const bell = (
    <Link to="/notifications" aria-label={bellLabel} aria-current={onNotifications ? 'page' : undefined}
      className={`relative inline-flex size-11 shrink-0 items-center justify-center rounded-lg ${onNotifications ? 'bg-brand-soft text-brand-dark' : 'text-subtle hover:bg-muted hover:text-ink'}`}>
      <BellIcon />
      {unread > 0 && (
        <span className="absolute top-1.5 right-1.5 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] leading-4 font-bold text-white">{unread}</span>
      )}
    </Link>
  )

  return (
    <div className="min-h-dvh bg-page pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0 lg:flex print:bg-white print:pb-0">
      {/* Desktop sidebar */}
      {/* Only the section list scrolls, so the menus at the top and the account menu at the foot can
          open past it. Rows are shorter with a mouse so the whole list fits a laptop screen. */}
      <aside className="sticky top-0 z-30 hidden h-dvh print:hidden w-64 shrink-0 flex-col gap-3 border-r border-line bg-side p-3 lg:flex">
        <Brand name={auth.company.name} logoPath={auth.company.logo_path} />
        <RecordMenu role={role} />
        <ProjectSwitcher />
        <div className="scroll-shadows -mx-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3">
          <nav aria-label="Main" className="flex flex-col gap-3">
            {work.map((g) => (
              <div key={g.key}>
                <div className="px-3 pb-0.5 text-xs font-semibold tracking-wide text-subtle uppercase">{t(g.label)}</div>
                <div className="flex flex-col gap-0.5">{g.items.map((i) => sideLink(i.key))}</div>
              </div>
            ))}
          </nav>
          {setup && <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-3">{setup.items.map((i) => sideLink(i.key))}</div>}
        </div>
        <div className="flex items-center gap-1 border-t border-line pt-3">
          <div className="min-w-0 flex-1"><AccountMenu up /></div>
          {bell}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Phone and tablet header */}
        <header className="sticky top-0 z-20 border-b border-line bg-surface lg:hidden print:hidden [@media(max-height:500px)]:static">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-2 md:px-4">
            <Brand name={auth.company.name} logoPath={auth.company.logo_path} className="min-w-0 flex-1 md:hidden" />
            <Brand name={auth.company.name} logoPath={auth.company.logo_path} markOnly className="hidden md:inline-flex" />
            {/* Nine sections can be wider than a tablet: the links scroll, the buttons on the right stay. */}
            <nav ref={strip} aria-label="Main" className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] md:flex">
              {work.flatMap((g) => g.items).map((i) => (
                <NavLink key={i.key} to={i.to} aria-current={active === i.key ? 'page' : undefined}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium ${active === i.key ? 'bg-brand-soft text-brand-dark' : 'text-subtle hover:bg-muted hover:text-ink'}`}>
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
          <PhotosWaitingNotice />
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

/** The app mark and company name: the way home (dashboard or projects, by role, via "/"). */
function Brand({ name, logoPath, markOnly, className }: { name: string; logoPath: string | null; markOnly?: boolean; className?: string }) {
  return (
    <Link to="/" aria-label={`${name}, ${t('nav.home')}`}
      className={`flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg px-1.5 hover:bg-muted ${className ?? ''}`}>
      <CompanyMark logoPath={logoPath} size={28} className="shrink-0" />
      {!markOnly && <span className="min-w-0 truncate text-sm font-bold text-ink">{name}</span>}
    </Link>
  )
}

function BarLink({ navKey, active, count }: { navKey: NavKey; active: boolean; count?: number }) {
  const item = navItem(navKey)
  const Icon = ICONS[navKey]
  return (
    <NavLink to={item.to} aria-current={active ? 'page' : undefined}
      className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium active:bg-muted ${active ? 'font-semibold text-brand' : 'text-subtle'}`}>
      <Icon />{t(item.short ?? item.label)}
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
