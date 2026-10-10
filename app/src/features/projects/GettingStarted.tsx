// First-run checklist for a new company's admin (UX review flow D). Each step ticks itself off
// from real data; the card goes away when all are done, or when the admin hides it.
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Button, ButtonLink, Card } from '../../components/ui'
import { supabase } from '../../lib/supabase'

const hiddenKey = (companyId: string) => `getting-started-hidden:${companyId}`

function readHidden(companyId: string) {
  try {
    return localStorage.getItem(hiddenKey(companyId)) === '1'
  } catch {
    return false
  }
}

export function GettingStarted() {
  const auth = useCompany()
  const [hidden, setHidden] = useState(() => readHidden(auth.companyId))
  const counts = useQuery({
    queryKey: ['getting-started', auth.companyId],
    enabled: auth.isAdmin && !hidden,
    queryFn: async () => {
      const count = async (table: 'suppliers' | 'party_opening_balances' | 'projects' | 'project_assignments') => {
        const { count: n, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('company_id', auth.companyId)
        if (error) throw error
        return n ?? 0
      }
      const [suppliers, openings, projects, assignments] = await Promise.all([
        count('suppliers'), count('party_opening_balances'), count('projects'), count('project_assignments'),
      ])
      return { suppliers, openings, projects, assignments }
    },
  })

  if (!auth.isAdmin || hidden || !counts.data) return null
  const c = counts.data
  const steps: Array<[boolean, string, string, string, string]> = [
    [c.suppliers > 0, 'Add your suppliers', 'The shops and dealers you buy from.', '/suppliers', 'Add suppliers'],
    [c.openings > 0, 'Set opening balances', 'What you owed each supplier when you started, from your old khata.', '/suppliers', 'Set balances'],
    [c.projects > 0, 'Add your projects', 'Each site, with its contract amount and budget.', '/projects/new', 'Add a project'],
    [c.assignments > 0, 'Add staff and assign them', 'Site staff see only the projects they are assigned to.', '/staff', 'Add staff'],
  ]
  if (steps.every(([done]) => done)) return null

  function hide() {
    try {
      localStorage.setItem(hiddenKey(auth.companyId), '1')
    } catch {
      // Private mode: hidden for this visit only.
    }
    setHidden(true)
  }

  // Done steps fold into a count; the next step leads with a button, later ones are links.
  const done = steps.filter(([d]) => d).length
  const todo = steps.filter(([d]) => !d)
  return (
    <Card title={`Getting started · ${done} of ${steps.length} done`} className="mb-4" actions={<Button variant="ghost" onClick={hide}>Hide</Button>}>
      <ol className="flex flex-col">
        {todo.map(([, title, hint, to, action], i) => (
          <li key={title} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-2 last:border-0">
            <div className="min-w-0 text-sm">
              <div className="font-medium text-ink">{title}</div>
              <div className="text-xs text-subtle">{hint}</div>
            </div>
            {i === 0
              ? <ButtonLink to={to}>{action}</ButtonLink>
              : <Link to={to} className="inline-flex min-h-11 items-center text-sm font-medium text-brand underline underline-offset-4">{action}</Link>}
          </li>
        ))}
      </ol>
    </Card>
  )
}
