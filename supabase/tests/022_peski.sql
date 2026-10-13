-- Peski and Overpayment (GLOSSARY.md): Peski is agreed upfront while nothing is unpaid; farchhyaut
-- uses it up against bills; a reversed bill gives it back; anything else held is Overpayment.
-- A Refund clears Overpayment only and Peski Returned gives back Peski only.
begin;
\ir helpers/helpers.psql
select plan(22);

create function tests.pay(p_supplier uuid, p_amount bigint, p_project uuid, p_peski boolean default false,
  p_settle uuid default null)
returns uuid language sql as $$
  select (public.record_payment(gen_random_uuid(), jsonb_build_object(
    'id', gen_random_uuid(), 'supplier_id', p_supplier, 'payment_date', '2026-05-05', 'amount_paisa', p_amount,
    'is_peski', p_peski,
    'allocations', jsonb_build_array(jsonb_build_object('project_id', p_project, 'amount_paisa', p_amount)),
    'settlements', case when p_settle is null then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('bill_id', p_settle, 'project_id', p_project, 'amount_paisa', p_amount)) end
  )) ->> 'payment_id')::uuid
$$;
create function tests.give_back(p_supplier uuid, p_amount bigint, p_project uuid, p_kind text)
returns jsonb language sql as $$
  select public.record_refund(gen_random_uuid(), jsonb_build_object(
    'id', gen_random_uuid(), 'supplier_id', p_supplier, 'project_id', p_project, 'refund_date', '2026-05-20',
    'amount_paisa', p_amount, 'kind', p_kind))
$$;
create function tests.held(p_supplier uuid) returns bigint[] language sql as $$
  select array[peski_paisa, overpaid_paisa] from public.party_held(p_supplier)
$$;
grant execute on all functions in schema tests to authenticated;

select tests.create_user('owner') as owner \gset
select tests.create_company('Peski Nirman', :'owner') as co \gset
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Project A', 1000000000) as pa \gset
select tests.supplier(:'co', 'New Dealer') as nd \gset
select tests.supplier(:'co', 'Regular Hardware') as rh \gset

-- Peski to a new dealer with nothing unpaid: 50,000 for cement to come.
select tests.pay(:'nd', 5000000, :'pa', true) as pk \gset
select is((select is_peski from public.payments where id = :'pk'), true, 'the payment is recorded as peski');
select is(tests.held(:'nd'), array[5000000, 0]::bigint[], 'the dealer holds 50,000 peski, no overpayment');
select is((select money from public.calendar_events(:'co', '2026-05-05', '2026-05-05') where kind = 'payment_post'),
  'peski', 'the calendar tags it as peski');

-- Farchhyaut: a 30,000 bill uses up 30,000 of the peski.
select tests.posted_bill(:'co', :'nd', :'pa', 3000000, '2026-05-08') as b1 \gset
select public.settle(gen_random_uuid(), jsonb_build_array(jsonb_build_object(
  'payment_id', :'pk', 'bill_id', :'b1', 'project_id', :'pa', 'amount_paisa', 3000000)));
select is(tests.held(:'nd'), array[2000000, 0]::bigint[], 'farchhyaut: 20,000 peski is left');

-- The bill is reversed: the 30,000 is peski again (product owner, 2026-10-13).
select public.reverse_bill(gen_random_uuid(), :'b1', '2026-05-10', 'Wrong rate');
select is(tests.held(:'nd'), array[5000000, 0]::bigint[], 'a reversed bill gives the peski back');

-- Peski Returned: the order is cancelled and the dealer gives back 20,000.
select throws_like($$ select tests.give_back('$$ || :'nd' || $$', 1000000, '$$ || :'pa' || $$', 'refund') $$,
  '%refund_exceeds_overpayment%', 'a Refund cannot give back peski');
select throws_like($$ select tests.give_back('$$ || :'nd' || $$', 6000000, '$$ || :'pa' || $$', 'peski_returned') $$,
  '%peski_returned_exceeds_peski%', 'peski returned cannot be more than the peski held');
select tests.give_back(:'nd', 2000000, :'pa', 'peski_returned') ->> 'refund_id' as pr \gset
select is((select kind from public.refunds where id = :'pr'), 'peski_returned', 'recorded as peski returned');
select is(tests.held(:'nd'), array[3000000, 0]::bigint[], '30,000 peski is left');
select is((select label from public.party_khata(:'nd') where event_type = 'refund'), 'Peski returned ' || (select number from public.refunds where id = :'pr'),
  'the khata says peski returned');

-- Peski is refused while the party has unpaid bills, and cannot pay bills.
select tests.posted_bill(:'co', :'rh', :'pa', 4000000, '2026-05-01') as b2 \gset
select throws_like($$ select tests.pay('$$ || :'rh' || $$', 5000000, '$$ || :'pa' || $$', true) $$,
  '%peski_with_unpaid%', 'no peski while a 40,000 bill is unpaid');
select throws_like($$ select tests.pay('$$ || :'rh' || $$', 4000000, '$$ || :'pa' || $$', true, '$$ || :'b2' || $$') $$,
  '%cannot pay bills%', 'peski cannot settle a bill');

-- Paying a regular supplier ahead: 50,000 against the 40,000 bill leaves 10,000 overpayment.
select tests.pay(:'rh', 4000000, :'pa', false, :'b2');
select tests.pay(:'rh', 1000000, :'pa');
select is(tests.held(:'rh'), array[0, 1000000]::bigint[], 'the extra 10,000 is overpayment, not peski');
select is(public.refund_available(:'rh', :'pa', 'peski_returned'), 0::bigint, 'there is no peski to return');
select is(public.refund_available(:'rh', :'pa'), 1000000::bigint, 'a refund can clear the 10,000');

-- Mixed: the dealer is also overpaid. Peski is capped at what is held.
select tests.pay(:'nd', 500000, :'pa');
select is(tests.held(:'nd'), array[3000000, 500000]::bigint[], 'dealer: 30,000 peski and 5,000 overpaid');
select is((select array[peski_paisa, available_paisa] from public.refund_rooms(:'nd') where project_id = :'pa'),
  array[3000000, 500000]::bigint[], 'refund_rooms gives both amounts for the bucket');

-- Dashboards split money held into peski and overpaid; together they are what parties hold.
select is((public.project_dashboard(:'pa') ->> 'peski_paisa')::bigint, 3000000::bigint, 'project: 30,000 peski');
select is((public.project_dashboard(:'pa') ->> 'overpaid_paisa')::bigint, 1500000::bigint, 'project: 15,000 overpaid');
select is(public.project_dashboard(:'pa') ? 'advances_paisa', false, 'the old mixed figure is gone');
select is((public.company_dashboard(:'co', '2026-05-01', '2026-05-31') ->> 'peski_paisa')::bigint, 3000000::bigint, 'company: 30,000 peski');
select is((public.company_dashboard(:'co', '2026-05-01', '2026-05-31') ->> 'overpaid_paisa')::bigint, 1500000::bigint, 'company: 15,000 overpaid');

select * from finish();
rollback;
