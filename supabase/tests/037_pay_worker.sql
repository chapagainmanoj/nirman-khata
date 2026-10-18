-- Paying a worker in one step (req §14): pay_worker adds the ticked open days to labour cost, takes
-- the worker's advance off them (from any project), pays the rest oldest day first, and keeps any
-- extra as an advance. Who may pay, and nothing half done.
begin;
\ir helpers/helpers.psql
select plan(18);

select tests.create_user('owner') as owner \gset
select tests.create_user('acct') as acct \gset
select tests.create_user('site') as site \gset
select tests.create_user('other') as other \gset
select tests.create_company('Jyala Nirman', :'owner') as co \gset
select tests.create_company('Arko Nirman', :'other') as co2 \gset
select tests.add_member(:'co', :'acct', array['accounts']::public.app_role[], true);
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Bhandari house', 1000000000) as pa \gset
select public.create_project(:'co', 'B', 'Lakeside', 1000000000) as pb \gset
select tests.logout();
select tests.assign(:'co', :'pa', :'site');
select id as crew_a from public.crews where project_id = :'pa' and is_default \gset
select id as crew_b from public.crews where project_id = :'pb' and is_default \gset
update public.companies set labour_mode = 'attendance' where id = :'co';

create function tests.pw_mark(p_project uuid, p_crew uuid, p_worker uuid, p_date text)
returns jsonb language sql as $$
  select public.set_attendance(jsonb_build_object('project_id', p_project, 'crew_id', p_crew, 'worker_id', p_worker,
    'work_date', p_date, 'minutes', 480))
$$;
create function tests.pw_open(p_worker uuid, p_project uuid) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('project_id', o.project_id, 'crew_id', o.crew_id, 'work_date', o.work_date)), '[]')
  from public.worker_open_days(p_worker) o where p_project is null or o.project_id = p_project
$$;
grant execute on all functions in schema tests to authenticated;

select tests.login(:'acct');
select public.add_crew_worker(:'crew_a', jsonb_build_object('id', gen_random_uuid(), 'name', 'Ram',
  'rate_kind', 'daily', 'rate_paisa', 100000)) as ram \gset
select public.add_crew_worker(:'crew_b', jsonb_build_object('worker_id', :'ram'));

-- Ram: 2 days on Lakeside, 1 on Bhandari, none added to labour cost; 500 paid ahead on Bhandari.
select tests.pw_mark(:'pb', :'crew_b', :'ram', '2026-05-01');
select tests.pw_mark(:'pb', :'crew_b', :'ram', '2026-05-02');
select tests.pw_mark(:'pa', :'crew_a', :'ram', '2026-05-03');
select public.record_payment(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'worker_id', :'ram',
  'payment_date', '2026-04-30', 'amount_paisa', 50000,
  'allocations', jsonb_build_array(jsonb_build_object('project_id', :'pa', 'amount_paisa', 50000))));
select results_eq($$select count(*)::int, sum(amount_paisa)::bigint from public.worker_open_days('$$ || :'ram' || $$')$$,
  $$values (3, 300000::bigint)$$, 'the open days are listed with today''s price');
select is(public.worker_advance(:'ram'), 50000::bigint, 'the advance he holds is shown');

-- Pay the Lakeside days: 2,000 less the 500 advance from Bhandari, 1,500 in cash.
select public.pay_worker(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'worker_id', :'ram',
  'payment_date', '2026-05-02', 'amount_paisa', 150000, 'method', 'cash',
  'open_days', tests.pw_open(:'ram', :'pb'))) as paid \gset
select is((:'paid'::jsonb ->> 'days_added')::int, 2, 'the ticked days are added to labour cost');
select is((:'paid'::jsonb ->> 'held_used_paisa')::bigint, 50000::bigint, '... the advance on another project comes off them');
select is(tests.ledger(:'ram', :'pb', 'balance_paisa'), 0::bigint, '... and 1,500 pays the rest of Lakeside');
select is(tests.ledger(:'ram', :'pa', 'balance_paisa'), 0::bigint, 'Bhandari no longer holds the advance');
select is((select count(*) from public.worker_open_days(:'ram')), 1::bigint, 'the Bhandari day is still open');

-- Pay 1,500 for the Bhandari day (1,000): 500 left as an advance on Bhandari.
select public.pay_worker(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'worker_id', :'ram',
  'payment_date', '2026-05-03', 'amount_paisa', 150000, 'open_days', tests.pw_open(:'ram', null))) as more \gset
select is((:'more'::jsonb ->> 'advance_paisa')::bigint, 50000::bigint, 'paying more leaves an advance');
select is(tests.ledger(:'ram', :'pa', 'balance_paisa'), -50000::bigint, '... held on the day''s project');
select is((select is_peski from public.payments where id = (:'more'::jsonb ->> 'payment_id')::uuid), false, '... not peski');

-- Paying less than the days: the oldest day is paid first.
select tests.pw_mark(:'pb', :'crew_b', :'ram', '2026-05-04');
select tests.pw_mark(:'pb', :'crew_b', :'ram', '2026-05-05');
select public.pay_worker(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'worker_id', :'ram',
  'payment_date', '2026-05-05', 'amount_paisa', 100000, 'open_days', tests.pw_open(:'ram', null)));
select results_eq($$select l.work_date, private.doc_settleable(l.id, l.project_id) - private.doc_settled(l.id, l.project_id)
    from public.labour_costs l where l.worker_id = '$$ || :'ram' || $$' and l.work_date >= '2026-05-04' order by 1$$,
  $$values ('2026-05-04'::date, 0::bigint), ('2026-05-05'::date, 50000::bigint)$$,
  'a part payment (with the 500 advance) pays the oldest day first');

-- Nothing half done: a day already added is refused, and nothing is written.
select throws_like($$select public.pay_worker(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'worker_id', '$$ || :'ram' || $$',
  'amount_paisa', 1000, 'open_days', jsonb_build_array(jsonb_build_object('project_id', '$$ || :'pb' || $$', 'crew_id', '$$ || :'crew_b' || $$',
  'work_date', '2026-05-01'))))$$, 'day_changed%', 'a day already added to labour cost is refused');

-- The khata names every project of a payment split across projects.
select public.record_payment(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'worker_id', :'ram',
  'payment_date', '2026-05-06', 'amount_paisa', 30000, 'allocations', jsonb_build_array(
    jsonb_build_object('project_id', :'pa', 'amount_paisa', 10000), jsonb_build_object('project_id', :'pb', 'amount_paisa', 20000)))) as split \gset
select is((select cardinality(project_ids) from public.party_khata(:'ram') where doc_id = (:'split'::jsonb ->> 'payment_id')::uuid), 2,
  'a split payment''s khata line lists both projects');
select is(public.worker_advance(:'ram'), 10000::bigint, 'an advance on one project counts though more is owed on another');

-- Who may pay.
select tests.login(:'site');
select throws_ok($$select public.pay_worker(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'worker_id', '$$ || :'ram' || $$',
  'amount_paisa', 1000))$$, '42501', null, 'site staff cannot pay');
select tests.login(:'other');
select throws_ok($$select public.pay_worker(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'worker_id', '$$ || :'ram' || $$',
  'amount_paisa', 1000))$$, '42501', null, 'another company cannot pay');
select throws_ok($$select * from public.worker_open_days('$$ || :'ram' || $$')$$, '42501', null, '... nor see the days');
select throws_ok($$select public.worker_advance('$$ || :'ram' || $$')$$, '42501', null, '... nor the advance');

select * from finish();
rollback;
