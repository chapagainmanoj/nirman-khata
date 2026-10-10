import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Button, ErrorBanner, Field, Input } from '../../components/ui'
import { t } from '../../lib/i18n'
import { parseLoginId } from '../../lib/login-id'
import { supabase } from '../../lib/supabase'
import { AuthShell } from './AuthShell'
import { EMAIL_RESET } from './PasswordResetPages'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const id = parseLoginId(login)
    if (!id) return setError('Enter your mobile number (98XXXXXXXX) or email.')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: id.email, password })
    setBusy(false)
    if (error) {
      return setError(
        error.message.includes('Invalid login') ? 'Wrong mobile number/email or password.' : 'Could not sign in. Check your connection.',
      )
    }
    navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true })
  }

  return (
    <AuthShell title={t('auth.login')}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={t('auth.loginId')} htmlFor="login">
          <Input id="login" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" inputMode="email" placeholder="98XXXXXXXX" required />
        </Field>
        <Field label={t('auth.password')} htmlFor="password">
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        <ErrorBanner>{error}</ErrorBanner>
        <Button type="submit" busy={busy}>{t('auth.login')}</Button>
        {EMAIL_RESET
          ? <Link to="/forgot" className="flex min-h-11 items-center justify-center text-sm font-medium text-brand">Forgot password?</Link>
          : <p className="text-xs text-subtle">{t('auth.forgot')}</p>}
        <Link to="/register" className="flex min-h-11 items-center justify-center text-sm font-medium text-slate">{t('auth.register')}</Link>
      </form>
    </AuthShell>
  )
}
