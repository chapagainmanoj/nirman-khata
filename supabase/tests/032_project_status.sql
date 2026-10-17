-- Project status, made simpler: a new project starts Active; Planned is no longer allowed;
-- an older draft that still sends 'planned' is created Active; closed books can be reopened;
-- a cancelled project takes no new money until it is restored.
begin;
\ir helpers/helpers.psql
select plan(7);

create function tests.expense(p_project uuid) returns jsonb language sql as $f$
  select public.save_expense(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'project_id', p_project,
    'heading_id', tests.heading((select company_id from public.projects where id = p_project), 'Equipment / Machinery Hire'),
    'expense_date', '2026-05-07', 'amount_paisa', 600000, 'description', 'JCB 2 hours', 'payee', jsonb_build_object('name', 'Shyam JCB')))
$f$;
grant execute on all functions in schema tests to authenticated;

select tests.create_user('owner') as owner \gset
select tests.create_company('Status Nirman', :'owner') as co \gset
select tests.login(:'owner');

select public.create_project(:'co', 'S-1', 'New one', 100000) as p1 \gset
select is((select status::text from public.projects where id = :'p1'), 'active', 'a new project starts Active');

select public.create_project(:'co', 'S-2', 'Old draft', 100000, p_details => '{"status": "planned"}') as p2 \gset
select is((select status::text from public.projects where id = :'p2'), 'active', 'an old draft sending Planned is created Active');

select public.create_project(:'co', 'S-3', 'On hold', 100000, p_details => '{"status": "on_hold"}') as p3 \gset
select is((select status::text from public.projects where id = :'p3'), 'on_hold', 'another status is kept');

select throws_ok($$ update public.projects set status = 'planned' where code = 'S-1' $$, '23514', null,
  'Planned can no longer be set');

-- Close books, then reopen (back to Completed); the lock itself is tested in 014 and 027.
update public.projects set status = 'closed' where id = :'p1';
update public.projects set status = 'completed' where id = :'p1';
select is((select status::text from public.projects where id = :'p1'), 'completed', 'books can be reopened');

-- Cancelled: no new money; restored (back to Active), it takes money again.
update public.projects set status = 'cancelled' where id = :'p3';
select throws_ok(format($$ select tests.expense(%L) $$, :'p3'), 'P0001',
  'This project is cancelled. Restore it before posting.', 'a cancelled project takes no new money');
update public.projects set status = 'active' where id = :'p3';
select lives_ok(format($$ select tests.expense(%L) $$, :'p3'), 'restored, it takes money again');

select * from finish();
rollback;
