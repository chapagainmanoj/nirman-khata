// Company owner registration. Public sign-up is disabled, so this is the only
// way to create an owner account: it creates the login and the company together.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { corsHeaders, fail, json, MIN_PASSWORD_LENGTH } from '../_shared/http.ts'
import { parseLoginId } from '../_shared/login-id.ts'

const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return fail('Method not allowed', 405)

  let body: { company_name?: string; full_name?: string; login?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return fail('Invalid request body')
  }

  const companyName = body.company_name?.trim()
  const fullName = body.full_name?.trim()
  const login = parseLoginId(body.login ?? '')
  const password = body.password ?? ''
  if (!companyName) return fail('Company name is required')
  if (!fullName) return fail('Your name is required')
  if (!login) return fail('Enter a valid Nepali mobile number (98XXXXXXXX) or email')
  if (password.length < MIN_PASSWORD_LENGTH) return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: login.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: login.kind === 'phone' ? login.phone : null },
  })
  if (createError || !created.user) {
    const taken = createError?.message?.toLowerCase().includes('already')
    return fail(taken ? 'This phone or email is already registered' : 'Could not create the account', taken ? 409 : 500)
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
    await admin.auth.admin.deleteUser(created.user.id)
    return fail('Could not create the company', 500)
  }
  return json({ company_id: companyId, login_email: login.email })
})
