-- Own labour and other expenses (req §14, §15; acceptance #8, #18; L1, L3; I-7, I-8; S2 for X2).
begin;
\ir helpers/helpers.psql
select plan(34);

select tests.create_user('owner') as owner \gset
select tests.create_user('acct') as acct \gset
select tests.create_user('site') as site \gset
select tests.create_user('site2') as site2 \gset
select tests.create_user('viewer') as viewer \gset
select tests.create_company('Labour Nirman', :'owner') as co \gset
select tests.add_member(:'co', :'acct', array['accounts']::public.app_role[], true);
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
select tests.add_member(:'co', :'site2', array['site_staff']::public.app_role[], false);
select tests.add_member(:'co', :'viewer', array['viewer']::public.app_role[], false);
update public.memberships set can_record_payments = true where user_id = :'site';
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Project A', 1000000000) as pa \gset
select public.create_project(:'co', 'B', 'Project B', 1000000000) as pb \gset
select tests.logout();
select tests.assign(:'co', :'pa', :'site');
select tests.assign(:'co', :'pa', :'site2');
select tests.assign(:'co', :'pa', :'viewer');
select id as crew from public.crews where project_id = :'pa' and is_default \gset

select is((select count(*) from public.crews where project_id in (:'pa', :'pb') and is_default), 2::bigint,
  'every new project gets a default crew');

-- Acceptance #8 and L3: crew cost without workers, paid now; counted once.
select tests.login(:'site');
select public.save_labour_cost('aaaa0000-0000-0000-0000-000000000001', jsonb_build_object(
  'id', 'aaaa0000-0000-0000-0001-000000000001', 'project_id', :'pa', 'work_date', '2026-05-04',
  'work_type', 'Mixed', 'amount_paisa', 500000, 'pay_now', jsonb_build_object('method', 'cash'))) as r1 \gset
select tests.logout();
select is(tests.project_cost(:'pa'), 500000::bigint, 'acceptance #8: crew cost of 5,000 entered without workers');
select is(tests.ledger(:'crew', :'pa', 'cash_paisa'), 500000::bigint, 'L3: cash paid equals the amount');
select is(tests.ledger(:'crew', :'pa', 'balance_paisa'), 0::bigint, 'L3: paying it does not count it again (nothing owed)');
select is((select settled_paisa from public.labour_cost_summaries where id = 'aaaa0000-0000-0000-0001-000000000001'),
  500000::bigint, 'L3: the entry shows as paid');
select is((select heading_id from public.labour_costs where id = 'aaaa0000-0000-0000-0001-000000000001'),
  tests.heading(:'co', 'Own Labour (Jyala)'), 'labour goes to the Own Labour heading by default');
select is((select count(*) from public.posting_events where op_key = 'aaaa0000-0000-0000-0000-000000000001'),
  2::bigint, 'I-8: the cost and the payment are posted under one op_key');

-- Retry of the same save returns the same result and writes nothing new.
select tests.login(:'site');
select is(public.save_labour_cost('aaaa0000-0000-0000-0000-000000000001', jsonb_build_object(
  'id', 'aaaa0000-0000-0000-0001-000000000001', 'project_id', :'pa', 'work_date', '2026-05-04',
  'work_type', 'Mixed', 'amount_paisa', 500000, 'pay_now', jsonb_build_object('method', 'cash'))), :'r1'::jsonb,
  'a retried save returns the first result');

-- X2: the creator sees their own entry; another site staff member and the viewer do not.
select is((select amount_paisa from public.labour_costs where id = 'aaaa0000-0000-0000-0001-000000000001'),
  500000::bigint, 'X2: site staff see the amount of their own entry');
select tests.login(:'site2');
select is((select count(*) from public.labour_costs), 0::bigint, 'X2: other staff without finance see no labour amounts');
select tests.login(:'viewer');
select is((select count(*) from public.labour_costs), 0::bigint, '... nor does a viewer');
select throws_ok($$select public.save_labour_cost(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(),
  'project_id', '$$ || :'pa' || $$', 'work_date', '2026-05-04', 'amount_paisa', 100))$$, '42501', null,
  'viewers cannot enter labour');
