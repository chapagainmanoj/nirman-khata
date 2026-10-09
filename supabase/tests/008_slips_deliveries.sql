-- Order slips, deliveries and returns (req §9, §10; acceptance #3, #4; I-1; S4).
begin;
\ir helpers/helpers.psql
select plan(33);

select tests.create_user('owner') as owner \gset
select tests.create_user('site') as site \gset
select tests.create_user('pm') as pm \gset
select tests.create_user('viewer') as viewer \gset
select tests.create_company('Slip Nirman', :'owner') as co \gset
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
select tests.add_member(:'co', :'pm', array['project_manager']::public.app_role[], true);
select tests.add_member(:'co', :'viewer', array['viewer']::public.app_role[], false);
update public.memberships set can_approve_slips = true where user_id = :'pm';

select tests.login(:'owner');
select public.create_project(:'co', 'P1', 'School', 100000000) as p1 \gset
select public.create_project(:'co', 'P2', 'House', 100000000) as p2 \gset
select tests.supplier(:'co', 'Shrestha Suppliers') as sup \gset
select tests.material(:'co', 'Cement') as cement \gset
select tests.unit(:'co', 'bag') as bag \gset
select tests.unit(:'co', 'trip') as trip \gset
select tests.logout();
select tests.assign(:'co', :'p1', :'site');
select tests.assign(:'co', :'p1', :'pm');
select tests.assign(:'co', :'p2', :'pm');
select tests.assign(:'co', :'p1', :'viewer');

-- Acceptance #3: one supplier, 5 lines for P1 and 2 for P2 on one slip.
select tests.login(:'pm');
select public.save_slip_draft(jsonb_build_object(
  'id', 'aaaaaaaa-0000-0000-0000-000000000001', 'supplier_id', :'sup', 'request_date', '2026-05-01',
  'lines', (
    select jsonb_agg(jsonb_build_object(
      'id', format('aaaaaaaa-0000-0000-0001-%s', lpad(i::text, 12, '0')),
      'project_id', case when i <= 5 then :'p1'::uuid else :'p2'::uuid end,
      'material_id', :'cement', 'qty', 100, 'unit_id', :'bag', 'est_rate_paisa', 85000) order by i)
    from generate_series(1, 7) i)
)) ->> 'number' as slip_no \gset
select is(:'slip_no'::text, 'OS-0001', 'slip numbers come from the company sequence');
select is((select count(*) from public.order_slip_lines where slip_id = 'aaaaaaaa-0000-0000-0000-000000000001' and project_id = :'p1'),
  5::bigint, 'acceptance #3: five lines keep Project 1');
select is((select count(*) from public.order_slip_lines where slip_id = 'aaaaaaaa-0000-0000-0000-000000000001' and project_id = :'p2'),
  2::bigint, 'acceptance #3: two lines keep Project 2');

-- Site staff assigned to P1 only: the header, P1 lines, and no rates.
select tests.login(:'site');
select is((select count(*) from public.order_slips), 0::bigint, 'a draft is private to its creator');
select tests.login(:'pm');
select is(public.submit_slip('aaaaaaaa-0000-0000-0000-000000000001'), 'pending'::public.slip_status,
  'with approval on, a submitted slip waits for approval');
select tests.login(:'site');
select is((select count(*) from public.order_slip_lines), 5::bigint, 'site staff see only their project''s lines');
select is((select count(*) from public.order_slip_line_prices), 0::bigint, 'staff without finance cannot see estimated rates');
select throws_ok($$select public.decide_slip('aaaaaaaa-0000-0000-0000-000000000001', true)$$, '42501', null,
  'site staff cannot approve');

select tests.logout();
select is((select count(*) from public.notifications where user_id = :'owner' and kind = 'slip_submitted'), 1::bigint,
  'the admin is notified that a slip needs approval');

select tests.login(:'pm');
select is(public.decide_slip('aaaaaaaa-0000-0000-0000-000000000001', true), 'approved'::public.slip_status,
  'a PM with the approve flag and access to every project on the slip approves it');

-- S4: sharing needs current access to every project on the slip.
select tests.login(:'site');
select throws_ok($$select public.mark_slip_sent('aaaaaaaa-0000-0000-0000-000000000001', 'whatsapp')$$, '42501', null,
  'staff who cannot see every project on the slip cannot share it');
select tests.login(:'pm');
select lives_ok($$select public.mark_slip_sent('aaaaaaaa-0000-0000-0000-000000000001', 'whatsapp')$$, 'the PM shares the slip');
select tests.logout();
delete from public.project_assignments where project_id = :'p2' and user_id = :'pm';
select tests.login(:'pm');
select throws_ok($$select public.mark_slip_sent('aaaaaaaa-0000-0000-0000-000000000001', 'print')$$, '42501', null,
  'S4: after losing access to one project, the creator can no longer share the slip');
select tests.logout();
select tests.assign(:'co', :'p2', :'pm');

-- Site staff cannot order for a project they are not assigned to; viewers cannot order.
select tests.login(:'site');
select throws_ok(format($$select public.save_slip_draft(jsonb_build_object('id', gen_random_uuid(), 'supplier_id', %L,
  'lines', jsonb_build_array(jsonb_build_object('project_id', %L, 'material_id', %L, 'qty', 1, 'unit_id', %L))))$$,
  :'sup', :'p2', :'cement', :'bag'), '42501', null, 'site staff cannot add lines for an unassigned project');
select throws_ok(format($$select public.save_slip_draft(jsonb_build_object('id', gen_random_uuid(), 'supplier_id', %L,
  'lines', jsonb_build_array(jsonb_build_object('project_id', %L, 'material_text', 'Sand', 'qty', 2, 'unit_id', %L))))$$,
  :'sup', :'p1', :'trip'), '22023', null, 'a trip quantity needs a vehicle note');
select tests.login(:'viewer');
select throws_ok(format($$select public.save_slip_draft(jsonb_build_object('id', gen_random_uuid(), 'supplier_id', %L,
  'lines', jsonb_build_array(jsonb_build_object('project_id', %L, 'material_id', %L, 'qty', 1, 'unit_id', %L))))$$,
  :'sup', :'p1', :'cement', :'bag'), '42501', null, 'viewers cannot create slips');

-- Acceptance #4: order 100 bags, receive 60, then 40 more.
select tests.login(:'site');
select public.save_slip_draft(jsonb_build_object(
  'id', 'bbbbbbbb-0000-0000-0000-000000000001', 'supplier_id', :'sup',
  'lines', jsonb_build_array(jsonb_build_object('id', 'bbbbbbbb-0000-0000-0001-000000000001',
    'project_id', :'p1', 'material_id', :'cement', 'qty', 100, 'unit_id', :'bag'))));
select public.submit_slip('bbbbbbbb-0000-0000-0000-000000000001');
select throws_ok(format($$select public.record_delivery(jsonb_build_object('id', gen_random_uuid(), 'supplier_id', %L,
  'project_id', %L, 'slip_id', 'bbbbbbbb-0000-0000-0000-000000000001', 'receipt_date', '2026-05-02',
  'lines', jsonb_build_array(jsonb_build_object('slip_line_id', 'bbbbbbbb-0000-0000-0001-000000000001', 'received_qty', 60))))$$,
  :'sup', :'p1'), 'P0001', null, 'no delivery against a slip that is not approved');
select tests.login(:'pm');
select public.decide_slip('bbbbbbbb-0000-0000-0000-000000000001', true);
select tests.login(:'site');
select public.record_delivery(jsonb_build_object('id', 'cccccccc-0000-0000-0000-000000000001', 'supplier_id', :'sup',
  'project_id', :'p1', 'slip_id', 'bbbbbbbb-0000-0000-0000-000000000001', 'challan_no', 'CH-77', 'receipt_date', '2026-05-02',
  'lines', jsonb_build_array(jsonb_build_object('id', 'cccccccc-0000-0000-0001-000000000001',
    'slip_line_id', 'bbbbbbbb-0000-0000-0001-000000000001', 'received_qty', 60))));
select is((select row(received_qty, remaining_qty)::text from public.order_slip_line_progress where id = 'bbbbbbbb-0000-0000-0001-000000000001'),
  '(60.000,40.000)', 'acceptance #4: 60 received, 40 pending');
select is((select fulfilment from public.order_slip_progress where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'partially_received', 'the slip is partially received');
select is(
  public.record_delivery(jsonb_build_object('id', 'cccccccc-0000-0000-0000-000000000001', 'supplier_id', :'sup',
    'project_id', :'p1', 'slip_id', 'bbbbbbbb-0000-0000-0000-000000000001', 'receipt_date', '2026-05-02',
    'lines', jsonb_build_array(jsonb_build_object('slip_line_id', 'bbbbbbbb-0000-0000-0001-000000000001', 'received_qty', 60))))::text,
  'cccccccc-0000-0000-0000-000000000001', 'a retried delivery returns the saved one');
select is((select count(*) from public.deliveries), 1::bigint, '... and does not create a second delivery');
select public.record_delivery(jsonb_build_object('id', 'cccccccc-0000-0000-0000-000000000002', 'supplier_id', :'sup',
  'project_id', :'p1', 'slip_id', 'bbbbbbbb-0000-0000-0000-000000000001', 'receipt_date', '2026-05-03',
  'lines', jsonb_build_array(jsonb_build_object('slip_line_id', 'bbbbbbbb-0000-0000-0001-000000000001', 'received_qty', 40))));
select is((select fulfilment from public.order_slip_progress where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'fully_received', 'acceptance #4: 40 more marks it fully received');

-- Over-delivery is flagged; a delivery without a slip needs a reason.
select public.record_delivery(jsonb_build_object('id', 'cccccccc-0000-0000-0000-000000000003', 'supplier_id', :'sup',
  'project_id', :'p1', 'slip_id', 'bbbbbbbb-0000-0000-0000-000000000001', 'receipt_date', '2026-05-04',
  'lines', jsonb_build_array(jsonb_build_object('slip_line_id', 'bbbbbbbb-0000-0000-0001-000000000001', 'received_qty', 5))));
select is((select over_received from public.order_slip_line_progress where id = 'bbbbbbbb-0000-0000-0001-000000000001'),
  true, 'more received than ordered is flagged for review');
select throws_ok(format($$select public.record_delivery(jsonb_build_object('id', gen_random_uuid(), 'supplier_id', %L,
  'project_id', %L, 'receipt_date', '2026-05-04',
  'lines', jsonb_build_array(jsonb_build_object('material_id', %L, 'unit_id', %L, 'received_qty', 10))))$$,
  :'sup', :'p1', :'cement', :'bag'), '23514', null, 'a delivery without a slip needs a reason');
select throws_ok(format($$select public.record_delivery(jsonb_build_object('id', gen_random_uuid(), 'supplier_id', %L,
  'project_id', %L, 'receipt_date', '2026-05-04', 'no_slip_reason', 'urgent',
  'lines', jsonb_build_array(jsonb_build_object('material_id', %L, 'unit_id', %L, 'received_qty', 10))))$$,
  :'sup', :'p2', :'cement', :'bag'), '42501', null, 'site staff cannot record deliveries for another project');

select tests.login(:'viewer');
select is((select count(*) from public.deliveries), 3::bigint, 'viewers on the project see deliveries');
select throws_ok(format($$select public.record_delivery(jsonb_build_object('id', gen_random_uuid(), 'supplier_id', %L,
  'project_id', %L, 'receipt_date', '2026-05-04', 'no_slip_reason', 'urgent',
  'lines', jsonb_build_array(jsonb_build_object('material_id', %L, 'unit_id', %L, 'received_qty', 10))))$$,
  :'sup', :'p1', :'cement', :'bag'), '42501', null, '... but cannot record them');

-- Returns change quantities only.
select tests.login(:'site');
select public.record_return(jsonb_build_object('id', gen_random_uuid(), 'supplier_id', :'sup', 'project_id', :'p1',
  'return_date', '2026-05-05', 'lines', jsonb_build_array(jsonb_build_object(
    'delivery_line_id', 'cccccccc-0000-0000-0001-000000000001', 'qty', 10))));
select is((select received_qty from public.order_slip_line_progress where id = 'bbbbbbbb-0000-0000-0001-000000000001'),
  95.000, 'a return lowers the received quantity');
select throws_ok(format($$select public.record_return(jsonb_build_object('id', gen_random_uuid(), 'supplier_id', %L,
  'project_id', %L, 'lines', jsonb_build_array(jsonb_build_object('delivery_line_id', 'cccccccc-0000-0000-0001-000000000001', 'qty', 51))))$$,
  :'sup', :'p1'), 'P0001', null, 'cannot return more than was accepted');
select throws_ok($$select public.delete_delivery('cccccccc-0000-0000-0000-000000000001')$$, 'P0001', null,
  'a delivery with returns cannot be deleted');

-- I-1: orders, deliveries and returns never create cost or payable.
select tests.logout();
select is((select count(*) from public.ledger_entries where company_id = :'co'), 0::bigint, 'I-1: slips, deliveries and returns write no ledger rows');

-- Approval off: a submitted slip is approved straight away.
update public.companies set slip_approval_required = false where id = :'co';
select tests.login(:'site');
select public.save_slip_draft(jsonb_build_object('id', 'dddddddd-0000-0000-0000-000000000001', 'supplier_id', :'sup',
  'lines', jsonb_build_array(jsonb_build_object('project_id', :'p1', 'material_id', :'cement', 'qty', 10, 'unit_id', :'bag'))));
select is(public.submit_slip('dddddddd-0000-0000-0000-000000000001'), 'approved'::public.slip_status,
  'with approval off, a submitted slip is approved');
select public.close_slip_short('dddddddd-0000-0000-0000-000000000001', 'Supplier out of stock');
select is((select fulfilment from public.order_slip_progress where id = 'dddddddd-0000-0000-0000-000000000001'),
  'closed_short', 'a slip can be closed short with a reason');

select * from finish();
rollback;
