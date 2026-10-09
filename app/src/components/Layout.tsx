import { NavLink, Outlet, useNavigate } from 'react-router'
import { useCompany } from '../auth/AuthProvider'
import { t, type MessageKey } from '../lib/i18n'

type NavItem = { to: string; label: MessageKey; icon: string; show: boolean }

export function Layout() {
  const auth = useCompany()
  const navigate = useNavigate()
  const items: NavItem[] = [
    { to: '/projects', label: 'nav.projects', icon: '▦', show: true },
    { to: '/staff', label: 'nav.staff', icon: '☺', show: auth.isAdmin },
    { to: '/catalog', label: 'nav.catalog', icon: '☰', show: true },
    { to: '/settings', label: 'nav.settings', icon: '⚙', show: true },
  ]
  const visible = items.filter((i) => i.show)

  async function signOut() {
    if (await auth.signOut()) navigate('/login')
  }

  return (
    <div className="min-h-dvh bg-page pb-20 md:pb-0">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-ink">{auth.company.name}</div>
            <div className="truncate text-xs text-subtle">{auth.profile?.full_name}</div>
          </div>
          <nav className="hidden gap-1 md:flex">
            {visible.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand/10 text-brand' : 'text-subtle hover:text-ink'}`
                }
              >
                {t(item.label)}
              </NavLink>
            ))}
          </nav>
          <button onClick={signOut} className="min-h-11 rounded-lg px-3 text-sm font-medium text-subtle hover:text-ink">
            {t('nav.signOut')}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 grid border-t border-line bg-surface md:hidden"
        style={{ gridTemplateColumns: `repeat(${visible.length}, 1fr)`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center text-xs font-medium ${isActive ? 'text-brand' : 'text-subtle'}`
            }
          >
            <span aria-hidden className="text-lg leading-none">{item.icon}</span>
            {t(item.label)}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
