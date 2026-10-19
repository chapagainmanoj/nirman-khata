import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button, ErrorBanner, Field, Input } from '../../components/ui'
import { callFunction } from '../../lib/functions'
import { t } from '../../lib/i18n'
import { parseLoginId } from '../../lib/login-id'
import { supabase } from '../../lib/supabase'
import { AuthShell } from './AuthShell'

const MIN_PASSWORD = 8

export function RegisterPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ company_name: '', full_name: '', login: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const id = parseLoginId(form.login)
    if (!id) return setError(t('register.enterAMobileNumber'))
    if (form.password.length < MIN_PASSWORD) return setError(t('register.passwordMustBeAt', { minPassword: MIN_PASSWORD }))
    setBusy(true)
    try {
      await callFunction('register', form)
    } catch (err) {
      setBusy(false)
      return setError((err as Error).message)
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: id.email, password: form.password })
    setBusy(false)
    // The company exists now; only the automatic sign-in failed, so say so on the login page.
    if (signInError) return navigate('/login', { state: { registered: true } })
    await queryClient.invalidateQueries({ queryKey: ['me'] })
    navigate('/projects', { replace: true })
  }

  return (
    <AuthShell title={t('auth.register')}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-subtle">{t('auth.byInvitation')}</p>
        <Field label={t('register.companyName')} htmlFor="company">
          <Input id="company" value={form.company_name} onChange={set('company_name')} required />
        </Field>
        <Field label={t('register.yourName')} htmlFor="name">
          <Input id="name" value={form.full_name} onChange={set('full_name')} autoComplete="name" required />
        </Field>
        <Field label={t('auth.loginId')} htmlFor="login" hint={t('register.youWillSignIn')}>
          <Input id="login" value={form.login} onChange={set('login')} autoComplete="username" placeholder={t('register.98xxxxxxxx')} required />
        </Field>
        <Field label={t('auth.password')} htmlFor="password" hint={t('register.atLeastMinpasswordCharacters', { minPassword: MIN_PASSWORD })}>
          <Input id="password" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required />
        </Field>
        <ErrorBanner>{error}</ErrorBanner>
        <Button type="submit" busy={busy}>{t('register.createCompany')}</Button>
        <Link to="/login" className="flex min-h-11 items-center justify-center text-sm font-medium text-slate">{t('register.alreadyRegistered')}{' '}{t('auth.login')}</Link>
      </form>
    </AuthShell>
  )
}
