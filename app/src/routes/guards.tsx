import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { homeFor } from '../components/nav'
import { Button, ErrorBanner, Spinner } from '../components/ui'
import { useNavRole } from '../components/useNavRole'
import { useIsPlatformAdmin } from '../features/platform/api'
import { friendlyError } from '../lib/errors'
import { t } from '../lib/i18n'

export function RequireCompany({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()
  if (auth.loading) return <div className="mx-auto max-w-md px-4"><Spinner /></div>
  // After an expired session, sign-in returns to the page; after "Sign out", the next person starts at home.
  if (!auth.session) return <Navigate to="/login" replace state={auth.signedOut ? undefined : { from: location.pathname }} />
  if (auth.loadError) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <ErrorBanner onRetry={auth.retryLoad}>Could not load your company. {friendlyError(auth.loadError)}</ErrorBanner>
        <Button className="mt-6 w-full" variant="secondary" onClick={() => void auth.signOut()}>{t('nav.signOut')}</Button>
      </div>
    )
  }
  if (!auth.company) return <NoCompany />
  return <>{children}</>
}

/** A login with no active company: a platform admin goes to /platform, anyone else is told why. */
function NoCompany() {
  const auth = useAuth()
  const platform = useIsPlatformAdmin()
  if (platform.loading) return <div className="mx-auto max-w-md px-4"><Spinner /></div>
  if (platform.isPlatformAdmin) return <Navigate to="/platform" replace />
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-lg font-bold text-ink">{t('auth.noCompany')}</h1>
      <p className="mt-2 text-sm text-subtle">{t('auth.noCompanyHelp')}</p>
      <Button className="mt-6" variant="secondary" onClick={() => void auth.signOut()}>{t('nav.signOut')}</Button>
    </div>
  )
}

/** /platform: the server checks every call too; this only keeps other logins off the page. */
export function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const platform = useIsPlatformAdmin()
  if (auth.loading || platform.loading) return <div className="mx-auto max-w-md px-4"><Spinner /></div>
  if (!auth.session) return <Navigate to="/login" replace state={{ from: '/platform' }} />
  if (!platform.isPlatformAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

export function AdminOnly({ children }: { children: ReactNode }) {
  const auth = useAuth()
  if (!auth.isAdmin) return <Navigate to="/projects" replace />
  return <>{children}</>
}

export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const auth = useAuth()
  if (auth.loading) return null
  if (auth.session && auth.company) return <Navigate to="/" replace />
  return <>{children}</>
}

/** "/" lands each person where they start the day (dashboard or projects). */
export function Home() {
  return <Navigate to={homeFor(useNavRole())} replace />
}
