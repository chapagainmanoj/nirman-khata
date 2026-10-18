-- Money a party held before the app (an opening balance "they hold") pays their later work, and
-- pay_subcontractor pays approved work from what they hold first, then cash (GLOSSARY: Farchhyaut).
-- Sources in order, undoing, who may use what, and nothing half done.
begin;
\ir helpers/helpers.psql
select plan(34);

select tests.create_user('owner') as owner \gset
select tests.create_user('acct') as acct \gset
select tests.create_user('pm') as pm \gset
select tests.create_user('site') as site \gset
select tests.create_user('other') as other \gset
select tests.create_company('Opening Nirman', :'owner') as co \gset
select tests.create_company('Arko Nirman', :'other') as co2 \gset
select tests.add_member(:'co', :'acct', array['accounts']::public.app_role[], true);
select tests.add_member(:'co', :'pm', array['project_manager']::public.app_role[], true);
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
update public.memberships set can_record_payments = true where user_id = :'pm';
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'School', 1000000000) as pa \gset
select public.create_project(:'co', 'B', 'House', 1000000000) as pb \gset
insert into public.subcontractors (company_id, name) values (:'co', 'Plaster Ram Dai') returning id as sub \gset
insert into public.subcontractors (company_id, name) values (:'co', 'Owed Tiles') returning id as sub2 \gset
select public.save_work_package(jsonb_build_object('id', '39000000-0000-0000-0000-000000000001', 'project_id', :'pa',
  'subcontractor_id', :'sub', 'scope', 'Plaster', 'terms', jsonb_build_object('agreed_value_paisa', 5000000)));
select public.save_work_package(jsonb_build_object('id', '39000000-0000-0000-0000-000000000002', 'project_id', :'pa',
  'subcontractor_id', :'sub2', 'scope', 'Tiles'));
select tests.logout();
select tests.assign(:'co', :'pa', :'pm');
select tests.assign(:'co', :'pa', :'site');

-- A bill for work, approved as it is saved (as Accounts or Admin do on the package page).
create function tests.oc_bill(p_id uuid, p_package uuid, p_date date, p_amount bigint) returns uuid
language plpgsql as $$
begin
  perform public.save_charge_claim(jsonb_build_object('id', p_id, 'work_package_id', p_package,
    'charge_date', p_date, 'claimed_paisa', p_amount));
  perform public.approve_charge(gen_random_uuid(), p_id, p_amount, p_date);
  return p_id;
end $$;
create function tests.oc_pay(p_sub uuid, p_docs uuid[], p_amount bigint, p_date date) returns jsonb
language sql as $$
  select public.pay_subcontractor(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'subcontractor_id', p_sub,
    'payment_date', p_date, 'amount_paisa', p_amount, 'method', 'cash',
    'docs', (select jsonb_agg(jsonb_build_object('doc_id', d)) from unnest(p_docs) d)))
$$;
grant execute on all functions in schema tests to authenticated;

-- Ram Dai held 10,000 of old peski when the company started; a 2,000 bill comes in.
select tests.login(:'owner');
select (public.set_opening_balance(gen_random_uuid(), :'sub', '2026-05-01', -1000000, 'Peski from the old khata')
  ->> 'opening_balance_id') as ob \gset
select tests.oc_bill('39000000-0000-0000-0001-000000000001', '39000000-0000-0000-0000-000000000001', '2026-05-10', 200000) as c1 \gset
select tests.logout();

select tests.login(:'acct');
select is(public.party_usable_held(:'sub', :'pa', '39000000-0000-0000-0000-000000000001'), 1000000::bigint,
  'Accounts may use the whole opening credit');
select tests.oc_pay(:'sub', array[:'c1'::uuid], 0, '2026-05-10') as r1 \gset
select tests.logout();
select is(:'r1'::jsonb ->> 'payment_id', null, 'the opening credit pays the bill: no cash payment');
select is((:'r1'::jsonb ->> 'from_opening_paisa')::bigint, 200000::bigint, '... 2,000 from the opening balance');
select is(private.doc_settled(:'c1', :'pa'), 200000::bigint, 'the bill is paid');
select is(tests.ledger(:'sub', :'pa', 'balance_paisa'), 0::bigint, 'nothing owed on the project');
select is(tests.ledger(:'sub', null, 'balance_paisa'), -800000::bigint, '8,000 is still held, on no project');
select is(tests.ledger(:'sub', :'pa', 'cash_paisa'), 0::bigint, 'no cash went out');
select is(tests.project_cost(:'pa'), 200000::bigint, 'the cost is the bill');
select tests.login(:'acct');
select results_eq($$select paid_paisa, balance_paisa from public.work_package_figures('$$ || :'pa' || $$')
    where work_package_id = '39000000-0000-0000-0000-000000000001'$$,
  $$values (200000::bigint, 0::bigint)$$, 'the package counts it as paid');
