-- Client receipts (requirements open question #1): what the client has paid on a project. Kept out
-- of the ledger, so cost, cash paid and party balances never move; reversal only by Admin/Accounts
-- with a reason, dated on its own date; read like the project's money.
begin;
\ir helpers/helpers.psql
select plan(30);

create function tests.receive(p_project uuid, p_amount bigint, p_date date default '2026-05-01',
  p_op uuid default gen_random_uuid(), p_id uuid default gen_random_uuid())
returns jsonb language sql as $$
  select public.record_client_receipt(p_op, jsonb_build_object(
    'id', p_id, 'project_id', p_project, 'receipt_date', p_date, 'amount_paisa', p_amount,
    'kind', 'running_bill', 'method', 'cheque', 'reference', 'CHQ-1'))
$$;
grant execute on all functions in schema tests to authenticated;

select tests.create_user('owner') as owner \gset
select tests.create_user('site') as site \gset
select tests.create_user('siteno') as siteno \gset
select tests.create_user('fin') as fin \gset
select tests.create_user('other') as other \gset
select tests.create_company('Client Nirman', :'owner') as co \gset
select tests.create_company('Other Nirman', :'other') as co2 \gset
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Project A', 1000000000) as pa \gset
select public.create_project(:'co', 'B', 'Project B', 1000000000) as pb \gset
select tests.logout();
-- Site staff on A with money and payment rights; site staff on A without them; a finance viewer on B only.
insert into public.memberships (company_id, user_id, roles, can_view_finance, can_record_payments)
values (:'co', :'site', '{site_staff}', true, true), (:'co', :'siteno', '{site_staff}', false, false),
       (:'co', :'fin', '{viewer}', true, false);
select tests.assign(:'co', :'pa', :'site');
select tests.assign(:'co', :'pa', :'siteno');
select tests.assign(:'co', :'pb', :'fin');

-- Record: numbered, retry-safe, checked.
select tests.login(:'owner');
select tests.receive(:'pa', 10000000, '2026-05-01', '11111111-0000-0000-0000-0000000000c1', '22222222-0000-0000-0000-0000000000c1') ->> 'receipt_id' as cr1 \gset
select is((select number from public.client_receipts where id = :'cr1'), 'CR-0001', 'client receipts are numbered CR-0001');
select is(tests.receive(:'pa', 10000000, '2026-05-01', '11111111-0000-0000-0000-0000000000c1', '22222222-0000-0000-0000-0000000000c1') ->> 'receipt_id', :'cr1',
  'a retried receipt returns the first one');
select is((select count(*) from public.client_receipts where company_id = :'co'), 1::bigint, '... and records it once');
select tests.receive(:'pa', 5000000, '2026-05-10') ->> 'receipt_id' as cr2 \gset
select is((select number from public.client_receipts where id = :'cr2'), 'CR-0002', 'the next one is CR-0002');
select throws_like(format($$ select tests.receive(%L, 100, private.today() + 1) $$, :'pa'), '%future%', 'a future date is refused');
select throws_like(format($$ select tests.receive(%L, 0) $$, :'pa'), '%more than zero%', 'a zero amount is refused');
select throws_ok(format($$ insert into public.client_receipts (company_id, number, project_id, receipt_date, amount_paisa)
  values (%L, 'CR-9', %L, '2026-05-01', 100) $$, :'co', :'pa'), '42501', null, 'receipts are written only through the function');

-- Who may record.
select tests.login(:'site');
select ok((tests.receive(:'pa', 100000, '2026-05-02') ->> 'receipt_id') is not null, 'site staff with payment rights record on their project');
select throws_ok(format($$ select tests.receive(%L, 100000) $$, :'pb'), '42501', null, '... but not on a project they are not on');
select tests.login(:'siteno');
select throws_ok(format($$ select tests.receive(%L, 100000) $$, :'pa'), '42501', null, 'site staff without payment rights cannot');
select tests.login(:'other');
select throws_ok(format($$ select tests.receive(%L, 100000) $$, :'pa'), '42501', null, 'another company cannot');

-- Received as of a date: 1,00,000 + 50,000 + 1,000.
select tests.login(:'owner');
select is(public.client_received_as_of(:'pa', '2026-05-31'), 15100000::bigint, 'received on A is the sum of its receipts');
select is(public.client_received_as_of(:'pa', '2026-05-05'), 10100000::bigint, 'as of 5 May leaves out the 10 May receipt');
select is(public.client_received_as_of(:'pb', '2026-05-31'), 0::bigint, 'nothing received on B');

-- Reverse: Admin/Accounts only, with a reason, not before the receipt, once.
select tests.login(:'site');
select throws_ok(format($$ select public.reverse_client_receipt(gen_random_uuid(), %L, '2026-05-20', 'wrong') $$, :'cr2'),
  '42501', null, 'site staff cannot reverse a receipt');
select tests.login(:'owner');
select throws_like(format($$ select public.reverse_client_receipt(gen_random_uuid(), %L, '2026-05-20', '  ') $$, :'cr2'),
  '%reason%', 'a reversal needs a reason');
select throws_like(format($$ select public.reverse_client_receipt(gen_random_uuid(), %L, '2026-05-09', 'wrong') $$, :'cr2'),
  '%before the payment%', 'a reversal cannot be dated before the receipt');
select public.reverse_client_receipt(gen_random_uuid(), :'cr2', '2026-05-20', 'Cheque bounced');
select is((select status::text from public.client_receipts where id = :'cr2'), 'reversed', 'the receipt is marked reversed');
select is(public.client_received_as_of(:'pa', '2026-05-19'), 15100000::bigint, 'before the reversal date it still counts');
select is(public.client_received_as_of(:'pa', '2026-05-20'), 10100000::bigint, 'from the reversal date it does not');
select throws_like(format($$ select public.reverse_client_receipt(gen_random_uuid(), %L, '2026-05-21', 'again') $$, :'cr2'),
  '%already_reversed%', 'a receipt is reversed only once');

-- Outside the ledger: no cost, no cash paid, no ledger rows at all.
select is(tests.project_cost(:'pa'), 0::bigint, 'a client receipt never creates cost');
select is((select count(*) from public.ledger_entries where company_id = :'co'), 0::bigint, '... nor any ledger row');

-- Calendar: the receipt with its own amount column, and the reversal as a negative row.
select is((select received_paisa from public.calendar_events(:'co', '2026-05-01', '2026-05-31', :'pa') where kind = 'client_receipt' and link_id = :'cr1'),
  10000000::bigint, 'the calendar shows the receipt amount as received');
select is((select coalesce(cash_paisa, 0) from public.calendar_events(:'co', '2026-05-01', '2026-05-31', :'pa') where kind = 'client_receipt' and link_id = :'cr1'),
  0::bigint, '... and not as cash paid');
select is((select received_paisa from public.calendar_events(:'co', '2026-05-01', '2026-05-31', :'pa') where kind = 'client_receipt_reversal'),
  -5000000::bigint, 'the reversal shows on its date as a negative amount');

-- Read rules follow the project's money.
select tests.login(:'fin');
select is((select count(*) from public.client_receipts where project_id = :'pa'), 0::bigint, 'finance staff not on A do not see its receipts');
select tests.login(:'other');
select is((select count(*) from public.client_receipts), 0::bigint, 'another company sees none');

-- A photo of the cheque: whoever may record adds it; others may not.
select tests.login(:'owner');
select lives_ok(format($$ insert into public.attachments (company_id, client_receipt_id, file_name, content_type, size_bytes)
  values (%L, %L, 'cheque.jpg', 'image/jpeg', 2048) $$, :'co', :'cr1'), 'the owner attaches a cheque photo');
select tests.login(:'siteno');
select throws_ok(format($$ insert into public.attachments (company_id, client_receipt_id, file_name, content_type, size_bytes)
  values (%L, %L, 'cheque.jpg', 'image/jpeg', 2048) $$, :'co', :'cr1'), '42501', null, 'site staff without payment rights cannot');

select * from finish();
rollback;
