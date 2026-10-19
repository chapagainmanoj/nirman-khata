// Everyone money is owed to, by kind.
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { PageHeader } from '../../components/ui'
import { PARTY, PARTY_KINDS } from '../parties/kinds'
import { t, type MessageKey } from '../../lib/i18n'

const HINT: Record<string, MessageKey> = {
  supplier: 'partiesList.hint.supplier',
  subcontractor: 'partiesList.hint.subcontractor',
  crew: 'partiesList.hint.crew',
  worker: 'partiesList.hint.worker',
}

export function PartiesHubPage() {
  const auth = useCompany()
  // Workers are paid one by one only when the company marks attendance.
  const kinds = PARTY_KINDS.filter((k) => k !== 'payee' && (k !== 'worker' || auth.company.labour_mode === 'attendance'))
  return (
    <>
      <PageHeader title={t('parties.parties')} />
      <ul className="overflow-hidden rounded-xl border border-line bg-surface">
        {/* Other services are reached from Suppliers. */}
        {kinds.map((k) => (
          <li key={k} className="border-b border-line last:border-0">
            <Link to={PARTY[k].path} className="flex min-h-14 flex-col justify-center px-4 py-2 active:bg-muted hover:bg-muted">
              <span className="font-medium text-ink">{PARTY[k].many}</span>
              <span className="text-xs text-subtle">{t(HINT[k])}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
