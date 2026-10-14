-- Local demo data, loaded by `supabase db reset` (never runs on the hosted project).
-- Every account's password is: password123
--
--   Login (mobile)  Name                Role                         Sees
--   9800000001      Ram Owner           Owner / Admin                everything
--   9800000002      Sita Engineer       Project Manager (+ money)    P-1, P-2
--   9800000003      Hari Supervisor     Site Staff                   P-1, no amounts
--   9800000004      Gita Accounts       Accounts                     all projects and amounts
--   9800000005      Bikash Viewer       Viewer                       P-2, no amounts

-- Auth users. Phone logins are stored as internal emails (docs/technical-design.md §8).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated',
  '97798000000' || u.n || '@phone.nirmankhata.invalid',
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}',
  jsonb_build_object('full_name', u.full_name, 'phone', '+97798000000' || u.n),
  now(), now(), '', '', '', ''
from (values
  ('10000000-0000-0000-0000-000000000001', '01', 'Ram Owner'),
  ('10000000-0000-0000-0000-000000000002', '02', 'Sita Engineer'),
  ('10000000-0000-0000-0000-000000000003', '03', 'Hari Supervisor'),
  ('10000000-0000-0000-0000-000000000004', '04', 'Gita Accounts'),
  ('10000000-0000-0000-0000-000000000005', '05', 'Bikash Viewer')
) as u (id, n, full_name);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u
where u.email like '97798000000%@phone.nirmankhata.invalid';

-- Local only: anyone may register (the hosted project requires an allow-list entry),
-- and the demo owner is a platform admin, so /platform can be tried.
update private.settings set registration_approval = false;
insert into private.platform_admins (user_id) values ('10000000-0000-0000-0000-000000000001');

-- Company, created as the owner so the normal setup (admin membership, default catalog) runs.
select set_config('request.jwt.claims', '{"sub": "10000000-0000-0000-0000-000000000001", "role": "authenticated"}', false);
select public.create_company('Demo Nirman Sewa', 'Ram Owner', '+9779800000001');

insert into public.memberships (company_id, user_id, roles, can_view_finance, can_record_payments, can_approve_slips)
select c.id, m.user_id::uuid, m.roles::public.app_role[], m.finance, m.payments, m.approve
from public.companies c,
(values
  ('10000000-0000-0000-0000-000000000002', '{project_manager}', true, false, true),
  ('10000000-0000-0000-0000-000000000003', '{site_staff}', false, false, false),
  ('10000000-0000-0000-0000-000000000004', '{accounts}', true, true, false),
  ('10000000-0000-0000-0000-000000000005', '{viewer}', false, false, false)
) as m (user_id, roles, finance, payments, approve)
where c.name = 'Demo Nirman Sewa';

-- Two projects: contract 50 lakh / budget 40 lakh, and contract 25 lakh with budget = contract.
select public.create_project(
  (select id from public.companies where name = 'Demo Nirman Sewa'),
  'P-1', 'Ward 5 school building', 500000000, 400000000, '2025-07-17',
  '{"client_name": "Pokhara Metropolitan City", "district": "Kaski", "municipality": "Pokhara", "ward": "5",
    "manager_id": "10000000-0000-0000-0000-000000000002", "planned_start": "2025-07-17", "planned_end": "2026-07-16",
    "status": "active"}'
);
select public.create_project(
  (select id from public.companies where name = 'Demo Nirman Sewa'),
  'P-2', 'Private house, Lakeside', 250000000, null, '2026-04-14',
  '{"client_name": "Shrestha family", "district": "Kaski", "municipality": "Pokhara", "ward": "6",
    "manager_id": "10000000-0000-0000-0000-000000000002", "planned_start": "2026-04-14", "status": "planned"}'
);

insert into public.project_assignments (company_id, project_id, user_id)
select p.company_id, p.id, a.user_id::uuid
from public.projects p
join (values ('P-1', '10000000-0000-0000-0000-000000000003'), ('P-2', '10000000-0000-0000-0000-000000000005')) as a (code, user_id)
  on a.code = p.code;

-- Milestone 2 demo: suppliers, slips, a delivery, a posted bill and a part payment.
select set_config('request.jwt.claims', '{"sub": "10000000-0000-0000-0000-000000000001", "role": "authenticated"}', false);
insert into public.suppliers (company_id, id, name, contact_person, phone, address, categories, payment_terms)
select c.id, s.id::uuid, s.name, s.contact, s.phone, 'Pokhara', s.cats::text[], s.terms
from public.companies c,
(values
  ('20000000-0000-0000-0000-000000000001', 'Shrestha Cement & Rod Suppliers', 'Bishnu Shrestha', '9856000001', '{Cement,Rod}', '30 days credit'),
  ('20000000-0000-0000-0000-000000000002', 'Gandaki Baluwa Dhunga', 'Krishna Gurung', '9856000002', '{Sand,Stone,Aggregate}', null),
  ('20000000-0000-0000-0000-000000000003', 'Lakeside Hardware & Electricals', 'Anita Thapa', '9856000003', '{Hardware,Electrical}', null)
) as s (id, name, contact, phone, cats, terms)
where c.name = 'Demo Nirman Sewa';

