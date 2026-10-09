-- Milestone 2 review fixes: reversal visibility, document numbers, slip rates kept,
-- return dates, one supplier per settle call.
begin;
\ir helpers/helpers.psql
select plan(14);

create function tests.ret(p_date date) returns uuid language sql as $$
  select public.record_return(jsonb_build_object('id', gen_random_uuid(), 'supplier_id',
    (select supplier_id from public.deliveries where id = 'eeeeeeee-0000-0000-0000-000000000001'),
    'project_id', (select project_id from public.deliveries where id = 'eeeeeeee-0000-0000-0000-000000000001'),
    'return_date', p_date, 'lines', jsonb_build_array(jsonb_build_object(
      'delivery_line_id', 'eeeeeeee-0000-0000-0001-000000000001', 'qty', 5))))
$$;
grant execute on function tests.ret(date) to authenticated;

select tests.create_user('owner') as owner \gset
select tests.create_user('acct') as acct \gset
select tests.create_user('pm') as pm \gset
select tests.create_user('site') as site \gset
select tests.create_company('Review Nirman', :'owner') as co \gset
select tests.add_member(:'co', :'acct', array['accounts']::public.app_role[], true);
select tests.add_member(:'co', :'pm', array['project_manager']::public.app_role[], true);
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Project A', 1000000000) as pa \gset
select public.create_project(:'co', 'B', 'Project B', 1000000000) as pb \gset
select tests.supplier(:'co', 'Ram Traders') as s1 \gset
select tests.supplier(:'co', 'Sita Traders') as s2 \gset
select tests.unit(:'co', 'bag') as bag \gset
select tests.logout();
select tests.assign(:'co', :'pa', :'pm');
select tests.assign(:'co', :'pa', :'site');

-- Reversals on a project the PM is not assigned to stay hidden, reason included.
select tests.login(:'acct');
select tests.posted_bill(:'co', :'s1', :'pb', 5000000, '2026-05-01') as bb \gset
select public.reverse_bill(gen_random_uuid(), :'bb', '2026-05-02', 'Overbilled, kickback suspected');
select tests.posted_bill(:'co', :'s1', :'pa', 3000000, '2026-05-01') as ba \gset
select public.reverse_bill(gen_random_uuid(), :'ba', '2026-05-02', 'Wrong project');
select is((select count(*) from public.reversals), 2::bigint, 'accounts sees every reversal');
select tests.login(:'pm');
select is((select count(*) from public.reversals where bill_id = :'bb'), 0::bigint,
  'a PM does not see the reversal of a bill on another project');
select is((select count(*) from public.posting_events e left join public.reversals r on r.id = e.reversal_id
           where e.bill_id = :'bb' or r.bill_id = :'bb'), 0::bigint, '... nor its posting events');
select is((select reason from public.reversals where bill_id = :'ba'), 'Wrong project',
  'a PM still sees the reversal of a bill on their own project');
select is((select count(*) from public.posting_events where bill_id = :'ba'), 1::bigint, '... and its posting event');
select tests.login(:'site');
select is((select count(*) from public.reversals), 0::bigint, 'staff without finance see no reversals');

-- Document numbers are taken only by the functions that create documents.
select throws_ok(format($$select public.next_doc_number(%L, 'payment', 'PAY')$$, :'co'), '42501', null,
  'members cannot take payment numbers directly');

-- Expected rates entered by finance survive an edit by staff who cannot see rates.
select public.save_slip_draft(jsonb_build_object('id', 'dddddddd-0000-0000-0000-000000000001', 'supplier_id', :'s1',
  'lines', jsonb_build_array(jsonb_build_object('id', 'dddddddd-0000-0000-0001-000000000001', 'project_id', :'pa',
    'material_text', 'Cement', 'qty', 100, 'unit_id', :'bag'))));
