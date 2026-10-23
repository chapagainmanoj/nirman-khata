-- Supplier bills: charge allocation, delivery matching, own-draft access, posting
-- (req §11; acceptance #17, #21 cost side; I-2, I-3, I-7, I-12; M1-M4; S2 for X1; C2).
begin;
\ir helpers/helpers.psql
select plan(42);

select tests.create_user('owner') as owner \gset
select tests.create_user('acct') as acct \gset
select tests.create_user('site') as site \gset
select tests.create_user('site2') as site2 \gset
select tests.create_user('pm1') as pm1 \gset
select tests.create_user('pm12') as pm12 \gset
select tests.create_company('Bill Nirman', :'owner') as co \gset
select tests.add_member(:'co', :'acct', array['accounts']::public.app_role[], true);
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
select tests.add_member(:'co', :'site2', array['site_staff']::public.app_role[], false);
select tests.add_member(:'co', :'pm1', array['project_manager']::public.app_role[], true);
select tests.add_member(:'co', :'pm12', array['project_manager']::public.app_role[], true);

select tests.login(:'owner');
select public.create_project(:'co', 'P1', 'School', 100000000) as p1 \gset
select public.create_project(:'co', 'P2', 'House', 100000000) as p2 \gset
select tests.supplier(:'co', 'Gandaki Hardware') as sup \gset
select tests.material(:'co', 'Cement') as cement \gset
select tests.material(:'co', 'Rod (TMT rebar)') as rod \gset
select tests.unit(:'co', 'bag') as bag \gset
select tests.unit(:'co', 'kg') as kg \gset
select tests.heading(:'co', 'Cement') as h_cement \gset
select tests.heading(:'co', 'Rod/Steel') as h_rod \gset
select tests.heading(:'co', 'Transport and Delivery') as h_transport \gset

-- Approved slip, estimated Rs 600/bag, and two deliveries of 100 bags to P1.
select public.save_slip_draft(jsonb_build_object('id', 'aaaaaaaa-0000-0000-0000-000000000001', 'supplier_id', :'sup',
  'lines', jsonb_build_array(jsonb_build_object('id', 'aaaaaaaa-0000-0000-0001-000000000001', 'project_id', :'p1',
    'material_id', :'cement', 'qty', 300, 'unit_id', :'bag', 'est_rate_paisa', 60000))));
select public.submit_slip('aaaaaaaa-0000-0000-0000-000000000001');
select public.decide_slip('aaaaaaaa-0000-0000-0000-000000000001', true);
select public.record_delivery(jsonb_build_object('id', gen_random_uuid(), 'supplier_id', :'sup', 'project_id', :'p1',
  'slip_id', 'aaaaaaaa-0000-0000-0000-000000000001', 'receipt_date', '2026-05-02',
  'lines', jsonb_build_array(jsonb_build_object('id', 'dddddddd-0000-0000-0000-000000000001',
    'slip_line_id', 'aaaaaaaa-0000-0000-0001-000000000001', 'received_qty', 100))));
select public.record_delivery(jsonb_build_object('id', gen_random_uuid(), 'supplier_id', :'sup', 'project_id', :'p1',
  'slip_id', 'aaaaaaaa-0000-0000-0000-000000000001', 'receipt_date', '2026-05-03',
  'lines', jsonb_build_array(jsonb_build_object('id', 'dddddddd-0000-0000-0000-000000000002',
    'slip_line_id', 'aaaaaaaa-0000-0000-0001-000000000001', 'received_qty', 100))));
select tests.logout();
select tests.assign(:'co', :'p1', :'site');
select tests.assign(:'co', :'p1', :'site2');
select tests.assign(:'co', :'p1', :'pm1');
select tests.assign(:'co', :'p1', :'pm12');
select tests.assign(:'co', :'p2', :'pm12');

-- Acceptance #17: lines for two projects plus transport and VAT (VAT as cost, the default).
-- P1 cement 100 bags = Rs 60,000 (matched); P2 rod Rs 40,000 (no delivery, reason given).
-- Transport Rs 2,000, VAT Rs 13,260. Total Rs 1,15,260.
select tests.login(:'acct');
select public.save_bill_draft(jsonb_build_object(
  'id', 'bbbbbbbb-0000-0000-0000-000000000001', 'supplier_id', :'sup', 'bill_no', '1001', 'bill_date', '2026-05-05',
  'transport_paisa', 200000, 'vat_paisa', 1326000,
  'lines', jsonb_build_array(
    jsonb_build_object('id', 'bbbbbbbb-0000-0000-0001-000000000001', 'project_id', :'p1', 'material_id', :'cement',
      'qty', 100, 'unit_id', :'bag', 'rate_paisa', 60000,
      'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', 'dddddddd-0000-0000-0000-000000000001', 'billed_qty', 100))),
    jsonb_build_object('id', 'bbbbbbbb-0000-0000-0001-000000000002', 'project_id', :'p2', 'material_id', :'rod',
      'qty', 400, 'unit_id', :'kg', 'rate_paisa', 10000, 'unmatched_reason', 'Delivered direct, challan lost'))));
