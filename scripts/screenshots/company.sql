-- A tidy sample company for the landing page screenshots (scripts/screenshots/README.md).
-- Local database only. Adds its own logins and company beside the demo seed and leaves the
-- demo alone; runs once (does nothing if the company is already there).
--   9800000091  Ramesh Adhikari  Owner / Admin
--   9800000092  Suman Tamang     Site Staff (P-1)
--   9800000093  Sarita KC        Accounts
-- Password for all three: password123. Everything goes through the normal RPCs, as the seed does.
\set ON_ERROR_STOP on
select exists (select 1 from public.companies where name = 'Himali Nirman Sewa') as have \gset
\if :have
  \echo 'Himali Nirman Sewa is already there; nothing to do.'
  \quit
\endif

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated',
  '977' || u.phone || '@phone.nirmankhata.invalid',
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}',
  jsonb_build_object('full_name', u.full_name, 'phone', '+977' || u.phone),
  now(), now(), '', '', '', ''
from (values
  ('a0000000-0000-0000-0000-000000000001', '9800000091', 'Ramesh Adhikari'),
  ('a0000000-0000-0000-0000-000000000002', '9800000092', 'Suman Tamang'),
  ('a0000000-0000-0000-0000-000000000003', '9800000093', 'Sarita KC')
) as u (id, phone, full_name);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u
where u.id in ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003');

\set owner '\'{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}\''
\set site '\'{"sub": "a0000000-0000-0000-0000-000000000002", "role": "authenticated"}\''
\set acct '\'{"sub": "a0000000-0000-0000-0000-000000000003", "role": "authenticated"}\''

select set_config('request.jwt.claims', :owner, true);
select public.create_company('Himali Nirman Sewa', 'Ramesh Adhikari', '+9779800000091') as co \gset

insert into public.memberships (company_id, user_id, roles, can_view_finance, can_record_payments, can_approve_slips)
values
  (:'co', 'a0000000-0000-0000-0000-000000000002', '{site_staff}', false, false, false),
  (:'co', 'a0000000-0000-0000-0000-000000000003', '{accounts}', true, true, false);

-- Two running projects: a health post (1.2 crore contract, 95 lakh budget) and a house (45 lakh, 38 lakh).
select public.create_project(:'co', 'P-1', 'Ward 7 health post building', 1200000000, 950000000, '2026-05-15',
  '{"client_name": "Bharatpur Metropolitan City", "district": "Chitwan", "municipality": "Bharatpur", "ward": "7",
    "planned_start": "2026-05-15", "planned_end": "2027-04-13", "status": "active"}') as p1 \gset
select public.create_project(:'co', 'P-2', 'Residential house, Hakim Chowk', 450000000, 380000000, '2026-08-01',
  '{"client_name": "Private client", "district": "Chitwan", "municipality": "Bharatpur", "ward": "10",
    "planned_start": "2026-08-01", "planned_end": "2027-03-14", "status": "active"}') as p2 \gset
insert into public.project_assignments (company_id, project_id, user_id)
values (:'co', :'p1', 'a0000000-0000-0000-0000-000000000002');

-- Catalog and unit ids, by name, in this company.
select id as cement from public.materials where company_id = :'co' and name = 'Cement' \gset
select id as rod from public.materials where company_id = :'co' and name = 'Rod (TMT rebar)' \gset
select id as sand from public.materials where company_id = :'co' and name = 'Sand (masino)' \gset
select id as aggregate from public.materials where company_id = :'co' and name = 'Aggregate' \gset
select id as brick from public.materials where company_id = :'co' and name = 'Brick' \gset
select id as plumbing from public.materials where company_id = :'co' and name = 'Plumbing items' \gset
select id as bag from public.units where company_id = :'co' and code = 'bag' \gset
select id as kg from public.units where company_id = :'co' and code = 'kg' \gset
select id as trip from public.units where company_id = :'co' and code = 'trip' \gset
select id as thousand from public.units where company_id = :'co' and code = 'thousand' \gset
select id as piece from public.units where company_id = :'co' and code = 'piece' \gset

