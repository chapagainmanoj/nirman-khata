-- Company isolation (acceptance #1, test S1): a Company A user cannot read or
-- write Company B data, even by using B's ids directly.
begin;
\ir helpers/helpers.psql
select plan(14);

select tests.create_user('alice') as alice \gset
select tests.create_user('bob') as bob \gset
select tests.create_company('Alpha Nirman', :'alice') as co_a \gset
select tests.create_company('Bravo Builders', :'bob') as co_b \gset

-- Each admin creates a project.
select tests.login(:'alice');
select public.create_project(:'co_a', 'A-1', 'Alpha house', 500000000) as proj_a \gset
select tests.login(:'bob');
select public.create_project(:'co_b', 'B-1', 'Bravo school', 900000000) as proj_b \gset

-- Alice looks around.
select tests.login(:'alice');

select is((select count(*) from public.companies), 1::bigint, 'sees only her own company');
select is((select count(*) from public.projects where id = :'proj_b'), 0::bigint, 'cannot read B project by id');
select is((select count(*) from public.contract_revisions where company_id = :'co_b'), 0::bigint, 'cannot read B contract amounts');
select is((select count(*) from public.budget_revisions where company_id = :'co_b'), 0::bigint, 'cannot read B budgets');
select is((select count(*) from public.memberships where company_id = :'co_b'), 0::bigint, 'cannot read B staff');
select is((select count(*) from public.cost_headings where company_id = :'co_b'), 0::bigint, 'cannot read B headings');
select is((select count(*) from public.materials where company_id = :'co_b'), 0::bigint, 'cannot read B materials');
select is((select count(*) from public.profiles where id = :'bob'), 0::bigint, 'cannot read B owner profile');
select is((select count(*) from public.project_amounts_as_of(:'proj_b')), 0::bigint, 'as-of amounts for B project return nothing');

select throws_ok(
  format($$select public.create_project(%L, 'X-1', 'Sneaky', 100)$$, :'co_b'),
  '42501', null, 'cannot create a project in B via RPC'
);

select throws_ok(
  format($$insert into public.projects (company_id, code, name) values (%L, 'X-2', 'Sneaky')$$, :'co_b'),
  '42501', null, 'cannot insert a project into B directly'
);

select throws_ok(
  format($$select public.add_contract_revision(%L, current_date, 1, 'change')$$, :'proj_b'),
  '42501', null, 'cannot revise B contract'
);

-- Updating B rows silently affects nothing.
update public.companies set name = 'hacked' where id = :'co_b';
select tests.logout();
select is((select name from public.companies where id = :'co_b'), 'Bravo Builders', 'B company unchanged after A update attempt');

-- Composite keys: even the service role cannot link A rows to B rows.
select throws_ok(
  format($$insert into public.project_assignments (company_id, project_id, user_id) values (%L, %L, %L)$$,
         :'co_a', :'proj_b', :'alice'),
  '23503', null, 'a Company A row cannot reference a Company B project'
);

select * from finish();
rollback;