select is((public.bill_preview('bbbbbbbb-0000-0000-0000-000000000001') ->> 'total_paisa')::bigint, 11526000::bigint,
  'preview total = lines + transport + VAT');

select tests.login(:'site');
select throws_ok($$select public.post_bill(gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001')$$, '42501', null,
  'site staff cannot post bills');
select tests.login(:'pm12');
select throws_ok($$select public.post_bill(gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001')$$, '42501', null,
  'project managers cannot post bills');

select tests.login(:'acct');
select is((public.post_bill('eeeeeeee-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001') ->> 'total_paisa')::bigint,
  11526000::bigint, 'Accounts posts the bill');
select tests.logout();
select is(tests.ledger(:'sup', :'p1', 'cost_paisa'), 6915600::bigint,
  'acceptance #17: P1 cost = 60,000 + 1,200 transport + 7,956 VAT');
select is(tests.ledger(:'sup', :'p2', 'cost_paisa'), 4610400::bigint,
  'acceptance #17: P2 cost = 40,000 + 800 transport + 5,304 VAT');
select is(tests.ledger(:'sup', :'p1', 'balance_paisa') + tests.ledger(:'sup', :'p2', 'balance_paisa'), 11526000::bigint,
  'I-2: project amounts add up to the bill total');
select is((select count(*) from public.ledger_entries where company_id = :'co' and cash_paisa <> 0), 0::bigint, 'a bill pays nothing');

-- Retries and double posting (C2, C3, I-12).
select tests.login(:'acct');
select is((public.post_bill('eeeeeeee-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001') ->> 'total_paisa')::bigint,
  11526000::bigint, 'a retry with the same key returns the original result');
select throws_like($$select public.post_bill(gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001')$$,
  'already_posted%', 'posting again with a new key is refused');
select tests.logout();
select is((select count(*) from public.posting_events where bill_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 1::bigint,
  'the bill has exactly one posting event');
select throws_ok($$update public.bill_lines set amount_paisa = 1 where id = 'bbbbbbbb-0000-0000-0001-000000000001'$$,
  'P0001', null, 'posted bill lines cannot be edited');
select throws_ok($$update public.ledger_entries set cost_paisa = 0$$, 'P0001', null, 'I-11: ledger rows cannot be changed');

-- Visibility of a two-project bill (design §3.4 point 4).
select tests.login(:'pm1');
select is((select count(*) from public.supplier_bills), 1::bigint, 'a finance PM on one project sees the bill header');
select is((select count(*) from public.bill_lines), 1::bigint, '... only their project''s line');
select is((select count(*) from public.supplier_bill_charges), 0::bigint, '... and not the bill total');
select tests.login(:'pm12');
select is((select count(*) from public.supplier_bill_charges), 1::bigint, 'a finance PM on both projects sees the total');
select tests.login(:'site');
select is((select count(*) from public.bill_lines), 0::bigint, 'staff without finance see no posted bill lines');

-- M1: 60 of a 100-bag delivery billed leaves 40 billable.
select tests.login(:'acct');
select public.save_bill_draft(jsonb_build_object(
  'id', 'bbbbbbbb-0000-0000-0000-000000000002', 'supplier_id', :'sup', 'bill_no', '1002', 'bill_date', '2026-05-06',
  'lines', jsonb_build_array(jsonb_build_object('project_id', :'p1', 'material_id', :'cement', 'qty', 60, 'unit_id', :'bag',
    'rate_paisa', 60000,
    'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', 'dddddddd-0000-0000-0000-000000000002', 'billed_qty', 60))))));
select public.post_bill(gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000002');
select is((select billable_qty from public.delivery_line_status where id = 'dddddddd-0000-0000-0000-000000000002'), 40.000,
  'M1: 60 of 100 bags billed, 40 remain billable');

-- M4: a bill cannot claim more than is still billable.
select public.save_bill_draft(jsonb_build_object(
  'id', 'bbbbbbbb-0000-0000-0000-000000000003', 'supplier_id', :'sup', 'bill_no', '1003', 'bill_date', '2026-05-07',
  'lines', jsonb_build_array(jsonb_build_object('project_id', :'p1', 'material_id', :'cement', 'qty', 50, 'unit_id', :'bag',
    'rate_paisa', 60000,
    'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', 'dddddddd-0000-0000-0000-000000000002', 'billed_qty', 50))))));
select throws_like($$select public.post_bill(gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000003')$$,
  '%already been billed%', 'M4: billed quantity cannot exceed what is billable');

-- M2: matches must be the same supplier, project, material and unit.
select throws_like(format($$select public.save_bill_draft(jsonb_build_object(
  'id', gen_random_uuid(), 'supplier_id', %L, 'bill_no', 'X', 'lines', jsonb_build_array(jsonb_build_object(
    'project_id', %L, 'material_id', %L, 'qty', 10, 'unit_id', %L, 'amount_paisa', 1000,
    'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', 'dddddddd-0000-0000-0000-000000000002', 'billed_qty', 10))))))$$,
  :'sup', :'p2', :'cement', :'bag'), '%same supplier, project, material and unit%', 'M2: a delivery for another project cannot be matched');