insert into public.suppliers (company_id, id, name, contact_person, phone, address, categories, payment_terms)
values
  (:'co', 'a2000000-0000-0000-0000-000000000001', 'Narayani Cement & Rod Udhyog', 'Prakash Shrestha', '9855000001', 'Bharatpur', '{Cement,Rod}', '30 days credit'),
  (:'co', 'a2000000-0000-0000-0000-000000000002', 'Rapti Baluwa Gitti Supplier', 'Dil Bahadur Mahato', '9855000002', 'Ratnanagar', '{Sand,Stone,Aggregate}', null),
  (:'co', 'a2000000-0000-0000-0000-000000000003', 'Chitwan Hardware & Sanitary', 'Anju Poudel', '9855000003', 'Narayangadh', '{Hardware,Plumbing,Electrical}', null),
  (:'co', 'a2000000-0000-0000-0000-000000000004', 'Shree Ganesh Eeta Udhyog', 'Hari Chaudhary', '9855000004', 'Khairahani', '{Brick}', '15 days credit');

-- A slip goes draft → submitted → approved → shared; then the site records what arrives.
-- OS-0001 (Bhadra): cement and rod for P-1, all delivered, billed and paid.
select public.save_slip_draft(jsonb_build_object('id', 'a3000000-0000-0000-0000-000000000001',
  'supplier_id', 'a2000000-0000-0000-0000-000000000001', 'request_date', '2026-08-20', 'site_contact', '9800000092',
  'lines', jsonb_build_array(
    jsonb_build_object('id', 'a3000000-0000-0000-0001-000000000001', 'project_id', :'p1', 'material_id', :'cement',
      'spec', 'OPC 43', 'qty', 600, 'unit_id', :'bag', 'est_rate_paisa', 85000),
    jsonb_build_object('id', 'a3000000-0000-0000-0001-000000000002', 'project_id', :'p1', 'material_id', :'rod',
      'spec', '12 mm', 'qty', 8000, 'unit_id', :'kg', 'est_rate_paisa', 11000))));
select public.submit_slip('a3000000-0000-0000-0000-000000000001');
select public.decide_slip('a3000000-0000-0000-0000-000000000001', true);
select public.mark_slip_sent('a3000000-0000-0000-0000-000000000001', 'share');

-- OS-0002 (Ashoj): more cement and rod for P-1, cement for P-2; 150 bags for P-1 still to come.
select public.save_slip_draft(jsonb_build_object('id', 'a3000000-0000-0000-0000-000000000002',
  'supplier_id', 'a2000000-0000-0000-0000-000000000001', 'request_date', '2026-09-25', 'site_contact', '9800000092',
  'lines', jsonb_build_array(
    jsonb_build_object('id', 'a3000000-0000-0000-0002-000000000001', 'project_id', :'p1', 'material_id', :'cement',
      'spec', 'OPC 43', 'qty', 400, 'unit_id', :'bag', 'est_rate_paisa', 85000),
    jsonb_build_object('id', 'a3000000-0000-0000-0002-000000000002', 'project_id', :'p1', 'material_id', :'rod',
      'spec', '16 mm', 'qty', 3000, 'unit_id', :'kg', 'est_rate_paisa', 11000),
    jsonb_build_object('id', 'a3000000-0000-0000-0002-000000000003', 'project_id', :'p2', 'material_id', :'cement',
      'spec', 'PPC', 'qty', 150, 'unit_id', :'bag', 'est_rate_paisa', 82000))));
select public.submit_slip('a3000000-0000-0000-0000-000000000002');
select public.decide_slip('a3000000-0000-0000-0000-000000000002', true);
select public.mark_slip_sent('a3000000-0000-0000-0000-000000000002', 'share');

-- OS-0003: sand and gitti for P-1, by tipper.
select public.save_slip_draft(jsonb_build_object('id', 'a3000000-0000-0000-0000-000000000003',
  'supplier_id', 'a2000000-0000-0000-0000-000000000002', 'request_date', '2026-10-03', 'site_contact', '9800000092',
  'lines', jsonb_build_array(
    jsonb_build_object('id', 'a3000000-0000-0000-0003-000000000001', 'project_id', :'p1', 'material_id', :'sand',
      'qty', 6, 'unit_id', :'trip', 'unit_note', 'Tipper, 200 cft', 'est_rate_paisa', 950000),
    jsonb_build_object('id', 'a3000000-0000-0000-0003-000000000002', 'project_id', :'p1', 'material_id', :'aggregate',
      'spec', '3/4 inch', 'qty', 4, 'unit_id', :'trip', 'unit_note', 'Tipper, 200 cft', 'est_rate_paisa', 1100000))));
