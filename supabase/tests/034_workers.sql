-- Workers (GLOSSARY: Worker, Crew, Crew Member, Close day): a worker added once for the company and
-- put on the crews of the projects they work on; the days they work are owed to them and they are
-- paid one by one. Who sees workers and their money, the crew's month, paying a worker, peski, and
-- day totals still owed to the crew.
begin;
\ir helpers/helpers.psql
-- These tests mark days long past as site staff; the 7-day limit has its own tests (038).
create or replace function private.can_mark_day(p_company uuid, p_date date) returns boolean language sql as $$ select true $$;
select plan(34);

select tests.create_user('owner') as owner \gset
select tests.create_user('acct') as acct \gset
select tests.create_user('site') as site \gset
select tests.create_user('viewer') as viewer \gset
select tests.create_user('other') as other \gset
select tests.create_company('Kaam Nirman', :'owner') as co \gset
select tests.create_company('Arko Nirman', :'other') as co2 \gset
select tests.add_member(:'co', :'acct', array['accounts']::public.app_role[], true);
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
select tests.add_member(:'co', :'viewer', array['viewer']::public.app_role[], false);
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Bhandari house', 1000000000) as pa \gset
select public.create_project(:'co', 'B', 'Lakeside', 1000000000) as pb \gset
select tests.logout();
select tests.assign(:'co', :'pa', :'site');
select tests.assign(:'co', :'pa', :'viewer');
select id as crew_a from public.crews where project_id = :'pa' and is_default \gset
select id as crew_b from public.crews where project_id = :'pb' and is_default \gset
update public.companies set labour_mode = 'attendance' where id = :'co';

create function tests.wk_mark(p_project uuid, p_crew uuid, p_worker uuid, p_date text, p_minutes int)
returns jsonb language sql as $$
  select public.set_attendance(jsonb_build_object('project_id', p_project, 'crew_id', p_crew, 'worker_id', p_worker,
    'work_date', p_date, 'minutes', p_minutes))
$$;
grant execute on all functions in schema tests to authenticated;

-- Adding workers. The owner adds Ram to the company, then to the Bhandari and Lakeside crews.
select tests.login(:'owner');
insert into public.workers (company_id, name, work_type, rate_kind, rate_paisa)
values (:'co', 'Ram Bahadur', 'Dakarmi', 'daily', 120000) returning id as ram \gset
select public.add_crew_worker(:'crew_a', jsonb_build_object('worker_id', :'ram'));
select public.add_crew_worker(:'crew_b', jsonb_build_object('worker_id', :'ram'));
select is((select count(*) from public.crew_members where worker_id = :'ram'), 2::bigint,
  'one worker can be on the crews of two projects');
select lives_ok($$select public.add_crew_worker('$$ || :'crew_a' || $$', jsonb_build_object('worker_id', '$$ || :'ram' || $$'))$$,
  'putting a worker on a crew again is safe');
select is((select count(*) from public.crew_members where worker_id = :'ram'), 2::bigint, '... and adds no second row');

-- Site staff add a new worker to their project's crew, with an id from the device (safe to retry).
select tests.login(:'site');
select public.add_crew_worker(:'crew_a', jsonb_build_object('id', '00000000-0000-0000-0000-00000000aa01',
  'name', 'Gopal Rai', 'work_type', 'Helper', 'rate_kind', 'hourly', 'rate_paisa', 15000)) as gopal \gset
select lives_ok($$select public.add_crew_worker('$$ || :'crew_a' || $$', jsonb_build_object('id', '00000000-0000-0000-0000-00000000aa01',
  'name', 'Gopal Rai', 'work_type', 'Helper', 'rate_kind', 'hourly', 'rate_paisa', 15000))$$, '... and a retry is safe');
select is((select count(*) from public.workers), 2::bigint, 'site staff see the workers on their project''s crew');
select throws_ok($$select public.add_crew_worker('$$ || :'crew_b' || $$', jsonb_build_object('worker_id', '$$ || :'gopal' || $$'))$$,
  '42501', null, '... but cannot change another project''s crew');
select throws_ok($$insert into public.workers (company_id, name, rate_kind, rate_paisa)
  values ('$$ || :'co' || $$', 'Hari', 'daily', 90000)$$, '42501', null,
  'a worker not on a crew is added by those who manage parties');
select tests.login(:'viewer');
select is((select count(*) from public.workers), 0::bigint, 'a viewer does not see workers or their rates');
select tests.login(:'other');
select is((select count(*) from public.workers), 0::bigint, 'another company sees none of them');
select throws_ok($$select public.add_crew_worker('$$ || :'crew_a' || $$', jsonb_build_object('worker_id', '$$ || :'ram' || $$'))$$,
  '42501', null, '... and cannot change this company''s crews');

-- A month on the Bhandari crew. Ram: 1 May full day, 2 May half. Gopal: 1 May 9 hours.
select tests.login(:'site');
select tests.wk_mark(:'pa', :'crew_a', :'ram', '2026-05-01', 480);
select tests.wk_mark(:'pa', :'crew_a', :'ram', '2026-05-02', 240);
select tests.wk_mark(:'pa', :'crew_a', :'gopal', '2026-05-01', 540);
select is(jsonb_array_length(public.crew_month(:'crew_a', '2026-05-01', '2026-05-31') -> 'workers'), 2,
  'the crew''s month lists its workers');
select is((select (w ->> 'minutes')::int from jsonb_array_elements(public.crew_month(:'crew_a', '2026-05-01', '2026-05-31') -> 'workers') w
    where w ->> 'id' = :'ram'), 720, '... with the hours each worked');
select is((select w ->> 'open_paisa' from jsonb_array_elements(public.crew_month(:'crew_a', '2026-05-01', '2026-05-31') -> 'workers') w
    where w ->> 'id' = :'ram'), null, 'site staff see hours, not money');
