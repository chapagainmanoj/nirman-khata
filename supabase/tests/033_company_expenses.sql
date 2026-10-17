-- Company expenses and unnamed cash (req §15; GLOSSARY: Company Expense, Cash payee; X2).
begin;
\ir helpers/helpers.psql
select plan(29);

select tests.create_user('owner') as owner \gset
select tests.create_user('acct') as acct \gset
select tests.create_user('site') as site \gset
select tests.create_user('site2') as site2 \gset
select tests.create_user('viewer') as viewer \gset
select tests.create_user('stranger') as stranger \gset
select tests.create_company('Company Nirman', :'owner') as co \gset
select tests.create_company('Other Nirman', :'stranger') as co2 \gset
select tests.add_member(:'co', :'acct', array['accounts']::public.app_role[], true);
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
select tests.add_member(:'co', :'site2', array['site_staff']::public.app_role[], false);
select tests.add_member(:'co', :'viewer', array['viewer']::public.app_role[], false);
update public.memberships set can_record_payments = true where user_id = :'site';
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Project A', 1000000000) as pa \gset
select tests.logout();
select tests.assign(:'co', :'pa', :'site');
select tests.assign(:'co', :'pa', :'site2');
select tests.heading(:'co', 'Site Expenses') as hd \gset

-- A company expense: a record only. Site staff without payment rights may enter one.
select tests.login(:'site2');
select public.save_expense('cccc0000-0000-0000-0000-000000000001', jsonb_build_object(
  'id', 'cccc0000-0000-0000-0001-000000000001', 'company_id', :'co', 'heading_id', :'hd',
  'expense_date', '2026-05-04', 'amount_paisa', 340000, 'description', 'Sabal x2',
  'payee', jsonb_build_object('name', 'Hardware shop'), 'pay_now', jsonb_build_object('method', 'wallet'))) as r1 \gset
select is(public.save_expense('cccc0000-0000-0000-0000-000000000001', jsonb_build_object(
  'id', 'cccc0000-0000-0000-0001-000000000001', 'company_id', :'co', 'heading_id', :'hd',
  'expense_date', '2026-05-04', 'amount_paisa', 340000, 'description', 'Sabal x2',
  'payee', jsonb_build_object('name', 'Hardware shop'), 'pay_now', jsonb_build_object('method', 'wallet'))), :'r1'::jsonb,
  'a retried company expense returns the first result');
select is((select amount_paisa from public.expenses where id = 'cccc0000-0000-0000-0001-000000000001'), 340000::bigint,
  'X2: the creator sees the amount of their company expense');
select is((select settled_paisa from public.expense_summaries where id = 'cccc0000-0000-0000-0001-000000000001'), 340000::bigint,
  'a company expense shows as paid');
select tests.logout();

select is((select row(project_id, payee_id, paid_method::text) from public.expenses where id = 'cccc0000-0000-0000-0001-000000000001'),
  row(null::uuid, null::uuid, 'wallet'::text), 'no project, no payee, and how it was paid');
select is((select count(*) from public.posting_events where op_key = 'cccc0000-0000-0000-0000-000000000001'), 0::bigint,
  'a company expense posts nothing (no cost, no khata)');
select is((select count(*) from public.payees where company_id = :'co' and name = 'Hardware shop'), 0::bigint,
  'a company expense makes no payee');

select tests.login(:'site');
select is((select count(*) from public.expenses where project_id is null), 0::bigint, 'X2: other site staff do not see it');
select tests.login(:'acct');
select is((select count(*) from public.expenses where project_id is null), 1::bigint, 'Accounts see company expenses');
select tests.login(:'viewer');
select throws_ok($$select public.save_expense(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(),
  'company_id', '$$ || :'co' || $$', 'heading_id', '$$ || :'hd' || $$', 'amount_paisa', 100, 'description', 'x'))$$,
  '42501', null, 'a viewer cannot enter company expenses');
select tests.login(:'stranger');
select throws_ok($$select public.save_expense(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(),
  'company_id', '$$ || :'co' || $$', 'heading_id', '$$ || :'hd' || $$', 'amount_paisa', 100, 'description', 'x'))$$,
  '42501', null, 'nor can someone from another company');
select is((select count(*) from public.expenses), 0::bigint, '... who sees none of them');
select tests.logout();

select throws_ok($$insert into public.expenses (company_id, id, project_id, heading_id, payee_id, expense_date, amount_paisa, description)
  values ('$$ || :'co' || $$', gen_random_uuid(), null, '$$ || :'hd' || $$', null, '2026-05-04', 100, 'x')$$,
  '23514', null, 'a company expense must say how it was paid');

