-- Company dashboard: money in from clients (period and to date), what is still to collect, who
-- holds an Overpayment, and delivered goods not billed yet per supplier.
begin;
\ir helpers/helpers.psql
select plan(19);

create function tests.receive(p_project uuid, p_amount bigint, p_date date)
returns uuid language sql as $$
  select (public.record_client_receipt(gen_random_uuid(), jsonb_build_object(
    'id', gen_random_uuid(), 'project_id', p_project, 'receipt_date', p_date, 'amount_paisa', p_amount,
    'kind', 'running_bill', 'method', 'cheque')) ->> 'receipt_id')::uuid
$$;
create function tests.dash() returns jsonb language sql as $$
  select public.company_dashboard((select id from public.companies where name = 'Dash Nirman'), '2026-05-01', '2026-05-31', '2026-05-31')
$$;
grant execute on all functions in schema tests to authenticated;

select tests.create_user('owner') as owner \gset
select tests.create_user('site') as site \gset
select tests.create_user('siteb') as siteb \gset
select tests.create_company('Dash Nirman', :'owner') as co \gset
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Project A', 1000000000) as pa \gset
select public.create_project(:'co', 'B', 'Project B', 500000000) as pb \gset
select tests.supplier(:'co', 'Fewa Hardware') as fewa \gset
select tests.supplier(:'co', 'Shrestha Suppliers') as shr \gset
select tests.logout();
insert into public.memberships (company_id, user_id, roles, can_view_finance)
values (:'co', :'site', '{site_staff}', false), (:'co', :'siteb', '{site_staff}', false);
select tests.assign(:'co', :'pa', :'site');
select tests.assign(:'co', :'pb', :'siteb');

-- Client receipts on A: 50,000 in April, 1,00,000 in May, 20,000 in May reversed in May.
select tests.login(:'owner');
select tests.receive(:'pa', 5000000, '2026-04-10');
select tests.receive(:'pa', 10000000, '2026-05-01');
select tests.receive(:'pa', 2000000, '2026-05-10') as cr3 \gset
select public.reverse_client_receipt(gen_random_uuid(), :'cr3', '2026-05-20', 'Cheque bounced');

select is((tests.dash() ->> 'received_period_paisa')::bigint, 10000000::bigint, 'received in May: 1,00,000 (the bounced cheque is out)');
select is((tests.dash() ->> 'received_to_date_paisa')::bigint, 15000000::bigint, 'received to date: 1,50,000');
-- The contract starts on the day the project was created, so to collect is as of today.
select is((public.company_dashboard(:'co', '2026-05-01', '2026-05-31', private.today()) ->> 'to_collect_paisa')::bigint, (1000000000 - 15000000 + 500000000)::bigint,
  'to collect: A contract less received, plus all of B');
select is((public.company_dashboard(:'co', '2026-04-01', '2026-04-30', '2026-05-31') ->> 'received_period_paisa')::bigint,
  5000000::bigint, 'received in April: 50,000');

-- An April receipt reversed in May comes off May, not April.
select tests.receive(:'pa', 300000, '2026-04-20') as cr4 \gset
select public.reverse_client_receipt(gen_random_uuid(), :'cr4', '2026-05-25', 'Wrong project');
select is((tests.dash() ->> 'received_period_paisa')::bigint, 9700000::bigint, 'May: 1,00,000 less the 3,000 reversed in May');
select is((public.company_dashboard(:'co', '2026-04-01', '2026-04-30', '2026-05-31') ->> 'received_period_paisa')::bigint,
  5300000::bigint, 'April keeps the 3,000 it received');

-- A closed project's books are final: nothing more to collect on it.
select public.create_project(:'co', 'C', 'Project C', 200000000) as pc \gset
update public.projects set status = 'closed' where id = :'pc';
select is((public.company_dashboard(:'co', '2026-05-01', '2026-05-31', private.today()) ->> 'to_collect_paisa')::bigint,
  (1000000000 - 15000000 + 500000000)::bigint, 'a closed project adds nothing to collect');

-- Fewa is paid 10,000 with nothing billed: an Overpayment, named on the dashboard.
select public.record_payment(gen_random_uuid(), jsonb_build_object(
  'id', gen_random_uuid(), 'supplier_id', :'fewa', 'payment_date', '2026-05-05', 'amount_paisa', 1000000,
  'allocations', jsonb_build_array(jsonb_build_object('project_id', :'pa', 'amount_paisa', 1000000))));
