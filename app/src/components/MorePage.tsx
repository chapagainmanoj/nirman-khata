// Phone-only menu: every section not in the bottom bar, grouped like the desktop sidebar,
// then notifications and the account (sign out).
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { useCompany } from '../auth/AuthProvider'
import { t } from '../lib/i18n'
import { ROLE_LABELS } from '../lib/labels'
import { useIsPlatformAdmin } from '../features/platform/api'
import { useNavRole } from './useNavRole'
import { phoneBarFor, sectionsFor } from './nav'
import { PageHeader } from './ui'

const rowClass = 'flex min-h-14 items-center px-4 font-medium text-ink active:bg-muted'

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      {title && <h2 className="mb-1 px-1 text-xs font-semibold tracking-wide text-subtle uppercase">{title}</h2>}
      <ul className="overflow-hidden rounded-xl border border-line bg-surface">{children}</ul>
    </section>
  )
}

export function MorePage() {
  const auth = useCompany()
  const role = useNavRole()
  const navigate = useNavigate()
  const bar = phoneBarFor(role)
  const groups = sectionsFor(role)
    .map((g) => ({ ...g, items: g.items.filter((i) => !bar.includes(i.key)) }))
  const roles = auth.membership?.roles.map((r) => ROLE_LABELS[r]).join(', ')
  const { isPlatformAdmin } = useIsPlatformAdmin()

  return (
    <>
      <PageHeader title={t('nav.more')} />
      {groups.map((g) => g.items.length > 0 && (
        <Group key={g.key} title={g.label ? t(g.label) : undefined}>
          {g.items.map((i) => (
            <li key={i.key} className="border-b border-line last:border-0"><Link to={i.to} className={rowClass}>{t(i.label)}</Link></li>
          ))}
        </Group>
      ))}
      <Group title={t('nav.account')}>
        <li className="border-b border-line"><Link to="/how-to-use" className={rowClass}>{t('nav.help')}</Link></li>
        <li className="border-b border-line"><Link to="/notifications" className={rowClass}>{t('nav.notifications')}</Link></li>
        {isPlatformAdmin && <li className="border-b border-line"><Link to="/platform" className={rowClass}>{t('nav.platform')}</Link></li>}
        <li className="border-b border-line px-4 py-3 text-sm">
          <div className="font-medium text-ink">{auth.profile?.full_name}</div>
          <div className="text-xs text-subtle">{auth.company.name} · {roles}</div>
        </li>
        <li>
          <button type="button" className={`${rowClass} w-full text-left`}
            onClick={async () => { if (await auth.signOut()) navigate('/login') }}>
            {t('nav.signOut')}
          </button>
        </li>
      </Group>
    </>
  )
}
