// Company owner registration. Public sign-up is disabled, so this is the only
// way to create an owner account: it creates the login and the company together.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { corsHeaders, fail, json, MIN_PASSWORD_LENGTH } from '../_shared/http.ts'
import { parseLoginId } from '../_shared/login-id.ts'
import { readBody, text } from '../_shared/validate.ts'

const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const NOT_APPROVED = 'This phone or email is not approved to register. Contact us to get access.'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return fail('Method not allowed', 405)

  const body = await readBody(req)
  if (!body) return fail('Invalid request body', 400, 'invalid_request')

  const companyName = text(body.company_name).trim()
  const fullName = text(body.full_name).trim()
  const login = parseLoginId(text(body.login))
  const password = text(body.password)
  if (!companyName) return fail('Company name is required', 400, 'company_name_required')
  if (!fullName) return fail('Your name is required', 400, 'name_required')
  if (!login) return fail('Enter a valid Nepali mobile number (98XXXXXXXX) or email', 400, 'invalid_login')
  if (password.length < MIN_PASSWORD_LENGTH) return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400, 'password_short')

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  // On the hosted project only approved logins may register (the allow list).
  // create_company() checks again; this only avoids creating a login we would delete.
  const { data: approved, error: precheckError } = await admin.rpc('registration_precheck', { p_login_email: login.email })
  if (precheckError) return fail('Could not create the account', 500, 'server_error')
  if (!approved) return fail(NOT_APPROVED, 403, 'not_approved')

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: login.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: login.kind === 'phone' ? login.phone : null },
  })
  if (createError || !created.user) {
    const taken = createError?.message?.toLowerCase().includes('already')
    return taken ? fail('This phone or email is already registered', 409, 'login_taken') : fail('Could not create the account', 500, 'server_error')
  }

  // Create the company as the new user, so create_company() sees auth.uid().
  const asUser = createClient(url, anonKey, { auth: { persistSession: false } })
  const { error: signInError } = await asUser.auth.signInWithPassword({ email: login.email, password })
  const { data: companyId, error: companyError } = signInError
    ? { data: null, error: signInError }
    : await asUser.rpc('create_company', {
        p_name: companyName,
        p_full_name: fullName,
        p_phone: login.kind === 'phone' ? login.phone : null,
      })

  if (companyError) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(created.user.id)
    if (deleteError) {
      // The login stays without a company: trying again would only say "already registered".
      console.error('register: could not delete the half-created login', created.user.id, deleteError.message)
      return fail('The account was made but the company was not. Contact us to finish it; do not register again.', 500, 'half_registered')
    }
    if ('code' in companyError && companyError.code === '42501') return fail(NOT_APPROVED, 403, 'not_approved')
    return fail('Could not create the company', 500, 'server_error')
  }
  return json({ company_id: companyId, login_email: login.email })
})
