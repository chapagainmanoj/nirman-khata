-- Subcontract work: packages, terms, claims, approval, advances and reversal
-- (req §13, §19; acceptance #7; S5 for work-package values; C7 for charges; I-10).
begin;
\ir helpers/helpers.psql
select plan(30);

select tests.create_user('owner') as owner \gset
select tests.create_user('acct') as acct \gset
select tests.create_user('pm') as pm \gset
select tests.create_user('pmnofin') as pmnofin \gset
select tests.create_user('site') as site \gset
select tests.create_company('Sub Nirman', :'owner') as co \gset
select tests.add_member(:'co', :'acct', array['accounts']::public.app_role[], true);
select tests.add_member(:'co', :'pm', array['project_manager']::public.app_role[], true);
select tests.add_member(:'co', :'pmnofin', array['project_manager']::public.app_role[], false);
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
update public.memberships set can_record_payments = true where user_id = :'pm';
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Project A', 1000000000) as pa \gset
select public.create_project(:'co', 'B', 'Project B', 1000000000) as pb \gset
insert into public.subcontractors (company_id, name, work_types) values (:'co', 'Hari Plaster Works', '{Plaster}')
returning id as sub \gset
select tests.logout();
select tests.assign(:'co', :'pa', :'pm');
select tests.assign(:'co', :'pa', :'pmnofin');
select tests.assign(:'co', :'pa', :'site');

-- A package with terms, set by a PM with finance access.
select tests.login(:'pm');
select public.save_work_package(jsonb_build_object(
  'id', '55555555-0000-0000-0000-000000000001', 'project_id', :'pa', 'subcontractor_id', :'sub',
  'scope', 'Plaster, ground floor', 'rate_basis', 'rate', 'unit_id', tests.unit(:'co', 'piece'),
  'terms', jsonb_build_object('agreed_value_paisa', 15000000, 'rate_paisa', 5000, 'quantity', 3000)));
select is((select heading_id from public.work_packages where id = '55555555-0000-0000-0000-000000000001'),
  tests.heading(:'co', 'Subcontract Work'), 'a package defaults to the subcontract heading');
select throws_ok($$select public.save_work_package(jsonb_build_object(
  'id', gen_random_uuid(), 'project_id', '$$ || :'pa' || $$', 'subcontractor_id', '$$ || :'sub' || $$',
  'scope', 'Bad', 'rate_basis', 'lump_sum',
  'terms', jsonb_build_object('agreed_value_paisa', 100, 'rate_paisa', 10, 'quantity', 3)))$$,
  '22023', 'The agreed value must be rate x quantity', 'agreed value must equal rate x quantity');

-- S5: staff without finance see the package scope, never its value or charges.
select tests.login(:'site');
select is((select count(*) from public.work_packages), 1::bigint, 'site staff see the work package on their project');
select is((select count(*) from public.work_package_terms), 0::bigint, 'S5: site staff cannot see the agreed value');
select throws_ok($$select public.save_charge_claim(jsonb_build_object('id', gen_random_uuid(),
  'work_package_id', '55555555-0000-0000-0000-000000000001', 'claimed_paisa', 100))$$,
  '42501', null, 'staff without finance cannot record claims');
select tests.login(:'pmnofin');
select public.save_work_package(jsonb_build_object(
  'id', '55555555-0000-0000-0000-000000000001', 'project_id', :'pa', 'subcontractor_id', :'sub',
  'scope', 'Plaster, ground floor', 'rate_basis', 'rate', 'unit_id', tests.unit(:'co', 'piece'),
  'status', 'in_progress', 'progress_pct', 40));
select tests.logout();
select is((select agreed_value_paisa from public.work_package_terms where id = '55555555-0000-0000-0000-000000000001'),
  15000000::bigint, 'a PM without finance updates progress; the agreed value is kept');
select is((select progress_pct from public.work_packages where id = '55555555-0000-0000-0000-000000000001'),
  40.00::numeric, '... and the progress is saved');

-- Acceptance #7: an advance of 50,000 is cash paid, not cost.
select tests.login(:'pm');
select public.record_payment('66666666-0000-0000-0000-000000000001', jsonb_build_object(
  'id', '66666666-0000-0000-0001-000000000001', 'subcontractor_id', :'sub', 'payment_date', '2026-05-01',
  'amount_paisa', 5000000, 'work_package_id', '55555555-0000-0000-0000-000000000001'));
select tests.logout();
select is(tests.project_cost(:'pa'), 0::bigint, 'acceptance #7: an advance does not increase cost');
select is(tests.ledger(:'sub', :'pa', 'cash_paisa'), 5000000::bigint, '... it is cash paid to the project');
select is(tests.ledger(:'sub', :'pa', 'balance_paisa'), -5000000::bigint, '... and shows as advance (peski)');
select tests.login(:'pm');
select throws_ok($$select public.record_payment(gen_random_uuid(), jsonb_build_object(
  'id', gen_random_uuid(), 'subcontractor_id', '$$ || :'sub' || $$', 'payment_date', '2026-05-01',
  'amount_paisa', 100000, 'work_package_id', '55555555-0000-0000-0000-000000000001',
  'allocations', jsonb_build_array(jsonb_build_object('project_id', '$$ || :'pb' || $$', 'amount_paisa', 100000))))$$,
  'P0001', 'A payment for a work package goes wholly to its project', 'a package payment cannot go to another project');

-- A claim of 90,000 is not cost until approved.
select public.save_charge_claim(jsonb_build_object('id', '77777777-0000-0000-0000-000000000001',
  'work_package_id', '55555555-0000-0000-0000-000000000001', 'charge_date', '2026-05-10',
  'claim_no', 'RA-1', 'description', 'Ground floor walls', 'claimed_paisa', 9000000));
select tests.logout();
select is(tests.project_cost(:'pa'), 0::bigint, 'a claim waiting for approval is not cost');
select tests.login(:'pm');
select throws_ok($$select public.approve_charge(gen_random_uuid(), '77777777-0000-0000-0000-000000000001', 8000000, '2026-05-12', 'Measured')$$,
  '42501', null, 'project managers cannot approve work charges');

select tests.login(:'acct');
select throws_ok($$select public.approve_charge(gen_random_uuid(), '77777777-0000-0000-0000-000000000001', 8000000, '2026-05-12')$$,
  '22023', 'Say why less than the claim is approved', 'approving less than the claim needs a note');
select throws_ok($$select public.approve_charge(gen_random_uuid(), '77777777-0000-0000-0000-000000000001', 9500000, '2026-05-12')$$,
  '22023', null, 'approving more than the claim is refused');
select is((public.approve_charge('88888888-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000001',
  8000000, '2026-05-12', 'Measured 1,600 sq.ft') ->> 'charge_id')::uuid,
  '77777777-0000-0000-0000-000000000001'::uuid, 'Accounts approves 80,000 of the 90,000 claim');
select is((public.approve_charge('88888888-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000001',
  8000000, '2026-05-12', 'Measured 1,600 sq.ft') ->> 'charge_id')::uuid,
  '77777777-0000-0000-0000-000000000001'::uuid, 'a retried approval returns the first result');
select throws_like($$select public.approve_charge(gen_random_uuid(), '77777777-0000-0000-0000-000000000001', 8000000, '2026-05-12', 'x')$$,
  'already_posted%', 'a work charge is approved only once');
select tests.logout();
select is(tests.project_cost(:'pa'), 8000000::bigint, 'acceptance #7: the approved charge creates cost of 80,000');
select is(tests.ledger(:'sub', :'pa', 'balance_paisa'), 3000000::bigint, '... leaving 30,000 payable after the advance');

-- Applying the advance settles 50,000 of the charge; cash and cost do not change.
select tests.login(:'pm');
select public.settle(gen_random_uuid(), jsonb_build_array(jsonb_build_object(
  'payment_id', '66666666-0000-0000-0001-000000000001', 'doc_id', '77777777-0000-0000-0000-000000000001',
  'project_id', :'pa', 'amount_paisa', 5000000)));
select results_eq($$select agreed_value_paisa, approved_paisa, paid_paisa, balance_paisa, remaining_value_paisa
  from public.work_package_figures('$$ || :'pa' || $$')$$,
  $$values (15000000::bigint, 8000000::bigint, 5000000::bigint, 3000000::bigint, 7000000::bigint)$$,
  'package figures: agreed 1,50,000, approved 80,000, paid 50,000, payable 30,000, remaining 70,000');
select is((select settled_paisa from public.charge_summaries where id = '77777777-0000-0000-0000-000000000001'),
  5000000::bigint, 'the charge shows 50,000 settled');
select tests.login(:'pmnofin');
select is((select count(*) from public.work_package_figures(:'pa')), 0::bigint,
  'S5: package figures are hidden from staff without finance');

-- A rejected claim never becomes cost.
select tests.login(:'pm');
select public.save_charge_claim(jsonb_build_object('id', '77777777-0000-0000-0000-000000000002',
  'work_package_id', '55555555-0000-0000-0000-000000000001', 'charge_date', '2026-05-15', 'claimed_paisa', 2000000));
select tests.login(:'acct');
select public.reject_charge('77777777-0000-0000-0000-000000000002', 'Work not done yet');
select throws_ok($$select public.approve_charge(gen_random_uuid(), '77777777-0000-0000-0000-000000000002', 2000000, '2026-05-16')$$,
  'P0001', 'This claim was rejected', 'a rejected claim cannot be approved');

-- C7 for charges: reversing undoes the settlement; cost nets to 0; the advance stays.
select throws_ok($$select public.reverse_cost_entry(gen_random_uuid(), '77777777-0000-0000-0000-000000000001', '2026-05-11', 'x')$$,
  '22023', null, 'a reversal cannot be dated before the approval');
select public.reverse_cost_entry(gen_random_uuid(), '77777777-0000-0000-0000-000000000001', '2026-05-20', 'Measured twice');
select tests.logout();
select is(tests.project_cost(:'pa'), 0::bigint, 'C7: the reversed charge nets cost to 0');
select is(tests.ledger(:'sub', :'pa', 'balance_paisa'), -5000000::bigint, '... and the 50,000 is an advance again');
select is((select sum(amount_paisa)::bigint from public.settlement_events where charge_id = '77777777-0000-0000-0000-000000000001'),
  0::bigint, '... with its settlement undone');
select is((public.project_cost_summary(:'pa', '2026-05-15') ->> 'cost_paisa')::bigint, 8000000::bigint,
  'a report dated before the reversal still shows the charge');

-- I-10 for subcontractors: company balance = project balances + unallocated.
select is((select balance_paisa from public.party_balances(:'co', 'subcontractor') where party_id = :'sub'),
  tests.ledger(:'sub', :'pa', 'balance_paisa') + tests.ledger(:'sub', :'pb', 'balance_paisa') + tests.ledger(:'sub', null, 'balance_paisa'),
  'I-10: the subcontractor balance reconciles');

select * from finish();
rollback;
