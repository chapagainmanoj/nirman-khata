// The list of reports (req §18.3). Money reports only for people who may see amounts;
// the labour report only when the company tracks own labour.
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { PageHeader } from '../../components/ui'
import { type ReportDef, visibleReports } from './defs'

export function ReportsPage() {
  const auth = useCompany()
  const list = visibleReports(auth)
  const groups: Array<[ReportDef['group'], string]> = [['money', 'Money'], ['site', 'Site work']]

  return (
    <>
      <PageHeader title="Reports" subtitle="Filter by date, project or party; export to Excel or print." />
      {groups.map(([g, title]) => {
        const items = list.filter((r) => r.group === g)
        if (!items.length) return null
        return (
          <section key={g} className="mb-6">
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">{title}</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {items.map((r) => (
                <li key={r.key}>
                  <Link to={`/reports/${r.key}`} className="block h-full rounded-xl border border-line bg-surface p-4 hover:border-slate">
                    <span className="block font-semibold text-ink">{r.title}</span>
                    <span className="mt-1 block text-sm text-subtle">{r.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </>
  )
}
