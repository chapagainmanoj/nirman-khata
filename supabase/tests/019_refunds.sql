-- Refunds received (req §12.2, §12.3, §19): balance up, cash paid down, cost unchanged; never
-- more than the Overpayment held with the party; reversal dated on its own date (§19.1); I-10 holds.
begin;
\ir helpers/helpers.psql
select plan(25);

create function tests.pay(p_supplier uuid, p_amount bigint, p_project uuid default null)
returns uuid language sql as $$
  select (public.record_payment(gen_random_uuid(), jsonb_build_object(
    'id', gen_random_uuid(), 'supplier_id', p_supplier, 'payment_date', '2026-05-05', 'amount_paisa', p_amount,
    'allocations', case when p_project is null then '[]'::jsonb
                   else jsonb_build_array(jsonb_build_object('project_id', p_project, 'amount_paisa', p_amount)) end)) ->> 'payment_id')::uuid
$$;
create function tests.refund(p_supplier uuid, p_amount bigint, p_project uuid default null,
  p_date date default '2026-05-10', p_op uuid default gen_random_uuid(), p_id uuid default gen_random_uuid())
returns jsonb language sql as $$
  select public.record_refund(p_op, jsonb_build_object(
    'id', p_id, 'supplier_id', p_supplier, 'project_id', p_project, 'refund_date', p_date,
    'amount_paisa', p_amount, 'method', 'bank_transfer', 'reference', 'TXN-1'))
$$;
-- I-10 for one party: company balance = sum of project balances + unallocated.
create function tests.i10(p_party uuid) returns boolean language sql as $$
  select coalesce(sum(balance_paisa), 0) = coalesce(sum(balance_paisa) filter (where project_id is not null), 0)
    + coalesce(sum(balance_paisa) filter (where project_id is null), 0)
    and (select balance_paisa from public.party_balances((select company_id from public.suppliers where id = p_party), 'supplier')
         where party_id = p_party) = coalesce(sum(balance_paisa), 0)
  from public.ledger_entries where party_id = p_party
$$;
grant execute on all functions in schema tests to authenticated;

select tests.create_user('owner') as owner \gset
select tests.create_user('site') as site \gset
select tests.create_user('viewer') as viewer \gset
select tests.create_user('other') as other \gset
select tests.create_company('Refund Nirman', :'owner') as co \gset
select tests.create_company('Other Nirman', :'other') as co2 \gset
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Project A', 1000000000) as pa \gset
select public.create_project(:'co', 'B', 'Project B', 1000000000) as pb \gset
select tests.supplier(:'co', 'Supplier X') as sx \gset
select tests.logout();
-- Site staff with money rights on A only; a viewer with finance but no payment rights.
insert into public.memberships (company_id, user_id, roles, can_view_finance, can_record_payments)
values (:'co', :'site', '{site_staff}', true, true), (:'co', :'viewer', '{viewer}', true, false);
select tests.assign(:'co', :'pa', :'site');
select tests.login(:'owner');

-- Bill 1,20,000 and payment 1,50,000 on A: overpayment 30,000 (the §12.2 example).
select tests.posted_bill(:'co', :'sx', :'pa', 12000000, '2026-05-01');
select tests.pay(:'sx', 15000000, :'pa');
select is(public.refund_available(:'sx', :'pa'), 3000000::bigint, 'overpayment on A is 30,000');
select is(public.refund_available(:'sx', null), 0::bigint, 'nothing unallocated to refund');
select is((select array_agg(available_paisa) from public.refund_rooms(:'sx')), array[3000000::bigint],
  'refund_rooms lists only A, with 30,000');

-- Refund 20,000 on A.
select tests.refund(:'sx', 2000000, :'pa', '2026-05-10', '11111111-0000-0000-0000-00000000aaaa', '22222222-0000-0000-0000-00000000aaaa') ->> 'refund_id' as rf1 \gset
select is(tests.ledger(:'sx', :'pa', 'balance_paisa'), -1000000::bigint, 'balance on A goes from -30,000 to -10,000');
select is(tests.ledger(:'sx', :'pa', 'cash_paisa'), 13000000::bigint, 'cash paid on A is 1,50,000 - 20,000');
select is(tests.project_cost(:'pa'), 12000000::bigint, 'a refund never changes cost');
select is((select number from public.refunds where id = :'rf1'), 'RF-0001', 'refunds are numbered RF-0001');

