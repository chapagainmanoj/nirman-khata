// First-run checklist for a new company's admin (UX review flow D). Each step ticks itself off
// from real data; the card goes away when all are done, or when the admin hides it.
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Button, Card } from '../../components/ui'
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
  const steps: Array<[boolean, string, string, string]> = [
    [c.suppliers > 0, 'Add your suppliers', 'The shops and dealers you buy from.', '/suppliers'],
    [c.openings > 0, 'Set opening balances', 'What you owed each supplier when you started, from your old khata.', '/suppliers'],
    [c.projects > 0, 'Add your projects', 'Each site, with its contract amount and budget.', '/projects/new'],
    [c.assignments > 0, 'Add staff and assign them', 'Site staff see only the projects they are assigned to.', '/staff'],
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

  return (
    <Card title="Getting started" className="mb-4" actions={<Button variant="ghost" onClick={hide}>Hide</Button>}>
      <ol className="flex flex-col">
        {steps.map(([done, title, hint, to], i) => (
          <li key={title} className="flex items-start gap-3 border-b border-line py-2 last:border-0">
            <span aria-hidden className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-good-soft text-good-ink' : 'bg-muted text-subtle'}`}>
              {done ? '✓' : i + 1}
            </span>
            <div className="min-w-0 text-sm">
              {done ? (
                <span className="text-subtle line-through">{title}</span>
              ) : (
                <Link to={to} className="font-medium text-ink underline underline-offset-4">{title}</Link>
              )}
              <span className="sr-only">{done ? ' (done)' : ''}</span>
              {!done && <div className="text-xs text-subtle">{hint}</div>}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}