select tests.logout();
select ok(not private.is_own_recent_entry(:'co', :'pa', :'site', now() - interval '8 days', 'posted'),
  'X2 ends 7 days after the entry was made');
select ok(not private.is_own_recent_entry(:'co', :'pa', :'site', now(), 'reversed'), 'X2 ends when the entry is reversed');

-- Staff without payment permission can save unpaid only.
select tests.login(:'site2');
select throws_ok($$select public.save_labour_cost(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(),
  'project_id', '$$ || :'pa' || $$', 'work_date', '2026-05-05', 'amount_paisa', 100,
  'pay_now', jsonb_build_object('method', 'cash')))$$, '42501', null, 'X3: pay now needs payment permission');

-- Near-duplicate: same crew, project and day needs confirmation.
select tests.login(:'site');
select throws_like($$select public.save_labour_cost(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(),
  'project_id', '$$ || :'pa' || $$', 'work_date', '2026-05-04', 'amount_paisa', 200000))$$,
  'near_duplicate%', 'a second entry for the same crew and day asks for confirmation');
select lives_ok($$select public.save_labour_cost(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(),
  'project_id', '$$ || :'pa' || $$', 'work_date', '2026-05-04', 'amount_paisa', 200000, 'confirm_duplicate', true))$$,
  '... and is saved once confirmed');
select throws_ok($$select public.save_labour_cost(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(),
  'project_id', '$$ || :'pa' || $$', 'work_date', (current_date + 2)::text, 'amount_paisa', 100))$$,
  '22023', null, 'labour cannot be entered for a future date');

-- Acceptance #18 and L1: a 7-day entry of 70,000 makes 7 daily records of 10,000.
select tests.logout();
select tests.assign(:'co', :'pb', :'site');
select tests.login(:'site');
select public.save_labour_batch('bbbb0000-0000-0000-0000-000000000002', jsonb_build_object(
  'id', 'bbbb0000-0000-0000-0001-000000000002', 'project_id', :'pb', 'from_date', '2026-05-11', 'to_date', '2026-05-17',
  'work_type', 'Dakarmi', 'total_paisa', 7000000)) as r2 \gset
select tests.logout();
select results_eq($$select work_date, amount_paisa from public.labour_costs
  where batch_id = 'bbbb0000-0000-0000-0001-000000000002' order by work_date$$,
  $$select d::date, 1000000::bigint from generate_series('2026-05-11'::date, '2026-05-17'::date, '1 day') d$$,
  'acceptance #18: one record of 10,000 on each work date');
select tests.login(:'site');
select is(public.save_labour_batch('bbbb0000-0000-0000-0000-000000000002', jsonb_build_object(
  'id', 'bbbb0000-0000-0000-0001-000000000002', 'project_id', :'pb', 'from_date', '2026-05-11', 'to_date', '2026-05-17',
  'work_type', 'Dakarmi', 'total_paisa', 7000000)), :'r2'::jsonb, 'L1: a retry after a timeout returns the first result');
select throws_like($$select public.save_labour_batch(gen_random_uuid(), jsonb_build_object(
  'id', 'bbbb0000-0000-0000-0001-000000000002', 'project_id', '$$ || :'pb' || $$', 'from_date', '2026-05-11',
  'to_date', '2026-05-17', 'total_paisa', 7000000, 'confirm_duplicate', true))$$,
  'This weekly entry was already saved%', 'L1: the same week cannot be saved twice under a new key');
select tests.logout();
select is((select count(*) from public.labour_costs where project_id = :'pb'), 7::bigint, 'L1: 7 rows, not 14');
select tests.login(:'site');
select public.save_labour_batch(gen_random_uuid(), jsonb_build_object(
  'id', 'bbbb0000-0000-0000-0001-000000000003', 'project_id', :'pb', 'from_date', '2026-05-18', 'to_date', '2026-05-20',
  'total_paisa', 1000001));
