import type { ComponentType } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { useCompany } from '../auth/AuthProvider'
import { t, type MessageKey } from '../lib/i18n'
import { useUnreadCount } from '../features/notifications/NotificationsPage'
import { BellIcon, CatalogIcon, MoreIcon, ProjectsIcon, SettingsIcon, SlipIcon, StaffIcon, SupplierIcon } from './icons'

// phone: shown in the bottom bar; the rest are under More on phones.
type NavItem = { to: string; label: MessageKey; icon: ComponentType; show: boolean; phone: boolean }

export function Layout() {
  const auth = useCompany()
  const navigate = useNavigate()
  const items: NavItem[] = [
    { to: '/projects', label: 'nav.projects', icon: ProjectsIcon, show: true, phone: true },
    { to: '/slips', label: 'nav.slips', icon: SlipIcon, show: true, phone: true },
    { to: '/suppliers', label: 'nav.suppliers', icon: SupplierIcon, show: true, phone: true },
    { to: '/staff', label: 'nav.staff', icon: StaffIcon, show: auth.isAdmin, phone: false },
    { to: '/catalog', label: 'nav.catalog', icon: CatalogIcon, show: true, phone: false },
    { to: '/settings', label: 'nav.settings', icon: SettingsIcon, show: true, phone: false },
    { to: '/more', label: 'nav.more', icon: MoreIcon, show: true, phone: true },
  ]
  const visible = items.filter((i) => i.show && i.to !== '/more')
  const phoneItems = items.filter((i) => i.show && i.phone)
  const unread = useUnreadCount(auth.userId).data ?? 0

  async function signOut() {
    if (await auth.signOut()) navigate('/login')
  }

  return (
    <div className="min-h-dvh bg-page pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-10 border-b border-line bg-surface [@media(max-height:500px)]:static">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-ink">{auth.company.name}</div>
            <div className="truncate text-xs text-subtle">{auth.profile?.full_name}</div>
          </div>
          <nav className="hidden gap-1 md:flex">
            {visible.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium ${isActive ? 'bg-brand-soft text-brand-dark' : 'text-subtle hover:text-ink'}`
                }
              >
                {t(item.label)}
              </NavLink>
            ))}
          </nav>
          <Link to="/notifications" className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-subtle hover:text-ink"
            aria-label={unread ? `${t('nav.notifications')}, ${unread} new` : t('nav.notifications')}>
            <BellIcon />
            {unread > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] leading-4 font-bold text-white">{unread}</span>
            )}
          </Link>
          <button onClick={signOut} className="min-h-11 shrink-0 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-subtle hover:text-ink">
            {t('nav.signOut')}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 grid border-t border-line bg-surface md:hidden"
        style={{ gridTemplateColumns: `repeat(${phoneItems.length}, 1fr)`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {phoneItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium active:bg-muted ${isActive ? 'font-semibold text-brand' : 'text-subtle'}`
            }
          >
            <item.icon />
            {t(item.label)}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