select is(tests.dash() -> 'overpaid_parties',
  jsonb_build_array(jsonb_build_object('party_id', :'fewa', 'kind', 'supplier', 'name', 'Fewa Hardware', 'overpaid_paisa', 1000000)),
  'Fewa Hardware holds 10,000 overpaid');
select is((tests.dash() ->> 'overpaid_paisa')::bigint, 1000000::bigint, 'the company overpaid figure is still there');
select is(tests.dash() ? 'peski_paisa', true, '... and so is peski');

-- Shrestha is owed 50,000 from before (opening balance, on no project) and is paid 20,000 of it;
-- Fewa is paid 20,000 without a project. Only Fewa's is money to assign.
select public.set_opening_balance(gen_random_uuid(), :'shr', '2026-04-01', 5000000, 'From the old khata');
select is((tests.dash() ->> 'unallocated_paisa')::bigint, 0::bigint, 'an opening balance is not money to assign');
select public.record_payment(gen_random_uuid(), jsonb_build_object(
  'id', gen_random_uuid(), 'supplier_id', :'shr', 'payment_date', '2026-05-06', 'amount_paisa', 2000000, 'allocations', '[]'::jsonb));
select public.record_payment(gen_random_uuid(), jsonb_build_object(
  'id', gen_random_uuid(), 'supplier_id', :'fewa', 'payment_date', '2026-05-06', 'amount_paisa', 2000000, 'allocations', '[]'::jsonb));
select is((tests.dash() ->> 'unallocated_paisa')::bigint, 2000000::bigint, 'only Fewa''s 20,000 is to assign');

-- Delivered without a bill: 40 bag cement on the 3rd and 10 more on the 5th from Shrestha.
select public.record_delivery(jsonb_build_object('id', gen_random_uuid(), 'supplier_id', :'shr', 'project_id', :'pa',
  'receipt_date', '2026-05-03', 'no_slip_reason', 'urgent',
  'lines', jsonb_build_array(jsonb_build_object('material_id', tests.material(:'co', 'Cement'), 'unit_id', tests.unit(:'co', 'bag'), 'received_qty', 40))));
select public.record_delivery(jsonb_build_object('id', gen_random_uuid(), 'supplier_id', :'shr', 'project_id', :'pa',
  'receipt_date', '2026-05-05', 'no_slip_reason', 'urgent',
  'lines', jsonb_build_array(jsonb_build_object('material_id', tests.material(:'co', 'Cement'), 'unit_id', tests.unit(:'co', 'bag'), 'received_qty', 10))));
select is(tests.dash() -> 'unbilled_by_supplier',
  jsonb_build_array(jsonb_build_object('supplier_id', :'shr', 'name', 'Shrestha Suppliers', 'lines', 2,
    'oldest_date', '2026-05-03', 'first_item', '40 bag Cement')),
  'one row for Shrestha: 2 lines, the oldest 40 bag cement on the 3rd');
select is(jsonb_array_length(public.company_dashboard(:'co', '2026-05-01', '2026-05-31', '2026-05-02') -> 'unbilled_by_supplier'), 0,
  'nothing unbilled as of the 2nd');

-- Site staff without money rights: the unbilled list, none of the money.
select tests.login(:'site');
select is((tests.dash() ->> 'money_visible')::boolean, false, 'site staff cannot see money');
select is(tests.dash() ?| array['received_period_paisa', 'received_to_date_paisa', 'to_collect_paisa', 'overpaid_parties'], false,
  '... so no money in, to collect or overpaid parties');
select is(jsonb_array_length(tests.dash() -> 'unbilled_by_supplier'), 1, '... but they see what came without a bill');
select is(tests.dash() -> 'unbilled_by_supplier' -> 0 ->> 'name', 'Shrestha Suppliers', '... and from whom');

-- Site staff on B only do not see A's deliveries.
select tests.login(:'siteb');
select is(jsonb_array_length(tests.dash() -> 'unbilled_by_supplier'), 0, 'site staff on another project see none of it');

select * from finish();
rollback;