-- Retry with the same operation key: same refund, nothing written twice (#13 for refunds).
select is(tests.refund(:'sx', 2000000, :'pa', '2026-05-10', '11111111-0000-0000-0000-00000000aaaa', '22222222-0000-0000-0000-00000000aaaa') ->> 'refund_id', :'rf1',
  'a retried refund returns the first one');
select is((select count(*) from public.refunds where company_id = :'co'), 1::bigint, '... and records it once');

-- More than the Overpayment is refused.
select throws_like($$ select tests.refund('$$ || :'sx' || $$', 2000000, '$$ || :'pa' || $$') $$,
  '%refund_exceeds_overpayment%', 'a refund above the overpayment (10,000 left) is refused');

-- Unallocated: payment 50,000 not for a project, refund 40,000 from it.
select tests.pay(:'sx', 5000000);
select is(public.refund_available(:'sx', null), 5000000::bigint, 'unallocated overpayment is 50,000');
select tests.refund(:'sx', 4000000, null, '2026-05-11') ->> 'refund_id' as rf2 \gset
select is(tests.ledger(:'sx', null, 'balance_paisa'), -1000000::bigint, 'unallocated bucket goes to -10,000');
select ok(tests.i10(:'sx'), 'I-10: company balance = projects + unallocated after refunds');

-- B owes 70,000: the company now owes the supplier overall, so nothing can be refunded,
-- even though A and the unallocated bucket each still hold 10,000 (never turn overpayment into baki).
select tests.posted_bill(:'co', :'sx', :'pb', 7000000, '2026-05-12');
select is(public.refund_available(:'sx', :'pa'), 0::bigint, 'no refund while the company owes the supplier overall');
select throws_like($$ select tests.refund('$$ || :'sx' || $$', 100000, '$$ || :'pa' || $$') $$,
  '%refund_exceeds_overpayment%', '... and recording one is refused');

-- Readers: khata, calendar and payment register.
select is((select doc_kind from public.party_khata(:'sx') where doc_id = :'rf1'), 'refund', 'the khata lists the refund');
select is((select money from public.calendar_events(:'co', '2026-05-01', '2026-05-31') where link_id = :'rf1'), 'refund',
  'the calendar shows it as a refund, apart from payments');
select is((select sum(amount_paisa) from public.report_payments(:'co', '2026-05-01', '2026-05-31')),
  (select sum(cash_paisa) from public.ledger_entries where company_id = :'co')::numeric,
  'payment register total = cash paid net of refunds (#14)');

-- Reversal dated 20 May: the refund stays in anything dated before that (§19.1).
select public.reverse_refund(gen_random_uuid(), :'rf1', '2026-05-20', 'Cheque bounced');
select is((select running_balance_paisa from public.party_khata(:'sx', null, '2026-05-15', :'pa') order by business_date desc limit 1),
  -1000000::bigint, 'as of 15 May the refund still counts on A');
select is(tests.ledger(:'sx', :'pa', 'balance_paisa'), -3000000::bigint, 'after the reversal, A is back to -30,000');
select is((select reversed_on from public.report_payments(:'co', '2026-05-01', '2026-05-31') where payment_id = :'rf1'),
  '2026-05-20'::date, 'the register shows when the refund was reversed');
select tests.logout();

-- Permissions.
select tests.login(:'site');
select throws_ok($$ select tests.refund('$$ || :'sx' || $$', 100000) $$, '42501', NULL,
  'site staff cannot record a refund that is not for a project');
select throws_ok($$ select tests.refund('$$ || :'sx' || $$', 100000, '$$ || :'pb' || $$') $$, '42501', NULL,
  '... nor one on a project they are not assigned to');
select tests.logout();
select tests.login(:'viewer');
select throws_ok($$ select tests.refund('$$ || :'sx' || $$', 100000, '$$ || :'pa' || $$') $$, '42501', NULL,
  'a viewer without payment rights cannot record refunds');
select tests.logout();
select tests.login(:'other');
select throws_ok($$ select tests.refund('$$ || :'sx' || $$', 100000, '$$ || :'pa' || $$') $$, '42501', NULL,
  'another company cannot record a refund for this supplier (#1)');
select tests.logout();

select * from finish();
rollback;
