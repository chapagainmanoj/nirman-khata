-- A subcontractor paid directly for work done (GLOSSARY: Direct Payment): pay_work_done records the
-- work as an approved charge and pays it, what they hold first, in one step. Also how they are paid
-- (pays_by) and which projects a supplier works on (supplier_projects).
begin;
\ir helpers/helpers.psql
select plan(24);

select tests.create_user('owner') as owner \gset
select tests.create_user('acct') as acct \gset
select tests.create_user('site') as site \gset
select tests.create_user('other') as other \gset
select tests.create_company('Direct Nirman', :'owner') as co \gset
select tests.create_company('Arko Nirman', :'other') as co2 \gset
select tests.add_member(:'co', :'acct', array['accounts']::public.app_role[], true);
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'School', 1000000000) as pa \gset
select public.create_project(:'co', 'B', 'House', 1000000000) as pb \gset
insert into public.subcontractors (company_id, name) values (:'co', 'Plaster Ram Dai') returning id as sub \gset
select public.save_work_package(jsonb_build_object('id', '42000000-0000-0000-0000-000000000001', 'project_id', :'pa',
  'subcontractor_id', :'sub', 'scope', 'Plaster')) as wp \gset
select public.save_work_package(jsonb_build_object('id', '42000000-0000-0000-0000-000000000002', 'project_id', :'pa',
  'subcontractor_id', :'sub', 'scope', 'Old job', 'status', 'cancelled')) as wp_cancelled \gset
select tests.logout();
select tests.assign(:'co', :'pa', :'site');

-- One direct payment, with fresh ids and keys.
create function tests.direct(p_sub uuid, p_package uuid, p_work bigint, p_cash bigint, p_key uuid default gen_random_uuid(),
  p_charge uuid default gen_random_uuid(), p_payment uuid default gen_random_uuid()) returns jsonb
language sql as $$
  select public.pay_work_done(p_key, jsonb_build_object('id', p_payment, 'charge_id', p_charge,
    'approve_op_key', md5(p_key::text || 'a')::uuid, 'pay_op_key', md5(p_key::text || 'p')::uuid,
    'subcontractor_id', p_sub, 'work_package_id', p_package, 'work_paisa', p_work, 'amount_paisa', p_cash,
    'payment_date', '2026-05-10', 'method', 'cash'))
$$;
grant execute on all functions in schema tests to authenticated;

-- pays_by: direct by default; only the two modes.
select is((select pays_by from public.subcontractors where id = :'sub'), 'direct', 'a new subcontractor is paid directly');
select throws_ok($$update public.subcontractors set pays_by = 'monthly' where id = '$$ || :'sub' || $$'$$,
  '23514', null, 'only direct or bills');

-- 5,000 paid in cash for plaster work.
select tests.login(:'acct');
select tests.direct(:'sub', :'wp', 500000, 500000, '42000000-0000-0000-0001-000000000001',
  '42000000-0000-0000-0002-000000000001', '42000000-0000-0000-0003-000000000001') as r1 \gset
select tests.logout();
select is((:'r1'::jsonb ->> 'charge_id')::uuid, '42000000-0000-0000-0002-000000000001'::uuid, 'the work is recorded as a charge');
select results_eq($$select status::text, approved_paisa, approved_date from public.subcontract_charges
    where id = '42000000-0000-0000-0002-000000000001'$$,
  $$values ('approved', 500000::bigint, '2026-05-10'::date)$$, '... approved for the amount on the payment date');
select is((select amount_paisa from public.payments where id = '42000000-0000-0000-0003-000000000001'), 500000::bigint,
  'a cash payment for the amount');
select is((select is_peski from public.payments where id = '42000000-0000-0000-0003-000000000001'), false, '... not peski');
select is(private.doc_settled('42000000-0000-0000-0002-000000000001', :'pa'), 500000::bigint, 'the work is paid in full');
select is(tests.project_cost(:'pa'), 500000::bigint, 'the project cost is the work');
select is(tests.ledger(:'sub', :'pa', 'balance_paisa'), 0::bigint, 'nothing owed');

-- A retry returns the first answer and records nothing twice.
select tests.login(:'acct');
select is(tests.direct(:'sub', :'wp', 500000, 500000, '42000000-0000-0000-0001-000000000001',
  '42000000-0000-0000-0002-000000000001', '42000000-0000-0000-0003-000000000001'), :'r1'::jsonb, 'a retry returns the first answer');
select tests.logout();
select is((select count(*)::int from public.subcontract_charges where work_package_id = :'wp'), 1, '... one charge');
select is((select count(*)::int from public.payments where subcontractor_id = :'sub'), 1, '... one payment');

-- Peski given for the work is used first; only the rest is cash.
select tests.login(:'acct');
select public.record_payment(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'subcontractor_id', :'sub',
  'payment_date', '2026-05-10', 'amount_paisa', 200000, 'work_package_id', :'wp', 'is_peski', true));
select is(public.party_usable_held(:'sub', :'pa', :'wp'), 200000::bigint, 'they hold 2,000 of peski');
select tests.direct(:'sub', :'wp', 300000, 100000) as r2 \gset
select tests.logout();
select results_eq($$select (r ->> 'from_package_paisa')::bigint, (r ->> 'cash_paisa')::bigint from (select '$$ || :'r2' || $$'::jsonb as r) x$$,
  $$values (200000::bigint, 100000::bigint)$$, 'peski first, then 1,000 cash');
select is(tests.project_cost(:'pa'), 800000::bigint, 'the cost is the work, not the cash');
select is(tests.ledger(:'sub', :'pa', 'balance_paisa'), 0::bigint, '... nothing owed and nothing held');

-- Cash that no longer matches what they hold: nothing saved.
select tests.login(:'acct');
select throws_like($$select tests.direct('$$ || :'sub' || $$', '$$ || :'wp' || $$', 100000, 50000)$$,
  'held_changed%', 'too little cash for the work: refused');
select throws_like($$select tests.direct('$$ || :'sub' || $$', '$$ || :'wp' || $$', 100000, 200000)$$,
  'The cash paid cannot be more than the work', 'cash beyond the work: refused');
select throws_like($$select tests.direct('$$ || :'sub' || $$', '$$ || :'wp_cancelled' || $$', 100000, 100000)$$,
  'This work was cancelled', 'cancelled work: refused');
select tests.logout();
select is((select count(*)::int from public.subcontract_charges where work_package_id = :'wp'), 2, 'refused payments left no charge');

-- Who may pay.
select tests.login(:'site');
select throws_ok($$select tests.direct('$$ || :'sub' || $$', '$$ || :'wp' || $$', 100000, 100000)$$,
  '42501', null, 'site staff cannot pay');
select tests.logout();
select tests.login(:'other');
select throws_ok($$select tests.direct('$$ || :'sub' || $$', '$$ || :'wp' || $$', 100000, 100000)$$,
  '42501', null, 'another company cannot pay');
select tests.logout();

-- supplier_projects: a supplier is on a project once it has a bill there; other companies see nothing.
select tests.login(:'owner');
select tests.supplier(:'co', 'Shree Hardware') as sup \gset
select tests.posted_bill(:'co', :'sup', :'pa', 100000);
select results_eq($$select project_id from public.supplier_projects where supplier_id = '$$ || :'sup' || $$'$$,
  $$values ('$$ || :'pa' || $$'::uuid)$$, 'the supplier is on the project it billed');
select tests.logout();
select tests.login(:'other');
select is((select count(*)::int from public.supplier_projects where company_id = :'co'), 0, 'another company sees no links');
select tests.logout();

select * from finish();
rollback;
