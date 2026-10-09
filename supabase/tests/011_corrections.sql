-- Credits, reversals, returns, opening balances and the supplier khata
-- (req §19.1, §20; acceptance #2, #12, #22; C5, C7, C8; R1-R3; I-10).
begin;
\ir helpers/helpers.psql
select plan(33);

create function tests.pay(p_supplier uuid, p_date date, p_amount bigint, p_allocs jsonb default '[]')
returns uuid language sql as $$
  select (public.record_payment(gen_random_uuid(), jsonb_build_object(
    'id', gen_random_uuid(), 'supplier_id', p_supplier, 'payment_date', p_date, 'amount_paisa', p_amount,
    'allocations', (select coalesce(jsonb_agg(jsonb_build_object('project_id', a ->> 0, 'amount_paisa', (a ->> 1)::bigint)), '[]')
                    from jsonb_array_elements(p_allocs) a))) ->> 'payment_id')::uuid
$$;
create function tests.credit(p_bill uuid, p_date date, p_amount bigint) returns uuid
language sql as $$
  select (public.post_credit(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'bill_id', p_bill,
    'credit_date', p_date, 'reason', 'Rate correction', 'lines', jsonb_build_array(jsonb_build_object(
      'bill_line_id', (select id from public.bill_lines where bill_id = p_bill limit 1), 'amount_paisa', p_amount))))
    ->> 'credit_id')::uuid
$$;
grant execute on all functions in schema tests to authenticated;

select tests.create_user('owner') as owner \gset
select tests.create_user('acct') as acct \gset
select tests.create_user('pm') as pm \gset
select tests.create_company('Fix Nirman', :'owner') as co \gset
select tests.add_member(:'co', :'acct', array['accounts']::public.app_role[], true);
select tests.add_member(:'co', :'pm', array['project_manager']::public.app_role[], true);
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Project A', 1000000000) as pa \gset
select public.create_project(:'co', 'B', 'Project B', 1000000000) as pb \gset
select tests.supplier(:'co', 'Reversal Traders') as s1 \gset
select tests.supplier(:'co', 'Credit Traders') as s2 \gset
select tests.supplier(:'co', 'Return Traders') as s3 \gset
select tests.supplier(:'co', 'Move Traders') as s4 \gset
select tests.supplier(:'co', 'Old Traders') as s5 \gset
select tests.supplier(:'co', 'Shared Traders') as s6 \gset
select tests.logout();
select tests.assign(:'co', :'pa', :'pm');

-- Acceptance #12 and #22: bill posted on day 1, reversed on day 10.
select tests.login(:'acct');
select tests.posted_bill(:'co', :'s1', :'pa', 10000000, '2026-05-01') as b1 \gset
select tests.login(:'pm');
select throws_ok($$select public.reverse_bill(gen_random_uuid(), '$$ || :'b1' || $$', '2026-05-10', 'Wrong supplier')$$,
  '42501', null, 'project managers cannot reverse bills');
select tests.login(:'acct');
select public.reverse_bill('44444444-0000-0000-0000-000000000001', :'b1', '2026-05-10', 'Wrong supplier');
select is((public.project_cost_summary(:'pa', '2026-05-05') ->> 'cost_paisa')::bigint, 10000000::bigint,
  'acceptance #22: a report as of day 5 includes the reversed bill');
select is((public.project_cost_summary(:'pa', '2026-05-11') ->> 'cost_paisa')::bigint, 0::bigint,
  'acceptance #22: a report as of day 11 does not');
select is((select status from public.supplier_bills where id = :'b1'), 'reversed'::public.bill_status,
  'acceptance #12: the bill shows as reversed');
select is((select count(*) from public.posting_events where bill_id = :'b1'), 1::bigint,
  'acceptance #12: the original posting is kept');
select is((select reason from public.reversals where bill_id = :'b1'), 'Wrong supplier', '... with the reason for the reversal');
select throws_like($$select public.reverse_bill(gen_random_uuid(), '$$ || :'b1' || $$', '2026-05-10', 'again')$$,
  'already_reversed%', 'C5: a bill is reversed only once');
select is((public.reverse_bill('44444444-0000-0000-0000-000000000001', :'b1', '2026-05-10', 'Wrong supplier') ->> 'reversal_id')::uuid,
  (select id from public.reversals where bill_id = :'b1'), 'a retried reversal returns the first result');
select throws_like($$select public.reverse_bill(gen_random_uuid(), '$$ || :'b1' || $$', '2026-04-01', 'x')$$,
  '%already_reversed%', 'nothing can be reversed twice, whatever the date');