select throws_like(format($$select public.save_bill_draft(jsonb_build_object(
  'id', gen_random_uuid(), 'supplier_id', %L, 'bill_no', 'X', 'lines', jsonb_build_array(jsonb_build_object(
    'project_id', %L, 'material_id', %L, 'qty', 10, 'unit_id', %L, 'amount_paisa', 1000,
    'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', 'dddddddd-0000-0000-0000-000000000002', 'billed_qty', 10))))))$$,
  :'sup', :'p1', :'rod', :'kg'), '%same supplier, project, material and unit%', 'M2: a different material or unit cannot be matched');

-- M2 for an item typed under "Other" (no catalog material): it matches a line with no material.
select tests.login(:'owner');
select public.record_delivery(jsonb_build_object('id', gen_random_uuid(), 'supplier_id', :'sup', 'project_id', :'p1',
  'receipt_date', '2026-05-06', 'no_slip_reason', 'Urgent',
  'lines', jsonb_build_array(jsonb_build_object('id', 'dddddddd-0000-0000-0000-000000000003',
    'material_text', 'Motor', 'unit_id', :'bag', 'received_qty', 1))));
select tests.login(:'acct');
select lives_ok(format($$select public.save_bill_draft(jsonb_build_object(
  'id', gen_random_uuid(), 'supplier_id', %L, 'bill_no', 'T-1', 'lines', jsonb_build_array(jsonb_build_object(
    'project_id', %L, 'description', 'Motor', 'heading_id', %L, 'qty', 1, 'unit_id', %L, 'amount_paisa', 1500000,
    'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', 'dddddddd-0000-0000-0000-000000000003', 'billed_qty', 1))))))$$,
  :'sup', :'p1', :'h_rod', :'bag'), 'M2: a typed delivery item matches a bill line with no material');
select throws_like(format($$select public.save_bill_draft(jsonb_build_object(
  'id', gen_random_uuid(), 'supplier_id', %L, 'bill_no', 'T-2', 'lines', jsonb_build_array(jsonb_build_object(
    'project_id', %L, 'material_id', %L, 'qty', 1, 'unit_id', %L, 'amount_paisa', 1500000,
    'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', 'dddddddd-0000-0000-0000-000000000003', 'billed_qty', 1))))))$$,
  :'sup', :'p1', :'cement', :'bag'), '%same supplier, project, material and unit%', 'M2: a typed delivery item cannot match a catalog material line');
select throws_like(format($$select public.save_bill_draft(jsonb_build_object(
  'id', gen_random_uuid(), 'supplier_id', %L, 'bill_no', 'T-3', 'lines', jsonb_build_array(jsonb_build_object(
    'project_id', %L, 'description', 'Motor', 'heading_id', %L, 'qty', 1, 'unit_id', %L, 'amount_paisa', 1500000,
    'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', 'dddddddd-0000-0000-0000-000000000003', 'billed_qty', 1))))))$$,
  :'sup', :'p1', :'h_rod', :'kg'), '%same supplier, project, material and unit%', 'M2: a typed delivery item still needs the same unit');

