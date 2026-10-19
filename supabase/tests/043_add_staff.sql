-- add_staff_member: a new staff member's membership and projects are saved together or not at all
-- (admin-users Edge Function). Service role only; the caller must be an active admin of the company.
begin;
\ir helpers/helpers.psql
select plan(13);

select tests.create_user('owner') as owner \gset
select tests.create_user('other_owner') as other_owner \gset
select tests.create_user('pm') as pm \gset
select tests.create_user('newbie') as newbie \gset
select tests.create_user('newbie2') as newbie2 \gset
select tests.create_company('Delta Builders', :'owner') as co \gset
select tests.create_company('Other Builders', :'other_owner') as other_co \gset
select tests.add_member(:'co', :'pm', '{project_manager}');

select tests.login(:'owner');
select public.create_project(:'co', 'P-1', 'Site one', 100000000) as p1 \gset
select public.create_project(:'co', 'P-2', 'Site two', 100000000) as p2 \gset
select tests.logout();
select tests.login(:'other_owner');
select public.create_project(:'other_co', 'X-1', 'Their site', 100000000) as x1 \gset
select tests.logout();

-- Who may call it
select tests.login(:'owner');
select throws_ok(format($$select public.add_staff_member(%L, %L, %L, '{site_staff}', false, false, false, '{}')$$, :'co', :'owner', :'newbie'),
  '42501', null, 'a signed-in user cannot call it, even an admin (service role only)');
select tests.logout();

set local role service_role;
select throws_ok(format($$select public.add_staff_member(%L, %L, %L, '{site_staff}', false, false, false, '{}')$$, :'co', :'pm', :'newbie'),
  '42501', 'Only an admin can manage staff', 'a caller who is not an admin is refused');
select throws_ok(format($$select public.add_staff_member(%L, %L, %L, '{site_staff}', false, false, false, '{}')$$, :'co', :'other_owner', :'newbie'),
  '42501', 'Only an admin can manage staff', 'an admin of another company is refused');
select throws_ok(format($$select public.add_staff_member(%L, %L, %L, '{}', false, false, false, '{}')$$, :'co', :'owner', :'newbie'),
  '22023', 'Choose at least one role', 'at least one role');

-- All or nothing: a project from another company saves neither the membership nor any project.
select throws_ok(format($$select public.add_staff_member(%L, %L, %L, '{site_staff}', false, false, false, %L)$$,
  :'co', :'owner', :'newbie', array[:'p1', :'x1']::uuid[]::text),
  '22023', 'A chosen project is not in this company', 'a project of another company is refused');
reset role;
select is((select count(*)::int from public.memberships where user_id = :'newbie'), 0, 'refused: no membership was saved');
select is((select count(*)::int from public.project_assignments where user_id = :'newbie'), 0, 'refused: no project was assigned');

-- Saved together
set local role service_role;
select isnt(public.add_staff_member(:'co', :'owner', :'newbie', '{site_staff}', false, true, false, array[:'p1', :'p2', :'p1']::uuid[]), null,
  'an admin adds a staff member with their projects');
reset role;
select is((select roles::text from public.memberships where company_id = :'co' and user_id = :'newbie'), '{site_staff}', 'the membership has the roles');
select is((select can_record_payments from public.memberships where company_id = :'co' and user_id = :'newbie'), true, 'and the rights chosen');
select is((select created_by from public.memberships where company_id = :'co' and user_id = :'newbie'), :'owner'::uuid, 'who added them is kept');
select is((select count(*)::int from public.project_assignments where company_id = :'co' and user_id = :'newbie'), 2,
  'each project assigned once, even if listed twice');

-- No projects is fine (an office person who sees all, or projects later).
set local role service_role;
select isnt(public.add_staff_member(:'co', :'owner', :'newbie2', '{accounts}', true, true, false, null), null, 'no projects is allowed');
reset role;

select * from finish();
rollback;
