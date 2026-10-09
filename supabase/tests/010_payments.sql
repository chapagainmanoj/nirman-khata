-- Payments, project allocation and settlement (req §12; acceptance #5, #6, #13, #16, #20, #21;
-- I-4, I-5, I-6, I-9, I-10; C3, C4, C6; S5).
begin;
\ir helpers/helpers.psql
select plan(36);

-- Pay a supplier; allocations is [[project, paisa], ...].
create function tests.pay(p_supplier uuid, p_date date, p_amount bigint, p_allocs jsonb default '[]', p_key uuid default null)
returns uuid language sql as $$
  select (public.record_payment(coalesce(p_key, gen_random_uuid()), jsonb_build_object(
    'id', gen_random_uuid(), 'supplier_id', p_supplier, 'payment_date', p_date, 'amount_paisa', p_amount,
    'allocations', (select coalesce(jsonb_agg(jsonb_build_object('project_id', a ->> 0, 'amount_paisa', (a ->> 1)::bigint)), '[]')
                    from jsonb_array_elements(p_allocs) a))) ->> 'payment_id')::uuid
$$;
grant execute on function tests.pay to authenticated;

select tests.create_user('owner') as owner \gset
select tests.create_user('acct') as acct \gset
select tests.create_user('pm') as pm \gset
select tests.create_user('pm2') as pm2 \gset
select tests.create_company('Pay Nirman', :'owner') as co \gset
select tests.add_member(:'co', :'acct', array['accounts']::public.app_role[], true);
select tests.add_member(:'co', :'pm', array['project_manager']::public.app_role[], true);
select tests.add_member(:'co', :'pm2', array['project_manager']::public.app_role[], true);
update public.memberships set can_record_payments = true where user_id = :'pm';

select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Project A', 1000000000) as pa \gset
select public.create_project(:'co', 'B', 'Project B', 1000000000) as pb \gset
select public.create_project(:'co', 'C', 'Project C', 1000000000) as pc \gset
select tests.supplier(:'co', 'Supplier X') as sx \gset
select tests.supplier(:'co', 'Supplier Y') as sy \gset
select tests.supplier(:'co', 'Supplier Z') as sz \gset
select tests.supplier(:'co', 'Supplier W') as sw \gset
select tests.supplier(:'co', 'Supplier V') as sv \gset
select tests.logout();
select tests.assign(:'co', :'pa', :'pm');
select tests.assign(:'co', :'pa', :'pm2');

-- Acceptance #5: bill 1,00,000 and payment 60,000.
select tests.login(:'acct');
select tests.posted_bill(:'co', :'sx', :'pa', 10000000) as bill_x \gset
select public.record_payment('11111111-0000-0000-0000-000000000001', jsonb_build_object(
  'id', '22222222-0000-0000-0000-000000000001', 'supplier_id', :'sx', 'payment_date', '2026-05-10', 'amount_paisa', 6000000,
  'method', 'bank_transfer', 'reference', 'NIC-001',
  'allocations', jsonb_build_array(jsonb_build_object('project_id', :'pa', 'amount_paisa', 6000000)))) ->> 'number' as pay_no \gset
select tests.logout();
select is(tests.ledger(:'sx', :'pa', 'cost_paisa'), 10000000::bigint, 'acceptance #5: cost 1,00,000');
select is(tests.ledger(:'sx', :'pa', 'cash_paisa'), 6000000::bigint, 'acceptance #5: cash paid 60,000');
select is(tests.ledger(:'sx', :'pa', 'balance_paisa'), 4000000::bigint, 'acceptance #5: payable 40,000');
select is((select count(*) from public.ledger_entries where event_type = 'payment_post' and cost_paisa <> 0), 0::bigint,
  'I-6: payments never add cost');

-- Acceptance #13 and C3: retries.
select tests.login(:'acct');
select is(public.record_payment('11111111-0000-0000-0000-000000000001', jsonb_build_object(
  'id', '22222222-0000-0000-0000-000000000001', 'supplier_id', :'sx', 'payment_date', '2026-05-10', 'amount_paisa', 6000000,
  'method', 'bank_transfer', 'reference', 'NIC-001',
  'allocations', jsonb_build_array(jsonb_build_object('project_id', :'pa', 'amount_paisa', 6000000)))) ->> 'number',
  :'pay_no'::text, 'acceptance #13: resubmitting the same payment returns the first result');