-- C7: bill 1,00,000, credit 20,000 and part payment, then reverse the bill.
select tests.posted_bill(:'co', :'s2', :'pa', 10000000, '2026-05-01') as b2 \gset
select tests.credit(:'b2', '2026-05-02', 2000000) as c2 \gset
select tests.pay(:'s2', '2026-05-03', 8000000, jsonb_build_array(jsonb_build_array(:'pa', 8000000))) as p2 \gset
select public.settle(gen_random_uuid(), jsonb_build_array(jsonb_build_object(
  'payment_id', :'p2', 'bill_id', :'b2', 'project_id', :'pa', 'amount_paisa', 8000000)));
select is((select outstanding_paisa from public.bill_project_status(:'b2')), 0::bigint,
  'after a 20,000 credit, an 80,000 payment settles the bill');
select public.reverse_bill(gen_random_uuid(), :'b2', '2026-05-04', 'Duplicate bill');
select tests.logout();
select is((select status from public.credits where id = :'c2'), 'reversed'::public.doc_status,
  'C7: the credit is reversed in the same step');
select is(tests.ledger(:'s2', :'pa', 'cost_paisa'), 0::bigint, 'C7: cost from the bill nets to 0, not -20,000');
select is(tests.ledger(:'s2', :'pa', 'balance_paisa'), -8000000::bigint, 'C7: the payment is left as an advance of 80,000');
select is((select sum(amount_paisa)::bigint from public.settlement_events where bill_id = :'b2'), 0::bigint,
  'C7: settlements on the reversed bill are undone');

-- A credit that pushes settleable below settled unsettles the excess.
select tests.login(:'acct');
select tests.posted_bill(:'co', :'s2', :'pa', 5000000, '2026-05-05') as b3 \gset
select tests.pay(:'s2', '2026-05-06', 5000000, jsonb_build_array(jsonb_build_array(:'pa', 5000000))) as p3 \gset
select public.settle(gen_random_uuid(), jsonb_build_array(jsonb_build_object(
  'payment_id', :'p3', 'bill_id', :'b3', 'project_id', :'pa', 'amount_paisa', 5000000)));
select tests.credit(:'b3', '2026-05-07', 1000000) as c3 \gset
select is((select settled_paisa from public.bill_project_status(:'b3')), 4000000::bigint,
  'a credit unsettles the excess (settled 50,000 -> 40,000)');
select is((select amount_paisa from public.supplier_open_items(:'s2') where doc_id = :'p3'), 1000000::bigint,
  '... leaving 10,000 of the payment free as an advance');
select public.reverse_credit(gen_random_uuid(), :'c3', '2026-05-08', 'Credit entered twice');
select is((select outstanding_paisa from public.bill_project_status(:'b3')), 1000000::bigint,
  'reversing the credit raises what the bill owes again');

-- C8: payment allocated 60/40, moved to 30/70, then reversed.
select tests.pay(:'s4', '2026-05-01', 10000000, jsonb_build_array(jsonb_build_array(:'pa', 6000000), jsonb_build_array(:'pb', 4000000))) as p4 \gset
select public.allocate_payment(gen_random_uuid(), :'p4', jsonb_build_array(
  jsonb_build_object('project_id', :'pa', 'amount_paisa', -3000000),
  jsonb_build_object('project_id', :'pb', 'amount_paisa', 3000000)), 'Correct split');
select public.reverse_payment(gen_random_uuid(), :'p4', '2026-05-20', 'Cheque bounced');
select tests.logout();
select is(tests.ledger(:'s4', :'pa', 'cash_paisa'), 0::bigint, 'C8: Project A nets to 0');
select is(tests.ledger(:'s4', :'pb', 'cash_paisa'), 0::bigint, 'C8: Project B nets to 0');
select is(tests.ledger(:'s4', null, 'cash_paisa'), 0::bigint, 'C8: the unallocated bucket nets to 0');
select tests.login(:'acct');
select is((public.project_cost_summary(:'pb', '2026-05-19') ->> 'cash_paid_paisa')::bigint, 7000000::bigint,
  'C8: a report dated before the reversal is unchanged (B paid 70,000)');

-- R1-R3: returns after billing.
select tests.login(:'owner');
select public.record_delivery(jsonb_build_object('id', gen_random_uuid(), 'supplier_id', :'s3', 'project_id', :'pa',
  'receipt_date', '2026-05-01', 'no_slip_reason', 'Urgent',
  'lines', jsonb_build_array(jsonb_build_object('id', '55555555-0000-0000-0000-000000000001',
    'material_id', tests.material(:'co', 'Cement'), 'unit_id', tests.unit(:'co', 'bag'), 'received_qty', 100))));