-- M3: an unmatched material line needs a reason on that line.
select public.save_bill_draft(jsonb_build_object(
  'id', 'bbbbbbbb-0000-0000-0000-000000000004', 'supplier_id', :'sup', 'bill_no', '1004', 'bill_date', '2026-05-07',
  'lines', jsonb_build_array(
    jsonb_build_object('project_id', :'p1', 'material_id', :'rod', 'qty', 10, 'unit_id', :'kg', 'amount_paisa', 100000,
      'unmatched_reason', 'Small purchase'),
    jsonb_build_object('project_id', :'p1', 'material_id', :'rod', 'qty', 5, 'unit_id', :'kg', 'amount_paisa', 50000))));
select throws_like($$select public.post_bill(gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000004')$$,
  '%add a reason on the line%', 'M3: one unmatched line without a reason blocks posting');

-- Rate more than 5% away from the slip estimate needs a reason.
select public.save_bill_draft(jsonb_build_object(
  'id', 'bbbbbbbb-0000-0000-0000-000000000005', 'supplier_id', :'sup', 'bill_no', '1005', 'bill_date', '2026-05-07',
  'lines', jsonb_build_array(jsonb_build_object('project_id', :'p1', 'material_id', :'cement', 'qty', 40, 'unit_id', :'bag',
    'rate_paisa', 70000,
    'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', 'dddddddd-0000-0000-0000-000000000002', 'billed_qty', 40))))));
select is((select count(*) from jsonb_array_elements(public.bill_preview('bbbbbbbb-0000-0000-0000-000000000005') -> 'checks') c
           where c ->> 'code' = 'rate_variance' and c ->> 'severity' = 'reason'), 1::bigint,
  'a rate 16% above the slip estimate needs a reason');

-- Charge override: transport only for P1; overrides must add up.
select public.save_bill_draft(jsonb_build_object(
  'id', 'bbbbbbbb-0000-0000-0000-000000000006', 'supplier_id', :'sup', 'bill_no', '1006', 'bill_date', '2026-05-07',
  'transport_paisa', 300000,
  'lines', jsonb_build_array(
    jsonb_build_object('id', 'bbbbbbbb-0000-0000-0006-000000000001', 'project_id', :'p1', 'material_id', :'rod', 'qty', 10,
      'unit_id', :'kg', 'amount_paisa', 100000, 'unmatched_reason', 'x'),
    jsonb_build_object('id', 'bbbbbbbb-0000-0000-0006-000000000002', 'project_id', :'p2', 'material_id', :'rod', 'qty', 10,
      'unit_id', :'kg', 'amount_paisa', 100000, 'unmatched_reason', 'x')),
  'overrides', jsonb_build_array(jsonb_build_object('charge', 'transport', 'project_id', :'p1', 'amount_paisa', 300000))));
select is((select (l ->> 'transport_share')::bigint from jsonb_array_elements(public.bill_preview('bbbbbbbb-0000-0000-0000-000000000006') -> 'lines') l
           where l ->> 'line_id' = 'bbbbbbbb-0000-0000-0006-000000000002'), 0::bigint,
  'transport overridden to P1 puts nothing on P2');
select public.save_bill_draft(jsonb_build_object(
  'id', 'bbbbbbbb-0000-0000-0000-000000000006', 'supplier_id', :'sup', 'bill_no', '1006', 'bill_date', '2026-05-07',
  'transport_paisa', 300000,
  'lines', jsonb_build_array(jsonb_build_object('project_id', :'p1', 'material_id', :'rod', 'qty', 10,
      'unit_id', :'kg', 'amount_paisa', 100000, 'unmatched_reason', 'x')),
  'overrides', jsonb_build_array(jsonb_build_object('charge', 'transport', 'project_id', :'p1', 'amount_paisa', 100000))));