select public.submit_slip('a3000000-0000-0000-0000-000000000003');
select public.decide_slip('a3000000-0000-0000-0000-000000000003', true);
select public.mark_slip_sent('a3000000-0000-0000-0000-000000000003', 'share');

-- OS-0004: bricks, 30 thousand for P-1 (delivered) and 12 thousand for P-2 (8 so far).
select public.save_slip_draft(jsonb_build_object('id', 'a3000000-0000-0000-0000-000000000004',
  'supplier_id', 'a2000000-0000-0000-0000-000000000004', 'request_date', '2026-09-10', 'site_contact', '9800000092',
  'lines', jsonb_build_array(
    jsonb_build_object('id', 'a3000000-0000-0000-0004-000000000001', 'project_id', :'p1', 'material_id', :'brick',
      'spec', 'First class', 'qty', 30, 'unit_id', :'thousand', 'est_rate_paisa', 1650000),
    jsonb_build_object('id', 'a3000000-0000-0000-0004-000000000002', 'project_id', :'p2', 'material_id', :'brick',
      'spec', 'First class', 'qty', 12, 'unit_id', :'thousand', 'est_rate_paisa', 1650000))));
select public.submit_slip('a3000000-0000-0000-0000-000000000004');
select public.decide_slip('a3000000-0000-0000-0000-000000000004', true);
select public.mark_slip_sent('a3000000-0000-0000-0000-000000000004', 'share');

-- Deliveries, recorded by the site.
select set_config('request.jwt.claims', :site, true);
select public.record_delivery(jsonb_build_object('id', 'a4000000-0000-0000-0000-000000000001',
  'supplier_id', 'a2000000-0000-0000-0000-000000000001', 'project_id', :'p1', 'slip_id', 'a3000000-0000-0000-0000-000000000001',
  'challan_no', '4388', 'receipt_date', '2026-08-24', 'lines', jsonb_build_array(
    jsonb_build_object('id', 'a4000000-0000-0000-0001-000000000001', 'slip_line_id', 'a3000000-0000-0000-0001-000000000001', 'received_qty', 600),
    jsonb_build_object('id', 'a4000000-0000-0000-0001-000000000002', 'slip_line_id', 'a3000000-0000-0000-0001-000000000002', 'received_qty', 8000))));
select public.record_delivery(jsonb_build_object('id', 'a4000000-0000-0000-0000-000000000002',
  'supplier_id', 'a2000000-0000-0000-0000-000000000004', 'project_id', :'p1', 'slip_id', 'a3000000-0000-0000-0000-000000000004',
  'challan_no', '0712', 'receipt_date', '2026-09-14', 'lines', jsonb_build_array(
    jsonb_build_object('id', 'a4000000-0000-0000-0002-000000000001', 'slip_line_id', 'a3000000-0000-0000-0004-000000000001', 'received_qty', 30))));
select public.record_delivery(jsonb_build_object('id', 'a4000000-0000-0000-0000-000000000003',
  'supplier_id', 'a2000000-0000-0000-0000-000000000001', 'project_id', :'p1', 'slip_id', 'a3000000-0000-0000-0000-000000000002',
  'challan_no', '4512', 'receipt_date', '2026-09-28', 'lines', jsonb_build_array(
    jsonb_build_object('id', 'a4000000-0000-0000-0003-000000000001', 'slip_line_id', 'a3000000-0000-0000-0002-000000000001', 'received_qty', 250),
    jsonb_build_object('id', 'a4000000-0000-0000-0003-000000000002', 'slip_line_id', 'a3000000-0000-0000-0002-000000000002', 'received_qty', 3000))));
select public.record_delivery(jsonb_build_object('id', 'a4000000-0000-0000-0000-000000000004',
  'supplier_id', 'a2000000-0000-0000-0000-000000000002', 'project_id', :'p1', 'slip_id', 'a3000000-0000-0000-0000-000000000003',
  'challan_no', '219', 'receipt_date', '2026-10-06', 'lines', jsonb_build_array(
    jsonb_build_object('id', 'a4000000-0000-0000-0004-000000000001', 'slip_line_id', 'a3000000-0000-0000-0003-000000000001', 'received_qty', 6),
    jsonb_build_object('id', 'a4000000-0000-0000-0004-000000000002', 'slip_line_id', 'a3000000-0000-0000-0003-000000000002', 'received_qty', 4))));

