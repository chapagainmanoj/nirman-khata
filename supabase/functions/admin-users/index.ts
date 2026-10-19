// Admin-only staff management: create staff logins and reset passwords.
// Needs the service-role key, so it runs here instead of in the browser.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { corsHeaders, fail, json, MIN_PASSWORD_LENGTH } from '../_shared/http.ts'
import { parseLoginId } from '../_shared/login-id.ts'
import { flag, isUuid, oneOfList, readBody, text, uuidList } from '../_shared/validate.ts'

const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ROLES = ['admin', 'project_manager', 'site_staff', 'accounts', 'viewer'] as const

type Admin = ReturnType<typeof createClient>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return fail('Method not allowed', 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: userData } = await caller.auth.getUser()
  if (!userData.user) return fail('Not signed in', 401, 'not_signed_in')

  const body = await readBody(req)
  if (!body || !isUuid(body.company_id)) return fail('Invalid request body', 400, 'invalid_request')
  const companyId = body.company_id

  // Authorize against the caller's current, active admin membership.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: membership } = await admin
    .from('memberships')
    .select('roles')
    .eq('company_id', companyId)
    .eq('user_id', userData.user.id)
    .eq('active', true)
    .maybeSingle()
  if (!membership?.roles?.includes('admin')) return fail('Only an admin can manage staff', 403, 'forbidden')

  if (body.action === 'create_staff') return createStaff(admin, companyId, userData.user.id, body)
  if (body.action === 'reset_password') return resetPassword(admin, companyId, body)
  return fail('Unknown action', 400, 'invalid_request')
})

async function createStaff(admin: Admin, companyId: string, callerId: string, body: Record<string, unknown>): Promise<Response> {
  const fullName = text(body.full_name).trim()
  const login = parseLoginId(text(body.login))
  const password = text(body.password)
  const roles = oneOfList(body.roles, ROLES)
  const projectIds = uuidList(body.project_ids)
  if (!fullName) return fail('Name is required', 400, 'name_required')
  if (!login) return fail('Enter a valid Nepali mobile number (98XXXXXXXX) or email', 400, 'invalid_login')
  if (password.length < MIN_PASSWORD_LENGTH) return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400, 'password_short')
  if (!roles?.length) return fail('Choose at least one role', 400, 'roles_required')
  if (!projectIds) return fail('Invalid request body', 400, 'invalid_request')

  const { data: created, error } = await admin.auth.admin.createUser({
    email: login.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: login.kind === 'phone' ? login.phone : null },
  })
  if (error || !created.user) {
    const taken = error?.message?.toLowerCase().includes('already')
    return taken ? fail('This phone or email already has a login', 409, 'login_taken') : fail('Could not create the login', 500, 'server_error')
  }
  const userId = created.user.id

  // Membership and projects together (add_staff_member): both are saved, or neither is and the
  // login made above is removed again, so the admin can simply try again.
  const { error: addError } = await admin.rpc('add_staff_member', {
    p_company: companyId, p_by: callerId, p_user: userId, p_roles: roles,
    p_can_view_finance: flag(body.can_view_finance), p_can_record_payments: flag(body.can_record_payments),
    p_can_approve_slips: flag(body.can_approve_slips), p_projects: projectIds,
  })
  if (addError) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (deleteError) console.error('admin-users: could not remove the half-created login', userId, deleteError.message)
    if (addError.code === '22023' || addError.code === '42501') return fail(addError.message, addError.code === '42501' ? 403 : 400)
    return fail('Could not add the staff member', 500, 'server_error')
  }
  return json({ user_id: userId })
}

async function resetPassword(admin: Admin, companyId: string, body: Record<string, unknown>): Promise<Response> {
  const password = text(body.password)
  if (!isUuid(body.user_id)) return fail('Invalid request body', 400, 'invalid_request')
  const userId = body.user_id
  if (password.length < MIN_PASSWORD_LENGTH) return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400, 'password_short')
  const { data: target } = await admin
    .from('memberships')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!target) return fail('Staff member not found', 404, 'not_found')
  // A platform admin's login also opens /platform; only they may change its password.
  const { data: platformAdmin, error: lookupError } = await admin.rpc('is_platform_admin_user', { p_user: userId })
  if (lookupError) return fail('Could not reset the password', 500, 'server_error')
  if (platformAdmin) return fail('This login is a platform admin; its password cannot be reset here', 403, 'platform_admin')

  const { error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) return fail('Could not reset the password', 500, 'server_error')
  return json({ ok: true })
}
