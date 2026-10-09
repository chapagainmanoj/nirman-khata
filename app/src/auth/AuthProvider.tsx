import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { DateDisplay } from '../lib/dates'
import { clearUserDrafts, listUserDrafts } from '../lib/drafts'
import { supabase, type AppRole, type Tables } from '../lib/supabase'

type Membership = Tables<'memberships'> & { companies: Tables<'companies'> }

export type AuthState = {
  loading: boolean
  /** Profile/company could not be loaded (usually no network); not the same as "no company". */
  loadError: unknown
  retryLoad: () => void
  session: Session | null
  userId: string | null
  profile: Tables<'profiles'> | null
  membership: Membership | null
  company: Tables<'companies'> | null
  dateDisplay: DateDisplay
  hasRole: (role: AppRole) => boolean
  isAdmin: boolean
  /** Admin and Accounts see every project (req §5). */
  seesAllProjects: boolean
  canSeeFinance: boolean
  /** Returns false if the user cancelled because of unsent drafts. */
  signOut: () => Promise<boolean>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoaded(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (!next) queryClient.clear()
    })
    return () => sub.subscription.unsubscribe()
  }, [queryClient])

  const userId = session?.user.id ?? null

  const me = useQuery({
    queryKey: ['me', userId],
    enabled: !!userId,
    // supabase-js already retries network failures; a second layer only delays the error screen.
    retry: false,
    queryFn: async () => {
      const [profile, membership] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId!).single(),
        supabase.from('memberships').select('*, companies(*)').eq('user_id', userId!).eq('active', true).maybeSingle(),
      ])
      if (profile.error) throw profile.error
      if (membership.error) throw membership.error
      return { profile: profile.data, membership: membership.data as Membership | null }
    },
  })

  const refetchMe = me.refetch
  const value = useMemo<AuthState>(() => {
    const membership = me.data?.membership ?? null
    const roles = membership?.roles ?? []
    const hasRole = (role: AppRole) => roles.includes(role)
    const isAdmin = hasRole('admin')
    const seesAllProjects = isAdmin || hasRole('accounts')
    return {
      loading: !sessionLoaded || (!!userId && me.isPending),
      // A failed background refresh keeps the data we already have.
      loadError: me.data ? null : me.error,
      retryLoad: () => void refetchMe(),
      session,
      userId,
      profile: me.data?.profile ?? null,
      membership,
      company: membership?.companies ?? null,
      dateDisplay: me.data?.profile.date_display ?? membership?.companies.default_date_display ?? 'bs',
      hasRole,
      isAdmin,
      seesAllProjects,
      canSeeFinance: seesAllProjects || !!membership?.can_view_finance,
      signOut: async () => {
        if (userId) {
          const drafts = await listUserDrafts(userId)
          if (
            drafts.length > 0 &&
            !window.confirm(
              `You have ${drafts.length} unsent draft(s) on this phone. Signing out deletes them. Sign out anyway?`,
            )
          ) {
            return false
          }
          await clearUserDrafts(userId)
        }
        await supabase.auth.signOut()
        return true
      },
    }
  }, [me.data, me.isPending, me.error, refetchMe, session, sessionLoaded, userId])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

/** For pages behind RequireCompany: company and user are always present. */
export function useCompany() {
  const auth = useAuth()
  if (!auth.company || !auth.userId) throw new Error('useCompany needs an active company')
  return { ...auth, company: auth.company, userId: auth.userId, companyId: auth.company.id }
}
