-- Project status, made simpler: a new project starts Active; Planned is no longer allowed;
-- an older draft that still sends 'planned' is created Active; closed books can be reopened.
begin;
\ir helpers/helpers.psql
select plan(5);

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

select * from finish();
rollback;
