-- Platform admin (superuser) usage screen and the registration allow list.
begin;
\ir helpers/helpers.psql
select plan(28);

select tests.create_user('free') as free \gset
select tests.create_user('stranger') as stranger \gset
select tests.create_user('listed') as listed \gset
select tests.create_user('second') as second \gset
select tests.create_user('staffer') as staffer \gset
select tests.create_user('boss') as boss \gset

-- Approval off (local dev, CI): anyone may register.
select tests.require_approval(false);
select tests.create_company('Free Builders', :'free') as free_co \gset
select isnt(:'free_co'::uuid, null, 'with approval off, an unlisted login can register');

-- Approval on (hosted project).
select tests.require_approval(true);

select tests.login(:'stranger');
select throws_ok($$select public.create_company('Stranger Co', 'Stranger')$$, '42501', null,
  'an unlisted login cannot register');
select tests.logout();

select throws_ok($$insert into public.registration_allowlist (login_email) values ('Mixed@Test.local')$$, '23514', null,
  'the allow list only stores trimmed, lower-case logins');

insert into public.registration_allowlist (login_email) values ('listed@test.local'), ('second@test.local');
select tests.create_company('Listed Builders', :'listed') as co \gset
select isnt(:'co'::uuid, null, 'a listed login can register');
select is((select used_by from public.registration_allowlist where login_email = 'listed@test.local'), :'listed'::uuid,
  'the entry is marked as used by the new owner');
select is((select used_company from public.registration_allowlist where login_email = 'listed@test.local'), :'co'::uuid,
  'the entry records the company it created');

-- A used entry cannot register again, even once the owner has left the company.
select tests.add_member(:'co', :'second', '{admin}');
update public.memberships set active = false where company_id = :'co' and user_id = :'listed';
select tests.login(:'listed');
select throws_ok($$select public.create_company('Listed Again', 'Listed')$$, '42501', null,
  'a used entry cannot register a second company');
select tests.logout();
update public.memberships set active = true where company_id = :'co' and user_id = :'listed';
update public.memberships set active = false where company_id = :'co' and user_id = :'second';

-- Staff are added by the company admin as before.
select lives_ok(format($$select tests.add_member(%L, %L, '{site_staff}')$$, :'co', :'staffer'),
  'staff are added without an allow-list entry');

-- Edge Function helpers are for the service role only.
select is(public.registration_precheck('SECOND@test.local'), true, 'precheck accepts an unused entry (any case)');
select is(public.registration_precheck('listed@test.local'), false, 'precheck refuses a used entry');
select is(public.registration_precheck('stranger@test.local'), false, 'precheck refuses an unlisted login');
select ok(
  not has_function_privilege('authenticated', 'public.registration_precheck(text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.is_platform_admin_user(uuid)', 'EXECUTE'),
  'signed-in users cannot call the Edge Function helpers');

-- A company admin is not a platform admin.
select tests.login(:'listed');
select is(public.is_platform_admin(), false, 'a company admin is not a platform admin');
select throws_ok($$select * from public.platform_company_usage()$$, '42501', null,
  'a company admin cannot see platform usage');
select throws_ok(format($$select * from public.platform_company_users(%L)$$, :'co'), '42501', null,
  'a company admin cannot list another company''s users');
select throws_ok($$select * from public.platform_used_approvals()$$, '42501', null,
  'a company admin cannot list used approvals');
select is((select count(*) from public.registration_allowlist), 0::bigint, 'a company admin sees no allow-list entries');
select throws_ok($$insert into public.registration_allowlist (login_email) values ('friend@test.local')$$, '42501', null,
  'a company admin cannot approve logins');
select tests.logout();

-- Platform admin.
select tests.make_platform_admin(:'boss');
select tests.login(:'boss');
select lives_ok($$insert into public.registration_allowlist (login_email, note) values ('friend@test.local', 'Ram''s friend')$$,
  'a platform admin can approve a login');
select throws_ok($$insert into public.registration_allowlist (login_email, used_at) values ('cheat@test.local', now())$$,
  '42501', null, 'a platform admin cannot insert an entry as already used');
delete from public.registration_allowlist where login_email = 'listed@test.local';
delete from public.registration_allowlist where login_email = 'friend@test.local';
select is(
  (select array_agg(login_email order by login_email) from public.registration_allowlist
   where login_email in ('listed@test.local', 'friend@test.local')),
  array['listed@test.local'],
  'used entries cannot be deleted; pending ones can');
select is(public.registration_approval_required(), true, 'a platform admin can see that approval is on');
select is(
  (select company_name from public.platform_used_approvals() where login_email = 'listed@test.local'), 'Listed Builders',
  'a platform admin sees the company name of an approval, though not a member of it');
select tests.logout();

-- Usage counts: two projects and two active members must not multiply each other.
select tests.login(:'listed');
select public.create_project(:'co', 'P-1', 'School', 100000, null, '2026-05-01');
select public.create_project(:'co', 'P-2', 'House', 200000, null, '2026-05-01');
select tests.logout();

-- A test runs in one transaction, so every row so far shares the company's created_at and
-- counts as registration setup. Add dated changes: three this week, one 20 days ago, one older.
insert into public.audit_log (company_id, user_id, entity, action, at)
select :'co', :'listed', 'test', 'insert', now() - d
from unnest(array[interval '1 day', '2 days', '3 days', '20 days', '45 days']) as d;
select count(*)::integer as logins from public.memberships where company_id = :'co' \gset

select tests.login(:'boss');
select results_eq(
  format($$select active_users, project_count, changes_7d, changes_30d from public.platform_company_usage() where company_id = %L$$, :'co'),
  $$values (2, 2, 3, 4)$$,
  'usage counts members, projects and dated changes without multiplying; setup rows are left out');
select is(
  (select array_agg(company_id) from public.platform_company_usage('  listed BUILD ')), array[:'co'::uuid],
  'search matches part of the company name, ignoring case and spaces');
select is(
  (select array_agg(company_id) from public.platform_company_usage('listed@test')), array[:'co'::uuid],
  'search matches the owner login');
select is(
  (select changes_30d from public.platform_company_users(:'co') where user_id = :'listed'), 4,
  'each user''s changes are counted');
select is(
  (select count(*) from public.platform_company_users(:'co')),
  :logins::bigint,
  'the user list has every login of the company, active or not');
select tests.logout();

select * from finish();
rollback;
