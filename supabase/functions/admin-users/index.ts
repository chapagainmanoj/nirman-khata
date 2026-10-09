// Admin-only staff management: create staff logins and reset passwords.
// Needs the service-role key, so it runs here instead of in the browser.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { corsHeaders, fail, json, MIN_PASSWORD_LENGTH } from '../_shared/http.ts'
import { parseLoginId } from '../_shared/login-id.ts'

const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ROLES = ['admin', 'project_manager', 'site_staff', 'accounts', 'viewer'] as const
type Role = (typeof ROLES)[number]

type CreateStaff = {
  action: 'create_staff'
  company_id: string
  full_name: string
  login: string
  password: string
  roles: Role[]
  can_view_finance?: boolean
  can_record_payments?: boolean
  can_approve_slips?: boolean
  project_ids?: string[]
}
type ResetPassword = { action: 'reset_password'; company_id: string; user_id: string; password: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return fail('Method not allowed', 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: userData } = await caller.auth.getUser()
  if (!userData.user) return fail('Not signed in', 401)

  let body: CreateStaff | ResetPassword
  try {
    body = await req.json()
  } catch {
    return fail('Invalid request body')
  }

  // Authorize against the caller's current, active admin membership.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: membership } = await admin
    .from('memberships')
    .select('roles')
    .eq('company_id', body.company_id)
    .eq('user_id', userData.user.id)
    .eq('active', true)
    .maybeSingle()
  if (!membership?.roles?.includes('admin')) return fail('Only an admin can manage staff', 403)

  if (body.action === 'create_staff') return createStaff(admin, body)
  if (body.action === 'reset_password') return resetPassword(admin, body)
  return fail('Unknown action')
})

async function createStaff(admin: ReturnType<typeof createClient>, body: CreateStaff): Promise<Response> {
  const fullName = body.full_name?.trim()
  const login = parseLoginId(body.login ?? '')
  const roles = (body.roles ?? []).filter((r) => (ROLES as readonly string[]).includes(r))
  if (!fullName) return fail('Name is required')
  if (!login) return fail('Enter a valid Nepali mobile number (98XXXXXXXX) or email')
  if ((body.password ?? '').length < MIN_PASSWORD_LENGTH) return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  if (roles.length === 0) return fail('Choose at least one role')

  const { data: created, error } = await admin.auth.admin.createUser({
    email: login.email,
    password: body.password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: login.kind === 'phone' ? login.phone : null },
  })
  if (error || !created.user) {
    const taken = error?.message?.toLowerCase().includes('already')
    return fail(taken ? 'This phone or email already has a login' : 'Could not create the login', taken ? 409 : 500)
  }
  const userId = created.user.id

  const { error: memberError } = await admin.from('memberships').insert({
    company_id: body.company_id,
    user_id: userId,
    roles,
    can_view_finance: !!body.can_view_finance,
    can_record_payments: !!body.can_record_payments,
    can_approve_slips: !!body.can_approve_slips,
  })
  if (memberError) {
    await admin.auth.admin.deleteUser(userId)
    return fail('Could not add the staff member', 500)
  }

  if (body.project_ids?.length) {
    const { error: assignError } = await admin.from('project_assignments').insert(
      body.project_ids.map((projectId) => ({ company_id: body.company_id, project_id: projectId, user_id: userId })),
    )
    if (assignError) return json({ user_id: userId, warning: 'Staff added, but project assignment failed' })
  }
  return json({ user_id: userId })
}

async function resetPassword(admin: ReturnType<typeof createClient>, body: ResetPassword): Promise<Response> {
  if ((body.password ?? '').length < MIN_PASSWORD_LENGTH) return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  const { data: target } = await admin
    .from('memberships')
    .select('user_id')
    .eq('company_id', body.company_id)
    .eq('user_id', body.user_id)
    .maybeSingle()
  if (!target) return fail('Staff member not found', 404)

  const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.password })
  if (error) return fail('Could not reset the password', 500)
  return json({ ok: true })
}