select throws_like($$select public.post_bill(gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000006')$$,
  '%must add up%', 'I-2: posting is blocked when the split does not balance');

-- Recoverable VAT (acceptance #21, cost side): copied onto the draft when it is created.
select tests.logout();
update public.companies set vat_treatment = 'vat_recoverable' where id = :'co';
select tests.login(:'acct');
select public.save_bill_draft(jsonb_build_object(
  'id', 'bbbbbbbb-0000-0000-0000-000000000007', 'supplier_id', :'sup', 'bill_no', '1007', 'bill_date', '2026-05-08',
  'vat_paisa', 1300000,
  'lines', jsonb_build_array(jsonb_build_object('project_id', :'p2', 'material_id', :'rod', 'qty', 1000,
    'unit_id', :'kg', 'amount_paisa', 10000000, 'unmatched_reason', 'x'))));
select tests.logout();
update public.companies set vat_treatment = 'vat_as_cost' where id = :'co';
select tests.login(:'acct');
select is((select vat_treatment from public.supplier_bills where id = 'bbbbbbbb-0000-0000-0000-000000000007'),
  'vat_recoverable'::public.vat_treatment, 'the draft keeps the VAT treatment it was created with');
select is((public.post_bill(gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000007') ->> 'cost_paisa')::bigint, 10000000::bigint,
  'acceptance #21: recoverable VAT is not project cost (1,00,000)');
select is((select payable_amount_paisa from public.bill_lines where bill_id = 'bbbbbbbb-0000-0000-0000-000000000007'), 11300000::bigint,
  'acceptance #21: the supplier is owed the full 1,13,000');

-- X1: the creator of a draft reads its amounts; nobody else without finance does (S2).
select tests.login(:'site');
select public.save_bill_draft(jsonb_build_object(
  'id', 'bbbbbbbb-0000-0000-0000-000000000008', 'supplier_id', :'sup', 'bill_no', 'S-1', 'bill_date', '2026-05-09',
  'lines', jsonb_build_array(jsonb_build_object('project_id', :'p1', 'material_id', :'rod', 'qty', 3, 'unit_id', :'kg',
    'amount_paisa', 30000))));
select is((select count(*) from public.supplier_bill_charges), 1::bigint, 'X1: the creator reads their draft''s amounts');
select throws_ok(format($$select public.save_bill_draft(jsonb_build_object('id', gen_random_uuid(), 'supplier_id', %L,
  'bill_no', 'S-2', 'lines', jsonb_build_array(jsonb_build_object('project_id', %L, 'heading_id', %L, 'line_type', 'charge',
  'amount_paisa', 100))))$$, :'sup', :'p2', :'h_transport'), '42501', null, 'site staff cannot enter lines for another project');
select tests.login(:'site2');
select is((select count(*) from public.bill_lines), 0::bigint, 'X1: another staff member cannot read the draft');
select tests.login(:'site');
select public.submit_bill('bbbbbbbb-0000-0000-0000-000000000008');
select is((select count(*) from public.bill_lines), 0::bigint, 'X1 ends when the draft is submitted for review');
select public.save_bill_draft(jsonb_build_object(
  'id', 'bbbbbbbb-0000-0000-0000-000000000009', 'supplier_id', :'sup', 'bill_no', 'S-3', 'bill_date', '2026-05-09',
  'lines', jsonb_build_array(jsonb_build_object('project_id', :'p1', 'material_id', :'rod', 'qty', 3, 'unit_id', :'kg',
    'amount_paisa', 30000))));
select tests.logout();
delete from public.project_assignments where project_id = :'p1' and user_id = :'site';
select tests.login(:'site');
select is((select count(*) from public.supplier_bill_charges), 0::bigint, 'X1 ends when the creator loses project access');

-- Duplicate bill numbers warn.
select tests.login(:'acct');
select public.save_bill_draft(jsonb_build_object(
  'id', 'bbbbbbbb-0000-0000-0000-000000000010', 'supplier_id', :'sup', 'bill_no', ' 1001 ', 'bill_date', '2026-05-09',
  'lines', jsonb_build_array(jsonb_build_object('project_id', :'p1', 'material_id', :'rod', 'qty', 3, 'unit_id', :'kg',
    'amount_paisa', 30000, 'unmatched_reason', 'x'))));
select is((select count(*) from jsonb_array_elements(public.bill_preview('bbbbbbbb-0000-0000-0000-000000000010') -> 'checks') c
           where c ->> 'code' = 'duplicate_bill_no'), 1::bigint, 'a duplicate bill number for the supplier is flagged');

-- I-7: no posting on a closed project.
select tests.logout();
update public.projects set status = 'closed' where id = :'p1';
select tests.login(:'acct');
select throws_like($$select public.post_bill(gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000010')$$,
  '%closed%', 'I-7: a closed project accepts no postings');
select tests.logout();
update public.projects set status = 'completed' where id = :'p1';
select tests.login(:'acct');
select lives_ok($$select public.post_bill(gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000010')$$,
  'a completed project still accepts a final bill');

-- Drafts can be deleted; posted bills cannot.
select lives_ok($$select public.delete_bill_draft('bbbbbbbb-0000-0000-0000-000000000006')$$, 'a draft bill can be deleted');
select throws_ok($$select public.delete_bill_draft('bbbbbbbb-0000-0000-0000-000000000001')$$, '42501', null,
  'a posted bill cannot be deleted');

select * from finish();
rollback;