select is((select count(*) from public.payments where supplier_id = :'sx'), 1::bigint, '... and does not duplicate it');
select throws_like($$select public.record_payment('11111111-0000-0000-0000-000000000001', jsonb_build_object(
  'id', '22222222-0000-0000-0000-000000000001', 'supplier_id', '$$ || :'sx' || $$', 'payment_date', '2026-05-10',
  'amount_paisa', 7000000))$$, 'op_key_reused%', 'C3: the same key with different input is rejected');
select tests.login(:'owner');
select throws_like($$select public.record_payment('11111111-0000-0000-0000-000000000001', jsonb_build_object(
  'id', '22222222-0000-0000-0000-000000000001', 'supplier_id', '$$ || :'sx' || $$', 'payment_date', '2026-05-10', 'amount_paisa', 6000000,
  'method', 'bank_transfer', 'reference', 'NIC-001',
  'allocations', jsonb_build_array(jsonb_build_object('project_id', '$$ || :'pa' || $$', 'amount_paisa', 6000000))))$$,
  'op_key_reused%', 'C3: a key reused by a different user is rejected');

-- C4: retry after permission is revoked returns nothing.
select tests.login(:'pm');
select tests.pay(:'sx', '2026-05-11', 100000, jsonb_build_array(jsonb_build_array(:'pa', 100000)),
  '11111111-0000-0000-0000-000000000002');
select tests.logout();
delete from public.project_assignments where project_id = :'pa' and user_id = :'pm';
select tests.login(:'pm');
select throws_ok($$select tests.pay('$$ || :'sx' || $$', '2026-05-11', 100000,
  jsonb_build_array(jsonb_build_array('$$ || :'pa' || $$', 100000)), '11111111-0000-0000-0000-000000000002')$$,
  '42501', null, 'C4: a retry after losing project access is rejected');
select tests.logout();
select tests.assign(:'co', :'pa', :'pm');
update public.memberships set active = false where user_id = :'pm';
select tests.login(:'pm');
select throws_ok($$select tests.pay('$$ || :'sx' || $$', '2026-05-11', 100000,
  jsonb_build_array(jsonb_build_array('$$ || :'pa' || $$', 100000)), '11111111-0000-0000-0000-000000000002')$$,
  '42501', null, 'C4: a retry after the user is deactivated is rejected');
select tests.logout();
update public.memberships set active = true where user_id = :'pm';

-- Who records payments and how much they must allocate.
select tests.login(:'pm');
select throws_ok($$select tests.pay('$$ || :'sx' || $$', '2026-05-11', 100000,
  jsonb_build_array(jsonb_build_array('$$ || :'pa' || $$', 50000)))$$,
  '42501', null, 'a PM must allocate the whole payment to their projects');
select tests.login(:'pm2');
select throws_ok($$select tests.pay('$$ || :'sx' || $$', '2026-05-11', 100000,
  jsonb_build_array(jsonb_build_array('$$ || :'pa' || $$', 100000)))$$,
  '42501', null, 'a PM without the payment permission cannot record payments');

-- C6: one payment split across 3 projects plus an unallocated part is one event with 4 rows.
select tests.login(:'acct');
select (public.record_payment('11111111-0000-0000-0000-000000000003', jsonb_build_object(
  'id', '22222222-0000-0000-0000-000000000003', 'supplier_id', :'sv', 'payment_date', '2026-05-12', 'amount_paisa', 1000000,
  'allocations', jsonb_build_array(
    jsonb_build_object('project_id', :'pa', 'amount_paisa', 300000),
    jsonb_build_object('project_id', :'pb', 'amount_paisa', 300000),
    jsonb_build_object('project_id', :'pc', 'amount_paisa', 300000)))) ->> 'event_id') as ev \gset
select is((select count(*) from public.ledger_entries where event_id = :'ev'), 4::bigint,
  'C6: three projects and the unallocated part are four rows of one event');
select public.record_payment('11111111-0000-0000-0000-000000000003', jsonb_build_object(
  'id', '22222222-0000-0000-0000-000000000003', 'supplier_id', :'sv', 'payment_date', '2026-05-12', 'amount_paisa', 1000000,
  'allocations', jsonb_build_array(
    jsonb_build_object('project_id', :'pa', 'amount_paisa', 300000),
    jsonb_build_object('project_id', :'pb', 'amount_paisa', 300000),
    jsonb_build_object('project_id', :'pc', 'amount_paisa', 300000))));