select tests.logout();

-- Package peski first, then the opening credit; cash beyond the bill stays with them on the project.
select tests.login(:'pm');
select public.record_payment(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'subcontractor_id', :'sub',
  'payment_date', '2026-05-11', 'amount_paisa', 150000, 'work_package_id', '39000000-0000-0000-0000-000000000001'));
select tests.logout();
select tests.login(:'owner');
select tests.oc_bill('39000000-0000-0000-0001-000000000002', '39000000-0000-0000-0000-000000000001', '2026-05-12', 500000) as c2 \gset
select tests.logout();
select tests.login(:'acct');
select tests.oc_pay(:'sub', array[:'c2'::uuid], 100000, '2026-05-12') as r2 \gset
select tests.logout();
select results_eq($$select (r ->> 'from_package_paisa')::bigint, (r ->> 'from_opening_paisa')::bigint, (r ->> 'cash_paisa')::bigint
    from (select '$$ || :'r2' || $$'::jsonb as r) x$$,
  $$values (150000::bigint, 350000::bigint, 100000::bigint)$$, 'package peski, then the opening credit, then cash');
select is(private.doc_settled(:'c2', :'pa'), 500000::bigint, '... the bill is paid in full');
select is(tests.ledger(:'sub', null, 'balance_paisa'), -450000::bigint, '... 4,500 still held on no project');
select is(tests.ledger(:'sub', :'pa', 'balance_paisa'), -100000::bigint, '... and the extra 1,000 cash on the project');
select is((select is_peski from public.payments where id = (:'r2'::jsonb ->> 'payment_id')::uuid), false, 'the cash is not peski');

-- A PM uses money held on the project, but not the opening credit on no project.
select tests.login(:'owner');
select tests.oc_bill('39000000-0000-0000-0001-000000000003', '39000000-0000-0000-0000-000000000001', '2026-05-13', 150000) as c3 \gset
select tests.logout();
select tests.login(:'pm');
select is(public.party_usable_held(:'sub', :'pa', null), 100000::bigint, 'a PM may use what is held on the project only');
select tests.oc_pay(:'sub', array[:'c3'::uuid], 50000, '2026-05-13') as r3 \gset
select tests.logout();
select results_eq($$select (r ->> 'held_used_paisa')::bigint, (r ->> 'from_opening_paisa')::bigint
    from (select '$$ || :'r3' || $$'::jsonb as r) x$$,
  $$values (100000::bigint, 0::bigint)$$, '... and pays the rest in cash');
select is(private.doc_settled(:'c3', :'pa'), 150000::bigint, '... the bill is paid');

-- op_key: a retry returns the first answer; a different request with the same key is refused.
select tests.login(:'owner');
select tests.oc_bill('39000000-0000-0000-0001-000000000004', '39000000-0000-0000-0000-000000000001', '2026-05-14', 50000) as c4 \gset
select public.pay_subcontractor('39000000-0000-0000-0002-000000000001', jsonb_build_object('id', '39000000-0000-0000-0003-000000000001',
  'subcontractor_id', :'sub', 'payment_date', '2026-05-14', 'amount_paisa', 0,
  'docs', jsonb_build_array(jsonb_build_object('doc_id', :'c4')))) as r4 \gset
select is(public.pay_subcontractor('39000000-0000-0000-0002-000000000001', jsonb_build_object('id', '39000000-0000-0000-0003-000000000001',
  'subcontractor_id', :'sub', 'payment_date', '2026-05-14', 'amount_paisa', 0,
  'docs', jsonb_build_array(jsonb_build_object('doc_id', :'c4')))), :'r4'::jsonb, 'a retry returns the first answer');