select tests.login(:'acct');
select is((select (w ->> 'draft_days')::int from jsonb_array_elements(public.crew_month(:'crew_a', '2026-05-01', '2026-05-31') -> 'workers') w
    where w ->> 'id' = :'ram'), 2, 'finance sees the draft days, with no money until verified');
select throws_ok($$select public.crew_month('$$ || :'crew_a' || $$', '2026-05-01', '2026-07-01')$$, '22023', null,
  'the month covers at most 42 days');
select tests.login(:'viewer');
select throws_ok($$select public.crew_month('$$ || :'crew_a' || $$', '2026-05-01', '2026-05-31')$$, '42501', null,
  'a viewer cannot open the crew''s month');

-- Paying Ram: close his open Bhandari days (no from date: every open day), then pay him.
select tests.login(:'acct');
select tests.wk_mark(:'pb', :'crew_b', :'ram', '2026-05-03', 480);
select results_eq($$select (r ->> 'days')::int, (r ->> 'total_paisa')::bigint
    from public.close_worker_days(gen_random_uuid(), jsonb_build_object('worker_id', '$$ || :'ram' || $$',
      'project_id', '$$ || :'pa' || $$', 'to_date', '2026-05-31')) r$$,
  $$values (2, 180000::bigint)$$, 'closing a worker on one project closes every open day there');
select is((select count(*) from public.attendance where worker_id = :'ram' and project_id = :'pb' and labour_cost_id is null), 1::bigint,
  '... and leaves other projects open');
select is((select count(*) from public.attendance where worker_id = :'gopal' and labour_cost_id is null), 1::bigint,
  '... and other workers open');
select is((select count(*) from public.party_open_items(:'ram') where kind = 'labour'), 2::bigint,
  'the closed days are the worker''s open items');
select public.record_payment(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'worker_id', :'ram',
  'payment_date', '2026-05-31', 'amount_paisa', 100000,
  'allocations', jsonb_build_array(jsonb_build_object('project_id', :'pa', 'amount_paisa', 100000)),
  'settlements', jsonb_build_array(jsonb_build_object('doc_id',
    (select id from public.labour_costs where worker_id = :'ram' and work_date = '2026-05-01'), 'project_id', :'pa', 'amount_paisa', 100000))));
select is(tests.ledger(:'ram', :'pa', 'balance_paisa'), 80000::bigint, 'a part payment to the worker leaves 800 due');
select is((select balance_paisa from public.party_balances(:'co', 'worker') where party_id = :'ram'), 80000::bigint,
  'the worker''s balance shows among workers');
select is((select (w ->> 'balance_paisa')::bigint from jsonb_array_elements(public.crew_month(:'crew_a', '2026-05-01', '2026-05-31') -> 'workers') w
    where w ->> 'id' = :'ram'), 80000::bigint, '... and on the crew''s month');
select is((select (w ->> 'paid_paisa')::bigint from jsonb_array_elements(public.crew_month(:'crew_a', '2026-05-01', '2026-05-31') -> 'workers') w
    where w ->> 'id' = :'ram'), 100000::bigint, '... with what was paid in the month');
select is((public.project_cost_summary(:'pa') #>> '{payable_by_kind,crew}')::bigint, 80000::bigint,
  'the project counts what workers are owed as labour');

-- Peski: only while nothing is unpaid to the worker.
select throws_like($$select public.record_payment(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'worker_id', '$$ || :'ram' || $$',
  'payment_date', '2026-05-31', 'amount_paisa', 50000, 'is_peski', true))$$, '%peski_with_unpaid%',
  'peski is refused while the worker has unpaid days');
select lives_ok($$select public.record_payment(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'worker_id', '$$ || :'gopal' || $$',
  'payment_date', '2026-05-31', 'amount_paisa', 50000, 'is_peski', true))$$,
  'a worker with nothing closed can get peski');
select throws_ok($$select public.record_payment(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'worker_id', '$$ || :'ram' || $$',
  'crew_id', '$$ || :'crew_a' || $$', 'payment_date', '2026-05-31', 'amount_paisa', 1000))$$, '22023', null,
  'a payment is to one party: a worker or a crew, not both');

-- Day totals stay with the crew.
select public.save_labour_cost(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'project_id', :'pb',
  'crew_id', :'crew_b', 'work_date', '2026-05-10', 'amount_paisa', 300000));
select is(tests.ledger(:'crew_b', :'pb', 'balance_paisa'), 300000::bigint, 'a day total is still owed to the crew');
select is((select count(*) from public.party_open_items(:'ram') where project_id = :'pb'), 0::bigint,
  '... and is not the worker''s');

-- The crew list: what each crew's workers are owed on its project, with the crew's own balance.
select results_eq($$select workers, workers_owed_paisa, crew_owed_paisa, balance_paisa from public.crew_balances('$$ || :'co' || $$') where crew_id = '$$ || :'crew_a' || $$'$$,
  $$values (2, 80000::bigint, 0::bigint, 80000::bigint)$$, 'a crew shows what its workers are owed on its project; peski not given to a project is not counted');
select results_eq($$select workers_owed_paisa, crew_owed_paisa, balance_paisa from public.crew_balances('$$ || :'co' || $$') where crew_id = '$$ || :'crew_b' || $$'$$,
  $$values (0::bigint, 300000::bigint, 300000::bigint)$$, '... and its own balance from day totals; open days are not owed yet');
select tests.login(:'viewer');
select is((select sum(balance_paisa) from public.crew_balances(:'co')), 0::numeric, 'a viewer sees no amounts');
select tests.login(:'other');
select is((select count(*) from public.crew_balances(:'co')), 0::bigint, 'another company sees no crews');

select * from finish();
rollback;