select tests.login(:'owner');
select public.save_slip_draft(jsonb_build_object('id', 'dddddddd-0000-0000-0000-000000000001', 'supplier_id', :'s1',
  'lines', jsonb_build_array(jsonb_build_object('id', 'dddddddd-0000-0000-0001-000000000001', 'project_id', :'pa',
    'material_text', 'Cement', 'qty', 100, 'unit_id', :'bag', 'est_rate_paisa', 85000))));
select tests.login(:'site');
select public.save_slip_draft(jsonb_build_object('id', 'dddddddd-0000-0000-0000-000000000001', 'supplier_id', :'s1',
  'lines', jsonb_build_array(jsonb_build_object('id', 'dddddddd-0000-0000-0001-000000000001', 'project_id', :'pa',
    'material_text', 'Cement', 'qty', 120, 'unit_id', :'bag', 'est_rate_paisa', null))));
select tests.logout();
select is((select est_rate_paisa from public.order_slip_line_prices where id = 'dddddddd-0000-0000-0001-000000000001'),
  85000::bigint, 'the expected rate is kept when site staff change the quantity');
select tests.login(:'owner');
select public.save_slip_draft(jsonb_build_object('id', 'dddddddd-0000-0000-0000-000000000001', 'supplier_id', :'s1',
  'lines', jsonb_build_array(jsonb_build_object('id', 'dddddddd-0000-0000-0001-000000000001', 'project_id', :'pa',
    'material_text', 'Cement', 'qty', 120, 'unit_id', :'bag'))));
select is((select count(*) from public.order_slip_line_prices where id = 'dddddddd-0000-0000-0001-000000000001'),
  0::bigint, 'finance users can still clear a rate');

-- Returns are dated between the delivery and today.
select tests.login(:'site');
select public.record_delivery(jsonb_build_object('id', 'eeeeeeee-0000-0000-0000-000000000001', 'supplier_id', :'s1',
  'project_id', :'pa', 'receipt_date', '2026-05-10', 'no_slip_reason', 'Urgent',
  'lines', jsonb_build_array(jsonb_build_object('id', 'eeeeeeee-0000-0000-0001-000000000001',
    'material_text', 'Cement', 'unit_id', :'bag', 'received_qty', 50))));
select throws_ok($$select tests.ret('2026-05-09')$$, '22023', 'The return date is before the goods were received',
  'a return cannot be dated before the delivery');
select throws_ok($$select tests.ret(private.today() + 1)$$, '22023', 'The return date cannot be in the future',
  'a return cannot be dated in the future');
select lives_ok($$select tests.ret('2026-05-10')$$, 'a return on the delivery day is fine');

-- One settle call covers one supplier.
select tests.login(:'acct');
select tests.posted_bill(:'co', :'s1', :'pa', 1000000, '2026-05-01') as b1 \gset
select tests.posted_bill(:'co', :'s2', :'pa', 1000000, '2026-05-01') as b2 \gset
select (public.record_payment(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'supplier_id', :'s1',
  'payment_date', '2026-05-03', 'amount_paisa', 1000000,
  'allocations', jsonb_build_array(jsonb_build_object('project_id', :'pa', 'amount_paisa', 1000000)))) ->> 'payment_id') as p1 \gset
select (public.record_payment(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'supplier_id', :'s2',
  'payment_date', '2026-05-03', 'amount_paisa', 1000000,
  'allocations', jsonb_build_array(jsonb_build_object('project_id', :'pa', 'amount_paisa', 1000000)))) ->> 'payment_id') as p2 \gset
select throws_ok(format($$select public.settle(gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('payment_id', %L, 'bill_id', %L, 'project_id', %L, 'amount_paisa', 1000000),
    jsonb_build_object('payment_id', %L, 'bill_id', %L, 'project_id', %L, 'amount_paisa', 1000000)))$$,
    :'p1', :'b1', :'pa', :'p2', :'b2', :'pa'),
  'P0001', 'Match one supplier at a time', 'one settle call cannot mix suppliers');
select is((select count(*) from public.settlement_events where bill_id in (:'b1', :'b2')), 0::bigint,
  '... and nothing is settled');

select * from finish();
rollback;