select tests.logout();
select is((select array_agg(amount_paisa order by work_date) from public.labour_costs where batch_id = 'bbbb0000-0000-0000-0001-000000000003'),
  array[333334, 333334, 333333]::bigint[], 'an uneven total is split to the paisa, leftovers to the first days');

-- Expenses: a typed payee is created once, then reused; paid now or left unpaid.
select tests.login(:'site');
select public.save_expense(gen_random_uuid(), jsonb_build_object(
  'id', 'cccc0000-0000-0000-0001-000000000001', 'project_id', :'pa', 'heading_id', tests.heading(:'co', 'Equipment / Machinery Hire'),
  'expense_date', '2026-05-06', 'amount_paisa', 1200000, 'description', 'JCB 4 hours',
  'payee', jsonb_build_object('name', 'Shyam JCB', 'kind', 'JCB owner'))) ->> 'payee_id' as jcb \gset
select public.save_expense(gen_random_uuid(), jsonb_build_object(
  'id', 'cccc0000-0000-0000-0001-000000000002', 'project_id', :'pa', 'heading_id', tests.heading(:'co', 'Equipment / Machinery Hire'),
  'expense_date', '2026-05-07', 'amount_paisa', 600000, 'description', 'JCB 2 hours',
  'payee', jsonb_build_object('name', ' shyam jcb '), 'pay_now', jsonb_build_object('method', 'wallet')));
select tests.logout();
select is((select count(*) from public.payees where company_id = :'co'), 1::bigint, 'a typed payee name is reused, not duplicated');
select is(tests.ledger(:'jcb', :'pa', 'balance_paisa'), 1200000::bigint, 'the unpaid expense is owed to the payee');
select is(tests.ledger(:'jcb', :'pa', 'cost_paisa'), 1800000::bigint, 'both expenses are cost once');
select is((public.project_cost_summary(:'pa') -> 'payable_by_kind' ->> 'payee')::bigint, 1200000::bigint,
  'the project shows what is owed to payees');

-- Reversal: Accounts only; a paid labour entry leaves the money as a crew advance.
select tests.login(:'site');
select throws_ok($$select public.reverse_cost_entry(gen_random_uuid(), 'aaaa0000-0000-0000-0001-000000000001', '2026-05-08', 'x')$$,
  '42501', null, 'site staff cannot reverse');
select tests.login(:'acct');
select public.reverse_cost_entry(gen_random_uuid(), 'aaaa0000-0000-0000-0001-000000000001', '2026-05-08', 'Wrong project');
select tests.logout();
select is((select status from public.labour_costs where id = 'aaaa0000-0000-0000-0001-000000000001'), 'reversed'::public.doc_status,
  'the labour entry shows as reversed');
select is(tests.ledger(:'crew', :'pa', 'balance_paisa'), -500000 + 200000::bigint,
  'the 5,000 paid becomes a crew advance; the confirmed 2,000 entry is still owed');

-- Payee promoted to supplier; history stays with the payee.
select tests.login(:'acct');
select public.promote_payee(:'jcb') as jcb_supplier \gset
select tests.logout();
select is((select name from public.suppliers where id = :'jcb_supplier'), 'Shyam JCB', 'a payee can become a supplier');
select is((select count(*) from public.expenses where payee_id = :'jcb'), 2::bigint, '... its expenses stay where they were');

-- I-7: a closed project takes no new costs.
update public.projects set status = 'closed' where id = :'pb';
select tests.login(:'site');
select throws_ok($$select public.save_labour_cost(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(),
  'project_id', '$$ || :'pb' || $$', 'work_date', '2026-05-21', 'amount_paisa', 100))$$,
  'P0001', 'This project is closed. Reopen it before posting.', 'I-7: no labour cost on a closed project');

-- Opening balance for a crew (cutover) sits in the unallocated bucket.
select tests.login(:'acct');
select public.set_opening_balance(gen_random_uuid(), :'crew', '2026-04-01', 300000, 'Unpaid wages before cutover');
select tests.logout();
select is(tests.ledger(:'crew', null, 'balance_paisa'), 300000::bigint, 'opening balances work for crews too');

select * from finish();
rollback;
