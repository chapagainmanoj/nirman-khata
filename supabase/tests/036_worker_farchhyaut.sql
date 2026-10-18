-- Farchhyaut for workers (GLOSSARY: Farchhyaut, Peski, Overpayment): money a worker already holds on
-- a project (paid ahead, or peski) pays their new days first when the days are added to labour cost,
-- so only the rest is owed or paid now; from another project too, moved to the day's project.
begin;
\ir helpers/helpers.psql
select plan(15);

select tests.create_user('owner') as owner \gset
select tests.create_user('acct') as acct \gset
select tests.create_company('Peski Nirman', :'owner') as co \gset
select tests.add_member(:'co', :'acct', array['accounts']::public.app_role[], true);
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Bhandari house', 1000000000) as pa \gset
select public.create_project(:'co', 'B', 'Lakeside', 1000000000) as pb \gset
select tests.logout();
select id as crew_a from public.crews where project_id = :'pa' and is_default \gset
update public.companies set labour_mode = 'attendance' where id = :'co';

create function tests.fa_mark(p_project uuid, p_crew uuid, p_worker uuid, p_date text)
returns jsonb language sql as $$
  select public.set_attendance(jsonb_build_object('project_id', p_project, 'crew_id', p_crew, 'worker_id', p_worker,
    'work_date', p_date, 'minutes', 480))
$$;
-- A payment to a worker, all on one project; settling the given days in full.
create function tests.fa_pay(p_worker uuid, p_project uuid, p_amount bigint, p_peski boolean, p_days uuid[] default '{}')
returns jsonb language sql as $$
  select public.record_payment(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'worker_id', p_worker,
    'payment_date', '2026-05-01', 'amount_paisa', p_amount, 'is_peski', p_peski,
    'allocations', jsonb_build_array(jsonb_build_object('project_id', p_project, 'amount_paisa', p_amount)),
    'settlements', (select coalesce(jsonb_agg(jsonb_build_object('doc_id', l.id, 'project_id', p_project, 'amount_paisa', l.amount_paisa)), '[]')
                    from public.labour_costs l where l.id = any (p_days))))
$$;
create function tests.fa_owes(p_worker uuid) returns bigint language sql as $$
  select coalesce(sum(amount_paisa), 0)::bigint from public.party_open_items(p_worker) where kind = 'labour'
$$;
grant execute on all functions in schema tests to authenticated;

select tests.login(:'acct');
select public.add_crew_worker(:'crew_a', jsonb_build_object('id', gen_random_uuid(), 'name', 'Ram',
  'rate_kind', 'daily', 'rate_paisa', 100000)) as ram \gset
select public.add_crew_worker(:'crew_a', jsonb_build_object('id', gen_random_uuid(), 'name', 'Gopal',
  'rate_kind', 'daily', 'rate_paisa', 80000)) as gopal \gset
select public.add_crew_worker(:'crew_a', jsonb_build_object('id', gen_random_uuid(), 'name', 'Hari',
  'rate_kind', 'daily', 'rate_paisa', 100000)) as hari \gset
select public.add_crew_worker(:'crew_a', jsonb_build_object('id', gen_random_uuid(), 'name', 'Sita',
  'rate_kind', 'daily', 'rate_paisa', 100000)) as sita \gset

-- Paid ahead: Ram is owed 1,000 for 1 May and is paid 1,500, so he holds 500.
select tests.fa_mark(:'pa', :'crew_a', :'ram', '2026-05-01');
select public.close_worker_days(gen_random_uuid(), jsonb_build_object('worker_id', :'ram', 'project_id', :'pa', 'to_date', '2026-05-01'));
select tests.fa_pay(:'ram', :'pa', 150000, false, array(select id from public.labour_costs where worker_id = :'ram'));
select is(tests.ledger(:'ram', :'pa', 'balance_paisa'), -50000::bigint, 'paid 1,500 for 1,000: Ram holds 500');

