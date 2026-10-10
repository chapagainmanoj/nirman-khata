// Everyone money is owed to, by kind.
import { Link } from 'react-router'
import { PageHeader } from '../../components/ui'
import { PARTY, PARTY_KINDS } from '../parties/kinds'

const HINT: Record<string, string> = {
  supplier: 'Shops and dealers: slips, deliveries, bills',
  subcontractor: 'Thekedars: work packages and claims',
  crew: 'Labour crews: daily and piece-rate wages',
  payee: 'Anyone else paid for site expenses',
}

export function PartiesHubPage() {
  return (
    <>
      <PageHeader title="Parties" />
      <ul className="overflow-hidden rounded-xl border border-line bg-surface">
        {PARTY_KINDS.map((k) => (
          <li key={k} className="border-b border-line last:border-0">
            <Link to={PARTY[k].path} className="flex min-h-14 flex-col justify-center px-4 py-2 active:bg-muted hover:bg-muted">
              <span className="font-medium text-ink">{PARTY[k].many}</span>
              <span className="text-xs text-subtle">{HINT[k]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