-- P-2 is not the site user's project: the owner records its deliveries.
select set_config('request.jwt.claims', :owner, true);
select public.record_delivery(jsonb_build_object('id', 'a4000000-0000-0000-0000-000000000005',
  'supplier_id', 'a2000000-0000-0000-0000-000000000004', 'project_id', :'p2', 'slip_id', 'a3000000-0000-0000-0000-000000000004',
  'challan_no', '0791', 'receipt_date', '2026-10-12', 'lines', jsonb_build_array(
    jsonb_build_object('id', 'a4000000-0000-0000-0005-000000000001', 'slip_line_id', 'a3000000-0000-0000-0004-000000000002', 'received_qty', 8))));
select public.record_delivery(jsonb_build_object('id', 'a4000000-0000-0000-0000-000000000006',
  'supplier_id', 'a2000000-0000-0000-0000-000000000001', 'project_id', :'p2', 'slip_id', 'a3000000-0000-0000-0000-000000000002',
  'challan_no', '4601', 'receipt_date', '2026-10-15', 'lines', jsonb_build_array(
    jsonb_build_object('id', 'a4000000-0000-0000-0006-000000000001', 'slip_line_id', 'a3000000-0000-0000-0002-000000000003', 'received_qty', 150))));

-- Bills and payments, by accounts. VAT is 13% where the supplier charges it.
select set_config('request.jwt.claims', :acct, true);
-- Bhadra cement and rod: 600 × 850 + 8,000 kg × 110 = 13,90,000 + VAT 1,80,700; paid in full.
select public.save_bill_draft(jsonb_build_object('id', 'a5000000-0000-0000-0000-000000000001',
  'supplier_id', 'a2000000-0000-0000-0000-000000000001', 'bill_no', '2207', 'bill_date', '2026-08-25', 'vat_paisa', 18070000,
  'lines', jsonb_build_array(
    jsonb_build_object('project_id', :'p1', 'material_id', :'cement', 'qty', 600, 'unit_id', :'bag', 'rate_paisa', 85000,
      'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', 'a4000000-0000-0000-0001-000000000001', 'billed_qty', 600))),
    jsonb_build_object('project_id', :'p1', 'material_id', :'rod', 'qty', 8000, 'unit_id', :'kg', 'rate_paisa', 11000,
      'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', 'a4000000-0000-0000-0001-000000000002', 'billed_qty', 8000))))));
select public.post_bill(gen_random_uuid(), 'a5000000-0000-0000-0000-000000000001');
select public.record_payment(gen_random_uuid(), jsonb_build_object('id', 'a6000000-0000-0000-0000-000000000001',
  'supplier_id', 'a2000000-0000-0000-0000-000000000001', 'payment_date', '2026-09-20', 'amount_paisa', 157070000,
  'method', 'bank_transfer', 'reference', 'Global IME 118402',
  'allocations', jsonb_build_array(jsonb_build_object('project_id', :'p1', 'amount_paisa', 157070000)),
  'settlements', jsonb_build_array(jsonb_build_object('bill_id', 'a5000000-0000-0000-0000-000000000001', 'project_id', :'p1', 'amount_paisa', 157070000))));

-- Bricks for P-1: 30 thousand × 16,500 = 4,95,000; paid by cheque.
select public.save_bill_draft(jsonb_build_object('id', 'a5000000-0000-0000-0000-000000000002',
  'supplier_id', 'a2000000-0000-0000-0000-000000000004', 'bill_no', '318', 'bill_date', '2026-09-15',
  'lines', jsonb_build_array(
    jsonb_build_object('project_id', :'p1', 'material_id', :'brick', 'qty', 30, 'unit_id', :'thousand', 'rate_paisa', 1650000,
      'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', 'a4000000-0000-0000-0002-000000000001', 'billed_qty', 30))))));