-- Two more days, added for the whole crew: the 500 comes off the first of them.
select tests.fa_mark(:'pa', :'crew_a', :'ram', '2026-05-02');
select tests.fa_mark(:'pa', :'crew_a', :'ram', '2026-05-03');
select public.close_labour_day(gen_random_uuid(), jsonb_build_object('project_id', :'pa', 'crew_id', :'crew_a',
  'from_date', '2026-05-02', 'to_date', '2026-05-03')) as closed \gset
select is((:'closed'::jsonb ->> 'held_used_paisa')::bigint, 50000::bigint, 'adding days uses the money Ram holds on the project');
select is(tests.fa_owes(:'ram'), 150000::bigint, '... so his days show only 1,500 still owed');
select is((select amount_paisa from public.party_open_items(:'ram') where kind = 'labour' order by doc_date limit 1), 50000::bigint,
  '... taken off the oldest day first');
select is(tests.ledger(:'ram', :'pa', 'balance_paisa'), 150000::bigint, 'his balance is unchanged by the matching');
select is((select count(*) from public.party_open_items(:'ram') where kind = 'payment'), 0::bigint, '... and no money is left unmatched');

-- Peski, then Pay now: Gopal took 300 peski; his 800 day is paid with 500 cash.
select tests.fa_pay(:'gopal', :'pa', 30000, true);
select tests.fa_mark(:'pa', :'crew_a', :'gopal', '2026-05-02');
select public.close_worker_days(gen_random_uuid(), jsonb_build_object('worker_id', :'gopal', 'project_id', :'pa',
  'to_date', '2026-05-02', 'pay_now', jsonb_build_object('method', 'cash'))) as paid \gset
select is((:'paid'::jsonb ->> 'held_used_paisa')::bigint, 30000::bigint, 'pay now first deducts the peski');
select is((select amount_paisa from public.payments where id = (:'paid'::jsonb #>> '{payments,0,payment_id}')::uuid), 50000::bigint,
  '... and pays only the rest in cash');
select is(tests.ledger(:'gopal', :'pa', 'balance_paisa'), 0::bigint, '... leaving Gopal owed nothing');

-- Money on another project is used too: Hari's 200 peski is on Lakeside, his day on Bhandari.
select tests.fa_pay(:'hari', :'pb', 20000, true);
select tests.fa_mark(:'pa', :'crew_a', :'hari', '2026-05-02');
select public.close_worker_days(gen_random_uuid(), jsonb_build_object('worker_id', :'hari', 'project_id', :'pa', 'to_date', '2026-05-02')) as h \gset
select is((:'h'::jsonb ->> 'held_used_paisa')::bigint, 20000::bigint, 'money held on another project is used');
select is(tests.fa_owes(:'hari'), 80000::bigint, '... so 800 of the day is owed');
select results_eq($$select tests.ledger('$$ || :'hari' || $$', '$$ || :'pb' || $$', 'balance_paisa'), tests.ledger('$$ || :'hari' || $$', '$$ || :'pa' || $$', 'balance_paisa')$$,
  $$values (0::bigint, 80000::bigint)$$, '... the peski moved from Lakeside to Bhandari');

-- More peski than the days: Sita keeps the rest, and Pay now pays nothing.
select tests.fa_pay(:'sita', :'pa', 200000, true);
select tests.fa_mark(:'pa', :'crew_a', :'sita', '2026-05-02');
select public.close_worker_days(gen_random_uuid(), jsonb_build_object('worker_id', :'sita', 'project_id', :'pa',
  'to_date', '2026-05-02', 'pay_now', jsonb_build_object('method', 'cash'))) as s \gset
select is(jsonb_array_length(:'s'::jsonb -> 'payments'), 0, 'with enough peski, pay now records no cash payment');
select is(tests.fa_owes(:'sita'), 0::bigint, '... the day is cleared by the peski');
select is(tests.ledger(:'sita', :'pa', 'balance_paisa'), -100000::bigint, '... and Sita still holds 1,000');

select * from finish();
rollback;