-- Receipt photo: the creator (X2) may add one; other site staff may not.
select tests.login(:'site2');
select ok(private.can_create_attachment_for(:'co', null, null, null, null, null, null, null, null,
  'cccc0000-0000-0000-0001-000000000001', null, null, null), 'the creator may add a receipt photo');
select tests.login(:'site');
select ok(not private.can_create_attachment_for(:'co', null, null, null, null, null, null, null, null,
  'cccc0000-0000-0000-0001-000000000001', null, null, null), 'other site staff may not');

-- Unnamed cash on a project: filed under the Cash payee; cost once, nothing owed.
select public.save_expense('cccc0000-0000-0000-0000-000000000002', jsonb_build_object(
  'id', 'cccc0000-0000-0000-0001-000000000002', 'project_id', :'pa', 'heading_id', :'hd',
  'expense_date', '2026-05-04', 'amount_paisa', 180000, 'description', 'Khaja for crew',
  'pay_now', jsonb_build_object('method', 'cash')));
select public.save_expense('cccc0000-0000-0000-0000-000000000003', jsonb_build_object(
  'id', 'cccc0000-0000-0000-0001-000000000003', 'project_id', :'pa', 'heading_id', :'hd',
  'expense_date', '2026-05-04', 'amount_paisa', 50000, 'description', 'Diesel 3 L',
  'pay_now', jsonb_build_object('method', 'cash')));
select throws_ok($$select public.save_expense(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(),
  'project_id', '$$ || :'pa' || $$', 'heading_id', '$$ || :'hd' || $$', 'amount_paisa', 100, 'description', 'x'))$$,
  '22023', null, 'an unpaid expense still names who is owed it');
select tests.logout();

select id as cash from public.payees where company_id = :'co' and is_cash \gset
select is((select count(distinct payee_id) from public.expenses where project_id = :'pa'), 1::bigint,
  'both unnamed cash expenses share the one Cash payee');
select is((select name from public.payees where id = :'cash'), 'Cash (not named)', 'the Cash payee is named for people');
select is(tests.project_cost(:'pa'), 230000::bigint, 'unnamed cash counts as project cost');
select is(tests.ledger(:'cash', :'pa', 'balance_paisa'), 0::bigint, 'the Cash payee is owed nothing');
select is(tests.ledger(:'cash', :'pa', 'cash_paisa'), 230000::bigint, '... and was paid exactly the amount');

-- The cost and the payment that paid it point at each other; only finance sees the link.
select tests.login(:'acct');
select is((select paid_by -> 0 ->> 'number' from public.expense_summaries where id = 'cccc0000-0000-0000-0001-000000000002'),
  (select p.number from public.payments p join public.settlement_events s on s.payment_id = p.id
   where s.doc_id = 'cccc0000-0000-0000-0001-000000000002'), 'an expense paid now names the payment that paid it');
select is((select paid_for from public.payment_summaries ps join public.settlement_events s on s.payment_id = ps.id
   where s.doc_id = 'cccc0000-0000-0000-0001-000000000002'), 'Khaja for crew', 'and the payment says what it paid for');
select tests.login(:'site');
select is((select paid_by from public.expense_summaries where id = 'cccc0000-0000-0000-0001-000000000002'), null::jsonb,
  'X2: site staff see their own expense but not the payment behind it');

-- Reversal: Accounts or Admin; once; kept with who, when and why.
select tests.login(:'site2');
select throws_ok($$select public.reverse_company_expense(gen_random_uuid(), 'cccc0000-0000-0000-0001-000000000001', null, 'typo')$$,
  '42501', null, 'site staff cannot reverse a company expense');
select tests.login(:'acct');
select throws_ok($$select public.reverse_cost_entry(gen_random_uuid(), 'cccc0000-0000-0000-0001-000000000001', null, 'typo')$$,
  '42501', null, 'a company expense is not a cost entry: reverse_cost_entry refuses it');
select public.reverse_company_expense(gen_random_uuid(), 'cccc0000-0000-0000-0001-000000000001', null, 'Entered twice');
select is((select status::text from public.expenses where id = 'cccc0000-0000-0000-0001-000000000001'), 'reversed',
  'the company expense is reversed');
select is((select reason || ' by ' || (created_by = :'acct')::text from public.company_expense_reversals
  where expense_id = 'cccc0000-0000-0000-0001-000000000001'), 'Entered twice by true', 'with why and who');
select throws_ok($$select public.reverse_company_expense(gen_random_uuid(), 'cccc0000-0000-0000-0001-000000000001', null, 'again')$$,
  'P0001', null, 'a company expense is reversed at most once');
select throws_ok($$select public.reverse_company_expense(gen_random_uuid(), 'cccc0000-0000-0000-0001-000000000002', null, 'x')$$,
  '42501', null, 'reverse_company_expense refuses a project expense');
select tests.logout();

select * from finish();
rollback;