select public.save_bill_draft(jsonb_build_object('id', '55555555-0000-0000-0001-000000000001', 'supplier_id', :'s3',
  'bill_no', 'R-1', 'bill_date', '2026-05-02',
  'lines', jsonb_build_array(jsonb_build_object('id', '55555555-0000-0000-0002-000000000001', 'project_id', :'pa',
    'material_id', tests.material(:'co', 'Cement'), 'qty', 100, 'unit_id', tests.unit(:'co', 'bag'), 'rate_paisa', 100000,
    'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', '55555555-0000-0000-0000-000000000001', 'billed_qty', 100))))));
select public.post_bill(gen_random_uuid(), '55555555-0000-0000-0001-000000000001');
select public.record_return(jsonb_build_object('id', gen_random_uuid(), 'supplier_id', :'s3', 'project_id', :'pa',
  'return_date', '2026-05-03', 'lines', jsonb_build_array(jsonb_build_object(
    'id', '55555555-0000-0000-0003-000000000001', 'delivery_line_id', '55555555-0000-0000-0000-000000000001', 'qty', 20))));
select is((select awaiting_credit_qty from public.delivery_line_status where id = '55555555-0000-0000-0000-000000000001'), 20.000,
  'R1: 20 returned after billing are awaiting credit');
select is(tests.ledger(:'s3', :'pa', 'cost_paisa'), 10000000::bigint, 'R1: the return alone changes no cost');
select public.post_credit(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'bill_id', '55555555-0000-0000-0001-000000000001',
  'credit_date', '2026-05-04', 'reason', '20 bags returned', 'lines', jsonb_build_array(jsonb_build_object(
    'bill_line_id', '55555555-0000-0000-0002-000000000001', 'amount_paisa', 2000000,
    'supplier_return_line_id', '55555555-0000-0000-0003-000000000001', 'credited_qty', 20))));
select is((select awaiting_credit_qty from public.delivery_line_status where id = '55555555-0000-0000-0000-000000000001'), 0.000,
  'R2: the linked credit clears awaiting credit');
select is(tests.ledger(:'s3', :'pa', 'cost_paisa'), 8000000::bigint, 'R2: ... and lowers cost by 20,000');
select public.save_bill_draft(jsonb_build_object('id', '55555555-0000-0000-0001-000000000002', 'supplier_id', :'s3',
  'bill_no', 'R-2', 'bill_date', '2026-05-05',
  'lines', jsonb_build_array(jsonb_build_object('project_id', :'pa',
    'material_id', tests.material(:'co', 'Cement'), 'qty', 20, 'unit_id', tests.unit(:'co', 'bag'), 'rate_paisa', 100000,
    'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', '55555555-0000-0000-0000-000000000001', 'billed_qty', 20))))));
select throws_like($$select public.post_bill(gen_random_uuid(), '55555555-0000-0000-0001-000000000002')$$,
  '%already been billed or returned%', 'R3: returned goods cannot be billed again');

-- Opening balance: unallocated, never project cost; Admin/Accounts only.
select tests.login(:'pm');
select throws_ok($$select public.set_opening_balance(gen_random_uuid(), '$$ || :'s5' || $$', '2026-04-14', 5000000, 'Cutover')$$,
  '42501', null, 'project managers cannot set opening balances');
select tests.login(:'acct');
select (public.set_opening_balance(gen_random_uuid(), :'s5', '2026-04-14', 5000000, 'Balance from the old khata') ->> 'opening_balance_id') as ob \gset
select is((select row(unallocated_paisa, balance_paisa)::text from public.supplier_balances(:'co') where supplier_id = :'s5'),
  '(5000000,5000000)', 'an opening balance of 50,000 is owed at company level');
select tests.logout();
select is((select coalesce(sum(cost_paisa), 0)::bigint from public.ledger_entries where supplier_id = :'s5'), 0::bigint,
  'an opening balance is not project cost');
select tests.login(:'pm');
select is((select count(*) from public.party_opening_balances), 0::bigint, 'opening balances are hidden from project managers');

-- Acceptance #2: one supplier on two projects.
select tests.login(:'acct');
select tests.posted_bill(:'co', :'s6', :'pa', 3000000, '2026-05-01');
select tests.posted_bill(:'co', :'s6', :'pb', 2000000, '2026-05-02');
select tests.pay(:'s6', '2026-05-03', 1000000, jsonb_build_array(jsonb_build_array(:'pa', 1000000)));
select is((select array_agg(balance_paisa order by business_date)::text from public.supplier_khata(:'s6', null, null, :'pa')),
  '{3000000,-1000000}', 'acceptance #2: Project A shows only its own transactions');
select is((select running_balance_paisa from public.supplier_khata(:'s6') order by business_date desc limit 1), 4000000::bigint,
  'acceptance #2: the company khata shows the combined balance');
select tests.login(:'pm');
select is((select count(*) from public.supplier_khata(:'s6')), 2::bigint, 'a PM''s khata shows only their projects');

select * from finish();
rollback;