select is((select count(*) from public.ledger_entries where supplier_id = :'sv'), 4::bigint, 'C6: a replay writes no rows');

-- S5: unallocated amounts are company-level (Admin and Accounts only).
select tests.login(:'pm2');
select is((select count(*) from public.ledger_entries where supplier_id = :'sv'), 1::bigint,
  'S5: a finance PM sees only their project''s part of the payment');
select is((select count(*) from public.payments where supplier_id = :'sv'), 0::bigint,
  'S5: ... and not a payment with an unallocated part');
select is((select count(*) from public.payments where supplier_id = :'sx'), 2::bigint,
  'a fully allocated payment on their project is visible');

-- Acceptance #6: a payment before any bill is an advance; a later bill consumes it.
select tests.login(:'acct');
select tests.pay(:'sy', '2026-05-01', 5000000, jsonb_build_array(jsonb_build_array(:'pa', 5000000))) as pay_y \gset
select tests.logout();
select is(tests.ledger(:'sy', :'pa', 'balance_paisa'), -5000000::bigint, 'acceptance #6: payment before a bill is an advance (peski)');
select tests.login(:'acct');
select tests.posted_bill(:'co', :'sy', :'pa', 3000000, '2026-05-15') as bill_y \gset
select public.settle(gen_random_uuid(), jsonb_build_array(jsonb_build_object(
  'payment_id', :'pay_y', 'bill_id', :'bill_y', 'project_id', :'pa', 'amount_paisa', 3000000)));
select tests.logout();
select is(tests.ledger(:'sy', :'pa', 'balance_paisa'), -2000000::bigint, 'acceptance #6: the bill consumes the advance');
select is(tests.ledger(:'sy', null, 'cash_paisa') + tests.ledger(:'sy', :'pa', 'cash_paisa'), 5000000::bigint,
  '... without a new payment');
select is((select outstanding_paisa from public.bill_project_status(:'bill_y')), 0::bigint, 'the bill shows as settled');
select is((select business_date from public.settlement_events where bill_id = :'bill_y'), '2026-05-15'::date,
  'a settlement is dated no earlier than the bill');

-- Acceptance #16: 1,00,000 split 60,000/40,000, later matched to Project A bills.
select tests.login(:'acct');
select tests.posted_bill(:'co', :'sz', :'pa', 3500000, '2026-05-01') as bz1 \gset
select tests.posted_bill(:'co', :'sz', :'pa', 2500000, '2026-05-02') as bz2 \gset
select tests.pay(:'sz', '2026-05-05', 10000000, jsonb_build_array(jsonb_build_array(:'pa', 6000000), jsonb_build_array(:'pb', 4000000))) as pz \gset
select public.settle(gen_random_uuid(), jsonb_build_array(
  jsonb_build_object('payment_id', :'pz', 'bill_id', :'bz1', 'project_id', :'pa', 'amount_paisa', 3500000),
  jsonb_build_object('payment_id', :'pz', 'bill_id', :'bz2', 'project_id', :'pa', 'amount_paisa', 2500000)));
select tests.logout();
select is(tests.ledger(:'sz', :'pa', 'cash_paisa'), 6000000::bigint, 'acceptance #16: Project A cash paid stays 60,000');
select is(tests.ledger(:'sz', :'pb', 'cash_paisa'), 4000000::bigint, 'acceptance #16: Project B cash paid stays 40,000');
select is((select balance_paisa from public.supplier_balances(:'co') where supplier_id = :'sz'),
  tests.ledger(:'sz', :'pa', 'balance_paisa') + tests.ledger(:'sz', :'pb', 'balance_paisa') + tests.ledger(:'sz', null, 'balance_paisa'),
  'I-10: company balance = project balances + unallocated');

-- I-5: settlement limits.
select tests.login(:'acct');
select throws_like($$select public.settle(gen_random_uuid(), jsonb_build_array(jsonb_build_object(
  'payment_id', '$$ || :'pz' || $$', 'bill_id', '$$ || :'bz1' || $$', 'project_id', '$$ || :'pa' || $$', 'amount_paisa', 1)))$$,
  '%allocated to this project%', 'I-5: no settlement beyond the payment''s project allocation');