-- OS-0001: cement for both projects, approved and shared; 60 of 100 bags reached P-1.
select public.save_slip_draft(jsonb_build_object(
  'id', '30000000-0000-0000-0000-000000000001', 'supplier_id', '20000000-0000-0000-0000-000000000001',
  'request_date', '2026-09-20', 'site_contact', '9800000003',
  'lines', jsonb_build_array(
    jsonb_build_object('id', '30000000-0000-0000-0001-000000000001', 'project_id', (select id from public.projects where code = 'P-1'),
      'material_id', (select id from public.materials where name = 'Cement'), 'spec', 'OPC 43', 'qty', 100,
      'unit_id', (select id from public.units where code = 'bag'), 'est_rate_paisa', 85000),
    jsonb_build_object('id', '30000000-0000-0000-0001-000000000002', 'project_id', (select id from public.projects where code = 'P-1'),
      'material_id', (select id from public.materials where name = 'Rod (TMT rebar)'), 'spec', '12 mm', 'qty', 500,
      'unit_id', (select id from public.units where code = 'kg'), 'est_rate_paisa', 11000),
    jsonb_build_object('id', '30000000-0000-0000-0001-000000000003', 'project_id', (select id from public.projects where code = 'P-2'),
      'material_id', (select id from public.materials where name = 'Cement'), 'spec', 'OPC 43', 'qty', 40,
      'unit_id', (select id from public.units where code = 'bag'), 'est_rate_paisa', 85000))));
select public.submit_slip('30000000-0000-0000-0000-000000000001');
select public.decide_slip('30000000-0000-0000-0000-000000000001', true);
select public.mark_slip_sent('30000000-0000-0000-0000-000000000001', 'share');

-- Hari (site, P-1) records the delivery.
select set_config('request.jwt.claims', '{"sub": "10000000-0000-0000-0000-000000000003", "role": "authenticated"}', false);
select public.record_delivery(jsonb_build_object(
  'id', '40000000-0000-0000-0000-000000000001', 'supplier_id', '20000000-0000-0000-0000-000000000001',
  'project_id', (select id from public.projects where code = 'P-1'), 'slip_id', '30000000-0000-0000-0000-000000000001',
  'challan_no', '2231', 'receipt_date', '2026-09-24',
  'lines', jsonb_build_array(jsonb_build_object('id', '40000000-0000-0000-0001-000000000001',
    'slip_line_id', '30000000-0000-0000-0001-000000000001', 'received_qty', 60))));
-- ... and asks for sand (waits for Sita's approval).
select public.save_slip_draft(jsonb_build_object(
  'id', '30000000-0000-0000-0000-000000000002', 'supplier_id', '20000000-0000-0000-0000-000000000002',
  'request_date', '2026-10-08', 'required_date', '2026-10-12',
  'lines', jsonb_build_array(jsonb_build_object('project_id', (select id from public.projects where code = 'P-1'),
    'material_id', (select id from public.materials where name = 'Sand'), 'qty', 2,
    'unit_id', (select id from public.units where code = 'trip'), 'unit_note', 'Tipper, 200 cft'))));
select public.submit_slip('30000000-0000-0000-0000-000000000002');

-- Gita (accounts) posts the cement bill (60 bags at Rs 850 + Rs 1,500 transport + 13% VAT)
-- and pays Rs 40,000 against it.
select set_config('request.jwt.claims', '{"sub": "10000000-0000-0000-0000-000000000004", "role": "authenticated"}', false);
select public.save_bill_draft(jsonb_build_object(
  'id', '50000000-0000-0000-0000-000000000001', 'supplier_id', '20000000-0000-0000-0000-000000000001',
  'bill_no', '1187', 'bill_date', '2026-09-25', 'transport_paisa', 150000, 'vat_paisa', 682500,
  'lines', jsonb_build_array(jsonb_build_object('project_id', (select id from public.projects where code = 'P-1'),
    'material_id', (select id from public.materials where name = 'Cement'), 'qty', 60,
    'unit_id', (select id from public.units where code = 'bag'), 'rate_paisa', 85000,
    'matches', jsonb_build_array(jsonb_build_object('delivery_line_id', '40000000-0000-0000-0001-000000000001', 'billed_qty', 60))))));
select public.post_bill('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001');
select public.record_payment('60000000-0000-0000-0000-000000000002', jsonb_build_object(
  'id', '70000000-0000-0000-0000-000000000001', 'supplier_id', '20000000-0000-0000-0000-000000000001',
  'payment_date', '2026-10-01', 'amount_paisa', 4000000, 'method', 'bank_transfer', 'reference', 'NIC Asia 004512',
  'allocations', jsonb_build_array(jsonb_build_object('project_id', (select id from public.projects where code = 'P-1'), 'amount_paisa', 4000000)),
  'settlements', jsonb_build_array(jsonb_build_object('bill_id', '50000000-0000-0000-0000-000000000001',
    'project_id', (select id from public.projects where code = 'P-1'), 'amount_paisa', 4000000))));

select set_config('request.jwt.claims', '', false);
