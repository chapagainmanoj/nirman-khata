// A screen that fails to load or crashes shows a way on instead of a white page with no menu.
// On site the usual cause is a weak network when a screen's code is fetched for the first time,
// or an app update that replaced the code an open tab was about to fetch: a reload gets the
// current files. Drafts are on the device, so nothing typed is lost.
import { Component, type ReactNode } from 'react'
import { t } from '../lib/i18n'
import { platform } from '../platform'
import { Button } from './ui'

/** The screen's code did not arrive (Chrome, Safari and Firefox word it differently). */
export function isLoadFailure(error: unknown): boolean {
  const message = (error as { message?: string } | null)?.message ?? String(error)
  return /dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(message)
}

/** Keyed by the page's path where it is used, so going to another page clears the error. */
export class PageBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    const load = isLoadFailure(this.state.error)
    return (
      <div role="alert" className="rounded-xl border border-line bg-surface p-4">
        <h1 className="text-base font-semibold text-ink">{t(load ? 'boundary.load.title' : 'boundary.crash.title')}</h1>
        <p className="mt-1 text-sm text-subtle">{t(load ? 'boundary.load.body' : 'boundary.crash.body')}</p>
        <Button className="mt-3" onClick={() => platform.reload()}>{t('boundary.reload')}</Button>
      </div>
    )
  }
}
