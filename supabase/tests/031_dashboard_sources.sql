-- Company dashboard: the period's cost split by where it went (materials, subcontract, own labour,
-- other), adding up to the period's Spent, and only for people who may see money.
begin;
\ir helpers/helpers.psql
select plan(6);

create function tests.sources(p_from date, p_to date) returns jsonb language sql as $$
  select public.company_dashboard((select id from public.companies where name = 'Source Nirman'), p_from, p_to, '2026-05-31')
$$;
grant execute on all functions in schema tests to authenticated;

select tests.create_user('owner') as owner \gset
select tests.create_user('site') as site \gset
select tests.create_company('Source Nirman', :'owner') as co \gset
select tests.login(:'owner');
select public.create_project(p_company => :'co', p_code => 'A', p_name => 'Project A', p_contract_paisa => 120000000,
  p_budget_paisa => 100000000, p_effective_date => '2026-04-01') as pa \gset
select public.create_project(p_company => :'co', p_code => 'B', p_name => 'Project B', p_contract_paisa => 50000000,
  p_effective_date => '2026-04-01') as pb \gset
select tests.supplier(:'co', 'Gandaki Hardware') as s1 \gset
select id as crew from public.crews where project_id = :'pa' and is_default \gset
select tests.logout();
insert into public.memberships (company_id, user_id, roles, can_view_finance) values (:'co', :'site', '{site_staff}', false);
select tests.assign(:'co', :'pa', :'site');

-- April: a bill on A. May: a bill on B, labour on A, an expense on A.
select tests.login(:'owner');
select tests.posted_bill(:'co', :'s1', :'pa', 5000000, '2026-04-20');
select tests.posted_bill(:'co', :'s1', :'pb', 30000000, '2026-05-01');
select public.save_labour_cost(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'project_id', :'pa',
  'crew_id', :'crew', 'work_date', '2026-05-06', 'amount_paisa', 1440000));
select public.save_expense(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'project_id', :'pa',
  'heading_id', tests.heading(:'co', 'Equipment / Machinery Hire'), 'expense_date', '2026-05-07', 'amount_paisa', 600000,
  'description', 'JCB 2 hours', 'payee', jsonb_build_object('name', 'Shyam JCB')));

select is(tests.sources('2026-05-01', '2026-05-31') -> 'cost_by_source_period',
  jsonb_build_object('materials', 30000000, 'subcontract', 0, 'labour', 1440000, 'other', 600000),
  'May: the bill on B, labour and the expense on A, by kind');
select is((select sum(v::bigint)::bigint from jsonb_each_text(tests.sources('2026-05-01', '2026-05-31') -> 'cost_by_source_period') as t(k, v)),
  (tests.sources('2026-05-01', '2026-05-31') ->> 'cost_period_paisa')::bigint, 'the kinds add up to the period''s Spent');
select is((tests.sources('2026-04-01', '2026-04-30') -> 'cost_by_source_period' ->> 'materials')::bigint, 5000000::bigint,
  'April has only the April bill');
select is((tests.sources('2000-01-01', '2026-05-31') -> 'cost_by_source_period' ->> 'materials')::bigint, 35000000::bigint,
  'all time has both bills');
select is(tests.sources('2026-05-01', '2026-05-31') ? 'received_period_paisa', true, 'the earlier figures are still there');

-- Site staff see no money, so no split either.
select tests.login(:'site');
select is(tests.sources('2026-05-01', '2026-05-31') ? 'cost_by_source_period', false, 'no money, no split');

select * from finish();
rollback;