select public.post_bill(gen_random_uuid(), 'a5000000-0000-0000-0000-000000000002');
select public.record_payment(gen_random_uuid(), jsonb_build_object('id', 'a6000000-0000-0000-0000-000000000002',
  'supplier_id', 'a2000000-0000-0000-0000-000000000004', 'payment_date', '2026-10-01', 'amount_paisa', 49500000,
  'method', 'cheque', 'reference', 'Cheque 004417',
  'allocations', jsonb_build_array(jsonb_build_object('project_id', :'p1', 'amount_paisa', 49500000)),
  'settlements', jsonb_build_array(jsonb_build_object('bill_id', 'a5000000-0000-0000-0000-000000000002', 'project_id', :'p1', 'amount_paisa', 49500000))));

-- Ashoj cement and rod for P-1: 250 × 850 + 3,000 kg × 112 = 5,48,500 + VAT 71,305; 4 lakh paid, the rest is baki.
select public.save_bill_draft(jsonb_build_object('id', 'a5000000-0000-0000-0000-000000000003',
  'supplier_id', 'a2000000-0000-0000-0000-000000000001', 'bill_no', '2264', 'bill_date', '2026-09-29', 'vat_paisa', 7130500,
  'lines', jsonb_build_array(
    jsonb_build_object('project_id', :'p1', 'material_id', :'cement', 'qty', 250, 'unit_id', :'bag', 'rate_paisa', 85000,
      'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', 'a4000000-0000-0000-0003-000000000001', 'billed_qty', 250))),
    jsonb_build_object('project_id', :'p1', 'material_id', :'rod', 'qty', 3000, 'unit_id', :'kg', 'rate_paisa', 11200,
      'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', 'a4000000-0000-0000-0003-000000000002', 'billed_qty', 3000))))));
select public.post_bill(gen_random_uuid(), 'a5000000-0000-0000-0000-000000000003');
select public.record_payment(gen_random_uuid(), jsonb_build_object('id', 'a6000000-0000-0000-0000-000000000003',
  'supplier_id', 'a2000000-0000-0000-0000-000000000001', 'payment_date', '2026-10-10', 'amount_paisa', 40000000,
  'method', 'bank_transfer', 'reference', 'Global IME 120977',
  'allocations', jsonb_build_array(jsonb_build_object('project_id', :'p1', 'amount_paisa', 40000000)),
  'settlements', jsonb_build_array(jsonb_build_object('bill_id', 'a5000000-0000-0000-0000-000000000003', 'project_id', :'p1', 'amount_paisa', 40000000))));

-- Sand and gitti: 6 × 9,500 + 4 × 11,000 = 1,01,000; 60,000 paid by eSewa.
select public.save_bill_draft(jsonb_build_object('id', 'a5000000-0000-0000-0000-000000000004',
  'supplier_id', 'a2000000-0000-0000-0000-000000000002', 'bill_no', '57', 'bill_date', '2026-10-07',
  'lines', jsonb_build_array(
    jsonb_build_object('project_id', :'p1', 'material_id', :'sand', 'qty', 6, 'unit_id', :'trip', 'unit_note', 'Tipper, 200 cft', 'rate_paisa', 950000,
      'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', 'a4000000-0000-0000-0004-000000000001', 'billed_qty', 6))),
    jsonb_build_object('project_id', :'p1', 'material_id', :'aggregate', 'qty', 4, 'unit_id', :'trip', 'unit_note', 'Tipper, 200 cft', 'rate_paisa', 1100000,
      'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', 'a4000000-0000-0000-0004-000000000002', 'billed_qty', 4))))));
select public.post_bill(gen_random_uuid(), 'a5000000-0000-0000-0000-000000000004');
select public.record_payment(gen_random_uuid(), jsonb_build_object('id', 'a6000000-0000-0000-0000-000000000004',
  'supplier_id', 'a2000000-0000-0000-0000-000000000002', 'payment_date', '2026-10-12', 'amount_paisa', 6000000,
  'method', 'wallet', 'reference', 'eSewa 7Q4K2P',
  'allocations', jsonb_build_array(jsonb_build_object('project_id', :'p1', 'amount_paisa', 6000000)),
  'settlements', jsonb_build_array(jsonb_build_object('bill_id', 'a5000000-0000-0000-0000-000000000004', 'project_id', :'p1', 'amount_paisa', 6000000))));