select is(private.doc_settled(:'c4', :'pa'), 50000::bigint, '... and pays only once');
select throws_like($$select public.pay_subcontractor('39000000-0000-0000-0002-000000000001', jsonb_build_object(
  'id', gen_random_uuid(), 'subcontractor_id', '$$ || :'sub' || $$', 'amount_paisa', 100,
  'docs', jsonb_build_array(jsonb_build_object('doc_id', '$$ || :'c4' || $$'))))$$, 'op_key_reused%', 'a reused key is refused');
select throws_like($$select tests.oc_pay('$$ || :'sub' || $$', array['$$ || :'c4' || $$'::uuid], 0, '2026-05-14')$$,
  'already_paid%', 'paid work cannot be paid again');

-- Matching by hand from the opening credit, and the open items list it.
select tests.oc_bill('39000000-0000-0000-0001-000000000005', '39000000-0000-0000-0000-000000000001', '2026-05-15', 30000) as c5 \gset
select is((select sum(amount_paisa) from public.party_open_items(:'sub') where kind = 'opening')::bigint, 400000::bigint,
  'the open items show the opening credit left');
select public.settle(gen_random_uuid(), jsonb_build_array(jsonb_build_object('opening_balance_id', :'ob',
  'doc_id', :'c5', 'project_id', :'pa', 'amount_paisa', 30000)));
select is(private.doc_settled(:'c5', :'pa'), 30000::bigint, 'an opening credit can be matched by hand');

-- Undoing: reversing a bill gives its opening credit back to the project.
select public.reverse_cost_entry(gen_random_uuid(), :'c5', '2026-05-16', 'Entered twice');
select is(private.doc_settled(:'c5', :'pa'), 0::bigint, 'reversing a bill undoes what paid it');
select is(tests.ledger(:'sub', :'pa', 'balance_paisa'), -30000::bigint, '... the credit is held on the project again');

-- Reversing the opening balance undoes everything it paid, then itself.
select public.reverse_opening_balance(gen_random_uuid(), :'ob', '2026-05-20', 'Wrong amount');
select is(private.doc_settled(:'c1', :'pa'), 0::bigint, 'the bill it paid is unpaid again');
select is(tests.ledger(:'sub', :'pa', 'balance_paisa'), 600000::bigint, '... what it paid is owed on the project again');
select is(tests.ledger(:'sub', null, 'balance_paisa'), 0::bigint, '... and nothing is held on no project');
select throws_like($$select public.reverse_opening_balance(gen_random_uuid(), '$$ || :'ob' || $$', '2026-05-20', 'Again')$$,
  'already_reversed%', 'it cannot be reversed twice');

-- An opening balance owed to them is never used to pay.
select public.set_opening_balance(gen_random_uuid(), :'sub2', '2026-05-01', 300000, 'Owed from before');
select tests.oc_bill('39000000-0000-0000-0001-000000000006', '39000000-0000-0000-0000-000000000002', '2026-05-10', 100000) as c6 \gset
select is((tests.oc_pay(:'sub2', array[:'c6'::uuid], 100000, '2026-05-10') ->> 'held_used_paisa')::bigint, 0::bigint,
  'an opening balance owed to them pays nothing');
select tests.logout();

-- A settlement has exactly one source.
select throws_ok($$insert into public.settlement_events (company_id, project_id, charge_id, amount_paisa, business_date)
  values ('$$ || :'co' || $$', '$$ || :'pa' || $$', '$$ || :'c6' || $$', 1, '2026-05-10')$$,
  '23514', null, 'a settlement needs a payment or an opening balance');

-- Who may pay.
select tests.login(:'site');
select throws_ok($$select tests.oc_pay('$$ || :'sub' || $$', array['$$ || :'c3' || $$'::uuid], 100, '2026-05-13')$$,
  '42501', null, 'site staff cannot pay');
select tests.login(:'other');
select throws_ok($$select tests.oc_pay('$$ || :'sub' || $$', array['$$ || :'c3' || $$'::uuid], 100, '2026-05-13')$$,
  '42501', null, 'another company cannot pay');
select throws_ok($$select public.party_usable_held('$$ || :'sub' || $$', '$$ || :'pa' || $$')$$,
  '42501', null, '... nor see what they hold');
select tests.logout();

select * from finish();
rollback;