select throws_like($$select public.allocate_payment(gen_random_uuid(), '$$ || :'pz' || $$',
  jsonb_build_array(jsonb_build_object('project_id', '$$ || :'pa' || $$', 'amount_paisa', -100)), 'move')$$,
  '%already matched%', 'I-5: allocation cannot drop below what is settled');
select throws_like($$select public.allocate_payment(gen_random_uuid(), '$$ || :'pz' || $$',
  jsonb_build_array(jsonb_build_object('project_id', '$$ || :'pc' || $$', 'amount_paisa', 100)), 'move')$$,
  '%more than the payment%', 'I-4: allocations cannot exceed the payment');

-- Unsettle keeps the money as an advance in the project.
select public.unsettle(gen_random_uuid(), :'pz', :'bz2', :'pa', 2500000, 'Matched to the wrong bill');
select tests.logout();
select is((select outstanding_paisa from public.bill_project_status(:'bz2')), 2500000::bigint, 'unsettling reopens the bill');
select is(tests.ledger(:'sz', :'pa', 'cash_paisa'), 6000000::bigint, '... and leaves cash paid unchanged');

-- Acceptance #20: Project A bills 1,00,000, unallocated payment 20,000.
select tests.login(:'acct');
select tests.posted_bill(:'co', :'sw', :'pa', 10000000) as bw \gset
select tests.pay(:'sw', '2026-05-20', 2000000) as pw \gset
select is((select row(project_balance_paisa, unallocated_paisa, balance_paisa)::text from public.supplier_balances(:'co') where supplier_id = :'sw'),
  '(10000000,-2000000,8000000)', 'acceptance #20: A +1,00,000, unallocated -20,000, company payable 80,000');

-- Moving it to Project A later is dated on the payment (I-9).
select public.allocate_payment(gen_random_uuid(), :'pw', jsonb_build_array(jsonb_build_object('project_id', :'pa', 'amount_paisa', 2000000)),
  'Belongs to the school');
select tests.logout();
select is((select max(business_date) from public.ledger_entries where event_type = 'allocation_move' and supplier_id = :'sw'),
  '2026-05-20'::date, 'I-9: an allocation move uses the payment''s date');
select is(tests.ledger(:'sw', :'pa', 'balance_paisa'), 8000000::bigint, 'the project now shows the payment');
select is(tests.ledger(:'sw', null, 'balance_paisa'), 0::bigint, '... and unallocated is empty');

-- Acceptance #21: recoverable VAT; a 1,13,000 payment settles the 1,13,000 bill.
update public.companies set vat_treatment = 'vat_recoverable' where id = :'co';
select tests.login(:'acct');
select public.save_bill_draft(jsonb_build_object('id', '33333333-0000-0000-0000-000000000001', 'supplier_id', :'sw',
  'bill_no', 'VAT-1', 'bill_date', '2026-05-21', 'vat_paisa', 1300000,
  'lines', jsonb_build_array(jsonb_build_object('project_id', :'pb', 'heading_id', tests.heading(:'co', 'Cement'),
    'description', 'Cement', 'qty', 1, 'unit_id', tests.unit(:'co', 'bag'), 'amount_paisa', 10000000, 'unmatched_reason', 'x'))));
select public.post_bill(gen_random_uuid(), '33333333-0000-0000-0000-000000000001');
select tests.pay(:'sw', '2026-05-22', 11300000, jsonb_build_array(jsonb_build_array(:'pb', 11300000))) as pv \gset
select public.settle(gen_random_uuid(), jsonb_build_array(jsonb_build_object(
  'payment_id', :'pv', 'bill_id', '33333333-0000-0000-0000-000000000001', 'project_id', :'pb', 'amount_paisa', 11300000)));
select is((select outstanding_paisa from public.bill_project_status('33333333-0000-0000-0000-000000000001')), 0::bigint,
  'acceptance #21: a 1,13,000 payment fully settles the bill');
select tests.logout();
select is(tests.ledger(:'sw', :'pb', 'cost_paisa'), 10000000::bigint, 'acceptance #21: project cost stays 1,00,000');

select * from finish();
rollback;
