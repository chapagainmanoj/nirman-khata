import type { ReactNode } from 'react'
import { t } from '../../lib/i18n'

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-start justify-center bg-page px-4 pt-16">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-brand">{t('app.name')}</div>
          <div className="text-sm text-subtle">Construction site and cost register</div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-5">
          <h1 className="mb-4 text-lg font-bold text-ink">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  )
}
