// Self-service password reset by email (req §22, §25). Phone logins have no mailbox, so they
// still go through their admin. The emails need an SMTP sender in production; until one is set,
// the build leaves VITE_EMAIL_RESET off and these pages are not linked (product owner, 2026-10-10).
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button, ErrorBanner, Field, Input, Notice, Spinner } from '../../components/ui'
import { t } from '../../lib/i18n'
import { parseLoginId } from '../../lib/login-id'
import { supabase } from '../../lib/supabase'
import { AuthShell } from './AuthShell'

export const EMAIL_RESET = import.meta.env.VITE_EMAIL_RESET === 'true'
const MIN_PASSWORD = 8

export function ForgotPasswordPage() {
  const [login, setLogin] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const id = parseLoginId(login)
    if (!id) return setError(t('passwordResetPages.enterTheEmailYou'))
    if (id.kind === 'phone') return setError(t('passwordResetPages.youSignInWith'))
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(id.email, { redirectTo: `${window.location.origin}/reset` })
    setBusy(false)
    // Same answer whether or not the email has a login, so this page cannot be used to find accounts.
    if (error && (error.status === undefined || error.status === 0)) return setError(t('passwordResetPages.couldNotSendCheck'))
    setSent(true)
  }

  return (
    <AuthShell title={t('passwordResetPages.resetYourPassword')}>
      {sent ? (
        <div className="flex flex-col gap-4">
          <Notice>{t('passwordResetPages.ifThisEmailHas')}</Notice>
          <Link to="/login" className="flex min-h-11 items-center justify-center text-sm font-medium text-brand">{t('passwordResetPages.backToSignIn')}</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-sm text-subtle">{t('passwordResetPages.forLoginsWithAn')}</p>
          <Field label={t('passwordResetPages.email')} htmlFor="forgot-email">
            <Input id="forgot-email" inputMode="email" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
          </Field>
          <ErrorBanner>{error}</ErrorBanner>
          <Button type="submit" busy={busy}>{t('passwordResetPages.sendResetLink')}</Button>
          <Link to="/login" className="flex min-h-11 items-center justify-center text-sm font-medium text-slate">{t('auth.login')}</Link>
        </form>
      )}
    </AuthShell>
  )
}

/** Opened from the email link: the link signs the person in for this one change. */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState<'wait' | 'yes' | 'no'>('wait')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady('yes')
    })
    // The link's token is read from the URL on load; give it a moment before saying it failed.
    const timer = setTimeout(async () => {
      const { data: s } = await supabase.auth.getSession()
      setReady((r) => (r === 'yes' || s.session ? 'yes' : 'no'))
    }, 1500)
    return () => { data.subscription.unsubscribe(); clearTimeout(timer) }
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < MIN_PASSWORD) return setError(t('passwordResetPages.passwordMustBeAt', { minPassword: MIN_PASSWORD }))
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(error.message.includes('different') ? t('passwordResetPages.chooseAPasswordDifferent') : t('passwordResetPages.couldNotSaveAsk'))
    navigate('/', { replace: true })
  }

  return (
    <AuthShell title={t('passwordResetPages.chooseANewPassword')}>
      {ready === 'wait' && <Spinner />}
      {ready === 'no' && (
        <div className="flex flex-col gap-4">
          <ErrorBanner>{t('passwordResetPages.thisLinkHasExpired')}</ErrorBanner>
          <Link to="/forgot" className="flex min-h-11 items-center justify-center text-sm font-medium text-brand">{t('passwordResetPages.sendANewLink')}</Link>
        </div>
      )}
      {ready === 'yes' && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label={t('passwordResetPages.newPassword')} htmlFor="new-password" hint={t('passwordResetPages.atLeastMinpasswordCharacters', { minPassword: MIN_PASSWORD })}>
            <Input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
          </Field>
          <ErrorBanner>{error}</ErrorBanner>
          <Button type="submit" busy={busy}>{t('passwordResetPages.savePassword')}</Button>
        </form>
      )}
    </AuthShell>
  )
}
