// Phone-only menu for the sections that do not fit in the bottom bar.
import { Link } from 'react-router'
import { useCompany } from '../auth/AuthProvider'
import { t, type MessageKey } from '../lib/i18n'
import { PageHeader } from './ui'

export function MorePage() {
  const auth = useCompany()
  const links: Array<[string, MessageKey, boolean]> = [
    ['/notifications', 'nav.notifications', true],
    ['/staff', 'nav.staff', auth.isAdmin],
    ['/catalog', 'nav.catalog', true],
    ['/settings', 'nav.settings', true],
  ]
  return (
    <>
      <PageHeader title={t('nav.more')} />
      <ul className="overflow-hidden rounded-xl border border-line bg-surface">
        {links.filter(([, , show]) => show).map(([to, label]) => (
          <li key={to} className="border-b border-line last:border-0">
            <Link to={to} className="flex min-h-14 items-center px-4 font-medium text-ink active:bg-muted">{t(label)}</Link>
          </li>
        ))}
      </ul>
    </>
  )
}