-- P-2 bricks (8 thousand) and cement (150 bags PPC): billed, not yet paid.
select public.save_bill_draft(jsonb_build_object('id', 'a5000000-0000-0000-0000-000000000005',
  'supplier_id', 'a2000000-0000-0000-0000-000000000004', 'bill_no', '341', 'bill_date', '2026-10-13',
  'lines', jsonb_build_array(
    jsonb_build_object('project_id', :'p2', 'material_id', :'brick', 'qty', 8, 'unit_id', :'thousand', 'rate_paisa', 1650000,
      'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', 'a4000000-0000-0000-0005-000000000001', 'billed_qty', 8))))));
select public.post_bill(gen_random_uuid(), 'a5000000-0000-0000-0000-000000000005');
select public.save_bill_draft(jsonb_build_object('id', 'a5000000-0000-0000-0000-000000000006',
  'supplier_id', 'a2000000-0000-0000-0000-000000000001', 'bill_no', '2291', 'bill_date', '2026-10-16', 'vat_paisa', 1599000,
  'lines', jsonb_build_array(
    jsonb_build_object('project_id', :'p2', 'material_id', :'cement', 'qty', 150, 'unit_id', :'bag', 'rate_paisa', 82000,
      'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', 'a4000000-0000-0000-0006-000000000001', 'billed_qty', 150))))));
select public.post_bill(gen_random_uuid(), 'a5000000-0000-0000-0000-000000000006');

-- Own labour (jyala) on P-1 for the last week, and on P-2; some paid in cash on the day.
select set_config('request.jwt.claims', :owner, true);
select public.save_labour_cost(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'project_id', :'p1',
  'work_date', d::date, 'work_type', 'Mason and helpers', 'amount_paisa', 1850000,
  'pay_now', case when d < '2026-10-20' then jsonb_build_object('method', 'cash') end))
from generate_series('2026-10-12'::date, '2026-10-23'::date, interval '1 day') d where extract(dow from d) <> 6;
select public.save_labour_cost(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'project_id', :'p2',
  'work_date', d::date, 'work_type', 'Mason and helpers', 'amount_paisa', 1200000,
  'pay_now', case when d < '2026-10-18' then jsonb_build_object('method', 'cash') end))
from generate_series('2026-10-14'::date, '2026-10-23'::date, interval '1 day') d where extract(dow from d) <> 6;

-- Other expenses: JCB for the P-1 foundation, a tractor for P-2.
select public.save_expense(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'project_id', :'p1',
  'heading_id', (select id from public.cost_headings where company_id = :'co' and name = 'Equipment / Machinery Hire'),
  'expense_date', '2026-09-05', 'amount_paisa', 3600000, 'description', 'JCB 9 hours, foundation digging',
  'payee', jsonb_build_object('name', 'Bhim JCB Sewa', 'kind', 'JCB owner'), 'pay_now', jsonb_build_object('method', 'cash')));
select public.save_expense(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'project_id', :'p2',
  'heading_id', (select id from public.cost_headings where company_id = :'co' and name = 'Transport and Delivery'),
  'expense_date', '2026-10-09', 'amount_paisa', 650000, 'description', 'Tractor, site clearing',
  'payee', jsonb_build_object('name', 'Ram Tractor', 'kind', 'Transporter')));

-- Work done so far.
select public.add_progress_update(jsonb_build_object('id', gen_random_uuid(), 'project_id', :'p1', 'effective_date', '2026-10-20', 'pct', 35));
select public.add_progress_update(jsonb_build_object('id', gen_random_uuid(), 'project_id', :'p2', 'effective_date', '2026-10-20', 'pct', 15));

-- A slip waiting for the owner's approval: fittings for P-2.
select public.save_slip_draft(jsonb_build_object('id', 'a3000000-0000-0000-0000-000000000005',
  'supplier_id', 'a2000000-0000-0000-0000-000000000003', 'request_date', '2026-10-22', 'required_date', '2026-10-27',
  'lines', jsonb_build_array(
    jsonb_build_object('project_id', :'p2', 'material_id', :'plumbing', 'spec', 'CPVC pipe 3/4 inch', 'qty', 40,
      'unit_id', :'piece', 'est_rate_paisa', 65000))));
select public.submit_slip('a3000000-0000-0000-0000-000000000005');

commit;
\echo 'Himali Nirman Sewa is ready: sign in as 9800000091 / password123.'
